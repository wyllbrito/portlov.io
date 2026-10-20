-- Executar inteiro no SQL Editor. A transação evita alterações parciais.
begin;

create table if not exists public.projects (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade, email text not null, username text
);
alter table public.profiles add column if not exists username text;

do $$
declare bad text;
begin
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='id' and data_type='uuid')
 or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='projects' and column_name='id' and data_type='uuid')
 or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='projects' and column_name='owner_id' and data_type='uuid') then
  raise exception 'Esquema incompatível: profiles.id, projects.id e projects.owner_id precisam ser UUID. Nenhuma alteração foi aplicada.';
 end if;
 select string_agg(table_name||'.'||column_name,', ') into bad from information_schema.columns
 where table_schema='public' and table_name in ('profiles','projects') and is_nullable='NO' and column_default is null and is_identity='NO' and is_generated='NEVER'
 and not ((table_name='profiles' and column_name in ('id','username','email')) or (table_name='projects' and column_name in ('id','owner_id','name','title')));
 if bad is not null then raise exception 'Defina defaults para as colunas obrigatórias antes de continuar: %',bad; end if;
 if exists(select lower(btrim(username)) from public.profiles where username is not null group by lower(btrim(username)) having count(*)>1) then
  raise exception 'Existem nomes de usuário repetidos (ignorando maiúsculas). Resolva-os antes de executar a migração.';
 end if;
 if exists(select 1 from public.profiles where username is not null and lower(btrim(username)) !~ '^[a-z0-9_]{3,24}$') then
  raise exception 'Há nomes existentes fora do padrão de 3 a 24 letras sem acentos, números ou _. Ajuste-os antes de continuar.';
 end if;
end $$;

update public.profiles set username=lower(btrim(username)) where username is not null;
-- Preserva usuários existentes, criando apenas os perfis/nomes ausentes.
do $$
declare u record; candidate text; suffix int;
begin
 for u in select a.id,a.email from auth.users a left join public.profiles p on p.id=a.id where p.username is null loop
  suffix:=0; candidate:='pessoa_'||substr(replace(u.id::text,'-',''),1,16);
  while exists(select 1 from public.profiles where username=candidate) loop
   suffix:=suffix+1;candidate:='pessoa_'||substr(replace(u.id::text,'-',''),1,12)||suffix::text;
  end loop;
  insert into public.profiles(id,email,username) values(u.id,coalesce(u.email,''),candidate) on conflict(id) do update set username=excluded.username where profiles.username is null;
 end loop;
end $$;
create unique index if not exists portlov_username_unique on public.profiles(lower(username));
alter table public.profiles alter column username set not null;
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.profiles'::regclass and conname='portlov_username_valid') then
  alter table public.profiles add constraint portlov_username_valid check(username=lower(btrim(username)) and username ~ '^[a-z0-9_]{3,24}$');
 end if;
end $$;

create table if not exists public.page_shares (
 project_id uuid not null references public.projects(id), token text not null, permission_type text not null check(permission_type in ('viewer','editor')),
 is_active boolean not null default true, created_by uuid not null references auth.users(id)
);
do $$
declare bad text;
begin
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='page_shares' and column_name='project_id' and data_type='uuid')
 or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='page_shares' and column_name='created_by' and data_type='uuid')
 or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='page_shares' and column_name='token' and data_type in ('text','character varying'))
 or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='page_shares' and column_name='permission_type' and data_type in ('text','character varying'))
 or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='page_shares' and column_name='is_active' and data_type='boolean') then
  raise exception 'page_shares incompatível: requer project_id/created_by UUID, token/permission_type texto e is_active boolean. A transação será desfeita.';
 end if;
 select string_agg(column_name,', ') into bad from information_schema.columns where table_schema='public' and table_name='page_shares' and is_nullable='NO' and column_default is null and is_identity='NO' and is_generated='NEVER'
 and column_name not in ('project_id','token','permission_type','is_active','created_by') and not(column_name='id' and data_type='uuid');
 if bad is not null then raise exception 'Defina defaults para as colunas obrigatórias de page_shares: %',bad; end if;
end $$;
create unique index if not exists page_shares_token_unique on public.page_shares(token);
-- Compatibilidade com tabelas que tenham id UUID sem default.
do $$ begin
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='page_shares' and column_name='id' and data_type='uuid' and column_default is null) then
  alter table public.page_shares alter column id set default gen_random_uuid();
 end if;
end $$;

