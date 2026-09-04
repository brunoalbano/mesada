-- Mesada — suite de fumaca do banco
-- Roda com scripts/db-test.sh.
--
-- Regra desta suite: todo teste negativo declara o SQLSTATE esperado. Um
-- "falhou de algum jeito" nao prova nada: a versao anterior tinha um teste de
-- unicidade de estorno que passava por violar o valor oposto, e um teste de
-- policy que passava por falta de GRANT.

\set ON_ERROR_STOP on
\timing off

create or replace function test_raises(p_sql text, p_sqlstate text) returns boolean
language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when others then
  if sqlstate = p_sqlstate then
    return true;
  end if;
  raise notice 'esperava SQLSTATE %, veio % (%)', p_sqlstate, sqlstate, sqlerrm;
  return false;
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
-- conta sem e-mail e sem metadados: telefone ou SSO
insert into auth.users (id) values ('66666666-6666-6666-6666-666666666666');

do $$ begin
  perform test_ok((select count(*) from profiles) = 4,
    'perfil e criado para responsavel, e nao para sessao anonima de crianca');
  perform test_ok((select display_name from profiles
                    where user_id = '66666666-6666-6666-6666-666666666666') = 'Responsável',
    'conta sem e-mail cai no nome padrao, e nao em nome vazio');
end $$;

begin;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
  select id from public.create_family('Familia A');
commit;
begin;
  set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333"}';
  select id from public.create_family('Familia B');
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

-- A crianca so entra com conta propria. A conta e ligada ao perfil por
-- convite emitido pelo responsavel; nao existe mais link com token na URL.
insert into invites (id, family_id, kind, child_id, token_hash, expires_at, created_by)
select 'cccccccc-0000-0000-0000-000000000001', fam_a, 'child',
       'aaaaaaaa-0000-0000-0000-000000000001', '\x01'::bytea,
       now() + interval '7 days', '11111111-1111-1111-1111-111111111111' from ids;

do $$ begin
  perform set_config('request.jwt.claims',
    '{"sub":"44444444-4444-4444-4444-444444444444"}', true);
  perform test_ok(public.accept_child_invite('\x01'::bytea, 'google')
                  = 'aaaaaaaa-0000-0000-0000-000000000001',
    'conta da crianca e vinculada ao perfil por convite do responsavel');
  perform set_config('request.jwt.claims', '', true);
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
    perform test_ok(test_raises($q$
      insert into transactions (id, child_id, amount_cents, reason, created_by, created_by_name)
      values (gen_random_uuid(), 'bbbbbbbb-0000-0000-0000-000000000001', 1000, 'invasao',
              '11111111-1111-1111-1111-111111111111', 'x') $q$, '42501'),
      'pai da familia A nao lanca na crianca da familia B');
  end $$;
rollback;

-- ===========================================================================
-- 2. Autoria vem do servidor
-- ===========================================================================
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
  do $$ begin
    perform test_ok(test_raises($q$
      insert into transactions (id, child_id, amount_cents, reason, created_by, created_by_name)
      values (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', 1000, 'mesada',
              '22222222-2222-2222-2222-222222222222', 'x') $q$, '42501'),
      'pai A1 nao lanca em nome do pai A2');
  end $$;

  insert into transactions (id, child_id, amount_cents, reason, created_by, created_by_name)
  values ('dddddddd-0000-0000-0000-0000000000a1', 'aaaaaaaa-0000-0000-0000-000000000001',
          1000, 'mesada', '11111111-1111-1111-1111-111111111111', 'Nome Falso');
  do $$ begin
    perform test_ok((select created_by_name from transactions
                      where id = 'dddddddd-0000-0000-0000-0000000000a1') = 'Pai A1',
      'created_by_name vem do perfil, e o nome enviado pelo cliente e ignorado');
    perform test_ok((select currency from transactions
                      where id = 'dddddddd-0000-0000-0000-0000000000a1') = 'BRL',
      'moeda do lancamento vem da familia');
  end $$;
rollback;

