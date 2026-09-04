'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { clienteServidor } from '@/lib/supabase/server'
import { resolverIdioma } from '@/lib/i18n'

export type ResultadoAcao = { ok: true } | { ok: false; erro: 'invalido' | 'falhou' }

const NomeFamilia = z.string().trim().min(1).max(60)

/**
 * Criar família insere também a linha de family_members do criador. Isso não é
 * expressável como policy segura com o cliente do usuário — a única checagem
 * possível seria `user_id = auth.uid()`, que deixaria qualquer autenticado se
 * inserir em qualquer família. Por isso vai por função SECURITY DEFINER.
 */
export async function criarFamilia(_anterior: unknown, dados: FormData): Promise<ResultadoAcao> {
  const nome = NomeFamilia.safeParse(dados.get('nome'))
  if (!nome.success) return { ok: false, erro: 'invalido' }

  const supabase = await clienteServidor()
  const { error } = await supabase.rpc('create_family', {
    p_name: nome.data,
    p_locale: await resolverIdioma(),
  })

  if (error) return { ok: false, erro: 'falhou' }

  revalidatePath('/')
  return { ok: true }
}
