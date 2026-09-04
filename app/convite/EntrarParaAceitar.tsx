'use client'

import { useTranslations } from 'next-intl'
import { clienteNavegador } from '@/lib/supabase/client'
import { Cofrinho } from '@/components/Cofrinho'

export function EntrarParaAceitar() {
  const t = useTranslations('convite')

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-5 px-6 text-center">
      <Cofrinho estado="pouco" rotulo="" className="h-20 w-20" />
      <h1 className="font-titulo text-2xl font-bold text-marca-escuro">{t('entrarTitulo')}</h1>
      <p className="text-slate-600">{t('entrarTexto')}</p>
      <button
        type="button"
        onClick={() =>
          clienteNavegador().auth.signInWithOAuth({
            provider: 'google',
            // Volta para cá; o convite continua esperando no cookie.
            options: { redirectTo: `${location.origin}/auth/callback?next=/convite` },
          })
        }
        className="w-full rounded-2xl bg-marca px-5 py-3 text-base font-bold text-white"
      >
        {t('entrarGoogle')}
      </button>
      <a href="/entrar" className="botao text-sm font-semibold text-marca-escuro underline">
        {t('entrarOutro')}
      </a>
    </main>
  )
}
