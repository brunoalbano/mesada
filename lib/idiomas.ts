/**
 * Constantes e funções puras de idioma. Sem `next/headers`, para que um
 * componente de cliente possa importar sem arrastar código de servidor.
 */

export const IDIOMAS = ['pt', 'en', 'es'] as const
export type Idioma = (typeof IDIOMAS)[number]
export const IDIOMA_PADRAO: Idioma = 'pt'
export const COOKIE_IDIOMA = 'locale'

export function ehIdioma(valor: unknown): valor is Idioma {
  return typeof valor === 'string' && (IDIOMAS as readonly string[]).includes(valor)
}

/**
 * Escolhe o melhor idioma suportado a partir de um cabeçalho Accept-Language.
 * Casa também por idioma base, para que `pt-BR` e `es-419` sejam reconhecidos.
 */
export function idiomaDeAcceptLanguage(cabecalho: string | null): Idioma | null {
  if (!cabecalho) return null

  const preferidos = cabecalho
    .split(',')
    .map((parte) => {
      const [tag = '', ...parametros] = parte.trim().split(';')
      const q = parametros
        .map((p) => p.trim())
        .find((p) => p.startsWith('q='))
        ?.slice(2)
      const peso = q === undefined ? 1 : Number.parseFloat(q)
      return { tag: tag.toLowerCase(), peso: Number.isFinite(peso) ? peso : 0 }
    })
    .filter((item) => item.tag !== '' && item.peso > 0)
    .sort((a, b) => b.peso - a.peso)

  for (const { tag } of preferidos) {
    if (ehIdioma(tag)) return tag
    const base = tag.split('-')[0]
    if (ehIdioma(base)) return base
  }
  return null
}