create table if not exists public.portlov_members (
 project_id uuid not null references public.projects(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 permission_type text not null check(permission_type in ('viewer','editor')),
 joined_at timestamptz not null default now(), revoked_at timestamptz, primary key(project_id,user_id)
);
create table if not exists public.portlov_documents (
 project_id uuid primary key references public.projects(id) on delete cascade,
 data jsonb, revision bigint not null default 0, updated_at timestamptz not null default now(), updated_by uuid references auth.users(id),
 check(data is null or jsonb_typeof(data)='object')
);
create table if not exists public.portlov_presence (
 project_id uuid not null references public.projects(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, last_seen timestamptz not null default now(), primary key(project_id,user_id)
);
create table if not exists public.portlov_visits (
 project_id uuid not null references public.projects(id) on delete cascade,
 visitor_id uuid not null, last_seen timestamptz not null default now(), primary key(project_id,visitor_id)
);
create index if not exists portlov_members_user on public.portlov_members(user_id);

-- Todas as operações passam por RPCs com autorização no servidor.
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.page_shares enable row level security;
alter table public.portlov_members enable row level security;
alter table public.portlov_documents enable row level security;
alter table public.portlov_presence enable row level security;
alter table public.portlov_visits enable row level security;
revoke all on public.profiles,public.projects,public.page_shares,public.portlov_members,public.portlov_documents,public.portlov_presence,public.portlov_visits from public,anon,authenticated;

create or replace function public.portlov_profile_defaults() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.username is null then select lower(btrim(raw_user_meta_data->>'username')) into new.username from auth.users where id=new.id; end if;
 if new.email is null then select email into new.email from auth.users where id=new.id; end if;
 return new;
end $$;
drop trigger if exists portlov_profile_before_insert on public.profiles;
create trigger portlov_profile_before_insert before insert on public.profiles for each row execute function public.portlov_profile_defaults();

create or replace function public.portlov_signup_profile() returns trigger language plpgsql security definer set search_path='' as $$
declare wanted text:=lower(btrim(new.raw_user_meta_data->>'username'));
begin
 if wanted is null or wanted !~ '^[a-z0-9_]{3,24}$' then raise exception 'username_invalid'; end if;
 insert into public.profiles(id,email,username) values(new.id,coalesce(new.email,''),wanted) on conflict(id) do update set username=excluded.username;
 return new;
end $$;
drop trigger if exists portlov_auth_signup on auth.users;
create constraint trigger portlov_auth_signup after insert on auth.users deferrable initially deferred for each row execute function public.portlov_signup_profile();

create or replace function public.portlov_username_available(p_username text) returns boolean language sql stable security definer set search_path='' as $$
 select lower(btrim(p_username)) ~ '^[a-z0-9_]{3,24}$' and not exists(select 1 from public.profiles where username=lower(btrim(p_username)));
$$;
create or replace function public.portlov_my_profile() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'login_required'; end if;
 return (select jsonb_build_object('id',id,'username',username) from public.profiles where id=auth.uid());
end $$;
create or replace function public.portlov_rename(p_username text) returns jsonb language plpgsql security definer set search_path='' as $$
declare wanted text:=lower(btrim(p_username));
begin
 if auth.uid() is null then raise exception 'login_required'; end if;
 if wanted is null or wanted !~ '^[a-z0-9_]{3,24}$' then raise exception 'username_invalid'; end if;
 update public.profiles set username=wanted where id=auth.uid();
 if not found then raise exception 'profile_missing'; end if;
 return public.portlov_my_profile();
end $$;

create or replace function public.portlov_role(p_project_id uuid) returns text language sql stable security definer set search_path='' as $$
 select case when auth.uid() is null then null
  when exists(select 1 from public.projects where id=p_project_id and owner_id=auth.uid()) then 'owner'
  else (select permission_type from public.portlov_members where project_id=p_project_id and user_id=auth.uid() and revoked_at is null) end;
$$;
create or replace function public.portlov_my_projects() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'login_required'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'title',coalesce(d.data#>>'{data,header,title}','Meu espaço'),'role',public.portlov_role(p.id)) order by p.id)
 from public.projects p left join public.portlov_documents d on d.project_id=p.id where public.portlov_role(p.id) is not null),'[]'::jsonb);
end $$;

create or replace function public.portlov_join(p_token text) returns uuid language plpgsql security definer set search_path='' as $$
declare invitation public.page_shares; existing public.portlov_members;
begin
 if auth.uid() is null then raise exception 'login_required'; end if;
 select * into invitation from public.page_shares where token=p_token and is_active=true for share;
 if not found or invitation.permission_type not in ('viewer','editor') then raise exception 'invite_invalid'; end if;
 if not exists(select 1 from public.projects where id=invitation.project_id) then raise exception 'project_missing'; end if;
 if exists(select 1 from public.projects where id=invitation.project_id and owner_id=auth.uid()) then return invitation.project_id; end if;
 select * into existing from public.portlov_members where project_id=invitation.project_id and user_id=auth.uid() for update;
 if found and existing.revoked_at is not null then raise exception 'access_revoked'; end if;
 -- Não promove um membro que o admin já rebaixou para visualizador.
 insert into public.portlov_members(project_id,user_id,permission_type) values(invitation.project_id,auth.uid(),invitation.permission_type) on conflict do nothing;
 return invitation.project_id;
end $$;

create or replace function public.portlov_snapshot(p_project_id uuid default null,p_token text default null,p_visit_id uuid default null,p_include_data boolean default true) returns jsonb language plpgsql security definer set search_path='' as $$
declare pid uuid:=p_project_id; owner uuid; access text; invitation public.page_shares; doc public.portlov_documents; people jsonb;
begin
 if p_token is not null then
  select * into invitation from public.page_shares where token=p_token and is_active=true;
  if not found then raise exception 'invite_invalid'; end if;
  pid:=invitation.project_id;
 end if;
 select owner_id into owner from public.projects where id=pid;
 if not found then raise exception 'project_missing'; end if;
 access:=public.portlov_role(pid);
 if auth.uid() is not null and exists(select 1 from public.portlov_members where project_id=pid and user_id=auth.uid() and revoked_at is not null) then raise exception 'access_revoked'; end if;
 if access is null then
  if p_token is null then raise exception 'access_denied'; end if;
  access:='viewer';
 end if;
 if auth.uid() is not null and public.portlov_role(pid) is not null then
  insert into public.portlov_presence(project_id,user_id) values(pid,auth.uid()) on conflict(project_id,user_id) do update set last_seen=now();
 elsif auth.uid() is null and p_visit_id is not null then
  insert into public.portlov_visits(project_id,visitor_id) values(pid,p_visit_id) on conflict(project_id,visitor_id) do update set last_seen=now();
 end if;
 select * into doc from public.portlov_documents where project_id=pid;
 select coalesce(jsonb_agg(jsonb_build_object('user_id',x.user_id,'username',pr.username,'role',x.role,'last_seen',ps.last_seen) order by x.role='owner' desc,pr.username),'[]'::jsonb) into people
 from (select owner as user_id,'owner'::text as role union all select user_id,permission_type from public.portlov_members where project_id=pid and revoked_at is null and user_id<>owner) x
 join public.profiles pr on pr.id=x.user_id left join public.portlov_presence ps on ps.project_id=pid and ps.user_id=x.user_id;
 return jsonb_build_object('project_id',pid,'owner_id',owner,'role',access,'data',case when p_include_data then doc.data else null end,'has_document',doc.data is not null,'revision',coalesce(doc.revision,0),'participants',people,
 'guest_count',(select count(*) from public.portlov_visits where project_id=pid and last_seen>now()-interval '90 seconds'));
end $$;

create or replace function public.portlov_save(p_project_id uuid,p_data jsonb,p_revision bigint) returns bigint language plpgsql security definer set search_path='' as $$
declare next_revision bigint;
begin
 if coalesce(public.portlov_role(p_project_id),'') not in ('owner','editor') then raise exception 'access_denied'; end if;
 if p_data is null or jsonb_typeof(p_data) is distinct from 'object' or jsonb_typeof(p_data->'data') is distinct from 'object' or jsonb_typeof(p_data#>'{data,slots}') is distinct from 'array' or jsonb_typeof(p_data#>'{data,pages}') is distinct from 'array' or octet_length(p_data::text)>40000000 then raise exception 'document_invalid'; end if;
 if public.portlov_role(p_project_id)='editor' and not exists(select 1 from public.portlov_documents where project_id=p_project_id and data is not null) then raise exception 'owner_publish_required'; end if;
 insert into public.portlov_documents(project_id) values(p_project_id) on conflict do nothing;
 update public.portlov_documents set data=p_data,revision=revision+1,updated_by=auth.uid(),updated_at=now() where project_id=p_project_id and revision=p_revision returning revision into next_revision;
 if not found then raise exception 'revision_conflict'; end if;
 return next_revision;
end $$;

create or replace function public.portlov_create_project(p_title text default 'Meu espaço') returns uuid language plpgsql security definer set search_path='' as $$
declare pid uuid:=gen_random_uuid(); cols text:='id,owner_id'; vals text:='$1,$2';
begin
 if auth.uid() is null then raise exception 'login_required'; end if;
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='projects' and column_name='title') then cols:=cols||',title';vals:=vals||',$3'; end if;
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='projects' and column_name='name') then cols:=cols||',name';vals:=vals||',$3'; end if;
 execute 'insert into public.projects ('||cols||') values ('||vals||')' using pid,auth.uid(),left(coalesce(nullif(btrim(p_title),''),'Meu espaço'),160);
 insert into public.portlov_documents(project_id) values(pid);
 return pid;
