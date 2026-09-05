import { getTranslations } from 'next-intl/server'
import { BarraTopo } from '@/components/BarraTopo'
import { Cofrinho } from '@/components/Cofrinho'

/**
 * Página de privacidade.
 *
 * Obrigatória, não decorativa: o produto guarda dado de criança, e a LGPD
 * exige dizer o que é guardado, por quê, e como apagar. O texto é curto de
 * propósito — política que ninguém lê não informa ninguém.
 */
export default async function Privacidade() {
  const t = await getTranslations('privacidade')

  const secoes = ['guardamos', 'naoGuardamos', 'quemVe', 'quantoTempo', 'apagar', 'terceiros'] as const

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-5 py-8">
      <BarraTopo />

      <header className="flex items-center gap-3">
        <Cofrinho estado="pouco" className="h-12 w-12 shrink-0" />
        <h1 className="font-titulo text-2xl font-bold text-marca-escuro">{t('titulo')}</h1>
      </header>

      <p className="text-base text-slate-700">{t('resumo')}</p>

      {secoes.map((secao) => (
        <section key={secao} className="flex flex-col gap-2 rounded-3xl bg-white p-5 shadow-sm">
          <h2 className="font-titulo text-lg font-bold">{t(`${secao}.titulo`)}</h2>
          <p className="text-base text-slate-700">{t(`${secao}.texto`)}</p>
        </section>
      ))}

      <a href="/" className="botao rounded-2xl bg-marca px-6 py-3 text-center text-base font-bold text-white">
        {t('voltar')}
      </a>
    </main>
  )
}
