# Timestamp Contract (WIB / Asia/Jakarta)

## Rules

1. `po_orders.created_at` and `po_orders.updated_at` use `timestamp with time zone`.
2. New rows use `default now()`.
3. `updated_at` is auto-updated by trigger on every `UPDATE`.
4. Database timezone is set to `Asia/Jakarta` for session output.
5. No extra WIB columns are created.

## Database Migration

Use `supabase/migrations/20260524124500_po_orders_wib_timestamps.sql` to apply:

- `alter database postgres set timezone to 'Asia/Jakarta'`
- `alter column created_at set default now()`
- `alter column updated_at set default now()`
- trigger `trg_po_orders_set_updated_at`

## App Layer

- Next.js API no longer overrides `created_at`/`updated_at` on insert.
- UI formats timestamps using `formatWIB(...)` in `lib/datetime.ts`.

Usage:

```ts
formatWIB(order.created_at)
```

## Analytics / Grouping

- For daily grouping by Jakarta date in frontend, use:
  - `getWIBDateKey(...)`
  - `groupByWIBDate(...)`
