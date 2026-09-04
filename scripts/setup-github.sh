#!/usr/bin/env bash
# Cria os Environments do GitHub e grava os secrets do deploy.
#
# Rode na SUA máquina, uma vez. Precisa do `gh` autenticado:
#   gh auth login
#
# Os valores são pedidos interativamente e lidos sem eco. Nunca vão por
# argumento: argumento aparece no `ps` de qualquer processo da máquina e no
# histórico do shell.
set -euo pipefail

REPO="${REPO:-brunoalbano/mesada}"

command -v gh >/dev/null || { echo "Instale o gh: https://cli.github.com"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "Rode 'gh auth login' antes."; exit 1; }

perguntar() {
  local variavel="$1" descricao="$2" valor
  printf '%s\n> ' "$descricao" >&2
  read -rs valor
  printf '\n' >&2
  [ -n "$valor" ] || { echo "vazio, abortando"; exit 1; }
  printf '%s' "$valor"
}

gravar() {  # gravar <ambiente> <nome> <valor>
  printf '%s' "$3" | gh secret set "$2" --repo "$REPO" --env "$1"
  echo "  gravado: $2 (ambiente $1)"
}

# Secret de repositório, sem ambiente. A manutenção e o backup rodam por
# agendamento, e um job com `environment:` de produção ficaria parado
# esperando aprovação humana a cada execução — ou seja, nunca rodaria.
gravar_repo() {  # gravar_repo <nome> <valor>
  printf '%s' "$2" | gh secret set "$1" --repo "$REPO"
  echo "  gravado: $1 (repositório)"
}

echo "Repositório: $REPO"
echo ""

# --------------------------------------------------------------------------
echo "== Environment: desenvolvimento =="
gh api --method PUT -H "Accept: application/vnd.github+json" \
  "repos/$REPO/environments/desenvolvimento" --silent
echo "  criado"

url_dev=$(perguntar SUPABASE_DB_URL \
  "URL do banco de DESENVOLVIMENTO (session pooler, porta 5432; a digitação não aparece)")
case "$url_dev" in
  *:6543/*) echo "Essa é a porta do pooler de transação. Use a 5432."; exit 1 ;;
esac
gravar desenvolvimento SUPABASE_DB_URL "$url_dev"
gravar_repo SUPABASE_DB_URL_DEV "$url_dev"

# --------------------------------------------------------------------------
echo ""
echo "== Environment: producao =="

# Aprovação humana obrigatória: produção não tem PITR no plano gratuito, e o
# dump semanal pode estar sete dias atrás.
meu_id=$(gh api user --jq .id)
gh api --method PUT -H "Accept: application/vnd.github+json" \
  "repos/$REPO/environments/producao" \
  -F "reviewers[][type]=User" -F "reviewers[][id]=$meu_id" \
  -F "deployment_branch_policy[protected_branches]=false" \
  -F "deployment_branch_policy[custom_branch_policies]=true" --silent
echo "  criado, com aprovação humana obrigatória"

# Só tags v* podem publicar em produção.
gh api --method POST -H "Accept: application/vnd.github+json" \
  "repos/$REPO/environments/producao/deployment-branch-policies" \
  -f "name=v*" -f "type=tag" --silent 2>/dev/null && echo "  restrito a tags v*" \
  || echo "  (a regra de tag v* já existia)"

url_prod=$(perguntar SUPABASE_DB_URL \
  "URL do banco de PRODUÇÃO (deixe vazio se o projeto ainda não existe)" || true)
if [ -n "${url_prod:-}" ]; then
  case "$url_prod" in
    *:6543/*) echo "Essa é a porta do pooler de transação. Use a 5432."; exit 1 ;;
  esac
  if [ "$url_prod" = "$url_dev" ]; then
    echo "A URL de produção é igual à de desenvolvimento. Abortando."
    exit 1
  fi
  gravar producao SUPABASE_DB_URL "$url_prod"
  gravar_repo SUPABASE_DB_URL_PROD "$url_prod"

  # Dump em claro num artefato é o banco inteiro disponível para quem tiver
  # acesso ao repositório.
  senha_backup=$(perguntar BACKUP_PASSPHRASE \
    "Senha para cifrar o backup (gere com: openssl rand -base64 32)")
  gravar_repo BACKUP_PASSPHRASE "$senha_backup"
fi

for nome in VERCEL_TOKEN VERCEL_ORG_ID VERCEL_PROJECT_ID; do
  valor=$(perguntar "$nome" "$nome (Vercel; deixe vazio para pular)" || true)
  [ -n "${valor:-}" ] && gravar producao "$nome" "$valor"
done

echo ""
echo "Pronto. Confira em: https://github.com/$REPO/settings/environments"
