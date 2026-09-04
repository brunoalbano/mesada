# Banco de dados

Migrations aplicadas em ordem alfabética do nome do arquivo.

| Arquivo | Conteúdo |
|---|---|
| `20260904000001_schema.sql` | tabelas, constraints, índices, view `child_balances` |
| `20260904000002_functions.sql` | helpers de autorização, espelho de `profiles`, triggers do razão e das metas |
| `20260904000003_rls.sql` | RLS ligada nas nove tabelas, `revoke`, matriz de policies |
| `20260904000004_rpc.sql` | operações que não são expressáveis como policy, e limite de taxa da troca de token |
| `20260904000005_auth_hook.sql` | Custom Access Token Hook que injeta `child_id` no JWT |

## Rodar os testes

```bash
scripts/db-test.sh            # banco padrão: mesada_test
scripts/db-test.sh outro_db
```

Recria o banco do zero, aplica o shim local, aplica as migrations e roda `tests/01_smoke.sql`. Qualquer falha aborta com o nome do teste.

`tests/00_local_shim.sql` reproduz o mínimo do ambiente Supabase de que as migrations dependem: schema `auth`, `auth.uid()`, os roles `anon`, `authenticated`, `service_role` e `supabase_auth_admin`, e os privilégios padrão que o Supabase concede nas tabelas de `public`. **Nunca aplicar o shim em produção.**

Reproduzir os grants do Supabase é essencial: um teste que passa por falta de `GRANT` não prova nada sobre as policies.

## Aplicar no Supabase

```bash
supabase db push
```

Depois, no painel:

1. **Authentication > Hooks > Custom Access Token** aponta para `public.custom_access_token_hook`.
2. **Authentication > Sessions**: TTL do access token em 600 a 900 segundos. O hook é o que revalida o link a cada refresh; um TTL longo alarga a janela entre revogar o link e a sessão morrer.
3. **Authentication > Providers > Anonymous Sign-Ins** habilitado, e o limite de taxa elevado. A troca de token acontece no servidor, então todas as famílias compartilham os IPs de saída da Vercel.

## O que os testes provam

Isolamento entre famílias, autoria não forjável, criança arquivada sem lançamento novo, `family_members` sem inserção direta, razão imutável, estorno com valor oposto e sem encadeamento nem repetição, ciclo completo da meta (alcançar, não reabrir por gasto, reabrir por estorno, nascer alcançada), link somente leitura, sessão anônima sem claim sem acesso a nada, impossibilidade de forjar a claim por escrita em `child_identities`, e o hook deixando de emitir a claim depois da revogação e da expiração.
