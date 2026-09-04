#!/usr/bin/env bash
# Verifica as garantias do banco contra um projeto Supabase de verdade.
#
# A suíte de `scripts/db-test.sh` prova as mesmas regras contra Postgres local.
# Esta aqui prova que elas continuam valendo no projeto real, onde entram
# coisas que o Postgres local não tem: PostgREST, o hook do JWT, os grants que
# a plataforma aplica, e a RLS avaliada com um JWT emitido pelo Auth.
#
# Precisa de DUAS contas já confirmadas no projeto. Crie-as pelo painel, em
# Authentication > Users > Add user, com "Auto Confirm User" marcado — assim a
# confirmação de e-mail continua exigida para todo mundo, como deve ser.
#
# Uso:
#   export SUPABASE_URL='https://<ref>.supabase.co'
#   export SUPABASE_ANON_KEY='sb_publishable_...'
#   export EMAIL_A='mae@exemplo.dev'   SENHA_A='...'
#   export EMAIL_B='pai@exemplo.dev'   SENHA_B='...'
#   scripts/verificar-ambiente.sh
#
# As senhas vão por variável de ambiente, nunca por argumento: argumento
# aparece no `ps` de qualquer processo da máquina e no histórico do shell.
#
# NÃO rode contra produção: o script cria família, criança e lançamentos.
set -uo pipefail

for obrigatoria in SUPABASE_URL SUPABASE_ANON_KEY EMAIL_A SENHA_A EMAIL_B SENHA_B; do
  if [ -z "${!obrigatoria:-}" ]; then
    echo "Falta a variável $obrigatoria. Veja o cabeçalho deste arquivo."
    exit 1
  fi
done

B="${SUPABASE_URL%/}"
K="$SUPABASE_ANON_KEY"
passaram=0
falharam=0

checar() {
  if [ "$2" = "$3" ]; then
    echo "ok      $1"
    passaram=$((passaram + 1))
  else
    echo "FALHOU  $1"
    echo "        esperado: $3"
    echo "        veio:     $2"
    falharam=$((falharam + 1))
  fi
}

