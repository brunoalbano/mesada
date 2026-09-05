'use client'

import { useActionState, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { MoedaCaindo } from '@/components/MoedaCaindo'
import { emojiDoMotivo, type Sugestao } from '@/lib/sugestoes'
import { lancar, type ResultadoLancamento } from './acoes'

const INICIAL: ResultadoLancamento = null
const MOTIVOS = ['💰', '🎁', '🍦', '🧸', '📚', '🃏'] as const

export function FormularioLancamento({
  childId,
  arquivada,
  pequeno,
  sugestoes,
}: {
  childId: string
  arquivada: boolean
  pequeno: boolean
  sugestoes: Sugestao[]
}) {
  const t = useTranslations('crianca')
  const tComum = useTranslations('comum')
  // Vocabulário por modo: "Ganhou/Gastou" para quem tem 6 anos, "Creditar/
  // Debitar" para quem tem 15. A diferença fica no arquivo de mensagem, e
  // não escondida numa condicional dentro do componente.
  const tModo = useTranslations(pequeno ? 'modo.pequeno' : 'modo.grande')
  const [resultado, enviar, pendente] = useActionState(lancar, INICIAL)
  const [emoji, setEmoji] = useState<string>('💰')
  const [motivo, setMotivo] = useState('')
  const [tipo, setTipo] = useState<'credito' | 'debito'>('credito')

  // Escolher um motivo já usado traz de volta o ícone daquela vez. Digitar o
  // mesmo texto à mão faz o mesmo: quem repete "Sorvete" não deveria ter que
  // reescolher 🍦 toda semana.
  function usarMotivo(texto: string) {
    setMotivo(texto)
    const conhecido = emojiDoMotivo(sugestoes, texto)
    if (conhecido) setEmoji(conhecido)
  }
  const [moedas, setMoedas] = useState(0)

  // Dispara a moeda quando um lançamento entra de fato. Amarrado ao resultado
  // da ação, e não ao clique: animar antes de saber se deu certo mente para a
  // criança. O estado inicial é `null` justamente para este efeito não rodar
  // na montagem — com `{ ok: true }` a moeda caía ao abrir a página.
  useEffect(() => {
    if (resultado?.ok && !pendente) {
      setMoedas((n) => n + 1)
      setMotivo('')
    }
  }, [resultado, pendente])

  if (arquivada) {
    return (
      <p className="rounded-3xl bg-white p-5 text-center text-sm font-semibold text-slate-500">
        {t('arquivada')}
      </p>
    )
  }

  const erro =
    resultado && !resultado.ok
      ? resultado.erro === 'valor'
        ? t('valorInvalido')
        : resultado.erro === 'motivo'
          ? t('motivoInvalido')
          : resultado.erro === 'arquivada'
            ? t('arquivada')
            : tComum('erroInesperado')
      : null

  // Confirmação que não depende de animação. Com movimento reduzido, ou com
  // leitor de tela, a moeda caindo não existe — e sem isto o lançamento
  // entrava sem nenhum retorno.
  const sucesso = resultado?.ok === true

  return (
    <form
      action={enviar}
      className="relative flex flex-col gap-3 rounded-3xl bg-white p-5 shadow-sm"
    >
      <MoedaCaindo chave={moedas} discreta={!pequeno} />
      <input type="hidden" name="childId" value={childId} />
      <input type="hidden" name="emoji" value={emoji} />
      <input type="hidden" name="tipo" value={tipo} />

      {/* Escolha antes do envio, com um único botão de submeter.
          Antes eram dois botões `submit` no mesmo formulário, e a submissão
          implícita usa o primeiro: quem digitava o valor e apertava Enter
          creditava quando queria descontar. */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-base font-semibold text-slate-700">{tModo('tipo')}</legend>
        <div role="radiogroup" aria-label={tModo('tipo')} className="flex gap-2">
          {(['credito', 'debito'] as const).map((opcao) => {
            const escolhido = tipo === opcao
            return (
              <button
                key={opcao}
                type="button"
                role="radio"
                aria-checked={escolhido}
                onClick={() => setTipo(opcao)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-base font-bold ${
                  escolhido
                    ? opcao === 'credito'
                      ? 'bg-entrada text-white'
                      : 'bg-saida text-white'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                {/* Sinal, palavra e cor juntos: nunca só a cor. */}
                <span aria-hidden>{opcao === 'credito' ? '+' : '−'}</span>
                {opcao === 'credito' ? tModo('adicionar') : tModo('descontar')}
              </button>
            )
          })}
        </div>
      </fieldset>

      <label className="flex flex-col gap-2">
        <span className="text-base font-semibold text-slate-700">{t('valor')}</span>
        <input
          name="valor"
          required
          aria-invalid={erro !== null}
          aria-describedby={erro ? 'erro-lancamento' : undefined}
          // Teclado numérico no celular, mas campo de texto: `type=number`
          // recusa vírgula em parte dos navegadores, e vírgula é o separador
          // decimal em dois dos três idiomas.
          inputMode="decimal"
          placeholder={t('valorExemplo')}
          className="min-h-14 rounded-2xl border-2 border-slate-200 px-4 text-2xl font-bold outline-none focus:border-marca"
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-base font-semibold text-slate-700">{t('motivo')}</span>
        <input
          name="motivo"
          required
          maxLength={200}
          list="motivos-usados"
          autoComplete="off"
          value={motivo}
          onChange={(evento) => usarMotivo(evento.target.value)}
          placeholder={t('motivoPlaceholder')}
          className="min-h-12 rounded-2xl border-2 border-slate-200 px-4 text-base outline-none focus:border-marca"
        />
        <datalist id="motivos-usados">
          {sugestoes.map((sugestao) => (
            <option key={sugestao.motivo} value={sugestao.motivo} />
          ))}
        </datalist>
      </label>

      {/* Além do datalist: no celular, tocar num atalho é mais rápido do que
          digitar e esperar o navegador sugerir. */}
      {sugestoes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {sugestoes.map((sugestao) => (
            <button
              key={sugestao.motivo}
              type="button"
              onClick={() => usarMotivo(sugestao.motivo)}
              className="flex min-h-12 items-center gap-2 rounded-2xl bg-slate-100 px-3 text-base font-semibold text-slate-700"
            >
              <span aria-hidden>{sugestao.emoji ?? '💬'}</span>
              {sugestao.motivo}
            </button>
          ))}
        </div>
      )}

      {/* Escolha única, então radiogroup e não um punhado de alternadores:
          `aria-pressed` anunciaria seis botões independentes, sem dizer que é
          uma escolha só nem em que posição ela está. E o grupo precisa de
          nome: antes eram seis emoji soltos entre dois campos. */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-base font-semibold text-slate-700">{t('icone')}</legend>
        <div role="radiogroup" aria-label={t('icone')} className="flex flex-wrap gap-2">
          {MOTIVOS.map((opcao) => (
            <button
              key={opcao}
              type="button"
              role="radio"
              aria-checked={emoji === opcao}
              aria-label={opcao}
              onClick={() => setEmoji(opcao)}
              className={`h-12 w-12 rounded-2xl text-2xl ${
                emoji === opcao
                  ? 'bg-marca-claro ring-2 ring-marca-escuro'
                  : 'bg-slate-100 ring-1 ring-slate-200'
              }`}
            >
              {opcao}
            </button>
          ))}
        </div>
      </fieldset>

      {erro && (
        <p id="erro-lancamento" role="alert" className="text-base font-semibold text-saida">
          {erro}
        </p>
      )}

      {sucesso && (
        <p role="status" className="text-base font-semibold text-entrada">
          {t('lancado')}
        </p>
      )}

      <button
        type="submit"
        disabled={pendente}
        className={`rounded-2xl px-5 py-3 text-base font-bold text-white disabled:opacity-60 ${
          tipo === 'credito' ? 'bg-entrada' : 'bg-saida'
        }`}
      >
        {pendente ? t('lancando') : tipo === 'credito' ? tModo('adicionar') : tModo('descontar')}
      </button>
    </form>
  )
}
