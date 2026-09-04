/**
 * Respeitar `prefers-reduced-motion` não é enfeite de acessibilidade: para
 * quem tem enxaqueca vestibular, animação grande causa mal-estar físico.
 *
 * O CSS já reduz duração em `globals.css`. Isto é para o JavaScript: animação
 * que dispara partícula ou som precisa não acontecer, e não apenas acontecer
 * rápido.
 */
export function movimentoReduzido(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
