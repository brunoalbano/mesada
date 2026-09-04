import { describe, expect, it } from 'vitest'
import { centavosDeTexto, formatarCentavos } from './money'

describe('centavosDeTexto', () => {
  it('lê vírgula e ponto como separador decimal', () => {
    expect(centavosDeTexto('12,50')).toBe(1250)
    expect(centavosDeTexto('12.50')).toBe(1250)
  })

  it('descarta o separador de milhar, seja qual for a convenção', () => {
    expect(centavosDeTexto('1.234,56')).toBe(123456)
    expect(centavosDeTexto('1,234.56')).toBe(123456)
  })

  it('arredonda para o centavo em vez de truncar', () => {
    expect(centavosDeTexto('0,015')).toBe(2)
  })

  it('não perde centavo por erro de ponto flutuante', () => {
    expect(centavosDeTexto('0,1')! + centavosDeTexto('0,2')!).toBe(30)
  })

  it('devolve null em vez de NaN quando não há número', () => {
    expect(centavosDeTexto('')).toBeNull()
    expect(centavosDeTexto('abc')).toBeNull()
    expect(centavosDeTexto(',')).toBeNull()
  })

  it('recusa valor acima do limite aceito pelo banco', () => {
    expect(centavosDeTexto('1000000.01')).toBeNull()
  })
})

describe('formatarCentavos', () => {
  it('mantém a moeda da família mesmo com o idioma em inglês', () => {
    const emIngles = formatarCentavos(123456, 'en', 'BRL')
    expect(emIngles).toContain('R$')
    expect(emIngles).not.toMatch(/^\$/)
  })

  it('formata no padrão do idioma pedido', () => {
    expect(formatarCentavos(123456, 'pt', 'BRL').replace(/ /g, ' ')).toBe('R$ 1.234,56')
  })
})
