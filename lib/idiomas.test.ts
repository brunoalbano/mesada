import { describe, expect, it } from 'vitest'
import { idiomaDeAcceptLanguage } from './idiomas'

describe('idiomaDeAcceptLanguage', () => {
  it('reconhece variante regional pelo idioma base', () => {
    expect(idiomaDeAcceptLanguage('pt-BR,pt;q=0.9')).toBe('pt')
    expect(idiomaDeAcceptLanguage('es-419')).toBe('es')
    expect(idiomaDeAcceptLanguage('en-US')).toBe('en')
  })

  it('respeita a ordem de preferência declarada pelo navegador', () => {
    expect(idiomaDeAcceptLanguage('de;q=1.0,en;q=0.8,pt;q=0.9')).toBe('pt')
  })

  it('ignora idioma com q=0, que significa recusado', () => {
    expect(idiomaDeAcceptLanguage('pt;q=0,en;q=0.5')).toBe('en')
  })

  it('devolve null quando nenhum idioma é suportado, para cair no padrão', () => {
    expect(idiomaDeAcceptLanguage('de,fr;q=0.8')).toBeNull()
    expect(idiomaDeAcceptLanguage(null)).toBeNull()
    expect(idiomaDeAcceptLanguage('')).toBeNull()
  })
})
