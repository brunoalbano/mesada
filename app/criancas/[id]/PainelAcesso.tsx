'use client'

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import { convidarCrianca, desvincularConta, type ResultadoAcesso } from './acoes'

const INICIAL: ResultadoAcesso = { ok: false, erro: 'falhou' }

type Conta = { auth_user_id: string; provider: string; linked_at: string }

export function PainelAcesso({
  childId,
  nome,
  contas,
}: {
  childId: string
  nome: string
  contas: Conta[]
}) {
  const t = useTranslations('acesso')
  const tComum = useTranslations('comum')
  const [resultado, enviar, pendente] = useActionState(convidarCrianca, INICIAL)
  const [copiado, setCopiado] = useState(false)

  const link =
    resultado.ok && typeof location !== 'undefined'
      ? `${location.origin}/convite/filho/${resultado.token}`
      : null
  const erro =
    !resultado.ok && resultado.erro === 'semPermissao'
      ? t('semPermissao')
      : !resultado.ok && link === null && pendente === false && resultado.erro === 'falhou'
        ? null
        : null

  return (
    <section className="flex flex-col gap-3 rounded-3xl bg-white p-5 shadow-sm">
      <h2 className="font-titulo text-lg font-bold">{t('titulo', { nome })}</h2>

      {contas.length === 0 ? (
        <p className="text-sm text-slate-600">{t('semConta', { nome })}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {contas.map((conta) => (
            <li key={conta.auth_user_id} className="flex items-center justify-between gap-2">
              <span className="text-sm">
                {conta.provider === 'google' ? 'Google' : t('porEmail')}
              </span>
              <form action={desvincularConta}>
                <input type="hidden" name="authUserId" value={conta.auth_user_id} />
                <input type="hidden" name="childId" value={childId} />
                <button
                  type="submit"
                  className="rounded-2xl border-2 border-slate-200 px-3 py-2 text-xs font-bold text-saida"
                >
                  {t('desvincular')}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form action={enviar}>
        <input type="hidden" name="childId" value={childId} />
        <button
          type="submit"
          disabled={pendente}
          className="w-full rounded-2xl border-2 border-marca px-5 py-3 text-sm font-bold text-marca-escuro disabled:opacity-60"
        >
          {pendente ? t('gerando') : t('gerar')}
        </button>
      </form>

      {erro && (
        <p role="alert" className="text-sm font-semibold text-saida">
          {erro}
        </p>
      )}

      {link && (
        <div className="flex flex-col gap-2 rounded-2xl bg-marca-claro p-4">
          {/* O banco guarda só o HMAC: este link não pode ser remontado depois. */}
          <p className="text-sm font-semibold text-marca-escuro">{t('copieAgora')}</p>
          <code className="break-all rounded-xl bg-white p-3 text-xs">{link}</code>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(link)
              setCopiado(true)
            }}
            className="rounded-2xl bg-marca px-4 py-2 text-sm font-bold text-white"
          >
            {copiado ? '✓' : tComum('copiar')}
          </button>
          <p className="text-xs text-marca-escuro">{t('validade')}</p>
        </div>
      )}
    </section>
  )
}
