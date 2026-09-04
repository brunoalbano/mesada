'use client'

import { useTranslations } from 'next-intl'
import { arquivarCrianca, desarquivarCrianca } from '@/app/familias/[id]/acoes'

/**
 * Arquivar, nunca apagar: o histórico continua legível, e a policy de escrita
 * já recusa lançamento novo em criança arquivada.
 *
 * Fica no rodapé da página da criança, e não na lista da família: ali era um
 * botão ao lado do caminho principal, fácil de tocar sem querer.
 */
export function BotaoArquivar({
  childId,
  familyId,
  arquivada,
}: {
  childId: string
  familyId: string
  arquivada: boolean
}) {
  const t = useTranslations('criancas')

  return (
    <form action={arquivada ? desarquivarCrianca : arquivarCrianca} className="pb-4">
      <input type="hidden" name="id" value={childId} />
      <input type="hidden" name="familyId" value={familyId} />
      <button
        type="submit"
        className="w-full rounded-2xl border-2 border-slate-200 px-5 py-3 text-sm font-bold text-slate-600"
      >
        {arquivada ? t('desarquivar') : t('arquivar')}
      </button>
    </form>
  )
}
