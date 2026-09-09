import { useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Info,
  Loader2,
  MapPin,
  Search,
  Stethoscope,
  XCircle,
} from "lucide-react";
import { useLocation } from "wouter";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const dayNames = [
  "Dimanche",
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
];
const weekdayOptions = [
  "Dimanche",
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
];

function startOfUtcWeek(date: Date) {
  const value = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  value.setUTCDate(value.getUTCDate() - value.getUTCDay());
  return value;
}
function addUtcDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}
function formatDay(date: Date) {
  return date.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}
function formatTime(date: Date) {
  return date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}
function utcDateWithMinutes(day: Date, minute: number) {
  return new Date(
    Date.UTC(
      day.getUTCFullYear(),
      day.getUTCMonth(),
      day.getUTCDate(),
      Math.floor(minute / 60),
      minute % 60
    )
  );
}

export default function CalendarPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth({ redirectOnUnauthenticated: true });
  const [selectedDoctorId, setSelectedDoctorId] = useState<
    number | undefined
  >();
  const [selectedDay, setSelectedDay] = useState(() => new Date());
  const [weekStart, setWeekStart] = useState(() => startOfUtcWeek(new Date()));
  const [selectedSlot, setSelectedSlot] = useState<{
    startsAt: Date;
    endsAt: Date;
  } | null>(null);
  const [reason, setReason] = useState("");
  const [availabilityWeekday, setAvailabilityWeekday] = useState("1");
  const [availabilityStart, setAvailabilityStart] = useState("09:00");
  const [availabilityEnd, setAvailabilityEnd] = useState("17:00");
  const [slotDuration, setSlotDuration] = useState("30");
  const [doctorSearch, setDoctorSearch] = useState("");
  const doctors = trpc.calendar.doctors.useQuery({});
  const currentDoctor = doctors.data?.find(item => item.user.id === user?.id);
  const selectedDoctor = doctors.data?.find(
    item => item.user.id === selectedDoctorId
  );
  const range = useMemo(
    () => ({ from: weekStart, to: addUtcDays(weekStart, 7) }),
    [weekStart]
  );
  const schedule = trpc.calendar.schedule.useQuery(
    { doctorUserId: selectedDoctorId ?? 0, from: range.from, to: range.to },
    { enabled: Boolean(selectedDoctorId) }
  );
  const appointmentRange = useMemo(
    () => ({
      from: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30),
      to: new Date(Date.now() + 1000 * 60 * 60 * 24 * 180),
    }),
    []
  );
  const appointments = trpc.calendar.appointments.useQuery(appointmentRange, {
    enabled: Boolean(user),
  });
  const utils = trpc.useUtils();
  const book = trpc.calendar.book.useMutation({
    onSuccess: () => {
      setSelectedSlot(null);
      setReason("");
      void utils.calendar.schedule.invalidate();
      void utils.calendar.appointments.invalidate();
      toast.success("Demande de rendez-vous envoyée au médecin.");
    },
    onError: error => toast.error(error.message),
  });
  const cancel = trpc.calendar.updateStatus.useMutation({
    onSuccess: () => {
      void utils.calendar.schedule.invalidate();
      void utils.calendar.appointments.invalidate();
      toast.success("Rendez-vous annulé.");
    },
    onError: error => toast.error(error.message),
  });
  const saveAvailability = trpc.calendar.setAvailability.useMutation({
    onSuccess: () => {
      void utils.calendar.schedule.invalidate();
      toast.success("Disponibilité enregistrée.");
    },
    onError: error => toast.error(error.message),
  });

  const slots = useMemo(() => {
    if (!schedule.data) return [];
    const booked = schedule.data.appointments;
    const day = new Date(
      Date.UTC(
        selectedDay.getUTCFullYear(),
        selectedDay.getUTCMonth(),
        selectedDay.getUTCDate()
      )
    );
    return schedule.data.availabilities
      .flatMap(window => {
        if (window.weekday !== day.getUTCDay()) return [];
        const items: Array<{
          startsAt: Date;
          endsAt: Date;
          available: boolean;
          unavailableReason: "past" | "booked" | null;
        }> = [];
        for (
          let minute = window.startMinute;
          minute + window.slotDuration <= window.endMinute;
          minute += window.slotDuration
        ) {
          const startsAt = utcDateWithMinutes(day, minute);
          const endsAt = utcDateWithMinutes(day, minute + window.slotDuration);
          const isBooked = booked.some(
            item =>
              new Date(item.startsAt) < endsAt &&
              new Date(item.endsAt) > startsAt
          );
          const isPast = startsAt <= new Date();
          items.push({
            startsAt,
            endsAt,
            available: !isBooked && !isPast,
            unavailableReason: isBooked ? "booked" : isPast ? "past" : null,
          });
        }
        return items;
      })
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  }, [schedule.data, selectedDay]);

  const patientAppointments =
    appointments.data?.filter(item => item.patientUserId === user?.id) ?? [];
  const visibleDoctors =
    doctors.data?.filter(item =>
      `${item.user.name || ""} ${item.user.email || ""} ${item.profile?.specialty || ""}`
        .toLowerCase()
        .includes(doctorSearch.toLowerCase())
    ) ?? [];
  if (!user) return <div className="account-loading">Connexion sécurisée…</div>;

  const selectDay = (date?: Date) => {
    if (!date) return;
    setSelectedDay(date);
    const nextWeek = startOfUtcWeek(date);
    if (nextWeek.getTime() !== weekStart.getTime()) setWeekStart(nextWeek);
    setSelectedSlot(null);
  };
  const changeWeek = (offset: number) => {
    const next = addUtcDays(weekStart, offset * 7);
    setWeekStart(next);
    setSelectedDay(addUtcDays(next, Math.min(weekStart.getUTCDay(), 6)));
    setSelectedSlot(null);
  };
  const submitAvailability = () => {
    if (!currentDoctor) return;
    const [startHour, startMinute] = availabilityStart.split(":").map(Number);
    const [endHour, endMinute] = availabilityEnd.split(":").map(Number);
    saveAvailability.mutate({
      doctorUserId: currentDoctor.user.id,
      weekday: Number(availabilityWeekday),
      startMinute: startHour * 60 + startMinute,
      endMinute: endHour * 60 + endMinute,
      slotDuration: Number(slotDuration),
    });
  };

  return (
    <main className="calendar-page">
      <header className="account-header">
        <button className="account-brand" onClick={() => navigate("/app")}>
          <span className="brand-mark">
            <Stethoscope size={18} />
          </span>
          <span>
            <strong>MedPilot</strong>
            <small>Rendez-vous sécurisés</small>
          </span>
        </button>
        <Button
          variant="outline"
          className="h-9 rounded-xl border-[#dce8e3] bg-white text-[11px]"
          onClick={() => navigate("/app")}
        >
          <ArrowLeft size={14} className="mr-1.5" />
          Retour au cockpit
        </Button>
      </header>
      <div className="calendar-content">
        <div className="calendar-kicker">
          <CalendarDays size={14} /> Parcours patient · rendez-vous
        </div>
        <div className="mt-3 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <h1 className="account-title">
              Choisissez un médecin, puis un créneau.
            </h1>
            <p className="mt-3 max-w-2xl text-[13px] leading-6 text-[#718a87]">
              Les créneaux proposés correspondent aux disponibilités déclarées
              par les médecins. La demande est enregistrée et le médecin reçoit
              une alerte.
            </p>
          </div>
          <div className="calendar-safety">
            <Info size={14} /> Les rendez-vous ne remplacent pas les urgences
            médicales.
          </div>
        </div>
        <div className="calendar-layout mt-8">
          <section className="account-panel calendar-doctor-panel">
            <div className="account-panel-heading">
              <div>
                <h2>1. Médecin</h2>
                <p>Les spécialistes disponibles dans votre réseau.</p>
              </div>
              <Stethoscope size={19} />
            </div>
            <div className="px-5 pb-3">
              <div className="flex items-center gap-2 rounded-lg border border-[#dfeae5] bg-[#fbfdfc] px-3 py-2 text-slate-400">
                <Search size={14} />
                <input value={doctorSearch} onChange={event => setDoctorSearch(event.target.value)} className="w-full bg-transparent text-[11px] outline-none" placeholder="Rechercher un médecin ou une spécialité" aria-label="Rechercher un médecin" />
              </div>
            </div>
            <div className="doctor-list">
              {doctors.isLoading ? (
                <div className="account-empty">
                  <Loader2 className="mr-2 inline animate-spin" size={14} />
                  Chargement des médecins…
                </div>
              ) : visibleDoctors.length ? (
                visibleDoctors.map(item => (
                  <button
                    key={item.user.id}
                    className={`doctor-card ${selectedDoctorId === item.user.id ? "doctor-card-active" : ""}`}
                    onClick={() => {
                      setSelectedDoctorId(item.user.id);
                      setSelectedSlot(null);
                    }}
                  >
                    <span className="doctor-avatar">
                      {(item.user.name || "DR").slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1 text-left">
                      <strong>
                        {item.user.name || item.user.email || "Médecin"}
                      </strong>
                      <small>
                        {item.profile?.specialty || "Spécialiste MedPilot"}
                      </small>
                    </span>
                    <span className="doctor-status">Disponible</span>
                  </button>
                ))
              ) : (
                <div className="account-empty">{doctors.data?.length ? "Aucun médecin ne correspond à votre recherche." : "Aucun médecin n’est encore enregistré. Les cliniques peuvent ajouter des spécialistes depuis l’espace compte."}</div>
              )}
            </div>
          </section>
          <section className="account-panel calendar-booking-panel">
            <div className="account-panel-heading">
              <div>
                <h2>2. Date et créneau</h2>
                <p>
                  {selectedDoctor
                    ? `Planning de ${selectedDoctor.user.name || "votre médecin"}`
                    : "Sélectionnez d’abord un médecin"}
                </p>
              </div>
              <Clock3 size={19} />
            </div>
            <div className="calendar-picker-wrap">
              <div>
                <Calendar
                  mode="single"
                  selected={selectedDay}
                  onSelect={selectDay}
                  weekStartsOn={1}
                  disabled={{ before: new Date() }}
                  className="rounded-xl border border-[#e1ebe7] bg-white"
                />
              </div>
              <div className="slot-area">
                <div className="slot-week-nav">
                  <Button
                    variant="outline"
                    className="h-8 rounded-lg border-[#dce8e3] bg-white text-[10px]"
                    onClick={() => changeWeek(-1)}
                  >
                    Semaine précédente
                  </Button>
                  <span>
                    {formatDay(weekStart)} –{" "}
                    {formatDay(addUtcDays(weekStart, 6))}
                  </span>
                  <Button
                    variant="outline"
                    className="h-8 rounded-lg border-[#dce8e3] bg-white text-[10px]"
                    onClick={() => changeWeek(1)}
                  >
                    Semaine suivante
                  </Button>
                </div>
                {selectedDoctor ? (
                  <div className="slot-grid">
                    {slots.length ? (
                      slots.map(slot => (
                        <button
                          key={slot.startsAt.toISOString()}
                          disabled={!slot.available}
                          className={`slot-button ${selectedSlot?.startsAt.getTime() === slot.startsAt.getTime() ? "slot-button-selected" : ""} ${!slot.available ? "slot-button-booked" : ""}`}
                          onClick={() =>
                            slot.available && setSelectedSlot(slot)
                          }
                        >
                          <Clock3 size={13} />
                          {formatTime(slot.startsAt)}
                          {!slot.available && <small>{slot.unavailableReason === "past" ? "Passé" : "Réservé"}</small>}
                        </button>
                      ))
                    ) : (
                      <div className="account-empty">
                        Aucun créneau configuré pour cette date.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="account-empty">
                    Choisissez un médecin pour voir ses disponibilités.
                  </div>
                )}
              </div>
            </div>
            {selectedSlot && selectedDoctor && (
              <div className="booking-confirm">
                <div>
                  <strong>
                    {formatDay(selectedSlot.startsAt)} ·{" "}
                    {formatTime(selectedSlot.startsAt)}
                  </strong>
                  <small>
                    Durée :{" "}
                    {Math.round(
                      (selectedSlot.endsAt.getTime() -
                        selectedSlot.startsAt.getTime()) /
                        60000
                    )}{" "}
                    minutes avec {selectedDoctor.user.name || "le médecin"}
                  </small>
                </div>
                <Input
                  value={reason}
                  onChange={event => setReason(event.target.value)}
                  placeholder="Motif facultatif"
                />
                <Button
                  className="h-9 rounded-lg bg-[#17384a] text-[11px]"
                  disabled={book.isPending || user.role !== "patient"}
                  onClick={() =>
                    book.mutate({
                      doctorUserId: selectedDoctor.user.id,
                      startsAt: selectedSlot.startsAt,
                      endsAt: selectedSlot.endsAt,
                      reason: reason || undefined,
                    })
                  }
                >
                  {book.isPending ? "Envoi…" : "Demander ce créneau"}
                </Button>
                {user.role !== "patient" && (
                  <span className="text-[10px] text-[#a66b00]">
                    Connectez un compte patient pour réserver.
                  </span>
                )}
              </div>
            )}
          </section>
        </div>
        <section className="account-panel mt-5">
          <div className="account-panel-heading">
            <div>
              <h2>Mes rendez-vous</h2>
              <p>Historique des demandes et consultations à venir.</p>
            </div>
            <CalendarDays size={19} />
          </div>
          {patientAppointments.length ? (
            <div className="account-list">
              {patientAppointments.map(item => (
                <div className="account-list-row" key={item.id}>
                  <span className="account-list-icon">
                    <CalendarDays size={14} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <strong>
                      {new Date(item.startsAt).toLocaleString("fr-FR")} ·{" "}
                      {item.reason || "Consultation"}
                    </strong>
                    <small>
                      Statut :{" "}
                      {item.status === "requested"
                        ? "Demande envoyée"
                        : item.status === "confirmed"
                          ? "Confirmé"
                          : item.status}
                    </small>
                  </div>
                  <span className="account-list-status">
                    {item.status === "confirmed" ? "Confirmé" : "En attente"}
                  </span>
                  {["requested", "confirmed"].includes(item.status) && (
                    <Button variant="outline" className="h-8 rounded-lg border-[#f0c9c3] px-2 text-[10px] text-[#b9483e]" disabled={cancel.isPending} onClick={() => cancel.mutate({ appointmentId: item.id, status: "cancelled" })}>
                      <XCircle size={13} className="mr-1" />Annuler
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="account-empty">
              Aucun rendez-vous patient sur cette période.
            </div>
          )}
        </section>
        {currentDoctor && (
          <section className="account-panel mt-5">
            <div className="account-panel-heading">
              <div>
                <h2>Mes disponibilités médecin</h2>
                <p>
                  Déclarez une fenêtre récurrente pour permettre les
                  réservations.
                </p>
              </div>
              <Clock3 size={19} />
            </div>
            <div className="availability-form">
              <label>
                Jour
                <select
                  value={availabilityWeekday}
                  onChange={event => setAvailabilityWeekday(event.target.value)}
                >
                  {weekdayOptions.map((day, index) => (
                    <option key={day} value={index}>
                      {day}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Début
                <Input
                  type="time"
                  value={availabilityStart}
                  onChange={event => setAvailabilityStart(event.target.value)}
                />
              </label>
              <label>
                Fin
                <Input
                  type="time"
                  value={availabilityEnd}
                  onChange={event => setAvailabilityEnd(event.target.value)}
                />
              </label>
              <label>
                Durée
                <select
                  value={slotDuration}
                  onChange={event => setSlotDuration(event.target.value)}
                >
                  <option value="15">15 min</option>
                  <option value="30">30 min</option>
                  <option value="45">45 min</option>
                  <option value="60">60 min</option>
                </select>
              </label>
              <Button
                className="h-9 self-end rounded-lg bg-[#17384a] text-[11px]"
                onClick={submitAvailability}
              >
                <CheckCircle2 size={14} className="mr-2" />
                Enregistrer
              </Button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
