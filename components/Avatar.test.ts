import { describe, expect, it } from 'vitest'
import { AVATARES, ehChaveAvatar } from './Avatar'

describe('avatares', () => {
  it('são oito, o número que a revisão de escopo fixou', () => {
    expect(AVATARES).toHaveLength(8)
  })

  it('não têm chave repetida', () => {
    expect(new Set(AVATARES).size).toBe(AVATARES.length)
  })

  it('recusa chave desconhecida, para o banco não guardar avatar inexistente', () => {
    expect(ehChaveAvatar('gato')).toBe(true)
    expect(ehChaveAvatar('dinossauro')).toBe(false)
    expect(ehChaveAvatar('')).toBe(false)
    expect(ehChaveAvatar(null)).toBe(false)
  })
})
