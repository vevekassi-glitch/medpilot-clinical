import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Bell,
  Building2,
  BrainCircuit,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  FileDown,
  FileSearch,
  Eraser,
  FlaskConical,
  HeartPulse,
  History,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  PenLine,
  MessageSquareText,
  PlusCircle,
  MoreHorizontal,
  Pill,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Stethoscope,
  UserRound,
  UsersRound,
  X,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AIChatBox, type Message } from "@/components/AIChatBox";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { jsPDF } from "jspdf";
import { hasOAuthPortal } from "@/const";
import { useLocation } from "wouter";

type TabKey = "overview" | "cases" | "agents" | "audit";
type AgentState = "done" | "running" | "queued" | "blocked";

const demoCases = [
  { ref: "MP-2048", initials: "CL", age: 42, complaint: "Douleur thoracique à l'effort", acuity: "À revoir", acuityTone: "high", updated: "il y a 8 min", updatedMinutes: 8, state: "in_review" },
  { ref: "MP-2047", initials: "NR", age: 29, complaint: "Fièvre & céphalées", acuity: "Modérée", acuityTone: "medium", updated: "il y a 24 min", updatedMinutes: 24, state: "in_review" },
  { ref: "MP-2046", initials: "AS", age: 67, complaint: "Essoufflement progressif", acuity: "Urgente", acuityTone: "critical", updated: "il y a 41 min", updatedMinutes: 41, state: "needs_review" },
  { ref: "MP-2045", initials: "JM", age: 35, complaint: "Douleur abdominale", acuity: "Faible", acuityTone: "low", updated: "hier, 16:12", updatedMinutes: 1440, state: "closed" },
];

const agentBlueprint = [
  { key: "intake", label: "Intake & sécurité", helper: "Contexte patient et signaux d'alerte", icon: ClipboardList },
  { key: "symptoms", label: "Analyse des symptômes", helper: "Cartographie clinique structurée", icon: BrainCircuit },
  { key: "differential", label: "Hypothèses différentielles", helper: "Pistes à discuter, sans diagnostic", icon: Stethoscope },
  { key: "exams", label: "Examens à considérer", helper: "Priorités et justification", icon: FlaskConical },
  { key: "safety", label: "Sécurité médicamenteuse", helper: "Contre-indications à vérifier", icon: Pill },
  { key: "synthesis", label: "Synthèse supervisée", helper: "Brouillon pour revue clinique", icon: FileSearch },
];

const summary = {
  triage: "Évaluation non concluante — revue clinique recommandée aujourd’hui.",
  redFlags: ["Douleur déclenchée par l’effort", "Irradiation non documentée", "Facteurs de risque à préciser"],
  differential: ["Syndrome coronarien à exclure", "Cause musculo-squelettique", "Reflux gastro-œsophagien"],
  exams: ["Constantes + saturation", "ECG 12 dérivations", "Biologie selon protocole local"],
  safety: ["Ne pas suggérer d’automédication avant revue", "Vérifier allergies et traitements en cours"],
};

function StatusPill({ tone, children }: { tone: string; children: React.ReactNode }) {
  const styles: Record<string, string> = {
    critical: "bg-[#fff0ee] text-[#b9483e] border-[#f4c6bf]",
    high: "bg-[#fff6e7] text-[#a66b00] border-[#f4dda6]",
    medium: "bg-[#f5f2ff] text-[#6658a8] border-[#dcd5fa]",
    low: "bg-[#eaf8f1] text-[#357e5e] border-[#c7ead6]",
    neutral: "bg-slate-50 text-slate-500 border-slate-200",
  };
  return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide", styles[tone] ?? styles.neutral)}>{children}</span>;
}

function MetricCard({ label, value, delta, icon: Icon, tone }: { label: string; value: string; delta: string; icon: React.ElementType; tone: string }) {
  return (
    <div className="metric-card group">
      <div className="flex items-start justify-between">
        <div className={cn("metric-icon", tone)}><Icon size={18} strokeWidth={1.8} /></div>
        <ArrowUpRight className="text-slate-300 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" size={17} />
      </div>
      <div className="mt-5 flex items-end justify-between gap-3">
        <div><div className="text-[12px] font-medium text-slate-500">{label}</div><div className="mt-1 font-display text-[29px] font-semibold tracking-[-0.04em] text-[#142b3a]">{value}</div></div>
        <span className="pb-1 text-[11px] font-semibold text-[#3b8f70]">{delta}</span>
      </div>
    </div>
  );
}

