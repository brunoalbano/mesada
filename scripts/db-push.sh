#!/usr/bin/env bash
# Aplica as migrations num projeto Supabase.
#
# Uso:
#   export DATABASE_URL='postgresql://postgres.<ref>:<senha>@aws-0-<regiao>.pooler.supabase.com:5432/postgres'
#   scripts/db-push.sh              # mostra o que faria
#   scripts/db-push.sh --aplicar    # aplica
#
# Use o SESSION pooler, porta 5432. O pooler de transação (6543) não serve:
# não mantém estado de sessão, e as migrations dependem de advisory lock e de
# objetos criados em sequência dentro da mesma conexão.
#
# A senha nunca entra em argumento de linha de comando: argumento aparece no
# `ps` de qualquer processo da máquina e no histórico do shell. Só variável de
# ambiente.
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

# Identifica o alvo sem imprimir a senha.
alvo=$(psql "$DATABASE_URL" -tAX -c \
  "select current_database() || ' em ' || inet_server_addr()::text" 2>/dev/null || true)
if [ -z "$alvo" ]; then
  echo "Não consegui conectar. Confira a senha em DATABASE_URL e a porta 5432."
  exit 1
fi

existentes=$(psql "$DATABASE_URL" -tAX -c \
  "select count(*) from information_schema.tables
    where table_schema = 'public' and table_name in
      ('families','children','transactions','goals')")

echo "Alvo: $alvo"
echo "Tabelas do Mesada já presentes: $existentes de 4"
echo ""

if [ "$existentes" != "0" ]; then
  echo "O banco já tem parte do schema. Estas migrations assumem banco limpo:"
  echo "elas criam tabelas, não migram nada existente. Reveja antes de seguir."
  exit 1
fi

echo "Migrations a aplicar, nesta ordem:"
for f in "$ROOT"/supabase/migrations/*.sql; do echo "  $(basename "$f")"; done
echo ""

if [ "$APLICAR" != true ]; then
  echo "Isto foi só a checagem. Rode com --aplicar para valer."
  exit 0
fi

for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "aplicando $(basename "$f")"
  psql "$DATABASE_URL" -q -v ON_ERROR_STOP=1 -f "$f"
done

echo ""
echo "Pronto. Falta configurar no painel do Supabase:"
echo "  1. Authentication > Hooks > Custom Access Token > public.custom_access_token_hook"
echo "  2. Authentication > Sessions > TTL do access token entre 600 e 900 segundos"
echo "  3. Authentication > Providers > Anonymous Sign-Ins habilitado"
