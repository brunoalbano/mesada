import { describe, expect, it } from 'vitest'
import { idadeEm, modoPorNascimento } from './idade'

const HOJE = new Date('2026-09-04T12:00:00Z')

describe('idadeEm', () => {
  it('não conta o aniversário que ainda não chegou este ano', () => {
    expect(idadeEm('2017-09-05', HOJE)).toBe(8)
    expect(idadeEm('2017-09-04', HOJE)).toBe(9)
  })

  it('devolve 0 para data inválida, em vez de NaN', () => {
    expect(idadeEm('não é data', HOJE)).toBe(0)
  })
})

describe('modoPorNascimento', () => {
  it('vira Modo Grande no dia em que a criança faz 9 anos', () => {
    expect(modoPorNascimento('2017-09-05', HOJE)).toBe('pequeno')
    expect(modoPorNascimento('2017-09-04', HOJE)).toBe('grande')
  })

  it('sem data de nascimento, cai no Modo Pequeno', () => {
    expect(modoPorNascimento(null, HOJE)).toBe('pequeno')
  })
})