export default function Home() {
  const { user } = useAuth({ redirectOnUnauthenticated: hasOAuthPortal });
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [mobileNav, setMobileNav] = useState(false);
  const [search, setSearch] = useState("");
  const [acuityFilter, setAcuityFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [sortBy, setSortBy] = useState("date");
  const [selectedCase, setSelectedCase] = useState<any>(demoCases[0]);
  const [isRunning, setIsRunning] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [agentStep, setAgentStep] = useState(0);
  const [caseNote, setCaseNote] = useState("Douleur rétrosternale depuis 3 jours, déclenchée par la montée d’escaliers. Pas de syncope rapportée. Antécédents et traitements à confirmer.");
  const [toast, setToast] = useState<string | null>(null);
  const [showCreateCase, setShowCreateCase] = useState(false);
  const [localCases, setLocalCases] = useState<any[]>([]);
  const [newCase, setNewCase] = useState({ patientRef: "", initials: "", age: "", sex: "unknown", chiefComplaint: "", symptoms: "" });
  const utils = trpc.useUtils();
  const createCase = trpc.clinical.create.useMutation();
  const analyzeCase = trpc.clinical.analyze.useMutation();
  const { data: persistedCases } = trpc.clinical.list.useQuery();
  const dashboardCases = useMemo(() => persistedCases?.length ? persistedCases.map(item => ({
    id: item.id,
    ref: item.patientRef,
    initials: item.initials,
    age: item.age,
    complaint: item.chiefComplaint,
    acuity: item.acuity === "critical" ? "Urgente" : item.acuity === "high" ? "À revoir" : item.acuity === "medium" ? "Modérée" : "Faible",
    acuityTone: item.acuity,
    updated: new Date(item.updatedAt).toLocaleString("fr-FR"),
    updatedMinutes: Math.max(1, Math.round((Date.now() - new Date(item.updatedAt).getTime()) / 60000)),
    state: item.status,
  })) : [...localCases, ...demoCases], [localCases, persistedCases]);

  useEffect(() => {
    if (persistedCases?.length && !selectedCase.id) setSelectedCase(dashboardCases[0]);
  }, [persistedCases, dashboardCases, selectedCase.id]);

  useEffect(() => {
    if (!isRunning) return;
    if (agentStep >= agentBlueprint.length) {
      setCompleted(true);
      setIsRunning(false);
      setToast("Analyse terminée — la revue clinique reste obligatoire.");
      return;
    }
    const timer = window.setTimeout(() => setAgentStep(step => step + 1), 620);
    return () => window.clearTimeout(timer);
  }, [isRunning, agentStep]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const filteredCases = useMemo(() => {
    const severity: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
    let next = dashboardCases.filter(item => {
      const matchesSearch = `${item.ref} ${item.initials} ${item.complaint}`.toLowerCase().includes(search.toLowerCase());
      const matchesAcuity = acuityFilter === "all" || item.acuityTone === acuityFilter;
      const matchesDate = dateFilter === "all" || (dateFilter === "today" ? item.updatedMinutes < 1440 : item.updatedMinutes < 10080);
      return matchesSearch && matchesAcuity && matchesDate;
    });
    return [...next].sort((a, b) => sortBy === "severity" ? severity[b.acuityTone] - severity[a.acuityTone] : a.updatedMinutes - b.updatedMinutes);
  }, [dashboardCases, search, acuityFilter, dateFilter, sortBy]);

  const startAnalysis = () => {
    if (typeof selectedCase.id === "number") {
      analyzeCase.mutate({ caseId: selectedCase.id }, {
        onSuccess: () => setToast("Analyse enregistrée — la revue clinique reste obligatoire."),
        onError: () => setToast("L’analyse n’a pas pu être enregistrée. Vérifiez la configuration IA et le dossier."),
      });
    }
    setCompleted(false);
    setAgentStep(0);
    setIsRunning(true);
  };

  const openCreateCase = () => {
    setNewCase({ patientRef: `MP-${2049 + localCases.length}`, initials: "", age: "", sex: "unknown", chiefComplaint: "", symptoms: "" });
    setShowCreateCase(true);
  };

  const submitCase = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input = { ...newCase, age: Number(newCase.age), sex: newCase.sex as "female" | "male" | "other" | "unknown" };
    if (user) {
      createCase.mutate(input, {
        onSuccess: async id => {
          await utils.clinical.list.invalidate();
          setShowCreateCase(false);
          setToast(`Dossier ${input.patientRef} créé.`);
          setActiveTab("cases");
          setSelectedCase({ id, ref: input.patientRef, initials: input.initials, age: input.age, complaint: input.chiefComplaint, acuity: "Modérée", acuityTone: "medium", updated: "à l’instant", updatedMinutes: 0, state: "new" });
        },
        onError: error => setToast(error.message || "Impossible de créer le dossier."),
      });
      return;
    }
    const created = { id: `local-${Date.now()}`, ref: input.patientRef, initials: input.initials, age: input.age, complaint: input.chiefComplaint, acuity: "Modérée", acuityTone: "medium", updated: "à l’instant", updatedMinutes: 0, state: "new" };
    setLocalCases(current => [created, ...current]);
    setSelectedCase(created);
    setActiveTab("cases");
    setShowCreateCase(false);
    setToast(`Dossier ${input.patientRef} ajouté en mode démo.`);
  };

  const navItems: Array<{ key: TabKey; label: string; icon: React.ElementType; count?: string }> = [
    { key: "overview", label: "Vue d’ensemble", icon: LayoutDashboard },
    { key: "cases", label: "Cas cliniques", icon: UsersRound, count: String(dashboardCases.length) },
    { key: "agents", label: "Agents IA", icon: BrainCircuit },
    { key: "audit", label: "Journal & conformité", icon: ShieldCheck },
  ];

  if (user?.role === "patient") return <PatientDashboard user={user} />;
  if (user?.role === "client") return <ClientDashboard user={user} caseCount={dashboardCases.length} />;

  return (
    <div className="min-h-screen bg-[#f5f8f7] text-[#142b3a]">
      <div className="app-shell">
        <aside className={cn("sidebar", mobileNav && "sidebar-open")}>
          <div className="sidebar-brand">
            <div className="brand-mark"><Activity size={21} strokeWidth={2.2} /></div>
            <div><div className="font-display text-[17px] font-semibold tracking-[-0.04em]">MedPilot</div><div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#6f8d8a]">Clinical OS</div></div>
            <button className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-white md:hidden" onClick={() => setMobileNav(false)} aria-label="Fermer le menu"><X size={18} /></button>
          </div>
          <div className="mt-9 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[#8aa09e]">Espace clinique</div>
          <nav className="mt-3 space-y-1.5" aria-label="Navigation principale">
            {navItems.map(item => {
              const Icon = item.icon;
              return <button key={item.key} onClick={() => { setActiveTab(item.key); setMobileNav(false); }} className={cn("sidebar-link", activeTab === item.key && "sidebar-link-active")}><Icon size={17} strokeWidth={activeTab === item.key ? 2 : 1.7} /><span>{item.label}</span>{item.count && <span className="ml-auto rounded-full bg-[#dff0e8] px-2 py-0.5 text-[10px] font-bold text-[#438267]">{item.count}</span>}</button>;
            })}
          </nav>
          <div className="mt-10 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[#8aa09e]">Raccourcis</div>
          <div className="mt-3 space-y-1.5">
            <button className="sidebar-link" onClick={openCreateCase}><Plus size={17} /><span>Nouveau cas</span><span className="kbd">N</span></button>
            <button className="sidebar-link" onClick={() => setToast("Référentiel de protocoles — module en préparation.")}><ClipboardList size={17} /><span>Protocoles</span></button>
          </div>
          <div className="sidebar-spacer" />
          <div className="compliance-card">
            <div className="flex items-center gap-2 text-[#3f8d6c]"><LockKeyhole size={15} /><span className="text-[11px] font-bold">Mode protégé</span></div>
            <p className="mt-2 text-[11px] leading-4 text-[#64817e]">Les suggestions IA sont des brouillons. La décision appartient au professionnel habilité.</p>
            <div className="mt-3 flex items-center gap-1.5 text-[10px] font-semibold text-[#599879]"><span className="status-dot" />Audit actif</div>
          </div>
          <button className="mt-5 flex w-full items-center gap-3 border-t border-[#dfe9e5] pt-5 text-left" onClick={() => window.location.assign("/account")}>
            <div className="avatar">{(user?.name || "MP").slice(0, 2).toUpperCase()}</div><div className="min-w-0 flex-1"><div className="truncate text-[12px] font-semibold">{user?.name || "Mon compte"}</div><div className="text-[10px] text-slate-400">{user?.role === "admin" ? "Administrateur" : "Compte MedPilot"}</div></div><MoreHorizontal size={17} className="text-slate-400" />
          </button>
        </aside>

        <main className="main-content">
          <header className="topbar">
            <button className="rounded-xl p-2 text-slate-500 hover:bg-white md:hidden" onClick={() => setMobileNav(true)} aria-label="Ouvrir le menu"><Menu size={20} /></button>
            <div className="flex min-w-0 items-center gap-2 text-[12px] text-slate-400"><span>Centre médical Saint-Clair</span><ChevronRight size={14} /><span className="font-semibold text-[#35505a]">{navItems.find(item => item.key === activeTab)?.label}</span></div>
            <div className="ml-auto flex items-center gap-2.5"><div className="hidden items-center gap-2 rounded-xl border border-[#e0ebe6] bg-white px-3 py-2 text-slate-400 sm:flex"><Search size={15} /><input value={search} onChange={event => setSearch(event.target.value)} className="w-32 bg-transparent text-[11px] outline-none placeholder:text-slate-400" placeholder="Rechercher…" /></div><button className="icon-button relative" onClick={() => setToast("Aucune alerte nouvelle.")} aria-label="Notifications"><Bell size={17} /><span className="notification-dot" /></button><button className="icon-button" onClick={() => setToast("Les préférences seront disponibles avec un compte connecté.")} aria-label="Réglages"><SlidersHorizontal size={17} /></button></div>
          </header>

          <div className="content-wrap">
            {user?.role === "admin" && <AdminRolePanel />}
            <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div><div className="eyebrow"><span className="status-dot" />Lundi 7 septembre 2026 · 09:42</div><h1 className="page-title">Bonjour, {user?.name || "bienvenue"}<span className="text-[#75ab91]">.</span></h1><p className="mt-2 max-w-xl text-[13px] leading-6 text-[#708786]">Votre cockpit de décision clinique assistée. Les signaux prioritaires sont regroupés pour une revue plus sûre et plus rapide.</p></div>
              <div className="flex items-center gap-2"><Button variant="outline" className="h-10 rounded-xl border-[#dce8e3] bg-white px-3 text-[12px] font-semibold text-[#56706f]" onClick={() => exportClinicalSummary(selectedCase, caseNote, "", "")}><FileDown size={15} className="mr-2" />Exporter PDF</Button><Button className="h-10 rounded-xl bg-[#17384a] px-4 text-[12px] font-semibold text-white shadow-[0_8px_18px_rgba(23,56,74,.16)] hover:bg-[#214b60]" onClick={openCreateCase}><Plus size={16} className="mr-2" />Nouveau cas</Button></div>
            </div>

            {activeTab === "overview" && <>
              <section className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="Cas actifs" value="12" delta="+3 cette semaine" icon={UsersRound} tone="green" /><MetricCard label="À revoir" value="04" delta="2 urgents" icon={AlertTriangle} tone="amber" /><MetricCard label="Analyses IA" value="38" delta="+18% vs. hier" icon={BrainCircuit} tone="lavender" /><MetricCard label="Temps gagné" value="2h 14" delta="cette semaine" icon={Clock3} tone="blue" />
              </section>

              <section className="mt-7 grid grid-cols-1 gap-5 xl:grid-cols-[1.28fr_.72fr]">
                <div className="panel overflow-hidden">
                  <div className="panel-header"><div><h2 className="panel-title">Cas nécessitant votre attention</h2><p className="panel-subtitle">Les derniers dossiers actifs de votre équipe</p></div><button className="quiet-action" onClick={() => setActiveTab("cases")}>Voir tous les cas <ArrowUpRight size={14} /></button></div>
                  <div className="case-filterbar"><div className="filter-label"><SlidersHorizontal size={14} /> Filtrer</div><select value={acuityFilter} onChange={event => setAcuityFilter(event.target.value)} aria-label="Filtrer par gravité"><option value="all">Toutes les gravités</option><option value="critical">Urgente</option><option value="high">À revoir</option><option value="medium">Modérée</option><option value="low">Faible</option></select><select value={dateFilter} onChange={event => setDateFilter(event.target.value)} aria-label="Filtrer par date"><option value="all">Toutes les dates</option><option value="today">Aujourd’hui</option><option value="week">7 derniers jours</option></select><select value={sortBy} onChange={event => setSortBy(event.target.value)} aria-label="Trier les cas"><option value="date">Plus récents</option><option value="severity">Gravité décroissante</option></select><span className="filter-result">{filteredCases.length} cas</span></div>
                  <div className="overflow-x-auto"><table className="w-full min-w-[620px]"><thead><tr className="border-b border-[#edf2ef] text-left"><th className="table-head">Patient</th><th className="table-head">Motif principal</th><th className="table-head">Priorité</th><th className="table-head">Mis à jour</th><th className="table-head"></th></tr></thead><tbody>{filteredCases.map(item => <tr key={item.ref} onClick={() => setSelectedCase(item)} className="case-row"><td className="table-cell"><div className="flex items-center gap-3"><div className="patient-avatar">{item.initials}</div><div><div className="text-[12px] font-bold text-[#274352]">{item.ref}</div><div className="mt-0.5 text-[11px] text-slate-400">{item.age} ans · données dé-identifiées</div></div></div></td><td className="table-cell text-[12px] font-medium text-[#526d70]">{item.complaint}</td><td className="table-cell"><StatusPill tone={item.acuityTone}>{item.acuity}</StatusPill></td><td className="table-cell text-[11px] text-slate-400">{item.updated}</td><td className="table-cell text-right"><ChevronRight size={16} className="ml-auto text-slate-300" /></td></tr>)}</tbody></table></div>
                </div>
                <div className="panel flex flex-col"><div className="panel-header"><div><h2 className="panel-title">Activité des agents</h2><p className="panel-subtitle">Fiabilité et volume sur 7 jours</p></div><button className="icon-button" onClick={async () => { await utils.clinical.list.invalidate(); setToast("Données actualisées."); }} aria-label="Actualiser les données"><RefreshCw size={15} /></button></div><div className="px-5 pt-1"><div className="flex items-end gap-1.5" style={{ height: 124 }}>{[38, 54, 45, 68, 62, 83, 72, 96, 76, 89, 80, 108, 92, 113, 102, 120, 100, 112, 93, 124, 109, 118].map((height, index) => <div key={index} className={cn("chart-bar", index > 14 && "chart-bar-active")} style={{ height: `${height}px` }} />)}</div><div className="mt-2 flex justify-between text-[10px] text-slate-400"><span>Lun.</span><span>Mer.</span><span>Ven.</span><span>Dim.</span></div></div><div className="mt-auto grid grid-cols-2 gap-3 border-t border-[#edf2ef] p-5"><div><div className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">Analyses</div><div className="mt-1 font-display text-[22px] font-semibold text-[#244356]">124</div></div><div><div className="text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">Revue humaine</div><div className="mt-1 font-display text-[22px] font-semibold text-[#244356]">100<span className="text-[13px] text-slate-400">%</span></div></div></div></div>
              </section>

              <section className="mt-5"><SeverityChart /></section>

              <section className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[.78fr_1.22fr]">
                <div className="panel"><div className="panel-header"><div><h2 className="panel-title">Qualité & conformité</h2><p className="panel-subtitle">Garde-fous opérationnels</p></div><ShieldCheck className="text-[#72a88e]" size={21} /></div><div className="space-y-4 px-5 pb-5"><div className="quality-item"><div className="quality-icon bg-[#eaf8f1] text-[#43876a]"><CheckCircle2 size={16} /></div><div className="min-w-0 flex-1"><div className="text-[12px] font-semibold">Revue humaine obligatoire</div><div className="mt-0.5 text-[11px] text-slate-400">Toutes les synthèses cette semaine</div></div><span className="text-[12px] font-bold text-[#43876a]">100%</span></div><div className="quality-item"><div className="quality-icon bg-[#fff6e7] text-[#b27b17]"><AlertTriangle size={16} /></div><div className="min-w-0 flex-1"><div className="text-[12px] font-semibold">Champs manquants détectés</div><div className="mt-0.5 text-[11px] text-slate-400">À compléter avant décision</div></div><span className="text-[12px] font-bold text-[#b27b17]">07</span></div><div className="quality-item"><div className="quality-icon bg-[#edf4fb] text-[#4c7ba5]"><LockKeyhole size={16} /></div><div className="min-w-0 flex-1"><div className="text-[12px] font-semibold">Traçabilité des actions</div><div className="mt-0.5 text-[11px] text-slate-400">Journal immuable actif</div></div><span className="text-[12px] font-bold text-[#4c7ba5]">OK</span></div></div></div>
                <div className="panel relative overflow-hidden bg-[#17384a] text-white"><div className="absolute -right-16 -top-20 h-56 w-56 rounded-full border border-white/10" /><div className="absolute -right-2 -top-6 h-36 w-36 rounded-full border border-white/10" /><div className="relative flex h-full flex-col justify-between p-6"><div><div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.2em] text-[#9ed1b7]"><Sparkles size={14} /> Parcours recommandé</div><h2 className="mt-3 max-w-lg font-display text-[23px] font-semibold leading-tight tracking-[-.035em]">Testez l’orchestration complète sur un nouveau cas.</h2><p className="mt-3 max-w-md text-[12px] leading-5 text-[#b3c8c9]">Six agents spécialisés pour structurer les informations, signaler les risques et préparer un brouillon de synthèse — jamais pour remplacer le jugement clinique.</p></div><div className="mt-7 flex flex-wrap items-center gap-3"><Button className="h-9 rounded-lg bg-[#d8f0e1] px-3 text-[11px] font-bold text-[#1b5548] hover:bg-white" onClick={() => { setActiveTab("cases"); startAnalysis(); }}>Lancer une analyse démo <ArrowUpRight size={14} className="ml-2" /></Button><span className="text-[10px] text-[#93b5b6]">Données fictives · sans impact patient</span></div></div></div>
              </section>
            </>}

            {activeTab === "cases" && <CaseWorkspace selectedCase={selectedCase} setSelectedCase={setSelectedCase} caseNote={caseNote} setCaseNote={setCaseNote} isRunning={isRunning} completed={completed} agentStep={agentStep} startAnalysis={startAnalysis} toast={toast} />}
            {activeTab === "agents" && <AgentsPanel agentStep={agentStep} isRunning={isRunning} completed={completed} startAnalysis={startAnalysis} />}
            {activeTab === "audit" && <AuditPanel />}
          </div>
        </main>
      </div>
      {showCreateCase && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#17384a]/30 p-4" role="dialog" aria-modal="true" aria-labelledby="new-case-title"><form onSubmit={submitCase} className="panel w-full max-w-xl bg-white shadow-2xl"><div className="panel-header"><div><h2 id="new-case-title" className="panel-title">Nouveau dossier clinique</h2><p className="panel-subtitle">Données dé-identifiées, revue humaine obligatoire</p></div><button type="button" className="icon-button" onClick={() => setShowCreateCase(false)} aria-label="Fermer"><X size={16} /></button></div><div className="grid grid-cols-1 gap-3 px-5 pb-5 sm:grid-cols-2"><label className="text-[11px] font-bold text-[#526d70]">Référence<input required value={newCase.patientRef} onChange={event => setNewCase(current => ({ ...current, patientRef: event.target.value }))} className="mt-1 w-full rounded-lg border border-[#dfeae5] px-3 py-2 text-[12px] font-normal outline-none focus:border-[#78ad95]" /></label><label className="text-[11px] font-bold text-[#526d70]">Initiales<input required maxLength={8} value={newCase.initials} onChange={event => setNewCase(current => ({ ...current, initials: event.target.value.toUpperCase() }))} className="mt-1 w-full rounded-lg border border-[#dfeae5] px-3 py-2 text-[12px] font-normal outline-none focus:border-[#78ad95]" /></label><label className="text-[11px] font-bold text-[#526d70]">Âge<input required type="number" min="0" max="120" value={newCase.age} onChange={event => setNewCase(current => ({ ...current, age: event.target.value }))} className="mt-1 w-full rounded-lg border border-[#dfeae5] px-3 py-2 text-[12px] font-normal outline-none focus:border-[#78ad95]" /></label><label className="text-[11px] font-bold text-[#526d70]">Sexe<select value={newCase.sex} onChange={event => setNewCase(current => ({ ...current, sex: event.target.value }))} className="mt-1 w-full rounded-lg border border-[#dfeae5] bg-white px-3 py-2 text-[12px] font-normal outline-none focus:border-[#78ad95]"><option value="unknown">Non précisé</option><option value="female">Femme</option><option value="male">Homme</option><option value="other">Autre</option></select></label><label className="text-[11px] font-bold text-[#526d70] sm:col-span-2">Motif principal<input required minLength={3} maxLength={255} value={newCase.chiefComplaint} onChange={event => setNewCase(current => ({ ...current, chiefComplaint: event.target.value }))} className="mt-1 w-full rounded-lg border border-[#dfeae5] px-3 py-2 text-[12px] font-normal outline-none focus:border-[#78ad95]" /></label><label className="text-[11px] font-bold text-[#526d70] sm:col-span-2">Symptômes et contexte<textarea required minLength={10} value={newCase.symptoms} onChange={event => setNewCase(current => ({ ...current, symptoms: event.target.value }))} className="mt-1 min-h-24 w-full resize-y rounded-lg border border-[#dfeae5] px-3 py-2 text-[12px] font-normal outline-none focus:border-[#78ad95]" /></label></div><div className="flex justify-end gap-2 border-t border-[#edf2ef] bg-[#fbfdfc] px-5 py-3"><Button type="button" variant="outline" onClick={() => setShowCreateCase(false)}>Annuler</Button><Button type="submit" disabled={createCase.isPending}>{createCase.isPending ? "Création…" : "Créer le dossier"}</Button></div></form></div>}
      {toast && <div className="toast"><CheckCircle2 size={16} className="text-[#62a584]" /><span>{toast}</span><button onClick={() => setToast(null)} aria-label="Fermer la notification"><X size={14} /></button></div>}
    </div>
  );
}

function AdminRolePanel() {
  const utils = trpc.useUtils();
  const users = trpc.admin.users.useQuery();
  const setRole = trpc.admin.setRole.useMutation({ onSuccess: () => { void utils.admin.users.invalidate(); }, onError: error => console.error(error) });
  return <section className="panel mb-5"><div className="panel-header"><div><h2 className="panel-title">Administration des rôles</h2><p className="panel-subtitle">Attribuez les accès selon le poste occupé.</p></div><ShieldCheck className="text-[#72a88e]" size={20} /></div><div className="divide-y divide-[#edf2ef]">{users.data?.map(item => <div key={item.id} className="flex flex-wrap items-center gap-3 px-5 py-3"><div className="min-w-0 flex-1"><div className="truncate text-[12px] font-bold text-[#274352]">{item.name || "Utilisateur sans nom"}</div><div className="truncate text-[11px] text-slate-400">{item.email || "Sans e-mail"}</div></div><select aria-label={`Rôle de ${item.email || item.name || item.id}`} value={item.role} disabled={setRole.isPending} onChange={event => setRole.mutate({ userId: item.id, role: event.target.value as "user" | "patient" | "doctor" | "clinic" | "client" | "admin" })} className="rounded-lg border border-[#dfeae5] bg-white px-3 py-2 text-[11px]"><option value="user">À compléter</option><option value="patient">Patient</option><option value="doctor">Médecin</option><option value="clinic">Clinique</option><option value="client">Client / établissement</option><option value="admin">Administrateur</option></select></div>)}</div></section>;
}

function PatientDashboard({ user }: { user: NonNullable<ReturnType<typeof useAuth>["user"]> }) {
  const [, navigate] = useLocation();
  const account = trpc.account.me.useQuery();
  const appointments = trpc.calendar.appointments.useQuery({ from: new Date(), to: new Date(Date.now() + 1000 * 60 * 60 * 24 * 90) });
  return <div className="min-h-screen bg-[#f5f8f7] text-[#142b3a]"><div className="mx-auto max-w-6xl px-5 py-6 lg:px-8"><header className="flex items-center justify-between border-b border-[#dfe9e5] pb-5"><div className="flex items-center gap-3"><div className="brand-mark"><HeartPulse size={20} /></div><div><div className="font-display text-[17px] font-semibold">Mon espace patient</div><div className="text-[10px] font-bold uppercase tracking-[.2em] text-[#6f8d8a]">MedPilot Clinical</div></div></div><Button variant="outline" onClick={() => navigate("/account")}><UserRound size={15} className="mr-2" />Mon compte</Button></header><section className="mt-10 max-w-3xl"><div className="eyebrow"><span className="status-dot" />Espace patient sécurisé</div><h1 className="page-title mt-3">Bonjour, {user.name || "patient"}.</h1><p className="mt-3 text-[13px] leading-6 text-[#708786]">Retrouvez vos rendez-vous, vos demandes de soins et les informations partagées par votre équipe médicale.</p></section><div className="mt-8 grid gap-5 lg:grid-cols-[1.2fr_.8fr]"><section className="panel"><div className="panel-header"><div><h2 className="panel-title">Mes rendez-vous</h2><p className="panel-subtitle">Demandes et consultations à venir</p></div><CalendarDays className="text-[#6ea287]" size={20} /></div>{appointments.data?.length ? <div className="divide-y divide-[#edf2ef]">{appointments.data.map(item => <div key={item.id} className="flex items-center justify-between px-5 py-4"><div><div className="text-[12px] font-bold text-[#274352]">{new Date(item.startsAt).toLocaleString("fr-FR")}</div><div className="mt-1 text-[11px] text-slate-400">{item.reason || "Consultation médicale"}</div></div><StatusPill tone={item.status === "confirmed" ? "low" : "medium"}>{item.status === "confirmed" ? "Confirmé" : "En attente"}</StatusPill></div>)}</div> : <div className="px-5 pb-6 text-[12px] text-slate-400">Aucun rendez-vous à venir.</div>}<div className="border-t border-[#edf2ef] px-5 py-4"><Button onClick={() => navigate("/calendar")} className="bg-[#17384a] text-xs">Prendre rendez-vous <CalendarDays size={14} className="ml-2" /></Button></div></section><section className="panel"><div className="panel-header"><div><h2 className="panel-title">Mon parcours</h2><p className="panel-subtitle">Informations de compte</p></div><ShieldCheck className="text-[#72a88e]" size={20} /></div><div className="space-y-4 px-5 pb-6"><div className="quality-item"><CheckCircle2 className="text-[#43876a]" size={17} /><span className="text-[12px] font-semibold">Compte patient actif</span></div><div className="quality-item"><LockKeyhole className="text-[#4c7ba5]" size={17} /><span className="text-[12px] font-semibold">Données protégées</span></div><p className="text-[11px] leading-5 text-slate-400">Les dossiers cliniques et outils de décision sont réservés aux professionnels habilités.</p></div></section></div></div></div>;
}

function ClientDashboard({ user, caseCount }: { user: NonNullable<ReturnType<typeof useAuth>["user"]>; caseCount: number }) {
  const [, navigate] = useLocation();
  const account = trpc.account.me.useQuery();
  return <div className="min-h-screen bg-[#f5f8f7] text-[#142b3a]"><div className="mx-auto max-w-6xl px-5 py-6 lg:px-8"><header className="flex items-center justify-between border-b border-[#dfe9e5] pb-5"><div className="flex items-center gap-3"><div className="brand-mark"><Building2 size={20} /></div><div><div className="font-display text-[17px] font-semibold">Espace client</div><div className="text-[10px] font-bold uppercase tracking-[.2em] text-[#6f8d8a]">Pilotage du réseau</div></div></div><Button variant="outline" onClick={() => navigate("/account")}><Building2 size={15} className="mr-2" />Organisation</Button></header><section className="mt-10"><div className="eyebrow"><span className="status-dot" />Espace client / établissement</div><h1 className="page-title mt-3">Bonjour, {user.name || "responsable"}.</h1><p className="mt-3 max-w-2xl text-[13px] leading-6 text-[#708786]">Suivez l’activité de votre organisation, coordonnez les équipes et consultez les dossiers qui vous sont autorisés.</p></section><div className="mt-8 grid gap-4 sm:grid-cols-3"><MetricCard label="Dossiers accessibles" value={String(caseCount)} delta="dans votre périmètre" icon={ClipboardList} tone="green" /><MetricCard label="Organisations" value={String(account.data?.memberships.length ?? 0)} delta="accès autorisés" icon={Building2} tone="blue" /><MetricCard label="Consultations" value={String(account.data?.consultations.length ?? 0)} delta="à coordonner" icon={CalendarDays} tone="lavender" /></div><div className="mt-6 grid gap-5 lg:grid-cols-[1.1fr_.9fr]"><section className="panel"><div className="panel-header"><div><h2 className="panel-title">Actions de coordination</h2><p className="panel-subtitle">Accès adaptés à votre rôle client</p></div><UsersRound className="text-[#6ea287]" size={20} /></div><div className="grid gap-3 p-5 sm:grid-cols-2"><Button variant="outline" className="justify-start" onClick={() => navigate("/account")}><UsersRound size={15} className="mr-2" />Gérer les équipes</Button><Button variant="outline" className="justify-start" onClick={() => navigate("/calendar")}><CalendarDays size={15} className="mr-2" />Voir les rendez-vous</Button><Button variant="outline" className="justify-start" onClick={() => navigate("/app?view=cases")}><ClipboardList size={15} className="mr-2" />Voir les dossiers</Button><Button variant="outline" className="justify-start" onClick={() => navigate("/account")}><ShieldCheck size={15} className="mr-2" />Conformité</Button></div></section><section className="panel"><div className="panel-header"><div><h2 className="panel-title">Périmètre d’accès</h2><p className="panel-subtitle">Contrôle et traçabilité</p></div><LockKeyhole className="text-[#72a88e]" size={20} /></div><div className="space-y-3 px-5 pb-6 text-[12px] text-[#526d70]"><p>Vous voyez uniquement les dossiers créés par votre organisation ou explicitement partagés.</p><p className="rounded-lg bg-[#eaf8f1] px-3 py-2 font-semibold text-[#43876a]">Les décisions cliniques restent sous supervision médicale.</p></div></section></div></div></div>;
}


function SeverityChart() {
  const [range, setRange] = useState<"7" | "30" | "90">("30");
  const days = ["09", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30", "01", "02", "03", "04", "05", "06", "07"];
  const values = [5, 7, 4, 8, 6, 9, 5, 7, 8, 6, 10, 8, 11, 9, 7, 12, 10, 8, 9, 11, 8, 10, 13, 9, 12, 11, 14, 10, 12, 15];
  const levels = [{ label: "Critique", color: "#e77b6e", value: 14 }, { label: "Élevée", color: "#e5b55b", value: 27 }, { label: "Modérée", color: "#9f91d7", value: 39 }, { label: "Faible", color: "#78b791", value: 20 }];
  const chartValues = range === "7" ? values.slice(-7) : range === "30" ? values : Array.from({ length: 90 }, (_, index) => 4 + ((index * 7) % 12));
  const chartLabels = range === "90" ? chartValues.map((_, index) => `${90 - index}`) : chartValues.map((_, index) => days[days.length - chartValues.length + index]);
  const total = chartValues.reduce((sum, value) => sum + value, 0);
  const rangeLabel = range === "7" ? "7 derniers jours" : range === "30" ? "30 derniers jours" : "90 derniers jours";
  return <div className="panel"><div className="panel-header"><div><h2 className="panel-title">Répartition des cas · {rangeLabel}</h2><p className="panel-subtitle">Volume quotidien et distribution par niveau de gravité</p></div><div className="flex items-end gap-4"><label className="chart-range-label">Plage<select value={range} onChange={event => setRange(event.target.value as "7" | "30" | "90")} aria-label="Sélectionner la plage du graphique"><option value="7">7 jours</option><option value="30">30 jours</option><option value="90">90 jours</option></select></label><div className="chart-total"><span>Total</span><strong>{total}</strong><em>+18%</em></div></div></div><div className="grid grid-cols-1 gap-6 px-5 pb-5 lg:grid-cols-[1.35fr_.65fr]"><div><div className="severity-chart" aria-label={`Graphique des cas sur ${rangeLabel}`}>{chartValues.map((value, index) => <div className="severity-column" key={`${chartLabels[index]}-${index}`}><div className="severity-tooltip"><strong>{value} cas</strong><span>{range === "90" ? `J-${chartLabels[index]}` : `Jour ${chartLabels[index]}`}</span></div><div className="severity-bar" style={{ height: `${Math.round((value / 15) * 118)}px` }} /><span>{index % (range === "7" ? 1 : range === "30" ? 5 : 15) === 0 || index === chartValues.length - 1 ? chartLabels[index] : ""}</span></div>)}</div><div className="chart-axis-label">Septembre 2026 · nombre de cas ouverts · survolez une barre pour le détail</div></div><div className="severity-legend">{levels.map(level => <div className="legend-row" key={level.label}><span className="legend-dot" style={{ background: level.color }} /><span>{level.label}</span><strong>{level.value}%</strong></div>)}<div className="mt-4 border-t border-[#edf2ef] pt-3 text-[10px] leading-4 text-slate-400">La gravité est un signal de priorisation, pas un diagnostic automatisé.</div></div></div></div>;
}

function CaseWorkspace({ selectedCase, setSelectedCase, caseNote, setCaseNote, isRunning, completed, agentStep, startAnalysis }: any) {
  const progress = completed ? 100 : Math.round((agentStep / agentBlueprint.length) * 100);
  const [doctorNotes, setDoctorNotes] = useState("");
  const [signature, setSignature] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const ask = trpc.clinical.ask.useMutation();
  const utils = trpc.useUtils();
  const [conversationId, setConversationId] = useState<number | undefined>();
  const [showHistory, setShowHistory] = useState(false);
  const conversations = trpc.clinical.conversations.useQuery({ caseId: selectedCase.id ?? 0 }, { enabled: typeof selectedCase.id === "number" });
  const loadedConversation = trpc.clinical.conversation.useQuery({ id: conversationId ?? 0 }, { enabled: Boolean(conversationId) });

  useEffect(() => {
    if (loadedConversation.data) {
      setMessages(loadedConversation.data.messages.map(message => ({ role: message.role, content: message.content })));
    }
  }, [loadedConversation.data]);

  useEffect(() => {
    setConversationId(undefined);
    setMessages([]);
    setShowHistory(false);
  }, [selectedCase.id]);

  const startNewConversation = () => {
    setConversationId(undefined);
    setMessages([]);
    setShowHistory(false);
  };

  const loadConversation = (id: number) => {
    setConversationId(id);
    setShowHistory(false);
  };

  const handleSend = (content: string) => {
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    if (typeof selectedCase.id !== "number") {
      window.setTimeout(() => setMessages(current => [
        ...current,
        { role: "assistant", content: "Dans cette démonstration, je peux expliquer le triage, les hypothèses, les examens à considérer et les données manquantes. Toute conclusion doit être vérifiée par un professionnel habilité." },
      ]), 450);
      return;
    }
    ask.mutate({
      caseId: selectedCase.id,
      conversationId,
      question: content,
      history: messages.map(message => ({ role: message.role === "system" ? "assistant" : message.role, content: message.content })),
    }, {
      onSuccess: result => { setConversationId(result.conversationId); setMessages(current => [...current, { role: "assistant", content: result.answer }]); void utils.clinical.conversations.invalidate({ caseId: selectedCase.id ?? 0 }); },
      onError: () => setMessages(current => [...current, { role: "assistant", content: "Je ne peux pas répondre à cette question pour le moment. Vérifiez le dossier et poursuivez la revue clinique selon le protocole local." }]),
    });
  };

  const insertAssistantAnswer = (content: string) => {
    setDoctorNotes(current => current ? `${current}\n\nRéponse IA à vérifier :\n${content}` : `Réponse IA à vérifier :\n${content}`);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="eyebrow"><span className="status-dot" />Dossier sélectionné · revue en cours</div>
          <h2 className="mt-2 font-display text-[26px] font-semibold tracking-[-.04em] text-[#17384a]">{selectedCase.ref} <span className="text-slate-300">/</span> {selectedCase.complaint}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="h-9 rounded-lg border-[#dce8e3] bg-white text-[11px]" onClick={() => setSelectedCase({ ...selectedCase })}><CalendarDays size={14} className="mr-2" />Historique</Button>
          <Button variant="outline" className="h-9 rounded-lg border-[#dce8e3] bg-white text-[11px]" onClick={() => exportClinicalSummary(selectedCase, caseNote, doctorNotes, signature)}><FileDown size={14} className="mr-2" />PDF final</Button>
          <Button className="h-9 rounded-lg bg-[#17384a] text-[11px]" onClick={startAnalysis}><Sparkles size={14} className="mr-2" />{isRunning ? "Analyse en cours…" : completed ? "Relancer l’analyse" : "Lancer l’analyse"}</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[.78fr_1.22fr]">
        <div className="space-y-5">
          <div className="panel">
            <div className="panel-header"><div><h3 className="panel-title">Intake patient</h3><p className="panel-subtitle">Informations nécessaires à confirmer</p></div><StatusPill tone="high">Revue requise</StatusPill></div>
            <div className="grid grid-cols-2 gap-3 px-5"><div className="field-card"><span>Référence</span><strong>{selectedCase.ref}</strong></div><div className="field-card"><span>Profil</span><strong>{selectedCase.initials} · {selectedCase.age} ans</strong></div><div className="field-card col-span-2"><span>Motif principal</span><strong>{selectedCase.complaint}</strong></div></div>
            <div className="px-5 pb-5 pt-4">
              <label className="text-[11px] font-bold text-[#526d70]">Notes cliniques structurées</label>
              <Textarea value={caseNote} onChange={event => setCaseNote(event.target.value)} className="mt-2 min-h-[120px] resize-none rounded-xl border-[#dfeae5] bg-[#fbfdfc] text-[12px] leading-5 text-[#466268] focus:border-[#78ad95] focus:ring-[#d8efe1]" />
              <label className="mt-4 block text-[11px] font-bold text-[#526d70]">Notes personnelles du médecin</label>
              <Textarea value={doctorNotes} onChange={event => setDoctorNotes(event.target.value)} placeholder="Ajoutez votre interprétation, les éléments validés ou les réserves…" className="mt-2 min-h-[84px] resize-none rounded-xl border-[#dfeae5] bg-[#fbfdfc] text-[12px] leading-5 text-[#466268] focus:border-[#78ad95] focus:ring-[#d8efe1]" />
              <label className="mt-4 block text-[11px] font-bold text-[#526d70]">Signature manuscrite de revue</label>
              <SignaturePad onChange={setSignature} />
            </div>
            <div className="border-t border-[#edf2ef] bg-[#fbfdfc] px-5 py-3"><div className="flex items-center gap-2 text-[10px] text-[#7d9693]"><LockKeyhole size={13} className="text-[#66a083]" /> Données dé-identifiées · la signature atteste la revue, pas l’automatisation de la décision</div></div>
          </div>

          <div className="panel">
            <div className="panel-header"><div><h3 className="panel-title">Hypothèses de travail</h3><p className="panel-subtitle">À discuter — aucune conclusion automatique</p></div><Stethoscope className="text-[#8ba8a4]" size={19} /></div>
            <div className="space-y-3 px-5 pb-5">{summary.differential.map((item, index) => <div key={item} className="recommendation-row"><div className="number-dot">0{index + 1}</div><div><div className="text-[12px] font-semibold text-[#3c5c63]">{item}</div><div className="mt-0.5 text-[11px] text-slate-400">Niveau de confiance à valider</div></div></div>)}</div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header"><div><h3 className="panel-title">Orchestration des agents</h3><p className="panel-subtitle">Progression en temps réel · sorties explicables</p></div>{completed ? <StatusPill tone="low"><CheckCircle2 size={13} className="mr-1" /> Prête pour revue</StatusPill> : <StatusPill tone="neutral">{isRunning ? "Exécution" : "En attente"}</StatusPill>}</div>
          <div className="px-5 pb-3"><div className="flex items-center justify-between text-[10px] font-bold text-[#7f9894]"><span>{isRunning ? "Les agents analysent le dossier…" : completed ? "Analyse terminée" : "Pipeline prêt à démarrer"}</span><span className="text-[#4e9a72]">{progress}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e8f1ed]"><div className="h-full rounded-full bg-[#7fbd99] transition-all duration-500" style={{ width: `${progress}%` }} /></div></div>
          <div className="px-5 pb-5"><div className="pipeline-line" />{agentBlueprint.map((agent: any, index: number) => { const Icon = agent.icon; const done = completed || agentStep > index; const running = isRunning && agentStep === index; return <div key={agent.key} className={cn("agent-row", done && "agent-row-done", running && "agent-row-running")}><div className="agent-icon">{done ? <Check size={15} /> : running ? <RefreshCw size={15} className="animate-spin" /> : <Icon size={15} />}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><div className="text-[12px] font-semibold">{agent.label}</div>{running && <span className="text-[10px] font-bold text-[#5ca07f]">en cours</span>}</div><div className="mt-0.5 text-[11px] text-slate-400">{agent.helper}</div></div><div className="text-right text-[10px] font-semibold text-slate-400">{done ? "Terminé" : running ? "Analyse…" : "File"}</div></div> })}</div>
          <div className="border-t border-[#edf2ef] bg-[#fbfdfc] px-5 py-4"><div className="flex items-start gap-3"><div className="mt-0.5 rounded-lg bg-[#fff6e7] p-1.5 text-[#b27b17]"><AlertTriangle size={14} /></div><div><div className="text-[11px] font-bold text-[#6c5b2e]">Point de contrôle clinique</div><p className="mt-1 text-[11px] leading-5 text-[#8b7a4a]">{completed ? "La synthèse est un brouillon explicable. Vérifiez les constantes, antécédents, traitements, allergies et protocoles locaux avant toute décision." : "L’agent s’arrêtera si une information critique manque. Aucune prescription automatique n’est générée."}</p></div></div></div>
        </div>
      </div>

      <div className="panel chat-panel">
        <div className="panel-header"><div><h3 className="panel-title">Questions à l’IA sur ce dossier</h3><p className="panel-subtitle">Posez une question complémentaire sur le raisonnement généré</p></div><MessageSquareText className="text-[#6ea287]" size={19} /></div>
        <div className="flex flex-wrap items-center gap-2 border-b border-[#edf2ef] bg-[#fbfdfc] px-5 py-3"><Button variant="outline" className="h-8 rounded-lg border-[#dce8e3] bg-white text-[10px]" onClick={startNewConversation}><PlusCircle size={13} className="mr-1.5" />Nouvelle conversation</Button><Button variant="outline" className="h-8 rounded-lg border-[#dce8e3] bg-white text-[10px]" onClick={() => setShowHistory(value => !value)}><History size={13} className="mr-1.5" />Historique ({conversations.data?.length ?? 0})</Button>{conversationId && <span className="ml-auto text-[10px] font-semibold text-[#6e9183]">Conversation active</span>}</div>
        {showHistory && <div className="conversation-history">{conversations.data?.length ? conversations.data.map(conversation => <button key={conversation.id} className={cn("conversation-history-row", conversation.id === conversationId && "conversation-history-row-active")} onClick={() => loadConversation(conversation.id)}><span className="conversation-history-icon"><MessageSquareText size={13} /></span><span className="min-w-0 flex-1 text-left"><strong>{conversation.title}</strong><small>{new Date(conversation.updatedAt).toLocaleString("fr-FR")}</small></span><ChevronRight size={14} /></button>) : <div className="px-4 py-5 text-[11px] text-slate-400">Aucune conversation sauvegardée pour ce dossier.</div>}</div>}
        <div className="px-5 pb-5"><AIChatBox messages={messages} onSendMessage={handleSend} onInsertAssistantMessage={insertAssistantAnswer} isLoading={ask.isPending} height={390} emptyStateMessage="Demandez une explication sur le triage, les hypothèses ou les données manquantes." suggestedPrompts={["Pourquoi ce niveau de gravité ?", "Quelles données manquent encore ?", "Quels examens faut-il discuter ?"]} /></div>
        <div className="border-t border-[#edf2ef] bg-[#fbfdfc] px-5 py-3"><div className="flex items-center gap-2 text-[10px] text-[#7d9693]"><ShieldCheck size={13} className="text-[#66a083]" /> Réponses contextualisées au dossier · validation médicale obligatoire</div></div>
      </div>
    </div>
  );
}


function SignaturePad({ onChange }: { onChange: (value: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const previousImageRef = useRef<ImageData | null>(null);
  const [hasSignature, setHasSignature] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const context = canvas.getContext("2d");
    if (context) {
      context.scale(ratio, ratio);
      context.strokeStyle = "#315f61";
      context.lineWidth = 2;
      context.lineCap = "round";
      context.lineJoin = "round";
    }
  }, []);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    const context = canvasRef.current?.getContext("2d");
    const canvas = canvasRef.current;
    if (context && canvas) previousImageRef.current = context.getImageData(0, 0, canvas.width, canvas.height);
    const { x, y } = point(event);
    context?.beginPath();
    context?.moveTo(x, y);
  };

  const draw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const context = canvasRef.current?.getContext("2d");
    const { x, y } = point(event);
    context?.lineTo(x, y);
    context?.stroke();
    setHasSignature(true);
  };

  const finish = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const canvas = canvasRef.current;
    if (canvas) onChange(canvas.toDataURL("image/png"));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    onChange("");
  };

  const cancel = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || !previousImageRef.current) return;
    context.putImageData(previousImageRef.current, 0, 0);
    previousImageRef.current = null;
    const hasContent = canvas.toDataURL("image/png").length > 1200;
    setHasSignature(hasContent);
    onChange(hasContent ? canvas.toDataURL("image/png") : "");
  };

  return <div className="signature-pad-wrap"><div className="signature-pad-header"><span><PenLine size={13} className="mr-1.5 inline" />Signez dans la zone</span><div className="flex items-center gap-3"><button type="button" onClick={cancel} disabled={!previousImageRef.current}><XCircle size={12} className="mr-1 inline" />Annuler</button><button type="button" onClick={clear} disabled={!hasSignature}><Eraser size={12} className="mr-1 inline" />Effacer tout</button></div></div><canvas ref={canvasRef} className="signature-pad" onPointerDown={start} onPointerMove={draw} onPointerUp={finish} onPointerCancel={finish} aria-label="Zone de signature manuscrite" /></div>;
}

