'use client'

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import { excluirConta, type ResultadoExclusao } from './acoes'

export function ExcluirConta() {
  const t = useTranslations('conta')
  const tComum = useTranslations('comum')
  const [confirmando, setConfirmando] = useState(false)
  const [resultado, enviar, pendente] = useActionState<ResultadoExclusao | null, FormData>(
    async () => excluirConta(),
    null,
  )

  if (!confirmando) {
    return (
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        className="rounded-2xl border-2 border-slate-200 px-5 py-3 text-base font-bold text-saida"
      >
        {t('excluir')}
      </button>
    )
  }

  return (
    <section className="flex flex-col gap-3 rounded-3xl bg-white p-5 shadow-sm">
      {/* Confirmação explícita: é irreversível e leva junto o histórico das
          famílias onde a pessoa está sozinha. */}
      <h2 className="font-titulo text-lg font-bold text-saida">{t('confirmarTitulo')}</h2>
      <p className="text-base text-slate-700">{t('confirmarTexto')}</p>

      {resultado && (
        <p role="alert" className="text-base font-semibold text-saida">
          {resultado.erro === 'temFamilia' ? t('temFamilia') : tComum('erroInesperado')}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setConfirmando(false)}
          className="flex-1 rounded-2xl border-2 border-slate-200 px-4 py-3 text-base font-bold text-slate-700"
        >
          {t('manter')}
        </button>
        <form action={enviar} className="flex-1">
          <button
            type="submit"
            disabled={pendente}
            className="w-full rounded-2xl bg-saida px-4 py-3 text-base font-bold text-white disabled:opacity-60"
          >
            {pendente ? t('excluindo') : t('confirmar')}
          </button>
        </form>
      </div>
    </section>
  )
}
