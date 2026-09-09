import { and, desc, eq, gt, gte, inArray, isNull, lt, ne, or } from "drizzle-orm";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import {
  agentRuns,
  appointments,
  auditEvents,
  caseShares,
  clinicalCases,
  clinicalChatMessages,
  clinicalConversations,
  clinicalRecommendations,
  consultations,
  doctorAvailabilities,
  InsertUser,
  users,
  userProfiles,
  organizations,
  organizationMembers,
  notifications,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { randomUUID } from "node:crypto";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(postgres(process.env.DATABASE_URL));
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const fields = ["name", "email", "loginMethod", "stripeCustomerId", "stripeSubscriptionId"] as const;
  for (const field of fields) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  values.lastSignedIn ??= new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onConflictDoUpdate({ target: users.openId, set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

export async function listUsersForAdmin() {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: users.id, name: users.name, email: users.email, role: users.role, loginMethod: users.loginMethod, createdAt: users.createdAt }).from(users).orderBy(desc(users.createdAt)).limit(500);
}

export async function updateUserRole(userId: number, role: "user" | "patient" | "doctor" | "clinic" | "client" | "admin") {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(users).set({ role }).where(eq(users.id, userId));
  return getUserById(userId);
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result[0];
}

export async function createLocalUser(input: { email: string; name: string; passwordHash: string; role: "patient" | "client" }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const existing = await getUserByEmail(input.email);
  if (existing) throw new Error("Un compte existe déjà avec cet e-mail");
  const openId = `local_${randomUUID()}`;
  await db.insert(users).values({ ...input, openId, loginMethod: "local" });
  return getUserByOpenId(openId);
}

export async function saveStripeIdentifiers(userId: number, identifiers: { customerId?: string; subscriptionId?: string | null }) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({
    ...(identifiers.customerId ? { stripeCustomerId: identifiers.customerId } : {}),
    ...(identifiers.subscriptionId !== undefined ? { stripeSubscriptionId: identifiers.subscriptionId } : {}),
  }).where(eq(users.id, userId));
}

export async function findUserByStripeCustomerId(customerId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.stripeCustomerId, customerId)).limit(1);
  return result[0];
}

export async function getAccountSnapshot(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const user = await getUserById(userId);
  if (!user) return undefined;
  const profileRows = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
  const memberships = await db.select().from(organizationMembers).where(eq(organizationMembers.userId, userId));
  const organizationRows = memberships.length
    ? await Promise.all(memberships.map(member => db.select().from(organizations).where(eq(organizations.id, member.organizationId)).limit(1)))
    : [];
  const patientConsultations = await db.select().from(consultations)
    .where(eq(consultations.patientUserId, userId)).orderBy(desc(consultations.updatedAt)).limit(50);
  const doctorConsultations = user.role === "doctor"
    ? await db.select().from(consultations).where(eq(consultations.doctorUserId, userId)).orderBy(desc(consultations.updatedAt)).limit(50)
    : [];
  const organizationConsultations = memberships.length && ["clinic", "client", "admin"].includes(user.role)
    ? await db.select().from(consultations).where(inArray(consultations.clinicOrganizationId, memberships.map(member => member.organizationId))).orderBy(desc(consultations.updatedAt)).limit(50)
    : [];
  const { passwordHash: _passwordHash, ...publicUser } = user;
  return {
    user: publicUser,
    profile: profileRows[0],
    memberships: memberships.map((member, index) => ({ ...member, organization: organizationRows[index]?.[0] })),
    consultations: [...patientConsultations, ...doctorConsultations, ...organizationConsultations].filter((item, index, all) => all.findIndex(candidate => candidate.id === item.id) === index),
  };
}

