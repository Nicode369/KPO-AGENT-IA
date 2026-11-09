export const APP_TIME_ZONE = "America/Bogota";

const BOGOTA_OFFSET = "-05:00";
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

type DateInput = string | number | Date;

function toDate(value: DateInput): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateTime(value: DateInput): string {
  const date = toDate(value);
  if (!date) return typeof value === "string" ? value : "";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: APP_TIME_ZONE,
  }).format(date);
}

export function formatDate(value: DateInput): string {
  const date = toDate(value);
  if (!date) return typeof value === "string" ? value : "";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeZone: APP_TIME_ZONE,
  }).format(date);
}

export function formatDateOnly(value: string): string {
  if (!DATE_ONLY_PATTERN.test(value)) return formatDate(value);
  return formatDate(`${value}T12:00:00${BOGOTA_OFFSET}`);
}

export function bogotaDayStartIso(value: string): string | null {
  if (!DATE_ONLY_PATTERN.test(value)) return null;
  const date = new Date(`${value}T00:00:00${BOGOTA_OFFSET}`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function bogotaDayEndIso(value: string): string | null {
  if (!DATE_ONLY_PATTERN.test(value)) return null;
  const date = new Date(`${value}T23:59:59.999${BOGOTA_OFFSET}`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
