# Mesada — Documento de Arquitetura e Design

**Status:** proposta para revisão
**Versão:** 0.1
**Data:** 2026-09-04

Este documento descreve a arquitetura, o modelo de dados, o modelo de autenticação e o sistema de design do aplicativo. Ele precisa ser aprovado antes de qualquer código ser escrito. As decisões em aberto estão listadas na seção "Decisões pendentes de aprovação", no final.

---

## 1. Visão geral do produto

Aplicativo para pais controlarem a mesada dos filhos e para os filhos acompanharem o próprio saldo, o histórico e as metas de poupança.

Princípios que guiam todas as decisões técnicas:

1. **Mobile first.** O aplicativo é usado no celular, em pé, com uma mão. O desktop é um caso secundário que deve funcionar, não uma prioridade de design.
2. **Lúdico e legível por crianças de 4 a 16 anos.** A interface da criança é a interface principal do produto, não um anexo da interface do pai.
3. **Histórico imutável.** Dinheiro é assunto sério mesmo quando o valor é de dois reais. Nenhum lançamento é apagado ou editado.
4. **Custo zero de operação.** Somente serviços com plano gratuito permanente.
5. **Isolamento de dados por família garantido no banco**, não apenas na aplicação.

---

## 2. Stack

| Camada | Escolha | Motivo |
|---|---|---|
| Framework | Next.js 15 (App Router, TypeScript, React Server Components) | Um único projeto para interface e API. Deploy trivial. TypeScript é a stack do time. |
| Hospedagem | Vercel, plano Hobby | Grátis, deploy por push no Git, HTTPS e domínio incluídos, cron incluído. |
| Banco de dados | Supabase Postgres, plano Free | Postgres gerenciado com Row Level Security. 500 MB de armazenamento, muito acima da necessidade. |
| Autenticação | Supabase Auth | Google OAuth, magic link por e-mail e sessão anônima. Integra com RLS pelo JWT. |
| Estilo | Tailwind CSS + shadcn/ui | Rápido, mobile first por padrão, componentes acessíveis. |
| Animação | Motion (antigo framer-motion) | Micro-interações lúdicas com respeito a `prefers-reduced-motion`. |
| PWA | Serwist | Sucessor mantido do `next-pwa`. Service worker, manifest, instalação e leitura offline. |
| Validação | Zod | Um único esquema para formulário, Server Action e limites do banco. |
| Testes | Vitest (unidade) + Playwright (fluxo crítico) | Playwright já está disponível no ambiente. |

### Alternativas consideradas

- **.NET no Azure App Service (plano gratuito):** o time tem experiência em C#, mas o plano gratuito do App Service hiberna, não aceita domínio próprio e não oferece banco relacional gratuito permanente. Custo de operação passa de zero. Recusado.
- **Cloudflare Workers + D1 + Hono:** excelente custo e latência, mas exige escrever autenticação, OAuth e políticas de acesso à mão. Recusado para o MVP; é a rota de migração natural caso o Supabase deixe de atender.

### Riscos operacionais conhecidos

- **O projeto Supabase Free é pausado após 7 dias sem requisição.** Mitigação: um GitHub Action agendado faz uma consulta trivial a cada 3 dias.
- **Vercel Hobby permite cron diário.** Suficiente para mesada recorrente (recurso pós-MVP). Se a granularidade não bastar, usar `pg_cron` no Supabase.
- **Notificação push em iOS** só funciona depois que o usuário adiciona o aplicativo à tela de início. A tela de onboarding precisa ensinar isso explicitamente.

---

## 3. Modelo de dados

Todos os valores monetários são armazenados como **inteiros em centavos** (`bigint`). Ponto flutuante nunca é usado para dinheiro. Todos os carimbos de tempo são `timestamptz`; a apresentação converte para `America/Sao_Paulo`.

### 3.1 Tabelas

