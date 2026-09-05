'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { Cofrinho } from '@/components/Cofrinho'
import { BarraTopo } from '@/components/BarraTopo'
import { aceitarConvite, type ResultadoConvite } from './acoes'

const INICIAL = null as ResultadoConvite | null

export function BotaoAceitar({ tipo }: { tipo: 'pai' | 'filho' }) {
  const t = useTranslations('convite')
  const [resultado, enviar, pendente] = useActionState<ResultadoConvite | null>(
    async () => aceitarConvite(),
    INICIAL,
  )

  if (resultado && !resultado.ok && resultado.erro === 'recusado') {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <Cofrinho estado="vazio" className="h-20 w-20" />
        <h1 className="font-titulo text-2xl font-bold text-marca-escuro">{t('recusadoTitulo')}</h1>
        <p className="text-base text-slate-600">{t('recusadoTexto')}</p>
        <a href="/" className="botao rounded-2xl bg-marca px-6 py-3 text-base font-bold text-white">
          {t('inicio')}
        </a>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-5 px-6 text-center">
      <BarraTopo />
      <Cofrinho estado="cheio" className="h-20 w-20" />
      <h1 className="font-titulo text-2xl font-bold text-marca-escuro">
        {tipo === 'pai' ? t('aceitarTituloPai') : t('aceitarTituloFilho')}
      </h1>
      <p className="text-base text-slate-600">{t('aceitarTexto')}</p>

      <form action={enviar} className="w-full">
        <button
          type="submit"
          disabled={pendente}
          className="w-full rounded-2xl bg-marca px-5 py-3 text-base font-bold text-white disabled:opacity-60"
        >
          {pendente ? t('aceitando') : t('aceitar')}
        </button>
      </form>
    </main>
  )
}
