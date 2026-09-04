'use client'

import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { formatarCentavos } from '@/lib/money'
import { estornar } from './acoes'

type Lancamento = {
  id: string
  amount_cents: number
  reason: string
  emoji: string | null
  created_at: string
  created_by_name: string
  reverses_id: string | null
}

export function Historico({
  childId,
  lancamentos,
  moeda,
  podeEstornar,
}: {
  childId: string
  lancamentos: Lancamento[]
  moeda: string
  podeEstornar: boolean
}) {
  const t = useTranslations('crianca')
  const idioma = useLocale()
  const formatar = useFormatter()

  // Uma linha é estorno quando aponta para outra; e é estornada quando outra
  // aponta para ela. Nenhuma coluna guarda isso: o `unique` em reverses_id
  // torna a relação barata de derivar.
  const estornadas = new Set(lancamentos.map((l) => l.reverses_id).filter(Boolean) as string[])

  return (
    <section className="flex flex-col gap-3 rounded-3xl bg-white p-5 shadow-sm">
      <h2 className="font-titulo text-lg font-bold">{t('historico')}</h2>

      {lancamentos.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500">{t('semLancamentos')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-slate-100">
          {lancamentos.map((lancamento) => {
            const entrada = lancamento.amount_cents > 0
            const foiEstornada = estornadas.has(lancamento.id)
            return (
              <li key={lancamento.id} className="flex items-center gap-3 py-3">
                <span aria-hidden className="text-2xl">
                  {lancamento.emoji ?? (entrada ? '💰' : '🧾')}
                </span>

                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={`truncate font-semibold ${foiEstornada ? 'line-through' : ''}`}>
                    {lancamento.reason}
                  </span>
                  <span className="text-xs text-slate-500">
                    {formatar.dateTime(new Date(lancamento.created_at), {
                      day: 'numeric',
                      month: 'short',
                    })}
                    {' · '}
                    {t('por', { nome: lancamento.created_by_name })}
                    {foiEstornada && ` · ${t('estornado')}`}
                  </span>
                </span>

                <span
                  className={`shrink-0 font-titulo font-bold ${
                    entrada ? 'text-entrada' : 'text-saida'
                  }`}
                >
                  {/* Sinal explícito, além da cor: daltonismo é comum, e a
                      criança pequena ainda não lê o valor isolado. */}
                  {entrada ? '+' : '−'}
                  {formatarCentavos(Math.abs(lancamento.amount_cents), idioma, moeda)}
                </span>

                {podeEstornar && !foiEstornada && !lancamento.reverses_id && (
                  <form action={estornar}>
                    <input type="hidden" name="id" value={lancamento.id} />
                    <input type="hidden" name="childId" value={childId} />
                    <button
                      type="submit"
                      title={t('estornar')}
                      className="h-12 w-12 rounded-2xl text-lg text-slate-400"
                    >
                      ↩︎
                    </button>
                  </form>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
