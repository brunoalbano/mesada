import { notFound, redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { clienteServidor } from '@/lib/supabase/server'
import { formatarCentavos } from '@/lib/money'
import { Avatar } from '@/components/Avatar'
import { BarraTopo } from '@/components/BarraTopo'
import { Cofrinho, estadoPorProgresso } from '@/components/Cofrinho'
import { sugerirMotivos } from '@/lib/sugestoes'
import { FormularioLancamento } from './FormularioLancamento'
import { Historico } from './Historico'
import { PainelMeta } from './PainelMeta'
import { PainelAcesso } from './PainelAcesso'
import { BotaoArquivar } from './BotaoArquivar'

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
    .select(
      'id, name, avatar_key, ui_mode, archived_at, family_id, families(name, currency, timezone)',
    )
    .eq('id', id)
    .maybeSingle()
  if (!crianca) notFound()

  const familia = crianca.families as unknown as {
    name: string
    currency: string
    timezone: string
  } | null
  const moeda = familia?.currency ?? 'BRL'
  const pequeno = crianca.ui_mode === 'pequeno'

  const [{ data: saldo }, { data: metas }, { data: lancamentos }] = await Promise.all([
    supabase.from('child_balances').select('balance_cents').eq('child_id', id).maybeSingle(),
    // Ativa e alcançada são coisas diferentes e aparecem juntas: a conquista
    // continua visível, e o formulário de criar a próxima aparece assim que
    // não há meta ativa. Sem isso a criança que alcançava a meta ficava presa
    // no troféu antigo, sem como começar outra.
    supabase
      .from('goals')
      .select('id, title, emoji, target_cents, status, reached_at')
      .eq('child_id', id)
      .in('status', ['active', 'reached'])
      .order('reached_at', { ascending: false, nullsFirst: false })
      .limit(2),
    supabase
      .from('transactions')
      .select('id, amount_cents, reason, emoji, created_at, created_by_name, reverses_id')
      .eq('child_id', id)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  const metaAtiva = (metas ?? []).find((m) => m.status === 'active') ?? null
  const metaAlcancada = (metas ?? []).find((m) => m.status === 'reached') ?? null
  const meta = metaAtiva ?? metaAlcancada

  const centavos = saldo?.balance_cents ?? 0
  // Meta alcançada mostra 100% mesmo se o saldo caiu depois: a conquista
  // congelou, e o cofrinho tem de contar a mesma história que o banco.
  const progresso =
    meta?.status === 'reached'
      ? 1
      : meta
        ? Math.min(centavos / meta.target_cents, 1)
        : centavos > 0
          ? 0.5
          : 0

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
      <BarraTopo />

      <header className="flex flex-col gap-2">
        {/* Voltar explícito, e não só o gesto do navegador: instalado como
            PWA não existe barra de endereços, e o gesto de voltar do sistema
            some junto. */}
        {souResponsavel && (
          <a
            href={`/familias/${crianca.family_id}`}
            className="botao -ml-2 flex items-center gap-1 self-start rounded-2xl px-2 py-2 text-sm font-bold text-marca-escuro"
          >
            <span aria-hidden className="text-lg">
              ‹
            </span>
            {familia?.name ?? t('voltar')}
          </a>
        )}
        <div className="flex items-center gap-3">
          <Avatar chave={crianca.avatar_key} nome={crianca.name} />
          <h1 className="font-titulo text-2xl font-bold text-marca-escuro">{crianca.name}</h1>
          {crianca.archived_at && (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
              {t('arquivada')}
            </span>
          )}
        </div>
      </header>

      <section className="flex flex-col items-center gap-2 rounded-3xl bg-white p-6 shadow-sm">
        <Cofrinho
          estado={estadoPorProgresso(progresso)}
         
          className={pequeno ? 'h-28 w-28' : 'h-16 w-16'}
        />
        <p className="text-sm font-semibold text-slate-500">
          {pequeno ? t('saldo') : t('saldoGrande')}
        </p>
        <p className={`font-titulo font-bold ${pequeno ? 'text-5xl' : 'text-4xl'}`}>
          {formatarCentavos(centavos, idioma, moeda)}
        </p>
      </section>

      {/* Meta existente fica junto do saldo: ali ela é status, e é a primeira
          coisa que a criança quer ver. O formulário de criação vai depois do
          lançamento, porque criar meta é tarefa ocasional do responsável, e
          lançar é o que ele faz toda semana. */}
      {meta && (
        <PainelMeta
          childId={crianca.id}
          meta={meta}
          saldoCentavos={centavos}
          moeda={moeda}
          podeEditar={Boolean(souResponsavel)}
          pequeno={pequeno}
        />
      )}

      {souResponsavel && (
        <FormularioLancamento
          childId={crianca.id}
          arquivada={Boolean(crianca.archived_at)}
          pequeno={pequeno}
          sugestoes={sugerirMotivos(lancamentos ?? [])}
        />
      )}

      {/* Sem meta ATIVA, o formulário aparece — mesmo que uma alcançada esteja
          na tela acima. O índice único do banco só cobre metas ativas, então
          criar a próxima é legítimo e é o passo natural depois de conseguir. */}
      {!metaAtiva && (
        <PainelMeta
          childId={crianca.id}
          meta={null}
          saldoCentavos={centavos}
          moeda={moeda}
          podeEditar={Boolean(souResponsavel)}
          pequeno={pequeno}
        />
      )}

      {souResponsavel && (
        <PainelAcesso childId={crianca.id} nome={crianca.name} contas={contas ?? []} />
      )}

      <Historico
        childId={crianca.id}
        lancamentos={lancamentos ?? []}
        moeda={moeda}
        podeEstornar={Boolean(souResponsavel)}
        pequeno={pequeno}
        fuso={familia?.timezone ?? 'America/Sao_Paulo'}
      />

      {souResponsavel && (
        <BotaoArquivar
          childId={crianca.id}
          familyId={crianca.family_id}
          arquivada={Boolean(crianca.archived_at)}
        />
      )}
    </main>
  )
}
