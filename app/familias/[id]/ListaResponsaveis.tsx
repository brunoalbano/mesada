'use client'

import { useTranslations } from 'next-intl'
import { promoverResponsavel, rebaixarResponsavel } from './acoes'

type Membro = { userId: string; papel: string; nome: string }

/**
 * Responsáveis da família, com transferência de administração.
 *
 * Sem isso o último administrador ficava preso: a mensagem ao sair mandava
 * transferir, e não existia onde fazê-lo.
 */
export function ListaResponsaveis({
  familyId,
  membros,
  souOwner,
  meuId,
}: {
  familyId: string
  membros: Membro[]
  souOwner: boolean
  meuId: string
}) {
  const t = useTranslations('familia')
  const owners = membros.filter((m) => m.papel === 'owner').length

  return (
    <section className="flex flex-col gap-3 rounded-3xl bg-white p-5 shadow-sm">
      <h2 className="font-titulo text-lg font-bold">{t('responsaveis')}</h2>

      <ul className="flex flex-col gap-3">
        {membros.map((membro) => {
          const ehOwner = membro.papel === 'owner'
          // O último administrador não pode se rebaixar: a família ficaria
          // sem ninguém capaz de convidar, remover ou apagar.
          const podeRebaixar = souOwner && ehOwner && owners > 1
          const podePromover = souOwner && !ehOwner

          return (
            <li key={membro.userId} className="flex flex-wrap items-center gap-2">
              <span className="flex-1 text-base">
                {membro.nome}
                {membro.userId === meuId && <span className="text-slate-600"> ({t('voce')})</span>}
              </span>

              {ehOwner && (
                <span className="rounded-full bg-marca-claro px-3 py-1 text-sm font-bold text-marca-escuro">
                  {t('papel')}
                </span>
              )}

              {(podePromover || podeRebaixar) && (
                <form action={podePromover ? promoverResponsavel : rebaixarResponsavel}>
                  <input type="hidden" name="familyId" value={familyId} />
                  <input type="hidden" name="userId" value={membro.userId} />
                  <button
                    type="submit"
                    className="rounded-2xl border-2 border-slate-200 px-3 py-2 text-sm font-bold text-slate-700"
                  >
                    {podePromover ? t('promover') : t('rebaixar')}
                  </button>
                </form>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
