import { redirect } from 'next/navigation'
import { clienteServidor } from '@/lib/supabase/server'

/**
 * Porta de entrada da criança.
 *
 * A claim `child_id` no JWT diz de quem é a sessão, então esta rota só
 * redireciona para a página daquela criança. É o `start_url` do atalho
 * instalado e o destino do convite aceito.
 *
 * Um responsável que caia aqui vai para a lista de famílias: a claim não
 * existe na sessão dele.
 */
export default async function SaldoDaCrianca() {
  const supabase = await clienteServidor()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) redirect('/entrar')

  // A claim é emitida pelo hook do Supabase Auth, e não escrita por nós.
  const childId = (session.user.app_metadata as { child_id?: string })?.child_id
  const doToken = lerClaim(session.access_token)

  const destino = childId ?? doToken
  redirect(destino ? `/criancas/${destino}` : '/')
}

/**
 * Lê `child_id` do payload do JWT.
 *
 * Não é verificação de assinatura, e não precisa ser: quem valida é o
 * Postgres, na RLS. Aqui só decidimos para onde navegar; um valor forjado
 * levaria a uma página que a RLS devolve vazia.
 */
function lerClaim(token: string): string | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const json = Buffer.from(payload, 'base64url').toString('utf8')
    const claim = (JSON.parse(json) as { child_id?: string }).child_id
    return claim ?? null
  } catch {
    return null
  }
}
