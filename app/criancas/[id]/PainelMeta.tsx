'use client'

import { useActionState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { formatarCentavos } from '@/lib/money'
import { cancelarMeta, criarMeta, type ResultadoMeta } from './acoes'

const INICIAL: ResultadoMeta = { ok: true }

type Meta = {
  id: string
  title: string
  emoji: string
  target_cents: number
  status: string
  reached_at: string | null
}

export function PainelMeta({
  childId,
  meta,
  saldoCentavos,
  moeda,
  podeEditar,
}: {
  childId: string
  meta: Meta | null
  saldoCentavos: number
  moeda: string
  podeEditar: boolean
}) {
  const t = useTranslations('crianca')
  const tComum = useTranslations('comum')
  const idioma = useLocale()
  const [resultado, enviar, pendente] = useActionState(criarMeta, INICIAL)

  if (meta) {
    const progresso = Math.min(saldoCentavos / meta.target_cents, 1)
    const falta = Math.max(meta.target_cents - saldoCentavos, 0)

    return (
      <section className="flex flex-col gap-3 rounded-3xl bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <span aria-hidden className="text-2xl">
            {meta.emoji}
          </span>
          <h2 className="flex-1 font-titulo text-lg font-bold">{meta.title}</h2>
          <span className="text-sm font-semibold text-slate-500">
            {formatarCentavos(meta.target_cents, idioma, moeda)}
          </span>
        </div>

        <div
          role="progressbar"
          aria-valuenow={Math.round(progresso * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={meta.title}
          className="h-4 overflow-hidden rounded-full bg-slate-100"
        >
          <div className="h-full rounded-full bg-moeda" style={{ width: `${progresso * 100}%` }} />
        </div>

        {/* O texto repete o que a barra mostra: nenhuma informação existe só
            na cor ou só no comprimento. */}
        <p className="text-sm font-semibold text-slate-600">
          {falta === 0
            ? t('metaAlcancada')
            : t('metaFalta', { valor: formatarCentavos(falta, idioma, moeda) })}
        </p>

        {podeEditar && (
          <form action={cancelarMeta}>
            <input type="hidden" name="id" value={meta.id} />
            <input type="hidden" name="childId" value={childId} />
            <button type="submit" className="text-xs font-bold text-slate-400 underline">
              {t('cancelarMeta')}
            </button>
          </form>
        )}
      </section>
    )
  }

  if (!podeEditar) {
    return (
      <p className="rounded-3xl bg-white p-5 text-center text-sm text-slate-500">{t('semMeta')}</p>
    )
  }

  const erro = !resultado.ok
    ? resultado.erro === 'jaExiste'
      ? t('metaJaExiste')
      : tComum('erroInesperado')
    : null

  return (
    <form action={enviar} className="flex flex-col gap-3 rounded-3xl bg-white p-5 shadow-sm">
      <h2 className="font-titulo text-lg font-bold">{t('criarMeta')}</h2>
      <input type="hidden" name="childId" value={childId} />

      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-slate-700">{t('metaTitulo')}</span>
        <input
          name="titulo"
          required
          maxLength={60}
          className="min-h-12 rounded-2xl border-2 border-slate-200 px-4 text-base outline-none focus:border-marca"
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-slate-700">{t('metaAlvo')}</span>
        <input
          name="alvo"
          required
          inputMode="decimal"
          placeholder="0,00"
          className="min-h-12 rounded-2xl border-2 border-slate-200 px-4 text-base outline-none focus:border-marca"
        />
      </label>

      {erro && (
        <p role="alert" className="text-sm font-semibold text-saida">
          {erro}
        </p>
      )}

      <button
        type="submit"
        disabled={pendente}
        className="rounded-2xl bg-marca px-5 py-3 text-base font-bold text-white disabled:opacity-60"
      >
        {t('criarMeta')}
      </button>
    </form>
  )
}
