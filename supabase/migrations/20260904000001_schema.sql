-- Mesada — schema base
-- Ver docs/architecture.md secao 3.
--
-- Convencoes:
--   * dinheiro em centavos inteiros (bigint), nunca ponto flutuante;
--   * tempo em timestamptz, apresentacao converte para o fuso da familia;
--   * transactions e append-only: correcao e estorno, nunca update ou delete.

create schema if not exists app;

-- ---------------------------------------------------------------------------
-- profiles
-- auth.users nao e legivel pelo cliente, entao a autoria do historico precisa
-- de uma copia legivel por quem compartilha familia.
-- ---------------------------------------------------------------------------
create table profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url   text,
  locale       text check (locale in ('pt', 'en', 'es')),
  updated_at   timestamptz not null default now(),
  constraint display_name_sane check (length(btrim(display_name)) between 1 and 60)
);

-- ---------------------------------------------------------------------------
-- families
-- ---------------------------------------------------------------------------
create table families (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  currency   char(3) not null default 'BRL',
  locale     text not null default 'pt' check (locale in ('pt', 'en', 'es')),
  timezone   text not null default 'America/Sao_Paulo',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint family_name_sane check (length(btrim(name)) between 1 and 60)
);

create table family_members (
  family_id uuid not null references families(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  role      text not null check (role in ('owner', 'parent')),
  joined_at timestamptz not null default now(),
  primary key (family_id, user_id)
);

-- A PK e (family_id, user_id); a RLS de todas as tabelas procura por user_id,
-- que e coluna nao lider. Sem este indice, cada verificacao e varredura.
create index family_members_user_id_idx on family_members (user_id);

-- ---------------------------------------------------------------------------
-- children
-- ---------------------------------------------------------------------------
create table children (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references families(id) on delete cascade,
  name        text not null,
  avatar_key  text not null,
  birthdate   date,
  ui_mode     text not null default 'pequeno' check (ui_mode in ('pequeno', 'grande')),
  locale      text check (locale in ('pt', 'en', 'es')),
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  constraint child_name_sane check (length(btrim(name)) between 1 and 40)
);

create index children_family_id_idx on children (family_id);

-- ---------------------------------------------------------------------------
-- access_tokens — links de acesso da crianca
-- token_hash guarda HMAC-SHA256(token, TOKEN_PEPPER), calculado na aplicacao.
-- O pepper vive fora do banco, entao um dump vazado nao permite testar tokens.
-- ---------------------------------------------------------------------------
create table access_tokens (
  id           uuid primary key default gen_random_uuid(),
  child_id     uuid not null references children(id) on delete cascade,
  token_hash   bytea not null unique,
  label        text,
  can_request  boolean not null default false,
  expires_at   timestamptz not null,
  revoked_at   timestamptz,
  last_used_at timestamptz,
  failed_count int not null default 0,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index access_tokens_child_id_idx on access_tokens (child_id);

-- ---------------------------------------------------------------------------
-- child_identities — contas e sessoes de link ligadas a um perfil de crianca
--
-- access_token_id e o que faz a revogacao funcionar: sem ele, o hook reemitia
-- a claim a cada refresh e um link revogado continuava valendo para sempre.
-- ---------------------------------------------------------------------------
create table child_identities (
  child_id        uuid not null references children(id) on delete cascade,
  auth_user_id    uuid not null references auth.users(id) on delete cascade unique,
  provider        text not null check (provider in ('google', 'email', 'link')),
  access_token_id uuid references access_tokens(id) on delete cascade,
  revoked_at      timestamptz,
  linked_at       timestamptz not null default now(),
  primary key (child_id, auth_user_id),
  constraint link_identity_has_token
    check ((provider = 'link') = (access_token_id is not null))
);

create index child_identities_access_token_idx on child_identities (access_token_id);

-- ---------------------------------------------------------------------------
-- invites
-- Convite de responsavel carrega privilegio maior que o link da crianca,
-- entao recebe o mesmo tratamento de token: hash com pepper, validade curta,
-- revogacao e uso unico atomico.
-- ---------------------------------------------------------------------------
create table invites (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null references families(id) on delete cascade,
  kind        text not null check (kind in ('parent', 'child')),
  child_id    uuid references children(id) on delete cascade,
  email       text,
  token_hash  bytea not null unique,
  role        text check (role in ('owner', 'parent')),
  expires_at  timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  revoked_at  timestamptz,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint invite_child_shape  check ((kind = 'child')  = (child_id is not null)),
  constraint invite_parent_shape check ((kind = 'parent') = (role is not null))
);

create index invites_family_id_idx on invites (family_id);
create index invites_child_id_idx  on invites (child_id);

-- Um convite de responsavel pendente por endereco, por familia.
create unique index invites_pending_email_idx on invites (family_id, lower(email))
  where accepted_at is null and revoked_at is null and email is not null;

-- ---------------------------------------------------------------------------
-- transactions — razao append-only
--
-- id vem do cliente e serve de chave de idempotencia.
-- created_by e anulavel para que uma conta possa ser apagada (LGPD);
-- created_by_name preserva a autoria no historico.
-- ---------------------------------------------------------------------------
create table transactions (
  id              uuid primary key,
  child_id        uuid not null references children(id) on delete cascade,
  amount_cents    bigint not null,
  currency        char(3) not null default 'BRL',
  reason          text not null,
  emoji           text,
  reverses_id     uuid unique,
  source          text not null default 'manual'
                  check (source in ('manual', 'recurring', 'chore', 'request')),
  created_by      uuid references auth.users(id) on delete set null,
  created_by_name text not null,   -- preenchido por trigger, nao pelo cliente
  created_at      timestamptz not null default now(),
  constraint amount_not_zero check (amount_cents <> 0),
  constraint amount_sane     check (amount_cents between -100000000 and 100000000),
  constraint reason_sane     check (length(btrim(reason)) between 1 and 200),
  constraint created_by_name_sane check (length(btrim(created_by_name)) between 1 and 60),
  -- alvo da FK composta abaixo
  constraint transactions_id_child unique (id, child_id),
  -- um estorno so pode apontar para transacao da MESMA crianca; sem isso um
  -- estorno podia mover dinheiro entre irmaos ou apontar para outra familia
  constraint reversal_same_child
    foreign key (reverses_id, child_id) references transactions (id, child_id)
);

-- historico paginado e soma de saldo
create index transactions_child_created_idx on transactions (child_id, created_at desc, id desc);

-- ---------------------------------------------------------------------------
-- goals — uma meta ativa por crianca
-- ---------------------------------------------------------------------------
create table goals (
  id            uuid primary key default gen_random_uuid(),
  child_id      uuid not null references children(id) on delete cascade,
  title         text not null,
  emoji         text not null default '🎯',
  target_cents  bigint not null check (target_cents > 0),
  currency      char(3) not null default 'BRL',
  status        text not null default 'active'
                check (status in ('active', 'reached', 'cancelled')),
  reached_at    timestamptz,
  -- cascade, e nao "set null": anular deixaria a linha em 'reached' sem
  -- procedencia, o que goal_status_consistent recusa, e o delete em cascata da
  -- crianca falharia. Uma transacao so e apagada quando a crianca inteira e,
  -- e ai a meta vai junto.
  reached_by_transaction_id uuid references transactions(id) on delete cascade,
  cancelled_at  timestamptz,
  cancelled_by  uuid references auth.users(id) on delete set null,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint goal_title_sane check (length(btrim(title)) between 1 and 60),
  -- reached_by_transaction_id entra na constraint: sem ele, uma meta podia
  -- nascer alcancada sem registrar o que a alcancou, e nenhum estorno
  -- conseguiria mais reabri-la.
  constraint goal_status_consistent check (
    (status = 'reached')   = (reached_at   is not null) and
    (status = 'reached')   = (reached_by_transaction_id is not null) and
    (status = 'cancelled') = (cancelled_at is not null)
  )
);

create unique index one_active_goal_per_child on goals (child_id) where status = 'active';
create index goals_child_created_idx on goals (child_id, created_at desc);

-- Predicado do caminho de estorno, que e quente. Sem este indice, cada estorno
-- faz varredura sequencial em goals.
create index goals_reached_by_idx on goals (reached_by_transaction_id)
  where reached_by_transaction_id is not null;

-- Chaves estrangeiras para auth.users: sem indice, apagar uma conta varre cada
-- tabela referenciadora.
create index transactions_created_by_idx  on transactions (created_by);
create index goals_created_by_idx         on goals (created_by);
create index goals_cancelled_by_idx       on goals (cancelled_by);
create index families_created_by_idx      on families (created_by);
create index access_tokens_created_by_idx on access_tokens (created_by);
create index invites_created_by_idx       on invites (created_by);
create index invites_accepted_by_idx      on invites (accepted_by);

-- ---------------------------------------------------------------------------
-- child_balances — o saldo definido em um lugar so, para nao divergir
-- entre chamadas. security_invoker faz a view respeitar a RLS de quem chama.
-- ---------------------------------------------------------------------------
create view child_balances with (security_invoker = on) as
  select child_id, coalesce(sum(amount_cents), 0)::bigint as balance_cents
    from transactions
   group by child_id;
