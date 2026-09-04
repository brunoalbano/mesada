# Mesada

Aplicativo para pais controlarem a mesada dos filhos, e para os filhos acompanharem saldo, histórico e a meta de poupança.

**Status: banco implementado e testado. Aplicação ainda não iniciada.**

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

## Banco de dados

Migrations em `supabase/migrations/`, aplicadas em ordem por nome. A suíte de fumaça prova o que os documentos afirmam: isolamento entre famílias, razão imutável, estorno correto, ciclo da meta e validade do link.

```bash
scripts/db-test.sh          # recria um banco descartável, aplica tudo e testa
```

O script precisa de um Postgres local. `supabase/tests/00_local_shim.sql` reproduz o mínimo do ambiente Supabase (schema `auth`, `auth.uid()`, roles e privilégios padrão) e **não** é aplicado em produção.

## Licença

MIT. Ver [LICENSE](LICENSE).