function exportClinicalSummary(selectedCase: any, caseNote: string, doctorNotes: string, signature: string) {
  const doc = new jsPDF();
  const margin = 20;
  let y = 20;
  doc.setTextColor(23, 56, 74);
  doc.setFontSize(20);
  doc.text("MedPilot Clinical", margin, y);
  y += 9;
  doc.setFontSize(10);
  doc.setTextColor(91, 112, 112);
  doc.text("Synthèse clinique assistée · brouillon soumis à revue humaine", margin, y);
  y += 14;
  doc.setDrawColor(215, 231, 224);
  doc.line(margin, y, 190, y);
  y += 12;
  doc.setFontSize(13);
  doc.setTextColor(23, 56, 74);
  doc.text(`Dossier ${selectedCase.ref}`, margin, y);
  y += 8;
  doc.setFontSize(10);
  doc.setTextColor(72, 98, 104);
  const metadata = [`Patient dé-identifié : ${selectedCase.initials} · ${selectedCase.age} ans`, `Motif : ${selectedCase.complaint}`, `Date d’export : ${new Date().toLocaleString("fr-FR")}`];
  metadata.forEach(line => { doc.text(line, margin, y); y += 6; });
  y += 5;
  const sections = [{ title: "Notes cliniques", text: caseNote }, { title: "Notes personnelles du médecin", text: doctorNotes || "Aucune note personnelle ajoutée." }, { title: "Triage à confirmer", text: summary.triage }, { title: "Signaux à vérifier", text: summary.redFlags.join(" · ") }, { title: "Hypothèses de travail", text: summary.differential.join(" · ") }, { title: "Examens à considérer", text: summary.exams.join(" · ") }, { title: "Sécurité médicamenteuse", text: summary.safety.join(" · ") }, { title: "Signature de revue", text: signature.startsWith("data:image") ? "Signature manuscrite capturée dans l’interface." : "Signature non renseignée" }];
  sections.forEach(section => {
    doc.setFontSize(11);
    doc.setTextColor(43, 82, 95);
    doc.text(section.title, margin, y);
    y += 6;
    doc.setFontSize(9.5);
    doc.setTextColor(82, 105, 108);
    const lines = doc.splitTextToSize(section.text, 170);
    doc.text(lines, margin, y);
    y += Math.max(10, lines.length * 5 + 5);
    if (y > 270) { doc.addPage(); y = 20; }
  });
  if (signature.startsWith("data:image")) {
    if (y > 242) { doc.addPage(); y = 20; }
    doc.setFontSize(10);
    doc.setTextColor(43, 82, 95);
    doc.text("Signature manuscrite", margin, y);
    y += 5;
    doc.addImage(signature, "PNG", margin, y, 62, 22);
    y += 27;
  }
  doc.setFontSize(8.5);
  doc.setTextColor(140, 113, 67);
  doc.text(doc.splitTextToSize("Important : ce document est une aide à la décision. Il ne constitue ni un diagnostic définitif ni une prescription. Il doit être vérifié et validé par un professionnel habilité.", 170), margin, 276);
  doc.save(`medpilot-${selectedCase.ref}-synthese.pdf`);
}