-- Moeda enviada pelo cliente nao entra no razao: sem isso, um lancamento em
-- outra moeda somava no mesmo saldo e satisfazia uma meta em BRL.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
  insert into transactions (id, child_id, amount_cents, currency, reason, created_by, created_by_name)
  values ('dddddddd-0000-0000-0000-0000000000a2', 'aaaaaaaa-0000-0000-0000-000000000001',
          900000, 'JPY', 'presente', '11111111-1111-1111-1111-111111111111', 'x');
  do $$ begin
    perform test_ok((select currency from transactions
                      where id = 'dddddddd-0000-0000-0000-0000000000a2') = 'BRL',
      'moeda enviada pelo cliente e sobrescrita pela moeda da familia');
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
    perform test_ok(test_raises($q$
      insert into transactions (id, child_id, amount_cents, reason, created_by, created_by_name)
      values (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000002', 1000, 'mesada',
              '11111111-1111-1111-1111-111111111111', 'x') $q$, '42501'),
      'crianca arquivada nao recebe lancamento');
  end $$;
rollback;

-- ===========================================================================
-- 4. Pertencimento a familia
-- ===========================================================================
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333"}';
  do $$ begin
    perform test_ok(test_raises($q$
      insert into family_members (family_id, user_id, role)
      select fam_a, '33333333-3333-3333-3333-333333333333', 'owner' from ids $q$, '42501'),
      'pai da familia B nao se insere na familia A');
  end $$;
rollback;

-- Transferir a propriedade tem de funcionar, senao o ultimo owner nunca sai.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
  update family_members set role = 'owner'
   where user_id = '22222222-2222-2222-2222-222222222222';
  do $$ begin
    perform test_ok((select role from family_members
                      where user_id = '22222222-2222-2222-2222-222222222222') = 'owner',
      'owner transfere a propriedade da familia');
    perform test_ok(test_raises($q$
      update family_members set user_id = '33333333-3333-3333-3333-333333333333'
       where user_id = '22222222-2222-2222-2222-222222222222' $q$, 'MS004'),
      'owner nao troca a pessoa da linha: entra-se por convite');
    perform public.leave_family((select fam_a from ids));
    perform test_ok(true, 'depois da transferencia, o owner anterior sai');
  end $$;
rollback;

begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
  do $$ begin
    perform test_ok(test_raises($q$ select public.leave_family((select fam_a from ids)) $q$, 'P0001'),
      'ultimo owner nao sai antes de transferir a familia');
  end $$;
rollback;

-- ===========================================================================
-- 5. Razao imutavel, e o que ele NAO pode impedir
-- ===========================================================================
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
  insert into transactions (id, child_id, amount_cents, reason, created_by, created_by_name)
  values ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
          5000, 'mesada de setembro', '11111111-1111-1111-1111-111111111111', 'x');
  do $$ begin
    perform test_ok(test_raises($q$ update transactions set amount_cents = 999999
                                    where id = 'dddddddd-0000-0000-0000-000000000001' $q$, '42501'),
      'sessao de usuario nao tem privilegio de update em transactions');
    perform test_ok(test_raises($q$ delete from transactions
                                    where id = 'dddddddd-0000-0000-0000-000000000001' $q$, '42501'),
      'sessao de usuario nao tem privilegio de delete em transactions');
  end $$;
rollback;

-- O trigger existe para o caso que a policy nao cobre: o dono da tabela.
begin;
  insert into transactions (id, child_id, amount_cents, reason, created_by, created_by_name)
  values ('dddddddd-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001',
          5000, 'mesada', '11111111-1111-1111-1111-111111111111', 'x');
  do $$ begin
    perform test_ok(test_raises($q$ update transactions set amount_cents = 1
                                     where id = 'dddddddd-0000-0000-0000-000000000002' $q$, 'MS003'),
      'nem o dono da tabela edita o razao: o trigger barra');
  end $$;
rollback;

-- E a excecao estreita: anular created_by, que e como uma conta e apagada.
begin;
  insert into transactions (id, child_id, amount_cents, reason, created_by, created_by_name)
  values ('dddddddd-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001',
          5000, 'mesada', '22222222-2222-2222-2222-222222222222', 'x');
  delete from auth.users where id = '22222222-2222-2222-2222-222222222222';
  do $$ begin
    perform test_ok((select created_by from transactions
                      where id = 'dddddddd-0000-0000-0000-000000000003') is null,
      'apagar a conta de um responsavel funciona, e anula created_by (LGPD)');
    perform test_ok((select created_by_name from transactions
                      where id = 'dddddddd-0000-0000-0000-000000000003') = 'Pai A2',
      'a autoria sobrevive a exclusao da conta, pelo nome gravado');
  end $$;
rollback;

