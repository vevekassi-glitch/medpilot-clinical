import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { getPlan } from "./products";
import type { TrpcContext } from "./_core/context";

function createContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

describe("billing.plans", () => {
  it("exposes the three public subscription tiers without secret price identifiers", async () => {
    const caller = appRouter.createCaller(createContext());
    const plans = await caller.billing.plans();

    expect(plans.map(plan => plan.key)).toEqual(["starter", "clinic", "enterprise"]);
    expect(plans.every(plan => plan.amount > 0 && plan.currency === "eur")).toBe(true);
    expect(plans.every(plan => !Object.prototype.hasOwnProperty.call(plan, "envPrice"))).toBe(true);
  });

  it("keeps every subscription offer compatible with a EUR recurring checkout", () => {
    for (const key of ["starter", "clinic", "enterprise"] as const) {
      const plan = getPlan(key);
      expect(plan.currency).toBe("eur");
      expect(plan.interval).toBe("month");
      expect(plan.amount).toBeGreaterThanOrEqual(50);
    }
  });
});
