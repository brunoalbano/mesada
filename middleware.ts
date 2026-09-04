import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Renova a sessão a cada requisição. Sem isso, o token expira no servidor e o
 * usuário é deslogado sem motivo aparente.
 *
 * O refresh também é o momento em que o Custom Access Token Hook roda de novo.
 * É por ali que a revogação de um link da criança passa a valer: o hook deixa
 * de emitir a claim `child_id`, e a sessão perde o acesso.
 */
export async function middleware(request: NextRequest) {
  let resposta = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
