import { NextIntlClientProvider } from 'next-intl'
import { getMessages, getTranslations } from 'next-intl/server'
import { Baloo_2, Nunito } from 'next/font/google'
import type { Metadata, Viewport } from 'next'
import { resolverIdioma } from '@/lib/i18n'
import './globals.css'

const titulo = Baloo_2({ subsets: ['latin'], variable: '--fonte-titulo', display: 'swap' })
const corpo = Nunito({ subsets: ['latin'], variable: '--fonte-corpo', display: 'swap' })

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('manifesto')
  return {
    ...metadataBase,
    // A descrição é o que aparece ao compartilhar o link; fixá-la em português
    // contradizia o manifesto, que já nasce no idioma resolvido.
    description: t('descricao'),
  }
}

const metadataBase: Metadata = {
  title: 'Mesada',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Mesada', statusBarStyle: 'default' },
  icons: {
    icon: [{ url: '/favicon-32.png', sizes: '32x32', type: 'image/png' }],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
}

export const viewport: Viewport = {
  themeColor: '#4f46e5',
  width: 'device-width',
  initialScale: 1,
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Resolvido no servidor, na primeira renderização: a página nunca aparece
  // no idioma errado para depois trocar.
  const idioma = await resolverIdioma()
  const mensagens = await getMessages()

  return (
    <html lang={idioma} className={`${titulo.variable} ${corpo.variable}`}>
      <body>
        <NextIntlClientProvider messages={mensagens}>{children}</NextIntlClientProvider>
      </body>
    </html>
  )
}