```sql
-- Pais e responsáveis vêm de auth.users (Supabase Auth).

families (
  id            uuid primary key,
  name          text not null,
  created_by    uuid not null references auth.users(id),
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
  id            uuid primary key,
  family_id     uuid not null references families(id) on delete cascade,
  name          text not null,             -- apelido, não nome completo
  avatar_key    text not null,             -- chave de avatar ilustrado, nunca foto
  birthdate     date,                      -- opcional, define o modo de interface
  ui_mode       text check (ui_mode in ('pequeno', 'grande')), -- sobrescreve a idade
  archived_at   timestamptz,
  created_at    timestamptz not null default now()
)

child_identities (
  child_id      uuid not null references children(id) on delete cascade,
  auth_user_id  uuid not null references auth.users(id) on delete cascade unique,
  provider      text not null check (provider in ('google', 'email', 'link')),
  linked_at     timestamptz not null default now(),
  primary key (child_id, auth_user_id)
)

access_tokens (
  id            uuid primary key,
  child_id      uuid not null references children(id) on delete cascade,
  token_hash    bytea not null unique,     -- SHA-256 do token; o token em claro nunca é salvo
  label         text,                      -- "tablet da sala", "celular da avó"
  can_request   boolean not null default false,
  expires_at    timestamptz not null,
  revoked_at    timestamptz,
  last_used_at  timestamptz,
  created_by    uuid not null references auth.users(id),
  created_at    timestamptz not null default now()
)

invites (
  id            uuid primary key,
  family_id     uuid not null references families(id) on delete cascade,
  kind          text not null check (kind in ('parent', 'child')),
  child_id      uuid references children(id) on delete cascade, -- obrigatório quando kind='child'
  email         text,
  token_hash    bytea not null unique,
  role          text check (role in ('owner', 'parent')),
  expires_at    timestamptz not null,
  accepted_at   timestamptz,
  accepted_by   uuid references auth.users(id),
  created_by    uuid not null references auth.users(id),
  created_at    timestamptz not null default now()
)

transactions (
  id            uuid primary key,
  child_id      uuid not null references children(id) on delete cascade,
  amount_cents  bigint not null check (amount_cents <> 0), -- positivo credita, negativo debita
  reason        text not null,
  emoji         text,                      -- ícone escolhido no lançamento
  reverses_id   uuid references transactions(id) unique,   -- estorno aponta o original
  created_by    uuid not null references auth.users(id),
  created_at    timestamptz not null default now()
)

goals (
  id            uuid primary key,
  child_id      uuid not null references children(id) on delete cascade,
  title         text not null,             -- "bicicleta"
  emoji         text not null default '🎯',
  target_cents  bigint not null check (target_cents > 0),
  status        text not null default 'active'
                check (status in ('active', 'reached', 'cancelled')),
  reached_at    timestamptz,               -- congela a meta; nada é recalculado depois
  created_by    uuid not null references auth.users(id),
  created_at    timestamptz not null default now()
)

-- No máximo uma meta ativa por criança.
create unique index one_active_goal_per_child
  on goals (child_id) where status = 'active';
```

### 3.2 Regras do razão (ledger)

- `transactions` é **append-only**. Não existe `UPDATE` nem `DELETE` nessa tabela; a permissão é negada por política do banco.
- Uma correção é feita por **estorno**: uma nova linha de valor oposto, com `reverses_id` apontando para a original. As duas linhas aparecem no histórico, a original marcada como estornada.
- `saldo = SUM(transactions.amount_cents)` para a criança. É o único saldo que existe: não há saldo livre nem valor bloqueado.
- Nenhum saldo é armazenado em coluna. Se a soma virar gargalo (improvável antes de dezenas de milhares de linhas por criança), o próximo passo é uma view materializada, não uma coluna mutável.

### 3.3 Modelo de metas de poupança

A meta é deliberadamente simples: **uma única meta ativa por criança, com um valor-alvo que o saldo total precisa alcançar.**

