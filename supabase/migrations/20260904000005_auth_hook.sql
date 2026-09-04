-- Mesada — Custom Access Token Hook
-- Ver docs/architecture.md secoes 4.3 e 4.5.
--
-- Injeta child_id e child_scope no JWT quando o usuario autenticado
-- corresponde a uma identidade de crianca VIVA. Com isso, pai e crianca sao
-- cobertos pelas mesmas policies, independente do caminho de login.
--
-- A verificacao de validade acontece AQUI, a cada emissao de token, e nao
-- apenas na troca inicial. Sem isso, revogar um link nao derrubava a sessao
-- que ele criou: o refresh token do Supabase rotaciona sem prazo fixo, o hook
-- reemitia a claim, e um link vazado virava acesso permanente.
--
-- Configurar no painel do Supabase:
--   Authentication > Hooks > Custom Access Token > public.custom_access_token_hook
-- E reduzir o TTL do access token para 600 a 900 segundos, para limitar a
-- janela residual entre a revogacao e o proximo refresh.

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_claims   jsonb := coalesce(event -> 'claims', '{}'::jsonb);
  v_child_id uuid;
  v_scope    text;
begin
  select ci.child_id,
         case when ci.provider = 'link' and not coalesce(t.can_request, false)
              then 'read' else 'read' end
    into v_child_id, v_scope
    from public.child_identities ci
    left join public.access_tokens t on t.id = ci.access_token_id
   where ci.auth_user_id = (event ->> 'user_id')::uuid
     and ci.revoked_at is null
     -- identidade de link so vale enquanto o link vale
     and (ci.provider <> 'link'
          or (t.id is not null and t.revoked_at is null and t.expires_at > now()))
   limit 1;

  if v_child_id is not null then
    v_claims := v_claims
      || jsonb_build_object('child_id', v_child_id::text)
      || jsonb_build_object('child_scope', v_scope);
  end if;

  return jsonb_set(event, '{claims}', v_claims);
end $$;

-- O hook e chamado pelo servico de auth, por ninguem mais.
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;

grant usage on schema public to supabase_auth_admin;
grant select on public.child_identities, public.access_tokens to supabase_auth_admin;
