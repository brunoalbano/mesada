# Mesada — Documento de Arquitetura e Design

**Status:** aprovado, revisado
**Versão:** 2.0
**Data:** 2026-09-04

Arquitetura, modelo de dados, autenticação e sistema de design do aplicativo **Mesada**. Produto e repositório se chamam **Mesada**. O cofrinho ilustrado é o elemento visual da marca, não o nome.

A versão 2.0 incorpora três revisões independentes (segurança, modelo de dados, consistência e viabilidade). As correções estruturais estão marcadas com **[R]** ao longo do texto, e o registro completo está em `docs/review-2026-09-04.md`.

---

## 1. Visão geral do produto

Aplicativo para pais controlarem a mesada dos filhos e para os filhos acompanharem o próprio saldo, o histórico e a meta de poupança.

Princípios que guiam todas as decisões técnicas:

1. **Mobile first.** Usado no celular, em pé, com uma mão. Desktop deve funcionar, não é prioridade de design.
2. **Lúdico e legível por crianças de 4 a 16 anos.** A interface da criança é a interface principal do produto.
3. **Histórico imutável.** Nenhum lançamento é apagado ou editado.
4. **Custo zero de operação.** Somente serviços com plano gratuito permanente.
5. **Isolamento de dados por família garantido no banco**, não apenas na aplicação.
6. **Multi-idioma desde o primeiro dia.** Português, inglês e espanhol.

---

## 2. Stack

| Camada | Escolha | Motivo |
|---|---|---|
| Framework | Next.js 15 (App Router, TypeScript, React Server Components) | Um único projeto para interface e API. TypeScript é a stack do time. |
| Hospedagem | Vercel, plano Hobby | Grátis, deploy por push, HTTPS e domínio incluídos, cron incluído. |
| Banco de dados | Supabase Postgres, plano Free | Postgres gerenciado com Row Level Security. 500 MB, muito acima da necessidade. |
| Autenticação | Supabase Auth | Google OAuth e magic link. Integra com RLS pelo JWT. |
| Estilo | Tailwind CSS + shadcn/ui | Rápido, mobile first por padrão, componentes acessíveis. |
| Animação | Motion | Micro-interações com respeito a `prefers-reduced-motion`. |
| PWA | Serwist | Service worker, manifest, instalação e leitura offline. |
| Idioma | next-intl | Mensagens ICU, detecção por `Accept-Language` no servidor, sem prefixo de idioma na URL. |
| Validação | Zod | Um único esquema para formulário, Server Action e limites do banco. |
| Testes | Vitest + Playwright | Playwright já disponível no ambiente. |

### Alternativas consideradas

- **.NET no Azure App Service gratuito:** o time tem C#, mas o plano gratuito hiberna, não aceita domínio próprio e não oferece banco relacional gratuito permanente. Recusado.
- **Cloudflare Workers + D1 + Hono:** ótimo custo, mas exige escrever autenticação, OAuth e políticas à mão. Rota de migração natural caso o Supabase deixe de atender.

### Riscos operacionais conhecidos

- **O projeto Supabase Free é pausado após 7 dias sem requisição.** Mitigação: GitHub Action a cada 3 dias. **[R] Atenção:** o GitHub desativa workflows agendados após 60 dias sem commit no repositório. O workflow precisa fazer também um commit de keep-alive, ou o cron precisa ser externo. Sem isso a mitigação se desliga sozinha depois de dois meses quietos.
- **[R] Banco pausado precisa de estado degradado.** Quando o banco não responde, o aplicativo mostra a tela "o cofrinho está dormindo", com o último dado em cache, e dispara alerta por e-mail para o responsável técnico. Nunca uma tela de erro crua.
- **Vercel Hobby permite cron diário.** **[R]** O disparo acontece em algum momento *dentro* da hora especificada, não no minuto exato. Isso importa para a mesada recorrente (pós-MVP): a data do crédito é calculada pela aplicação, nunca pelo instante em que o cron acordou.
- **Supabase Free permite 2 projetos ativos**, e o projeto tem exatamente dois ambientes, então a cota é consumida por inteiro. Não sobra espaço para um terceiro projeto gerenciado; qualquer ambiente extra roda em Supabase local por Docker, que não consome cota.
- **O ambiente de desenvolvimento pausa antes do de produção**, porque recebe menos tráfego. O keep-alive tem de acertar os dois projetos, não só o de produção.
- **[R] Supabase Free não tem backup nem PITR.** Ver seção 10.
- **Push em iOS** só funciona depois de adicionar à tela de início. **[R]** Instalações na União Europeia perderam PWA em modo standalone e push por causa do DMA; considerar ao avaliar alcance.

---

## 3. Modelo de dados

Valores monetários são **inteiros em centavos** (`bigint`). Ponto flutuante nunca é usado para dinheiro. Carimbos de tempo são `timestamptz`; a apresentação converte para o fuso da família.

### 3.1 Tabelas

