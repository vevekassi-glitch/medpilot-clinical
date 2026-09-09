import { ArrowRight, Check, ShieldCheck, Sparkles } from "lucide-react";
import { useMemo } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";

const planNames: Record<string, string> = { starter: "Starter", clinic: "Clinic", enterprise: "Enterprise" };

export default function BillingSuccess() {
  const [, navigate] = useLocation();
  const { isAuthenticated, loading } = useAuth();
  const plan = useMemo(() => new URLSearchParams(window.location.search).get("plan") || "clinic", []);
  const planName = planNames[plan] || "votre offre";

  return <main className="billing-success-page"><div className="billing-success-glow billing-success-glow-one" /><div className="billing-success-glow billing-success-glow-two" /><section className="billing-success-card" aria-live="polite"><div className="billing-success-icon"><Check size={36} strokeWidth={2.5} /></div><div className="mt-7 flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-[.18em] text-[#67a887]"><Sparkles size={13} /> Paiement confirmé</div><h1 className="mt-4 font-display text-[clamp(30px,5vw,48px)] font-semibold tracking-[-.06em] text-[#17384a]">Bienvenue dans MedPilot.</h1><p className="mx-auto mt-4 max-w-lg text-[14px] leading-7 text-[#718a87]">Votre abonnement <strong className="text-[#426c65]">{planName}</strong> est en cours d’activation. Retrouvez votre espace de travail, vos dossiers et vos paramètres depuis le tableau de bord.</p><div className="billing-success-status"><ShieldCheck size={16} /><span>Activation sécurisée · revue humaine toujours obligatoire</span></div><Button disabled={loading} onClick={() => isAuthenticated ? navigate("/app") : window.location.assign("/app")} className="mt-7 h-11 rounded-xl bg-[#17384a] px-6 text-[12px] font-bold text-white shadow-[0_12px_28px_rgba(23,56,74,.18)] hover:bg-[#24566b]">Accéder à mon tableau de bord <ArrowRight size={16} className="ml-2" /></Button><button className="mt-4 text-[11px] font-semibold text-[#73918c] underline-offset-4 hover:text-[#3d8065] hover:underline" onClick={() => navigate("/")}>Retourner à l’accueil</button></section></main>;
}
