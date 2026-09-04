'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { clienteNavegador } from '@/lib/supabase/client'
import { Cofrinho } from '@/components/Cofrinho'

export default function Entrar() {
  const t = useTranslations('entrar')
  const [email, setEmail] = useState('')
  const [estado, setEstado] = useState<'parado' | 'enviando' | 'enviado' | 'erro'>('parado')
  const [erro, setErro] = useState<string | null>(null)

  async function enviarLink(evento: React.FormEvent) {
    evento.preventDefault()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErro(t('emailInvalido'))
      return
    }
    setErro(null)
    setEstado('enviando')

    const { error } = await clienteNavegador().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    })

    if (error) {
      setEstado('erro')
      setErro(t('falhou'))
      return
    }
    setEstado('enviado')
  }

  async function entrarComGoogle() {
    await clienteNavegador().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback` },
    })
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 px-6 py-10">
      <header className="flex flex-col items-center gap-3 text-center">
        <Cofrinho estado="cheio" rotulo={t('titulo')} className="h-24 w-24" />
        <h1 className="font-titulo text-4xl font-bold text-marca-escuro">{t('titulo')}</h1>
        <p className="text-base text-slate-600">{t('subtitulo')}</p>
      </header>

      {estado === 'enviado' ? (
        <p
          role="status"
          className="rounded-2xl bg-white p-5 text-center text-base shadow-sm"
        >
          {t('linkEnviado', { email })}
        </p>
      ) : (
        <form onSubmit={enviarLink} className="flex flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-slate-700">{t('email')}</span>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(evento) => setEmail(evento.target.value)}
              placeholder={t('emailPlaceholder')}
              aria-invalid={erro !== null}
              aria-describedby={erro ? 'erro-email' : undefined}
              className="min-h-12 rounded-2xl border-2 border-slate-200 bg-white px-4 text-base outline-none focus:border-marca"
            />
          </label>

          {erro && (
            <p id="erro-email" role="alert" className="text-sm font-semibold text-saida">
              {erro}
            </p>
          )}

          <button
            type="submit"
            disabled={estado === 'enviando'}
            className="rounded-2xl bg-marca px-5 text-base font-bold text-white disabled:opacity-60"
          >
            {estado === 'enviando' ? t('enviando') : t('enviarLink')}
          </button>

          <div className="flex items-center gap-3 text-sm text-slate-500">
            <hr className="flex-1 border-slate-300" />
            {t('ou')}
            <hr className="flex-1 border-slate-300" />
          </div>

          <button
            type="button"
            onClick={entrarComGoogle}
            className="rounded-2xl border-2 border-slate-200 bg-white px-5 text-base font-bold text-slate-700"
          >
            {t('google')}
          </button>
        </form>
      )}
    </main>
  )
}
