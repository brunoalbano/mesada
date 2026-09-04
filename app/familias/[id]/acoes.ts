'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { clienteServidor } from '@/lib/supabase/server'
import { gerarToken, hashParaBanco } from '@/lib/tokens'

export type ResultadoConvite =
  | { ok: true; token: string }
  | { ok: false; erro: 'invalido' | 'semPermissao' | 'jaConvidado' | 'falhou' }

const Convite = z.object({
  familyId: z.string().uuid(),
  email: z.string().trim().email().optional().or(z.literal('')),
  papel: z.enum(['owner', 'parent']),
})

/**
 * Emite um convite de responsável.
 *
 * O token em claro é devolvido UMA vez, para ser mostrado a quem convidou. O
 * banco fica só com o HMAC, então nem nós conseguimos reconstruir o link
 * depois — se a pessoa perder, o caminho é revogar e emitir outro.
 *
 * Validade de 7 dias, e não os 365 de antes: este convite dá escrita nas
 * finanças da família e o poder de convidar mais gente.
 */
export async function convidarResponsavel(
  _anterior: unknown,
  dados: FormData,
): Promise<ResultadoConvite> {
  const entrada = Convite.safeParse({
    familyId: dados.get('familyId'),
    email: dados.get('email') ?? '',
    papel: dados.get('papel') ?? 'parent',
  })
  if (!entrada.success) return { ok: false, erro: 'invalido' }

  const supabase = await clienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, erro: 'semPermissao' }

  const token = gerarToken()
  const expira = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  const { error } = await supabase.from('invites').insert({
    family_id: entrada.data.familyId,
    kind: 'parent',
    role: entrada.data.papel,
    email: entrada.data.email || null,
    token_hash: hashParaBanco(token),
    expires_at: expira,
    created_by: user.id,
  })

  if (error) {
    // Índice único de convite pendente por endereço, por família.
    if (error.code === '23505') return { ok: false, erro: 'jaConvidado' }
    // A policy de insert exige `owner`; sem ele o Postgres devolve 42501.
    if (error.code === '42501') return { ok: false, erro: 'semPermissao' }
    return { ok: false, erro: 'falhou' }
  }

  revalidatePath(`/familias/${entrada.data.familyId}`)
  return { ok: true, token }
}

/**
 * Revogar é `update` na própria linha, não `delete`: o convite cancelado
 * continua no histórico da família, e o índice de convite pendente por
 * endereço já ignora quem tem `revoked_at`.
 *
 * Usada como action de formulário simples, sem estado anterior, por isso a
 * assinatura recebe só o FormData.
 */
export async function revogarConvite(dados: FormData): Promise<void> {
  const id = z.string().uuid().safeParse(dados.get('id'))
  const familyId = z.string().uuid().safeParse(dados.get('familyId'))
  if (!id.success || !familyId.success) return

  const supabase = await clienteServidor()
  await supabase
    .from('invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id.data)

  revalidatePath(`/familias/${familyId.data}`)
}

/**
 * Sair da família. O último `owner` é recusado pelo banco, com mensagem
 * própria: sair sem transferir deixaria a família órfã, sem ninguém capaz de
 * convidar, remover ou apagar.
 */
export async function sairDaFamilia(_anterior: unknown, dados: FormData) {
  const familyId = z.string().uuid().safeParse(dados.get('familyId'))
  if (!familyId.success) return { ok: false as const, erro: 'invalido' as const }

  const supabase = await clienteServidor()
  const { error } = await supabase.rpc('leave_family', { p_family_id: familyId.data })

  if (error) {
    return { ok: false as const, erro: 'ultimoOwner' as const }
  }

  revalidatePath('/')
  return { ok: true as const }
}