-- Apagar familia tem de cascatear ate o razao. O trigger de imutabilidade
-- cobria DELETE e travava isto, junto com a exclusao de conta.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
  insert into transactions (id, child_id, amount_cents, reason, created_by, created_by_name)
  values (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001',
          5000, 'mesada', '11111111-1111-1111-1111-111111111111', 'x');
  insert into goals (id, child_id, title, target_cents, created_by)
  values ('eeeeeeee-0000-0000-0000-00000000000f', 'aaaaaaaa-0000-0000-0000-000000000001',
          'meta alcancada', 100, '11111111-1111-1111-1111-111111111111');
  delete from families where id = (select fam_a from ids);
  do $$ begin
    perform test_ok((select count(*) from children) = 0,
      'apagar a familia cascateia ate crianca, razao e meta alcancada');
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
          5000, 'mesada', '11111111-1111-1111-1111-111111111111', 'x');

  do $$ begin
    perform test_ok(test_raises($q$
      insert into transactions (id, child_id, amount_cents, reason, reverses_id, created_by, created_by_name)
      values (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', -4000, 'estorno',
              'dddddddd-0000-0000-0000-000000000010',
              '11111111-1111-1111-1111-111111111111', 'x') $q$, 'MS001'),
      'estorno com valor diferente do oposto e recusado');

    perform test_ok(test_raises($q$
      insert into transactions (id, child_id, amount_cents, reason, reverses_id, created_by, created_by_name)
      values (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000002', -5000, 'estorno',
              'dddddddd-0000-0000-0000-000000000010',
              '11111111-1111-1111-1111-111111111111', 'x') $q$, '23503'),
      'estorno da transacao de outro irmao e recusado pela chave estrangeira composta');
  end $$;

  insert into transactions (id, child_id, amount_cents, reason, reverses_id, created_by, created_by_name)
  values ('dddddddd-0000-0000-0000-000000000011', 'aaaaaaaa-0000-0000-0000-000000000001',
          -5000, 'estorno', 'dddddddd-0000-0000-0000-000000000010',
          '11111111-1111-1111-1111-111111111111', 'x');

  do $$ begin
    perform test_ok(test_raises($q$
      insert into transactions (id, child_id, amount_cents, reason, reverses_id, created_by, created_by_name)
      values (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', 5000, 'estorno do estorno',
              'dddddddd-0000-0000-0000-000000000011',
              '11111111-1111-1111-1111-111111111111', 'x') $q$, 'MS001'),
      'estorno de estorno e recusado');

    -- valor CORRETO, para que o teste prove a unicidade e nao a regra do valor
    perform test_ok(test_raises($q$
      insert into transactions (id, child_id, amount_cents, reason, reverses_id, created_by, created_by_name)
      values (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', -5000, 'estorno repetido',
              'dddddddd-0000-0000-0000-000000000010',
              '11111111-1111-1111-1111-111111111111', 'x') $q$, '23505'),
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
    perform test_ok(test_raises($q$
      insert into goals (child_id, title, target_cents, created_by)
      values ('aaaaaaaa-0000-0000-0000-000000000001', 'patins', 5000,
              '11111111-1111-1111-1111-111111111111') $q$, '23505'),
      'so uma meta ativa por crianca');
  end $$;

  insert into transactions (id, child_id, amount_cents, reason, created_by, created_by_name)
  values ('dddddddd-0000-0000-0000-000000000020', 'aaaaaaaa-0000-0000-0000-000000000001',
          6000, 'mesada', '11111111-1111-1111-1111-111111111111', 'x');
  do $$ begin
    perform test_ok((select status from goals where id = 'eeeeeeee-0000-0000-0000-000000000001') = 'active',
      'meta continua ativa abaixo do alvo');
  end $$;

  insert into transactions (id, child_id, amount_cents, reason, created_by, created_by_name)
  values ('dddddddd-0000-0000-0000-000000000021', 'aaaaaaaa-0000-0000-0000-000000000001',
          4000, 'mesada', '11111111-1111-1111-1111-111111111111', 'x');
  do $$ begin
    perform test_ok((select status from goals where id = 'eeeeeeee-0000-0000-0000-000000000001') = 'reached',
      'meta e marcada como alcancada ao cruzar o alvo');
    perform test_ok((select reached_by_transaction_id from goals
                      where id = 'eeeeeeee-0000-0000-0000-000000000001')
                    = 'dddddddd-0000-0000-0000-000000000021',
      'a transacao que alcancou a meta fica registrada');
  end $$;

  insert into transactions (id, child_id, amount_cents, reason, created_by, created_by_name)
  values ('dddddddd-0000-0000-0000-000000000022', 'aaaaaaaa-0000-0000-0000-000000000001',
          -9000, 'sorvete', '11111111-1111-1111-1111-111111111111', 'x');
  do $$ begin
    perform test_ok((select status from goals where id = 'eeeeeeee-0000-0000-0000-000000000001') = 'reached',
      'queda normal de saldo NAO reabre a meta');
    perform test_ok(test_raises($q$
      update goals set status = 'active', reached_at = null
       where id = 'eeeeeeee-0000-0000-0000-000000000001' $q$, 'MS002'),
      'usuario nao reabre meta alcancada a mao');
    -- A guarda anterior olhava so o status, entao isto passava.
    perform test_ok(test_raises($q$
      update goals set target_cents = 1
       where id = 'eeeeeeee-0000-0000-0000-000000000001' $q$, 'MS002'),
      'usuario nao reescreve o alvo de uma meta ja alcancada');
    perform test_ok(test_raises($q$
      update goals set reached_by_transaction_id = null
       where id = 'eeeeeeee-0000-0000-0000-000000000001' $q$, 'MS002'),
      'usuario nao reescreve a procedencia da conquista');
    -- A guarda dependia de um GUC, e set_config e executavel por qualquer um.
    perform set_config('app.bypass_goal_guard', 'on', true);
    perform test_ok(test_raises($q$
      update goals set status = 'active', reached_at = null
       where id = 'eeeeeeee-0000-0000-0000-000000000001' $q$, 'MS002'),
      'ligar o antigo GUC de bypass nao derruba mais a guarda');
  end $$;

  insert into transactions (id, child_id, amount_cents, reason, reverses_id, created_by, created_by_name)
  values ('dddddddd-0000-0000-0000-000000000023', 'aaaaaaaa-0000-0000-0000-000000000001',
          -4000, 'estorno de lancamento errado', 'dddddddd-0000-0000-0000-000000000021',
          '11111111-1111-1111-1111-111111111111', 'x');
  do $$ begin
    perform test_ok((select status from goals where id = 'eeeeeeee-0000-0000-0000-000000000001') = 'active',
      'estorno da transacao que alcancou a meta reabre a meta');
  end $$;
rollback;

-- Estornar a transacao que alcancou, mas com o saldo AINDA acima do alvo, nao
-- desfaz a conquista, e nao pode reeleger o proprio estorno como quem alcancou.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
  insert into goals (id, child_id, title, target_cents, created_by)
  values ('eeeeeeee-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001',
          'meta', 10000, '11111111-1111-1111-1111-111111111111');
  insert into transactions (id, child_id, amount_cents, reason, created_by, created_by_name)
  values ('dddddddd-0000-0000-0000-0000000000b1', 'aaaaaaaa-0000-0000-0000-000000000001',
          12000, 'mesada', '11111111-1111-1111-1111-111111111111', 'x');
  insert into transactions (id, child_id, amount_cents, reason, created_by, created_by_name)
  values ('dddddddd-0000-0000-0000-0000000000b2', 'aaaaaaaa-0000-0000-0000-000000000001',
          50000, 'presente', '11111111-1111-1111-1111-111111111111', 'x');
  insert into transactions (id, child_id, amount_cents, reason, reverses_id, created_by, created_by_name)
  values ('dddddddd-0000-0000-0000-0000000000b3', 'aaaaaaaa-0000-0000-0000-000000000001',
          -12000, 'estorno', 'dddddddd-0000-0000-0000-0000000000b1',
          '11111111-1111-1111-1111-111111111111', 'x');
  do $$ begin
    perform test_ok((select status from goals where id = 'eeeeeeee-0000-0000-0000-000000000003') = 'reached',
      'estorno com saldo ainda acima do alvo mantem a meta alcancada');
    perform test_ok((select reached_by_transaction_id from goals
                      where id = 'eeeeeeee-0000-0000-0000-000000000003')
                    = 'dddddddd-0000-0000-0000-0000000000b1',
      'a procedencia continua sendo a transacao original, nunca o estorno');
  end $$;
rollback;

-- Com uma meta nova ja ativa, o estorno nao pode explodir por violar
-- one_active_goal_per_child: era o unico mecanismo de correcao do produto.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
  insert into goals (id, child_id, title, target_cents, created_by)
  values ('eeeeeeee-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001',
          'primeira', 10000, '11111111-1111-1111-1111-111111111111');
  insert into transactions (id, child_id, amount_cents, reason, created_by, created_by_name)
  values ('dddddddd-0000-0000-0000-0000000000c1', 'aaaaaaaa-0000-0000-0000-000000000001',
          10000, 'mesada', '11111111-1111-1111-1111-111111111111', 'x');
  insert into goals (id, child_id, title, target_cents, created_by)
  values ('eeeeeeee-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001',
          'segunda', 50000, '11111111-1111-1111-1111-111111111111');
  insert into transactions (id, child_id, amount_cents, reason, reverses_id, created_by, created_by_name)
  values ('dddddddd-0000-0000-0000-0000000000c2', 'aaaaaaaa-0000-0000-0000-000000000001',
          -10000, 'estorno', 'dddddddd-0000-0000-0000-0000000000c1',
          '11111111-1111-1111-1111-111111111111', 'x');
  do $$ begin
    perform test_ok(true, 'estorno funciona mesmo com uma meta nova ja ativa');
    perform test_ok((select status from goals where id = 'eeeeeeee-0000-0000-0000-000000000004') = 'reached',
      'a meta antiga permanece alcancada em vez de derrubar o estorno');
    perform test_ok((select status from goals where id = 'eeeeeeee-0000-0000-0000-000000000005') = 'active',
      'a meta nova segue ativa');
  end $$;
rollback;

-- ===========================================================================
-- 8. Meta criada com o saldo ja acima do alvo
-- ===========================================================================
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
  insert into transactions (id, child_id, amount_cents, reason, created_by, created_by_name)
  values ('dddddddd-0000-0000-0000-0000000000d1', 'aaaaaaaa-0000-0000-0000-000000000001',
          20000, 'presente', '11111111-1111-1111-1111-111111111111', 'x');
  insert into goals (id, child_id, title, target_cents, created_by)
  values ('eeeeeeee-0000-0000-0000-000000000009', 'aaaaaaaa-0000-0000-0000-000000000001',
          'patinete', 10000, '11111111-1111-1111-1111-111111111111');
  do $$ begin
    perform test_ok((select status from goals where id = 'eeeeeeee-0000-0000-0000-000000000009') = 'reached',
      'meta criada abaixo do saldo atual ja nasce alcancada');
    perform test_ok((select reached_by_transaction_id from goals
                      where id = 'eeeeeeee-0000-0000-0000-000000000009')
                    = 'dddddddd-0000-0000-0000-0000000000d1',
      'e registra qual transacao a alcancou, senao nenhum estorno a reabre');
  end $$;
  insert into transactions (id, child_id, amount_cents, reason, reverses_id, created_by, created_by_name)
  values (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001',
          -20000, 'estorno', 'dddddddd-0000-0000-0000-0000000000d1',
          '11111111-1111-1111-1111-111111111111', 'x');
  do $$ begin
    perform test_ok((select status from goals where id = 'eeeeeeee-0000-0000-0000-000000000009') = 'active',
      'e o estorno dessa transacao reabre a meta em vez de deixa-la alcancada com saldo zero');
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
      'crianca com conta propria enxerga apenas o proprio perfil');
    perform test_ok((select name from children) = 'Ana', 'e o perfil e o dela');
    perform test_ok(test_raises($q$
      insert into transactions (id, child_id, amount_cents, reason, created_by, created_by_name)
      values (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', 100000, 'me dei mesada',
              '44444444-4444-4444-4444-444444444444', 'x') $q$, '42501'),
      'crianca nao lanca nada: a conta dela e somente leitura');
    perform test_ok(test_raises($q$
      insert into goals (child_id, title, target_cents, created_by)
      values ('aaaaaaaa-0000-0000-0000-000000000001', 'meta propria', 100,
              '44444444-4444-4444-4444-444444444444') $q$, '42501'),
      'crianca nao cria meta');
    perform test_ok((select count(*) from child_identities) = 0,
      'crianca nao enxerga a tabela de identidades');
  end $$;
