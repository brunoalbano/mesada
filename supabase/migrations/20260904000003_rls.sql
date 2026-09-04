-- Mesada — Row Level Security
-- Ver docs/architecture.md secao 4.4.
--
-- Postgres nao liga RLS sozinho. Uma migration que cria as tabelas e para ai
-- expoe tudo pelo PostgREST com a chave anon, que e publica.
--
-- Atencao ao desenho: o sign-in anonimo fica habilitado no projeto para o
-- fluxo do link da crianca funcionar, e sessao anonima tem role
-- 'authenticated' com auth.uid() NAO nulo. Logo, nenhuma policy pode se
-- apoiar em "esta logado". Toda policy se apoia em pertencimento a familia
-- ou na claim child_id.

alter table profiles         enable row level security;
alter table families         enable row level security;
alter table family_members   enable row level security;
alter table children         enable row level security;
alter table child_identities enable row level security;
alter table access_tokens    enable row level security;
alter table invites          enable row level security;
alter table transactions     enable row level security;
alter table goals            enable row level security;

-- child_identities e a unica entrada do hook que emite a claim child_id.
-- Escrita ali equivale a causar um JWT legitimo com o child_id de outra
-- crianca. So a rota de troca (service_role) e funcoes definer escrevem.
-- Cuidado dobrado aqui. Privilegio de tabela e checado ANTES da RLS, entao
-- todo revoke a mais transforma a policy correspondente em codigo morto:
--   * "revoke all" tirava o SELECT, e o pai nao via os proprios links;
--   * revogar DELETE em child_identities tornava impossivel desvincular a
--     conta Google de um filho, ou seja, acesso permanente e irrevogavel;
--   * revogar UPDATE em family_members impedia transferir a propriedade da
--     familia, e com isso o ultimo owner nunca conseguia sair.
-- Revogar apenas o que nenhuma sessao de usuario pode fazer por caminho
-- nenhum, e deixar a RLS decidir o resto.
revoke insert, update on child_identities from anon, authenticated;
revoke insert         on family_members   from anon, authenticated;
revoke update, delete on transactions     from anon, authenticated;

-- token_hash e a credencial em si. Nenhuma sessao de usuario tem motivo para
-- le-la: a aplicacao deriva o hash do token que veio na URL. Sem isto, qualquer
-- membro lia o hash do convite de owner e escalava para owner.
--
-- Revogar a coluna nao basta enquanto existe o SELECT de tabela inteira: o
-- privilegio mais amplo prevalece. E preciso tirar o SELECT da tabela e
-- conceder coluna a coluna. Consequencia para a aplicacao: "select *" nestas
-- duas tabelas passa a falhar, e as colunas tem de ser listadas.
revoke select on invites, access_tokens from anon, authenticated;

grant select (id, child_id, label, can_request, expires_at, revoked_at,
              last_used_at, created_by, created_at)
  on access_tokens to authenticated;

grant select (id, family_id, kind, child_id, email, role, expires_at,
              accepted_at, accepted_by, revoked_at, created_by, created_at)
  on invites to authenticated;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create policy profiles_select on profiles for select
  using (user_id = auth.uid() or app.shares_family_with(user_id));

create policy profiles_update on profiles for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- families
-- Sem policy de insert: criar familia grava tambem a propria linha de
-- family_members, o que so e seguro por funcao definer (migration 0004).
-- ---------------------------------------------------------------------------
create policy families_select on families for select
  using (app.is_family_member(id));

create policy families_update on families for update
  using (app.is_family_owner(id)) with check (app.is_family_owner(id));

create policy families_delete on families for delete
  using (app.is_family_owner(id));

-- ---------------------------------------------------------------------------
-- family_members
-- Sem policy de insert, deliberadamente. A unica checagem possivel com o
-- cliente do proprio usuario seria user_id = auth.uid(), que deixaria
-- qualquer autenticado, inclusive um anonimo, se inserir em qualquer familia.
-- Aceitar convite passa por funcao definer.
-- ---------------------------------------------------------------------------
create policy family_members_select on family_members for select
  using (app.is_family_member(family_id));

create policy family_members_update on family_members for update
  using (app.is_family_owner(family_id)) with check (app.is_family_owner(family_id));

-- Sair da familia, ou o owner removendo alguem.
create policy family_members_delete on family_members for delete
  using (user_id = auth.uid() or app.is_family_owner(family_id));

-- ---------------------------------------------------------------------------
-- children
-- ---------------------------------------------------------------------------
create policy children_select on children for select
  using (id = app.current_child_id() or app.is_family_member(family_id));

create policy children_insert on children for insert
  with check (app.is_family_member(family_id));

create policy children_update on children for update
  using (app.is_family_member(family_id)) with check (app.is_family_member(family_id));

-- ---------------------------------------------------------------------------
-- child_identities e access_tokens
-- Leitura e revogacao pelo responsavel; criacao so por definer/service_role.
-- ---------------------------------------------------------------------------
create policy child_identities_select on child_identities for select
  using (app.is_family_parent(child_id));

-- Desvincular a conta de um filho. E o unico caminho de revogacao de uma
-- identidade que nao veio de link.
create policy child_identities_delete on child_identities for delete
  using (app.is_family_parent(child_id));

create policy access_tokens_select on access_tokens for select
  using (app.is_family_parent(child_id));

create policy access_tokens_insert on access_tokens for insert
  with check (app.is_active_family_child(child_id) and created_by = auth.uid());

create policy access_tokens_update on access_tokens for update
  using (app.is_family_parent(child_id))
  with check (app.is_family_parent(child_id) and created_by = auth.uid());

create policy access_tokens_delete on access_tokens for delete
  using (app.is_family_parent(child_id));

-- ---------------------------------------------------------------------------
-- invites
-- ---------------------------------------------------------------------------
-- Convite e assunto de quem administra a familia.
create policy invites_select on invites for select
  using (app.is_family_owner(family_id));

create policy invites_insert on invites for insert
  with check (app.is_family_owner(family_id) and created_by = auth.uid());

create policy invites_update on invites for update
  using (app.is_family_owner(family_id)) with check (app.is_family_owner(family_id));

create policy invites_delete on invites for delete
  using (app.is_family_owner(family_id));

-- ---------------------------------------------------------------------------
-- transactions
-- Nenhuma policy de update ou delete: sem policy, a operacao e negada.
-- created_by e fixado no chamador, senao a autoria de um razao imutavel
-- seria forjavel por um responsavel contra o outro.
-- ---------------------------------------------------------------------------
create policy transactions_select on transactions for select
  using (child_id = app.current_child_id() or app.is_family_parent(child_id));

create policy transactions_insert on transactions for insert
  with check (app.is_active_family_child(child_id) and created_by = auth.uid());

-- ---------------------------------------------------------------------------
-- goals
-- So o responsavel escreve; a crianca acompanha. Decisao 8.3.
-- ---------------------------------------------------------------------------
create policy goals_select on goals for select
  using (child_id = app.current_child_id() or app.is_family_parent(child_id));

create policy goals_insert on goals for insert
  with check (app.is_active_family_child(child_id) and created_by = auth.uid());

create policy goals_update on goals for update
  using (app.is_family_parent(child_id))
  with check (app.is_family_parent(child_id) and created_by = auth.uid());

create policy goals_delete on goals for delete
  using (app.is_family_parent(child_id));
