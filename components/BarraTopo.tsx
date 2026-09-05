import { SeletorIdioma } from '@/app/SeletorIdioma'

/**
 * Faixa com o seletor de idioma.
 *
 * Fica em toda tela, e não só na inicial. Antes o controle existia apenas na
 * lista de famílias — justamente a tela que uma criança e um convidado nunca
 * veem —, então quem chegava com o celular noutro idioma não tinha como
 * trocar.
 */
export function BarraTopo({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-end gap-2">
      {children}
      <SeletorIdioma />
    </div>
  )
}
