'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { sairDaFamilia } from './acoes'

export function BotaoSair({ familyId }: { familyId: string }) {
  const t = useTranslations('familia')
  const [resultado, enviar, pendente] = useActionState(sairDaFamilia, { ok: true } as
    | { ok: true }
    | { ok: false; erro: 'invalido' | 'ultimoOwner' })

  return (
    <form action={enviar} className="flex flex-col gap-2">
      <input type="hidden" name="familyId" value={familyId} />
      {!resultado.ok && (
        <p role="alert" className="text-sm font-semibold text-saida">
          {t('ultimoOwner')}
        </p>
      )}
      <button
        type="submit"
        disabled={pendente}
        className="rounded-2xl border-2 border-slate-200 px-5 py-3 text-sm font-bold text-saida disabled:opacity-60"
      >
        {t('sair')}
      </button>
    </form>
  )
}
