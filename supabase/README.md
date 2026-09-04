# Banco de dados

Migrations aplicadas em ordem alfabética do nome do arquivo.

| Arquivo | Conteúdo |
|---|---|
| `20260904000001_schema.sql` | tabelas, constraints, índices, view `child_balances` |
| `20260904000002_functions.sql` | helpers de autorização, espelho de `profiles`, triggers do razão e das metas |
| `20260904000003_rls.sql` | RLS ligada nas dez tabelas, `revoke`, grants por coluna, matriz de policies |
| `20260904000004_rpc.sql` | operações que não são expressáveis como policy, e limite de taxa da troca de token |
| `20260904000005_auth_hook.sql` | Custom Access Token Hook que injeta `child_id` no JWT |

## Rodar os testes

```bash
scripts/db-test.sh            # banco padrão: mesada_test
scripts/db-test.sh outro_db
```

Recria o banco do zero, aplica o shim local, aplica as migrations, roda `tests/01_smoke.sql` (78 asserções) e depois `tests/02_concurrency.sh`. Qualquer falha aborta com o nome do teste.

`02_concurrency.sh` roda separado porque precisa de **duas conexões simultâneas**: as corridas que ele cobre — lançar e criar meta ao mesmo tempo, estornar e creditar ao mesmo tempo — são invisíveis para uma sessão só, e as duas produziam estado errado antes do advisory lock por criança.

Todo teste negativo declara o SQLSTATE que espera. Um "falhou de algum jeito" não prova nada: na versão anterior, o teste de unicidade de estorno passava por violar a regra do valor oposto, e um teste de policy passava por falta de `GRANT`.

`tests/00_local_shim.sql` reproduz o mínimo do ambiente Supabase de que as migrations dependem: schema `auth`, `auth.uid()`, os roles `anon`, `authenticated`, `service_role` e `supabase_auth_admin`, e os privilégios padrão que o Supabase concede nas tabelas de `public`. **Nunca aplicar o shim em produção.**

Reproduzir os grants do Supabase é essencial: um teste que passa por falta de `GRANT` não prova nada sobre as policies.

## Aplicar no Supabase

```bash
export DATABASE_URL='postgresql://postgres.<ref>:<senha>@aws-0-<regiao>.pooler.supabase.com:5432/postgres'
scripts/db-push.sh              # verifica o alvo e lista o que faria
scripts/db-push.sh --aplicar    # aplica
```

Use o **session pooler, porta 5432**. O pooler de transação (6543) não serve: não mantém estado de sessão, e as migrations dependem de advisory lock e de objetos criados em sequência na mesma conexão. O script recusa a 6543 em vez de falhar no meio.

A senha vai por variável de ambiente, nunca por argumento: argumento aparece no `ps` de qualquer processo da máquina e no histórico do shell.

Alternativa, se preferir a CLI: `supabase link --project-ref <ref>` e depois `supabase db push`. O `supabase/config.toml` que o link cria não é versionado, porque a referência do projeto difere entre desenvolvimento e produção.

Depois, no painel:

1. **Authentication > Hooks > Custom Access Token** aponta para `public.custom_access_token_hook`.
2. **Authentication > Sessions**: TTL do access token em 600 a 900 segundos. O hook é o que revalida o link a cada refresh; um TTL longo alarga a janela entre revogar o link e a sessão morrer.
3. **Authentication > Providers > Anonymous Sign-Ins** habilitado, e o limite de taxa elevado. A troca de token acontece no servidor, então todas as famílias compartilham os IPs de saída da Vercel.

## Detalhe que a aplicação precisa saber

`invites` e `access_tokens` **não aceitam `select *`**. O `token_hash` é a credencial em si, e a única forma de escondê-lo de uma sessão de usuário é remover o `SELECT` da tabela e concedê-lo coluna a coluna. Liste as colunas nessas duas tabelas.

Motivo: revogar apenas a coluna não adianta enquanto existe o `SELECT` da tabela inteira, porque o privilégio mais amplo prevalece.

## O que os testes provam

Isolamento entre famílias; autoria e moeda vindas do servidor, não do cliente; criança arquivada sem lançamento novo; `family_members` sem inserção direta, mas com transferência de propriedade funcionando; razão imutável para sessão de usuário e para o dono da tabela, com a exceção estreita que permite apagar uma conta; exclusão de família em cascata; estorno com valor oposto, sem encadeamento e sem repetição; ciclo completo da meta, incluindo nascer alcançada com procedência registrada, não reabrir por gasto, reabrir por estorno, e não explodir quando já existe uma meta nova; link somente leitura; sessão anônima sem acesso a nada e sem poder criar família ou vincular conta; `token_hash` ilegível; `redeem_child_token` e o hook inacessíveis a sessão de usuário; dispositivo já vinculado a uma criança não virando outra; o limitador de taxa gravando a falha e disparando; e o hook deixando de emitir a claim tanto na revogação quanto na expiração.