```sql
-- Pais e responsáveis vêm de auth.users (Supabase Auth).

-- [R] auth.users não é legível pelo cliente. Sem esta tabela, "qual responsável
-- lançou" não tem fonte. Populada por trigger em auth.users.
profiles (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null,
  avatar_url    text,
  locale        text check (locale in ('pt', 'en', 'es')),
  updated_at    timestamptz not null default now()
)

families (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  currency      char(3) not null default 'BRL',              -- [R] estava só na prosa
  locale        text not null default 'pt' check (locale in ('pt', 'en', 'es')),
  timezone      text not null default 'America/Sao_Paulo',   -- [R] mesada recorrente precisa
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
)

family_members (
  family_id     uuid not null references families(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  role          text not null check (role in ('owner', 'parent')),
  joined_at     timestamptz not null default now(),
  primary key (family_id, user_id)
)

children (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references families(id) on delete cascade,
  name          text not null,             -- apelido, não nome completo
  avatar_key    text not null,
  birthdate     date,                      -- opcional
  ui_mode       text not null default 'pequeno'
                check (ui_mode in ('pequeno', 'grande')),    -- [R] tinha ficado sem padrão
  locale        text check (locale in ('pt', 'en', 'es')),   -- nulo herda o da família
  archived_at   timestamptz,
  created_at    timestamptz not null default now()
)

-- Contas ligadas a um perfil de criança. revoked_at é o que corta o acesso:
-- o hook para de emitir a claim no refresh seguinte.
child_identities (
  child_id      uuid not null references children(id) on delete cascade,
  auth_user_id  uuid not null references auth.users(id) on delete cascade unique,
  provider      text not null check (provider in ('google', 'email')),
  revoked_at    timestamptz,
  linked_at     timestamptz not null default now(),
  primary key (child_id, auth_user_id)
)

invites (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references families(id) on delete cascade,
  kind          text not null check (kind in ('parent', 'child')),
  child_id      uuid references children(id) on delete cascade,
  email         text,
  token_hash    bytea not null unique,     -- HMAC-SHA256(token, PEPPER), ver 4.5
  role          text check (role in ('owner', 'parent')),
  expires_at    timestamptz not null,      -- 7 dias
  accepted_at   timestamptz,
  accepted_by   uuid references auth.users(id) on delete set null,
  revoked_at    timestamptz,               -- [R]
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  -- [R] eram comentários, agora são constraints
  constraint invite_child_shape  check ((kind = 'child')  = (child_id is not null)),
  constraint invite_parent_shape check ((kind = 'parent') = (role is not null))
)

transactions (
  id            uuid primary key,          -- [R] gerado no cliente: serve de chave de idempotência
  child_id      uuid not null references children(id) on delete cascade,
  amount_cents  bigint not null,           -- positivo credita, negativo debita
  currency      char(3) not null default 'BRL',   -- [R] congelada no lançamento
  reason        text not null,
  emoji         text,
  reverses_id   uuid unique,               -- estorno aponta o original
  source        text not null default 'manual'    -- [R] mesada recorrente não tem autor humano
                check (source in ('manual', 'recurring', 'chore', 'request')),
  created_by    uuid references auth.users(id) on delete set null,
  created_by_name text not null,           -- [R] snapshot: autoria sobrevive à exclusão da conta
  created_at    timestamptz not null default now(),
  constraint amount_not_zero check (amount_cents <> 0),
  constraint amount_sane     check (amount_cents between -100000000 and 100000000),
  constraint reason_sane     check (length(btrim(reason)) between 1 and 200),
  -- [R] estorno tem de ser da mesma criança; o resto vai em trigger (ver 3.2)
  constraint transactions_id_child unique (id, child_id),
  constraint reversal_same_child
    foreign key (reverses_id, child_id) references transactions (id, child_id)
)

goals (
  id            uuid primary key default gen_random_uuid(),
  child_id      uuid not null references children(id) on delete cascade,
  title         text not null,
  emoji         text not null default '🎯',
  target_cents  bigint not null check (target_cents > 0),
  currency      char(3) not null default 'BRL',
  status        text not null default 'active'
                check (status in ('active', 'reached', 'cancelled')),
  reached_at    timestamptz,
  reached_by_transaction_id uuid references transactions(id) on delete set null,  -- [R]
  cancelled_at  timestamptz,               -- [R]
  cancelled_by  uuid references auth.users(id) on delete set null,   -- [R]
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  -- [R] status e carimbos eram independentes; estados inválidos eram aceitos
  constraint goal_status_consistent check (
    (status = 'reached')   = (reached_at   is not null) and
    (status = 'cancelled') = (cancelled_at is not null)
  )
)

-- No máximo uma meta ativa por criança.
create unique index one_active_goal_per_child
  on goals (child_id) where status = 'active';
```

### 3.1.1 Índices **[R]**

O esquema anterior declarava um único índice, e nenhuma consulta real do produto o usava. Estes são obrigatórios:

```sql
-- histórico paginado e soma de saldo
create index on transactions (child_id, created_at desc, id desc);
-- exigido pela RLS de TODAS as tabelas: a PK é (family_id, user_id),
-- coluna líder errada para o lookup por usuário
create index on family_members (user_id);
create index on children (family_id);
create index on child_identities (child_id);
create index on goals (child_id, created_at desc);
create index on invites (family_id);
create index on invites (child_id);
-- convite de pai pendente, um por endereço
create unique index on invites (family_id, lower(email))
  where accepted_at is null and revoked_at is null and email is not null;
```

Sem `family_members (user_id)`, cada verificação de RLS de cada linha de cada tabela faz varredura sequencial. Sem os índices de FK, cada `on delete cascade` a partir de `families` varre a tabela inteira por linha.

### 3.2 Regras do razão (ledger)

- `transactions` é **append-only**. Não existe `UPDATE` nem `DELETE`; a permissão é negada por ausência de policy e por `revoke`.
- Correção é feita por **estorno**: linha nova de valor oposto, com `reverses_id` apontando para a original. As duas aparecem no histórico.
- `saldo = SUM(transactions.amount_cents)` para a criança. É o único saldo que existe: não há saldo livre nem valor bloqueado.
- Nenhum saldo é armazenado em coluna.

**[R] O estorno precisa de trigger, não só de FK.** A restrição `reversal_same_child` impede estorno cruzado entre irmãos e entre famílias. Faltam o valor oposto exato e a proibição de encadeamento:

