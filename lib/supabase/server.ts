import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Cliente do usuário autenticado. É este que a aplicação usa para tudo:
 * a autorização mora na RLS, não em verificação espalhada pelo código.
 */
export async function clienteServidor() {
  const armazem = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

/**
 * Cliente com service_role. Ignora RLS por completo.
 *
 * Uso permitido em exatamente um lugar: a rota que troca o token do link da
 * criança por uma sessão, que precisa consultar access_tokens antes de existir
 * sessão. Qualquer outro uso é bug — o que não cabe em policy tem função
 * SECURITY DEFINER no banco. Ver docs/architecture.md seção 5.
 */
export function clienteServico() {
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!chave) throw new Error('SUPABASE_SERVICE_ROLE_KEY ausente')

  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, chave, {
    cookies: { getAll: () => [], setAll: () => {} },
  })
}
