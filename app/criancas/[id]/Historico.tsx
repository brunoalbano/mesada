'use client'

import { useActionState } from 'react'
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

function BotaoEstornar({ id }: { id: string }) {
  const t = useTranslations('crianca')
  const tComum = useTranslations('comum')
  const [resultado, enviar, pendente] = useActionState<
    { ok: true } | { ok: false; erro: 'falhou' } | null,
    FormData
  >(async (_anterior, dados) => estornar(dados), null)

  return (
    <form action={enviar} className="flex flex-col items-end">
      <input type="hidden" name="id" value={id} />
      {/* Nome acessível de verdade, não só `title`: leitor de tela não lê
          `title` de forma confiável, e "↩︎" sozinho não diz nada. */}
      <button
        type="submit"
        disabled={pendente}
        aria-label={t('estornar')}
        className="h-12 w-12 rounded-2xl text-lg text-slate-500 disabled:opacity-50"
      >
        ↩︎
      </button>
      {resultado && !resultado.ok && (
        <span role="alert" className="text-xs font-semibold text-saida">
          {tComum('erroInesperado')}
        </span>
      )}
    </form>
  )
}

export function Historico({
  childId,
  lancamentos,
  moeda,
  podeEstornar,
  pequeno,
}: {
  childId: string
  lancamentos: Lancamento[]
  moeda: string
  podeEstornar: boolean
  pequeno: boolean
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
                <span aria-hidden className={pequeno ? 'text-4xl' : 'text-2xl'}>
                  {lancamento.emoji ?? (entrada ? '💰' : '🧾')}
                </span>

                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={`truncate font-semibold ${foiEstornada ? 'line-through' : ''}`}>
                    {lancamento.reason}
                  </span>
                  {/* No Modo Pequeno some data e autor: para quem tem 5 anos,
                      "quem lançou" é ruído, e o que importa é o ícone e o
                      valor. No Modo Grande a autoria é essencial, porque dois
                      responsáveis usam o mesmo aplicativo. */}
                  <span className="text-xs text-slate-500">
                    {pequeno
                      ? foiEstornada
                        ? t('estornado')
                        : ''
                      : [
                          formatar.dateTime(new Date(lancamento.created_at), {
                            day: 'numeric',
                            month: 'short',
                          }),
                          t('por', { nome: lancamento.created_by_name }),
                          foiEstornada ? t('estornado') : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
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
                  <BotaoEstornar id={lancamento.id} />
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
