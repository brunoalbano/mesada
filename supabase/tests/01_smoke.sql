-- Mesada — suite de fumaca do banco
-- Roda com scripts/db-test.sh. Prova as garantias que os documentos afirmam:
-- isolamento entre familias, razao imutavel, estorno correto, ciclo da meta,
-- e validade do link.

\set ON_ERROR_STOP on
\timing off

create or replace function test_fails(p_sql text) returns boolean
language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when others then
  return true;
end $$;

create or replace function test_ok(p_cond boolean, p_name text) returns void
language plpgsql as $$
begin
  if p_cond then
    raise notice 'ok    %', p_name;
  else
    raise exception 'FALHOU: %', p_name;
  end if;
end $$;

-- ===========================================================================
-- Cenario
-- Familia A: pais A1 (owner) e A2. Criancas Ana e Joao.
-- Familia B: pai B1. Crianca Beto.
-- ===========================================================================
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'a1@example.test', '{"full_name":"Pai A1"}'),
  ('22222222-2222-2222-2222-222222222222', 'a2@example.test', '{"full_name":"Pai A2"}'),
  ('33333333-3333-3333-3333-333333333333', 'b1@example.test', '{"full_name":"Pai B1"}');
insert into auth.users (id, is_anonymous) values
  ('44444444-4444-4444-4444-444444444444', true),
  ('55555555-5555-5555-5555-555555555555', true);

do $$ begin
  perform test_ok((select count(*) from profiles) = 3,
    'perfil e criado para responsavel, e nao para sessao anonima de crianca');
end $$;

-- create_family roda como funcao definer, com a claim do chamador
begin;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
  select public.create_family('Familia A');
commit;
begin;
  set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333"}';
  select public.create_family('Familia B');
commit;

create temp table ids as
select
  (select id from families where name = 'Familia A') as fam_a,
  (select id from families where name = 'Familia B') as fam_b;

-- Sem este grant, um teste que espera falha passaria por falta de permissao
-- nesta tabela auxiliar, e nao pela policy que ele diz estar provando.
grant select on ids to authenticated;

insert into family_members (family_id, user_id, role)
select fam_a, '22222222-2222-2222-2222-222222222222', 'parent' from ids;

insert into children (id, family_id, name, avatar_key)
select 'aaaaaaaa-0000-0000-0000-000000000001', fam_a, 'Ana', 'gato' from ids;
insert into children (id, family_id, name, avatar_key)
select 'aaaaaaaa-0000-0000-0000-000000000002', fam_a, 'Joao', 'urso' from ids;
insert into children (id, family_id, name, avatar_key)
select 'bbbbbbbb-0000-0000-0000-000000000001', fam_b, 'Beto', 'raposa' from ids;

-- link ativo da Ana, e um link ja revogado
insert into access_tokens (id, child_id, token_hash, expires_at, created_by) values
  ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   '\x01'::bytea, now() + interval '365 days', '11111111-1111-1111-1111-111111111111'),
  ('cccccccc-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001',
   '\x02'::bytea, now() + interval '365 days', '11111111-1111-1111-1111-111111111111');

do $$ begin
  perform test_ok(
    public.redeem_child_token('\x01'::bytea, '44444444-4444-4444-4444-444444444444', '203.0.113.7'::inet)
      = 'aaaaaaaa-0000-0000-0000-000000000001',
    'troca de token de link devolve o child_id');
end $$;

-- ===========================================================================
-- 1. Isolamento entre familias
-- ===========================================================================
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
  do $$ begin
    perform test_ok((select count(*) from children) = 2,
      'pai da familia A enxerga apenas as duas criancas da familia A');
    perform test_ok((select count(*) from families) = 1,
      'pai da familia A enxerga apenas a propria familia');
    perform test_ok(test_fails($q$
      insert into transactions (id, child_id, amount_cents, reason, created_by, created_by_name)
      values (gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000001', 1000, 'invasao',
              '11111111-1111-1111-1111-111111111111', 'Pai A1') $q$),
      'pai da familia A nao lanca na crianca da familia B');
  end $$;
rollback;

