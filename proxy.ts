import { NextRequest, NextResponse } from "next/server";
import {
  attachRateLimitHeaders,
  limitCheckOrderByIp,
  limitOrderSubmitByPhone,
} from "@/lib/security/rate-limit";
import { getClientIp } from "@/lib/security/request";
import { validateIndonesiaPhone } from "@/lib/security/validation";

function createRateLimitErrorResponse(
  message: string,
  retryAfterSeconds: number
): NextResponse {
  return NextResponse.json(
    { error: message },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
      },
    }
  );
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (pathname === "/api/check-order") {
    const ip = getClientIp(request);
    const result = await limitCheckOrderByIp(ip);
    if (!result.success) {
      return createRateLimitErrorResponse(
        "Terlalu banyak percobaan cek pesanan. Coba lagi nanti.",
        result.retryAfterSeconds
      );
    }

    const response = NextResponse.next();
    return attachRateLimitHeaders(response, result) as NextResponse;
  }

  if (pathname === "/api/orders" && request.method === "POST") {
    try {
      const body = (await request.json()) as Record<string, unknown>;
      const phoneValidation = validateIndonesiaPhone(body.wa_number);
      if (phoneValidation.ok) {
        const result = await limitOrderSubmitByPhone(phoneValidation.normalized);
        if (!result.success) {
          return createRateLimitErrorResponse(
            "Batas kirim pesanan untuk nomor ini tercapai. Coba lagi dalam 1 jam.",
            result.retryAfterSeconds
          );
        }

        const response = NextResponse.next();
        return attachRateLimitHeaders(response, result) as NextResponse;
      }
    } catch {
      // Biarkan route handler yang menangani invalid JSON/validasi payload.
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/check-order", "/api/orders"],
};