rollback;

begin;
  set local role authenticated;
  set local request.jwt.claims =
    '{"sub":"55555555-5555-5555-5555-555555555555","is_anonymous":true}';
  do $$ begin
    perform test_ok((select count(*) from children) = 0,     'sessao anonima sem claim nao le criancas');
    perform test_ok((select count(*) from transactions) = 0, 'sessao anonima sem claim nao le lancamentos');
    perform test_ok((select count(*) from families) = 0,     'sessao anonima sem claim nao le familias');
    perform test_ok(test_raises($q$
      insert into child_identities (child_id, auth_user_id, provider)
      values ('aaaaaaaa-0000-0000-0000-000000000001',
              '55555555-5555-5555-5555-555555555555', 'google') $q$, '42501'),
      'sessao anonima nao se vincula a um perfil de crianca (forja da claim)');
    perform test_ok(test_raises($q$ select public.create_family('Familia Fantasma') $q$, 'MS005'),
      'sessao anonima nao cria familia');
    perform test_ok(test_raises($q$ select public.accept_child_invite('\x99'::bytea, 'google') $q$, 'MS005'),
      'sessao anonima nao vincula conta por convite de crianca');
  end $$;
rollback;

-- ===========================================================================
-- 10. Credenciais nao sao legiveis, e RPC privilegiada nao e chamavel
-- ===========================================================================
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
  do $$ begin
    perform test_ok(test_raises($q$ select token_hash from invites limit 1 $q$, '42501'),
      'nem o owner le o hash de um convite');
    perform test_ok((select count(*) from invites) = 1,
      'mas o owner continua enxergando os convites da familia');
    perform test_ok(test_raises($q$
      select public.custom_access_token_hook('{}'::jsonb) $q$, '42501'),
      'sessao de usuario nao executa o hook de emissao de JWT');
  end $$;
