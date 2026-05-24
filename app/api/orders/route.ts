import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

type DeliveryMethod = "do" | "cod" | "pickup";

type OrderItem = {
  name: string;
  qty: number;
  price: number;
};

type CreateOrderPayload = {
  customer_name: string;
  wa_number: string;
  address: string;
  notes: string;
  items: OrderItem[];
  total_qty: number;
  total_price: number;
  qris_fee: number;
  unique_code: number;
  delivery_method: DeliveryMethod;
  payment_status: string;
  production_status: string;
};

type ValidationResult =
  | { ok: true; payload: CreateOrderPayload }
  | { ok: false; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toSafeNumber(value: unknown, fallback = 0): number {
  if (typeof value !== "number") {
    return fallback;
  }

  if (!Number.isFinite(value)) {
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

  const text = toSafeString(value);
  return text || null;
}

function normalizeItems(items: unknown): OrderItem[] {
  const rawItems =
    typeof items === "string"
      ? (() => {
          try {
            return JSON.parse(items);
          } catch {
            return [];
          }
        })()
      : items;

  if (!Array.isArray(rawItems)) {
    return [];
  }

  return rawItems
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const candidate = item as Record<string, unknown>;
      const name = toSafeString(candidate.name).trim();
      const qty = toSafeNumber(candidate.qty);
      const price = toSafeNumber(candidate.price);

      if (!name || qty <= 0 || price < 0) {
        return null;
      }

      return { name, qty, price };
    })
    .filter((item): item is OrderItem => item !== null);
}

function validateCreateOrderPayload(input: unknown): ValidationResult {
  if (!input || typeof input !== "object") {
    return { ok: false, message: "Invalid request payload." };
  }

  const body = input as Record<string, unknown>;

  const customer_name = toSafeString(body.customer_name).trim();
  const wa_number = toSafeString(body.wa_number).trim();
  const address = toSafeString(body.address).trim();
  const notes = toSafeString(body.notes).trim();
  const delivery_method = toSafeString(body.delivery_method) as DeliveryMethod;
  const payment_status = toSafeString(body.payment_status).trim() || "unpaid";
  const production_status =
    toSafeString(body.production_status).trim() || "pending";

  const items = normalizeItems(body.items);
  const total_qty = toSafeNumber(body.total_qty);
  const total_price = toSafeNumber(body.total_price);
  const qris_fee = toSafeNumber(body.qris_fee);
  const unique_code = toSafeNumber(body.unique_code);

  if (!customer_name || !wa_number || !address) {
    return { ok: false, message: "Customer data is incomplete." };
  }

  if (items.length === 0) {
    return { ok: false, message: "Order items are empty." };
  }

  if (delivery_method !== "do" && delivery_method !== "cod" && delivery_method !== "pickup") {
    return { ok: false, message: "Unsupported delivery method." };
  }

  if (total_qty <= 0 || total_price <= 0) {
    return { ok: false, message: "Order totals are invalid." };
  }

  return {
    ok: true,
    payload: {
      customer_name,
      wa_number,
      address,
      notes,
      items,
      total_qty,
      total_price,
      qris_fee,
      unique_code,
      delivery_method,
      payment_status,
      production_status,
    },
  };
}

function serializeOrderRow(row: Record<string, unknown>) {
  return {
    id: toSafeString(row.id),
    customer_name: toSafeString(row.customer_name),
    wa_number: toSafeString(row.wa_number),
    address: toSafeString(row.address),
    notes: toSafeString(row.notes),
    items: normalizeItems(row.items),
    total_qty: toSafeNumber(row.total_qty),
    total_price: toSafeNumber(row.total_price),
    qris_fee: toSafeNumber(row.qris_fee),
    unique_code: toSafeNumber(row.unique_code),
    delivery_method: toSafeString(row.delivery_method),
    payment_status: toSafeString(row.payment_status),
    production_status: toSafeString(row.production_status),
    created_at: toNullableTimestampString(row.created_at),
    updated_at: toNullableTimestampString(row.updated_at),
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("query") ?? "").trim().slice(0, 30);

  if (!query) {
    return Response.json({ orders: [] });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("po_orders")
    .select(ORDER_SELECT_FIELDS)
    .ilike("wa_number", `%${query}%`)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    return Response.json(
      { error: "Failed to fetch orders." },
      { status: 500 }
    );
  }

  const rows = Array.isArray(data) ? data : [];
  const orders = rows.flatMap((row) =>
    isRecord(row) ? [serializeOrderRow(row)] : []
  );

  return Response.json({ orders });
}

export async function POST(request: Request) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const validated = validateCreateOrderPayload(rawBody);
  if (!validated.ok) {
    return Response.json({ error: validated.message }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("po_orders")
    // created_at/updated_at are now managed by DB defaults + trigger.
    .insert([validated.payload])
    .select(ORDER_SELECT_FIELDS)
    .single();

  if (error) {
    return Response.json(
      { error: "Failed to create order." },
      { status: 500 }
    );
  }

  if (!isRecord(data)) {
    return Response.json(
      { error: "Order created but response format is invalid." },
      { status: 500 }
    );
  }

  return Response.json(
    { order: serializeOrderRow(data) },
    { status: 201 }
  );
}
