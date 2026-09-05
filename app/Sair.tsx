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

        // Sair tem de apagar o que ficou guardado, senão a próxima pessoa a
        // usar o aparelho pode ler as páginas da anterior. Hoje o service
        // worker não guarda página autenticada, mas versões antigas dele
        // guardaram, e o cache sobrevive à atualização.
        try {
          const nomes = await caches.keys()
          await Promise.all(nomes.map((nome) => caches.delete(nome)))
        } catch {
          // Navegador sem CacheStorage, ou com armazenamento bloqueado.
        }

        router.replace('/entrar')
      }}
      className="rounded-2xl border-2 border-slate-200 bg-white px-4 text-sm font-bold text-slate-700"
    >
      {t('sair')}
    </button>
  )
}