export async function saveAccountProfile(input: {
  userId: number;
  role: "patient" | "doctor" | "clinic" | "client" | "user";
  phone?: string;
  specialty?: string;
  licenseNumber?: string;
  organizationName?: string;
  address?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const profile = {
    userId: input.userId,
    phone: input.phone || null,
    specialty: input.specialty || null,
    licenseNumber: input.licenseNumber || null,
    organizationName: input.organizationName || null,
    address: input.address || null,
  };
  await db.insert(userProfiles).values(profile).onConflictDoUpdate({ target: userProfiles.userId, set: { ...profile, updatedAt: new Date() } });
  return getAccountSnapshot(input.userId);
}

export async function createOrganization(input: { name: string; type: "clinic" | "client"; createdBy: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.insert(organizations).values(input).returning({ id: organizations.id });
  const id = result[0].id;
  await db.insert(organizationMembers).values({ organizationId: id, userId: input.createdBy, membershipRole: "owner" });
  return id;
}

export async function listDirectoryMembers(organizationId: number, userId: number) {
  const db = await getDb();
  if (!db) return [];
  const membership = await db.select().from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, userId))).limit(1);
  if (!membership[0]) return [];
  const members = await db.select().from(organizationMembers).where(eq(organizationMembers.organizationId, organizationId));
  return Promise.all(members.map(async member => {
    const user = await getUserById(member.userId);
    const profile = (await db.select().from(userProfiles).where(eq(userProfiles.userId, member.userId)).limit(1))[0];
    return { membership: member, user, profile };
  }));
}

export async function addOrganizationMember(input: { organizationId: number; requesterId: number; email: string; membershipRole: "doctor" | "patient" | "staff" }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const requesterMembership = await db.select().from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, input.organizationId), eq(organizationMembers.userId, input.requesterId))).limit(1);
  if (requesterMembership[0]?.membershipRole !== "owner") throw new Error("Seul le propriétaire de l’organisation peut ajouter un membre");
  const target = await getUserByEmail(input.email);
  if (!target) throw new Error("Aucun compte trouvé avec cet e-mail");
  await db.insert(organizationMembers).values({ organizationId: input.organizationId, userId: target.id, membershipRole: input.membershipRole });
  return target;
}

export async function createConsultation(input: { patientUserId: number; requesterId: number; doctorUserId?: number; clinicOrganizationId?: number; caseId?: number; scheduledAt?: Date; summary?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const requester = await getUserById(input.requesterId);
  if (!requester || (!["patient", "doctor", "clinic", "admin"].includes(requester.role))) throw new Error("Profil non autorisé à créer une consultation");
  if (requester.role === "patient" && requester.id !== input.patientUserId) throw new Error("Un patient ne peut créer une consultation que pour son propre compte");
  const result = await db.insert(consultations).values({
    patientUserId: input.patientUserId,
    doctorUserId: input.doctorUserId,
    clinicOrganizationId: input.clinicOrganizationId,
    caseId: input.caseId,
    scheduledAt: input.scheduledAt,
    summary: input.summary,
    status: input.scheduledAt ? "scheduled" : "requested",
  }).returning({ id: consultations.id });
  const id = result[0].id;
  await db.insert(auditEvents).values({ actorId: input.requesterId, eventType: "consultation.created", metadata: JSON.stringify({ consultationId: id, patientUserId: input.patientUserId }) });
  return id;
}

export async function listClinicalCases() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(clinicalCases).orderBy(desc(clinicalCases.updatedAt)).limit(50);
}