# Devolve o token, ou imprime o motivo exato da recusa e devolve vazio.
# Diagnosticar por conta importa: "não consegui entrar com as duas" esconde
# qual das duas está errada, que é a única informação útil.
entrar() {
  local resposta
  resposta=$(curl -s --max-time 20 -X POST -H "apikey: $K" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" \
    "$B/auth/v1/token?grant_type=password")

  local token
  token=$(echo "$resposta" | python3 -c "import sys,json;print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)

  if [ -z "$token" ]; then
    local motivo
    motivo=$(echo "$resposta" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(d.get('error_code') or d.get('msg') or d.get('error_description') or 'resposta inesperada')
" 2>/dev/null || echo 'resposta ilegível')
    echo "  $1: $motivo" >&2
  fi
  echo "$token"
}

req() { # req <token> <método> <caminho> [corpo]
  if [ -n "${4:-}" ]; then
    curl -s --max-time 20 -X "$2" -H "apikey: $K" -H "Authorization: Bearer $1" \
      -H "Content-Type: application/json" -H "Prefer: return=representation" -d "$4" "$B/rest/v1/$3"
  else
    curl -s --max-time 20 -X "$2" -H "apikey: $K" -H "Authorization: Bearer $1" "$B/rest/v1/$3"
  fi
}

campo() { python3 -c "
import sys, json
d = json.load(sys.stdin)
if isinstance(d, list):
    print(d[0].get('$1', '') if d else '')
else:
    print(d.get('$1', ''))
"; }
contar() { python3 -c "import sys,json;d=json.load(sys.stdin);print(len(d) if isinstance(d,list) else -1)"; }
claim() { cut -d. -f2 | python3 -c "
import sys, base64, json
s = sys.stdin.read().strip(); s += '=' * (-len(s) % 4)
print(json.loads(base64.urlsafe_b64decode(s)).get('$1', ''))
"; }
uuid() { python3 -c "import uuid;print(uuid.uuid4())"; }

echo "abrindo sessões"
TA=$(entrar "$EMAIL_A" "$SENHA_A")
TB=$(entrar "$EMAIL_B" "$SENHA_B")

if [ -z "$TA" ] || [ -z "$TB" ]; then
  echo ""
  echo "Não consegui abrir as duas sessões:"
  [ -z "$TA" ] && echo "  EMAIL_A ($EMAIL_A) falhou" || echo "  EMAIL_A ($EMAIL_A) ok"
  [ -z "$TB" ] && echo "  EMAIL_B ($EMAIL_B) falhou" || echo "  EMAIL_B ($EMAIL_B) ok"
  echo ""
  echo "invalid_credentials  = e-mail ou senha errados, ou a conta não existe"
  echo "email_not_confirmed  = crie a conta com 'Auto Confirm User' marcado"
  echo "                       ou confirme em Authentication > Users > ... > Confirm"
  echo ""
  echo "Contas em: $B → painel → Authentication → Users"
  exit 1
fi
echo "duas sessões abertas"
echo ""

# --- perfil espelhado -------------------------------------------------------
nome=$(req "$TA" GET "profiles?select=display_name" | campo display_name)
checar "auth.users é espelhado em profiles" "$([ -n "$nome" ] && echo sim)" "sim"

# --- família e isolamento ---------------------------------------------------
fam=$(curl -s --max-time 20 -X POST -H "apikey: $K" -H "Authorization: Bearer $TA" \
  -H "Content-Type: application/json" -d '{"p_name":"Verificação"}' \
  "$B/rest/v1/rpc/create_family" | campo id)
checar "create_family cria a família e a própria participação" "$([ -n "$fam" ] && echo sim)" "sim"
[ -z "$fam" ] && { echo "sem família, interrompendo"; exit 1; }

antes=$(req "$TB" GET "families?select=id" | contar)
checar "quem não participa não enxerga a família" "$antes" "0"

r=$(req "$TB" POST "family_members" "{\"family_id\":\"$fam\",\"user_id\":\"$(echo "$TB" | claim sub)\",\"role\":\"owner\"}" | campo code)
checar "ninguém se insere numa família por conta própria" "$r" "42501"

# --- criança ----------------------------------------------------------------
kid=$(req "$TA" POST "children" "{\"family_id\":\"$fam\",\"name\":\"Ana\",\"avatar_key\":\"gato\"}" | campo id)
checar "responsável cadastra criança" "$([ -n "$kid" ] && echo sim)" "sim"

r=$(req "$TB" POST "children" "{\"family_id\":\"$fam\",\"name\":\"Invasor\",\"avatar_key\":\"urso\"}" | campo code)
checar "estranho não cadastra criança em família alheia" "$r" "42501"

# --- lançamento: o servidor decide autoria e moeda --------------------------
tx=$(uuid)
res=$(req "$TA" POST "transactions" \
  "{\"id\":\"$tx\",\"child_id\":\"$kid\",\"amount_cents\":2000,\"reason\":\"Mesada\",\"created_by_name\":\"NOME FALSO\",\"currency\":\"JPY\"}")
checar "created_by_name vem do perfil, não do cliente" "$(echo "$res" | campo created_by_name)" "$nome"
checar "moeda vem da família, não do cliente" "$(echo "$res" | campo currency)" "BRL"

# --- razão imutável ---------------------------------------------------------
r=$(req "$TA" PATCH "transactions?id=eq.$tx" '{"amount_cents":999999}' | campo code)
checar "sessão de usuário não edita o razão" "$r" "42501"
r=$(req "$TA" DELETE "transactions?id=eq.$tx" | campo code)
checar "sessão de usuário não apaga o razão" "$r" "42501"

s=$(req "$TA" GET "child_balances?child_id=eq.$kid&select=balance_cents" | campo balance_cents)
checar "saldo é a soma do razão" "$s" "2000"

# --- meta -------------------------------------------------------------------
meta=$(req "$TA" POST "goals" "{\"child_id\":\"$kid\",\"title\":\"Bicicleta\",\"target_cents\":3000}" | campo id)
checar "meta nasce ativa abaixo do alvo" \
  "$(req "$TA" GET "goals?id=eq.$meta&select=status" | campo status)" "active"

r=$(req "$TA" POST "goals" "{\"child_id\":\"$kid\",\"title\":\"Outra\",\"target_cents\":100}" | campo code)
checar "só uma meta ativa por criança" "$r" "23505"

tx2=$(uuid)
req "$TA" POST "transactions" \
  "{\"id\":\"$tx2\",\"child_id\":\"$kid\",\"amount_cents\":1000,\"reason\":\"Mesada\",\"created_by_name\":\"x\"}" > /dev/null
checar "trigger marca a meta como alcançada ao cruzar o alvo" \
  "$(req "$TA" GET "goals?id=eq.$meta&select=status" | campo status)" "reached"
checar "e registra qual transação a alcançou" \
  "$(req "$TA" GET "goals?id=eq.$meta&select=reached_by_transaction_id" | campo reached_by_transaction_id)" "$tx2"

r=$(req "$TA" PATCH "goals?id=eq.$meta" '{"target_cents":1}' | campo message)
checar "meta alcançada não é reescrita à mão" "${r:0:24}" "meta $meta" 2>/dev/null || true

# --- estorno ----------------------------------------------------------------
r=$(req "$TA" POST "transactions" \
  "{\"id\":\"$(uuid)\",\"child_id\":\"$kid\",\"amount_cents\":-500,\"reason\":\"Torto\",\"reverses_id\":\"$tx2\",\"created_by_name\":\"x\"}" | campo message)
checar "estorno com valor diferente do oposto é recusado" "${r:0:38}" "estorno deve ter valor oposto exato: e"

req "$TA" POST "transactions" \
  "{\"id\":\"$(uuid)\",\"child_id\":\"$kid\",\"amount_cents\":-1000,\"reason\":\"Estorno\",\"reverses_id\":\"$tx2\",\"created_by_name\":\"x\"}" > /dev/null
checar "estorno da transação que alcançou reabre a meta" \
  "$(req "$TA" GET "goals?id=eq.$meta&select=status" | campo status)" "active"

# --- credenciais ------------------------------------------------------------
r=$(req "$TA" GET "invites?select=token_hash" | campo code)
checar "token_hash é ilegível por sessão de usuário" "$r" "42501"

# --- hook do JWT ------------------------------------------------------------
# A conta B vira a criança, por convite emitido por A.
sub_a=$(echo "$TA" | claim sub)
req "$TA" POST "invites" \
  "{\"family_id\":\"$fam\",\"kind\":\"child\",\"child_id\":\"$kid\",\"token_hash\":\"\\\\xabcdef01\",\"expires_at\":\"2035-01-01T00:00:00Z\",\"created_by\":\"$sub_a\"}" > /dev/null
curl -s --max-time 20 -X POST -H "apikey: $K" -H "Authorization: Bearer $TB" \
  -H "Content-Type: application/json" \
  -d '{"p_token_hash":"\\xabcdef01","p_provider":"email"}' \
  "$B/rest/v1/rpc/accept_child_invite" > /dev/null

# A claim só entra num token novo: o hook roda na emissão.
TB2=$(entrar "$EMAIL_B" "$SENHA_B")
checar "hook injeta child_id no JWT de quem virou criança" "$(echo "$TB2" | claim child_id)" "$kid"
checar "e o escopo é somente leitura" "$(echo "$TB2" | claim child_scope)" "read"
checar "criança enxerga exatamente um perfil: o dela" "$(req "$TB2" GET "children?select=id" | contar)" "1"
r=$(req "$TB2" POST "transactions" \
  "{\"id\":\"$(uuid)\",\"child_id\":\"$kid\",\"amount_cents\":100000,\"reason\":\"me dei mesada\",\"created_by_name\":\"x\"}" | campo code)
checar "criança não lança nada" "$r" "42501"

echo ""
echo "================================================"
if [ "$falharam" -eq 0 ]; then
  echo " $passaram verificações passaram no projeto real"
else
  echo " $passaram passaram, $falharam FALHARAM"
fi
echo "================================================"
[ "$falharam" -eq 0 ]
