import { describe, expect, it } from 'vitest'
import { estadoPorProgresso } from './Cofrinho'

describe('estadoPorProgresso', () => {
  it('mostra cofrinho vazio quando não há nada guardado', () => {
    expect(estadoPorProgresso(0)).toBe('vazio')
  })

  it('mostra transbordando ao alcançar a meta, e continua assim acima dela', () => {
    expect(estadoPorProgresso(1)).toBe('transbordando')
    expect(estadoPorProgresso(2.5)).toBe('transbordando')
  })

  it('percorre os estados intermediários', () => {
    expect(estadoPorProgresso(0.1)).toBe('pouco')
    expect(estadoPorProgresso(0.75)).toBe('cheio')
  })
})
