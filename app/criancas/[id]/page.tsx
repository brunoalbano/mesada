import { notFound, redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { clienteServidor } from '@/lib/supabase/server'
import { formatarCentavos } from '@/lib/money'
import { Avatar } from '@/components/Avatar'
import { Cofrinho, estadoPorProgresso } from '@/components/Cofrinho'
import { FormularioLancamento } from './FormularioLancamento'
import { Historico } from './Historico'
import { PainelMeta } from './PainelMeta'
import { PainelAcesso } from './PainelAcesso'

export default async function Crianca({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await clienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/entrar')

  const t = await getTranslations('crianca')
  const idioma = await getLocale()

  // A RLS resolve o acesso: responsável da família, ou a própria criança pela
  // claim child_id. Ausência de linha é 404, sem checagem no código.
  const { data: crianca } = await supabase
    .from('children')
    .select('id, name, avatar_key, ui_mode, archived_at, family_id, families(currency)')
    .eq('id', id)
    .maybeSingle()
  if (!crianca) notFound()

  const moeda = (crianca.families as unknown as { currency: string } | null)?.currency ?? 'BRL'
  const pequeno = crianca.ui_mode === 'pequeno'

  const [{ data: saldo }, { data: meta }, { data: lancamentos }] = await Promise.all([
    supabase.from('child_balances').select('balance_cents').eq('child_id', id).maybeSingle(),
    supabase
      .from('goals')
      .select('id, title, emoji, target_cents, status, reached_at')
      .eq('child_id', id)
      .eq('status', 'active')
      .maybeSingle(),
    supabase
      .from('transactions')
      .select('id, amount_cents, reason, emoji, created_at, created_by_name, reverses_id')
      .eq('child_id', id)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  const centavos = saldo?.balance_cents ?? 0
  const progresso = meta ? Math.min(centavos / meta.target_cents, 1) : centavos > 0 ? 0.5 : 0

  // Quem é responsável enxerga a própria linha em family_members; a criança não.
  const { data: souResponsavel } = await supabase
    .from('family_members')
    .select('user_id')
    .eq('family_id', crianca.family_id)
    .eq('user_id', user.id)
    .maybeSingle()

  const { data: contas } = souResponsavel
    ? await supabase
        .from('child_identities')
        .select('auth_user_id, provider, linked_at')
        .eq('child_id', id)
        .is('revoked_at', null)
    : { data: [] }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-5 py-8">
      <header className="flex items-center gap-3">
        <Avatar chave={crianca.avatar_key} nome={crianca.name} />
        <h1 className="font-titulo text-2xl font-bold text-marca-escuro">{crianca.name}</h1>
      </header>

      <section className="flex flex-col items-center gap-2 rounded-3xl bg-white p-6 shadow-sm">
        <Cofrinho
          estado={estadoPorProgresso(progresso)}
          rotulo=""
          className={pequeno ? 'h-28 w-28' : 'h-16 w-16'}
        />
        <p className="text-sm font-semibold text-slate-500">
          {pequeno ? t('saldo') : t('saldoGrande')}
        </p>
        <p className={`font-titulo font-bold ${pequeno ? 'text-5xl' : 'text-4xl'}`}>
          {formatarCentavos(centavos, idioma, moeda)}
        </p>
      </section>

      <PainelMeta
        childId={crianca.id}
        meta={meta ?? null}
        saldoCentavos={centavos}
        moeda={moeda}
        podeEditar={Boolean(souResponsavel)}
      />

      {souResponsavel && (
        <FormularioLancamento childId={crianca.id} arquivada={Boolean(crianca.archived_at)} />
      )}

      {souResponsavel && (
        <PainelAcesso childId={crianca.id} nome={crianca.name} contas={contas ?? []} />
      )}

      <Historico
        childId={crianca.id}
        lancamentos={lancamentos ?? []}
        moeda={moeda}
        podeEstornar={Boolean(souResponsavel)}
      />
    </main>
  )
}
