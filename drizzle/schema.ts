import { integer, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

/** Core identity table used by Manus OAuth and Stripe customer mapping. */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  passwordHash: varchar("passwordHash", { length: 255 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: varchar("role", { length: 32 }).$type<"user" | "patient" | "doctor" | "clinic" | "client" | "admin">().default("user").notNull(),
  stripeCustomerId: varchar("stripeCustomerId", { length: 255 }),
  stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

/** Extended account profile used by patients, clinicians, clinics, and client administrators. */
export const userProfiles = pgTable("userProfiles", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().unique(),
  phone: varchar("phone", { length: 40 }),
  specialty: varchar("specialty", { length: 120 }),
  licenseNumber: varchar("licenseNumber", { length: 120 }),
  organizationName: varchar("organizationName", { length: 180 }),
  address: text("address"),
  preferences: text("preferences"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

/** Organization directory for clinics and client workspaces. */
export const organizations = pgTable("organizations", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 180 }).notNull(),
  type: varchar("type", { length: 32 }).$type<"clinic" | "client">().default("clinic").notNull(),
  createdBy: integer("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const organizationMembers = pgTable("organizationMembers", {
  id: serial("id").primaryKey(),
  organizationId: integer("organizationId").notNull(),
  userId: integer("userId").notNull(),
  membershipRole: varchar("membershipRole", { length: 32 }).$type<"owner" | "doctor" | "patient" | "staff">().default("staff").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** Care relationship and consultation timeline between a patient, doctor, and clinic. */
export const consultations = pgTable("consultations", {
  id: serial("id").primaryKey(),
  patientUserId: integer("patientUserId").notNull(),
  doctorUserId: integer("doctorUserId"),
  clinicOrganizationId: integer("clinicOrganizationId"),
  caseId: integer("caseId"),
  status: varchar("status", { length: 32 }).$type<"requested" | "scheduled" | "completed" | "cancelled">().default("requested").notNull(),
  scheduledAt: timestamp("scheduledAt"),
  summary: text("summary"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

/** A de-identified clinical work item. PHI is intentionally kept out of the demo UI. */
export const clinicalCases = pgTable("clinicalCases", {
  id: serial("id").primaryKey(),
  patientRef: varchar("patientRef", { length: 32 }).notNull().unique(),
  initials: varchar("initials", { length: 8 }).notNull(),
  age: integer("age").notNull(),
  sex: varchar("sex", { length: 32 }).$type<"female" | "male" | "other" | "unknown">().default("unknown").notNull(),
  status: varchar("status", { length: 32 }).$type<"new" | "in_review" | "needs_review" | "closed">().default("new").notNull(),
  acuity: varchar("acuity", { length: 32 }).$type<"low" | "medium" | "high" | "critical">().default("medium").notNull(),
  chiefComplaint: varchar("chiefComplaint", { length: 255 }).notNull(),
  symptoms: text("symptoms").notNull(),
  createdBy: integer("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

/** One record per specialist agent execution, retained for explainability. */
export const agentRuns = pgTable("agentRuns", {
  id: serial("id").primaryKey(),
  caseId: integer("caseId").notNull(),
  agentKey: varchar("agentKey", { length: 64 }).notNull(),
  status: varchar("status", { length: 32 }).$type<"queued" | "running" | "completed" | "blocked" | "failed">().default("queued").notNull(),
  confidence: integer("confidence"),
  output: text("output"),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
});

/** Human-reviewable recommendations. Never treated as prescriptions. */
export const clinicalRecommendations = pgTable("clinicalRecommendations", {
  id: serial("id").primaryKey(),
  caseId: integer("caseId").notNull(),
  recommendationType: varchar("recommendationType", { length: 32 }).$type<"triage" | "exam" | "medication_safety" | "follow_up">().notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  detail: text("detail").notNull(),
  priority: varchar("priority", { length: 32 }).$type<"routine" | "soon" | "urgent">().default("routine").notNull(),
  requiresReview: integer("requiresReview").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** Immutable audit trail for clinical and governance events. */
export const auditEvents = pgTable("auditEvents", {
  id: serial("id").primaryKey(),
  caseId: integer("caseId"),
  actorId: integer("actorId"),
  eventType: varchar("eventType", { length: 96 }).notNull(),
  metadata: text("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** A reusable clinician-owned conversation thread scoped to one clinical case. */
export const clinicalConversations = pgTable("clinicalConversations", {
  id: serial("id").primaryKey(),
  caseId: integer("caseId").notNull(),
  ownerId: integer("ownerId").notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

/** Individual chat messages retained for audit and reload within a conversation. */
export const clinicalChatMessages = pgTable("clinicalChatMessages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversationId").notNull(),
  role: varchar("role", { length: 32 }).$type<"user" | "assistant">().notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** Weekly availability windows configured by each clinician. Minutes are counted from midnight UTC. */
export const doctorAvailabilities = pgTable("doctorAvailabilities", {
  id: serial("id").primaryKey(),
  doctorUserId: integer("doctorUserId").notNull(),
  clinicOrganizationId: integer("clinicOrganizationId"),
  weekday: integer("weekday").notNull(),
  startMinute: integer("startMinute").notNull(),
  endMinute: integer("endMinute").notNull(),
  slotDuration: integer("slotDuration").default(30).notNull(),
  active: integer("active").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** Appointment requests and confirmed patient bookings. */
export const appointments = pgTable("appointments", {
  id: serial("id").primaryKey(),
  patientUserId: integer("patientUserId").notNull(),
  doctorUserId: integer("doctorUserId").notNull(),
  clinicOrganizationId: integer("clinicOrganizationId"),
  caseId: integer("caseId"),
  status: varchar("status", { length: 32 }).$type<"requested" | "confirmed" | "cancelled" | "completed">().default("requested").notNull(),
  startsAt: timestamp("startsAt").notNull(),
  endsAt: timestamp("endsAt").notNull(),
  reason: varchar("reason", { length: 500 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

/** In-app alerts. Read state is per recipient and every clinical alert is auditable. */
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  type: varchar("type", { length: 64 }).notNull(),
  title: varchar("title", { length: 180 }).notNull(),
  body: text("body").notNull(),
  caseId: integer("caseId"),
  appointmentId: integer("appointmentId"),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** Explicit, revocable case access grants between specialists in the same clinic. */
export const caseShares = pgTable("caseShares", {
  id: serial("id").primaryKey(),
  caseId: integer("caseId").notNull(),
  sharedBy: integer("sharedBy").notNull(),
  sharedWith: integer("sharedWith").notNull(),
  clinicOrganizationId: integer("clinicOrganizationId").notNull(),
  permission: varchar("permission", { length: 32 }).$type<"view" | "comment">().default("view").notNull(),
  expiresAt: timestamp("expiresAt"),
  revokedAt: timestamp("revokedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type UserProfile = typeof userProfiles.$inferSelect;
export type Organization = typeof organizations.$inferSelect;
export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type Consultation = typeof consultations.$inferSelect;
export type ClinicalCase = typeof clinicalCases.$inferSelect;
export type AgentRun = typeof agentRuns.$inferSelect;
export type ClinicalRecommendation = typeof clinicalRecommendations.$inferSelect;
export type AuditEvent = typeof auditEvents.$inferSelect;
export type ClinicalConversation = typeof clinicalConversations.$inferSelect;
export type ClinicalChatMessage = typeof clinicalChatMessages.$inferSelect;
export type DoctorAvailability = typeof doctorAvailabilities.$inferSelect;
export type Appointment = typeof appointments.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type CaseShare = typeof caseShares.$inferSelect;