- A criança tem no máximo uma meta ativa. A restrição é garantida pelo índice único parcial acima, não só pela aplicação.
- O progresso é calculado, nunca armazenado: `progresso = saldo / target_cents`, limitado a 100%.
- Não existe reserva, alocação nem saldo bloqueado. O dinheiro da meta é o próprio saldo da criança, e ela continua livre para gastar.
- Quando o saldo alcança `target_cents`, a meta passa a `reached`, `reached_at` é preenchido e **o cálculo para ali**. Depois disso a meta é um registro histórico: se o saldo cair, a meta continua alcançada e o progresso continua exibido como 100%. Uma meta alcançada nunca volta a ser ativa.
- Alcançar a meta não movimenta dinheiro. A compra do objetivo é um débito comum no razão, como qualquer outro.
- Para começar uma meta nova, a criança ou o pai cria outra. A anterior fica no histórico com `reached` ou `cancelled`.

Motivo da escolha: com uma única meta, o saldo total é uma resposta honesta para "quanto falta", e a criança de 4 anos entende a pergunta "quanto falta pra bicicleta" olhando um número só. Um modelo de reserva com várias metas simultâneas foi considerado e recusado por ser complexo demais para o público e para o MVP.

---

## 4. Autenticação e autorização

### 4.1 Papéis

| Papel | Como entra | O que faz |
|---|---|---|
| Pai/responsável | Google OAuth ou magic link | Cria família, convida outro responsável, cria criança, lança crédito e débito, estorna, cria meta, gera e revoga link da criança |
| Criança com conta | Google OAuth ou magic link | Vê saldo, histórico e metas. Reserva para meta se o pai permitir |
| Criança por link | URL com token, sem senha | Vê saldo, histórico e metas. Somente leitura por padrão |

Um pai pode pertencer a várias famílias (`family_members`). Uma família não enxerga nada de outra família.

### 4.2 A criança é um perfil, não um usuário

`children` é o perfil. As formas de acesso a esse perfil ficam em `child_identities` (contas) e `access_tokens` (links). Uma criança pode ter zero contas, uma conta Google, e vários links ao mesmo tempo. Todos resolvem para o mesmo `child_id`.

Isso importa porque **conta Google exige 13 anos no Brasil**, e contas supervisionadas por Family Link podem ter o OAuth de terceiros bloqueado pelo controle parental. Consequência de projeto: **o link é o caminho principal de acesso da criança e a conta é opcional.** O aplicativo nunca exige conta para a criança ver o saldo.

### 4.3 Normalização das sessões

Todo acesso vira uma sessão Supabase, para que a autorização fique inteiramente em Row Level Security.

- **Conta (Google ou magic link):** fluxo padrão do Supabase Auth. Existe `auth.uid()`.
- **Link:** uma rota de servidor recebe o token, calcula o SHA-256, procura em `access_tokens`, valida expiração e revogação. Se válido, cria uma **sessão anônima** do Supabase, registra a identidade correspondente e devolve a sessão em cookie.

Um **Custom Access Token Hook** (função Postgres do Supabase Auth) injeta no JWT as claims `child_id` e `child_scope` quando o usuário autenticado corresponde a uma identidade de criança. As políticas RLS leem `auth.jwt() ->> 'child_id'`, então pai e criança são cobertos pelas mesmas políticas, independente do caminho de login.

### 4.4 Política de exemplo

```sql
create policy transactions_select on transactions
for select using (
  -- a própria criança, por conta ou por link
  child_id = nullif(auth.jwt() ->> 'child_id', '')::uuid
  or
  -- qualquer responsável da família da criança
  exists (
    select 1
    from children c
    join family_members fm on fm.family_id = c.family_id
    where c.id = transactions.child_id
      and fm.user_id = auth.uid()
  )
);

create policy transactions_insert on transactions
for insert with check (
  exists (
    select 1
    from children c
    join family_members fm on fm.family_id = c.family_id
    where c.id = transactions.child_id
      and fm.user_id = auth.uid()
  )
);

-- Nenhuma policy de update ou delete é criada em transactions.
-- Sem policy, a operação é negada. O razão é imutável por construção.
```

### 4.5 Segurança do link de acesso

Esta seção descreve um risco real. Ela está escrita em texto direto porque a ordem das mitigações importa.

Um token que trafega na URL vaza com facilidade. Ele aparece no histórico do navegador, em logs de servidor e de proxy, no cabeçalho `Referer` enviado a terceiros, e em qualquer captura de tela que a criança compartilhe. Quem obtiver o link passa a ver os dados da criança.

