import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleHelp,
  FileText,
  LockKeyhole,
  Menu,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const plans = [
  {
    key: "starter" as const,
    name: "Starter",
    price: "49",
    caption: "Pour commencer à structurer",
    features: [
      "50 analyses / mois",
      "6 agents spécialisés",
      "Export PDF",
      "Journal d’audit",
    ],
  },
  {
    key: "clinic" as const,
    name: "Clinic",
    price: "149",
    caption: "Pour les équipes en activité",
    features: [
      "Analyses illimitées",
      "Jusqu’à 10 utilisateurs",
      "Protocoles personnalisés",
      "Support prioritaire",
    ],
    popular: true,
  },
  {
    key: "enterprise" as const,
    name: "Enterprise",
    price: "399",
    caption: "Pour les réseaux de soins",
    features: [
      "Utilisateurs illimités",
      "SSO et RBAC avancés",
      "SLA et gouvernance",
      "Onboarding conformité",
    ],
  },
];

export default function Landing() {
  const [mobileMenu, setMobileMenu] = useState(false);
  const [activeSection, setActiveSection] = useState("product");
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authForm, setAuthForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "patient" as "patient" | "client",
  });
  const [paymentPlan, setPaymentPlan] = useState<(typeof plans)[number] | null>(
    null
  );
  const [pendingPlan, setPendingPlan] = useState<(typeof plans)[number] | null>(
    null
  );
  const [paymentMethod, setPaymentMethod] = useState<
    "card" | "visa" | "wave" | "orange_money" | "moov_money"
  >("card");
  const [paymentReference, setPaymentReference] = useState("");
  const { isAuthenticated } = useAuth();
  const checkout = trpc.billing.createCheckout.useMutation();
  const publicPlans = trpc.billing.plans.useQuery();
  const portal = trpc.billing.createPortal.useMutation();
  const login = trpc.auth.login.useMutation();
  const register = trpc.auth.register.useMutation();
  const demoSubscription = trpc.billing.createDemoSubscription.useMutation({
    onSuccess: data => {
      window.location.assign(`/billing/success?plan=${data.plan}&demo=1`);
    },
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    const sections = ["product", "agents", "security", "pricing"]
      .map(id => document.getElementById(id))
      .filter(Boolean) as HTMLElement[];
    const observer = new IntersectionObserver(
      entries => {
        const visible = entries
          .filter(entry => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target.id) setActiveSection(visible.target.id);
      },
      { rootMargin: "-20% 0px -55% 0px", threshold: [0.1, 0.35, 0.7] }
    );
    sections.forEach(section => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  const handlePlan = (plan: (typeof plans)[number]["key"]) => {
    if (!isAuthenticated) {
      toast.info("Connectez-vous pour démarrer votre abonnement sécurisé.");
      setPendingPlan(plans.find(item => item.key === plan) || null);
      openAuth("login");
      return;
    }
    setPaymentPlan(plans.find(item => item.key === plan) || null);
    setPaymentReference("");
  };

  const submitDemoPayment = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!paymentPlan) return;
    demoSubscription.mutate({
      plan: paymentPlan.key,
      method: paymentMethod,
      reference: paymentReference,
    });
  };

  const openBillingPortal = () => {
    if (!isAuthenticated) {
      openAuth("login");
      return;
    }
    portal.mutate(undefined, {
      onSuccess: data => data.url && window.open(data.url, "_blank"),
      onError: error =>
        toast.error(error.message || "Portail de facturation indisponible."),
    });
  };

  const openAuth = (mode: "login" | "register") => {
    setAuthMode(mode);
    setAuthOpen(true);
  };

  const startLogin = () => openAuth("login");

  const submitAuth = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (authMode === "register") {
      register.mutate(authForm, {
        onSuccess: () => { setAuthOpen(false); if (pendingPlan) { setPaymentPlan(pendingPlan); setPendingPlan(null); } else window.location.assign("/app"); },
      });
    } else {
      login.mutate(
        { email: authForm.email, password: authForm.password },
        { onSuccess: () => { setAuthOpen(false); if (pendingPlan) { setPaymentPlan(pendingPlan); setPendingPlan(null); } else window.location.assign("/app"); } }
      );
    }
  };

  const authError = login.error?.message || register.error?.message;
  const authPending = login.isPending || register.isPending;

  return (
    <div className="landing-page min-h-screen bg-[#f8fbf9] text-[#153847]">
      <header className="landing-nav landing-nav-sticky">
        <a href="/" className="flex items-center gap-3">
          <span className="brand-mark">
            <Stethoscope size={18} />
          </span>
          <span>
            <span className="font-display block text-[17px] font-bold tracking-[-.045em]">
              MedPilot
            </span>
            <span className="block text-[9px] font-bold uppercase tracking-[.2em] text-[#7b9a91]">
              Clinical OS
            </span>
          </span>
        </a>
        <nav className="hidden items-center gap-7 text-[12px] font-semibold text-[#66827f] md:flex">
          <a
            href="#product"
            className={cn(
              "landing-nav-link",
              activeSection === "product" && "landing-nav-link-active"
            )}
          >
            Produit
          </a>
          <a
            href="#agents"
            className={cn(
              "landing-nav-link",
              activeSection === "agents" && "landing-nav-link-active"
            )}
          >
            Agents IA
          </a>
          <a
            href="#security"
            className={cn(
              "landing-nav-link",
              activeSection === "security" && "landing-nav-link-active"
            )}
          >
            Sécurité
          </a>
          <a
            href="#pricing"
            className={cn(
              "landing-nav-link",
              activeSection === "pricing" && "landing-nav-link-active"
            )}
          >
            Tarifs
          </a>
        </nav>
        <div className="ml-auto hidden items-center gap-2 md:flex">
          <Button
            variant="ghost"
            onClick={() => openAuth("login")}
            className="rounded-xl px-3 py-2 text-[12px] font-bold text-[#5f7c79] hover:bg-white"
          >
            Connexion / Inscription
          </Button>
          <Button
            onClick={() =>
              isAuthenticated
                ? window.location.assign("/app")
                : openAuth("register")
            }
            className="h-9 rounded-xl bg-[#163b4d] px-4 text-[11px] font-bold text-white hover:bg-[#24566b]"
          >
            Accéder au cockpit <ArrowUpRight size={14} className="ml-2" />
          </Button>
        </div>
        <button
          className="icon-button md:hidden"
          onClick={() => setMobileMenu(value => !value)}
          aria-label="Menu"
        >
          {mobileMenu ? <X size={18} /> : <Menu size={18} />}
        </button>
      </header>
      {mobileMenu && (
        <div className="landing-mobile-menu">
          <a href="#product" onClick={() => setMobileMenu(false)}>
            Produit
          </a>
          <a href="#agents" onClick={() => setMobileMenu(false)}>
            Agents IA
          </a>
          <a href="#security" onClick={() => setMobileMenu(false)}>
            Sécurité
          </a>
          <a href="#pricing" onClick={() => setMobileMenu(false)}>
            Tarifs
          </a>
          <button
            onClick={() => {
              setMobileMenu(false);
              openAuth("login");
            }}
          >
            Connexion / Inscription
          </button>
        </div>
      )}

      {authOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#153847]/35 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-title"
        >
          <form
            onSubmit={submitAuth}
            className="w-full max-w-md rounded-2xl border border-[#dce9e2] bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="landing-kicker">Accès sécurisé</div>
                <h2
                  id="auth-title"
                  className="mt-2 font-display text-2xl font-bold text-[#153847]"
                >
                  {authMode === "login" ? "Connexion" : "Créer votre compte"}
                </h2>
                <p className="mt-2 text-xs leading-5 text-[#718987]">
                  {authMode === "login"
                    ? "Retrouvez votre espace MedPilot."
                    : "Choisissez votre profil pour commencer."}
                </p>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setAuthOpen(false)}
                aria-label="Fermer"
              >
                <X size={16} />
              </button>
            </div>
            {authMode === "register" && (
              <>
                <label className="mt-5 block text-xs font-bold text-[#526d70]">
                  Nom complet
                  <input
                    required
                    minLength={2}
                    value={authForm.name}
                    onChange={event =>
                      setAuthForm(current => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-[#dfeae5] px-3 py-2.5 text-sm font-normal outline-none focus:border-[#78ad95]"
                  />
                </label>
                <label className="mt-3 block text-xs font-bold text-[#526d70]">
                  Profil
                  <select
                    value={authForm.role}
                    onChange={event =>
                      setAuthForm(current => ({
                        ...current,
                        role: event.target.value as "patient" | "client",
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-[#dfeae5] bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-[#78ad95]"
                  >
                    <option value="patient">Patient</option>
                    <option value="client">Client / établissement</option>
                  </select>
                </label>
              </>
            )}
            <label className="mt-3 block text-xs font-bold text-[#526d70]">
              E-mail
              <input
                required
                type="email"
                value={authForm.email}
                onChange={event =>
                  setAuthForm(current => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
                className="mt-1 w-full rounded-lg border border-[#dfeae5] px-3 py-2.5 text-sm font-normal outline-none focus:border-[#78ad95]"
              />
            </label>
            <label className="mt-3 block text-xs font-bold text-[#526d70]">
              Mot de passe
              <input
                required
                type="password"
                minLength={8}
                value={authForm.password}
                onChange={event =>
                  setAuthForm(current => ({
                    ...current,
                    password: event.target.value,
                  }))
                }
                className="mt-1 w-full rounded-lg border border-[#dfeae5] px-3 py-2.5 text-sm font-normal outline-none focus:border-[#78ad95]"
              />
            </label>
            {authError && (
              <p className="mt-3 rounded-lg bg-[#fff1ef] px-3 py-2 text-xs font-semibold text-[#b9483e]">
                {authError}
              </p>
            )}
            <Button
              type="submit"
              disabled={authPending}
              className="mt-5 h-10 w-full rounded-xl bg-[#163b4d] text-xs font-bold text-white hover:bg-[#24566b]"
            >
              {authPending
                ? "Veuillez patienter…"
                : authMode === "login"
                  ? "Se connecter"
                  : "Créer mon compte"}
            </Button>
            <button
              type="button"
              className="mt-4 w-full text-center text-xs font-bold text-[#4d8c70]"
              onClick={() =>
                setAuthMode(mode => (mode === "login" ? "register" : "login"))
              }
            >
              {authMode === "login"
                ? "Créer un compte patient ou client"
                : "J’ai déjà un compte"}
            </button>
          </form>
        </div>
      )}
      {paymentPlan && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#153847]/35 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="payment-title"
        >
          <form
            onSubmit={submitDemoPayment}
            className="w-full max-w-md rounded-2xl border border-[#dce9e2] bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="landing-kicker">Paiement de démonstration</div>
                <h2
                  id="payment-title"
                  className="mt-2 font-display text-2xl font-bold text-[#153847]"
                >
                  Offre {paymentPlan.name} · {paymentPlan.price} € / mois
                </h2>
                <p className="mt-2 text-xs leading-5 text-[#718987]">
                  Aucun débit réel. Utilisez une référence fictive pour simuler
                  l’activation.
                </p>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setPaymentPlan(null)}
                aria-label="Fermer"
              >
                <X size={16} />
              </button>
            </div>
            <label className="mt-5 block text-xs font-bold text-[#526d70]">
              Mode de paiement
              <select
                value={paymentMethod}
                onChange={event =>
                  setPaymentMethod(event.target.value as typeof paymentMethod)
                }
                className="mt-1 w-full rounded-lg border border-[#dfeae5] bg-white px-3 py-2.5 text-sm font-normal"
              >
                <option value="card">Carte fictive</option>
                <option value="visa">Visa</option>
                <option value="wave">Wave</option>
                <option value="orange_money">Orange Money</option>
                <option value="moov_money">Moov Money</option>
              </select>
            </label>
            <label className="mt-3 block text-xs font-bold text-[#526d70]">
              {paymentMethod === "card" || paymentMethod === "visa"
                ? "Numéro de carte fictif"
                : "Numéro ou référence fictive"}
              <input
                required
                minLength={4}
                maxLength={32}
                value={paymentReference}
                onChange={event => setPaymentReference(event.target.value)}
                placeholder={
                  paymentMethod === "card" || paymentMethod === "visa"
                    ? "4242 4242 4242 4242"
                    : "Ex. WAVE-DEMO-001"
                }
                className="mt-1 w-full rounded-lg border border-[#dfeae5] px-3 py-2.5 text-sm font-normal outline-none focus:border-[#78ad95]"
              />
            </label>
            <p className="mt-3 rounded-lg bg-[#eaf8f1] px-3 py-2 text-[11px] font-semibold text-[#43876a]">
              Simulation locale uniquement · aucun paiement réel ne sera
              effectué.
            </p>
            <Button
              type="submit"
              disabled={demoSubscription.isPending}
              className="mt-5 h-10 w-full rounded-xl bg-[#163b4d] text-xs font-bold text-white hover:bg-[#24566b]"
            >
              {demoSubscription.isPending
                ? "Activation…"
                : "Valider l’abonnement"}
            </Button>
          </form>
        </div>
      )}

      <main>
        <section className="landing-hero" id="product">
          <div className="hero-blob hero-blob-left" />
          <div className="hero-blob hero-blob-right" />
          <div className="landing-hero-copy">
            <div className="landing-kicker">
              <span className="status-dot" /> Décision clinique assistée ·
              nouvelle génération
            </div>
            <h1>
              Moins de bruit.
              <br />
              <span>Plus de clarté clinique.</span>
            </h1>
            <p>
              MedPilot transforme les informations patient en une synthèse
              structurée, explicable et prête à être revue par votre équipe
              médicale.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() =>
                  isAuthenticated
                    ? window.location.assign("/app")
                    : startLogin()
                }
                className="h-11 rounded-xl bg-[#163b4d] px-5 text-[12px] font-bold text-white shadow-[0_12px_30px_rgba(22,59,77,.18)] hover:bg-[#24566b]"
              >
                Découvrir le cockpit <ArrowRight size={16} className="ml-2" />
              </Button>
              <a
                href="#pricing"
                className="inline-flex h-11 items-center rounded-xl border border-[#d9e9e1] bg-white px-5 text-[12px] font-bold text-[#52716f] hover:border-[#acd1bc]"
              >
                Voir les offres
              </a>
            </div>
            <div className="mt-6 flex items-center gap-4 text-[10px] font-semibold text-[#79918e]">
              <span className="flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-[#6bab87]" /> Supervision
                humaine
              </span>
              <span className="flex items-center gap-1.5">
                <LockKeyhole size={13} className="text-[#6bab87]" /> Données
                dé-identifiées
              </span>
            </div>
          </div>
          <div className="landing-hero-visual">
            <div className="visual-glow" />
            <div className="clinical-card clinical-card-main">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[.15em] text-[#81a39a]">
                    Synthèse clinique
                  </div>
                  <div className="mt-1 text-[13px] font-bold text-[#315466]">
                    Cas MP-2048 · Revue requise
                  </div>
                </div>
                <span className="rounded-full bg-[#fff3dc] px-2 py-1 text-[9px] font-bold text-[#aa761b]">
                  À confirmer
                </span>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-2">
                <div className="mini-field">
                  <span>Motif</span>
                  <strong>Douleur à l’effort</strong>
                </div>
                <div className="mini-field">
                  <span>Agents terminés</span>
                  <strong>04 / 06</strong>
                </div>
              </div>
              <div className="mt-5 space-y-2.5">
                <div className="agent-line">
                  <span className="agent-check">
                    <Check size={12} />
                  </span>
                  <span>Intake & sécurité</span>
                  <em>Terminé</em>
                </div>
                <div className="agent-line agent-line-active">
                  <span className="agent-check">
                    <Sparkles size={12} />
                  </span>
                  <span>Analyse des symptômes</span>
                  <em>En cours</em>
                </div>
                <div className="agent-line">
                  <span className="agent-queue" />
                  <span>Hypothèses différentielles</span>
                  <em>File</em>
                </div>
                <div className="agent-line">
                  <span className="agent-queue" />
                  <span>Examens à considérer</span>
                  <em>File</em>
                </div>
              </div>
              <div className="mt-5 border-t border-[#e9f0ed] pt-4">
                <div className="flex items-center justify-between text-[10px] font-bold text-[#7d9892]">
                  <span>Progression multi-agents</span>
                  <span className="text-[#4e9a72]">67%</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e5f0ea]">
                  <div className="h-full w-2/3 rounded-full bg-[#7fbd99]" />
                </div>
              </div>
            </div>
            <div className="clinical-float clinical-float-top">
              <div className="float-icon bg-[#e5f4eb] text-[#4f9871]">
                <ShieldCheck size={15} />
              </div>
              <div>
                <div className="text-[11px] font-bold text-[#365c62]">
                  Revue humaine obligatoire
                </div>
                <div className="text-[10px] text-[#8aa19e]">
                  100% des synthèses
                </div>
              </div>
            </div>
            <div className="clinical-float clinical-float-bottom">
              <div className="float-icon bg-[#f0edff] text-[#786db5]">
                <Zap size={15} />
              </div>
              <div>
                <div className="text-[11px] font-bold text-[#365c62]">
                  2h 14 gagnées
                </div>
                <div className="text-[10px] text-[#8aa19e]">cette semaine</div>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-proof">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[.2em] text-[#87a19a]">
              Conçu pour les environnements où chaque décision compte
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-x-9 gap-y-3 text-[13px] font-bold text-[#6b8985]">
              <span>SAINT-CLAIR</span>
              <span>CLINIQUE NOVA</span>
              <span>RÉSEAU AURELIA</span>
              <span>◉ medcare</span>
              <span>HÔPITAL VERT</span>
            </div>
          </div>
        </section>

        <section className="landing-section" id="agents">
          <div className="section-heading">
            <div>
              <div className="landing-kicker">
                Un système, plusieurs expertises
              </div>
              <h2>
                Une chaîne de raisonnement
                <br />
                <span>lisible à chaque étape.</span>
              </h2>
            </div>
            <p>
              Chaque agent a un rôle limité. Chaque sortie est structurée,
              traçable et soumise à votre jugement clinique.
            </p>
          </div>
          <div className="feature-grid">
            <Feature
              icon={Stethoscope}
              index="01"
              title="Intake & triage"
              text="Normalisez le contexte, repérez les signaux d’alerte et rendez visibles les informations manquantes."
            />
            <Feature
              icon={Sparkles}
              index="02"
              title="Analyse des symptômes"
              text="Transformez le récit patient en variables cliniques organisées sans effacer l’incertitude."
            />
            <Feature
              icon={FileText}
              index="03"
              title="Synthèse supervisée"
              text="Préparez un brouillon de revue avec hypothèses, examens à considérer et points de sécurité."
            />
          </div>
        </section>

        <section className="landing-section landing-security" id="security">
          <div className="security-panel">
            <div className="security-copy">
              <div className="landing-kicker">
                <LockKeyhole size={14} /> Conçu avec la sécurité comme
                contrainte
              </div>
              <h2>La confiance se construit dans la trace.</h2>
              <p>
                MedPilot n’est pas un prescripteur automatique. Le produit
                sépare les responsabilités, journalise les actions et maintient
                le professionnel dans la boucle.
              </p>
              <div className="security-list">
                <div>
                  <Check size={15} /> Aucune conclusion présentée comme certaine
                </div>
                <div>
                  <Check size={15} /> Aucune prescription autonome
                </div>
                <div>
                  <Check size={15} /> Audit des entrées, sorties et validations
                </div>
              </div>
            </div>
            <div className="security-art">
              <div className="security-orbit security-orbit-one" />
              <div className="security-orbit security-orbit-two" />
              <div className="security-core">
                <ShieldCheck size={38} />
              </div>
              <div className="security-tag security-tag-one">Explainable</div>
              <div className="security-tag security-tag-two">
                Human in the loop
              </div>
            </div>
          </div>
        </section>

        <section className="landing-section" id="pricing">
          <div className="section-heading pricing-heading">
            <div>
              <div className="landing-kicker">
                Des offres simples à faire évoluer
              </div>
              <h2>
                Commencez petit.
                <br />
                <span>Structurez grand.</span>
              </h2>
            </div>
            <p>
              Abonnement mensuel sécurisé par Stripe. Changez d’offre ou gérez
              votre facturation depuis le portail client.
            </p>
          </div>
          <p className="mx-auto mb-5 max-w-2xl rounded-xl border border-[#cfe5d8] bg-[#eef9f2] px-4 py-3 text-center text-[11px] font-semibold text-[#43876a]">
            Paiement de démonstration disponible par carte fictive, Visa, Wave,
            Orange Money ou Moov Money. Aucun débit réel.
          </p>
          <div className="pricing-grid">
            {plans.map(plan => {
              return (
                <div
                  className={cn(
                    "pricing-card",
                    plan.popular && "pricing-card-popular"
                  )}
                  key={plan.key}
                >
                  {plan.popular && (
                    <div className="popular-ribbon">Le plus choisi</div>
                  )}
                  <div className="flex items-start justify-between">
                    <div>
                      <h3>{plan.name}</h3>
                      <p>{plan.caption}</p>
                    </div>
                    <div className="pricing-icon">
                      <Zap size={16} />
                    </div>
                  </div>
                  <div className="mt-7 flex items-end gap-1">
                    <span className="text-[42px] font-bold tracking-[-.06em]">
                      {plan.price}
                    </span>
                    <span className="pb-2 text-[11px] text-[#819692]">
                      € / mois
                    </span>
                  </div>
                  <div className="mt-5 space-y-3 border-t border-[#e8efec] pt-5">
                    {plan.features.map(feature => (
                      <div
                        className="flex items-center gap-2.5 text-[11px] font-semibold text-[#5e7877]"
                        key={feature}
                      >
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#e5f3ea] text-[#4d9a72]">
                          <Check size={10} />
                        </span>
                        {feature}
                      </div>
                    ))}
                  </div>
                  <Button
                    disabled={demoSubscription.isPending}
                    onClick={() => handlePlan(plan.key)}
                    className={cn(
                      "mt-7 h-10 w-full rounded-xl text-[11px] font-bold",
                      plan.popular
                        ? "bg-[#163b4d] text-white hover:bg-[#24566b]"
                        : "border border-[#d8e8e1] bg-white text-[#416a63] hover:bg-[#f3faf6]"
                    )}
                  >
                    {demoSubscription.isPending ? "Activation…" : "Choisir cette offre"}
                    <ArrowUpRight size={14} className="ml-2" />
                  </Button>
                </div>
              );
            })}
          </div>
          <div className="mt-6 flex items-center justify-center gap-2 text-center text-[11px] text-[#819692]">
            <CircleHelp size={14} /> Besoin d’un environnement sur mesure ?{" "}
            <a
              href="mailto:hello@medpilot.example"
              className="font-bold text-[#4e8c70]"
            >
              Parler à notre équipe
            </a>
          </div>
        </section>
      </main>
      <footer className="landing-footer">
        <div className="flex items-center gap-3">
          <span className="brand-mark small">
            <Stethoscope size={15} />
          </span>
          <span className="font-display text-[13px] font-bold">
            MedPilot Clinical
          </span>
        </div>
        <div className="text-[10px] text-[#8aa09e]">
          Décision clinique assistée · version pilote
        </div>
        <div className="flex items-center gap-4 text-[10px] font-semibold text-[#77908d]">
          <a href="#security">Sécurité</a>
          <a href="mailto:hello@medpilot.example">Contact</a>
          <a href="/app">Cockpit</a>
          <button
            onClick={openBillingPortal}
            className="font-semibold hover:text-[#3d8065]"
          >
            Gérer l’abonnement
          </button>
        </div>
      </footer>
    </div>
  );
}

function Feature({
  icon: Icon,
  index,
  title,
  text,
}: {
  icon: React.ElementType;
  index: string;
  title: string;
  text: string;
}) {
  return (
    <div className="feature-card">
      <div className="flex items-start justify-between">
        <div className="feature-icon">
          <Icon size={19} />
        </div>
        <span className="font-mono text-[10px] font-bold text-[#b1c3bd]">
          {index}
        </span>
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      <div className="mt-6 flex items-center gap-1 text-[10px] font-bold text-[#559072]">
        Voir le détail <ChevronRight size={13} />
      </div>
    </div>
  );
}
