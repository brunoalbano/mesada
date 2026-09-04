import { describe, expect, it } from 'vitest'
import en from './en.json'
import es from './es.json'
import pt from './pt.json'

/**
 * Português é o idioma-fonte. O teste falha se en ou es tiverem chave
 * faltando ou sobrando.
 *
 * Não existe fallback silencioso para português na interface: texto meio
 * traduzido é pior que texto traduzido mal, porque o usuário não sabe se o
 * que ele está lendo vale.
 */
function chaves(objeto: unknown, prefixo = ''): string[] {
  if (typeof objeto !== 'object' || objeto === null) return [prefixo]
  return Object.entries(objeto).flatMap(([chave, valor]) =>
    chaves(valor, prefixo ? `${prefixo}.${chave}` : chave),
  )
}

describe('mensagens', () => {
  const fonte = chaves(pt).sort()

  it.each([
    ['en', en],
    ['es', es],
  ])('%s tem exatamente as mesmas chaves de pt', (_idioma, traducao) => {
    expect(chaves(traducao).sort()).toEqual(fonte)
  })

  it.each([
    ['pt', pt],
    ['en', en],
    ['es', es],
  ])('%s não tem texto vazio', (_idioma, traducao) => {
    const vazias = Object.entries(traducao).flatMap(([grupo, valores]) =>
      Object.entries(valores as Record<string, string>)
        .filter(([, texto]) => texto.trim() === '')
        .map(([chave]) => `${grupo}.${chave}`),
    )
    expect(vazias).toEqual([])
  })
})
