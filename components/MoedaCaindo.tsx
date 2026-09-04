'use client'

import { useEffect, useState } from 'react'
import { movimentoReduzido } from '@/lib/movimento'

/**
 * Moeda que cai no cofrinho quando entra dinheiro.
 *
 * É a confirmação visual do Modo Pequeno: a criança de 5 anos não lê "crédito
 * lançado", mas entende uma moeda caindo. No Modo Grande a animação é
 * discreta, e com movimento reduzido não existe.
 */
export function MoedaCaindo({ chave, discreta = false }: { chave: number; discreta?: boolean }) {
  const [caindo, setCaindo] = useState(false)

  useEffect(() => {
    if (chave === 0 || movimentoReduzido()) return
    setCaindo(true)
    const parar = setTimeout(() => setCaindo(false), discreta ? 600 : 1100)
    return () => clearTimeout(parar)
  }, [chave, discreta])

  if (!caindo) return null

  return (
    <span
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 text-4xl"
      style={{ animation: `cair ${discreta ? 600 : 1100}ms ease-in forwards` }}
    >
      🪙
    </span>
  )
}
