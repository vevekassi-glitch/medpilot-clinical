export const PLANS = {
  starter: {
    key: "starter",
    name: "Starter",
    description: "Pour les praticiens qui structurent leurs premiers cas.",
    amount: 4900,
    currency: "eur",
    interval: "month" as const,
    features: ["50 analyses / mois", "6 agents spécialisés", "Export PDF", "Journal d’audit"],
    envPrice: "STRIPE_PRICE_STARTER",
  },
  clinic: {
    key: "clinic",
    name: "Clinic",
    description: "Pour une équipe clinique qui veut industrialiser la revue.",
    amount: 14900,
    currency: "eur",
    interval: "month" as const,
    features: ["Analyses illimitées", "Jusqu’à 10 utilisateurs", "Protocoles personnalisés", "Support prioritaire"],
    envPrice: "STRIPE_PRICE_CLINIC",
  },
  enterprise: {
    key: "enterprise",
    name: "Enterprise",
    description: "Pour les réseaux de soins et environnements réglementés.",
    amount: 39900,
    currency: "eur",
    interval: "month" as const,
    features: ["Utilisateurs illimités", "SSO et RBAC avancés", "SLA et gouvernance", "Onboarding conformité"],
    envPrice: "STRIPE_PRICE_ENTERPRISE",
  },
} as const;

export type PlanKey = keyof typeof PLANS;

export function getPlan(plan: string) {
  if (!(plan in PLANS)) throw new Error("Unknown plan");
  return PLANS[plan as PlanKey];
}
