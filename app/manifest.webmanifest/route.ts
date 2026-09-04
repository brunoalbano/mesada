import { getTranslations } from 'next-intl/server'
import { resolverIdioma } from '@/lib/i18n'

/**
 * Manifesto servido por rota, para nascer no idioma do usuário: o atalho
 * instalado carrega o nome e a descrição resolvidos na hora da instalação.
 *
 * `start_url` é fixo. Nunca derivado da URL aberta, senão um token de convite
 * entraria no atalho e ficaria lá para sempre.
 */
export async function GET() {
  const idioma = await resolverIdioma()
  const t = await getTranslations('manifesto')

  return Response.json(
    {
      name: 'Mesada',
      short_name: 'Mesada',
      description: t('descricao'),
      lang: idioma,
      dir: 'ltr',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#eef2ff',
      theme_color: '#4f46e5',
      categories: ['finance', 'education', 'lifestyle'],
      icons: [
        { src: '/icone-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icone-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
        { src: '/icone-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    {
      headers: {
        'Content-Type': 'application/manifest+json',
        // Curto: o manifesto muda com o idioma, e um cache longo prenderia o
        // atalho no idioma da primeira visita.
        'Cache-Control': 'public, max-age=0, must-revalidate',
      },
    },
  )
}
