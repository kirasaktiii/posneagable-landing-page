-- po_orders timestamp timezone policy (WIB / Asia/Jakarta)
-- Scope: created_at + updated_at only

-- 1) Make new sessions default to WIB so timestamptz output is displayed in Asia/Jakarta.
-- If your migration runner wraps everything in a transaction, run this line manually in SQL Editor.
alter database postgres set timezone to 'Asia/Jakarta';

-- 2) Ensure timestamp columns are timezone-aware and default to current timestamptz.
-- NOTE: `timestamptz` is stored as an absolute instant; session timezone controls display.
alter table if exists public.po_orders
  alter column created_at type timestamp with time zone using created_at,
  alter column updated_at type timestamp with time zone using updated_at,
  alter column created_at set default now(),
  alter column updated_at set default now();

-- 3) Auto-update updated_at on every UPDATE.
create or replace function public.po_orders_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_po_orders_set_updated_at on public.po_orders;

create trigger trg_po_orders_set_updated_at
before update on public.po_orders
for each row
execute function public.po_orders_set_updated_at();
