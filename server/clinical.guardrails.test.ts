import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createUnauthenticatedContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

describe("clinical guardrails", () => {
  it("does not expose clinical cases to an unauthenticated caller", async () => {
    const caller = appRouter.createCaller(createUnauthenticatedContext());
    await expect(caller.clinical.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("blocks an analysis request when the case does not exist", async () => {
    const caller = appRouter.createCaller({
      ...createUnauthenticatedContext(),
      user: {
        id: 1,
        openId: "test-user",
        name: "Test reviewer",
        email: "reviewer@example.com",
        loginMethod: "test",
        role: "user",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
    });

    await expect(caller.clinical.analyze({ caseId: 999999999 })).rejects.toThrow("Case not found");
  });

  it("blocks a contextual question when the case does not exist", async () => {
    const caller = appRouter.createCaller({
      ...createUnauthenticatedContext(),
      user: {
        id: 1,
        openId: "test-user",
        name: "Test reviewer",
        email: "reviewer@example.com",
        loginMethod: "test",
        role: "user",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
    });

    await expect(caller.clinical.ask({ caseId: 999999999, question: "Pourquoi ce niveau de gravité ?", history: [] })).rejects.toThrow("Case not found");
  });

  it("does not load a conversation outside the authenticated owner scope", async () => {
    const caller = appRouter.createCaller({
      ...createUnauthenticatedContext(),
      user: {
        id: 1,
        openId: "test-user",
        name: "Test reviewer",
        email: "reviewer@example.com",
        loginMethod: "test",
        role: "user",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
    });

    await expect(caller.clinical.conversation({ id: 999999999 })).resolves.toBeUndefined();
  });

  it("does not expose account data without an authenticated session", async () => {
    const caller = appRouter.createCaller(createUnauthenticatedContext());
    await expect(caller.account.me()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.account.directory({ organizationId: 1 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("does not let a patient create a clinical work item", async () => {
    const caller = appRouter.createCaller({
      ...createUnauthenticatedContext(),
      user: {
        id: 7,
        openId: "patient-user",
        name: "Patient Demo",
        email: "patient@example.com",
        loginMethod: "test",
        role: "patient",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
    });
    await expect(caller.clinical.create({ patientRef: "P-1", initials: "PD", age: 34, sex: "unknown", chiefComplaint: "Symptôme de test", symptoms: "Description suffisamment longue pour le test" })).rejects.toThrow("professionnels");
  });
});