```sql
create or replace function transactions_check_reversal() returns trigger
language plpgsql as $$
declare o transactions%rowtype;
begin
  if new.reverses_id is null then return new; end if;
  select * into o from transactions where id = new.reverses_id for update;
  if o.reverses_id is not null then
    raise exception 'estorno de estorno não é permitido';
  end if;
  if new.amount_cents <> -o.amount_cents then
    raise exception 'estorno deve ter valor oposto exato';
  end if;
  return new;
end $$;
```

O `unique` em `reverses_id` já impede estornar duas vezes a mesma linha, e torna o estado "foi estornada?" derivável barato por `left join transactions r on r.reverses_id = t.id`. Nenhuma coluna `reversed_at` é necessária.

**[R] Saldo definido em um lugar só**, para não divergir entre chamadas:

```sql
create view child_balances with (security_invoker = on) as
  select child_id, coalesce(sum(amount_cents), 0)::bigint as balance_cents
    from transactions group by child_id;
```

**Escape hatch de desempenho.** Uma criança com dois lançamentos por semana acumula cerca de 100 linhas por ano. Com o índice acima, o `SUM` é varredura de índice de algumas centenas de linhas e continua sub-milissegundo muito além de 10⁵ linhas por criança. Este produto não chega lá. **[R]** Se um dia chegar, a saída é uma linha de checkpoint (`child_id, through_transaction_id, balance_cents`) somada contra a cauda — não uma view materializada, cujo `REFRESH` é integral e precisaria rodar a cada inserção.

**[R] Filtro por período** usa limites UTC meio-abertos calculados na aplicação (`created_at >= $from and created_at < $to`). Nunca `date(created_at at time zone ...)`, que descarta o índice.

### 3.3 Modelo de metas de poupança

Uma única meta ativa por criança, com valor-alvo que o saldo total precisa alcançar.

- No máximo uma meta ativa, garantida pelo índice único parcial.
- Progresso calculado, nunca armazenado: `progresso = saldo / target_cents`, limitado a 100%.
- Não existe reserva, alocação nem saldo bloqueado. O dinheiro da meta é o próprio saldo, e a criança continua livre para gastar.
- Alcançar a meta não movimenta dinheiro. A compra do objetivo é um débito comum.
- Somente o responsável cria, edita e cancela a meta. A criança acompanha.

**[R] O que marca a meta como alcançada.** A versão anterior não dizia, e o saldo é derivado: nada dispara na leitura, então a meta ficaria `active` para sempre. O único evento capaz de mover o saldo é uma inserção em `transactions`. Logo, um trigger `AFTER INSERT`:

```sql
create or replace function goal_check_reached() returns trigger
language plpgsql security definer set search_path = '' as $$
declare g public.goals%rowtype; bal bigint;
begin
  -- estorno da transação que alcançou a meta reabre a meta
  if new.reverses_id is not null then
    update public.goals
       set status = 'active', reached_at = null, reached_by_transaction_id = null
     where reached_by_transaction_id = new.reverses_id;
  end if;

  -- 1) trava a meta ANTES de somar: serializa por criança
  select * into g from public.goals
    where child_id = new.child_id and status = 'active'
    for update;
  if not found then return null; end if;

  -- 2) só depois da trava, soma em statement novo
  select coalesce(sum(amount_cents), 0) into bal
    from public.transactions where child_id = new.child_id;

  if bal >= g.target_cents then
    update public.goals
       set status = 'reached', reached_at = now(), reached_by_transaction_id = new.id
     where id = g.id;
  end if;
  return null;
end $$;

create trigger trg_goal_reached after insert on transactions
  for each row execute function goal_check_reached();
```

Três detalhes que não são opcionais:

1. **A ordem é travar e depois somar.** Somar e depois travar está errado: dois pais lançando ao mesmo tempo em READ COMMITTED veem cada um apenas a própria linha não confirmada, calculam saldo abaixo do alvo, e **nenhum** dos dois marca a meta. Travando primeiro, a transação bloqueada recebe snapshot novo ao seguir e enxerga a inserção da outra.
2. **Meta criada com saldo já acima do alvo** nunca dispara este trigger. A mesma verificação roda em `BEFORE INSERT on goals`.
3. **Estorno reabre a meta que ele desfez.** Um lançamento de R$ 4.000,00 no lugar de R$ 40,00 alcança a meta na hora, e o estorno — único mecanismo de correção do produto — não alcançava a tabela de metas. Agora alcança, via `reached_by_transaction_id`. Queda normal de saldo continua **não** reabrindo a meta: a criança não perde a conquista por gastar depois.

**[R] Escrita em `goals` fora do trigger** é só do responsável, por policy. A ida de `reached` para `active` é permitida exclusivamente ao trigger (`security definer`); um `BEFORE UPDATE` recusa a transição vinda de sessão de usuário.

---

## 4. Autenticação e autorização

### 4.1 Papéis

| Papel | Como entra | O que faz |
|---|---|---|
| Pai/responsável | Google OAuth ou magic link | Cria família, convida responsável, cria criança, lança crédito e débito, estorna, cria meta, gera e revoga link da criança |
| Criança | Google OAuth ou magic link | Vê saldo, histórico e meta. **Somente leitura no MVP** |

A criança não escreve nada no MVP.

Um pai pode pertencer a várias famílias. Uma família não enxerga nada de outra.

### 4.2 A criança é um perfil, com conta própria

`children` é o perfil, e `child_identities` liga contas a ele. Uma criança pode ter mais de uma conta (Google e magic link), e o responsável desvincula qualquer uma a qualquer momento.

**A conta é obrigatória.** Não existe acesso sem login.

