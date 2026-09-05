import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { clienteServidor } from '@/lib/supabase/server'
import { Cofrinho } from '@/components/Cofrinho'
import { BarraTopo } from '@/components/BarraTopo'
import { FormularioConvite } from './FormularioConvite'
import { BotaoSair } from './BotaoSair'
import { ListaCriancas } from './ListaCriancas'
import { ListaResponsaveis } from './ListaResponsaveis'

export default async function Familia({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await clienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/entrar')

  const t = await getTranslations('familia')

  // A RLS devolve zero linhas se este usuário não participa da família, então
  // não existe checagem de pertencimento no código: a ausência é o 404.
  const { data: familia } = await supabase
    .from('families')
    .select('id, name, currency')
    .eq('id', id)
    .maybeSingle()
  if (!familia) notFound()

  const { data: membros } = await supabase
    .from('family_members')
    .select('user_id, role, profiles(display_name)')
    .eq('family_id', id)
    .order('joined_at', { ascending: true })

  const souOwner = membros?.some((m) => m.user_id === user.id && m.role === 'owner') ?? false

  // `select *` não funciona em invites: o SELECT da tabela foi revogado para
  // esconder token_hash, e as demais colunas são concedidas uma a uma.
  const { data: convites } = souOwner
    ? await supabase
        .from('invites')
        .select('id, email, role, expires_at')
        .eq('family_id', id)
        .eq('kind', 'parent')
        .is('accepted_at', null)
        .is('revoked_at', null)
        .order('created_at', { ascending: false })
    : { data: [] }

  const { data: criancas } = await supabase
    .from('children')
    .select('id, name, avatar_key, archived_at')
    .eq('family_id', id)
    .order('archived_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: true })

  // Saldo de cada criança na própria lista: sem isto o responsável precisa
  // entrar em cada uma para responder "quanto cada um tem", que é a pergunta
  // mais frequente da tela.
  const { data: saldos } = await supabase
    .from('child_balances')
    .select('child_id, balance_cents')
    .in('child_id', (criancas ?? []).map((c) => c.id))

  const saldoPorCrianca = Object.fromEntries(
    (saldos ?? []).map((s) => [s.child_id, s.balance_cents]),
  )

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-5 py-8">
      <BarraTopo />
      <header className="flex items-center gap-3">
        <Cofrinho estado="pouco" className="h-12 w-12 shrink-0" />
        <h1 className="font-titulo text-2xl font-bold text-marca-escuro">{familia.name}</h1>
      </header>

      <ListaResponsaveis
        familyId={familia.id}
        souOwner={souOwner}
        meuId={user.id}
        membros={(membros ?? []).map((membro) => ({
          userId: membro.user_id,
          papel: membro.role,
          nome:
            (membro.profiles as unknown as { display_name: string } | null)?.display_name ?? '—',
        }))}
      />

      <ListaCriancas
        familyId={familia.id}
        criancas={criancas ?? []}
        saldos={saldoPorCrianca}
        moeda={familia.currency}
      />

      {souOwner && <FormularioConvite familyId={familia.id} convites={convites ?? []} />}

      <BotaoSair familyId={familia.id} />
    </main>
  )
}
