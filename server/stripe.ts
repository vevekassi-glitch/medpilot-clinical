import type { Express, Request, Response } from "express";
import Stripe from "stripe";
import { findUserByStripeCustomerId, getUserById, saveStripeIdentifiers } from "./db";
import { getPlan, PLANS, type PlanKey } from "./products";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe n’est pas configuré. Ajoutez STRIPE_SECRET_KEY dans le fichier .env local.");
  return new Stripe(key);
}

export function getPublicPlans() {
  const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);
  return Object.values(PLANS).map(({ envPrice, ...plan }) => ({ ...plan, configured: stripeConfigured && Boolean(process.env[envPrice]) }));
}

function getOrigin(req: Request) {
  return req.headers.origin || `${req.protocol}://${req.get("host") || "localhost:3000"}`;
}

export async function createCheckoutSession(input: { userId: number; plan: PlanKey; req: Request }) {
  const stripe = getStripe();
  const user = await getUserById(input.userId);
  if (!user) throw new Error("User not found");
  const plan = getPlan(input.plan);
  const priceId = process.env[plan.envPrice];
  const origin = getOrigin(input.req);
  const lineItem = priceId
    ? { price: priceId, quantity: 1 }
    : {
        price_data: {
          currency: plan.currency,
          unit_amount: plan.amount,
          recurring: { interval: plan.interval },
          product_data: { name: `MedPilot Clinical ${plan.name}`, description: plan.description },
        },
        quantity: 1,
      };
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [lineItem],
      // Explicitly select card payments so Stripe can create the EUR subscription
      // Checkout Session even when automatic payment methods are not enabled.
      payment_method_types: ["card"],
      success_url: `${origin}/billing/success?plan=${plan.key}`,
      cancel_url: `${origin}/?billing=cancelled`,
      customer: user.stripeCustomerId || undefined,
      customer_email: user.stripeCustomerId ? undefined : user.email || undefined,
      client_reference_id: String(user.id),
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      metadata: {
        user_id: String(user.id),
        customer_email: user.email || "",
        customer_name: user.name || "",
        plan: plan.key,
      },
      subscription_data: { metadata: { user_id: String(user.id), plan: plan.key } },
    });
    return { url: session.url };
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError && error.message.toLowerCase().includes("payment method")) {
      throw new Error("Le paiement par carte n’est pas activé dans Stripe. Activez Cartes dans Stripe → Paramètres → Moyens de paiement, puis réessayez.");
    }
    throw error;
  }
}

export async function createCustomerPortalSession(input: { userId: number; req: Request }) {
  const stripe = getStripe();
  const user = await getUserById(input.userId);
  if (!user?.stripeCustomerId) throw new Error("No Stripe customer found for this account");
  const session = await stripe.billingPortal.sessions.create({ customer: user.stripeCustomerId, return_url: getOrigin(input.req) });
  return { url: session.url };
}

async function processStripeEvent(event: Stripe.Event) {
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = Number(session.metadata?.user_id || session.client_reference_id);
    if (Number.isFinite(userId) && userId > 0) {
      await saveStripeIdentifiers(userId, {
        customerId: typeof session.customer === "string" ? session.customer : undefined,
        subscriptionId: typeof session.subscription === "string" ? session.subscription : undefined,
      });
    }
  }
  if (["customer.subscription.created", "customer.subscription.updated"].includes(event.type)) {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
    const user = await findUserByStripeCustomerId(customerId);
    const metadataUserId = Number(subscription.metadata?.user_id);
    if (user) await saveStripeIdentifiers(user.id, { subscriptionId: subscription.id });
    else if (Number.isFinite(metadataUserId) && metadataUserId > 0) await saveStripeIdentifiers(metadataUserId, { customerId: customerId, subscriptionId: subscription.id });
  }
  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
    const user = await findUserByStripeCustomerId(customerId);
    if (user) await saveStripeIdentifiers(user.id, { subscriptionId: null });
  }
}

export function registerStripeWebhook(app: Express) {
  app.post("/api/stripe/webhook", async (req: Request, res: Response) => {
    const signature = req.headers["stripe-signature"];
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret || typeof signature !== "string") return res.status(400).json({ error: "Stripe webhook is not configured" });
    try {
      const event = getStripe().webhooks.constructEvent(req.body, signature, secret);
      if (event.id.startsWith("evt_test_")) {
        console.log("[Webhook] Test event detected, returning verification response");
        return res.json({ verified: true });
      }
      await processStripeEvent(event);
      return res.json({ received: true });
    } catch (error) {
      console.error("[Stripe webhook] signature or processing failure", error);
      return res.status(400).json({ error: "Invalid webhook" });
    }
  });
}