**Consequência aceita, e o custo é real:** conta Google exige 13 anos no Brasil, e conta supervisionada por Family Link pode ter o OAuth de terceiros bloqueado pelo controle parental. Criança abaixo dessa idade não tem acesso próprio ao aplicativo; o responsável mostra o saldo pelo próprio celular. O Modo Pequeno (seção 6.1) continua existindo para quando a criança olha junto com o pai, e para a criança de 13 ou 14 anos que prefere a interface mais simples.

Isso foi decidido depois de considerar a alternativa: um link com token na URL que dispensava conta. Ver decisão 10 na seção 8 para o que se ganhou e o que se perdeu.

### 4.3 Sessões

Todo acesso é uma sessão normal do Supabase Auth, criada por Google OAuth ou por magic link. Não há sign-in anônimo, não há troca de token, não há rota com `service_role`.

Um **Custom Access Token Hook** (função Postgres do Supabase Auth) injeta a claim `child_id` quando o usuário autenticado tem identidade de criança viva (`child_identities.revoked_at is null`). As policies leem `auth.jwt() ->> 'child_id'`, então pai e criança são cobertos pelas mesmas policies.

O hook roda **a cada emissão de token**, inclusive no refresh. É por isso que desvincular uma conta funciona: o hook simplesmente para de emitir a claim, e a sessão perde o acesso no próximo refresh. O TTL do access token (600 a 900 segundos) é o tamanho dessa janela residual.

### 4.4 Row Level Security

**[R] RLS precisa ser ligada explicitamente.** Postgres não liga sozinho. Uma migration que cria as tabelas e para aí expõe tudo pelo PostgREST com a chave anon, que é pública. A migration de RLS é obrigatória e cobre as nove tabelas:

```sql
alter table profiles         enable row level security;
alter table families         enable row level security;
alter table family_members   enable row level security;
alter table children         enable row level security;
alter table child_identities enable row level security;
alter table invites          enable row level security;
alter table transactions     enable row level security;
alter table goals            enable row level security;

revoke all on child_identities, invites from anon, authenticated;
revoke update, delete on transactions from anon, authenticated;
```

**Nenhuma policy pode ser escrita como "está logado".** Toda policy se apoia em pertencimento a família ou na claim `child_id`.

A regra continua valendo mesmo sem sign-in anônimo, por dois motivos. Habilitar o sign-in anônimo é uma caixa de seleção no painel, e caixa de seleção volta a ser marcada. E `authenticated` é um role compartilhado por todos os usuários do projeto: uma policy que se contenta com ele deixa qualquer conta ler qualquer família.

Sessão anônima, quando existe, tem role `authenticated` e `auth.uid()` **não** nulo — corrigindo o que a versão 1.0 deste documento afirmava. A suíte continua testando esse caso.

**[R] Helpers `security definer` para evitar recursão.** Subconsulta dentro de policy é avaliada sob a RLS de quem chama. Uma policy em `family_members` que consulta `family_members` produz `infinite recursion detected in policy`, que é a falha mais comum desse desenho no Supabase. Toda policy passa por estes helpers:

```sql
create or replace function app.is_family_parent(p_child_id uuid) returns boolean
language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.children c
    join public.family_members fm on fm.family_id = c.family_id
    where c.id = p_child_id and fm.user_id = auth.uid()
  )
$$;

create or replace function app.current_child_id() returns uuid
language sql stable as $$
  select nullif(auth.jwt() ->> 'child_id', '')::uuid
$$;
```

Matriz de policies, resumida:

| Tabela | select | insert | update | delete |
|---|---|---|---|---|
| `profiles` | quem compartilha família | próprio | próprio | — |
| `families` | membro | função definer | `owner` | `owner` |
| `family_members` | membro da mesma família | **nenhuma** (função definer) | `owner` | próprio ou `owner` |
| `children` | membro, ou a própria criança | pai da família | pai da família | — |
| `child_identities` | pai da família | **nenhuma** | **nenhuma** | pai da família (desvincular) |
| `invites` | membro da família | `owner` da família | `owner` (revogar) | `owner` |
| `transactions` | pai, ou a própria criança | pai, com `created_by = auth.uid()` | **nenhuma** | **nenhuma** |
| `goals` | pai, ou a própria criança | pai | pai, e o trigger | pai |

Exemplo, já com as correções:

```sql
create policy transactions_select on transactions
for select using (
  child_id = app.current_child_id()
  or app.is_family_parent(child_id)
);

create policy transactions_insert on transactions
for insert with check (
  app.is_family_parent(child_id)
  and created_by = auth.uid()                    -- [R] autoria era forjável
  and exists (select 1 from children c           -- [R] criança arquivada não recebe lançamento
              where c.id = child_id and c.archived_at is null)
);

-- Nenhuma policy de update ou delete em transactions. Sem policy, negado.
```

**[R] `child_identities` sem policy de escrita, nunca.** Ela é a única entrada do hook. Se qualquer sessão comum puder inserir ali, basta gravar `(child_id da vítima, próprio auth_user_id)` e dar refresh para o Supabase assinar um JWT legítimo com o `child_id` alheio. A claim não é forjável por criptografia, mas é *causável*. Escrita só por funções `security definer`, hoje apenas `accept_child_invite`.

**[R] `family_members` sem policy de insert.** A única checagem possível com o cliente do próprio usuário seria `user_id = auth.uid()`, que deixaria qualquer autenticado — inclusive um anônimo — se inserir em qualquer `family_id`. Aceitar convite e criar família passam por função `security definer` que recebe o token cru, valida e insere. Ver seção 5.

### 4.5 Segurança dos convites

Sobrou um único tipo de credencial fora do login: o **convite**, que existe em duas formas. O de responsável dá escrita nas finanças da família. O de criança liga uma conta a um perfil de criança. Ambos viajam como token numa URL, e um token na URL vaza com facilidade: histórico do navegador, logs de servidor e proxy, cabeçalho `Referer`, captura de tela compartilhada.

