import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Renova a sessão a cada requisição. Sem isso, o token expira no servidor e o
 * usuário é deslogado sem motivo aparente.
 *
 * O refresh também é o momento em que o Custom Access Token Hook roda de novo.
 * É por ali que desvincular a conta de uma criança passa a valer: o hook deixa
 * de emitir a claim `child_id`, e a sessão perde o acesso.
 */
export async function middleware(request: NextRequest) {
  let resposta = NextResponse.next({ request })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Sem configuração, seguir sem renovar a sessão. O usuário cai na tela de
  // entrada, que é ruim, mas legível.
  //
  // Antes o middleware lançava aqui, e como ele roda em toda requisição, uma
  // variável faltando derrubava o site inteiro com MIDDLEWARE_INVOCATION_FAILED
  // — inclusive páginas que não usam banco nenhum. Um erro de configuração não
  // deve ter esse alcance.
  if (!url || !chave) {
    console.error(
      'NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY ausente. ' +
        'Sessões não serão renovadas. Confira as variáveis de ambiente do deploy.',
    )
    return resposta
  }

  const supabase = createServerClient(
    url,
    chave,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies: { name: string; value: string; options: CookieOptions }[]) => {
          for (const { name, value } of cookies) request.cookies.set(name, value)
          resposta = NextResponse.next({ request })
          for (const { name, value, options } of cookies) {
            resposta.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  await supabase.auth.getUser()
  return resposta
}

export const config = {
  matcher: [
    // Tudo, menos estáticos e imagens.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|webmanifest)$).*)',
  ],
}
