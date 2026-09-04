'use client'

import { useEffect, useRef, useState } from 'react'
import { movimentoReduzido } from '@/lib/movimento'

const CORES = ['#f59e0b', '#4f46e5', '#15803d', '#ffffff', '#a5b4fc']

/**
 * Confete de meta alcançada.
 *
 * Desenhado em canvas, não em DOM: cem elementos animados travam o celular
 * antigo, que é justamente o aparelho que sobra para a criança.
 *
 * Com movimento reduzido, nada é desenhado. A conquista continua legível pelo
 * texto e pelo cofrinho transbordando — nenhuma informação existe só no
 * movimento.
 */
export function Comemoracao({ ativo }: { ativo: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [desenhando, setDesenhando] = useState(false)

  useEffect(() => {
    if (!ativo || movimentoReduzido()) return
    const canvas = canvasRef.current
    const contexto = canvas?.getContext('2d')
    if (!canvas || !contexto) return

    setDesenhando(true)
    const largura = (canvas.width = canvas.offsetWidth)
    const altura = (canvas.height = canvas.offsetHeight)

    const papeis = Array.from({ length: 90 }, () => ({
      x: Math.random() * largura,
      y: -20 - Math.random() * altura,
      raio: 3 + Math.random() * 5,
      queda: 1.5 + Math.random() * 2.5,
      giro: Math.random() * Math.PI,
      giroPorQuadro: (Math.random() - 0.5) * 0.2,
      cor: CORES[Math.floor(Math.random() * CORES.length)]!,
    }))

    let quadro = 0
    let animacao = 0

    const passo = () => {
      contexto.clearRect(0, 0, largura, altura)
      for (const papel of papeis) {
        papel.y += papel.queda
        papel.giro += papel.giroPorQuadro
        contexto.save()
        contexto.translate(papel.x, papel.y)
        contexto.rotate(papel.giro)
        contexto.fillStyle = papel.cor
        contexto.fillRect(-papel.raio, -papel.raio / 2, papel.raio * 2, papel.raio)
        contexto.restore()
      }
      quadro += 1
      // Cerca de quatro segundos a 60 quadros: comemora e sai de cena.
      if (quadro < 240) {
        animacao = requestAnimationFrame(passo)
      } else {
        contexto.clearRect(0, 0, largura, altura)
        setDesenhando(false)
      }
    }
    animacao = requestAnimationFrame(passo)

    return () => cancelAnimationFrame(animacao)
  }, [ativo])

  if (!ativo) return null

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`pointer-events-none fixed inset-0 z-50 h-full w-full ${
        desenhando ? '' : 'hidden'
      }`}
    />
  )
}
