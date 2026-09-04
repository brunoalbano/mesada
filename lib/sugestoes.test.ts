import { describe, expect, it } from 'vitest'
import { emojiDoMotivo, sugerirMotivos } from './sugestoes'

const lancamento = (reason: string, emoji: string | null, dia: number) => ({
  reason,
  emoji,
  created_at: `2026-09-${String(dia).padStart(2, '0')}T12:00:00Z`,
})

describe('sugerirMotivos', () => {
  it('mantém o ícone da vez mais recente, e não da primeira', () => {
    const sugestoes = sugerirMotivos([
      lancamento('Mesada', '🎁', 10),
      lancamento('Mesada', '💰', 3),
    ])
    expect(sugestoes).toEqual([{ motivo: 'Mesada', emoji: '🎁' }])
  })

  it('não repete o mesmo motivo por diferença de caixa ou acento', () => {
    const sugestoes = sugerirMotivos([
      lancamento('Sorvete', '🍦', 10),
      lancamento('sorvete', '🍨', 9),
      lancamento('SORVETE', null, 8),
    ])
    expect(sugestoes).toHaveLength(1)
    expect(sugestoes[0]!.emoji).toBe('🍦')
  })

  it('ignora motivo em branco', () => {
    expect(sugerirMotivos([lancamento('   ', '💰', 10)])).toEqual([])
  })

  it('respeita o limite pedido', () => {
    const muitos = Array.from({ length: 20 }, (_, i) => lancamento(`Motivo ${i}`, '💰', 10))
    expect(sugerirMotivos(muitos, 4)).toHaveLength(4)
  })
})

describe('emojiDoMotivo', () => {
  const sugestoes = [
    { motivo: 'Mesada da semana', emoji: '💰' },
    { motivo: 'Sorvete', emoji: '🍦' },
  ]

  it('acha o ícone mesmo com caixa e acento diferentes', () => {
    expect(emojiDoMotivo(sugestoes, 'mesada da semana')).toBe('💰')
    expect(emojiDoMotivo(sugestoes, 'SORVETE')).toBe('🍦')
  })

  it('devolve null para motivo novo, para não trocar o ícone escolhido à mão', () => {
    expect(emojiDoMotivo(sugestoes, 'Cinema')).toBeNull()
    expect(emojiDoMotivo(sugestoes, '')).toBeNull()
  })
})