export async function createClinicalCase(input: {
  patientRef: string;
  initials: string;
  age: number;
  sex: "female" | "male" | "other" | "unknown";
  chiefComplaint: string;
  symptoms: string;
  createdBy?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.insert(clinicalCases).values({ ...input, status: "new", acuity: "medium" }).returning({ id: clinicalCases.id });
  const id = result[0].id;
  await db.insert(auditEvents).values({ caseId: id, actorId: input.createdBy, eventType: "case.created", metadata: JSON.stringify({ patientRef: input.patientRef }) });
  return id;
}

export async function getClinicalCase(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const cases = await db.select().from(clinicalCases).where(eq(clinicalCases.id, id)).limit(1);
  if (!cases[0]) return undefined;
  const [agents, recommendations] = await Promise.all([
    db.select().from(agentRuns).where(eq(agentRuns.caseId, id)).orderBy(agentRuns.id),
    db.select().from(clinicalRecommendations).where(eq(clinicalRecommendations.caseId, id)).orderBy(desc(clinicalRecommendations.createdAt)),
  ]);
  return { ...cases[0], agents, recommendations };
}

export async function persistAgentRun(input: {
  caseId: number;
  agentKey: string;
  status: "completed" | "blocked" | "failed";
  confidence?: number;
  output?: string;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(agentRuns).values({ ...input, startedAt: new Date(), completedAt: new Date() });
}

export async function persistRecommendation(input: {
  caseId: number;
  recommendationType: "triage" | "exam" | "medication_safety" | "follow_up";
  title: string;
  detail: string;
  priority: "routine" | "soon" | "urgent";
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(clinicalRecommendations).values({ ...input, requiresReview: 1 });
}

export async function appendAuditEvent(input: { caseId?: number; actorId?: number; eventType: string; metadata?: unknown }) {
  const db = await getDb();
  if (!db) return;
  await db.insert(auditEvents).values({ ...input, metadata: input.metadata ? JSON.stringify(input.metadata) : undefined });
}

export async function listClinicalConversations(caseId: number, ownerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(clinicalConversations)
    .where(and(eq(clinicalConversations.caseId, caseId), eq(clinicalConversations.ownerId, ownerId)))
    .orderBy(desc(clinicalConversations.updatedAt));
}

export async function getClinicalConversation(id: number, ownerId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const conversations = await db.select().from(clinicalConversations)
    .where(and(eq(clinicalConversations.id, id), eq(clinicalConversations.ownerId, ownerId))).limit(1);
  if (!conversations[0]) return undefined;
  const messages = await db.select().from(clinicalChatMessages)
    .where(eq(clinicalChatMessages.conversationId, id)).orderBy(clinicalChatMessages.id);
  return { ...conversations[0], messages };
}

export async function createClinicalConversation(input: { caseId: number; ownerId: number; title: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.insert(clinicalConversations).values(input).returning({ id: clinicalConversations.id });
  return result[0].id;
}

export async function appendClinicalChatMessages(conversationId: number, messages: Array<{ role: "user" | "assistant"; content: string }>) {
  const db = await getDb();
  if (!db || messages.length === 0) return;
  await db.insert(clinicalChatMessages).values(messages.map(message => ({ ...message, conversationId })));
  await db.update(clinicalConversations).set({ updatedAt: new Date() }).where(eq(clinicalConversations.id, conversationId));
}

async function getOrganizationMembership(organizationId: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, userId))).limit(1);
  return rows[0];
}

export async function listDoctorDirectory(organizationId?: number) {
  const db = await getDb();
  if (!db) return [];
  const doctorRows = organizationId
    ? await db.select().from(organizationMembers).where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.membershipRole, "doctor")))
    : [];
  const doctorIds = doctorRows.length ? doctorRows.map(row => row.userId) : undefined;
  const doctors = doctorIds?.length
    ? await db.select().from(users).where(inArray(users.id, doctorIds))
    : await db.select().from(users).where(eq(users.role, "doctor"));
  return Promise.all(doctors.map(async doctor => {
    const profile = (await db.select().from(userProfiles).where(eq(userProfiles.userId, doctor.id)).limit(1))[0];
    return { user: doctor, profile, membership: doctorRows.find(row => row.userId === doctor.id) };
  }));
}

export async function getDoctorSchedule(input: { doctorUserId: number; requesterId: number; from: Date; to: Date; clinicOrganizationId?: number }) {
  const db = await getDb();
  if (!db) return { doctor: undefined, profile: undefined, availabilities: [], appointments: [] };
  if (input.clinicOrganizationId) {
    const requesterMembership = await getOrganizationMembership(input.clinicOrganizationId, input.requesterId);
    if (!requesterMembership) throw new Error("Accès au planning non autorisé");
  }
  const doctor = await getUserById(input.doctorUserId);
  if (!doctor || doctor.role !== "doctor") throw new Error("Médecin introuvable");
  const profile = (await db.select().from(userProfiles).where(eq(userProfiles.userId, input.doctorUserId)).limit(1))[0];
  const availability = await db.select().from(doctorAvailabilities).where(and(
    eq(doctorAvailabilities.doctorUserId, input.doctorUserId),
    eq(doctorAvailabilities.active, 1),
    input.clinicOrganizationId ? eq(doctorAvailabilities.clinicOrganizationId, input.clinicOrganizationId) : undefined,
  ));
  const booked = await db.select().from(appointments).where(and(
    eq(appointments.doctorUserId, input.doctorUserId),
    gte(appointments.startsAt, input.from),
    lt(appointments.startsAt, input.to),
    or(eq(appointments.status, "requested"), eq(appointments.status, "confirmed")),
  )).orderBy(appointments.startsAt);
  return { doctor, profile, availabilities: availability, appointments: booked };
}

