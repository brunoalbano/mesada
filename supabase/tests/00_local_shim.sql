-- SOMENTE PARA TESTE LOCAL. Nao aplicar no Supabase.
-- Reproduz o minimo do ambiente Supabase de que as migrations dependem:
-- o schema auth, auth.uid(), os roles e os privilegios padrao.

-- Postgres 15 ou superior: child_balances usa security_invoker.
create extension if not exists pgcrypto;

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

-- Deliberadamente NAO ha ALTER DEFAULT PRIVILEGES aqui.
--
-- A versao anterior deste shim concedia DML por padrao, imitando o que se
-- supunha que o Supabase faz. O projeto real nao concedeu nada, e a aplicacao
-- respondia 42501 em toda leitura. O teste passava por causa de um GRANT que
-- producao nao tinha.
--
-- Sem esta concessao, a suite so passa se a migration 0006 conceder o que a
-- aplicacao precisa. E o mesmo raciocinio do outro lado: um teste que passa
-- por causa de privilegio que o alvo nao tem nao prova nada.
alter default privileges in schema public
  grant all on sequences to anon, authenticated;
