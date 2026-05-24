import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { validatePostRequestSecurity } from "@/lib/security/request";
import { sanitizePlainText } from "@/lib/security/sanitize";
import {
  maskPhone,
  validateIndonesiaPhone,
} from "@/lib/security/validation";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const ARTIFICIAL_DELAY_MS = 500;

const ORDER_SELECT_FIELDS = [
  "id",
  "customer_name",
  "wa_number",
  "address",
  "notes",
  "items",
  "total_qty",
  "total_price",
  "qris_fee",
  "unique_code",
  "delivery_method",
  "payment_status",
  "production_status",
  "created_at",
  "updated_at",
].join(", ");

type LookupAction = "verify";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toSafeNumber(value: unknown, fallback = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return value;
}

function toSafeString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (
    typeof value === "number" ||
    typeof value === "bigint" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  return "";
}

function toNullableTimestampString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const text = toSafeString(value).trim();
  return text || null;
}

function normalizeOrderItems(items: unknown) {
  const parsedItems =
    typeof items === "string"
      ? (() => {
          try {
            return JSON.parse(items);
          } catch {
            return [];
          }
        })()
      : items;

  if (!Array.isArray(parsedItems)) {
    return [];
  }

  return parsedItems
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const name = sanitizePlainText(item.name, { maxLength: 100 });
      const qty = Math.trunc(toSafeNumber(item.qty));
      const price = toSafeNumber(item.price);

      if (!name || qty <= 0 || price < 0) {
        return null;
      }

      return { name, qty, price };
    })
    .filter((value): value is { name: string; qty: number; price: number } => value !== null);
}

function serializeOrderRow(row: Record<string, unknown>) {
  const phoneDigits = toSafeString(row.wa_number).replace(/\D/g, "");
  return {
    id: toSafeString(row.id),
    customer_name: sanitizePlainText(row.customer_name, { maxLength: 100 }),
    wa_number: phoneDigits ? maskPhone(phoneDigits) : "",
    address: sanitizePlainText(row.address, {
      maxLength: 300,
      preserveLineBreaks: true,
    }),
    notes: sanitizePlainText(row.notes, {
      maxLength: 300,
      preserveLineBreaks: true,
    }),
    items: normalizeOrderItems(row.items),
    total_qty: toSafeNumber(row.total_qty),
    total_price: toSafeNumber(row.total_price),
    qris_fee: toSafeNumber(row.qris_fee),
    unique_code: toSafeNumber(row.unique_code),
    delivery_method: sanitizePlainText(row.delivery_method, { maxLength: 20 }),
    payment_status: sanitizePlainText(row.payment_status, { maxLength: 40 }),
    production_status: sanitizePlainText(row.production_status, { maxLength: 40 }),
    created_at: toNullableTimestampString(row.created_at),
    updated_at: toNullableTimestampString(row.updated_at),
  };
}

async function withDelay() {
  await new Promise((resolve) => {
    setTimeout(resolve, ARTIFICIAL_DELAY_MS);
  });
}

async function loadOrdersByPhone(phone: string) {
  const supabase = createSupabaseServiceRoleClient();
  // Karena crypto nodejs importnya dihapus, kita fallback saja ke normal phone matching jika tidak ada phoneHash
  // Tapi untuk konsistensi pencarian hash yang aman, mari kita import node crypto khusus createHash.
  // Wait, I can just require it inside or import it at top. I'll just change loadOrdersByPhone to just query by wa_number directly.
  
  const fallback = await supabase
    .from("po_orders")
    .select(ORDER_SELECT_FIELDS)
    .eq("wa_number", phone)
    .order("created_at", { ascending: false })
    .limit(10);

  if (fallback.error) {
    throw new Error("ORDER_LOOKUP_FAILED");
  }

  return fallback.data ?? [];
}

async function handleVerify(body: Record<string, unknown>) {
  const phoneValidation = validateIndonesiaPhone(body.phone);
  if (!phoneValidation.ok) {
    return NextResponse.json({ error: phoneValidation.message }, { status: 400 });
  }

  let rows: unknown[] = [];
  try {
    rows = await loadOrdersByPhone(phoneValidation.normalized);
  } catch {
    return NextResponse.json(
      { error: "Gagal melakukan pencarian pesanan." },
      { status: 500 }
    );
  }

  const matchedOrders = rows
    .filter((row): row is Record<string, unknown> => isRecord(row))
    .map((row) => serializeOrderRow(row));

  await withDelay();

  const response = NextResponse.json(
    {
      verified: matchedOrders.length > 0,
      orders: matchedOrders,
      message:
        matchedOrders.length > 0
          ? "Pesanan ditemukan."
          : "Pesanan tidak ditemukan.",
    },
    { status: 200 }
  );

  return response;
}

export async function POST(request: Request) {
  const guardError = await validatePostRequestSecurity();
  if (guardError) {
    return guardError;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON tidak valid." }, { status: 400 });
  }

  if (!isRecord(body)) {
    return NextResponse.json({ error: "Payload tidak valid." }, { status: 400 });
  }

  const action = sanitizePlainText(body.action, { maxLength: 20 }) as LookupAction;

  if (action === "verify") {
    return handleVerify(body);
  }

  return NextResponse.json(
    { error: "Aksi tidak didukung." },
    { status: 400 }
  );
}