Mitigações cumulativas, todas no MVP:

1. Token de 32 bytes de `crypto.getRandomValues`, em base64url.
2. O banco guarda `HMAC-SHA256(token, TOKEN_PEPPER)`, com o pepper em variável de ambiente e fora do banco. Um dump vazado não permite testar tokens. O valor em claro é exibido uma única vez, a quem criou o convite.
3. Token em segmento de caminho, nunca em query string.
4. A rota de aceite responde **303** com `Cache-Control: no-store`, e o token some da barra de endereços. `history.replaceState` no cliente não basta: a navegação já aconteceu, e com o service worker instalado essa resposta ficaria no CacheStorage indexada pela URL com o token.
5. Validade curta: 7 dias.
6. `revoked_at`, e o responsável revoga a qualquer momento.
7. `Referrer-Policy: no-referrer` no aplicativo inteiro.
8. **Uso único atômico.** O `UPDATE ... RETURNING` só afeta linha ainda não aceita, não revogada e não expirada, então duas redenções concorrentes não podem ambas ter sucesso.

**O e-mail vem da sessão, nunca de parâmetro.** No convite de responsável, quem lesse o convite podia satisfazer o próprio vínculo e escalar para `owner`; hoje `token_hash` é ilegível por qualquer sessão de usuário, por grant de coluna, e `invites` só é legível pelo `owner` da família.

**Vincular conta exige conta real.** `app.is_real_user()` recusa sessão anônima. O sign-in anônimo está desabilitado no projeto, mas a checagem fica: desabilitar é configuração de painel, e configuração de painel muda.

`unique (auth_user_id)` impede que a mesma conta Google aponte para duas crianças. A vinculação **nunca** é feita por igualdade de e-mail.

### 4.6 Pai e criança no mesmo dispositivo

São duas contas distintas, então a separação é a do próprio navegador: perfis diferentes, ou logout e login. Não há cookie com escopo por caminho, nem duas sessões vivas ao mesmo tempo — o que sumiu junto com o acesso por link.

A interface mostra sempre de quem é a sessão, para que ninguém lance mesada achando que está na conta do outro responsável.

### 4.7 Dados pessoais de menores (LGPD)

- Apelido, não nome completo.
- Avatar é ilustração de lista fechada. **O MVP não aceita upload de foto.**
- Data de nascimento opcional.

**[R] Cascade não alcança o schema `auth`.** Apagar a família apaga o schema `public`, mas a linha em `auth.users` e as de `auth.identities` — que guardam e-mail e `sub` do Google, dado identificável de menor — sobrevivem. A exclusão de família chama a admin API para apagar os usuários associados.

**Com a conta obrigatória, toda criança passa a ter e-mail cadastrado**, o que é mais dado pessoal de menor do que o desenho anterior guardava. A contrapartida é que a autenticação é a do Google, e não uma credencial nossa circulando por URL.

**[R] Exclusão de conta e saída de família precisam existir.** `created_by` agora é anulável com `on delete set null`, e `created_by_name` guarda o snapshot da autoria, então apagar a conta é possível sem quebrar o razão imutável. Sair da família exige transferência de `owner` quando o último `owner` sai; a operação é bloqueada até haver outro.

---

## 5. Estrutura do aplicativo

```
app/
  (parent)/                 # área do responsável, cookie em "/"
    familias/
    criancas/[id]/
    convites/
  c/                        # área da criança, sessão normal com claim child_id
    saldo/
    historico/
    meta/
  convite/[token]/          # 303 + no-store, aceita convite e limpa a URL
  manifest.webmanifest/     # rota dinâmica, idioma resolvido
messages/
  pt.json                   # idioma-fonte
  en.json
  es.json
lib/
  money.ts                  # centavos, formatação por locale, nunca float
  i18n.ts                   # resolução de locale, cookie e Accept-Language
  supabase/
  auth/
components/
  ludic/                    # cofrinho, moeda, confete, avatares
supabase/
  migrations/               # SQL versionado: schema, índices, RLS, triggers, hook
```

Escrita acontece em **Server Actions**, com validação Zod e o cliente Supabase do usuário autenticado.

**Três operações não são expressáveis com o cliente do usuário** e passam por funções Postgres `security definer` com `set search_path = ''`: criar família (insere a própria linha de `family_members`), aceitar convite (insere linha em família ou perfil dos quais ainda não faz parte) e criar convite.

**A aplicação não usa `service_role` em lugar nenhum.** Havia exatamente um uso legítimo — a rota que trocava o token do link por sessão — e ele sumiu junto com o link. Toda escrita passa pela RLS com o cliente do próprio usuário; o que não cabe em policy vira função definer. Se aparecer a tentação de usar `service_role` numa Server Action, a resposta certa é uma função definer nova.

---

## 6. Sistema de design lúdico

O público vai de 4 a 16 anos. Um visual só não atende as duas pontas: o que encanta quem tem 5 constrange quem tem 15. A solução é um **modo de interface**.

### 6.1 Modos

| | Modo Pequeno (4 a 8) | Modo Grande (9 a 16) |
|---|---|---|
| Leitura exigida | Mínima. Ícone e número grandes | Normal |
| Saldo | Número enorme, moedas ilustradas | Número grande, tipografia limpa |
| Histórico | Lista de ícones com valor colorido | Lista com data, motivo e autor |
| Meta | Cofrinho que enche, transborda ao alcançar | Barra de progresso e valor que falta |
| Animação | Generosa: moeda cai, confete, cofrinho balança | Discreta: transição e confete na conquista |
| Som | Opcional, desligado por padrão | Desligado |
| Vocabulário | "Você ganhou", "Você gastou", "Falta pouco" | "Crédito", "Débito", "Meta" |

