-- Security hardening:
-- - Enforce RLS on all public tables
-- - Add strict policies for orders/products/categories
-- - Add phone encryption/hash columns with pgcrypto
-- - Add privacy consent column

create extension if not exists pgcrypto;

do $$
declare
  table_name text;
begin
  for table_name in
    select tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
  end loop;
end
$$;

do $$
begin
  if to_regclass('public.po_orders') is not null then
    alter table public.po_orders
      add column if not exists wa_number_hash text,
      add column if not exists wa_number_encrypted bytea,
      add column if not exists privacy_consent boolean not null default false;
  end if;

  if to_regclass('public.orders') is not null then
    alter table public.orders
      add column if not exists wa_number_hash text,
      add column if not exists wa_number_encrypted bytea,
      add column if not exists privacy_consent boolean not null default false;
  end if;
end
$$;

create or replace function public.encrypt_order_phone_columns()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  key_material text;
  normalized_phone text;
begin
  if new.wa_number is null then
    return new;
  end if;

  key_material := current_setting('app.settings.jwt_secret', true);
  if key_material is null or key_material = '' then
    raise exception 'Missing app.settings.jwt_secret. Cannot encrypt wa_number.';
  end if;

  normalized_phone := regexp_replace(new.wa_number, '[^0-9]', '', 'g');
  if normalized_phone like '0%' then
    normalized_phone := '62' || substr(normalized_phone, 2);
  elsif normalized_phone like '8%' then
    normalized_phone := '62' || normalized_phone;
  end if;

  new.wa_number_hash := encode(digest(normalized_phone, 'sha256'), 'hex');
  new.wa_number_encrypted := pgp_sym_encrypt(normalized_phone, key_material);
  new.wa_number := normalized_phone;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.po_orders') is not null then
    drop trigger if exists trg_po_orders_encrypt_phone on public.po_orders;
    create trigger trg_po_orders_encrypt_phone
    before insert or update of wa_number on public.po_orders
    for each row
    execute function public.encrypt_order_phone_columns();

    update public.po_orders
    set wa_number = wa_number
    where wa_number is not null
      and (wa_number_hash is null or wa_number_encrypted is null);
  end if;

  if to_regclass('public.orders') is not null then
    drop trigger if exists trg_orders_encrypt_phone on public.orders;
    create trigger trg_orders_encrypt_phone
    before insert or update of wa_number on public.orders
    for each row
    execute function public.encrypt_order_phone_columns();

    update public.orders
    set wa_number = wa_number
    where wa_number is not null
      and (wa_number_hash is null or wa_number_encrypted is null);
  end if;
end
$$;

do $$
declare
  target_table text;
  phone_column text;
begin
  foreach target_table in array array['orders', 'po_orders']
  loop
    if to_regclass(format('public.%s', target_table)) is null then
      continue;
    end if;

    select column_name
    into phone_column
    from information_schema.columns
    where table_schema = 'public'
      and table_name = target_table
      and column_name in ('phone', 'wa_number')
    order by case when column_name = 'phone' then 0 else 1 end
    limit 1;

    if phone_column is null then
      continue;
    end if;

    execute format(
      'drop policy if exists %I on public.%I',
      target_table || '_select_owner_or_service',
      target_table
    );

    execute format(
      'create policy %I on public.%I for select to anon, authenticated using (((%I)::text = auth.uid()::text) or (coalesce(current_setting(''request.jwt.claim.role'', true), '''') = ''service_role''))',
      target_table || '_select_owner_or_service',
      target_table,
      phone_column
    );

    execute format(
      'drop policy if exists %I on public.%I',
      target_table || '_service_write_only',
      target_table
    );

    execute format(
      'create policy %I on public.%I for all to service_role using (true) with check (true)',
      target_table || '_service_write_only',
      target_table
    );
  end loop;
end
$$;

do $$
begin
  if to_regclass('public.products') is not null then
    drop policy if exists products_public_read on public.products;
    create policy products_public_read
      on public.products
      for select
      to anon, authenticated
      using (true);

    drop policy if exists products_service_write_only on public.products;
    create policy products_service_write_only
      on public.products
      for all
      to service_role
      using (true)
      with check (true);
  end if;

  if to_regclass('public.categories') is not null then
    drop policy if exists categories_public_read on public.categories;
    create policy categories_public_read
      on public.categories
      for select
      to anon, authenticated
      using (true);

    drop policy if exists categories_service_write_only on public.categories;
    create policy categories_service_write_only
      on public.categories
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end
$$;
