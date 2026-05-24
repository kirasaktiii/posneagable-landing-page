import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import {
  areSafeEqual,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  hashCsrfToken,
} from "@/lib/security/csrf";

const PROD_ALLOWED_ORIGINS = new Set(["https://naegable.vercel.app"]);

function getAllowedOrigins() {
  if (process.env.NODE_ENV !== "production") {
    return new Set([...PROD_ALLOWED_ORIGINS, "http://localhost:3000"]);
  }

  return PROD_ALLOWED_ORIGINS;
}

function isAllowedOrigin(origin: string | null) {
  if (!origin) {
    return false;
  }

  return getAllowedOrigins().has(origin);
}

function hasValidReferer(referer: string | null) {
  if (!referer) {
    return false;
  }

  try {
    const refererUrl = new URL(referer);
    return isAllowedOrigin(refererUrl.origin);
  } catch {
    return false;
  }
}

export async function validatePostRequestSecurity(options?: {
  requireCsrf?: boolean;
}) {
  const reqHeaders = await headers();
  const origin = reqHeaders.get("origin");
  const referer = reqHeaders.get("referer");
  const requestedWith = reqHeaders.get("x-requested-with");

  if (!isAllowedOrigin(origin) || !hasValidReferer(referer)) {
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 }
    );
  }

  if (requestedWith !== "XMLHttpRequest") {
    return NextResponse.json(
      { error: "Invalid request signature." },
      { status: 403 }
    );
  }

  if (options?.requireCsrf === false) {
    return null;
  }

  const cookieStore = await cookies();
  const csrfCookieHash = cookieStore.get(CSRF_COOKIE_NAME)?.value ?? "";
  const csrfHeaderToken = reqHeaders.get(CSRF_HEADER_NAME) ?? "";

  if (!csrfCookieHash || !csrfHeaderToken) {
    return NextResponse.json(
      { error: "Missing CSRF token." },
      { status: 403 }
    );
  }

  const providedHash = hashCsrfToken(csrfHeaderToken);
  if (!areSafeEqual(csrfCookieHash, providedHash)) {
    return NextResponse.json(
      { error: "Invalid CSRF token." },
      { status: 403 }
    );
  }

  return null;
}

export function getClientIp(req: Request): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }

  return req.headers.get("x-real-ip") ?? "unknown";
}
