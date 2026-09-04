'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

const CHAVE = 'mesada:instalacao-dispensada'

/**
 * Ensina a adicionar à tela de início.
 *
 * Em iOS não existe prompt de instalação: o usuário precisa fazer pelo menu
 * Compartilhar, e sem instalar não há modo standalone nem push. Por isso a
 * instrução é por sistema, e não um botão único.
 */
export function ConviteInstalacao() {
  const t = useTranslations('instalar')
  const [mostrar, setMostrar] = useState(false)
  const [ios, setIos] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(CHAVE) === '1') return
    } catch {
      // Navegador com armazenamento bloqueado: seguir sem lembrar a escolha
      // é melhor do que quebrar a página.
    }

    // Já instalado: nada a ensinar.
    const instalado =
      window.matchMedia('(display-mode: standalone)').matches ||
      // Safari em iOS não implementa display-mode: standalone.
      (window.navigator as { standalone?: boolean }).standalone === true
    if (instalado) return

    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent))
    setMostrar(true)
  }, [])

  if (!mostrar) return null

  return (
    <aside className="flex flex-col gap-2 rounded-3xl bg-marca-claro p-4">
      <p className="font-titulo font-bold text-marca-escuro">{t('titulo')}</p>
      <p className="text-sm text-slate-700">{ios ? t('ios') : t('android')}</p>
      <button
        type="button"
        onClick={() => {
          try {
            localStorage.setItem(CHAVE, '1')
          } catch {
            // Sem armazenamento, o aviso volta na próxima visita. Aceitável.
          }
          setMostrar(false)
        }}
        className="self-start text-sm font-bold text-marca-escuro underline"
      >
        {t('depois')}
      </button>
    </aside>
  )
}