rollback;

-- Membro comum nao le convite nenhum: era por ali que se escalava para owner.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
  do $$ begin
    perform test_ok((select count(*) from invites) = 0,
      'responsavel sem papel de owner nao enxerga convites');
  end $$;
rollback;

-- ===========================================================================
-- 11. Vinculo de conta e sua revogacao
-- ===========================================================================
begin;
  insert into invites (id, family_id, kind, child_id, token_hash, expires_at, created_by)
  select gen_random_uuid(), fam_a, 'child', 'aaaaaaaa-0000-0000-0000-000000000002',
         '\xaa'::bytea, now() + interval '7 days', '11111111-1111-1111-1111-111111111111'
    from ids;

  set local role authenticated;
  set local request.jwt.claims = '{"sub":"66666666-6666-6666-6666-666666666666"}';
  do $$ begin
    perform test_ok(public.accept_child_invite('\xaa'::bytea, 'google')
                    = 'aaaaaaaa-0000-0000-0000-000000000002',
      'conta real vincula-se ao perfil da crianca por convite do responsavel');
    perform test_ok(test_raises($q$ select public.accept_child_invite('\xaa'::bytea, 'google') $q$, 'P0001'),
      'o mesmo convite nao e usado duas vezes');
  end $$;

  set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
  do $$ begin
    perform test_ok((select count(*) from child_identities
                      where child_id = 'aaaaaaaa-0000-0000-0000-000000000002') = 1,
      'o responsavel enxerga a conta vinculada');
    delete from child_identities where child_id = 'aaaaaaaa-0000-0000-0000-000000000002';
    perform test_ok((select count(*) from child_identities
                      where child_id = 'aaaaaaaa-0000-0000-0000-000000000002') = 0,
      'e consegue desvincular: sem isso o acesso por conta seria irrevogavel');
  end $$;
