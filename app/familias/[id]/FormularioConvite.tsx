'use client'

import { useActionState, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { convidarResponsavel, revogarConvite, type ResultadoConvite } from './acoes'

const INICIAL = { ok: true } as ResultadoConvite

type Convite = { id: string; email: string | null; role: string | null; expires_at: string }

export function FormularioConvite({
  familyId,
  convites,
}: {
  familyId: string
  convites: Convite[]
}) {
  const t = useTranslations('familia')
  const tComum = useTranslations('comum')
  const formatar = useFormatter()
  const [resultado, enviar, pendente] = useActionState(convidarResponsavel, INICIAL)
  const [copiado, setCopiado] = useState(false)

  const erro = !resultado.ok
    ? resultado.erro === 'semPermissao'
      ? t('semPermissao')
      : resultado.erro === 'jaConvidado'
        ? t('jaConvidado')
        : tComum('erroInesperado')
    : null

  const link =
    resultado.ok && 'token' in resultado
      ? `${typeof location === 'undefined' ? '' : location.origin}/convite/pai/${resultado.token}`
      : null

  return (
    <section className="flex flex-col gap-4 rounded-3xl bg-white p-5 shadow-sm">
      <h2 className="font-titulo text-lg font-bold">{t('convidar')}</h2>

      <form action={enviar} className="flex flex-col gap-3">
        <input type="hidden" name="familyId" value={familyId} />

        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-slate-700">{t('emailOpcional')}</span>
          <input
            name="email"
            type="email"
            inputMode="email"
            className="min-h-12 rounded-2xl border-2 border-slate-200 px-4 text-base outline-none focus:border-marca"
          />
        </label>

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            name="papel"
            value="owner"
            className="h-6 w-6 rounded border-2 border-slate-300"
          />
          <span className="text-sm font-semibold text-slate-700">{t('papel')}</span>
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
          {pendente ? t('convidando') : t('convidar')}
        </button>
      </form>

      {link && (
        <div className="flex flex-col gap-2 rounded-2xl bg-marca-claro p-4">
          {/* O banco só guarda o HMAC, então nem nós conseguimos remontar este
              link depois. Perdeu, revoga e emite outro. */}
          <p className="text-sm font-semibold text-marca-escuro">{t('conviteCriado')}</p>
          <code className="break-all rounded-xl bg-white p-3 text-xs">{link}</code>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(link)
              setCopiado(true)
            }}
            className="rounded-2xl bg-marca px-4 py-2 text-sm font-bold text-white"
          >
            {copiado ? '✓' : 'Copiar'}
          </button>
        </div>
      )}

      {convites.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-bold text-slate-700">{t('convitesPendentes')}</h3>
          <ul className="flex flex-col gap-2">
            {convites.map((convite) => (
              <li key={convite.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex flex-col">
                  <span>{convite.email ?? '—'}</span>
                  <span className="text-xs text-slate-500">
                    {t('expiraEm', {
                      data: formatar.dateTime(new Date(convite.expires_at), {
                        day: 'numeric',
                        month: 'short',
                      }),
                    })}
                  </span>
                </span>
                <form action={revogarConvite}>
                  <input type="hidden" name="id" value={convite.id} />
                  <input type="hidden" name="familyId" value={familyId} />
                  <button
                    type="submit"
                    className="rounded-2xl border-2 border-slate-200 px-3 py-2 text-xs font-bold text-saida"
                  >
                    {t('revogar')}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
