-- Mesada — operacoes que nao sao expressaveis como policy
-- Ver docs/architecture.md secao 5.
--
-- Tres operacoes escrevem em linhas as quais o usuario ainda nao tem acesso:
-- criar familia, aceitar convite e trocar token de link por sessao. Escritas
-- assim so podem ser feitas por funcao SECURITY DEFINER que valida a
-- credencial ela mesma. Sao a alternativa sancionada ao service_role, que
-- fica restrito a rota de troca de token.
--
-- Toda funcao aqui usa search_path vazio e nomes qualificados.
--
-- Elas vivem em public de proposito: o PostgREST expoe apenas o schema public,
-- entao uma funcao em app nao e chamavel por supabase.rpc(). O schema app fica
-- para os helpers usados dentro das policies, que ninguem chama de fora.

-- ---------------------------------------------------------------------------
-- Limite de taxa da rota de troca
--
-- Por IP e com teto global, em Postgres. Limite por token nao impede
-- varredura, que usa um token diferente a cada requisicao; e limitador em
-- memoria nao funciona em serverless, onde cada instancia tem a propria.
-- ---------------------------------------------------------------------------
create table token_exchange_attempts (
  id           bigserial primary key,
  client_ip    inet not null,
  succeeded    boolean not null,
  attempted_at timestamptz not null default now()
);

create index token_exchange_attempts_ip_idx on token_exchange_attempts (client_ip, attempted_at desc);
create index token_exchange_attempts_time_idx on token_exchange_attempts (attempted_at desc);

-- Sem retencao a tabela cresce para sempre e o teto global passa a varrer um
-- indice cada vez maior. Chamada pela faxina agendada.
create or replace function app.purge_exchange_attempts() returns bigint
language plpgsql security definer set search_path = '' as $$
declare n bigint;
begin
  delete from public.token_exchange_attempts where attempted_at < now() - interval '1 day';
  get diagnostics n = row_count;
  return n;
end $$;

alter table token_exchange_attempts enable row level security;
revoke all on token_exchange_attempts from anon, authenticated;

create or replace function app.exchange_allowed(p_client_ip inet) returns boolean
language sql security definer stable set search_path = '' as $$
  select
    (select count(*) from public.token_exchange_attempts
      where client_ip = p_client_ip and not succeeded
        and attempted_at > now() - interval '15 minutes') < 10
    and
    (select count(*) from public.token_exchange_attempts
      where not succeeded and attempted_at > now() - interval '5 minutes') < 200
$$;

-- ---------------------------------------------------------------------------
-- Criar familia
-- Insere families e a linha de family_members do criador, como 'owner'.
-- ---------------------------------------------------------------------------
create or replace function public.create_family(
  p_name     text,
  p_locale   text default 'pt',
  p_timezone text default 'America/Sao_Paulo'
) returns public.families
language plpgsql security definer set search_path = '' as $$
declare
  v_user   uuid := auth.uid();
  v_family public.families;
begin
  -- Sessao anonima tambem tem role authenticated e auth.uid() nao nulo.
  -- Sem esta checagem, qualquer um com a chave anon publica criava familias
  -- em laco, sem nunca ter feito login.
  if not app.is_real_user() then
    raise exception 'esta ação exige uma conta' using errcode = 'MS005';
  end if;

  insert into public.families (name, locale, timezone, created_by)
  values (p_name, p_locale, p_timezone, v_user)
  returning * into v_family;

  insert into public.family_members (family_id, user_id, role)
  values (v_family.id, v_user, 'owner');

  return v_family;
end $$;

-- ---------------------------------------------------------------------------
-- Aceitar convite de responsavel
--
-- Uso unico atomico: o update so afeta linha ainda nao aceita, nao revogada
-- e nao expirada. Duas redencoes concorrentes do mesmo link nao podem ambas
-- ter sucesso. Quando o convite tras e-mail, o endereco tem de bater com o
-- da conta que esta aceitando: convite de responsavel nao e ao portador.
-- ---------------------------------------------------------------------------
-- O e-mail vem da sessao, nunca de parametro. Com o endereco vindo do
-- chamador, quem lesse um convite podia satisfazer o proprio vinculo e
-- escalar para owner.
create or replace function public.accept_parent_invite(p_token_hash bytea)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user   uuid := auth.uid();
  v_email  text := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email';
  v_invite public.invites;
