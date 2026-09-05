import { cookies } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { clienteServidor } from '@/lib/supabase/server'
import { Cofrinho } from '@/components/Cofrinho'
import { EntrarParaAceitar } from './EntrarParaAceitar'
import { BotaoAceitar } from './BotaoAceitar'

const COOKIE = 'convite'

export default async function Convite({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>
}) {
  const t = await getTranslations('convite')
  const { erro } = await searchParams
  const guardado = (await cookies()).get(COOKIE)?.value
  const tipo = guardado?.split(':')[0]

  if (erro || !guardado || (tipo !== 'pai' && tipo !== 'filho')) {
    return <Aviso titulo={t('invalidoTitulo')} texto={t('invalidoTexto')} rotuloInicio={t('inicio')} />
  }

  const supabase = await clienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Sem sessão, o convite espera no cookie. O token não entra na URL de login:
  // ele já saiu do endereço e não volta.
  if (!user) return <EntrarParaAceitar />

  // Aceitar é um toque, não um efeito de abrir a página. O convite é de uso
  // único, e prefetch ou scanner de e-mail o gastariam antes da pessoa.
  return <BotaoAceitar tipo={tipo} />
}

function Aviso({
  titulo,
  texto,
  rotuloInicio,
}: {
  titulo: string
  texto: string
  rotuloInicio: string
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <Cofrinho estado="vazio" rotulo="" className="h-20 w-20" />
      <h1 className="font-titulo text-2xl font-bold text-marca-escuro">{titulo}</h1>
      <p className="text-base text-slate-600">{texto}</p>
      <a href="/" className="botao rounded-2xl bg-marca px-6 py-3 text-base font-bold text-white">
        {rotuloInicio}
      </a>
    </main>
  )
}
