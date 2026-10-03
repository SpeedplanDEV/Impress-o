-- SpeedPlan Gestão · tabela leads
-- Migration idempotente: pode ser executada várias vezes sem erro.

create extension if not exists pg_trgm;

-- ── Sequência do código LD-0001 ─────────────────────────────────────────────
create sequence if not exists public.leads_codigo_seq;

-- ── Tabela ─────────────────────────────────────────────────────────────────
create table if not exists public.leads (
  id         uuid primary key default gen_random_uuid(),
  codigo     text not null,
  nome       text not null,
  empresa    text,
  cpf_cnpj   text,
  telefone   text,
  email      text,
  cidade     text,
  uf         char(2),
  ibge_id    integer,
  interesse  text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Garante as colunas caso a tabela já exista numa versão anterior
alter table public.leads add column if not exists empresa    text;
alter table public.leads add column if not exists cpf_cnpj   text;
alter table public.leads add column if not exists telefone   text;
alter table public.leads add column if not exists email      text;
alter table public.leads add column if not exists cidade     text;
alter table public.leads add column if not exists uf         char(2);
alter table public.leads add column if not exists ibge_id    integer;
alter table public.leads add column if not exists created_at timestamptz not null default now();
alter table public.leads add column if not exists updated_at timestamptz not null default now();

-- ── Restrições ─────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'leads_codigo_key') then
    alter table public.leads add constraint leads_codigo_key unique (codigo);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'leads_interesse_check') then
    alter table public.leads add constraint leads_interesse_check
      check (interesse in ('Planilhas','Sistemas','Sites','Documentos','Logos'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'leads_cpf_cnpj_check') then
    alter table public.leads add constraint leads_cpf_cnpj_check
      check (cpf_cnpj is null or cpf_cnpj ~ '^([0-9]{11}|[0-9]{14})$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'leads_telefone_check') then
    alter table public.leads add constraint leads_telefone_check
      check (telefone is null or telefone ~ '^[0-9]+$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'leads_uf_check') then
    alter table public.leads add constraint leads_uf_check
      check (uf is null or uf ~ '^[A-Z]{2}$');
  end if;
end $$;

-- ── Triggers: código automático e updated_at ───────────────────────────────
create or replace function public.leads_antes_inserir()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.codigo is null or new.codigo = '' then
    new.codigo := 'LD-' || lpad(nextval('public.leads_codigo_seq')::text, 4, '0');
  end if;
  return new;
end $$;

create or replace function public.leads_antes_atualizar()
returns trigger language plpgsql set search_path = public as $$
begin
  new.codigo := old.codigo;       -- código é imutável
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists leads_codigo on public.leads;
create trigger leads_codigo before insert on public.leads
  for each row execute function public.leads_antes_inserir();

drop trigger if exists leads_updated_at on public.leads;
create trigger leads_updated_at before update on public.leads
  for each row execute function public.leads_antes_atualizar();

-- ── Índices ────────────────────────────────────────────────────────────────
create index if not exists leads_nome_idx       on public.leads (nome);
create index if not exists leads_empresa_idx    on public.leads (empresa);
create index if not exists leads_cpf_cnpj_idx   on public.leads (cpf_cnpj);
create index if not exists leads_codigo_idx     on public.leads (codigo);
create index if not exists leads_interesse_idx  on public.leads (interesse);
create index if not exists leads_created_at_idx on public.leads (created_at desc);
-- Busca por trecho (ilike) em nome/empresa
create index if not exists leads_nome_trgm_idx    on public.leads using gin (nome gin_trgm_ops);
create index if not exists leads_empresa_trgm_idx on public.leads using gin (empresa gin_trgm_ops);

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.leads enable row level security;

drop policy if exists "leads_select_autenticados" on public.leads;
drop policy if exists "leads_insert_autenticados" on public.leads;
drop policy if exists "leads_update_autenticados" on public.leads;
drop policy if exists "leads_delete_autenticados" on public.leads;
create policy "leads_select_autenticados" on public.leads for select to authenticated using (true);
create policy "leads_insert_autenticados" on public.leads for insert to authenticated with check (true);
create policy "leads_update_autenticados" on public.leads for update to authenticated using (true) with check (true);
create policy "leads_delete_autenticados" on public.leads for delete to authenticated using (true);

grant select, insert, update, delete on public.leads to authenticated;
grant usage, select on sequence public.leads_codigo_seq to authenticated;

-- ── Filtro estilo Excel (servidor) ─────────────────────────────────────────
-- Valor exibido de cada coluna filtrável (null = "(Vazias)")
create or replace function public.lead_valor_coluna(l public.leads, p_coluna text)
returns text language sql immutable set search_path = public as $$
  select case p_coluna
    when 'codigo'    then l.codigo
    when 'nome'      then l.nome
    when 'empresa'   then nullif(l.empresa, '')
    when 'cpf_cnpj'  then nullif(l.cpf_cnpj, '')
    when 'telefone'  then nullif(l.telefone, '')
    when 'email'     then nullif(l.email, '')
    when 'cidade_uf' then case when coalesce(l.cidade, '') = '' then null
                               else l.cidade || coalesce('/' || l.uf::text, '') end
    when 'uf'        then l.uf::text
    when 'interesse' then l.interesse
  end
$$;

-- Leads filtrados por busca global + filtros por coluna ({"coluna": ["valor", ""...]}, "" = vazias)
create or replace function public.leads_filtrar(
  p_busca   text default null,
  p_filtros jsonb default '{}'::jsonb,
  p_desde   timestamptz default null
)
returns setof public.leads language sql stable set search_path = public as $$
  with p as (
    select
      nullif(trim(coalesce(p_busca, '')), '') as termo,
      '%' || replace(replace(replace(trim(coalesce(p_busca, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%' as padrao,
      nullif(regexp_replace(coalesce(p_busca, ''), '\D', '', 'g'), '') as digitos
  )
  select l.*
  from public.leads l, p
  where (
      p.termo is null
      or l.nome    ilike p.padrao
      or l.empresa ilike p.padrao
      or l.codigo  ilike p.padrao
      or l.email   ilike p.padrao
      or l.cidade  ilike p.padrao
      or (length(p.digitos) >= 3 and (l.cpf_cnpj like '%' || p.digitos || '%'
                                      or l.telefone like '%' || p.digitos || '%'))
    )
    and (p_desde is null or l.created_at >= p_desde)
    and not exists (
      select 1
      from jsonb_each(coalesce(p_filtros, '{}'::jsonb)) f
      where jsonb_typeof(f.value) = 'array'
        and coalesce(public.lead_valor_coluna(l, f.key), '')
            not in (select jsonb_array_elements_text(f.value))
    )
$$;

-- Valores únicos + contagem de uma coluna, respeitando os filtros das OUTRAS colunas
create or replace function public.leads_valores_coluna(
  p_coluna  text,
  p_busca   text default null,
  p_filtros jsonb default '{}'::jsonb,
  p_desde   timestamptz default null
)
returns table (valor text, total bigint) language sql stable set search_path = public as $$
  select coalesce(public.lead_valor_coluna(l, p_coluna), '') as valor, count(*) as total
  from public.leads_filtrar(p_busca, coalesce(p_filtros, '{}'::jsonb) - p_coluna, p_desde) l
  group by 1
  order by 1
  limit 2000
$$;

grant execute on function public.lead_valor_coluna(public.leads, text) to authenticated;
grant execute on function public.leads_filtrar(text, jsonb, timestamptz) to authenticated;
grant execute on function public.leads_valores_coluna(text, text, jsonb, timestamptz) to authenticated;

-- ── Realtime ───────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'leads'
     ) then
    alter publication supabase_realtime add table public.leads;
  end if;
end $$;

notify pgrst, 'reload schema';
