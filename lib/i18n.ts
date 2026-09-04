import 'server-only'
import { cookies, headers } from 'next/headers'
import { COOKIE_IDIOMA, IDIOMA_PADRAO, ehIdioma, idiomaDeAcceptLanguage, type Idioma } from './idiomas'

/**
 * Resolve o idioma no servidor, na primeira renderização, para que a página
 * nunca apareça no idioma errado antes de corrigir. `navigator.language` não
 * é usado: chega tarde e provoca troca visível de texto.
 *
 * Precedência: cookie escolhido à mão, depois Accept-Language, depois pt.
 * A preferência do perfil entra na camada acima, ao gravar o cookie no login.
 */
export async function resolverIdioma(): Promise<Idioma> {
  const escolhido = (await cookies()).get(COOKIE_IDIOMA)?.value
  if (ehIdioma(escolhido)) return escolhido

  const doNavegador = idiomaDeAcceptLanguage((await headers()).get('accept-language'))
  return doNavegador ?? IDIOMA_PADRAO
}
