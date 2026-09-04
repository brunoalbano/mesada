'use client'

import { useActionState, useState } from 'react'
import { useTranslations } from 'next-intl'
import { AVATARES, Avatar } from '@/components/Avatar'
import { criarCrianca, type ResultadoCrianca } from './acoes'

const INICIAL: ResultadoCrianca = { ok: true }

type Crianca = { id: string; name: string; avatar_key: string; archived_at: string | null }

export function ListaCriancas({
  familyId,
  criancas,
}: {
  familyId: string
  criancas: Crianca[]
}) {
  const t = useTranslations('criancas')
  const tComum = useTranslations('comum')
  const [resultado, enviar, pendente] = useActionState(criarCrianca, INICIAL)
  const [avatar, setAvatar] = useState<string>(AVATARES[0])

  const erro = !resultado.ok
    ? resultado.erro === 'invalido'
      ? t('nomeInvalido')
      : tComum('erroInesperado')
    : null

  return (
    <section className="flex flex-col gap-4 rounded-3xl bg-white p-5 shadow-sm">
      <h2 className="font-titulo text-lg font-bold">{t('titulo')}</h2>

      {criancas.length === 0 ? (
        <p className="py-2 text-sm text-slate-500">{t('nenhuma')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {/* A linha inteira é o link, com seta no fim: sem isso não ficava
              claro que tocar no nome abre a mesada da criança. Arquivar saiu
              daqui e foi para a página da própria criança, onde é decisão
              deliberada e não um botão ao lado do caminho principal. */}
          {criancas.map((crianca) => (
            <li key={crianca.id}>
              <a
                href={`/criancas/${crianca.id}`}
                className="botao flex items-center gap-3 rounded-2xl px-2 py-2 active:bg-marca-claro"
              >
                <Avatar chave={crianca.avatar_key} nome={crianca.name} />
                <span className="flex flex-1 flex-col">
                  <span className="font-semibold">{crianca.name}</span>
                  {crianca.archived_at && (
                    <span className="text-xs text-slate-500">{t('arquivada')}</span>
                  )}
                </span>
                <span aria-hidden className="text-2xl text-slate-300">
                  ›
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}

      <form action={enviar} className="flex flex-col gap-3 border-t border-slate-100 pt-4">
        <input type="hidden" name="familyId" value={familyId} />
        <input type="hidden" name="avatar" value={avatar} />

        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-slate-700">{t('nome')}</span>
          <input
            name="nome"
            required
            maxLength={40}
            placeholder={t('nomePlaceholder')}
            className="min-h-12 rounded-2xl border-2 border-slate-200 px-4 text-base outline-none focus:border-marca"
          />
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold text-slate-700">{t('avatar')}</legend>
          <div className="flex flex-wrap gap-2">
            {AVATARES.map((chave) => (
              <button
                key={chave}
                type="button"
                aria-pressed={avatar === chave}
                onClick={() => setAvatar(chave)}
                className={`rounded-full ${avatar === chave ? 'ring-2 ring-marca' : ''}`}
              >
                <Avatar chave={chave} nome={chave} />
              </button>
            ))}
          </div>
        </fieldset>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-slate-700">{t('nascimento')}</span>
          <input
            name="nascimento"
            type="date"
            className="min-h-12 rounded-2xl border-2 border-slate-200 px-4 text-base outline-none focus:border-marca"
          />
        </label>

        {erro && (
          <p role="alert" className="text-sm font-semibold text-saida">
            {erro}
          </p>
        )}

        <button
          type="submit"
          disabled={pendente}
          className="rounded-2xl bg-marca px-5 py-3 text-base font-bold text-white disabled:opacity-60"
        >
          {pendente ? t('adicionando') : t('adicionar')}
        </button>
      </form>
    </section>
  )
}
