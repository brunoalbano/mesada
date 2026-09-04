import { NextResponse, type NextRequest } from 'next/server'
import { clienteServidor } from '@/lib/supabase/server'

/**
 * Retorno do magic link e do OAuth. Troca o código por sessão e leva para a
 * área do responsável.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const codigo = url.searchParams.get('code')
  const destino = url.searchParams.get('next') ?? '/'

  // Só caminho relativo: `next` vem da URL e um destino absoluto viraria
  // redirecionamento aberto para fora do aplicativo.
  const destinoSeguro = destino.startsWith('/') && !destino.startsWith('//') ? destino : '/'

  if (!codigo) {
    return NextResponse.redirect(new URL('/entrar?erro=sem-codigo', url.origin))
  }

  const supabase = await clienteServidor()
  const { error } = await supabase.auth.exchangeCodeForSession(codigo)
  if (error) {
    return NextResponse.redirect(new URL('/entrar?erro=troca', url.origin))
  }

  return NextResponse.redirect(new URL(destinoSeguro, url.origin))
}
