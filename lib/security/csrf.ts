import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const CSRF_HEADER_NAME = "x-csrf-token";
const CSRF_COOKIE_NAME = "csrf_token";

export { CSRF_COOKIE_NAME, CSRF_HEADER_NAME };

export function createRawCsrfToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashCsrfToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function areSafeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}
