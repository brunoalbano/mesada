# Mesada

Aplicativo para pais controlarem a mesada dos filhos, e para os filhos acompanharem saldo, histórico e a meta de poupança.

**Status: banco pronto e testado. Aplicação com login do responsável e criação de família.**

## Documentos

- [`docs/architecture.md`](docs/architecture.md) — stack, modelo de dados, autenticação, isolamento por família, sistema de design lúdico decisões tomadas e operação.
- [`docs/features.md`](docs/features.md) — escopo do MVP, roteiro pós-MVP e ordem de construção.

## Resumo

- Vários responsáveis por família; um responsável pode participar de várias famílias.
- Uma família nunca vê os dados de outra.
- A criança acessa pelo link próprio, sem precisar de conta. Conta Google é opcional.
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
npm test          # unidade: dinheiro, idioma, paridade de traduções
npm run typecheck
npm run test:db   # banco: 78 asserções mais os testes de concorrência
```

## Banco de dados

Migrations em `supabase/migrations/`, aplicadas em ordem por nome. A suíte de fumaça prova o que os documentos afirmam: isolamento entre famílias, razão imutável, estorno correto, ciclo da meta e validade do link.

```bash
scripts/db-test.sh          # recria um banco descartável, aplica tudo e testa
```

`supabase/seed.sql` popula um ambiente de desenvolvimento com duas crianças, histórico e metas. Nunca em produção.

O script precisa de um Postgres local. `supabase/tests/00_local_shim.sql` reproduz o mínimo do ambiente Supabase (schema `auth`, `auth.uid()`, roles e privilégios padrão) e **não** é aplicado em produção.

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