end $$;

create or replace function public.portlov_invite(p_project_id uuid,p_token text,p_permission text) returns void language plpgsql security definer set search_path='' as $$
begin
 if public.portlov_role(p_project_id) is distinct from 'owner' then raise exception 'owner_required'; end if;
 if p_permission is null or p_permission not in ('viewer','editor') or p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'invite_invalid'; end if;
 if not exists(select 1 from public.portlov_documents where project_id=p_project_id and data is not null) then raise exception 'owner_publish_required'; end if;
 insert into public.page_shares(project_id,token,permission_type,is_active,created_by) values(p_project_id,p_token,p_permission,true,auth.uid());
end $$;
create or replace function public.portlov_access_list(p_project_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if public.portlov_role(p_project_id) is distinct from 'owner' then raise exception 'owner_required'; end if;
 return jsonb_build_object('members',coalesce((select jsonb_agg(jsonb_build_object('user_id',m.user_id,'username',p.username,'permission',m.permission_type,'revoked',m.revoked_at is not null) order by p.username) from public.portlov_members m join public.profiles p on p.id=m.user_id where m.project_id=p_project_id),'[]'::jsonb),
 'links',coalesce((select jsonb_agg(jsonb_build_object('token',token,'permission',permission_type,'active',is_active)) from public.page_shares where project_id=p_project_id),'[]'::jsonb));
end $$;
create or replace function public.portlov_set_access(p_project_id uuid,p_user_id uuid,p_permission text) returns void language plpgsql security definer set search_path='' as $$
begin
 if public.portlov_role(p_project_id) is distinct from 'owner' then raise exception 'owner_required'; end if;
 if p_permission is null or p_permission not in ('viewer','editor','none') then raise exception 'permission_invalid'; end if;
 update public.portlov_members set permission_type=case when p_permission='none' then permission_type else p_permission end,revoked_at=case when p_permission='none' then now() else null end where project_id=p_project_id and user_id=p_user_id;
 if not found then raise exception 'member_missing'; end if;
end $$;
create or replace function public.portlov_revoke_link(p_project_id uuid,p_token text) returns void language plpgsql security definer set search_path='' as $$
begin
 if public.portlov_role(p_project_id) is distinct from 'owner' then raise exception 'owner_required'; end if;
 update public.page_shares set is_active=false where project_id=p_project_id and token=p_token;
 if not found then raise exception 'invite_invalid'; end if;
end $$;
create or replace function public.portlov_delete_project(p_project_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.projects where id=p_project_id for update;
 if coalesce(public.portlov_role(p_project_id),'') not in ('owner','editor') then raise exception 'access_denied'; end if;
 delete from public.page_shares where project_id=p_project_id;
 delete from public.projects where id=p_project_id;
 if not found then raise exception 'project_missing'; end if;
end $$;

-- Funções internas não ficam disponíveis pela API.
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'portlov\_%' escape '\' loop
  execute 'revoke all on function '||f.signature||' from public, anon, authenticated';
 end loop;
end $$;
grant execute on function public.portlov_username_available(text) to anon,authenticated;
grant execute on function public.portlov_snapshot(uuid,text,uuid,boolean) to anon,authenticated;
grant execute on function public.portlov_my_profile(), public.portlov_rename(text), public.portlov_my_projects(), public.portlov_join(text), public.portlov_save(uuid,jsonb,bigint), public.portlov_create_project(text), public.portlov_invite(uuid,text,text), public.portlov_access_list(uuid), public.portlov_set_access(uuid,uuid,text), public.portlov_revoke_link(uuid,text), public.portlov_delete_project(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
