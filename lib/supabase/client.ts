'use client'

import { createBrowserClient } from '@supabase/ssr'

export function clienteNavegador() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !chave) {
    throw new Error(
      'Configuração ausente: defina NEXT_PUBLIC_SUPABASE_URL e ' +
        'NEXT_PUBLIC_SUPABASE_ANON_KEY no ambiente do deploy.',
    )
  }
  return createBrowserClient(url, chave)
}
