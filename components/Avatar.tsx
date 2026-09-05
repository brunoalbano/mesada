/**
 * Avatares da criança. Conjunto fechado de oito, escolhido na interface.
 *
 * Nunca foto: dado de menor pede minimização, e um retrato não acrescenta nada
 * que um bicho escolhido pela própria criança não resolva melhor.
 *
 * Provisório como o cofrinho: hoje é emoji, a ilustração definitiva entra sem
 * mudar a chave nem esta API.
 */
export const AVATARES = [
  'gato',
  'urso',
  'raposa',
  'coelho',
  'panda',
  'leao',
  'sapo',
  'pinguim',
] as const

export type ChaveAvatar = (typeof AVATARES)[number]

const DESENHO: Record<ChaveAvatar, string> = {
  gato: '🐱',
  urso: '🐻',
  raposa: '🦊',
  coelho: '🐰',
  panda: '🐼',
  leao: '🦁',
  sapo: '🐸',
  pinguim: '🐧',
}

export function ehChaveAvatar(valor: unknown): valor is ChaveAvatar {
  return typeof valor === 'string' && (AVATARES as readonly string[]).includes(valor)
}

export function Avatar({
  chave,
  nome,
  className = 'h-12 w-12 text-3xl',
}: {
  chave: string
  /** Nome já traduzido. Antes ia a chave crua, e o leitor de tela em inglês
   *  anunciava "gato", "urso", "leao". */
  nome: string
  className?: string
}) {
  return (
    <span
      role="img"
      aria-label={nome}
      className={`flex shrink-0 items-center justify-center rounded-full bg-marca-claro ${className}`}
    >
      {ehChaveAvatar(chave) ? DESENHO[chave] : '🐣'}
    </span>
  )
}
