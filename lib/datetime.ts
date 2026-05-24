const ISO_NO_TZ_PATTERN = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/;
const ISO_TZ_PATTERN = /(?:Z|[+\-]\d{2}:\d{2})$/i;

export const WIB_TIME_ZONE = "Asia/Jakarta";

const WIB_DATE_TIME_WITH_SECONDS_FORMATTER = new Intl.DateTimeFormat("id-ID", {
  timeZone: WIB_TIME_ZONE,
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const WIB_GROUPING_KEY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: WIB_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function normalizeDateInputToUtcCandidate(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  if (ISO_NO_TZ_PATTERN.test(trimmed)) {
    return `${trimmed.replace(" ", "T")}Z`;
  }

  if (!ISO_TZ_PATTERN.test(trimmed) && trimmed.includes("T")) {
    return `${trimmed}Z`;
  }

  return trimmed;
}

export function toUtcIsoString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string" && typeof value !== "number" && !(value instanceof Date)) {
    return null;
  }

  const input =
    typeof value === "string" ? normalizeDateInputToUtcCandidate(value) : value;
  const date = new Date(input);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

export function nowUtcIsoString(): string {
  return new Date().toISOString();
}

// Keep conversion only in display layer. Input is expected to be UTC ISO string from API/DB.
export function formatWIB(dateString: string): string {
  const normalizedUtc = toUtcIsoString(dateString);
  if (!normalizedUtc) {
    return "-";
  }

  return WIB_DATE_TIME_WITH_SECONDS_FORMATTER.format(new Date(normalizedUtc));
}

export function getWIBDateKey(dateString: string): string {
  const normalizedUtc = toUtcIsoString(dateString);
  if (!normalizedUtc) {
    return "invalid-date";
  }

  const parts = WIB_GROUPING_KEY_FORMATTER.formatToParts(new Date(normalizedUtc));
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const day = parts.find((part) => part.type === "day")?.value ?? "00";

  return `${year}-${month}-${day}`;
}

export function groupByWIBDate<T>(
  rows: T[],
  getDateString: (row: T) => string
): Record<string, T[]> {
  return rows.reduce<Record<string, T[]>>((acc, row) => {
    const key = getWIBDateKey(getDateString(row));
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(row);
    return acc;
  }, {});
}
