import DOMPurify from "isomorphic-dompurify";

type SanitizeOptions = {
  maxLength?: number;
  fallback?: string;
  preserveLineBreaks?: boolean;
};

export function sanitizePlainText(
  value: unknown,
  options: SanitizeOptions = {}
): string {
  const { maxLength, fallback = "", preserveLineBreaks = false } = options;

  const raw =
    typeof value === "string"
      ? value
      : typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : "";

  const cleaned = DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true,
  });

  const normalized = preserveLineBreaks
    ? cleaned.replace(/\r\n/g, "\n")
    : cleaned.replace(/\s+/g, " ");

  const trimmed = normalized.trim();

  if (!trimmed) {
    return fallback;
  }

  if (typeof maxLength === "number" && maxLength > 0) {
    return trimmed.slice(0, maxLength);
  }

  return trimmed;
}
