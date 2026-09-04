#!/usr/bin/env bash
# Recusa segredo entrando no repositório.
#
# Roda como gancho de pre-commit (sobre o que está no índice) e na CI (sobre
# os arquivos versionados). Não substitui varredura do GitHub; é a barreira
# barata que pega o erro comum: colar uma chave num arquivo de exemplo, ou
# esquecer de ignorar um .env.
set -uo pipefail

MODO="${1:-índice}"
if [ "$MODO" = "tudo" ]; then
  mapfile -t ARQUIVOS < <(git ls-files)
else
  mapfile -t ARQUIVOS < <(git diff --cached --name-only --diff-filter=ACM)
fi

[ ${#ARQUIVOS[@]} -eq 0 ] && exit 0

falhas=0
reportar() {
  echo "BLOQUEADO: $1"
  echo "           $2"
  falhas=1
}

for arquivo in "${ARQUIVOS[@]}"; do
  [ -f "$arquivo" ] || continue

  case "$arquivo" in
    .env|.env.*|*/.env|*/.env.*)
      if [ "$arquivo" != ".env.example" ]; then
        reportar "$arquivo" "arquivo de ambiente não entra no repositório"
        continue
      fi
      ;;
    supabase/config.toml)
      reportar "$arquivo" "config.toml carrega a referência do projeto; é por ambiente"
      continue
      ;;
  esac

  # JWT: as chaves anon e service_role do Supabase têm esta forma.
  if grep -qE '\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}' "$arquivo"; then
    reportar "$arquivo" "parece um JWT (chave do Supabase)"
  fi

  # Chaves de API no formato novo do Supabase.
  if grep -qE '\bsb_(secret|publishable)_[A-Za-z0-9_-]{10,}' "$arquivo"; then
    reportar "$arquivo" "parece uma chave de API do Supabase"
  fi

  # Variável de segredo com valor preenchido. O .env.example fica com o lado
  # direito vazio de propósito.
  if grep -qE '^(SUPABASE_SERVICE_ROLE_KEY|TOKEN_PEPPER|NEXT_PUBLIC_SUPABASE_ANON_KEY|DATABASE_URL)=.+' "$arquivo"; then
    reportar "$arquivo" "variável de segredo com valor preenchido"
  fi

  # Chave privada de qualquer tipo.
  if grep -qE 'BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY' "$arquivo"; then
    reportar "$arquivo" "chave privada"
  fi
done

if [ $falhas -ne 0 ]; then
  echo ""
  echo "Segredo vive em .env.local (local) e nas variáveis de ambiente da Vercel."
  echo "Nunca no repositório, nunca colado em conversa."
  exit 1
fi

echo "ok: nenhum segredo aparente em ${#ARQUIVOS[@]} arquivo(s)"
