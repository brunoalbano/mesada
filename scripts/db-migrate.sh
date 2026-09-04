#!/usr/bin/env bash
# Aplica as migrations ainda não aplicadas, em ordem, e registra cada uma.
#
# Uso:
#   export DATABASE_URL='postgresql://postgres.<ref>:<senha>@aws-0-<regiao>.pooler.supabase.com:5432/postgres'
#   scripts/db-migrate.sh            # mostra o que falta, sem aplicar
#   scripts/db-migrate.sh --aplicar
#
# Garantias:
#   * incremental: só aplica o que ainda não foi aplicado, então rodar de novo
#     num deploy seguinte é seguro;
#   * cada migration roda dentro de UMA transação, com o registro no mesmo
#     commit: não existe "aplicou metade e anotou";
#   * verifica soma de verificação: se um arquivo já aplicado mudou depois,
#     falha em vez de fingir que o banco está em dia;
#   * advisory lock: dois deploys simultâneos não se atropelam.
#
# Use o SESSION pooler, porta 5432. O pooler de transação (6543) não serve:
# não mantém estado de sessão, e as migrations dependem de advisory lock e de
# objetos criados em sequência na mesma conexão.
#
# A senha nunca entra em argumento: argumento aparece no `ps` de qualquer
# processo da máquina e no histórico do shell. Só variável de ambiente.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APLICAR=false
[ "${1:-}" = "--aplicar" ] && APLICAR=true

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Defina DATABASE_URL antes de rodar. Veja o cabeçalho deste arquivo."
  exit 1
fi

case "$DATABASE_URL" in
  *:6543/*)
    echo "DATABASE_URL aponta para a porta 6543, que é o pooler de transação."
    echo "Troque para 5432, o session pooler, senão as migrations falham no meio."
    exit 1
    ;;
esac

psql() { command psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 "$@"; }

alvo=$(psql -tAc "select current_database()" 2>/dev/null || true)
if [ -z "$alvo" ]; then
  echo "Não consegui conectar. Confira DATABASE_URL e a porta 5432."
  exit 1
fi
echo "Alvo: banco '$alvo'"

# Livro-caixa das migrations. Fica em app, junto dos outros objetos internos.
psql -q -c "
  create schema if not exists app;
  create table if not exists app.schema_migrations (
    version     text primary key,
    checksum    text not null,
    applied_at  timestamptz not null default now()
  );"

pendentes=()
for arquivo in "$ROOT"/supabase/migrations/*.sql; do
  versao=$(basename "$arquivo" .sql)
  soma=$(sha256sum "$arquivo" | cut -d' ' -f1)
  registrada=$(psql -tAc \
    "select checksum from app.schema_migrations where version = '$versao'")

  if [ -z "$registrada" ]; then
    pendentes+=("$arquivo")
  elif [ "$registrada" != "$soma" ]; then
    echo ""
    echo "PARADO: $versao já foi aplicada, mas o arquivo mudou desde então."
    echo "        O banco não tem o conteúdo atual deste arquivo, e aplicar de"
    echo "        novo não o traria de volta. Escreva uma migration nova."
    exit 1
  fi
done

if [ ${#pendentes[@]} -eq 0 ]; then
  echo "Nada a aplicar: o banco está em dia."
  exit 0
fi

echo "Pendentes (${#pendentes[@]}):"
for arquivo in "${pendentes[@]}"; do echo "  $(basename "$arquivo")"; done

if [ "$APLICAR" != true ]; then
  echo ""
  echo "Isto foi só a checagem. Rode com --aplicar para valer."
  exit 0
fi

for arquivo in "${pendentes[@]}"; do
  versao=$(basename "$arquivo" .sql)
  soma=$(sha256sum "$arquivo" | cut -d' ' -f1)
  echo "aplicando $versao"

  # Um deploy por vez. O lock cai sozinho ao fim da sessão, inclusive se o
  # runner morrer no meio.
  {
    echo "begin;"
    echo "select pg_advisory_xact_lock(hashtextextended('mesada:migrations', 0));"
    cat "$arquivo"
    echo ""
    echo "insert into app.schema_migrations (version, checksum) values ('$versao', '$soma');"
    echo "commit;"
  } | psql -q -f -
done

echo ""
echo "Aplicadas ${#pendentes[@]} migration(s)."
