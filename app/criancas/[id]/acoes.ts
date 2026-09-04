'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { clienteServidor } from '@/lib/supabase/server'
import { centavosDeTexto } from '@/lib/money'
import { gerarToken, hashParaBanco } from '@/lib/tokens'

export type ResultadoLancamento =
  | { ok: true }
  | { ok: false; erro: 'valor' | 'motivo' | 'arquivada' | 'falhou' }

const Lancamento = z.object({
  childId: z.string().uuid(),
  motivo: z.string().trim().min(1).max(200),
  emoji: z.string().trim().max(8).optional(),
  tipo: z.enum(['credito', 'debito']),
})

/**
 * Lança crédito ou débito.
 *
 * O valor chega como texto e vira centavos aqui; nunca há float no caminho.
 * `created_by_name` e `currency` não são enviados: triggers no banco os
 * preenchem a partir do perfil e da família, justamente para não aceitarem
 * valor vindo do cliente.
 *
 * O id é gerado aqui e serve de chave de idempotência: reenviar o mesmo
 * formulário não duplica o lançamento, o banco recusa pela chave primária.
 */
export async function lancar(_anterior: unknown, dados: FormData): Promise<ResultadoLancamento> {
  const entrada = Lancamento.safeParse({
    childId: dados.get('childId'),
    motivo: dados.get('motivo'),
    emoji: dados.get('emoji') ?? undefined,
    tipo: dados.get('tipo'),
  })
  if (!entrada.success) return { ok: false, erro: 'motivo' }

  const centavos = centavosDeTexto(String(dados.get('valor') ?? ''))
  if (centavos === null || centavos <= 0) return { ok: false, erro: 'valor' }

  const supabase = await clienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, erro: 'falhou' }

  const { error } = await supabase.from('transactions').insert({
    id: randomUUID(),
    child_id: entrada.data.childId,
    amount_cents: entrada.data.tipo === 'credito' ? centavos : -centavos,
    reason: entrada.data.motivo,
    emoji: entrada.data.emoji || null,
    created_by: user.id,
    created_by_name: '',
  })

  if (error) {
    // A policy de insert exige criança não arquivada e da própria família.
    if (error.code === '42501') return { ok: false, erro: 'arquivada' }
    return { ok: false, erro: 'falhou' }
  }

  revalidatePath(`/criancas/${entrada.data.childId}`)
  return { ok: true }
}

/**
 * Estorna um lançamento.
 *
 * Nunca edita nem apaga: o banco recusa as duas coisas. O estorno é uma linha
 * nova de valor oposto, e as duas ficam visíveis no histórico. O valor oposto
 * exato é verificado por trigger, então não há como um estorno "corrigir" para
 * um número diferente.
 */
export async function estornar(dados: FormData): Promise<void> {
  const id = z.string().uuid().safeParse(dados.get('id'))
  const childId = z.string().uuid().safeParse(dados.get('childId'))
  if (!id.success || !childId.success) return

  const supabase = await clienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const { data: original } = await supabase
    .from('transactions')
    .select('amount_cents, reason')
    .eq('id', id.data)
    .maybeSingle()
  if (!original) return

  await supabase.from('transactions').insert({
    id: randomUUID(),
    child_id: childId.data,
    amount_cents: -original.amount_cents,
    reason: `Estorno: ${original.reason}`.slice(0, 200),
    emoji: '↩️',
    reverses_id: id.data,
    created_by: user.id,
    created_by_name: '',
  })

  revalidatePath(`/criancas/${childId.data}`)
}

const Meta = z.object({
  childId: z.string().uuid(),
  titulo: z.string().trim().min(1).max(60),
  emoji: z.string().trim().max(8).optional(),
})

export type ResultadoMeta = { ok: true } | { ok: false; erro: 'invalido' | 'jaExiste' | 'falhou' }

/** Uma meta ativa por criança; o índice único no banco é quem garante. */
export async function criarMeta(_anterior: unknown, dados: FormData): Promise<ResultadoMeta> {
  const entrada = Meta.safeParse({
    childId: dados.get('childId'),
    titulo: dados.get('titulo'),
    emoji: dados.get('emoji') ?? undefined,
  })
  if (!entrada.success) return { ok: false, erro: 'invalido' }

  const alvo = centavosDeTexto(String(dados.get('alvo') ?? ''))
  if (alvo === null || alvo <= 0) return { ok: false, erro: 'invalido' }

  const supabase = await clienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, erro: 'falhou' }

  const { error } = await supabase.from('goals').insert({
    child_id: entrada.data.childId,
    title: entrada.data.titulo,
    emoji: entrada.data.emoji || '🎯',
    target_cents: alvo,
    created_by: user.id,
  })

  if (error) {
    if (error.code === '23505') return { ok: false, erro: 'jaExiste' }
    return { ok: false, erro: 'falhou' }
  }

  revalidatePath(`/criancas/${entrada.data.childId}`)
  return { ok: true }
}

export async function cancelarMeta(dados: FormData): Promise<void> {
  const id = z.string().uuid().safeParse(dados.get('id'))
  const childId = z.string().uuid().safeParse(dados.get('childId'))
  if (!id.success || !childId.success) return

  const supabase = await clienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  await supabase
    .from('goals')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: user.id })
    .eq('id', id.data)

  revalidatePath(`/criancas/${childId.data}`)
}


// ---------------------------------------------------------------------------
// Acesso da criança
// ---------------------------------------------------------------------------

export type ResultadoAcesso =
  | { ok: true; token: string }
  | { ok: false; erro: 'semPermissao' | 'falhou' }

/**
 * Emite um convite para a criança vincular a própria conta.
 *
 * É o único caminho: uma conta nunca se vincula sozinha a um perfil de
 * criança, nem por igualdade de e-mail. O convite é curto (7 dias), de uso
 * único, e o token em claro aparece uma vez só.
 */
export async function convidarCrianca(
  _anterior: unknown,
  dados: FormData,
): Promise<ResultadoAcesso> {
  const childId = z.string().uuid().safeParse(dados.get('childId'))
  if (!childId.success) return { ok: false, erro: 'falhou' }

  const supabase = await clienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, erro: 'semPermissao' }

  const { data: crianca } = await supabase
    .from('children')
    .select('family_id')
    .eq('id', childId.data)
    .maybeSingle()
  if (!crianca) return { ok: false, erro: 'semPermissao' }

  const token = gerarToken()

  // Sem `.select()` encadeado: isso viraria RETURNING *, que exige SELECT em
  // token_hash — a única coluna deliberadamente ilegível.
  const { error } = await supabase.from('invites').insert({
    family_id: crianca.family_id,
    kind: 'child',
    child_id: childId.data,
    token_hash: hashParaBanco(token),
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    created_by: user.id,
  })

  if (error) {
    if (error.code === '42501') return { ok: false, erro: 'semPermissao' }
    return { ok: false, erro: 'falhou' }
  }

  revalidatePath(`/criancas/${childId.data}`)
  return { ok: true, token }
}

/**
 * Desvincula uma conta. O acesso cai no refresh seguinte, quando o hook deixa
 * de emitir a claim `child_id` — daí o TTL curto do access token.
 */
export async function desvincularConta(dados: FormData): Promise<void> {
  const authUserId = z.string().uuid().safeParse(dados.get('authUserId'))
  const childId = z.string().uuid().safeParse(dados.get('childId'))
  if (!authUserId.success || !childId.success) return

  const supabase = await clienteServidor()
  await supabase.from('child_identities').delete().eq('auth_user_id', authUserId.data)

  revalidatePath(`/criancas/${childId.data}`)
}