export async function saveDoctorAvailability(input: { doctorUserId: number; requesterId: number; clinicOrganizationId?: number; weekday: number; startMinute: number; endMinute: number; slotDuration: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const requester = await getUserById(input.requesterId);
  if (!requester || (requester.id !== input.doctorUserId && requester.role !== "admin")) throw new Error("Seul le médecin peut modifier ses disponibilités");
  if (input.weekday < 0 || input.weekday > 6 || input.startMinute < 0 || input.endMinute > 1440 || input.endMinute <= input.startMinute || input.slotDuration < 15 || input.slotDuration > 120) throw new Error("Fenêtre de disponibilité invalide");
  if (input.clinicOrganizationId && !(await getOrganizationMembership(input.clinicOrganizationId, input.requesterId))) throw new Error("Vous ne faites pas partie de cette clinique");
  await db.delete(doctorAvailabilities).where(and(
    eq(doctorAvailabilities.doctorUserId, input.doctorUserId),
    eq(doctorAvailabilities.weekday, input.weekday),
    input.clinicOrganizationId ? eq(doctorAvailabilities.clinicOrganizationId, input.clinicOrganizationId) : isNull(doctorAvailabilities.clinicOrganizationId),
  ));
  const result = await db.insert(doctorAvailabilities).values({ doctorUserId: input.doctorUserId, clinicOrganizationId: input.clinicOrganizationId, weekday: input.weekday, startMinute: input.startMinute, endMinute: input.endMinute, slotDuration: input.slotDuration, active: 1 }).returning({ id: doctorAvailabilities.id });
  return result[0].id;
}

export async function bookAppointment(input: { requesterId: number; patientUserId?: number; doctorUserId: number; clinicOrganizationId?: number; startsAt: Date; endsAt: Date; reason?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  if (input.endsAt <= input.startsAt) throw new Error("La durée du rendez-vous est invalide");
  if (input.startsAt <= new Date()) throw new Error("Un rendez-vous doit être réservé dans le futur");
  const requester = await getUserById(input.requesterId);
  if (!requester) throw new Error("Session utilisateur introuvable");
  const patientUserId = input.patientUserId ?? (requester.role === "patient" ? requester.id : undefined);
  if (!patientUserId) throw new Error("Un patient doit être sélectionné");
  if (requester.role === "patient" && patientUserId !== requester.id) throw new Error("Un patient ne peut réserver que pour son propre compte");
  if (!["patient", "doctor", "clinic", "admin"].includes(requester.role)) throw new Error("Profil non autorisé à réserver");
  if (input.clinicOrganizationId && !(await getOrganizationMembership(input.clinicOrganizationId, requester.id))) throw new Error("Vous ne faites pas partie de cette clinique");
  const weekday = input.startsAt.getUTCDay();
  const startMinute = input.startsAt.getUTCHours() * 60 + input.startsAt.getUTCMinutes();
  const endMinute = input.endsAt.getUTCHours() * 60 + input.endsAt.getUTCMinutes();
  const windows = await db.select().from(doctorAvailabilities).where(and(
    eq(doctorAvailabilities.doctorUserId, input.doctorUserId),
    eq(doctorAvailabilities.weekday, weekday),
    eq(doctorAvailabilities.active, 1),
    input.clinicOrganizationId ? eq(doctorAvailabilities.clinicOrganizationId, input.clinicOrganizationId) : undefined,
  ));
  if (!windows.some(window => startMinute >= window.startMinute && endMinute <= window.endMinute && (endMinute - startMinute) <= window.slotDuration)) throw new Error("Ce créneau n’est pas disponible selon le planning du médecin");
  const overlap = await db.select().from(appointments).where(and(
    eq(appointments.doctorUserId, input.doctorUserId),
    or(eq(appointments.status, "requested"), eq(appointments.status, "confirmed")),
    lt(appointments.startsAt, input.endsAt),
    gt(appointments.endsAt, input.startsAt),
  )).limit(1);
  if (overlap[0]) throw new Error("Ce créneau vient d’être réservé par un autre patient");
  const result = await db.insert(appointments).values({
    patientUserId,
    doctorUserId: input.doctorUserId,
    clinicOrganizationId: input.clinicOrganizationId,
    status: requester.role === "doctor" || requester.role === "clinic" || requester.role === "admin" ? "confirmed" : "requested",
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    reason: input.reason,
  }).returning({ id: appointments.id });
  const appointmentId = result[0].id;
  await createNotification({ userId: input.doctorUserId, type: "appointment.requested", title: "Nouveau rendez-vous", body: `${requester.name || requester.email || "Un patient"} a demandé un rendez-vous.`, appointmentId });
  await appendAuditEvent({ actorId: input.requesterId, eventType: "appointment.created", metadata: { appointmentId, patientUserId, doctorUserId: input.doctorUserId } });
  return appointmentId;
}

export async function listAppointments(userId: number, from: Date, to: Date) {
  const db = await getDb();
  if (!db) return [];
  const user = await getUserById(userId);
  if (!user) return [];
  const memberships = await db.select().from(organizationMembers).where(eq(organizationMembers.userId, userId));
  const organizationIds = memberships.map(row => row.organizationId);
  const scope = user.role === "patient"
    ? eq(appointments.patientUserId, userId)
    : user.role === "doctor"
      ? eq(appointments.doctorUserId, userId)
      : organizationIds.length ? inArray(appointments.clinicOrganizationId, organizationIds) : eq(appointments.doctorUserId, userId);
  return db.select().from(appointments).where(and(scope, gte(appointments.startsAt, from), lt(appointments.startsAt, to))).orderBy(appointments.startsAt);
}

export async function updateAppointmentStatus(input: { appointmentId: number; requesterId: number; status: "confirmed" | "cancelled" | "completed" }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const appointment = (await db.select().from(appointments).where(eq(appointments.id, input.appointmentId)).limit(1))[0];
  if (!appointment) throw new Error("Rendez-vous introuvable");
  if (["cancelled", "completed"].includes(appointment.status)) throw new Error("Ce rendez-vous ne peut plus être modifié");
  const requester = await getUserById(input.requesterId);
  const canUpdate = requester?.role === "admin" || appointment.doctorUserId === input.requesterId || (input.status === "cancelled" && appointment.patientUserId === input.requesterId);
  if (!canUpdate) throw new Error("Vous ne pouvez pas modifier ce rendez-vous");
  await db.update(appointments).set({ status: input.status, updatedAt: new Date() }).where(eq(appointments.id, input.appointmentId));
  const recipientId = input.requesterId === appointment.doctorUserId ? appointment.patientUserId : appointment.doctorUserId;
  await createNotification({ userId: recipientId, type: `appointment.${input.status}`, title: "Rendez-vous mis à jour", body: `Le rendez-vous du ${appointment.startsAt.toLocaleString("fr-FR")} est maintenant ${input.status}.`, appointmentId: appointment.id });
  return true;
}

export async function createNotification(input: { userId: number; type: string; title: string; body: string; caseId?: number; appointmentId?: number }) {
  const db = await getDb();
  if (!db) return;
  await db.insert(notifications).values(input);
}

export async function notifyAnalysisCompleted(caseId: number, actorId: number) {
  const db = await getDb();
  if (!db) return;
  const clinicalCase = (await db.select().from(clinicalCases).where(eq(clinicalCases.id, caseId)).limit(1))[0];
  if (!clinicalCase) return;
  const shares = await db.select().from(caseShares).where(and(eq(caseShares.caseId, caseId), isNull(caseShares.revokedAt), or(isNull(caseShares.expiresAt), gt(caseShares.expiresAt, new Date()))));
  const recipientIds = new Set<number>(shares.map(share => share.sharedWith));
  if (clinicalCase.createdBy && clinicalCase.createdBy !== actorId) recipientIds.add(clinicalCase.createdBy);
  await Promise.all(Array.from(recipientIds).map(userId => createNotification({
    userId,
    type: "analysis.completed",
    title: "Nouveau résultat d’analyse IA",
    body: `Une synthèse supervisée est disponible pour le dossier ${clinicalCase.patientRef}. La revue humaine reste obligatoire.`,
    caseId,
  })));
}

export async function listNotifications(userId: number, limit = 30) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(limit);
}

export async function markNotificationRead(userId: number, notificationId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)));
}

