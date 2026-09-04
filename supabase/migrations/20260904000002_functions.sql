-- Mesada — helpers de autorizacao, triggers do razao e das metas
-- Ver docs/architecture.md secoes 3.2, 3.3 e 4.4.

-- ---------------------------------------------------------------------------
-- Helpers de autorizacao
--
-- Sao SECURITY DEFINER de proposito. Subconsulta dentro de policy roda sob a
-- RLS de quem chama, entao uma policy em family_members que consulta
-- family_members produz "infinite recursion detected in policy". Os helpers
-- rodam fora da RLS e quebram esse ciclo. search_path vazio impede sequestro
-- de nome por schema no caminho do chamador.
-- ---------------------------------------------------------------------------

-- O nullif externo importa: sem sessao, current_setting devolve string vazia,
-- e ''::jsonb levanta erro em vez de devolver nulo.
create or replace function app.current_child_id() returns uuid
language sql stable as $$
  select nullif(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'child_id', ''
  )::uuid
$$;

create or replace function app.is_family_member(p_family_id uuid) returns boolean
language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.family_members fm
     where fm.family_id = p_family_id and fm.user_id = auth.uid()
  )
$$;

create or replace function app.is_family_owner(p_family_id uuid) returns boolean
language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.family_members fm
     where fm.family_id = p_family_id and fm.user_id = auth.uid() and fm.role = 'owner'
  )
$$;

-- Responsavel da familia a qual a crianca pertence.
create or replace function app.is_family_parent(p_child_id uuid) returns boolean
language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.children c
     join public.family_members fm on fm.family_id = c.family_id
    where c.id = p_child_id and fm.user_id = auth.uid()
  )
$$;

-- Idem, mas exige crianca nao arquivada. Usado nas policies de escrita:
-- arquivar preserva o historico e para de aceitar lancamento novo.
create or replace function app.is_active_family_child(p_child_id uuid) returns boolean
language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.children c
     join public.family_members fm on fm.family_id = c.family_id
    where c.id = p_child_id and fm.user_id = auth.uid() and c.archived_at is null
  )
$$;

-- Compartilham alguma familia. Usado na leitura de profiles.
create or replace function app.shares_family_with(p_user_id uuid) returns boolean
language sql security definer stable set search_path = '' as $$
  select exists (
    select 1
      from public.family_members mine
      join public.family_members theirs on theirs.family_id = mine.family_id
     where mine.user_id = auth.uid() and theirs.user_id = p_user_id
  )
$$;

-- ---------------------------------------------------------------------------
-- profiles: espelho legivel de auth.users
-- ---------------------------------------------------------------------------
create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Sessao anonima e a crianca entrando pelo link, nao um responsavel.
  -- Sem esta guarda, cada abertura de link criava um perfil de responsavel.
  if coalesce(new.is_anonymous, false) then
    return new;
  end if;

  insert into public.profiles (user_id, display_name)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      split_part(coalesce(new.email, ''), '@', 1),
      'Responsável'
    )
  )
  on conflict (user_id) do nothing;
  return new;
end $$;

-- Supabase permite trigger em auth.users; e como o espelho se mantem.
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- ---------------------------------------------------------------------------
-- Razao imutavel
--
-- A ausencia de policy ja nega update e delete para sessoes de usuario, e o
-- revoke da migration de RLS reforca. Este trigger cobre o caso restante:
-- o dono da tabela e roles com BYPASSRLS ignoram policy. O historico e o
-- registro de dinheiro de uma crianca; ele nao muda por nenhum caminho.
-- ---------------------------------------------------------------------------
create or replace function app.transactions_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'transactions é append-only: corrija por estorno, nunca por % ', tg_op;
end $$;

create trigger trg_transactions_immutable
  before update or delete on transactions
  for each row execute function app.transactions_immutable();

