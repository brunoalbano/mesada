'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { IDIOMAS } from '@/lib/idiomas'

export function SeletorIdioma() {
  const t = useTranslations('idioma')
  const atual = useLocale()
  const router = useRouter()

  return (
    <label className="flex items-center gap-1">
      <span className="sr-only">{t('rotulo')}</span>
      <select
        value={atual}
        onChange={(evento) => {
          // Cookie de um ano: a escolha manual vence o Accept-Language em toda
          // visita seguinte. Sem prefixo de idioma na URL, então nada de link
          // salvo quebra ao trocar.
          document.cookie = `locale=${evento.target.value}; path=/; max-age=31536000; samesite=lax`
          router.refresh()
        }}
        className="min-h-12 rounded-2xl border-2 border-slate-200 bg-white px-3 text-sm font-semibold"
      >
        {IDIOMAS.map((idioma) => (
          <option key={idioma} value={idioma}>
            {t(idioma)}
          </option>
        ))}
      </select>
    </label>
  )
}
