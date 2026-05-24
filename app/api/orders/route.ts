import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { attachRateLimitHeaders, limitOrderSubmitByPhone } from "@/lib/security/rate-limit";
import { validatePostRequestSecurity } from "@/lib/security/request";
import { sanitizePlainText } from "@/lib/security/sanitize";
import {
  maskPhone,
  sanitizeAddress,
  sanitizeName,
  sanitizeNotes,
  validateIndonesiaPhone,
} from "@/lib/security/validation";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const QRIS_FEE = 500;

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

type ProductLine = {
  product_id: string;
  qty: number;
};

type OrderItemSnapshot = {
  name: string;
  qty: number;
  price: number;
};

type CreateOrderInput = {
  customer_name: unknown;
  wa_number: unknown;
  address: unknown;
  notes: unknown;
  items: unknown;
  delivery_method: unknown;
  consent_privacy: unknown;
};

type ProductRow = {
  id: string;
  name: string;
  price: number;
  stock: number;
  is_active: boolean | null;
};

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

function parseProductLines(rawItems: unknown): ProductLine[] {
  const parsedItems =
    typeof rawItems === "string"
      ? (() => {
          try {
            return JSON.parse(rawItems);
          } catch {
            return [];
          }
        })()
      : rawItems;

  if (!Array.isArray(parsedItems)) {
    return [];
  }

  return parsedItems
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const productId = sanitizePlainText(item.product_id, { maxLength: 64 });
      const qty = Math.trunc(toSafeNumber(item.qty));

      if (!productId || qty <= 0 || qty > 100) {
        return null;
      }

      return { product_id: productId, qty };
    })
    .filter((value): value is ProductLine => value !== null);
}

function normalizeOrderSnapshotItems(items: unknown): OrderItemSnapshot[] {
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
    .filter((value): value is OrderItemSnapshot => value !== null);
}

function serializeOrderRow(row: Record<string, unknown>) {
  const normalizedPhone = toSafeString(row.wa_number).replace(/\D/g, "");
  const maskedPhone = normalizedPhone ? maskPhone(normalizedPhone) : "";

  return {
    id: toSafeString(row.id),
    customer_name: sanitizePlainText(row.customer_name, { maxLength: 100 }),
    wa_number: maskedPhone,
    address: sanitizePlainText(row.address, {
      maxLength: 300,
      preserveLineBreaks: true,
    }),
    notes: sanitizePlainText(row.notes, {
      maxLength: 300,
      preserveLineBreaks: true,
    }),
    items: normalizeOrderSnapshotItems(row.items),
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

function validateCreateOrderInput(body: unknown) {
  if (!isRecord(body)) {
    return { ok: false as const, message: "Payload tidak valid." };
  }

  const payload = body as CreateOrderInput;
  const customerName = sanitizeName(payload.customer_name);
  const phoneValidation = validateIndonesiaPhone(payload.wa_number);
  const address = sanitizeAddress(payload.address);
  const notes = sanitizeNotes(payload.notes);
  const items = parseProductLines(payload.items);
  const deliveryMethod = sanitizePlainText(payload.delivery_method, { maxLength: 20 });
  const consentPrivacy = payload.consent_privacy === true;

  if (!customerName) {
    return { ok: false as const, message: "Nama lengkap wajib diisi." };
  }

  if (!phoneValidation.ok) {
    return { ok: false as const, message: phoneValidation.message };
  }

  if (!address) {
    return { ok: false as const, message: "Alamat wajib diisi." };
  }

  if (!consentPrivacy) {
    return {
      ok: false as const,
      message: "Persetujuan penyimpanan data wajib dicentang.",
    };
  }

  if (deliveryMethod !== "do" && deliveryMethod !== "cod" && deliveryMethod !== "pickup") {
    return { ok: false as const, message: "Metode pengiriman tidak didukung." };
  }

  if (items.length === 0) {
    return { ok: false as const, message: "Keranjang pesanan kosong." };
  }

  return {
    ok: true as const,
    value: {
      customerName,
      phone: phoneValidation.normalized,
      address,
      notes,
      items,
      deliveryMethod: deliveryMethod as DeliveryMethod,
      consentPrivacy,
    },
  };
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

  const validated = validateCreateOrderInput(body);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.message }, { status: 400 });
  }

  const phoneLimit = await limitOrderSubmitByPhone(validated.value.phone);
  if (!phoneLimit.success) {
    const rateLimited = NextResponse.json(
      { error: "Batas kirim pesanan untuk nomor ini tercapai. Coba lagi nanti." },
      { status: 429 }
    );
    return attachRateLimitHeaders(rateLimited, phoneLimit);
  }

  const supabase = createSupabaseServiceRoleClient();
  const productIds = [...new Set(validated.value.items.map((item) => item.product_id))];
  const { data: rawProducts, error: productsError } = await supabase
    .from("products")
    .select("id, name, price, stock, is_active")
    .in("id", productIds);

  if (productsError) {
    return NextResponse.json(
      { error: "Gagal memuat data produk untuk validasi pesanan." },
      { status: 500 }
    );
  }

  const productRows = (rawProducts ?? []) as ProductRow[];
  const productMap = new Map(productRows.map((product) => [product.id, product]));

  const orderItems: OrderItemSnapshot[] = [];
  let totalQty = 0;
  let subtotalPrice = 0;

  for (const line of validated.value.items) {
    const product = productMap.get(line.product_id);

    if (!product || product.is_active === false) {
      return NextResponse.json(
        { error: "Ada produk yang tidak tersedia lagi. Silakan refresh katalog." },
        { status: 400 }
      );
    }

    if (line.qty > product.stock) {
      return NextResponse.json(
        { error: `Stok untuk ${product.name} tidak mencukupi.` },
        { status: 400 }
      );
    }

    const safeName = sanitizePlainText(product.name, { maxLength: 100 });
    const safePrice = toSafeNumber(product.price);

    orderItems.push({
      name: safeName,
      qty: line.qty,
      price: safePrice,
    });

    totalQty += line.qty;
    subtotalPrice += safePrice * line.qty;
  }

  const totalPrice = subtotalPrice + QRIS_FEE;

  const { data, error } = await supabase
    .from("po_orders")
    .insert([
      {
        customer_name: validated.value.customerName,
        wa_number: validated.value.phone,
        address: validated.value.address,
        notes: validated.value.notes,
        items: orderItems,
        total_qty: totalQty,
        total_price: totalPrice,
        qris_fee: QRIS_FEE,
        unique_code: 0,
        delivery_method: validated.value.deliveryMethod,
        payment_status: "unpaid",
        production_status: "pending",
      },
    ])
    .select(ORDER_SELECT_FIELDS)
    .single();

  if (error) {
    console.error("Supabase Insert Error:", error);
    return NextResponse.json(
      { error: "Gagal menyimpan pesanan. Detail: " + error.message },
      { status: 500 }
    );
  }

  if (!isRecord(data)) {
    return NextResponse.json(
      { error: "Pesanan tersimpan, tapi format respons tidak valid." },
      { status: 500 }
    );
  }

  const response = NextResponse.json(
    { order: serializeOrderRow(data) },
    { status: 201 }
  );
  return attachRateLimitHeaders(response, phoneLimit);
}