-- ===========================================================================
-- 2. Autoria nao e forjavel
-- ===========================================================================
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
  do $$ begin
    perform test_ok(test_fails($q$
      insert into transactions (id, child_id, amount_cents, reason, created_by, created_by_name)
      values (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', 1000, 'mesada',
              '22222222-2222-2222-2222-222222222222', 'Pai A2') $q$),
      'pai A1 nao lanca em nome do pai A2');
  end $$;
rollback;

-- ===========================================================================
-- 3. Crianca arquivada nao recebe lancamento novo
-- ===========================================================================
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
  update children set archived_at = now() where id = 'aaaaaaaa-0000-0000-0000-000000000002';
  do $$ begin
    perform test_ok(test_fails($q$
      insert into transactions (id, child_id, amount_cents, reason, created_by, created_by_name)
      values (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000002', 1000, 'mesada',
              '11111111-1111-1111-1111-111111111111', 'Pai A1') $q$),
      'crianca arquivada nao recebe lancamento');
  end $$;
rollback;

-- ===========================================================================
-- 4. family_members nao aceita insercao direta
--    Sem isso, qualquer autenticado se colocaria em qualquer familia.
-- ===========================================================================
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333"}';
  do $$ begin
    perform test_ok(test_fails($q$
      insert into family_members (family_id, user_id, role)
      select fam_a, '33333333-3333-3333-3333-333333333333', 'owner' from ids $q$),
      'pai da familia B nao se insere na familia A');
  end $$;
rollback;

-- ===========================================================================
-- 5. Razao imutavel
-- ===========================================================================
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
  insert into transactions (id, child_id, amount_cents, reason, created_by, created_by_name)
  values ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
          5000, 'mesada de setembro', '11111111-1111-1111-1111-111111111111', 'Pai A1');
  do $$ begin
    perform test_ok(test_fails($q$ update transactions set amount_cents = 999999
                                    where id = 'dddddddd-0000-0000-0000-000000000001' $q$),
      'transacao nao pode ser editada');
    perform test_ok(test_fails($q$ delete from transactions
                                    where id = 'dddddddd-0000-0000-0000-000000000001' $q$),
      'transacao nao pode ser apagada');
  end $$;
rollback;