As mitigações abaixo são cumulativas e todas fazem parte do MVP:

1. O token tem 32 bytes gerados por `crypto.getRandomValues`, codificados em base64url.
2. O banco guarda apenas o SHA-256 do token. O valor em claro é exibido ao pai uma única vez, no momento da criação.
3. O token fica em segmento de caminho (`/c/<token>`), nunca em query string. Segmentos de caminho vazam menos em logs e ferramentas de analytics.
4. Na primeira visita, o servidor troca o token por um cookie de sessão `HttpOnly`, `Secure`, `SameSite=Lax`, e o cliente limpa a URL com `history.replaceState`. O token deixa a barra de endereços.
5. O escopo padrão é somente leitura. O token nunca cria, edita ou estorna lançamento.
6. `expires_at` obrigatório, com padrão de 180 dias. O pai revoga e gera outro a qualquer momento, e vê `last_used_at` de cada link.
7. Cabeçalho `Referrer-Policy: no-referrer` no aplicativo inteiro.
8. Limite de taxa por token na rota de troca, para impedir varredura de tokens.

Uma conta Google só é vinculada a uma criança por meio de convite consumido ou de sessão de link válida. **A vinculação nunca é feita por igualdade de endereço de e-mail**, porque qualquer pessoa capaz de criar um endereço parecido passaria a ser a criança. A restrição `unique (auth_user_id)` em `child_identities` impede que a mesma conta Google aponte para duas crianças.

### 4.6 Sessões simultâneas

O pai abre o link da filha para conferir e não pode perder a própria sessão. O cookie da criança usa nome próprio e `Path=/c`; o cookie do responsável permanece em `/`. Quando uma sessão de criança está ativa, uma faixa fixa mostra "Você está vendo como Ana" com o botão de sair.

### 4.7 Dados pessoais de menores (LGPD)

O tratamento de dado de criança exige minimização. Consequências diretas no produto:

- Guardamos apelido, não nome completo.
- Avatar é ilustração escolhida em uma lista fechada. **O MVP não aceita upload de foto.**
- Data de nascimento é opcional e serve apenas para escolher o modo de interface.
- Criança que acessa por link não tem e-mail cadastrado.
- Exclusão de família apaga em cascata todos os dados das crianças.

---

## 5. Estrutura do aplicativo

```
app/
  (parent)/                 # área do responsável, cookie de sessão em "/"
    familias/
    criancas/[id]/
    convites/
  c/                        # área da criança, cookie com Path=/c
    [token]/                # troca token por sessão e redireciona
    saldo/
    historico/
    metas/
  api/
    child-session/          # troca de token por sessão, com limite de taxa
lib/
  money.ts                  # centavos, formatação pt-BR, nunca float
  supabase/
  auth/
components/
  ludic/                    # mascote, moeda, confete, avatares
supabase/
  migrations/               # SQL versionado, incluindo as policies RLS
```

Escrita de dados acontece em **Server Actions**, com validação Zod na entrada e o cliente Supabase do usuário autenticado — nunca com `service_role`. A única exceção é a rota de troca de token, que precisa consultar `access_tokens` antes de existir sessão; ela usa `service_role`, é a menor superfície possível do sistema e não recebe nenhum outro dado do usuário além do token.

---

## 6. Sistema de design lúdico

O público vai de 4 a 16 anos. Um único visual não atende as duas pontas: o que encanta quem tem 5 anos constrange quem tem 15. A solução é um **modo de interface**, não dois aplicativos.

### 6.1 Modos

| | Modo Pequeno (4 a 8 anos) | Modo Grande (9 a 16 anos) |
|---|---|---|
| Leitura exigida | Mínima. Ícone e número grandes | Normal |
| Saldo | Número enorme, moedas ilustradas | Número grande, tipografia limpa |
| Histórico | Lista de ícones com valor colorido | Lista com data, motivo e autor |
| Meta | Cofrinho que enche, mascote comemora | Barra de progresso e valor que falta |
| Animação | Generosa: moeda cai, confete, mascote pula | Discreta: transição e confete na conquista |
| Som | Opcional, desligado por padrão | Desligado |
| Vocabulário | "Você ganhou", "Você gastou", "Falta pouco" | "Crédito", "Débito", "Meta" |

