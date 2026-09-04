'use client'

import { useActionState, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { MoedaCaindo } from '@/components/MoedaCaindo'
import { lancar, type ResultadoLancamento } from './acoes'

const INICIAL: ResultadoLancamento = { ok: true }
const MOTIVOS = ['💰', '🎁', '🍦', '🧸', '📚', '🃏'] as const

export function FormularioLancamento({
  childId,
  arquivada,
  pequeno,
}: {
  childId: string
  arquivada: boolean
  pequeno: boolean
}) {
  const t = useTranslations('crianca')
  const tComum = useTranslations('comum')
  const [resultado, enviar, pendente] = useActionState(lancar, INICIAL)
  const [emoji, setEmoji] = useState<string>('💰')
  const [moedas, setMoedas] = useState(0)

  // Dispara a moeda quando um lançamento entra de fato. Amarrado ao resultado
  // da ação, e não ao clique: animar antes de saber se deu certo mente para a
  // criança.
  useEffect(() => {
    if (resultado.ok && !pendente) setMoedas((n) => n + 1)
  }, [resultado, pendente])

  if (arquivada) {
    return (
      <p className="rounded-3xl bg-white p-5 text-center text-sm font-semibold text-slate-500">
        {t('arquivada')}
      </p>
    )
  }

  const erro = !resultado.ok
    ? resultado.erro === 'valor'
      ? t('valorInvalido')
      : resultado.erro === 'motivo'
        ? t('motivoInvalido')
        : resultado.erro === 'arquivada'
          ? t('arquivada')
          : tComum('erroInesperado')
    : null

  return (
    <form
      action={enviar}
      className="relative flex flex-col gap-3 rounded-3xl bg-white p-5 shadow-sm"
    >
      <MoedaCaindo chave={moedas} discreta={!pequeno} />
      <input type="hidden" name="childId" value={childId} />
      <input type="hidden" name="emoji" value={emoji} />

      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-slate-700">{t('valor')}</span>
        <input
          name="valor"
          required
          // Teclado numérico no celular, mas campo de texto: `type=number`
          // recusa vírgula em parte dos navegadores, e vírgula é o separador
          // decimal em dois dos três idiomas.
          inputMode="decimal"
          placeholder="0,00"
          className="min-h-14 rounded-2xl border-2 border-slate-200 px-4 text-2xl font-bold outline-none focus:border-marca"
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-slate-700">{t('motivo')}</span>
        <input
          name="motivo"
          required
          maxLength={200}
          placeholder={t('motivoPlaceholder')}
          className="min-h-12 rounded-2xl border-2 border-slate-200 px-4 text-base outline-none focus:border-marca"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        {MOTIVOS.map((opcao) => (
          <button
            key={opcao}
            type="button"
            aria-pressed={emoji === opcao}
            onClick={() => setEmoji(opcao)}
            className={`h-12 w-12 rounded-2xl text-2xl ${
              emoji === opcao ? 'bg-marca-claro ring-2 ring-marca' : 'bg-slate-100'
            }`}
          >
            {opcao}
          </button>
        ))}
      </div>

      {erro && (
        <p role="alert" className="text-sm font-semibold text-saida">
          {erro}
        </p>
      )}

      <div className="flex gap-3">
        {/* Entrada e saída nunca se distinguem só pela cor: cada botão traz
            sinal, ícone e palavra. */}
        <button
          type="submit"
          name="tipo"
          value="credito"
          disabled={pendente}
          className="flex-1 rounded-2xl bg-entrada px-4 py-3 text-base font-bold text-white disabled:opacity-60"
        >
          + {t('adicionar')}
        </button>
        <button
          type="submit"
          name="tipo"
          value="debito"
          disabled={pendente}
          className="flex-1 rounded-2xl bg-saida px-4 py-3 text-base font-bold text-white disabled:opacity-60"
        >
          − {t('descontar')}
        </button>
      </div>
    </form>
  )
}
