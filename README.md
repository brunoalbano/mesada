# Mesada

Aplicativo para pais controlarem a mesada dos filhos, e para os filhos acompanharem saldo, histórico e a meta de poupança.

**Status: em construção.** O banco está pronto e testado. A aplicação já faz login do responsável, família, convite de responsável, cadastro de criança, lançamento, estorno, saldo, histórico e meta.

## Documentos

- [`docs/architecture.md`](docs/architecture.md) — stack, modelo de dados, autenticação, isolamento por família, sistema de design lúdico decisões tomadas e operação.
- [`docs/features.md`](docs/features.md) — escopo do MVP, roteiro pós-MVP e ordem de construção.

## Resumo

- Vários responsáveis por família; um responsável pode participar de várias famílias.
- Uma família nunca vê os dados de outra.
- A criança acessa com conta própria (Google ou magic link), vinculada por convite do responsável.
- Histórico de créditos e débitos imutável, com estorno em vez de edição.
- Uma meta de poupança por criança: o saldo total alcança o alvo, a meta congela e não reabre.
- PWA, mobile first, interface lúdica para 4 a 16 anos.
- Português, inglês e espanhol, detectados pelo navegador.
- Hospedagem e banco em planos gratuitos: Next.js na Vercel, Postgres no Supabase.

## Rodar

```bash
npm install
cp .env.example .env.local     # preencha com o projeto Supabase de desenvolvimento
npm run dev
```

```bash
npm test           # unidade: dinheiro, idioma, idade, paridade de traduções
npm run typecheck
npm run test:db    # banco: 78 asserções mais os testes de concorrência
npm run test:e2e   # navegador: fluxos críticos, em viewport de celular
```

Os fluxos de `e2e/publico.spec.ts` não exigem segredo nenhum e rodam em qualquer clone. O de `e2e/responsavel.spec.ts` precisa de uma conta de teste em `E2E_EMAIL` e `E2E_SENHA`, e é pulado sem elas.

Se a máquina já tem um Chromium do Playwright, aponte para ele em vez de baixar outro:

```bash
CHROMIUM_PATH=/caminho/para/chrome npm run test:e2e
```

## Banco de dados

Migrations em `supabase/migrations/`, aplicadas em ordem por nome. A suíte de fumaça prova o que os documentos afirmam: isolamento entre famílias, razão imutável, estorno correto, ciclo da meta e validade do link.

```bash
scripts/db-test.sh          # recria um banco descartável, aplica tudo e testa
```

`supabase/seed.sql` popula um ambiente de desenvolvimento com duas crianças, histórico e metas. Nunca em produção.

O script precisa de um Postgres local. `supabase/tests/00_local_shim.sql` reproduz o mínimo do ambiente Supabase (schema `auth`, `auth.uid()`, roles e privilégios padrão) e **não** é aplicado em produção.

## Configurar o deploy

Uma vez por repositório, na sua máquina, com o `gh` autenticado:

```bash
scripts/setup-github.sh
```

Cria os Environments `desenvolvimento` e `producao`, exige aprovação humana em produção, restringe produção a tags `v*`, e pede os segredos interativamente, sem eco e sem passar por argumento.

O lado da Vercel já está em `vercel.json`: `main` não dispara deploy automático, porque produção sai por tag.

## Verificar contra um projeto real

`scripts/db-test.sh` prova as regras contra Postgres local. Contra um projeto Supabase de verdade entram coisas que o local não tem: PostgREST, o hook do JWT, os grants da plataforma, e a RLS avaliada com um token emitido pelo Auth.

```bash
export SUPABASE_URL='https://<ref>.supabase.co'
export SUPABASE_ANON_KEY='sb_publishable_...'
export EMAIL_A='mae@exemplo.dev'  SENHA_A='...'
export EMAIL_B='pai@exemplo.dev'  SENHA_B='...'
scripts/verificar-ambiente.sh
```

Precisa de duas contas já confirmadas. Crie-as no painel, em **Authentication → Users → Add user**, com **Auto Confirm User** marcado — assim a confirmação de e-mail continua exigida para todo mundo, que é o padrão certo.

**Só contra desenvolvimento.** O script cria família, criança e lançamentos.

## Segredos

Nenhuma chave entra no repositório. `.env.local` fica só na máquina de quem desenvolve, e em produção os valores vivem nas variáveis de ambiente da Vercel, separados por ambiente.

`scripts/check-secrets.sh` recusa JWT, chave de API do Supabase, chave privada, arquivo `.env` e variável de segredo preenchida. Roda de duas formas:

```bash
git config core.hooksPath .githooks   # uma vez por clone: ativa o pre-commit
scripts/check-secrets.sh tudo         # varre o que já está versionado
```

O gancho de pre-commit está versionado em `.githooks/`, mas o Git não o ativa sozinho num clone novo — daí o `git config` acima. A CI roda a varredura em todo push e pull request, então um clone sem o gancho ainda é pego.

`TOKEN_PEPPER` precisa ser **diferente** entre desenvolvimento e produção: com o mesmo valor, um token gerado em desenvolvimento vale no banco de produção.

## Licença

MIT. Ver [LICENSE](LICENSE).
