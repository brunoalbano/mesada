-- Mesada — liga family_members a profiles
--
-- Sintoma: a lista de responsáveis aparecia vazia, e com ela sumia o painel de
-- convite, porque a consulta inteira falhava com
--
--   PGRST200  Could not find a relationship between 'family_members' and
--             'profiles' in the schema cache
--
-- Causa: as duas tabelas referenciam auth.users, mas não uma à outra. Sem
-- chave estrangeira entre elas, o PostgREST não tem como resolver o embed.
--
-- A chave também diz a verdade sobre o modelo: um membro de família é uma
-- pessoa com perfil. Toda conta não anônima ganha perfil pelo trigger em
-- auth.users, então a linha sempre existe quando a participação é criada.

-- Garante o perfil de quem já é membro e ficou sem, para a constraint poder
-- ser criada como válida. Só acontece com linha inserida antes do trigger.
insert into profiles (user_id, display_name)
select fm.user_id, coalesce(split_part(u.email, '@', 1), 'Responsável')
  from family_members fm
  join auth.users u on u.id = fm.user_id
 where not exists (select 1 from profiles p where p.user_id = fm.user_id)
on conflict (user_id) do nothing;

alter table family_members
  add constraint family_members_profile_fkey
  foreign key (user_id) references profiles(user_id) on delete cascade;
