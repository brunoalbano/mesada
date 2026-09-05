-- Mesada — um responsável pode editar o que o outro criou
--
-- Sintoma: o pai B toca em "cancelar meta" numa meta criada pelo pai A e nada
-- acontece. O Postgres recusa com 42501 e a aplicação engolia o erro.
--
-- Causa: `with check` enxerga a linha DEPOIS do update, e ali `created_by`
-- continua sendo o criador original. Exigir `created_by = auth.uid()` na
-- edição significava "só quem criou pode editar", o que contradiz o produto:
-- os dois responsáveis administram a mesma família.
--
-- A condição existia para impedir que um pai reescrevesse `created_by` e
-- atribuísse a autoria ao outro. Isso continua barrado, agora por trigger,
-- que é onde a regra cabe: a coluna é imutável, e o resto da linha é editável
-- por qualquer responsável da família.

drop policy if exists goals_update on goals;
create policy goals_update on goals for update
  using (app.is_family_parent(child_id))
  with check (app.is_family_parent(child_id));

create or replace function app.criador_imutavel() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.created_by is distinct from old.created_by then
    raise exception 'a autoria de % não muda', tg_table_name using errcode = 'MS004';
  end if;
  return new;
end $$;

drop trigger if exists trg_goals_criador on goals;
create trigger trg_goals_criador
  before update on goals
  for each row execute function app.criador_imutavel();
