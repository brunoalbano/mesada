import { getRequestConfig } from 'next-intl/server'
import { resolverIdioma } from '@/lib/i18n'

export default getRequestConfig(async () => {
  const locale = await resolverIdioma()
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    timeZone: 'America/Sao_Paulo',
  }
})
