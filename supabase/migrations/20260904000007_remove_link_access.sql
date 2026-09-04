-- Mesada — remove o acesso por link
--
-- Decisao de produto: a crianca passa a entrar sempre com conta propria
-- (Google ou magic link). O link com token na URL sai do produto.
--
-- Consequencia aceita e registrada: conta Google exige 13 anos no Brasil, e
-- conta supervisionada por Family Link pode ter o OAuth de terceiros bloqueado
-- pelo controle parental. Crianca abaixo dessa idade fica sem acesso proprio.
-- Ver docs/architecture.md secao 4.2.
--
-- O que sai junto, por deixar de ter uso:
--   * access_tokens e toda a maquina de troca de token;
--   * o sign-in anonimo, que existia so para dar sessao a quem chegava por
--     link — e com ele, o risco de qualquer um com a chave publicavel gerar
--     uma sessao 'authenticated';
--   * token_exchange_attempts e o limite de taxa da rota de troca;
--   * o service_role na aplicacao, que tinha exatamente um uso legitimo.

-- As policies e os grants de access_tokens somem junto com a tabela.
drop function if exists public.redeem_child_token(bytea, uuid, inet);
drop function if exists public.revoke_access_token(uuid);
drop function if exists app.exchange_allowed(inet);
drop function if exists app.purge_exchange_attempts();
drop table if exists token_exchange_attempts;

-- Identidades criadas por link deixam de existir. Em desenvolvimento isso é
-- dado descartável; em produção a tabela ainda está vazia.
delete from child_identities where provider = 'link';

alter table child_identities drop constraint if exists link_identity_has_token;
alter table child_identities drop column if exists access_token_id;
alter table child_identities drop constraint if exists child_identities_provider_check;
alter table child_identities add constraint child_identities_provider_check
  check (provider in ('google', 'email'));

drop table if exists access_tokens;

-- O hook continua existindo: e ele que traduz "esta conta e da Ana" em uma
-- claim que a RLS entende, e e no refresh que a revogacao passa a valer.
-- O que sai e a checagem de validade do link, que nao tem mais objeto.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_claims   jsonb := coalesce(event -> 'claims', '{}'::jsonb);
  v_child_id uuid;
begin
  select ci.child_id into v_child_id
    from public.child_identities ci
   where ci.auth_user_id = (event ->> 'user_id')::uuid
     and ci.revoked_at is null
   order by ci.linked_at desc
   limit 1;

  if v_child_id is not null then
    v_claims := v_claims
      || jsonb_build_object('child_id', v_child_id::text)
      || jsonb_build_object('child_scope', 'read');
  end if;

  return jsonb_set(event, '{claims}', v_claims);
end $$;

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;
