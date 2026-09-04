#!/usr/bin/env bash
# Duas sessoes reais, para provar a serializacao por crianca.
#
# Nenhuma destas duas corridas era coberta pela suite de fumaca, e as duas
# produziam estado errado antes do advisory lock:
#   A) lancar e criar meta ao mesmo tempo. FOR UPDATE em conjunto vazio nao
#      tranca nada, entao a meta nascia ativa com o saldo ja acima do alvo.
#   B) estornar e creditar ao mesmo tempo. A reabertura acontecia antes da
#      trava, entao a outra sessao nao via a meta ativa e pulava a verificacao.
set -euo pipefail

DB="${1:-mesada_conc}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if [ "$(id -u)" = "0" ] && id postgres >/dev/null 2>&1; then
  run() { su postgres -c "$*"; }
else
  run() { eval "$*"; }
fi
q() { run "psql -q -v ON_ERROR_STOP=1 -d $DB -c \"$1\""; }
scalar() { run "psql -tAX -d $DB -c \"$1\""; }

run "dropdb --if-exists $DB"
run "createdb $DB"
run "psql -q -v ON_ERROR_STOP=1 -d $DB -f $ROOT/supabase/tests/00_local_shim.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  run "psql -q -v ON_ERROR_STOP=1 -d $DB -f $f"
done

q "insert into auth.users (id, email) values ('11111111-1111-1111-1111-111111111111','p@x.test');
   insert into families (id, name) values ('f0000000-0000-0000-0000-000000000001','F');
   insert into family_members (family_id, user_id, role)
     values ('f0000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','owner');
   insert into children (id, family_id, name, avatar_key)
     values ('c0000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000001','Ana','gato');"

fail() { echo "FALHOU: $1"; exit 1; }

# --------------------------------------------------------------------------
# A) lancamento e criacao de meta ao mesmo tempo
# --------------------------------------------------------------------------
run "psql -q -d $DB -c \"begin;
  insert into transactions (id, child_id, amount_cents, reason, created_by, created_by_name)
  values (gen_random_uuid(),'c0000000-0000-0000-0000-000000000001',100000,'mesada',
          '11111111-1111-1111-1111-111111111111','x');
  select pg_sleep(2);
commit;\"" &
sleep 0.7
run "psql -q -d $DB -c \"insert into goals (id, child_id, title, target_cents, created_by)
  values ('90000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001',
          'meta',5000,'11111111-1111-1111-1111-111111111111');\""
wait

status=$(scalar "select status from goals where id='90000000-0000-0000-0000-000000000001'")
[ "$status" = "reached" ] || fail "meta criada durante um lancamento concorrente ficou '$status', esperado 'reached'"
echo "ok    lancar e criar meta ao mesmo tempo: a meta nasce alcancada"

# --------------------------------------------------------------------------
# B) estorno e credito ao mesmo tempo
# --------------------------------------------------------------------------
q "delete from goals;
   delete from transactions;
   insert into goals (id, child_id, title, target_cents, created_by)
     values ('90000000-0000-0000-0000-000000000002','c0000000-0000-0000-0000-000000000001',
             'meta2',10000,'11111111-1111-1111-1111-111111111111');
   insert into transactions (id, child_id, amount_cents, reason, created_by, created_by_name)
     values ('a0000000-0000-0000-0000-0000000000e1','c0000000-0000-0000-0000-000000000001',
             12000,'mesada','11111111-1111-1111-1111-111111111111','x');"

reached=$(scalar "select status from goals where id='90000000-0000-0000-0000-000000000002'")
[ "$reached" = "reached" ] || fail "preparacao: meta deveria estar alcancada, veio '$reached'"

run "psql -q -d $DB -c \"begin;
  insert into transactions (id, child_id, amount_cents, reason, reverses_id, created_by, created_by_name)
  values (gen_random_uuid(),'c0000000-0000-0000-0000-000000000001',-12000,'estorno',
          'a0000000-0000-0000-0000-0000000000e1','11111111-1111-1111-1111-111111111111','x');
  select pg_sleep(2);
commit;\"" &
sleep 0.7
run "psql -q -d $DB -c \"insert into transactions (id, child_id, amount_cents, reason, created_by, created_by_name)
  values (gen_random_uuid(),'c0000000-0000-0000-0000-000000000001',11000,'mesada',
          '11111111-1111-1111-1111-111111111111','x');\""
wait

status=$(scalar "select status from goals where id='90000000-0000-0000-0000-000000000002'")
bal=$(scalar "select balance_cents from child_balances where child_id='c0000000-0000-0000-0000-000000000001'")
[ "$status" = "reached" ] || fail "estorno e credito concorrentes deixaram a meta '$status' com saldo $bal, esperado 'reached'"
echo "ok    estornar e creditar ao mesmo tempo: a meta termina coerente com o saldo ($bal)"

run "dropdb --if-exists $DB"
echo ""
echo "================================================"
echo " TESTES DE CONCORRENCIA PASSARAM"
echo "================================================"
