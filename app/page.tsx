import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { clienteServidor } from '@/lib/supabase/server'
import { Cofrinho } from '@/components/Cofrinho'
import { FormularioFamilia } from './FormularioFamilia'
import { SeletorIdioma } from './SeletorIdioma'
import { Sair } from './Sair'
import { ConviteInstalacao } from '@/components/ConviteInstalacao'
import { ExcluirConta } from './ExcluirConta'

/** Lê `child_id` do JWT só para decidir a navegação; quem autoriza é a RLS. */
function lerChildId(token: string): string | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    return (
      (JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { child_id?: string })
        .child_id ?? null
    )
  } catch {
    return null
  }
}

export default async function Familias() {
  const supabase = await clienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/entrar')

  // Sessão de criança não pertence a esta tela: sem isto ela via "nenhuma
  // família ainda" e o formulário de criar uma.
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (session && lerChildId(session.access_token)) redirect('/c/saldo')

  const t = await getTranslations('familias')
  const tPrivacidade = await getTranslations('privacidade')

  // A RLS já limita o resultado às famílias das quais este responsável
  // participa; não há filtro por family_id no código, de propósito.
  const { data: participacoes } = await supabase
    .from('family_members')
    .select('role, families(id, name), family_id')
    .order('joined_at', { ascending: true })

  const familias = participacoes ?? []

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-5 py-8">
      <header className="flex items-center justify-between gap-3">
        <h1 className="font-titulo text-3xl font-bold text-marca-escuro">{t('titulo')}</h1>
        <div className="flex items-center gap-2">
          <SeletorIdioma />
          <Sair />
        </div>
      </header>

      {familias.length === 0 ? (
        <section className="flex flex-col items-center gap-3 rounded-3xl bg-white p-8 text-center shadow-sm">
          <Cofrinho estado="vazio" rotulo={t('vazioTitulo')} className="h-20 w-20" />
          <h2 className="font-titulo text-xl font-bold">{t('vazioTitulo')}</h2>
          <p className="text-slate-600">{t('vazioTexto')}</p>
        </section>
      ) : (
        <ul className="flex flex-col gap-3">
          {familias.map((participacao) => {
            const familia = participacao.families as unknown as { id: string; name: string } | null
            if (!familia) return null
            return (
              <li key={familia.id}>
                <a
                  href={`/familias/${familia.id}`}
                  className="botao flex items-center gap-4 rounded-3xl bg-white p-4 shadow-sm"
                >
                  <Cofrinho estado="pouco" className="h-12 w-12 shrink-0" />
                  <span className="flex flex-col">
                    <span className="font-titulo text-lg font-bold">{familia.name}</span>
                    <span className="text-sm text-slate-500">
                      {participacao.role === 'owner' ? t('papelOwner') : t('papelParent')}
                    </span>
                  </span>
                </a>
              </li>
            )
          })}
        </ul>
      )}

      <FormularioFamilia />

      <ConviteInstalacao />

      <footer className="flex flex-col gap-3 pt-4">
        <a href="/privacidade" className="botao text-center text-base font-semibold text-marca-escuro underline">
          {tPrivacidade('link')}
        </a>
        <ExcluirConta />
      </footer>
    </main>
  )
}