export async function listCaseShareTargets(caseId: number, userId: number) {
  const db = await getDb();
  if (!db) return [];
  const memberships = await db.select().from(organizationMembers).where(and(eq(organizationMembers.userId, userId), or(eq(organizationMembers.membershipRole, "owner"), eq(organizationMembers.membershipRole, "doctor"), eq(organizationMembers.membershipRole, "staff"))));
  const targets: Array<{ organizationId: number; user: typeof users.$inferSelect; profile: typeof userProfiles.$inferSelect | undefined }> = [];
  for (const membership of memberships) {
    const members = await db.select().from(organizationMembers).where(and(eq(organizationMembers.organizationId, membership.organizationId), eq(organizationMembers.membershipRole, "doctor"), ne(organizationMembers.userId, userId)));
    for (const member of members) {
      const user = await getUserById(member.userId);
      if (!user) continue;
      const profile = (await db.select().from(userProfiles).where(eq(userProfiles.userId, member.userId)).limit(1))[0];
      targets.push({ organizationId: membership.organizationId, user, profile });
    }
  }
  return targets;
}

export async function canAccessClinicalCase(caseId: number, userId: number) {
  const db = await getDb();
  if (!db) return false;
  const clinicalCase = (await db.select().from(clinicalCases).where(eq(clinicalCases.id, caseId)).limit(1))[0];
  if (!clinicalCase) return false;
  const user = await getUserById(userId);
  if (!user || user.role === "patient" || user.role === "user") return false;
  if (user.role === "admin" || clinicalCase.createdBy === userId) return true;
  const now = new Date();
  const grants = await db.select().from(caseShares).where(and(
    eq(caseShares.caseId, caseId),
    eq(caseShares.sharedWith, userId),
    isNull(caseShares.revokedAt),
    or(isNull(caseShares.expiresAt), gt(caseShares.expiresAt, now)),
  )).limit(1);
  return Boolean(grants[0]);
}

