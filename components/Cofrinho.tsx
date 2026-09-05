/**
 * O cofrinho é o elemento central da identidade: é o que faz a criança de 4
 * anos reconhecer o aplicativo sem saber ler. Quatro estados, acompanhando o
 * progresso da meta, ou o saldo quando não há meta.
 *
 * A ilustração definitiva ainda não existe; esta é a forma provisória, com os
 * mesmos quatro estados e a mesma API, para que a troca seja só do desenho.
 */
export type EstadoCofrinho = 'vazio' | 'pouco' | 'cheio' | 'transbordando'

export function estadoPorProgresso(progresso: number): EstadoCofrinho {
  if (progresso >= 1) return 'transbordando'
  if (progresso >= 0.6) return 'cheio'
  if (progresso > 0) return 'pouco'
  return 'vazio'
}

const MOEDAS: Record<EstadoCofrinho, number> = {
  vazio: 0,
  pouco: 1,
  cheio: 3,
  transbordando: 5,
}

export function Cofrinho({
  estado = 'vazio',
  rotulo,
  className,
}: {
  estado?: EstadoCofrinho
  /** Sem rótulo, o desenho é decorativo e sai da árvore de acessibilidade.
   *  Antes passava-se `""`, o que produzia `role="img"` com nome vazio: nem
   *  anunciado nem escondido. */
  rotulo?: string
  className?: string
}) {
  const decorativo = !rotulo

  return (
    <svg
      viewBox="0 0 96 96"
      className={className}
      role={decorativo ? undefined : 'img'}
      aria-hidden={decorativo || undefined}
      aria-label={decorativo ? undefined : rotulo}
      xmlns="http://www.w3.org/2000/svg"
    >
      <ellipse cx="48" cy="62" rx="30" ry="24" className="fill-marca" />
      <circle cx="60" cy="56" r="3.5" className="fill-white" />
      <path d="M20 56c-4 0-6 3-6 6s2 6 6 6" className="fill-marca-escuro" />
      <rect x="40" y="38" width="16" height="4" rx="2" className="fill-marca-escuro" />
      <rect x="30" y="82" width="8" height="8" rx="2" className="fill-marca-escuro" />
      <rect x="58" y="82" width="8" height="8" rx="2" className="fill-marca-escuro" />
      {Array.from({ length: MOEDAS[estado] }).map((_, indice) => (
        <circle
          key={indice}
          cx={30 + indice * 9}
          cy={26 - (indice % 2) * 8}
          r="6"
          className="fill-moeda"
        />
      ))}
    </svg>
  )
}
