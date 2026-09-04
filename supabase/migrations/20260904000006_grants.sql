-- Mesada — privilegios de tabela explicitos
--
-- Por que esta migration existe: as anteriores nunca concederam privilegio a
-- anon nem a authenticated. Localmente isso passava, porque o shim de teste
-- fazia ALTER DEFAULT PRIVILEGES imitando o Supabase. No projeto real as
-- tabelas nasceram sem privilegio nenhum, e toda leitura respondia
--
--   42501  permission denied for table families
--
-- ou seja, a aplicacao inteira estaria fora do ar. Privilegio de tabela e
-- checado ANTES da RLS: sem GRANT, a policy nunca chega a ser avaliada.
--
-- A licao registrada: a migration tem de ser dona dos proprios privilegios,
-- e nao herdar configuracao de plataforma. O shim de teste deixou de conceder
-- por padrao, para que a suite prove o que esta aqui.

grant usage on schema public to anon, authenticated;

-- Somente authenticated. O role anon e a requisicao sem sessao, e nenhuma
-- policy deste esquema pode ser satisfeita sem auth.uid() ou sem a claim
-- child_id — inclusive a sessao da crianca por link, que e uma sessao
-- anonima do Auth e chega como authenticated, nao como anon.
grant select, insert, update, delete on
  profiles, families, family_members, children, transactions, goals
  to authenticated;

grant select on child_balances to authenticated;

-- Repete os revokes das migrations anteriores. Eles rodaram contra privilegios
-- que talvez nem existissem, entao o GRANT acima poderia ter reaberto o que
-- eles fecharam. Revogar de novo e barato e torna o estado final explicito.
revoke insert, update on child_identities from anon, authenticated;
revoke insert         on family_members   from anon, authenticated;
revoke update, delete on transactions     from anon, authenticated;

-- DELETE fica: e o unico caminho para o responsavel desvincular a conta de um
-- filho. Revogar aqui tornaria a policy child_identities_delete codigo morto,
-- e o acesso por conta viraria irrevogavel.
grant select, delete on child_identities to authenticated;

-- token_hash e a credencial em si. Nenhuma sessao de usuario a le: a aplicacao
-- deriva o hash do token que veio na URL. Como o privilegio de tabela inteira
-- prevalece sobre o de coluna, o SELECT da tabela fica de fora e as colunas
-- sao concedidas uma a uma.
revoke select on invites, access_tokens from anon, authenticated;

grant select (id, child_id, label, can_request, expires_at, revoked_at,
              last_used_at, created_by, created_at)
  on access_tokens to authenticated;
grant insert, update, delete on access_tokens to authenticated;

grant select (id, family_id, kind, child_id, email, role, expires_at,
              accepted_at, accepted_by, revoked_at, created_by, created_at)
  on invites to authenticated;
grant insert, update, delete on invites to authenticated;

-- Fica fechada: so o service_role e as funcoes definer a tocam.
revoke all on token_exchange_attempts from anon, authenticated;
