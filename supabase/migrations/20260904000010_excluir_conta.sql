-- Mesada — a pessoa apaga a própria conta
--
-- A seção 4.7 promete exclusão, e o esquema foi construído para permitir:
-- created_by é anulável com `on delete set null`, e created_by_name guarda o
-- nome, então o razão continua íntegro depois que a conta some.
--
-- Faltava o caminho. Apagar de auth.users exige privilégio que a aplicação
-- não tem — e não deve ter: a chave service_role ignora RLS inteira. Uma
-- função SECURITY DEFINER faz só esta operação, para o próprio usuário, e
-- nada mais.

create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_user   uuid := auth.uid();
  v_orfa   uuid;
begin
  if not app.is_real_user() then
    raise exception 'esta ação exige uma conta' using errcode = 'MS005';
  end if;

  -- Família onde a pessoa é o único owner E existe outra pessoa dentro: sair
  -- deixaria a família sem quem administre, sem ninguém para consertar.
  select fm.family_id into v_orfa
    from public.family_members fm
   where fm.user_id = v_user
     and fm.role = 'owner'
     and (select count(*) from public.family_members o
           where o.family_id = fm.family_id and o.role = 'owner') = 1
     and (select count(*) from public.family_members o
           where o.family_id = fm.family_id) > 1
   limit 1;

  if v_orfa is not null then
    raise exception 'transfira a administração das suas famílias antes de excluir a conta'
      using errcode = 'MS004';
  end if;

  -- Família onde a pessoa está sozinha vai junto: sem membro nenhum ela seria
  -- inalcançável para sempre, e a cascata leva crianças, razão e metas.
  delete from public.families f
   where exists (select 1 from public.family_members fm
                  where fm.family_id = f.id and fm.user_id = v_user)
     and (select count(*) from public.family_members fm where fm.family_id = f.id) = 1;

  -- Some do resto por cascata: family_members, profiles, child_identities.
  -- transactions.created_by vira nulo, e created_by_name preserva a autoria.
  delete from auth.users where id = v_user;
end $$;

revoke execute on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