-- ===========================================================================
-- 6. Estorno
-- ===========================================================================
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
  insert into transactions (id, child_id, amount_cents, reason, created_by, created_by_name)
  values ('dddddddd-0000-0000-0000-000000000010', 'aaaaaaaa-0000-0000-0000-000000000001',
          5000, 'mesada', '11111111-1111-1111-1111-111111111111', 'Pai A1');

  do $$ begin
    perform test_ok(test_fails($q$
      insert into transactions (id, child_id, amount_cents, reason, reverses_id, created_by, created_by_name)
      values (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', -4000, 'estorno',
              'dddddddd-0000-0000-0000-000000000010',
              '11111111-1111-1111-1111-111111111111', 'Pai A1') $q$),
      'estorno com valor diferente do oposto e recusado');

    perform test_ok(test_fails($q$
      insert into transactions (id, child_id, amount_cents, reason, reverses_id, created_by, created_by_name)
      values (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000002', -5000, 'estorno',
              'dddddddd-0000-0000-0000-000000000010',
              '11111111-1111-1111-1111-111111111111', 'Pai A1') $q$),
      'estorno da transacao de outro irmao e recusado');
  end $$;

  insert into transactions (id, child_id, amount_cents, reason, reverses_id, created_by, created_by_name)
  values ('dddddddd-0000-0000-0000-000000000011', 'aaaaaaaa-0000-0000-0000-000000000001',
          -5000, 'estorno', 'dddddddd-0000-0000-0000-000000000010',
          '11111111-1111-1111-1111-111111111111', 'Pai A1');

  do $$ begin
    perform test_ok(test_fails($q$
      insert into transactions (id, child_id, amount_cents, reason, reverses_id, created_by, created_by_name)
      values (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', 5000, 'estorno do estorno',
              'dddddddd-0000-0000-0000-000000000011',
              '11111111-1111-1111-1111-111111111111', 'Pai A1') $q$),
      'estorno de estorno e recusado');

    perform test_ok(test_fails($q$
      insert into transactions (id, child_id, amount_cents, reason, reverses_id, created_by, created_by_name)
      values (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', 5000, 'estorno repetido',
              'dddddddd-0000-0000-0000-000000000010',
              '11111111-1111-1111-1111-111111111111', 'Pai A1') $q$),
      'a mesma transacao nao pode ser estornada duas vezes');

    perform test_ok((select balance_cents from child_balances
                      where child_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0,
      'saldo volta a zero depois do estorno');
  end $$;
rollback;

-- ===========================================================================
-- 7. Ciclo da meta
-- ===========================================================================
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

  insert into goals (id, child_id, title, target_cents, created_by)
  values ('eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
          'bicicleta', 10000, '11111111-1111-1111-1111-111111111111');

  do $$ begin
    perform test_ok(test_fails($q$
      insert into goals (child_id, title, target_cents, created_by)
      values ('aaaaaaaa-0000-0000-0000-000000000001', 'patins', 5000,
              '11111111-1111-1111-1111-111111111111') $q$),
      'so uma meta ativa por crianca');
  end $$;

  insert into transactions (id, child_id, amount_cents, reason, created_by, created_by_name)
  values ('dddddddd-0000-0000-0000-000000000020', 'aaaaaaaa-0000-0000-0000-000000000001',
          6000, 'mesada', '11111111-1111-1111-1111-111111111111', 'Pai A1');

  do $$ begin
    perform test_ok((select status from goals where id = 'eeeeeeee-0000-0000-0000-000000000001') = 'active',
      'meta continua ativa abaixo do alvo');
  end $$;

  insert into transactions (id, child_id, amount_cents, reason, created_by, created_by_name)
  values ('dddddddd-0000-0000-0000-000000000021', 'aaaaaaaa-0000-0000-0000-000000000001',
          4000, 'mesada', '11111111-1111-1111-1111-111111111111', 'Pai A1');

  do $$ begin
    perform test_ok((select status from goals where id = 'eeeeeeee-0000-0000-0000-000000000001') = 'reached',
      'meta e marcada como alcancada ao cruzar o alvo');
    perform test_ok((select reached_by_transaction_id from goals
                      where id = 'eeeeeeee-0000-0000-0000-000000000001')
                    = 'dddddddd-0000-0000-0000-000000000021',
      'a transacao que alcancou a meta fica registrada');
  end $$;

  -- gasto normal derruba o saldo, mas a conquista permanece
  insert into transactions (id, child_id, amount_cents, reason, created_by, created_by_name)
  values ('dddddddd-0000-0000-0000-000000000022', 'aaaaaaaa-0000-0000-0000-000000000001',
          -9000, 'sorvete', '11111111-1111-1111-1111-111111111111', 'Pai A1');

  do $$ begin
    perform test_ok((select status from goals where id = 'eeeeeeee-0000-0000-0000-000000000001') = 'reached',
      'queda normal de saldo NAO reabre a meta');
    perform test_ok(test_fails($q$
      update goals set status = 'active', reached_at = null
       where id = 'eeeeeeee-0000-0000-0000-000000000001' $q$),
      'usuario nao reabre meta alcancada a mao');
  end $$;

  -- estornar a transacao que alcancou a meta reabre a meta
  insert into transactions (id, child_id, amount_cents, reason, reverses_id, created_by, created_by_name)
  values ('dddddddd-0000-0000-0000-000000000023', 'aaaaaaaa-0000-0000-0000-000000000001',
          -4000, 'estorno de lancamento errado', 'dddddddd-0000-0000-0000-000000000021',
          '11111111-1111-1111-1111-111111111111', 'Pai A1');

  do $$ begin
    perform test_ok((select status from goals where id = 'eeeeeeee-0000-0000-0000-000000000001') = 'active',
      'estorno da transacao que alcancou a meta reabre a meta');
  end $$;
rollback;

-- ===========================================================================
-- 8. Meta criada com o saldo ja acima do alvo nasce alcancada
-- ===========================================================================
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
  insert into transactions (id, child_id, amount_cents, reason, created_by, created_by_name)
  values (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001',
          20000, 'presente', '11111111-1111-1111-1111-111111111111', 'Pai A1');
  insert into goals (id, child_id, title, target_cents, created_by)
  values ('eeeeeeee-0000-0000-0000-000000000009', 'aaaaaaaa-0000-0000-0000-000000000001',
          'patinete', 10000, '11111111-1111-1111-1111-111111111111');
  do $$ begin
    perform test_ok((select status from goals where id = 'eeeeeeee-0000-0000-0000-000000000009') = 'reached',
      'meta criada abaixo do saldo atual ja nasce alcancada');
  end $$;
rollback;

-- ===========================================================================
-- 9. Sessao da crianca
-- ===========================================================================
begin;
  set local role authenticated;
  set local request.jwt.claims =
    '{"sub":"44444444-4444-4444-4444-444444444444","child_id":"aaaaaaaa-0000-0000-0000-000000000001"}';
  do $$ begin
    perform test_ok((select count(*) from children) = 1,
      'crianca por link enxerga apenas o proprio perfil');
    perform test_ok((select name from children) = 'Ana',
      'e o perfil e o dela');
    perform test_ok(test_fails($q$
      insert into transactions (id, child_id, amount_cents, reason, created_by, created_by_name)
      values (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', 100000, 'me dei mesada',
              '44444444-4444-4444-4444-444444444444', 'Ana') $q$),
      'crianca nao lanca nada: o link e somente leitura');
    perform test_ok(test_fails($q$
      insert into goals (child_id, title, target_cents, created_by)
      values ('aaaaaaaa-0000-0000-0000-000000000001', 'meta propria', 100,
              '44444444-4444-4444-4444-444444444444') $q$),
      'crianca nao cria meta');
    perform test_ok((select count(*) from access_tokens) = 0,
      'crianca nao enxerga os proprios tokens de acesso');
  end $$;
rollback;

-- Sessao anonima sem claim de crianca nao enxerga nada.
-- Este e o caso do atacante que gera uma sessao anonima com a chave publica.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555"}';
  do $$ begin
    perform test_ok((select count(*) from children) = 0,     'sessao anonima sem claim nao le criancas');
    perform test_ok((select count(*) from transactions) = 0, 'sessao anonima sem claim nao le lancamentos');
    perform test_ok((select count(*) from families) = 0,     'sessao anonima sem claim nao le familias');
    perform test_ok(test_fails($q$
      insert into child_identities (child_id, auth_user_id, provider)
      values ('aaaaaaaa-0000-0000-0000-000000000001',
              '55555555-5555-5555-5555-555555555555', 'google') $q$),
      'sessao anonima nao se vincula a um perfil de crianca (forja da claim)');
  end $$;
rollback;

-- ===========================================================================
-- 10. Hook do JWT: a claim so sai enquanto o link vale
-- ===========================================================================
do $$
declare claims jsonb;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111111111"}', true);

  claims := public.custom_access_token_hook(jsonb_build_object(
    'user_id', '44444444-4444-4444-4444-444444444444', 'claims', '{}'::jsonb)) -> 'claims';
  perform test_ok(claims ->> 'child_id' = 'aaaaaaaa-0000-0000-0000-000000000001',
    'hook injeta child_id para link valido');

  perform public.revoke_access_token('cccccccc-0000-0000-0000-000000000001');

  claims := public.custom_access_token_hook(jsonb_build_object(
    'user_id', '44444444-4444-4444-4444-444444444444', 'claims', '{}'::jsonb)) -> 'claims';
  perform test_ok(claims ->> 'child_id' is null,
    'depois de revogar o link, o hook para de injetar a claim no refresh');
end $$;

-- link expirado nao pode ser trocado
do $$ begin
  update access_tokens set expires_at = now() - interval '1 day'
   where id = 'cccccccc-0000-0000-0000-000000000002';
  perform test_ok(test_fails($q$
    select public.redeem_child_token('\x02'::bytea,
      '55555555-5555-5555-5555-555555555555', '203.0.113.9'::inet) $q$),
    'link expirado nao e trocado por sessao');
end $$;

-- ===========================================================================
-- 11. Sair da familia
-- ===========================================================================
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
  do $$ begin
    perform test_ok(test_fails($q$ select public.leave_family((select fam_a from ids)) $q$),
      'ultimo owner nao sai antes de transferir a familia');
  end $$;
  set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
  do $$ begin
    perform public.leave_family((select fam_a from ids));
    perform test_ok(true, 'responsavel nao-owner sai da familia');
  end $$;
rollback;

\echo ''
\echo '================================================'
\echo ' TODOS OS TESTES PASSARAM'
\echo '================================================'
