-- Mesada — helpers de autorizacao, triggers do razao e das metas
-- Ver docs/architecture.md secoes 3.2, 3.3 e 4.4.
--
-- SQLSTATEs proprios, para que os testes provem a regra certa e nao apenas
-- "algo falhou":
--   MS001 estorno invalido
--   MS002 transicao de meta invalida
--   MS003 razao append-only
--   MS004 sem autorizacao
--   MS005 sessao anonima onde e exigida conta real

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
language sql stable set search_path = '' as $$
  select nullif(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'child_id', ''
  )::uuid
$$;

-- Sessao anonima tem role 'authenticated' e auth.uid() nao nulo. Onde o
-- requisito e "conta real", e isto que precisa ser checado, nunca a mera
-- existencia de sessao.
create or replace function app.is_real_user() returns boolean
language sql stable set search_path = '' as $$
  select auth.uid() is not null
     and not coalesce(
       (nullif(current_setting('request.jwt.claims', true), '')::jsonb
          ->> 'is_anonymous')::boolean, false)
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

create or replace function app.shares_family_with(p_user_id uuid) returns boolean
language sql security definer stable set search_path = '' as $$
  select exists (
    select 1
      from public.family_members mine
      join public.family_members theirs on theirs.family_id = mine.family_id
     where mine.user_id = auth.uid() and theirs.user_id = p_user_id
  )
$$;

-- Serializa por crianca. Usado pelos triggers de meta: FOR UPDATE em linha
-- inexistente nao tranca nada, entao criar meta e lancar ao mesmo tempo
-- passava sem se ver.
create or replace function app.lock_child(p_child_id uuid) returns void
language sql set search_path = '' as $$
  select pg_advisory_xact_lock(hashtextextended(p_child_id::text, 0))
$$;

-- ---------------------------------------------------------------------------
-- profiles: espelho legivel de auth.users
-- ---------------------------------------------------------------------------
create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  -- Sessao anonima e a crianca entrando pelo link, nao um responsavel.
  if coalesce(new.is_anonymous, false) then
    return new;
  end if;

  -- nullif no fim de cada ramo: split_part de string vazia devolve '', que nao
  -- e nulo, e o coalesce parava ali com um nome em branco.
  v_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Responsável'
  );

  insert into public.profiles (user_id, display_name)
  values (new.id, left(v_name, 60))
  on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- ---------------------------------------------------------------------------
-- Razao imutavel
--
-- O trigger cobre o caso que a policy nao cobre: o dono da tabela e roles com
-- BYPASSRLS ignoram RLS.
--
-- A excecao e estreita e deliberada: ON DELETE SET NULL em created_by, que e
-- como uma conta e apagada (LGPD). Sem ela, apagar um usuario que ja lancou
-- qualquer coisa falhava, e a promessa de exclusao da secao 4.7 era letra
-- morta. DELETE nao e bloqueado por trigger porque apagar familia ou crianca
-- precisa cascatear; quem barra DELETE de sessao de usuario e a ausencia de
-- policy mais o revoke.
-- ---------------------------------------------------------------------------
create or replace function app.transactions_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.created_by is null and old.created_by is not null
     and to_jsonb(new) - 'created_by' = to_jsonb(old) - 'created_by' then
    return new;
  end if;
  raise exception 'transactions é append-only: corrija por estorno'
    using errcode = 'MS003';
end $$;

drop trigger if exists trg_transactions_immutable on transactions;
create trigger trg_transactions_immutable
  before update on transactions
  for each row execute function app.transactions_immutable();

-- ---------------------------------------------------------------------------
-- Autoria e moeda vem do servidor, nunca do cliente
--
-- created_by_name e o unico registro de autoria que sobrevive a exclusao da
-- conta, num razao que nunca muda. Aceitar o valor do cliente deixava um pai
-- gravar o nome do outro.
--
-- A moeda vem da familia. Sem isso, um lancamento em outra moeda entrava na
-- mesma soma de saldo e podia satisfazer uma meta em BRL.
-- ---------------------------------------------------------------------------
create or replace function app.transactions_fill_server_fields() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select coalesce(p.display_name, 'Responsável') into new.created_by_name
    from public.profiles p where p.user_id = new.created_by;
  if new.created_by_name is null then
    new.created_by_name := 'Automático';
  end if;

  select f.currency into new.currency
    from public.children c join public.families f on f.id = c.family_id
   where c.id = new.child_id;
  return new;
end $$;

drop trigger if exists trg_transactions_fill on transactions;
create trigger trg_transactions_fill
  before insert on transactions
  for each row execute function app.transactions_fill_server_fields();

create or replace function app.goals_fill_currency() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select f.currency into new.currency
    from public.children c join public.families f on f.id = c.family_id
   where c.id = new.child_id;
  return new;
end $$;

drop trigger if exists trg_goals_fill_currency on goals;
create trigger trg_goals_fill_currency
  before insert on goals
  for each row execute function app.goals_fill_currency();

-- ---------------------------------------------------------------------------
-- Estorno
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
    raise exception 'transação estornada não existe' using errcode = 'MS001';
  end if;
  if original.reverses_id is not null then
    raise exception 'estorno de estorno não é permitido' using errcode = 'MS001';
  end if;
  if new.amount_cents <> -original.amount_cents then
    raise exception 'estorno deve ter valor oposto exato: esperado %, recebido %',
      -original.amount_cents, new.amount_cents using errcode = 'MS001';
  end if;
  return new;
end $$;

drop trigger if exists trg_transactions_check_reversal on transactions;
create trigger trg_transactions_check_reversal
  before insert on transactions
  for each row execute function app.transactions_check_reversal();

