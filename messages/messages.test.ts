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
    // Recursivo: os grupos aninham em mais de um nível desde que o vocabulário
    // por modo entrou. A versão anterior assumia dois níveis e quebrava.
    const vazias: string[] = []
    const percorrer = (objeto: unknown, prefixo: string) => {
      if (typeof objeto === 'string') {
        if (objeto.trim() === '') vazias.push(prefixo)
        return
      }
      if (typeof objeto !== 'object' || objeto === null) return
      for (const [chave, valor] of Object.entries(objeto)) {
        percorrer(valor, prefixo ? `${prefixo}.${chave}` : chave)
      }
    }
    percorrer(traducao, '')
    expect(vazias).toEqual([])
  })
})
