#!/usr/bin/env bash
# Recria um banco descartavel, aplica as migrations e roda a suite.
# Uso: scripts/db-test.sh [nome-do-banco]
set -euo pipefail

DB="${1:-mesada_test}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PSQL=(psql -q -v ON_ERROR_STOP=1 -d "$DB")

if [ "$(id -u)" = "0" ] && id postgres >/dev/null 2>&1; then
  run() { su postgres -c "$*"; }
else
  run() { eval "$*"; }
fi

run "dropdb --if-exists $DB"
run "createdb $DB"
run "${PSQL[*]} -f $ROOT/supabase/tests/00_local_shim.sql"

for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "aplicando $(basename "$f")"
  run "${PSQL[*]} -f $f"
done

run "${PSQL[*]} -f $ROOT/supabase/tests/01_smoke.sql"
