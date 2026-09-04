import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { clienteServidor } from '@/lib/supabase/server'
import { hashParaBanco } from '@/lib/tokens'
import { Cofrinho } from '@/components/Cofrinho'
import { EntrarParaAceitar } from './EntrarParaAceitar'

const COOKIE = 'convite'

export default async function Convite({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>
}) {
  const t = await getTranslations('convite')
  const { erro } = await searchParams
  const armazem = await cookies()
  const guardado = armazem.get(COOKIE)?.value

  if (erro || !guardado) return <Aviso titulo={t('invalidoTitulo')} texto={t('invalidoTexto')} />

  const [tipo, token] = guardado.split(':')
  if ((tipo !== 'pai' && tipo !== 'filho') || !token) {
    return <Aviso titulo={t('invalidoTitulo')} texto={t('invalidoTexto')} />
  }

  const supabase = await clienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Sem sessão, o convite espera no cookie. O token não entra no `next` do
  // login: ele já saiu da URL e não volta.
  if (!user) return <EntrarParaAceitar />

  const { error } =
    tipo === 'pai'
      ? await supabase.rpc('accept_parent_invite', { p_token_hash: hashParaBanco(token) })
      : await supabase.rpc('accept_child_invite', {
          p_token_hash: hashParaBanco(token),
          p_provider: user.app_metadata.provider === 'google' ? 'google' : 'email',
        })

  armazem.delete(COOKIE)

  if (error) return <Aviso titulo={t('recusadoTitulo')} texto={t('recusadoTexto')} />

  redirect(tipo === 'pai' ? '/' : '/c/saldo')
}

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <Cofrinho estado="vazio" rotulo="" className="h-20 w-20" />
      <h1 className="font-titulo text-2xl font-bold text-marca-escuro">{titulo}</h1>
      <p className="text-slate-600">{texto}</p>
      <a href="/" className="botao rounded-2xl bg-marca px-6 py-3 font-bold text-white">
        Início
      </a>
    </main>
  )
}