rollback;

-- ===========================================================================
-- 12. Hook do JWT
-- ===========================================================================
do $$
declare claims jsonb;
begin
  claims := public.custom_access_token_hook(jsonb_build_object(
    'user_id', '44444444-4444-4444-4444-444444444444', 'claims', '{}'::jsonb)) -> 'claims';
  perform test_ok(claims ->> 'child_id' = 'aaaaaaaa-0000-0000-0000-000000000001',
    'hook injeta child_id para a conta vinculada da crianca');
  perform test_ok(claims ->> 'child_scope' = 'read',
    'e o escopo e somente leitura');

  -- Desvincular a conta corta o acesso no proximo refresh. E por isso que o
  -- TTL do access token fica curto: e o tamanho da janela residual.
  update child_identities set revoked_at = now()
   where auth_user_id = '44444444-4444-4444-4444-444444444444';

  claims := public.custom_access_token_hook(jsonb_build_object(
    'user_id', '44444444-4444-4444-4444-444444444444', 'claims', '{}'::jsonb)) -> 'claims';
  perform test_ok(claims ->> 'child_id' is null,
    'depois de revogar a identidade, o hook para de injetar a claim');

  claims := public.custom_access_token_hook(jsonb_build_object(
    'user_id', '11111111-1111-1111-1111-111111111111', 'claims', '{}'::jsonb)) -> 'claims';
  perform test_ok(claims ->> 'child_id' is null,
    'conta de responsavel nunca recebe claim de crianca');
end $$;

\echo ''
\echo '================================================'
\echo ' TODOS OS TESTES PASSARAM'
\echo '================================================'