O modo é escolhido pela data de nascimento e pode ser sobrescrito pelo pai em `children.ui_mode`. A criança de 12 anos que gosta do modo pequeno não é impedida.

### 6.2 Identidade visual

- **Nome do aplicativo:** proposta **Mesada**, com o mascote **Poupi**, um porquinho-cofre. Alternativas para decidir: Cofrinho, Poupi, Guardinha, Mealheiro. *Precisa de aprovação.*
- **Mascote:** Poupi aparece no ícone, no estado vazio, na comemoração de meta e nas telas de erro. Ele é o elemento que faz a criança de 4 anos reconhecer o aplicativo sem saber ler.
- **Ícone do aplicativo:** Poupi sobre círculo de cor sólida, sem texto. Legível a 48 px. Conjunto completo de ícones maskable para instalação em Android e iOS.
- **Paleta:** base roxo-índigo; acentos amarelo-moeda, verde-entrada e coral-saída. Entrada e saída **nunca se distinguem só pela cor** — sempre acompanham sinal, ícone e palavra, porque daltonismo é comum e a criança pequena ainda não lê o sinal isolado.
- **Tipografia:** Baloo 2 para títulos e valores (arredondada, alegre), Nunito para texto corrido. Ambas no Google Fonts, com fallback de sistema.
- **Ilustração:** avatares de animais em estilo plano, conjunto fechado de cerca de 16 opções. A criança escolhe o seu.
- **Textos de interface e placeholders** seguem o mesmo tom lúdico: "No que você gastou?", "Quanto falta pra bicicleta?", "Seu cofrinho tá assim". O tom muda conforme o modo.

### 6.3 Acessibilidade, que aqui é requisito e não enfeite

- Área de toque mínima de 48 por 48 px em toda a interface da criança.
- Contraste mínimo AA (4.5:1) para texto; os valores em destaque ficam acima disso.
- Corpo de texto nunca abaixo de 16 px; valores monetários acima de 32 px.
- `prefers-reduced-motion` desliga confete e movimento do mascote.
- Toda animação tem uma leitura estática equivalente. Nenhuma informação existe só no movimento.
- Navegação por teclado e rótulos ARIA em todos os controles, para leitor de tela.

---

## 7. PWA

- `manifest.webmanifest` com nome, ícones maskable, `display: standalone`, `theme_color` e `start_url` separados para responsável e criança.
- Service worker com Serwist: casco do aplicativo em cache; saldo, histórico e metas com estratégia *stale-while-revalidate*, para que a criança abra offline e veja o último estado conhecido, marcado como "atualizado às HH:MM".
- Escrita é sempre online no MVP. Fila offline de lançamentos fica para depois.
- Tela de onboarding ensina "adicionar à tela de início", com instrução específica por sistema. Sem isso, iOS não instala nem envia push.

---

## 8. Decisões pendentes de aprovação

1. **Nome e mascote.** Proposta: aplicativo "Mesada", mascote "Poupi", o porquinho. Confirmar ou escolher outro.
2. **Quem cria a meta.** Proposta: o pai cria e edita; a criança apenas acompanha. Alternativa: a criança propõe e o pai aprova.
3. **Meta alcançada com saldo em queda.** Proposta: a meta continua `reached` para sempre, conforme a seção 3.3. Alternativa: reabrir a meta quando o saldo cai abaixo do alvo, o que consideramos frustrante para a criança.
4. **Validade padrão do link da criança.** Proposta: 180 dias, renovável em um toque.
5. **Moeda.** Proposta: somente BRL no MVP, com a coluna de moeda já prevista para depois.
6. **Domínio.** `mesada.vercel.app` no início, ou domínio próprio desde já.

---

## 9. Anexo: o que este documento não cobre

Recursos pós-MVP têm o próprio documento, em `docs/features.md`. Eles influenciam o modelo de dados acima somente onde já está indicado (moeda, cofrinho com rendimento, tarefas), e nenhum deles exige migração destrutiva a partir do esquema proposto.
