import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Cliente do usuário autenticado. É este que a aplicação usa para tudo:
 * a autorização mora na RLS, não em verificação espalhada pelo código.
 */
export async function clienteServidor() {
  const armazem = await cookies()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !chave) {
    // Mensagem que diz o que fazer, em vez de um erro sobre URL inválida
    // vindo de dentro da biblioteca.
    throw new Error(
      'Configuração ausente: defina NEXT_PUBLIC_SUPABASE_URL e ' +
        'NEXT_PUBLIC_SUPABASE_ANON_KEY no ambiente do deploy.',
    )
  }

  return createServerClient(
    url,
    chave,
    {
      cookies: {
        getAll: () => armazem.getAll(),
        setAll: (cookiesParaGravar: { name: string; value: string; options: CookieOptions }[]) => {
          try {
            for (const { name, value, options } of cookiesParaGravar) {
              armazem.set(name, value, options)
            }
          } catch {
            // Server Component não pode gravar cookie. O middleware já cuidou
            // da renovação da sessão, então ignorar aqui é seguro.
          }
        },
      },
    },
  )
}
