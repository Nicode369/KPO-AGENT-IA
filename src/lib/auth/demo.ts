export type DemoVariant = "kpo" | "clima";

export const DEMO_LABELS: Record<DemoVariant, string> = {
  kpo: "Demo KPO",
  clima: "Demo CLIMA",
};

const DEMO_VARIANTS: DemoVariant[] = ["kpo", "clima"];

function env(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

export function isDemoVariant(value: unknown): value is DemoVariant {
  return value === "kpo" || value === "clima";
}

export function demoEmail(variant: DemoVariant): string | undefined {
  if (variant === "kpo") return env("DEMO_KPO_EMAIL");
  return env("DEMO_CLIMA_EMAIL", "DEMO_ANALYST_EMAIL");
}

export function demoPassword(variant: DemoVariant): string | undefined {
  if (variant === "kpo") return process.env.DEMO_KPO_PASSWORD;
  return env("DEMO_CLIMA_PASSWORD", "DEMO_ANALYST_PASSWORD");
}

export function demoGroupSlug(variant: DemoVariant): string {
  if (variant === "kpo") return env("DEMO_KPO_GROUP_SLUG") ?? "kpo";
  return env("DEMO_CLIMA_GROUP_SLUG", "DEMO_GROUP_SLUG") ?? "riesgo-climatico";
}

export function demoVariantForEmail(
  email: string | null | undefined,
): DemoVariant | null {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return null;

  for (const variant of DEMO_VARIANTS) {
    const configuredEmail = demoEmail(variant)?.toLowerCase();
    if (configuredEmail && configuredEmail === normalized) return variant;
  }

  return null;
}

export function isDemoEmail(email: string | null | undefined): boolean {
  return demoVariantForEmail(email) !== null;
}

export function demoRateLimit(): number {
  const value = Number(process.env.DEMO_RATE_LIMIT_PER_MINUTE ?? 60);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 60;
}
