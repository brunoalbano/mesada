'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { criarFamilia, type ResultadoAcao } from './acoes'

const INICIAL: ResultadoAcao = { ok: true }

export function FormularioFamilia() {
  const t = useTranslations('familias')
  const tComum = useTranslations('comum')
  const [resultado, enviar, pendente] = useActionState(criarFamilia, INICIAL)

  const erro = !resultado.ok
    ? resultado.erro === 'invalido'
      ? t('nomeInvalido')
      : tComum('erroInesperado')
    : null

  return (
    <form action={enviar} className="flex flex-col gap-3 rounded-3xl bg-white p-5 shadow-sm">
      <h2 className="font-titulo text-lg font-bold">{t('criarTitulo')}</h2>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-slate-700">{t('nome')}</span>
        <input
          name="nome"
          required
          maxLength={60}
          placeholder={t('nomePlaceholder')}
          aria-invalid={erro !== null}
          aria-describedby={erro ? 'erro-familia' : undefined}
          className="min-h-12 rounded-2xl border-2 border-slate-200 px-4 text-base outline-none focus:border-marca"
        />
      </label>

      {erro && (
        <p id="erro-familia" role="alert" className="text-sm font-semibold text-saida">
          {erro}
        </p>
      )}

      <button
        type="submit"
        disabled={pendente}
        className="rounded-2xl bg-marca px-5 text-base font-bold text-white disabled:opacity-60"
      >
        {pendente ? t('criando') : t('criar')}
      </button>
    </form>
  )
}