**[R] No MVP, o Modo Grande é variação de tipografia, vocabulário e densidade sobre o mesmo layout**, não uma segunda interface. Duas interfaces completas dobram o trabalho de front-end e de tradução, e a revisão apontou isso como o item de escopo mais subestimado.

O modo vem da data de nascimento, com padrão `pequeno` quando ela não existe, e o pai sobrescreve em `children.ui_mode`.

### 6.2 Identidade visual

- **Nome:** **Mesada**. Não é traduzido: é marca.
- **Elemento central:** o cofrinho ilustrado. Sem mascote nomeado. Aparece no ícone, no estado vazio, no card de saldo, na comemoração e nas telas de erro. É o que faz a criança de 4 anos reconhecer o aplicativo sem saber ler.
- **Estados do cofrinho:** vazio, com pouco, cheio e transbordando. Acompanha o progresso da meta, ou o saldo quando não há meta.
- **Ícone:** cofrinho sobre círculo de cor sólida, sem texto. Legível a 48 px. Conjunto maskable completo.
- **Paleta:** base roxo-índigo; acentos amarelo-moeda, verde-entrada e coral-saída. Entrada e saída **nunca se distinguem só pela cor** — sempre com sinal, ícone e palavra.
- **Tipografia:** Baloo 2 para títulos e valores, Nunito para texto corrido. **[R]** Ambas cobrem os três idiomas; acentuação do espanhol e do português verificada antes de fechar a escolha.
- **Avatares:** animais em estilo plano. **[R]** Oito opções no MVP, não dezesseis: são ilustrações no caminho crítico.

### 6.3 Acessibilidade

- Área de toque mínima de 48 por 48 px na interface da criança.
- Contraste mínimo AA (4.5:1); valores em destaque acima disso.
- Corpo de texto nunca abaixo de 16 px; valores acima de 32 px. Texto de apoio — data, autoria, selo de arquivada — fica em 14 px, e é o piso: nada no aplicativo desce abaixo disso.
- Foco sempre visível, com anel próprio. Trocar o anel do navegador por mudança de cor de borda desaparece para quem enxerga pouco.
- Escolha única é `radiogroup` com `aria-checked`, nunca um punhado de botões com `aria-pressed`: o segundo anuncia alternadores independentes, sem dizer que é uma escolha só nem em que posição ela está.
- `prefers-reduced-motion` desliga confete e movimento do cofrinho.
- Toda animação tem leitura estática equivalente. Nenhuma informação existe só no movimento.
- Navegação por teclado e rótulos ARIA em todos os controles.

### 6.4 Idioma e formatação

O aplicativo fala **português, inglês e espanhol**. O idioma é escolhido automaticamente e pode ser trocado à mão.

**Resolução**, nesta precedência:

1. Cookie `locale`, gravado quando o usuário troca à mão.
2. Preferência do perfil do responsável, quando há sessão.
3. `Accept-Language` da requisição, casado contra os idiomas suportados.
4. Português, como padrão final.

A resolução acontece no servidor, na primeira renderização, para que a página nunca apareça no idioma errado antes de corrigir. `navigator.language` não é usado: chega tarde e provoca troca visível de texto.

**Sem prefixo de idioma na URL.** Nada de `/pt/saldo`. O motivo é o link da criança: precisa ser curto, estável e imune a idioma, porque é colado em dispositivo de criança e vira atalho na tela de início. Prefixo quebraria links salvos ao trocar de idioma e brigaria com o `start_url` fixo exigido pela seção 4.5. O custo é indexação por idioma em buscador, irrelevante em aplicativo privado.

**Idioma não é moeda.** O `Intl.NumberFormat` recebe o locale para separador e posição do símbolo, mas a moeda é a da família, sempre BRL no MVP. Um pai brasileiro com o celular em inglês vê `R$ 1,234.56`, não `$1,234.56`. Esse é o erro mais comum desse tipo de sistema e corrompe a leitura de dinheiro.

**Formatação delegada a `Intl`**, nunca escrita à mão: `NumberFormat`, `DateTimeFormat`, `RelativeTimeFormat`, `PluralRules` pelas mensagens ICU. Nomes de mês e dia nunca são constantes no código.

**Mensagens em ICU MessageFormat**, com plural declarado na mensagem. Nenhuma string montada por concatenação: a ordem das palavras muda entre os três idiomas.

**Custo real:** dois modos de interface vezes três idiomas são seis conjuntos de texto. As chaves são `small.balance.title` e `big.balance.title`, para que a diferença fique explícita e traduzível, não escondida em condicional dentro do componente. A redução do Modo Grande a variação de tipografia e vocabulário (seção 6.1) mantém esse custo administrável.

**Manifesto do PWA** servido por rota dinâmica, com `name`, `short_name` e `description` no idioma resolvido.

**Idioma da criança** herda o da família; o responsável pode fixar por criança. A sessão por link usa o idioma da criança, ignorando o `Accept-Language` do dispositivo.

**Português é o idioma-fonte.** `messages/pt.json` é a referência, e a compilação falha se `en.json` ou `es.json` tiverem chave faltando ou sobrando. Sem fallback silencioso na interface: texto meio traduzido é pior que texto traduzido mal.

---

## 7. PWA

