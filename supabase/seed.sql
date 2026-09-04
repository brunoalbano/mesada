-- Semente de DESENVOLVIMENTO. Nunca aplicar em producao.
--
-- Dados ficticios para que o ambiente de desenvolvimento tenha o que mostrar
-- sem digitacao manual. Ver docs/architecture.md secao 9.4.
--
-- Os usuarios sao criados direto em auth.users porque nao ha fluxo de login
-- aqui; em uso real quem cria e o Supabase Auth.

insert into auth.users (id, email, raw_user_meta_data)
values
  ('11111111-1111-1111-1111-111111111111', 'mae@exemplo.dev',  '{"full_name":"Marina"}'),
  ('22222222-2222-2222-2222-222222222222', 'pai@exemplo.dev',  '{"full_name":"Bruno"}')
on conflict (id) do nothing;

insert into families (id, name, locale)
values ('f0000000-0000-0000-0000-000000000001', 'Família Albano', 'pt')
on conflict (id) do nothing;

insert into family_members (family_id, user_id, role) values
  ('f0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('f0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'parent')
on conflict do nothing;

insert into children (id, family_id, name, avatar_key, birthdate, ui_mode) values
  ('c0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001',
   'Ana',  'gato', '2019-04-12', 'pequeno'),
  ('c0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000001',
   'João', 'urso', '2013-09-30', 'grande')
on conflict (id) do nothing;

-- Ana: mesada semanal, um gasto, e uma meta em andamento.
insert into transactions (id, child_id, amount_cents, reason, emoji, created_by, created_by_name, created_at) values
  (gen_random_uuid(), 'c0000000-0000-0000-0000-000000000001',  2000, 'Mesada da semana', '💰',
   '11111111-1111-1111-1111-111111111111', 'x', now() - interval '21 days'),
  (gen_random_uuid(), 'c0000000-0000-0000-0000-000000000001',  2000, 'Mesada da semana', '💰',
   '11111111-1111-1111-1111-111111111111', 'x', now() - interval '14 days'),
  (gen_random_uuid(), 'c0000000-0000-0000-0000-000000000001', -1500, 'Figurinhas',       '🃏',
   '22222222-2222-2222-2222-222222222222', 'x', now() - interval '10 days'),
  (gen_random_uuid(), 'c0000000-0000-0000-0000-000000000001',  2000, 'Mesada da semana', '💰',
   '11111111-1111-1111-1111-111111111111', 'x', now() - interval '7 days');

insert into goals (id, child_id, title, emoji, target_cents, created_by)
values ('90000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
        'Bicicleta', '🚲', 30000, '11111111-1111-1111-1111-111111111111')
on conflict (id) do nothing;

-- João: meta já alcançada, para exercitar o estado de conquista.
insert into transactions (id, child_id, amount_cents, reason, emoji, created_by, created_by_name, created_at) values
  (gen_random_uuid(), 'c0000000-0000-0000-0000-000000000002',  5000, 'Mesada do mês',   '💰',
   '11111111-1111-1111-1111-111111111111', 'x', now() - interval '30 days'),
  (gen_random_uuid(), 'c0000000-0000-0000-0000-000000000002',  5000, 'Mesada do mês',   '💰',
   '11111111-1111-1111-1111-111111111111', 'x', now() - interval '2 days');

insert into goals (id, child_id, title, emoji, target_cents, created_by)
values ('90000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002',
        'Fone de ouvido', '🎧', 8000, '11111111-1111-1111-1111-111111111111')
on conflict (id) do nothing;
