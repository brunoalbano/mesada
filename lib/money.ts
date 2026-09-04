/**
 * Dinheiro em centavos inteiros. Ponto flutuante nunca toca em valor
 * monetário: 0.1 + 0.2 não é 0.3, e um centavo perdido por lançamento vira
 * um saldo errado depois de um ano de mesada.
 */

export const LIMITE_CENTAVOS = 100_000_000 // espelha o check do banco

/**
 * Formata centavos no idioma pedido, com a moeda da família.
 *
 * Idioma e moeda são independentes de propósito: um pai brasileiro com o
 * celular em inglês vê `R$ 1,234.56`, e não `$1,234.56`. Trocar a moeda junto
 * com o idioma corrompe a leitura do dinheiro.
 */
export function formatarCentavos(centavos: number, idioma: string, moeda = 'BRL'): string {
  return new Intl.NumberFormat(idioma, {
    style: 'currency',
    currency: moeda,
  }).format(centavos / 100)
}

/**
 * Converte o que a pessoa digitou em centavos.
 *
 * Aceita vírgula ou ponto como separador decimal, porque o teclado do celular
 * e o hábito mudam entre os três idiomas. Separador de milhar é descartado.
 * Devolve null quando não dá para ler um número — nunca NaN, que se propaga
 * em silêncio.
 */
export function centavosDeTexto(texto: string): number | null {
  const limpo = texto.trim().replace(/\s/g, '')
  if (limpo === '') return null

  const temVirgula = limpo.includes(',')
  const temPonto = limpo.includes('.')

  let normalizado = limpo
  if (temVirgula && temPonto) {
    // O último separador que aparece é o decimal.
    const decimal = limpo.lastIndexOf(',') > limpo.lastIndexOf('.') ? ',' : '.'
    const milhar = decimal === ',' ? '.' : ','
    normalizado = limpo.split(milhar).join('').replace(decimal, '.')
  } else if (temVirgula) {
    normalizado = limpo.replace(',', '.')
  }

  if (!/^-?\d*\.?\d*$/.test(normalizado) || !/\d/.test(normalizado)) return null

  const valor = Number.parseFloat(normalizado)
  if (!Number.isFinite(valor)) return null

  const centavos = Math.round(valor * 100)
  if (Math.abs(centavos) > LIMITE_CENTAVOS) return null
  return centavos
}
