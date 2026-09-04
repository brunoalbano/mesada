import { NextResponse, type NextRequest } from 'next/server'
import { ehFormatoDeToken } from '@/lib/tokens'

const COOKIE = 'convite'

/**
 * Primeira parada de um link de convite.
 *
 * Guarda o token num cookie `HttpOnly` e responde 303 para uma URL sem token.
 * `history.replaceState` no cliente não bastaria: a navegação já aconteceu, e
 * com o service worker instalado esta resposta ficaria no CacheStorage
 * indexada pela URL com o token — num tablet compartilhado, legível depois.
 *
 * O tipo vem no caminho (`/convite/pai/…` ou `/convite/filho/…`) em vez de ser
 * descoberto no banco: consultar por hash para saber o tipo transformaria a
 * rota num oráculo de existência de convite.
 */
export async function GET(
  request: NextRequest,
  contexto: { params: Promise<{ tipo: string; token: string }> },
) {
  const { tipo, token } = await contexto.params
  const origem = new URL(request.url).origin

  const invalido = NextResponse.redirect(new URL('/convite?erro=invalido', origem), 303)
  invalido.headers.set('Cache-Control', 'no-store')

  if (tipo !== 'pai' && tipo !== 'filho') return invalido
  // Recusa antes de tocar o banco: sem isto, qualquer texto vira consulta, e a
  // rota fica barata de varrer.
  if (!ehFormatoDeToken(token)) return invalido

  const resposta = NextResponse.redirect(new URL('/convite', origem), 303)
  resposta.headers.set('Cache-Control', 'no-store')
  resposta.cookies.set(COOKIE, `${tipo}:${token}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/convite',
    // Janela curta: é o tempo de fazer login e aceitar, não de guardar.
    maxAge: 15 * 60,
  })
  return resposta
}
