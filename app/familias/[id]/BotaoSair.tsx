'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { sairDaFamilia } from './acoes'

export function BotaoSair({ familyId }: { familyId: string }) {
  const t = useTranslations('familia')
  const tComum = useTranslations('comum')
  const [resultado, enviar, pendente] = useActionState<
    { ok: true } | { ok: false; erro: 'invalido' | 'ultimoOwner' | 'falhou' } | null,
    FormData
  >(async (_anterior, dados) => sairDaFamilia(_anterior, dados), null)

  return (
    <form action={enviar} className="flex flex-col gap-2">
      <input type="hidden" name="familyId" value={familyId} />
      {resultado && !resultado.ok && (
        <p role="alert" className="text-base font-semibold text-saida">
          {resultado.erro === 'ultimoOwner' ? t('ultimoOwner') : tComum('erroInesperado')}
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
