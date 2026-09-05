'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Cofrinho } from '@/components/Cofrinho'

/**
 * Última linha de defesa da interface.
 *
 * O caso que mais importa aqui é o banco pausado: o plano gratuito do Supabase
 * dorme após 7 dias sem requisição. Uma tela de erro crua nesse momento parece
 * dado perdido, o que é exatamente a leitura errada.
 */
export default function Erro({ error, reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('erro')

  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <Cofrinho estado="vazio" className="h-24 w-24 opacity-60" />
      <h1 className="font-titulo text-2xl font-bold text-marca-escuro">{t('titulo')}</h1>
      <p className="text-slate-600">{t('texto')}</p>
      <button
        type="button"
        onClick={reset}
        className="rounded-2xl bg-marca px-6 py-3 font-bold text-white"
      >
        {t('tentarDeNovo')}
      </button>
    </main>
  )
}
