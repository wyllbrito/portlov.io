-- Opcional: executar apenas se estas permissões ainda não estiverem configuradas.
-- Não cria tabelas nem altera políticas existentes. A tabela projects deve permitir
-- que o dono autenticado consulte seus próprios projetos.
alter table public.page_shares enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'page_shares'
      and policyname = 'page_shares_insert_by_project_owner'
  ) then
    create policy page_shares_insert_by_project_owner
    on public.page_shares for insert to authenticated
    with check (
      created_by = (select auth.uid())
      and exists (
        select 1 from public.projects
        where projects.id = page_shares.project_id
          and projects.owner_id = (select auth.uid())
      )
    );
  end if;
end $$;

-- Garante unicidade também no banco; não executar se houver tokens duplicados.
create unique index if not exists page_shares_token_unique
  on public.page_shares (token);