-- ---------------------------------------------------------------------------
-- Metas
--
-- O saldo e derivado, entao nada dispara na leitura: sem trigger, a meta
-- ficaria 'active' para sempre.
--
-- A serializacao e por advisory lock na crianca, nao por FOR UPDATE na meta.
-- FOR UPDATE em conjunto vazio nao tranca nada, entao "criar meta" e "lancar"
-- ao mesmo tempo nunca se viam: a meta nascia ativa com o saldo ja acima do
-- alvo, e ficava assim ate um lancamento futuro qualquer.
-- ---------------------------------------------------------------------------
create or replace function app.child_balance(p_child_id uuid) returns bigint
language sql security definer stable set search_path = '' as $$
  select coalesce(sum(amount_cents), 0)::bigint
    from public.transactions where child_id = p_child_id
$$;

create or replace function app.goal_check_reached() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  g   public.goals%rowtype;
  bal bigint;
begin
  perform app.lock_child(new.child_id);
  bal := app.child_balance(new.child_id);

  -- Estorno da transacao que alcancou uma meta.
  if new.reverses_id is not null then
    select * into g from public.goals
     where child_id = new.child_id
       and status = 'reached'
       and reached_by_transaction_id = new.reverses_id
       for update;

    if found then
      -- Reabre so quando o estorno realmente derruba o saldo abaixo do alvo.
      -- Estornar um lancamento antigo, com o saldo ainda acima, nao desfaz
      -- uma conquista legitima.
      if bal < g.target_cents
         -- E so quando nao ha outra meta ativa: reabrir por cima de uma meta
         -- nova violaria one_active_goal_per_child e derrubaria o estorno
         -- inteiro, deixando o unico mecanismo de correcao do produto sem
         -- funcionar assim que a crianca comeca a proxima meta.
         and not exists (select 1 from public.goals
                          where child_id = new.child_id and status = 'active') then
        update public.goals
           set status = 'active', reached_at = null, reached_by_transaction_id = null
         where id = g.id;
      end if;
      return null;
    end if;
  end if;

  select * into g from public.goals
   where child_id = new.child_id and status = 'active'
     for update;
  if not found then
    return null;
  end if;

  if bal >= g.target_cents then
    update public.goals
       set status = 'reached', reached_at = now(), reached_by_transaction_id = new.id
     where id = g.id;
  end if;
  return null;
end $$;

drop trigger if exists trg_goal_reached on transactions;
create trigger trg_goal_reached
  after insert on transactions
  for each row execute function app.goal_check_reached();

-- Meta criada quando o saldo JA esta acima do alvo nasce alcancada, e precisa
-- registrar qual transacao a alcancou: sem isso, nenhum estorno consegue
-- reabri-la, e a constraint goal_status_consistent recusa a linha.
create or replace function app.goal_check_reached_on_create() returns trigger
language plpgsql security definer set search_path = '' as $$
declare bal bigint;
begin
  if new.status <> 'active' then
    return new;
  end if;

  perform app.lock_child(new.child_id);
  bal := app.child_balance(new.child_id);

  if bal >= new.target_cents then
    new.status := 'reached';
    new.reached_at := now();
    select id into new.reached_by_transaction_id
      from public.transactions
     where child_id = new.child_id
     order by created_at desc, id desc
     limit 1;
  end if;
  return new;
end $$;

drop trigger if exists trg_goal_reached_on_create on goals;
create trigger trg_goal_reached_on_create
  before insert on goals
  for each row execute function app.goal_check_reached_on_create();

-- ---------------------------------------------------------------------------
-- Transicoes de meta
--
-- pg_trigger_depth() distingue a escrita do trigger da escrita do usuario. Um
-- GUC nao servia: set_config e executavel por qualquer um, entao o proprio
-- usuario desligava a guarda antes do UPDATE.
--
-- A guarda tambem cobre as colunas, e nao so status: sem isso, um responsavel
-- reescrevia alvo, data e procedencia de uma meta ja alcancada sem mudar o
-- status, e apontava reached_by_transaction_id para qualquer transacao.
-- ---------------------------------------------------------------------------
create or replace function app.goal_guard_transition() returns trigger
language plpgsql set search_path = '' as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if new.child_id is distinct from old.child_id then
    raise exception 'meta não muda de criança' using errcode = 'MS002';
  end if;

  if new.reached_at is distinct from old.reached_at
     or new.reached_by_transaction_id is distinct from old.reached_by_transaction_id then
    raise exception 'conquista de meta é escrita apenas pelo sistema'
      using errcode = 'MS002';
  end if;

  if old.status <> 'active' then
    raise exception 'meta % está em % e não muda mais', old.id, old.status
      using errcode = 'MS002';
  end if;

  if new.status not in ('active', 'cancelled') then
    raise exception 'meta só pode ser cancelada; alcançar é decisão do sistema'
      using errcode = 'MS002';
  end if;

  return new;
end $$;

drop trigger if exists trg_goal_guard_transition on goals;
create trigger trg_goal_guard_transition
  before update on goals
  for each row execute function app.goal_guard_transition();

-- ---------------------------------------------------------------------------
-- family_members: papel muda, pessoa nao
-- ---------------------------------------------------------------------------
create or replace function app.family_members_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.user_id is distinct from old.user_id
     or new.family_id is distinct from old.family_id then
    raise exception 'só o papel pode ser alterado; troque a pessoa por convite'
      using errcode = 'MS004';
  end if;
  return new;
end $$;

drop trigger if exists trg_family_members_guard on family_members;
create trigger trg_family_members_guard
  before update on family_members
  for each row execute function app.family_members_guard();