- `manifest.webmanifest` por rota dinâmica, com ícones maskable, `display: standalone` e `theme_color`.
- **`start_url` fixo**: `/` para o responsável, `/c/saldo` para a criança.
- Service worker com Serwist guardando **somente estático**: `_next/static`, ícones e fontes. Nenhuma página, nenhum payload RSC.

  **Leitura offline de saldo e histórico não existe, e a ausência é deliberada.** O `defaultCache` do Serwist guarda navegações com NetworkFirst, o que gravaria nome dos filhos, saldo, histórico e autoria no CacheStorage — que é por origem, não por sessão. No tablet compartilhado que este produto assume, um responsável sai, outra pessoa entra, e uma rede lenta faz o cache servir a página de quem estava antes. Qualquer script na origem também lê tudo com um `caches.match()`.

  A troca é perda real de recurso prometido. Ela volta quando houver forma de guardar por sessão.
- Sair apaga o CacheStorage: cache sobrevive à atualização do service worker, e versões anteriores guardavam página autenticada.
- **`/convite/*` e `/auth/*` nunca passam pelo cache**, por regra `NetworkOnly` declarada **antes** do `defaultCache` — a primeira regra que casa é a que vale.

  Duas camadas diferentes, e é fácil confundir: o `exclude` do `next.config.ts` tira as rotas do **precache**, e não do cache de **runtime**. O `defaultCache` do Serwist guarda navegações com NetworkFirst, então sem a regra explícita a resposta de `/convite/<token>` ficaria no CacheStorage indexada pelo caminho com o token.
- Escrita é sempre online no MVP.
- Onboarding ensina "adicionar à tela de início", com instrução por sistema.

---

## 8. Decisões tomadas

Fechadas em 2026-09-04.

1. **Nome:** **Mesada**. Sem mascote nomeado; o cofrinho ilustrado é o elemento central da identidade. O nome não é traduzido.

   O requisito de três idiomas decidiu a escolha. "Mesada" é palavra real em português **e** em espanhol, com o mesmo significado, e é pronunciável em inglês sem armadilha. Duas alternativas foram descartadas por motivo concreto: **Poupi** lê-se "poopy" em inglês, o que é fatal em aplicativo infantil; **Cofrinho** tem o dígrafo "nh", que não existe em inglês nem em espanhol, e trava o falante dos dois. O repositório já se chamava `mesada`.
2. **Meta de poupança:** uma única meta ativa por criança, alvo sobre o saldo total, sem reserva. Ver 3.3.
3. **Quem cria a meta:** somente o responsável. A criança acompanha.
4. **Meta alcançada:** congela em `reached`. Queda posterior de saldo não reabre. **[R] Exceção:** o estorno da própria transação que alcançou a meta reabre, porque senão o único mecanismo de correção do produto não alcança a meta.
5. **Validade do convite:** 7 dias, revogável, de uso único atômico.
6. **Moeda:** somente BRL no MVP. Coluna de moeda em `families`, `transactions` e `goals`, congelada no lançamento.
7. **Idioma:** português, inglês e espanhol, por `Accept-Language`, trocável à mão. Sem prefixo na URL. Idioma e moeda independentes.
8. **Domínio:** `mesada.vercel.app` no início.
9. **Ambientes:** dois projetos Supabase, desenvolvimento e produção, consumindo a cota gratuita inteira. Migration passa por desenvolvimento antes de produção, sempre. Ver seção 9.4.
10. **Acesso da criança: somente conta própria.** O link com token na URL saiu do produto, e com ele o sign-in anônimo, a troca de token, o limite de taxa dessa rota e o `service_role` na aplicação.

    O que se ganhou: a superfície de credencial encolheu para um item, o convite; não há mais credencial de longa duração circulando por URL; e a aplicação deixou de ter qualquer chave capaz de ignorar a RLS.

    O que se perdeu, e é o custo alto: **criança abaixo de 13 anos não tem acesso próprio**, porque conta Google exige essa idade no Brasil e Family Link pode bloquear OAuth de terceiros. O Modo Pequeno passa a servir a criança que olha junto com o responsável, e a de 13 ou 14 que prefere a interface simples. Se essa faixa etária voltar a ser prioridade, a alternativa registrada é servir `/c` renderizado no servidor com uma função `security definer` que recebe o hash do token — isso devolveria o link sem trazer de volta o sign-in anônimo.

---

## 9. Operação **[R]**

Nenhuma dessas coisas estava documentada, e todas travam o primeiro deploy.

### 9.1 Variáveis de ambiente

| Variável | Onde | Para quê |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | cliente e servidor | endpoint do projeto |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | cliente e servidor | chave pública; é pública mesmo, a proteção é a RLS |
| `TOKEN_PEPPER` | **somente servidor** | HMAC dos tokens de convite |
| `SUPABASE_DB_URL` | CI | migrations e dump de backup |

Cada ambiente tem o seu conjunto completo. `TOKEN_PEPPER` **precisa ser diferente** entre desenvolvimento e produção: com o mesmo valor, um token gerado em desenvolvimento vale no banco de produção.

`TOKEN_PEPPER` nunca aparece em variável `NEXT_PUBLIC_*`, nunca chega ao cliente e nunca entra no repositório. A aplicação **não tem** `SUPABASE_SERVICE_ROLE_KEY`: não existe mais caminho que precise dela.

### 9.2 Migrations

SQL versionado em `supabase/migrations/`, aplicado por `scripts/db-migrate.sh` no GitHub Actions. Nenhuma alteração de schema pelo painel do Supabase: o que não está no repositório não existe.

O migrador é **incremental**, com livro-caixa em `app.schema_migrations`. Três garantias que a versão anterior deste documento não tinha:

- Cada migration roda dentro de **uma** transação, com o registro no mesmo commit. Não existe estado "aplicou metade e anotou".
- **Soma de verificação** por arquivo. Se um arquivo já aplicado for alterado depois, o migrador para em vez de fingir que o banco está em dia — o banco não tem aquele conteúdo, e reaplicar não o traria. A saída é escrever uma migration nova.
- **Advisory lock**, então dois deploys simultâneos não se atropelam.

