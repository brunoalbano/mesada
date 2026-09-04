import { afterEach, describe, expect, it, vi } from 'vitest'
import { movimentoReduzido } from './movimento'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('movimentoReduzido', () => {
  it('respeita a preferência do sistema quando ela existe', () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) })
    expect(movimentoReduzido()).toBe(true)

    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) })
    expect(movimentoReduzido()).toBe(false)
  })

  it('no servidor devolve false em vez de quebrar a renderização', () => {
    vi.stubGlobal('window', undefined)
    expect(movimentoReduzido()).toBe(false)
  })

  it('não quebra em navegador sem matchMedia', () => {
    vi.stubGlobal('window', {})
    expect(movimentoReduzido()).toBe(false)
  })
})