export async function getClinicalCaseForUser(caseId: number, userId: number) {
  if (!(await canAccessClinicalCase(caseId, userId))) return undefined;
  return getClinicalCase(caseId);
}

export async function shareClinicalCase(input: { caseId: number; sharedBy: number; sharedWith: number; clinicOrganizationId: number; permission: "view" | "comment"; expiresAt?: Date }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  if (!(await canAccessClinicalCase(input.caseId, input.sharedBy))) throw new Error("Vous n’avez pas accès à ce dossier");
  const senderMembership = await getOrganizationMembership(input.clinicOrganizationId, input.sharedBy);
  const targetMembership = await getOrganizationMembership(input.clinicOrganizationId, input.sharedWith);
  const target = await getUserById(input.sharedWith);
  if (!senderMembership || !targetMembership || !target || target.role !== "doctor") throw new Error("Le partage est limité aux spécialistes de la même clinique");
  const result = await db.insert(caseShares).values(input).returning({ id: caseShares.id });
  const shareId = result[0].id;
  await createNotification({ userId: input.sharedWith, type: "case.shared", title: "Dossier partagé avec vous", body: `Un dossier clinique vous a été partagé avec le droit « ${input.permission} ».`, caseId: input.caseId });
  await appendAuditEvent({ caseId: input.caseId, actorId: input.sharedBy, eventType: "case.shared", metadata: { shareId, sharedWith: input.sharedWith, clinicOrganizationId: input.clinicOrganizationId, permission: input.permission } });
  return shareId;
}

export async function listCaseShares(caseId: number, userId: number) {
  const db = await getDb();
  if (!db || !(await canAccessClinicalCase(caseId, userId))) return [];
  const rows = await db.select().from(caseShares).where(and(eq(caseShares.caseId, caseId), isNull(caseShares.revokedAt))).orderBy(desc(caseShares.createdAt));
  return Promise.all(rows.map(async share => ({ share, sharedWithUser: await getUserById(share.sharedWith), sharedByUser: await getUserById(share.sharedBy) })));
}

export async function revokeClinicalCaseShare(shareId: number, requesterId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const share = (await db.select().from(caseShares).where(eq(caseShares.id, shareId)).limit(1))[0];
  if (!share) throw new Error("Partage introuvable");
  const membership = await getOrganizationMembership(share.clinicOrganizationId, requesterId);
  if (!membership || (share.sharedBy !== requesterId && membership.membershipRole !== "owner")) throw new Error("Vous ne pouvez pas révoquer ce partage");
  await db.update(caseShares).set({ revokedAt: new Date() }).where(eq(caseShares.id, shareId));
  await appendAuditEvent({ caseId: share.caseId, actorId: requesterId, eventType: "case.share.revoked", metadata: { shareId } });
  return true;
}
