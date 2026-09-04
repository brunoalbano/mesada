import 'server-only'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Tokens de convite.
 *
 * O banco guarda `HMAC-SHA256(token, TOKEN_PEPPER)`, nunca o token em claro.
 * O pepper vive em variável de ambiente, fora do banco: com hash simples, um
 * dump vazado permitiria testar tokens candidatos offline; com HMAC, não,
 * porque falta a chave.
 */

const BYTES = 32

export function gerarToken(): string {
  return randomBytes(BYTES).toString('base64url')
}

export function hashToken(token: string): Buffer {
  const pepper = process.env.TOKEN_PEPPER
  if (!pepper) throw new Error('TOKEN_PEPPER ausente')
  return createHmac('sha256', pepper).update(token).digest()
}

/** Formato para o Postgres, que recebe `bytea` como `\x…`. */
export function hashParaBanco(token: string): string {
  return `\\x${hashToken(token).toString('hex')}`
}

/**
 * Um token só é aceito se tiver o formato que geramos. Sem isto, qualquer
 * texto vira uma consulta ao banco, e a rota de aceite passa a ser um oráculo
 * barato para varredura.
 */
export function ehFormatoDeToken(valor: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(valor)
}

/**
 * Comparação em tempo constante. Não é usada no caminho do banco, que compara
 * por índice único, mas é o que deve ser usado em qualquer comparação de
 * segredo feita em JavaScript.
 */
export function hashesIguais(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b)
}
