# Cofrinho

Aplicativo para pais controlarem a mesada dos filhos, e para os filhos acompanharem saldo, histórico e a meta de poupança.

**Status: arquitetura aprovada, implementação não iniciada.**

## Documentos

- [`docs/architecture.md`](docs/architecture.md) — stack, modelo de dados, autenticação, isolamento por família, sistema de design lúdico e decisões pendentes de aprovação.
- [`docs/features.md`](docs/features.md) — escopo do MVP, roteiro pós-MVP e ordem de construção.

## Resumo

- Vários responsáveis por família; um responsável pode participar de várias famílias.
- Uma família nunca vê os dados de outra.
- A criança acessa pelo link próprio, sem precisar de conta. Conta Google é opcional.
- Histórico de créditos e débitos imutável, com estorno em vez de edição.
- Uma meta de poupança por criança: o saldo total alcança o alvo, a meta congela e não reabre.
- PWA, mobile first, interface lúdica para 4 a 16 anos.
- Hospedagem e banco em planos gratuitos: Next.js na Vercel, Postgres no Supabase.

## Licença

MIT. Ver [LICENSE](LICENSE).