function AgentsPanel({ agentStep, isRunning, completed, startAnalysis }: any) {
  return <div className="space-y-5"><div className="panel hero-panel"><div><div className="eyebrow"><BrainCircuit size={14} /> Architecture multi-agents</div><h2 className="mt-3 max-w-2xl font-display text-[30px] font-semibold tracking-[-.045em] text-[#17384a]">Un raisonnement distribué, une décision toujours humaine.</h2><p className="mt-3 max-w-2xl text-[13px] leading-6 text-[#708786]">MedPilot sépare les responsabilités : intake, sécurité, symptômes, hypothèses, examens et synthèse. Cette séparation réduit les angles morts et rend chaque sortie révisable.</p><Button className="mt-5 h-9 rounded-lg bg-[#17384a] text-[11px]" onClick={startAnalysis}><Sparkles size={14} className="mr-2" />Tester le pipeline démo</Button></div><div className="hero-orbit"><div className="orbit-ring orbit-ring-one" /><div className="orbit-ring orbit-ring-two" /><div className="orbit-core"><HeartPulse size={28} /></div><div className="orbit-label">human<br /><span>in the loop</span></div></div></div><div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{agentBlueprint.map((agent, index) => { const Icon = agent.icon; const done = completed || agentStep > index; const running = isRunning && agentStep === index; return <div className={cn("agent-card", running && "agent-card-running", done && "agent-card-done")} key={agent.key}><div className="flex items-start justify-between"><div className="agent-card-icon"><Icon size={18} /></div>{done ? <CheckCircle2 size={17} className="text-[#62a584]" /> : running ? <RefreshCw size={16} className="animate-spin text-[#62a584]" /> : <span className="h-2 w-2 rounded-full bg-slate-200" />}</div><h3 className="mt-5 text-[13px] font-bold text-[#294c5b]">{agent.label}</h3><p className="mt-1 text-[11px] leading-5 text-slate-400">{agent.helper}</p><div className="mt-4 border-t border-[#edf2ef] pt-3 text-[10px] font-semibold text-slate-400">{done ? "Dernière exécution · 09:39" : running ? "Exécution en cours" : "En attente"}</div></div> })}</div></div>;
}

