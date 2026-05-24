import { NextResponse } from "next/server";
import {
  createRawCsrfToken,
  CSRF_COOKIE_NAME,
  hashCsrfToken,
} from "@/lib/security/csrf";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const token = createRawCsrfToken();
  const hashedToken = hashCsrfToken(token);

  const response = NextResponse.json(
    { csrfToken: token },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
      },
    }
  );

  response.cookies.set({
    name: CSRF_COOKIE_NAME,
    value: hashedToken,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60,
  });

  return response;
}
