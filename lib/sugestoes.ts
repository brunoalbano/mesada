export type Sugestao = { motivo: string; emoji: string | null }

type Lancamento = { reason: string; emoji: string | null; created_at: string }

/**
 * Motivos usados recentemente, do mais recente para o mais antigo, com o
 * ícone da última vez em que cada um foi usado.
 *
 * Vem do histórico da própria criança, não de uma lista fixa: cada família
 * lança as mesmas poucas coisas repetidamente, e são coisas diferentes em cada
 * família. Uma lista pronta acertaria "Mesada" e erraria o resto.
 *
 * A comparação ignora caixa e acentuação para não sugerir "Mesada", "mesada" e
 * "MESADA" como três coisas.
 */
export function sugerirMotivos(lancamentos: Lancamento[], limite = 6): Sugestao[] {
  const vistos = new Map<string, Sugestao>()

  for (const lancamento of lancamentos) {
    const motivo = lancamento.reason.trim()
    if (motivo === '') continue

    const chave = normalizar(motivo)
    // O histórico chega do mais recente para o mais antigo, então a primeira
    // ocorrência é a mais nova, e é dela que sai o ícone.
    if (!vistos.has(chave)) {
      vistos.set(chave, { motivo, emoji: lancamento.emoji })
    }
    if (vistos.size >= limite) break
  }

  return [...vistos.values()]
}

export function normalizar(texto: string): string {
  return texto
    .trim()
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

/** Ícone já usado com esse motivo, para preencher sozinho ao digitar. */
export function emojiDoMotivo(sugestoes: Sugestao[], motivo: string): string | null {
  const chave = normalizar(motivo)
  if (chave === '') return null
  return sugestoes.find((s) => normalizar(s.motivo) === chave)?.emoji ?? null
}