Conexão pelo **session pooler, porta 5432**. O pooler de transação (6543) não serve: não mantém estado de sessão, e as migrations dependem de advisory lock e de objetos criados em sequência na mesma conexão. O script recusa a 6543 em vez de falhar no meio.

### 9.3 Backup

Supabase Free **não tem backup nem PITR**. Como o produto promete histórico imutável, isso é inaceitável sem contrapartida: GitHub Action semanal roda `supabase db dump`, cifra o resultado e guarda como artefato privado com retenção de 90 dias. O procedimento de restauração é testado uma vez antes do lançamento e documentado em `docs/runbook.md`.

### 9.3.1 Confirmação de e-mail

Ligada nos dois ambientes. Sem ela, qualquer pessoa cria conta com o e-mail de outra, e num produto que guarda dado de criança a conveniência de teste não paga esse preço.

Consequência prática: não dá para criar conta de teste por script, porque não há caixa de entrada. Contas de teste são criadas no painel, em Authentication → Users → Add user, com *Auto Confirm User* — o que confirma aquela conta sem afrouxar a regra para as demais. É assim que `scripts/verificar-ambiente.sh` roda.

### 9.4 Ambientes

Dois ambientes, cada um com o próprio projeto Supabase e o próprio banco. Nenhum dado de produção em desenvolvimento.

| | Desenvolvimento | Produção |
|---|---|---|
| Projeto Supabase | `mesada-dev` | `mesada-prod` |
| Deploy Vercel | Preview, toda branch e todo pull request | Production, branch `main` |
| Dados | fictícios, criados por seed | reais |
| `TOKEN_PEPPER` | valor próprio | valor próprio, diferente |
| Migrations | ao mergear em `main` | ao publicar uma tag `v*` |
| Deploy | preview automático da Vercel | por tag `v*`, no mesmo workflow |

O ambiente de desenvolvimento existe para que uma migration seja executada contra um banco real antes de tocar dados de família. Uma migration que só rodou em Postgres local não foi validada contra o Supabase: extensões, roles e o hook de auth são diferentes.

**Fluxo de uma mudança de schema:**

1. Escrever a migration e rodar `scripts/db-test.sh` localmente. É o laço rápido, em segundos.
2. Abrir pull request. A CI roda a suíte inteira. O preview da Vercel aponta para `mesada-dev`.
3. Mergear em `main`. O workflow aplica a migration em `mesada-dev`.
4. Publicar uma tag `v*`. O workflow roda a suíte de novo, aplica a migration em `mesada-prod` e só então publica a aplicação.

**Produção sai por tag, nunca por merge.** Mergear não publica nada: a decisão de publicar vira um ato separado e datado, e a tag é o que se aponta para dizer o que está no ar.

**A migration vai antes do deploy da aplicação**, dentro do mesmo workflow. O código novo pode depender de coluna nova; a ordem inversa derruba a aplicação no intervalo entre os dois passos.

O Environment `producao` no GitHub tem *required reviewers*, então a tag pausa e espera aprovação humana antes de tocar o banco de produção. Isso não é cerimônia: produção não tem PITR no plano gratuito (seção 9.3), e o dump semanal pode estar sete dias atrás.

**Consequência para a Vercel:** o deploy automático de produção fica desligado, senão um merge em `main` publicaria por fora do fluxo por tag. Isso está em `vercel.json`, versionado, e não no painel:

```json
{ "git": { "deploymentEnabled": { "main": false } } }
```

Branch não citada continua com preview automático; só `main` para de disparar. Deploy pela CLI, que é o do workflow por tag, continua funcionando.

**Terceiro ambiente**, se algum dia for preciso: Supabase local por Docker (`supabase start`). Não consome a cota gratuita, e é o mesmo caminho de quem for contribuir com o projeto sem acesso aos projetos gerenciados.

**Branching do Supabase foi considerado e recusado**, por dois motivos independentes:

1. É recurso do plano Pro. O plano gratuito não tem branching, e o princípio 4 é custo zero de operação.
2. Mesmo pago, branch e ambiente resolvem problemas diferentes. Uma preview branch é efêmera: nasce com o pull request, é recriada a partir das migrations e morre no merge. Um ambiente de desenvolvimento precisa do contrário — a família de teste cadastrada ontem tem de continuar lá hoje. E produção nunca é branch, em plano nenhum.

Ou seja, branching não substituiria nenhum dos dois projetos; substituiria o Docker local, que já faz esse papel de graça. Se o projeto migrar para Pro, branching entra como terceira camada, para preview por pull request, ao lado dos dois projetos permanentes. O custo é por hora de compute (a ordem de grandeza é de centavos por pull request curto, e de quase um projeto inteiro se uma branch ficar de pé o mês todo), e o crédito de compute do Pro não cobre branching.

**Seed de desenvolvimento**: `supabase/seed.sql` cria duas famílias, três crianças, lançamentos e uma meta, para que o ambiente de desenvolvimento tenha o que mostrar sem digitação manual. Nunca é aplicado em produção.

---

## 10. Anexo

Recursos pós-MVP estão em `docs/features.md`.

**[R] Correção de uma afirmação da versão 1.0:** dizer que nenhum recurso pós-MVP exige migração destrutiva era falso. Duas exceções: várias metas com reserva muda a semântica de linhas já gravadas (`progresso = saldo / target_cents` deixa de valer) e derruba o índice único; e mesada recorrente precisava de `created_by` anulável. A segunda já está resolvida no esquema acima, com `source` e `created_by` anulável. A primeira permanece destrutiva por natureza e está registrada como tal.
