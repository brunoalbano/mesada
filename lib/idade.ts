export type ModoInterface = 'pequeno' | 'grande'

/**
 * Modo Pequeno até os 8 anos, Modo Grande a partir dos 9.
 *
 * Sem data de nascimento, o padrão é o Pequeno: errar para o lado da interface
 * mais simples incomoda menos do que o contrário. O responsável sobrescreve em
 * `children.ui_mode` quando quiser.
 */
export function modoPorNascimento(nascimento: string | null, hoje = new Date()): ModoInterface {
  if (!nascimento) return 'pequeno'
  return idadeEm(nascimento, hoje) >= 9 ? 'grande' : 'pequeno'
}

export function idadeEm(nascimento: string, hoje = new Date()): number {
  const nasceu = new Date(`${nascimento}T00:00:00Z`)
  if (Number.isNaN(nasceu.getTime())) return 0

  let idade = hoje.getUTCFullYear() - nasceu.getUTCFullYear()
  const mes = hoje.getUTCMonth() - nasceu.getUTCMonth()
  if (mes < 0 || (mes === 0 && hoje.getUTCDate() < nasceu.getUTCDate())) idade -= 1
  return Math.max(idade, 0)
}
