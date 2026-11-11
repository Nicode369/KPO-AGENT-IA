import { afterEach, describe, expect, it, vi } from "vitest";

import {
  demoGroupSlug,
  demoVariantForEmail,
  isDemoEmail,
} from "./demo";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("demo variants", () => {
  it("detects the KPO and climate demo accounts", () => {
    vi.stubEnv("DEMO_KPO_EMAIL", "demo.kpo@example.com");
    vi.stubEnv("DEMO_CLIMA_EMAIL", "demo.analista@example.com");

    expect(demoVariantForEmail("DEMO.KPO@example.com")).toBe("kpo");
    expect(demoVariantForEmail("demo.analista@example.com")).toBe("clima");
    expect(isDemoEmail("demo.analista@example.com")).toBe(true);
    expect(isDemoEmail("analista@example.com")).toBe(false);
  });

  it("supports the legacy climate environment variables", () => {
    vi.stubEnv("DEMO_CLIMA_EMAIL", "");
    vi.stubEnv("DEMO_ANALYST_EMAIL", "legacy.demo@example.com");
    vi.stubEnv("DEMO_CLIMA_GROUP_SLUG", "");
    vi.stubEnv("DEMO_GROUP_SLUG", "clima-legacy");

    expect(demoVariantForEmail("legacy.demo@example.com")).toBe("clima");
    expect(demoGroupSlug("clima")).toBe("clima-legacy");
  });

  it("uses the expected default group slugs", () => {
    vi.stubEnv("DEMO_KPO_GROUP_SLUG", "");
    vi.stubEnv("DEMO_CLIMA_GROUP_SLUG", "");

    expect(demoGroupSlug("kpo")).toBe("kpo");
    expect(demoGroupSlug("clima")).toBe("riesgo-climatico");
  });
});
