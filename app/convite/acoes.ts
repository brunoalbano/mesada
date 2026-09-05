'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { clienteServidor } from '@/lib/supabase/server'
import { hashParaBanco } from '@/lib/tokens'

const COOKIE = 'convite'

export type ResultadoConvite = { ok: false; erro: 'invalido' | 'semSessao' | 'recusado' }

/**
 * Aceita o convite guardado no cookie.
 *
 * Server Action, e não render de página, por duas razões.
 *
 * A primeira é que só Server Action e Route Handler podem apagar cookie. A
 * versão anterior chamava `cookies().delete()` durante a renderização, o que
 * lança — e lançava DEPOIS do RPC ter consumido o convite. Resultado: todo
 * convite clicado queimava e o usuário via tela de erro, sem nunca entrar na
 * família.
 *
 * A segunda é mais importante: consumir um token de uso único num GET é
 * frágil por natureza. Scanner de e-mail corporativo, prefetch de navegador e
 * qualquer robô que siga o link gastam o convite antes da pessoa. Agora exige
 * um toque deliberado.
 */
export async function aceitarConvite(): Promise<ResultadoConvite> {
  const armazem = await cookies()
  const guardado = armazem.get(COOKIE)?.value
  if (!guardado) return { ok: false, erro: 'invalido' }

  const [tipo, token] = guardado.split(':')
  if ((tipo !== 'pai' && tipo !== 'filho') || !token) {
    armazem.delete(COOKIE)
    return { ok: false, erro: 'invalido' }
  }

  const supabase = await clienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, erro: 'semSessao' }

  const { error } =
    tipo === 'pai'
      ? await supabase.rpc('accept_parent_invite', { p_token_hash: hashParaBanco(token) })
      : await supabase.rpc('accept_child_invite', {
          p_token_hash: hashParaBanco(token),
          p_provider: user.app_metadata.provider === 'google' ? 'google' : 'email',
        })

  // O cookie sai nos dois casos: aceito, ele não serve mais; recusado, ele só
  // faria a pessoa tentar de novo o mesmo convite morto.
  armazem.delete(COOKIE)

  if (error) return { ok: false, erro: 'recusado' }

  redirect(tipo === 'pai' ? '/' : '/c/saldo')
}