-- ---------------------------------------------------------------------------
-- Estorno
--
-- A FK composta reversal_same_child ja garante mesma crianca. Faltam o valor
-- oposto exato e a proibicao de encadeamento: sem isso, um "estorno" de -1000
-- podia ser +500000, e uma cadeia alternada reaplicava o valor original.
-- ---------------------------------------------------------------------------
create or replace function app.transactions_check_reversal() returns trigger
language plpgsql security definer set search_path = '' as $$
declare original public.transactions%rowtype;
begin
  if new.reverses_id is null then
    return new;
  end if;

  select * into original from public.transactions where id = new.reverses_id for update;
  if not found then
    raise exception 'transação estornada não existe';
  end if;
  if original.reverses_id is not null then
    raise exception 'estorno de estorno não é permitido';
  end if;
  if new.amount_cents <> -original.amount_cents then
    raise exception 'estorno deve ter valor oposto exato: esperado %, recebido %',
      -original.amount_cents, new.amount_cents;
  end if;
  return new;
end $$;

create trigger trg_transactions_check_reversal
  before insert on transactions
  for each row execute function app.transactions_check_reversal();

-- ---------------------------------------------------------------------------
-- Metas
--
-- O saldo e derivado, entao nada dispara na leitura: sem trigger, a meta
-- ficaria 'active' para sempre. O unico evento capaz de mover o saldo e uma
-- insercao em transactions.
--
-- A ORDEM E TRAVAR E DEPOIS SOMAR. Somar antes de travar esta errado: em
-- READ COMMITTED, dois responsaveis lancando ao mesmo tempo veem cada um
-- apenas a propria linha nao confirmada, calculam saldo abaixo do alvo, e
-- nenhum dos dois marca a meta. Travando primeiro, a transacao bloqueada
-- recebe snapshot novo ao seguir e enxerga a insercao da outra.
-- ---------------------------------------------------------------------------
create or replace function app.goal_check_reached() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  g   public.goals%rowtype;
  bal bigint;
begin
  perform set_config('app.bypass_goal_guard', 'on', true);

  -- Estornar a transacao que alcancou a meta reabre a meta. Sem isso, um
  -- lancamento errado de R$ 4.000 congelava a meta para sempre e o unico
  -- mecanismo de correcao do produto nao a alcancava.
  if new.reverses_id is not null then
    update public.goals
       set status = 'active', reached_at = null, reached_by_transaction_id = null
     where reached_by_transaction_id = new.reverses_id;
  end if;

  -- 1) trava a meta ativa da crianca
  select * into g
    from public.goals
   where child_id = new.child_id and status = 'active'
     for update;

  if not found then
    perform set_config('app.bypass_goal_guard', 'off', true);
    return null;
  end if;

  -- 2) so depois da trava, soma em statement novo
  select coalesce(sum(amount_cents), 0) into bal
    from public.transactions
   where child_id = new.child_id;

  if bal >= g.target_cents then
    update public.goals
       set status = 'reached',
           reached_at = now(),
           reached_by_transaction_id = new.id
     where id = g.id;
  end if;

  perform set_config('app.bypass_goal_guard', 'off', true);
  return null;
end $$;

create trigger trg_goal_reached
  after insert on transactions
  for each row execute function app.goal_check_reached();

-- Meta criada quando o saldo JA esta acima do alvo nunca dispara o trigger
-- de insercao em transactions, e ficaria ativa acima de 100% para sempre.
create or replace function app.goal_check_reached_on_create() returns trigger
language plpgsql security definer set search_path = '' as $$
declare bal bigint;
begin
  if new.status <> 'active' then
    return new;
  end if;

  select coalesce(sum(amount_cents), 0) into bal
    from public.transactions
   where child_id = new.child_id;

  if bal >= new.target_cents then
    new.status := 'reached';
    new.reached_at := now();
  end if;
  return new;
end $$;

create trigger trg_goal_reached_on_create
  before insert on goals
  for each row execute function app.goal_check_reached_on_create();

-- Uma meta alcancada nunca volta a ser ativa por acao de usuario. A unica
-- excecao e o trigger de estorno acima, que sinaliza pela GUC de sessao.
create or replace function app.goal_guard_transition() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('app.bypass_goal_guard', true), 'off') = 'on' then
    return new;
  end if;
  if old.status <> 'active' and new.status is distinct from old.status then
    raise exception 'meta % não pode sair do estado %', old.id, old.status;
  end if;
  return new;
end $$;

create trigger trg_goal_guard_transition
  before update on goals
  for each row execute function app.goal_guard_transition();
