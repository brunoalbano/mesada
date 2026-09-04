-- SOMENTE PARA TESTE LOCAL. Nao aplicar no Supabase.
-- Reproduz o minimo do ambiente Supabase de que as migrations dependem:
-- o schema auth, auth.uid(), os roles e os privilegios padrao.

create schema if not exists auth;

create table if not exists auth.users (
  id                 uuid primary key,
  email              text,
  raw_user_meta_data jsonb,
  is_anonymous       boolean not null default false
);

-- No Supabase, auth.uid() le a claim "sub" do JWT da requisicao.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', ''
  )::uuid
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon')                then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated')       then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role')        then create role service_role; end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then create role supabase_auth_admin; end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;

-- O Supabase concede DML nas tabelas de public para anon e authenticated;
-- quem restringe e a RLS. Reproduzir isso e essencial: um teste que passa
-- porque faltou GRANT nao prova nada sobre as policies.
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema public
  grant all on sequences to anon, authenticated;
