import { z } from "zod";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { invokeLLM } from "./_core/llm";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import type { TrpcContext } from "./_core/context";
import { sdk } from "./_core/sdk";
import {
  appendAuditEvent,
  appendClinicalChatMessages,
  addOrganizationMember,
  bookAppointment,
  createNotification,
  createConsultation,
  createClinicalConversation,
  createClinicalCase,
  createOrganization,
  getAccountSnapshot,
  getClinicalConversation,
  getClinicalCase,
  getClinicalCaseForUser,
  getDoctorSchedule,
  listClinicalConversations,
  listAppointments,
  listCaseShareTargets,
  listCaseShares,
  listClinicalCases,
  listDirectoryMembers,
  listDoctorDirectory,
  listNotifications,
  listUsersForAdmin,
  markNotificationRead,
  notifyAnalysisCompleted,
  persistAgentRun,
  persistRecommendation,
  revokeClinicalCaseShare,
  saveAccountProfile,
  saveStripeIdentifiers,
  saveDoctorAvailability,
  shareClinicalCase,
  updateAppointmentStatus,
  updateUserRole,
} from "./db";
import { createCheckoutSession, createCustomerPortalSession, getPublicPlans } from "./stripe";
import { authenticateLocalUser, registerLocalUser } from "./_core/localAuth";

function publicUser(user: NonNullable<TrpcContext["user"]>) {
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}

const clinicalAnalysisSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    triage: { type: "string" },
    acuity: { type: "string", enum: ["low", "medium", "high", "critical"] },
    redFlags: { type: "array", items: { type: "string" } },
    differential: { type: "array", items: { type: "string" } },
    exams: { type: "array", items: { type: "string" } },
    medicationSafety: { type: "array", items: { type: "string" } },
    followUp: { type: "string" },
    missingData: { type: "array", items: { type: "string" } },
  },
  required: ["triage", "acuity", "redFlags", "differential", "exams", "medicationSafety", "followUp", "missingData"],
} as const;