function AuditPanel() {
  const audit = [{ time: "09:41:12", event: "review_required", detail: "Cas MP-2048 marqué pour revue clinique", actor: "système" }, { time: "09:40:52", event: "agent.completed", detail: "Analyse des symptômes · confiance 78%", actor: "agent.symptoms" }, { time: "09:40:31", event: "data.missing", detail: "Allergies et traitements en cours à confirmer", actor: "safety.agent" }, { time: "09:39:18", event: "case.opened", detail: "Dossier MP-2048 ouvert par Dr. Martin", actor: "dr.martin" }, { time: "09:21:04", event: "policy.check", detail: "Aucune suggestion de prescription automatique", actor: "policy.guard" }];
  return <div className="space-y-5"><div className="panel hero-panel"><div><div className="eyebrow"><ShieldCheck size={14} /> Gouvernance & conformité</div><h2 className="mt-3 max-w-2xl font-display text-[29px] font-semibold tracking-[-.045em] text-[#17384a]">La confiance se construit dans la trace.</h2><p className="mt-3 max-w-2xl text-[13px] leading-6 text-[#708786]">Chaque appel d’agent, recommandation et blocage est consigné. Le journal supporte la revue de qualité, les investigations et la validation des protocoles.</p></div><div className="compliance-score"><div className="text-[10px] font-bold uppercase tracking-[.15em] text-[#7aa48c]">Score de couverture</div><div className="mt-2 font-display text-[39px] font-semibold tracking-[-.06em] text-[#1d5b4d]">98<span className="text-[20px]">%</span></div><div className="mt-1 text-[11px] text-[#71918a]">règles actives</div></div></div><div className="panel"><div className="panel-header"><div><h3 className="panel-title">Journal immuable</h3><p className="panel-subtitle">Événements récents · fuseau Europe/Paris</p></div><Button variant="outline" className="h-8 rounded-lg border-[#dce8e3] bg-white text-[11px]"><FileSearch size={14} className="mr-2" />Exporter</Button></div><div className="overflow-x-auto"><table className="w-full min-w-[680px]"><thead><tr className="border-b border-[#edf2ef] text-left"><th className="table-head">Heure</th><th className="table-head">Événement</th><th className="table-head">Détail</th><th className="table-head">Acteur</th></tr></thead><tbody>{audit.map(item => <tr className="case-row" key={item.time}><td className="table-cell font-mono text-[11px] text-slate-400">{item.time}</td><td className="table-cell"><span className="rounded-md bg-[#edf6f1] px-2 py-1 font-mono text-[10px] font-bold text-[#54846c]">{item.event}</span></td><td className="table-cell text-[12px] text-[#526d70]">{item.detail}</td><td className="table-cell text-[11px] text-slate-400">{item.actor}</td></tr>)}</tbody></table></div></div></div>;
}
