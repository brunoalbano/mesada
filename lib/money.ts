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
export type ErroDeValor = 'vazio' | 'naoNumero' | 'acimaDoLimite'

/**
 * Igual a `centavosDeTexto`, mas diz por que falhou.
 *
 * A mensagem única de antes — "digite um valor maior que zero" — descrevia um
 * problema que a pessoa não tinha: quem digitou `12.5.5` ou um valor acima do
 * teto via um texto sobre zero.
 */
export function lerCentavos(texto: string): { ok: true; centavos: number } | { ok: false; erro: ErroDeValor } {
  const limpo = texto.trim()
  if (limpo === '') return { ok: false, erro: 'vazio' }

  const centavos = centavosDeTexto(limpo)
  if (centavos === null) {
    // `centavosDeTexto` devolve null tanto para texto ilegível quanto para
    // valor acima do teto; separar aqui é o que permite a mensagem certa.
    const semSeparador = Number.parseFloat(limpo.replace(/[.\s]/g, '').replace(',', '.'))
    if (Number.isFinite(semSeparador) && Math.abs(semSeparador * 100) > LIMITE_CENTAVOS) {
      return { ok: false, erro: 'acimaDoLimite' }
    }
    return { ok: false, erro: 'naoNumero' }
  }
  return { ok: true, centavos }
}

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
