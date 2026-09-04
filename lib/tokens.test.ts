import { beforeAll, describe, expect, it } from 'vitest'
import { ehFormatoDeToken, gerarToken, hashParaBanco, hashToken, hashesIguais } from './tokens'

beforeAll(() => {
  process.env.TOKEN_PEPPER = 'pepper-de-teste-nao-usar-em-lugar-nenhum'
})

describe('gerarToken', () => {
  it('gera 32 bytes em base64url, sem caractere que a URL precise escapar', () => {
    const token = gerarToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('não repete', () => {
    const amostra = new Set(Array.from({ length: 500 }, gerarToken))
    expect(amostra.size).toBe(500)
  })
})

describe('hashToken', () => {
  it('depende do pepper: sem a chave, um dump não permite testar candidatos', () => {
    const token = gerarToken()
    const comPepper = hashToken(token)
    process.env.TOKEN_PEPPER = 'outro-pepper'
    const comOutro = hashToken(token)
    process.env.TOKEN_PEPPER = 'pepper-de-teste-nao-usar-em-lugar-nenhum'
    expect(hashesIguais(comPepper, comOutro)).toBe(false)
  })

  it('é estável para o mesmo token', () => {
    const token = gerarToken()
    expect(hashesIguais(hashToken(token), hashToken(token))).toBe(true)
  })

  it('falha alto se o pepper não estiver configurado, em vez de gravar hash fraco', () => {
    const guardado = process.env.TOKEN_PEPPER
    delete process.env.TOKEN_PEPPER
    expect(() => hashToken('qualquer')).toThrow('TOKEN_PEPPER ausente')
    process.env.TOKEN_PEPPER = guardado
  })
})

describe('hashParaBanco', () => {
  it('sai no formato bytea que o Postgres aceita', () => {
    expect(hashParaBanco(gerarToken())).toMatch(/^\\x[0-9a-f]{64}$/)
  })
})

describe('ehFormatoDeToken', () => {
  it('aceita o que geramos', () => {
    expect(ehFormatoDeToken(gerarToken())).toBe(true)
  })

  it('recusa qualquer outra coisa, para a rota não virar oráculo de varredura', () => {
    expect(ehFormatoDeToken('')).toBe(false)
    expect(ehFormatoDeToken('curto')).toBe(false)
    expect(ehFormatoDeToken('a'.repeat(44))).toBe(false)
    expect(ehFormatoDeToken('a'.repeat(42) + '+')).toBe(false)
  })
})
