'use client'

import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { clienteNavegador } from '@/lib/supabase/client'

export function Sair() {
  const t = useTranslations('comum')
  const router = useRouter()

  return (
    <button
      type="button"
      onClick={async () => {
        await clienteNavegador().auth.signOut()
        router.replace('/entrar')
      }}
      className="rounded-2xl border-2 border-slate-200 bg-white px-4 text-sm font-bold text-slate-700"
    >
      {t('sair')}
    </button>
  )
}