const caseInput = z.object({
  patientRef: z.string().min(2).max(32),
  initials: z.string().min(1).max(8),
  age: z.number().int().min(0).max(120),
  sex: z.enum(["female", "male", "other", "unknown"]),
  chiefComplaint: z.string().min(3).max(255),
  symptoms: z.string().min(10),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user ? publicUser(opts.ctx.user) : null),
    register: publicProcedure.input(z.object({
      name: z.string().trim().min(2).max(120),
      email: z.string().trim().email().max(320),
      password: z.string().min(8).max(128),
      role: z.enum(["patient", "client"]),
    })).mutation(async ({ input, ctx }) => {
      const user = await registerLocalUser(input);
      if (!user) throw new Error("Impossible de créer le compte");
      const sessionToken = await sdk.createSessionToken(user.openId, { name: user.name || input.name, expiresInMs: ONE_YEAR_MS });
      ctx.res.cookie(COOKIE_NAME, sessionToken, { ...getSessionCookieOptions(ctx.req), maxAge: ONE_YEAR_MS });
      return publicUser(user);
    }),
    login: publicProcedure.input(z.object({
      email: z.string().trim().email().max(320),
      password: z.string().min(1).max(128),
    })).mutation(async ({ input, ctx }) => {
      const user = await authenticateLocalUser(input.email, input.password);
      const sessionToken = await sdk.createSessionToken(user.openId, { name: user.name || input.email, expiresInMs: ONE_YEAR_MS });
      ctx.res.cookie(COOKIE_NAME, sessionToken, { ...getSessionCookieOptions(ctx.req), maxAge: ONE_YEAR_MS });
      return publicUser(user);
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  billing: router({
    plans: publicProcedure.query(() => getPublicPlans()),
    createCheckout: protectedProcedure.input(z.object({ plan: z.enum(["starter", "clinic", "enterprise"]) })).mutation(({ input, ctx }) => createCheckoutSession({ userId: ctx.user.id, plan: input.plan, req: ctx.req })),
    createDemoSubscription: protectedProcedure.input(z.object({
      plan: z.enum(["starter", "clinic", "enterprise"]),
      method: z.enum(["card", "visa", "wave", "orange_money", "moov_money"]),
      reference: z.string().min(4).max(32),
    })).mutation(async ({ input, ctx }) => {
      await saveStripeIdentifiers(ctx.user.id, { customerId: `demo_${ctx.user.id}`, subscriptionId: `demo_${input.plan}_${Date.now()}` });
      return { success: true, plan: input.plan, method: input.method } as const;
    }),
    createPortal: protectedProcedure.mutation(({ ctx }) => createCustomerPortalSession({ userId: ctx.user.id, req: ctx.req })),
  }),
  account: router({
    me: protectedProcedure.query(({ ctx }) => getAccountSnapshot(ctx.user.id)),
    setup: protectedProcedure.input(z.object({
      role: z.enum(["patient", "doctor", "clinic", "client", "user"]),
      phone: z.string().max(40).optional(),
      specialty: z.string().max(120).optional(),
      licenseNumber: z.string().max(120).optional(),
      organizationName: z.string().max(180).optional(),
      address: z.string().max(500).optional(),
    })).mutation(({ input, ctx }) => saveAccountProfile({ ...input, role: ctx.user.role === "admin" ? input.role : ctx.user.role, userId: ctx.user.id })),
    createOrganization: protectedProcedure.input(z.object({ name: z.string().min(2).max(180), type: z.enum(["clinic", "client"]) })).mutation(({ input, ctx }) => createOrganization({ ...input, createdBy: ctx.user.id })),
    addMember: protectedProcedure.input(z.object({ organizationId: z.number().int().positive(), email: z.string().email(), membershipRole: z.enum(["doctor", "patient", "staff"]) })).mutation(({ input, ctx }) => addOrganizationMember({ ...input, requesterId: ctx.user.id })),
    createConsultation: protectedProcedure.input(z.object({ patientUserId: z.number().int().positive(), doctorUserId: z.number().int().positive().optional(), clinicOrganizationId: z.number().int().positive().optional(), caseId: z.number().int().positive().optional(), scheduledAt: z.coerce.date().optional(), summary: z.string().max(1000).optional() })).mutation(({ input, ctx }) => createConsultation({ ...input, requesterId: ctx.user.id })),
    directory: protectedProcedure.input(z.object({ organizationId: z.number().int().positive() })).query(({ input, ctx }) => listDirectoryMembers(input.organizationId, ctx.user.id)),
  }),
  admin: router({
    users: protectedProcedure.query(({ ctx }) => {
      if (ctx.user.role !== "admin") throw new Error("Accès administrateur requis");
      return listUsersForAdmin();
    }),
    setRole: protectedProcedure.input(z.object({ userId: z.number().int().positive(), role: z.enum(["user", "patient", "doctor", "clinic", "client", "admin"]) })).mutation(({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new Error("Accès administrateur requis");
      if (input.userId === ctx.user.id && input.role !== "admin") throw new Error("Un administrateur ne peut pas retirer son propre accès");
      return updateUserRole(input.userId, input.role);
    }),
  }),
  calendar: router({
    doctors: protectedProcedure.input(z.object({ organizationId: z.number().int().positive().optional() }).optional()).query(({ input }) => listDoctorDirectory(input?.organizationId)),
    schedule: protectedProcedure.input(z.object({ doctorUserId: z.number().int().positive(), from: z.coerce.date(), to: z.coerce.date(), clinicOrganizationId: z.number().int().positive().optional() })).query(({ input, ctx }) => getDoctorSchedule({ ...input, requesterId: ctx.user.id })),
    setAvailability: protectedProcedure.input(z.object({ doctorUserId: z.number().int().positive(), clinicOrganizationId: z.number().int().positive().optional(), weekday: z.number().int().min(0).max(6), startMinute: z.number().int().min(0).max(1439), endMinute: z.number().int().min(1).max(1440), slotDuration: z.number().int().min(15).max(120) })).mutation(({ input, ctx }) => saveDoctorAvailability({ ...input, requesterId: ctx.user.id })),
    appointments: protectedProcedure.input(z.object({ from: z.coerce.date(), to: z.coerce.date() })).query(({ input, ctx }) => listAppointments(ctx.user.id, input.from, input.to)),
    book: protectedProcedure.input(z.object({ patientUserId: z.number().int().positive().optional(), doctorUserId: z.number().int().positive(), clinicOrganizationId: z.number().int().positive().optional(), startsAt: z.coerce.date(), endsAt: z.coerce.date(), reason: z.string().max(500).optional() })).mutation(({ input, ctx }) => bookAppointment({ ...input, requesterId: ctx.user.id })),
    updateStatus: protectedProcedure.input(z.object({ appointmentId: z.number().int().positive(), status: z.enum(["confirmed", "cancelled", "completed"]) })).mutation(({ input, ctx }) => updateAppointmentStatus({ ...input, requesterId: ctx.user.id })),
  }),
  notifications: router({
    list: protectedProcedure.query(({ ctx }) => listNotifications(ctx.user.id)),
    markRead: protectedProcedure.input(z.object({ notificationId: z.number().int().positive() })).mutation(({ input, ctx }) => markNotificationRead(ctx.user.id, input.notificationId)),
  }),
  sharing: router({
    targets: protectedProcedure.input(z.object({ caseId: z.number().int().positive() })).query(({ input, ctx }) => listCaseShareTargets(input.caseId, ctx.user.id)),
    list: protectedProcedure.input(z.object({ caseId: z.number().int().positive() })).query(({ input, ctx }) => listCaseShares(input.caseId, ctx.user.id)),
    share: protectedProcedure.input(z.object({ caseId: z.number().int().positive(), sharedWith: z.number().int().positive(), clinicOrganizationId: z.number().int().positive(), permission: z.enum(["view", "comment"]), expiresAt: z.coerce.date().optional() })).mutation(({ input, ctx }) => shareClinicalCase({ ...input, sharedBy: ctx.user.id })),
    revoke: protectedProcedure.input(z.object({ shareId: z.number().int().positive() })).mutation(({ input, ctx }) => revokeClinicalCaseShare(input.shareId, ctx.user.id)),
  }),
  clinical: router({
    list: protectedProcedure.query(({ ctx }) => ["patient"].includes(ctx.user.role) ? [] : listClinicalCases()),
    get: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(({ input, ctx }) => getClinicalCaseForUser(input.id, ctx.user.id)),
    create: protectedProcedure.input(caseInput).mutation(({ input, ctx }) => {
      if (["patient", "user"].includes(ctx.user.role)) throw new Error("Seuls les professionnels et organisations habilités peuvent créer un dossier clinique");
      return createClinicalCase({ ...input, createdBy: ctx.user.id });
    }),
    conversations: protectedProcedure.input(z.object({ caseId: z.number().int().positive() })).query(({ input, ctx }) => listClinicalConversations(input.caseId, ctx.user.id)),
    conversation: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(({ input, ctx }) => getClinicalConversation(input.id, ctx.user.id)),
    ask: protectedProcedure.input(z.object({
      caseId: z.number().int().positive(),
      conversationId: z.number().int().positive().optional(),
      question: z.string().min(2).max(1200),
      history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2400) })).max(12).default([]),
    })).mutation(async ({ input, ctx }) => {
      const clinicalCase = await getClinicalCaseForUser(input.caseId, ctx.user.id);
      if (!clinicalCase) throw new Error("Case not found");
      const existingConversation = input.conversationId ? await getClinicalConversation(input.conversationId, ctx.user.id) : undefined;
      if (input.conversationId && (!existingConversation || existingConversation.caseId !== input.caseId)) throw new Error("Conversation not found");
      const conversationId = existingConversation?.id ?? await createClinicalConversation({ caseId: input.caseId, ownerId: ctx.user.id, title: input.question.slice(0, 172) });
      await appendAuditEvent({ caseId: input.caseId, actorId: ctx.user.id, eventType: "clinical.question.started" });
      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: "You are a clinical decision-support assistant. Answer questions about the provided case and its generated analysis. Do not diagnose definitively, prescribe, or replace emergency services or a licensed clinician. Clearly separate known facts, hypotheses, missing information, and what must be verified. If the question asks for a medication or treatment, respond with safety checks and clinician-review questions instead of a prescription. Keep the answer concise and in French.",
          },
          {
            role: "user",
            content: JSON.stringify({ case: { age: clinicalCase.age, sex: clinicalCase.sex, complaint: clinicalCase.chiefComplaint, symptoms: clinicalCase.symptoms }, priorAgents: clinicalCase.agents, recommendations: clinicalCase.recommendations }),
          },
          ...(existingConversation?.messages.slice(-12).map(message => ({ role: message.role, content: message.content })) ?? input.history),
          { role: "user", content: input.question },
        ],
        reasoning: { effort: "low" },
      });
      const content = response.choices?.[0]?.message?.content;
      const answer = typeof content === "string" ? content : "Je n’ai pas pu produire une réponse structurée. Vérifiez les données du dossier et reprenez la revue clinique.";
      await appendClinicalChatMessages(conversationId, [{ role: "user", content: input.question }, { role: "assistant", content: answer }]);
      await appendAuditEvent({ caseId: input.caseId, actorId: ctx.user.id, eventType: "clinical.question.completed" });
      return { answer, conversationId, requiresHumanReview: true };
    }),
    analyze: protectedProcedure.input(z.object({ caseId: z.number().int().positive() })).mutation(async ({ input, ctx }) => {
      const clinicalCase = await getClinicalCaseForUser(input.caseId, ctx.user.id);
      if (!clinicalCase) throw new Error("Case not found");
      await appendAuditEvent({ caseId: input.caseId, actorId: ctx.user.id, eventType: "analysis.started" });
      try {
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: "You are a clinical decision-support system, not a doctor. Never diagnose definitively, never prescribe, and never replace emergency services or a licensed clinician. Analyze only the provided de-identified information. Highlight uncertainty, red flags, missing data, safe exam considerations, medication contraindication questions, and the need for clinician review. Return only structured JSON.",
            },
            {
              role: "user",
              content: JSON.stringify({ age: clinicalCase.age, sex: clinicalCase.sex, complaint: clinicalCase.chiefComplaint, symptoms: clinicalCase.symptoms }),
            },
          ],
          response_format: { type: "json_schema", json_schema: { name: "clinical_analysis", strict: true, schema: clinicalAnalysisSchema } },
          reasoning: { effort: "low" },
        });
        const content = response.choices?.[0]?.message?.content;
        const analysis = typeof content === "string" ? JSON.parse(content) : null;
        if (!analysis) throw new Error("The clinical analysis returned no structured output");
        await persistAgentRun({ caseId: input.caseId, agentKey: "clinical-synthesis", status: "completed", confidence: 70, output: JSON.stringify(analysis) });
        await persistRecommendation({ caseId: input.caseId, recommendationType: "triage", title: "Triage à confirmer", detail: analysis.triage, priority: analysis.acuity === "critical" ? "urgent" : "soon" });
        await persistRecommendation({ caseId: input.caseId, recommendationType: "exam", title: "Examens à considérer", detail: analysis.exams.join(" • "), priority: "soon" });
        await persistRecommendation({ caseId: input.caseId, recommendationType: "medication_safety", title: "Sécurité médicamenteuse", detail: analysis.medicationSafety.join(" • "), priority: "routine" });
        await appendAuditEvent({ caseId: input.caseId, actorId: ctx.user.id, eventType: "analysis.completed", metadata: { agent: "clinical-synthesis", reviewRequired: true } });
        await notifyAnalysisCompleted(input.caseId, ctx.user.id);
        return { analysis, requiresHumanReview: true };
      } catch (error) {
        await persistAgentRun({ caseId: input.caseId, agentKey: "clinical-synthesis", status: "failed", confidence: 0, output: JSON.stringify({ error: String(error) }) });
        await appendAuditEvent({ caseId: input.caseId, actorId: ctx.user.id, eventType: "analysis.failed" });
        throw error;
      }
    }),
  }),
});

export type AppRouter = typeof appRouter;