begin
  if not app.is_real_user() then
    raise exception 'esta ação exige uma conta' using errcode = 'MS005';
  end if;

  update public.invites
     set accepted_at = now(), accepted_by = v_user
   where token_hash = p_token_hash
     and kind = 'parent'
     and accepted_at is null
     and revoked_at is null
     and expires_at > now()
     and (email is null or lower(email) = lower(v_email))
  returning * into v_invite;

  if not found then
    raise exception 'convite inválido, expirado ou já utilizado';
  end if;

  insert into public.family_members (family_id, user_id, role)
  values (v_invite.family_id, v_user, v_invite.role)
  on conflict (family_id, user_id) do nothing;

  return v_invite.family_id;
end $$;

-- ---------------------------------------------------------------------------
-- Aceitar convite de crianca (vincular conta a um perfil)
--
-- Vincular NUNCA parte de uma sessao de link: posse do link viraria uma
-- credencial permanente e independente, que sobrevive a revogacao do link.
-- Exige convite emitido pelo responsavel.
-- ---------------------------------------------------------------------------
create or replace function public.accept_child_invite(
  p_token_hash bytea,
  p_provider   text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user   uuid := auth.uid();
  v_invite public.invites;
begin
  -- Uma sessao de link nunca vira conta: posse do link viraria credencial
  -- permanente, que sobrevive a revogacao do link.
  if not app.is_real_user() then
    raise exception 'vincular conta exige login com conta própria'
      using errcode = 'MS005';
  end if;
  if p_provider not in ('google', 'email') then
    raise exception 'provider inválido para convite de criança: %', p_provider;
  end if;

  update public.invites
     set accepted_at = now(), accepted_by = v_user
   where token_hash = p_token_hash
     and kind = 'child'
     and accepted_at is null
     and revoked_at is null
     and expires_at > now()
  returning * into v_invite;

  if not found then
    raise exception 'convite inválido, expirado ou já utilizado';
  end if;

  insert into public.child_identities (child_id, auth_user_id, provider)
  values (v_invite.child_id, v_user, p_provider);

  return v_invite.child_id;
end $$;

-- ---------------------------------------------------------------------------
-- Trocar token de link por identidade
--
-- Chamada pela rota de servidor com service_role, DEPOIS de signInAnonymously
-- e ANTES de refreshSession. A ordem importa: o hook roda na criacao do
-- token, e a identidade so existe depois do usuario anonimo, entao o primeiro
-- JWT sai sem a claim e precisa do refresh.
-- ---------------------------------------------------------------------------
-- Devolve status em vez de levantar excecao. Motivo concreto: "raise" aborta
-- a transacao, e a insercao em token_exchange_attempts feita logo antes era
-- desfeita junto. A tabela so acumulava sucessos, os dois contadores filtram
-- por falha, e o limite nunca disparava: forca bruta ilimitada contra o link
-- da crianca. Com status de retorno, a falha e gravada e permanece gravada.
create or replace function public.redeem_child_token(
  p_token_hash   bytea,
  p_auth_user_id uuid,
  p_client_ip    inet
) returns table (child_id uuid, status text)
language plpgsql security definer set search_path = '' as $$
declare
  v_token    public.access_tokens;
  v_existing public.child_identities;
begin
  if not app.exchange_allowed(p_client_ip) then
    return query select null::uuid, 'rate_limited';
    return;
  end if;

  select * into v_token
    from public.access_tokens
   where token_hash = p_token_hash
     and revoked_at is null
     and expires_at > now()
     for update;

  if not found then
    insert into public.token_exchange_attempts (client_ip, succeeded) values (p_client_ip, false);
    return query select null::uuid, 'invalid';
    return;
  end if;

  -- auth_user_id e unico. Sem tratar o conflito, um dispositivo ja vinculado a
  -- um filho que abrisse o link de outro recebia sucesso e o child_id novo,
  -- enquanto o hook seguia carimbando o antigo: a interface de um filho com o
  -- extrato do outro.
  select * into v_existing from public.child_identities
   where auth_user_id = p_auth_user_id;

  if found and v_existing.child_id <> v_token.child_id then
    insert into public.token_exchange_attempts (client_ip, succeeded) values (p_client_ip, false);
    return query select null::uuid, 'bound_to_other_child';
    return;
  end if;

  if found then
    update public.child_identities
       set access_token_id = v_token.id, revoked_at = null, linked_at = now()
     where auth_user_id = p_auth_user_id;
  else
    insert into public.child_identities (child_id, auth_user_id, provider, access_token_id)
    values (v_token.child_id, p_auth_user_id, 'link', v_token.id);
  end if;

  update public.access_tokens set last_used_at = now() where id = v_token.id;
  insert into public.token_exchange_attempts (client_ip, succeeded) values (p_client_ip, true);

  return query select v_token.child_id, 'ok';
end $$;

-- ---------------------------------------------------------------------------
-- Revogar link
--
-- Marcar revoked_at nao invalida JWT ja emitido. Esta funcao apaga as
-- identidades derivadas e devolve os auth_user_id anonimos para a aplicacao
-- destrui-los pela admin API. Sem esse segundo passo, a sessao viva continua.
-- ---------------------------------------------------------------------------
create or replace function public.revoke_access_token(p_token_id uuid)
returns setof uuid
language plpgsql security definer set search_path = '' as $$
declare v_child uuid;
begin
  -- Uma mensagem so para os dois casos: duas mensagens diferentes diriam a um
  -- estranho se um id de link existe.
  select child_id into v_child from public.access_tokens where id = p_token_id;
  if v_child is null or not app.is_family_parent(v_child) then
    raise exception 'link não encontrado' using errcode = 'MS004';
  end if;

  update public.access_tokens
     set revoked_at = coalesce(revoked_at, now())
   where id = p_token_id;

  return query
    delete from public.child_identities
     where access_token_id = p_token_id
    returning auth_user_id;
end $$;

-- ---------------------------------------------------------------------------
-- Sair da familia
-- O ultimo owner nao sai antes de transferir. Sem isso a familia fica orfa.
-- ---------------------------------------------------------------------------
create or replace function public.leave_family(p_family_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user   uuid := auth.uid();
  v_role   text;
  v_owners int;
begin
  if not app.is_real_user() then
    raise exception 'esta ação exige uma conta' using errcode = 'MS005';
  end if;

  select role into v_role from public.family_members
   where family_id = p_family_id and user_id = v_user;
  if v_role is null then
    raise exception 'você não pertence a esta família';
  end if;

  if v_role = 'owner' then
    select count(*) into v_owners from public.family_members
     where family_id = p_family_id and role = 'owner';
    if v_owners <= 1 then
      raise exception 'transfira a propriedade da família antes de sair';
    end if;
  end if;

  delete from public.family_members
   where family_id = p_family_id and user_id = v_user;
end $$;

-- ---------------------------------------------------------------------------
-- Permissoes
-- ---------------------------------------------------------------------------
-- Por padrao o Postgres concede EXECUTE a PUBLIC. Revogar primeiro, e conceder
-- so a quem precisa.
revoke execute on function public.create_family(text, text, text)          from public;
revoke execute on function public.accept_parent_invite(bytea)              from public;
revoke execute on function public.accept_child_invite(bytea, text)         from public;
revoke execute on function public.leave_family(uuid)                       from public;
revoke execute on function public.revoke_access_token(uuid)                from public;
revoke execute on function public.redeem_child_token(bytea, uuid, inet)    from public;
-- Os helpers de app tambem nascem com EXECUTE para PUBLIC.
--
-- Atencao: expressao de policy e avaliada com o direito de QUEM CONSULTA, nao
-- do dono da tabela. Os helpers usados dentro de policy precisam continuar
-- executaveis por authenticated, senao toda leitura vira
-- "permission denied for function". Quem nao aparece em policy fica fechado.
revoke execute on function app.exchange_allowed(inet)                      from public;
revoke execute on function app.purge_exchange_attempts()                   from public;
revoke execute on function app.is_family_member(uuid)                      from public;
revoke execute on function app.is_family_owner(uuid)                       from public;
revoke execute on function app.is_family_parent(uuid)                      from public;
revoke execute on function app.is_active_family_child(uuid)                from public;
revoke execute on function app.shares_family_with(uuid)                    from public;
revoke execute on function app.child_balance(uuid)                         from public;
revoke execute on function app.lock_child(uuid)                            from public;
revoke execute on function app.handle_new_user()                           from public;

grant execute on function public.create_family(text, text, text)   to authenticated;
grant execute on function public.accept_parent_invite(bytea) to authenticated;
grant execute on function public.accept_child_invite(bytea, text)  to authenticated;
grant execute on function public.leave_family(uuid)                to authenticated;
grant execute on function public.revoke_access_token(uuid)         to authenticated;

-- A troca de token e chamada apenas pela rota de servidor, com service_role.
-- Nenhuma sessao de usuario pode executa-la.
grant execute on function public.redeem_child_token(bytea, uuid, inet) to service_role;
grant execute on function app.purge_exchange_attempts() to service_role;
grant usage on schema app to authenticated, service_role;

-- Usados dentro das policies.
grant execute on function app.is_family_member(uuid)       to authenticated;
grant execute on function app.is_family_owner(uuid)        to authenticated;
grant execute on function app.is_family_parent(uuid)       to authenticated;
grant execute on function app.is_active_family_child(uuid) to authenticated;
grant execute on function app.shares_family_with(uuid)     to authenticated;
