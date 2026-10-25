-- Daily Fuel: authenticated household data. Apply to a fresh Supabase project.
create table public.profiles (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 slot text not null check(slot in ('new','ben')), name text not null check(length(trim(name))>0),
 sex text not null check(sex in ('female','male')), age integer not null check(age between 18 and 120),
 weight numeric not null check(weight>0 and weight<=500),height numeric not null check(height between 50 and 250),
 activity numeric not null check(activity in (1.2,1.375,1.55,1.725,1.9)),
 body_fat numeric check(body_fat>0 and body_fat<100),
 goal text not null default 'maintain' check(goal in ('maintain','lose','gain')),
 adjustment integer not null default 0,
 macro_plan text not null default 'moderate' check(macro_plan in ('moderate','lower','higher')),
 unique(owner_id,slot),unique(id,owner_id)
);
create table public.recipes (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(length(trim(name))>0), servings numeric not null check(servings>0),ingredients text not null default '',
 calories numeric not null default 0 check(calories>=0),protein numeric not null default 0 check(protein>=0),
 carbs numeric not null default 0 check(carbs>=0),fat numeric not null default 0 check(fat>=0),
 ingredient_items jsonb not null default '[]'::jsonb check(jsonb_typeof(ingredient_items)='array'),
 yield_grams numeric check(yield_grams>0),unique(id,owner_id)
);
create table public.pantry_items (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(length(trim(name))>0),brand text not null default '',
 barcode text check(barcode ~ '^(\d{8}|\d{12}|\d{13}|\d{14})$'),
 category text not null check(category in ('protein','carb','vegetable','seasoning','other')),
 state text not null check(state in ('raw','cooked','as_sold')),
 basis_unit text not null default 'g' check(basis_unit in ('g','ml')),
 label_basis numeric not null default 100 check(label_basis>0 and label_basis<'Infinity'::numeric),
 calories numeric check(calories>=0 and calories<'Infinity'::numeric),
 protein numeric check(protein>=0 and protein<'Infinity'::numeric),
 carbs numeric check(carbs>=0 and carbs<'Infinity'::numeric),
 fat numeric check(fat>=0 and fat<'Infinity'::numeric),
 description text not null default '',source text not null,source_url text,source_id text,
 needs_nutrition boolean not null default false,
 check(needs_nutrition or (calories is not null and protein is not null and carbs is not null and fat is not null)),
 archived boolean not null default false,created_at timestamptz not null default now(),
 unique(owner_id,barcode)
);
alter table public.pantry_items enable row level security;
revoke all on public.pantry_items from public,anon;
grant select,insert,update on public.pantry_items to authenticated;
create policy "owner pantry items" on public.pantry_items for all to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));

create table public.entries (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 profile_id uuid not null, date date not null,
 meal text not null check(meal in ('Breakfast','Lunch','Dinner','Snack')), name text not null,
 calories numeric not null check(calories>=0),protein numeric not null default 0 check(protein>=0),
 carbs numeric not null default 0 check(carbs>=0),fat numeric not null default 0 check(fat>=0),
 ingredient_items jsonb not null default '[]'::jsonb check(jsonb_typeof(ingredient_items)='array'),
 recipe_id uuid,portion_amount numeric check(portion_amount>0),portion_unit text check(portion_unit in ('grams','servings')),
 check((portion_amount is null)=(portion_unit is null)),
 foreign key(profile_id,owner_id) references public.profiles(id,owner_id) on delete cascade,
 foreign key(recipe_id,owner_id) references public.recipes(id,owner_id)
);
create table public.weights (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id) on delete cascade,
 profile_id uuid not null,date date not null,weight numeric not null check(weight>0),
 foreign key(profile_id,owner_id) references public.profiles(id,owner_id) on delete cascade
);
create table public.import_receipts (
 owner_id uuid not null references auth.users(id) on delete cascade,
 fingerprint text not null,imported_at timestamptz not null default now(),
 primary key(owner_id,fingerprint)
);
create index entries_owner_idx on public.entries(owner_id);
create index entries_profile_date_idx on public.entries(profile_id,owner_id,date);
create index entries_recipe_idx on public.entries(recipe_id,owner_id);
create index recipes_owner_idx on public.recipes(owner_id);
create index weights_owner_idx on public.weights(owner_id);
create index weights_profile_date_idx on public.weights(profile_id,owner_id,date);
alter table public.profiles enable row level security;
alter table public.entries enable row level security;
alter table public.recipes enable row level security;
alter table public.weights enable row level security;
alter table public.import_receipts enable row level security;
revoke all on public.profiles,public.entries,public.recipes,public.weights,public.import_receipts from anon,public;
grant usage on schema public to authenticated;
grant select,insert,update,delete on public.profiles,public.entries,public.recipes,public.weights to authenticated;
grant select,insert on public.import_receipts to authenticated;
create policy "owner profiles" on public.profiles for all to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy "owner entries" on public.entries for all to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy "owner recipes" on public.recipes for all to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy "owner weights" on public.weights for all to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy "owner import receipts read" on public.import_receipts for select to authenticated using(owner_id=(select auth.uid()));
create policy "owner import receipts write" on public.import_receipts for insert to authenticated with check(owner_id=(select auth.uid()));

-- One transaction for profiles, recipes, diary and weights. No service key or
-- security-definer privileges: all operations run through the caller's RLS.
create function public.import_local_data(payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
 household uuid := auth.uid();
 fingerprint_value text := md5(payload::text);
 item jsonb;
 mapped_profile uuid;
 profile_count integer := 0;
 recipe_count integer := 0;
 entry_count integer := 0;
 weight_count integer := 0;
 pantry_count integer := 0;
begin
 if household is null then raise exception 'Sign in before importing' using errcode='42501'; end if;
 if jsonb_typeof(payload)<>'object' or jsonb_typeof(payload->'profiles')<>'array'
    or jsonb_typeof(payload->'recipes')<>'array' or jsonb_typeof(payload->'entries')<>'array'
    or jsonb_typeof(payload->'weights')<>'array' then raise exception 'Invalid local snapshot'; end if;
 if payload ? 'pantry' and jsonb_typeof(payload->'pantry')<>'array' then raise exception 'Invalid pantry snapshot'; end if;
 -- Serialize imports for this account, including retries from another tab.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(household::text,0));
 if exists(select 1 from public.import_receipts where owner_id=household and fingerprint=fingerprint_value) then
  return jsonb_build_object('already_imported',true);
 end if;
 if exists(select 1 from public.entries where owner_id=household)
    or exists(select 1 from public.recipes where owner_id=household)
    or exists(select 1 from public.weights where owner_id=household)
    or exists(select 1 from public.pantry_items where owner_id=household) then
  raise exception 'Cloud data already exists; import is available only for an empty household';
 end if;
 for item in select value from jsonb_array_elements(payload->'profiles') loop
  insert into public.profiles(owner_id,slot,name,sex,age,weight,height,activity,body_fat,goal,adjustment,macro_plan)
  values(household,item->>'id',item->>'name',item->>'sex',(item->>'age')::integer,(item->>'weight')::numeric,
   (item->>'height')::numeric,(item->>'activity')::numeric,(item->>'body_fat')::numeric,
   item->>'goal',(item->>'adjustment')::integer,coalesce(item->>'macro_plan','moderate'))
  on conflict(owner_id,slot) do update set name=excluded.name,sex=excluded.sex,age=excluded.age,weight=excluded.weight,
   height=excluded.height,activity=excluded.activity,body_fat=excluded.body_fat,goal=excluded.goal,adjustment=excluded.adjustment,macro_plan=excluded.macro_plan;
  profile_count:=profile_count+1;
 end loop;
 for item in select value from jsonb_array_elements(coalesce(payload->'pantry','[]'::jsonb)) loop
  insert into public.pantry_items(id,owner_id,name,brand,barcode,category,state,basis_unit,label_basis,calories,protein,carbs,fat,description,source,source_url,source_id,archived,needs_nutrition)
  values((item->>'id')::uuid,household,item->>'name',coalesce(item->>'brand',''),nullif(item->>'barcode',''),coalesce(item->>'category','other'),item->>'state',coalesce(item->>'basis_unit','g'),coalesce((item->>'label_basis')::numeric,100),
   (item->>'calories')::numeric,(item->>'protein')::numeric,(item->>'carbs')::numeric,(item->>'fat')::numeric,coalesce(item->>'description',''),coalesce(item->>'source','Imported label'),item->>'source_url',item->>'source_id',coalesce((item->>'archived')::boolean,false),coalesce((item->>'needs_nutrition')::boolean,false));
  pantry_count:=pantry_count+1;
 end loop;
 for item in select value from jsonb_array_elements(payload->'recipes') loop
  insert into public.recipes(id,owner_id,name,servings,ingredients,calories,protein,carbs,fat,ingredient_items,yield_grams)
  values((item->>'id')::uuid,household,item->>'name',(item->>'servings')::numeric,coalesce(item->>'ingredients',''),
   (item->>'calories')::numeric,(item->>'protein')::numeric,(item->>'carbs')::numeric,(item->>'fat')::numeric,
   coalesce(item->'ingredient_items','[]'::jsonb),(item->>'yield_grams')::numeric);
  recipe_count:=recipe_count+1;
 end loop;
 for item in select value from jsonb_array_elements(payload->'entries') loop
  select id into mapped_profile from public.profiles where owner_id=household and slot=item->>'profile_id';
  if mapped_profile is null then raise exception 'Unknown profile in diary'; end if;
  insert into public.entries(id,owner_id,profile_id,date,meal,name,calories,protein,carbs,fat,recipe_id,portion_amount,portion_unit,ingredient_items)
  values((item->>'id')::uuid,household,mapped_profile,(item->>'date')::date,item->>'meal',item->>'name',
   (item->>'calories')::numeric,(item->>'protein')::numeric,(item->>'carbs')::numeric,(item->>'fat')::numeric,
   (item->>'recipe_id')::uuid,(item->>'portion_amount')::numeric,item->>'portion_unit',coalesce(item->'ingredient_items','[]'::jsonb));
  entry_count:=entry_count+1;
 end loop;
 for item in select value from jsonb_array_elements(payload->'weights') loop
  select id into mapped_profile from public.profiles where owner_id=household and slot=item->>'profile_id';
  if mapped_profile is null then raise exception 'Unknown profile in weights'; end if;
  insert into public.weights(id,owner_id,profile_id,date,weight)
  values((item->>'id')::uuid,household,mapped_profile,(item->>'date')::date,(item->>'weight')::numeric);
  weight_count:=weight_count+1;
 end loop;
 insert into public.import_receipts(owner_id,fingerprint) values(household,fingerprint_value);
 return jsonb_build_object('profiles',profile_count,'recipes',recipe_count,'entries',entry_count,'weights',weight_count,'pantry',pantry_count);
end;
$$;
revoke all on function public.import_local_data(jsonb) from public,anon;
grant execute on function public.import_local_data(jsonb) to authenticated;

-- Reusable menu projection across explicitly linked accounts.
-- Private links are administered separately; no real account identifiers belong in source.
create schema if not exists dailyfuel_private;
revoke all on schema dailyfuel_private from public,anon,authenticated;
grant usage on schema dailyfuel_private to authenticated;

create table dailyfuel_private.menu_links (
 owner_id uuid not null references auth.users(id) on delete cascade,
 partner_id uuid not null references auth.users(id) on delete cascade,
 primary key(owner_id,partner_id),check(owner_id<>partner_id)
);
create index menu_links_partner_idx on dailyfuel_private.menu_links(partner_id);
alter table dailyfuel_private.menu_links enable row level security;
create policy "no direct link access" on dailyfuel_private.menu_links for all to authenticated using(false) with check(false);
revoke all on dailyfuel_private.menu_links from public,anon,authenticated;

-- Deliberate narrow privilege boundary: foreign diaries remain owner-only under RLS.
-- This private, read-only function releases only distinct reusable name/nutrient values
-- for an administrator-linked partner of auth.uid(). No diary IDs, dates, meal slots,
-- portions, ingredient snapshots, goals, weights, or account identifiers are returned.
create function dailyfuel_private.partner_menu_options(search_query text default '')
returns table(menu_key text,profile_slot text,profile_name text,name text,calories numeric,protein numeric,carbs numeric,fat numeric)
language plpgsql stable security definer set search_path='' as $$
begin
 if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if length(coalesce(search_query,''))>200 then raise exception 'Search text is too long' using errcode='22023'; end if;
 return query
 with menus as (
  select p.slot as source_slot,p.name as source_name,btrim(e.name) as food_name,
   e.calories as energy,e.protein as proteins,e.carbs as carbohydrates,e.fat as fats,max(e.date) as last_seen
  from dailyfuel_private.menu_links l
  join public.entries e on e.owner_id=l.partner_id
  join public.profiles p on p.id=e.profile_id and p.owner_id=e.owner_id
  where l.owner_id=(select auth.uid()) and length(btrim(e.name))>0
   and strpos(lower(e.name),lower(btrim(coalesce(search_query,''))))>0
   and e.calories>=0 and e.calories<'Infinity'::numeric and e.protein>=0 and e.protein<'Infinity'::numeric
   and e.carbs>=0 and e.carbs<'Infinity'::numeric and e.fat>=0 and e.fat<'Infinity'::numeric
  group by p.slot,p.name,btrim(e.name),e.calories,e.protein,e.carbs,e.fat
 ), ranked as (
  select m.*,row_number() over(partition by m.source_slot order by m.last_seen desc,m.food_name,m.energy,m.proteins,m.carbohydrates,m.fats) as position
  from menus m
 )
 select md5(jsonb_build_array(r.source_slot,r.source_name,r.food_name,r.energy,r.proteins,r.carbohydrates,r.fats)::text),
  r.source_slot,r.source_name,r.food_name,r.energy,r.proteins,r.carbohydrates,r.fats
 from ranked r where r.position<=5 order by r.source_slot,r.position;
end;
$$;
revoke all on function dailyfuel_private.partner_menu_options(text) from public,anon;
grant execute on function dailyfuel_private.partner_menu_options(text) to authenticated;

create function public.shared_menu_options(search_query text default '')
returns table(menu_key text,profile_slot text,profile_name text,name text,calories numeric,protein numeric,carbs numeric,fat numeric)
language sql stable security invoker set search_path='' as $$
 select * from dailyfuel_private.partner_menu_options(search_query);
$$;
revoke all on function public.shared_menu_options(text) from public,anon;
grant execute on function public.shared_menu_options(text) to authenticated;

-- Scoped OAuth bridge for Daily Fuel GPT. No service-role key is needed by the app.
-- Only SHA-256 hashes of high-entropy credentials are persisted. Raw credentials
-- are checked inside Postgres; stored hashes cannot be replayed as bearer tokens.
create table dailyfuel_private.gpt_clients (
 id uuid primary key default gen_random_uuid(),
 creator uuid not null references auth.users(id) on delete cascade,
 redirect_uri text not null, secret_hash text not null,
 revoked boolean not null default false,created_at timestamptz not null default now()
);
create index gpt_clients_creator_idx on dailyfuel_private.gpt_clients(creator);
create table dailyfuel_private.gpt_grants (
 client_id uuid not null references dailyfuel_private.gpt_clients(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 profile_id uuid not null,recipient_id uuid not null default gen_random_uuid() unique,
 allow_partner boolean not null default false,active boolean not null default true,
 primary key(client_id,owner_id),
 foreign key(profile_id,owner_id) references public.profiles(id,owner_id) on delete cascade
);
create index gpt_grants_owner_idx on dailyfuel_private.gpt_grants(owner_id);
create index gpt_grants_profile_idx on dailyfuel_private.gpt_grants(profile_id,owner_id);
create table dailyfuel_private.gpt_codes (
 code_hash text primary key,client_id uuid not null,owner_id uuid not null,
 redirect_uri text not null,challenge text,
 expires_at timestamptz not null default now()+interval '5 minutes',used boolean not null default false,
 foreign key(client_id,owner_id) references dailyfuel_private.gpt_grants(client_id,owner_id) on delete cascade
);
create index gpt_codes_grant_idx on dailyfuel_private.gpt_codes(client_id,owner_id);
create table dailyfuel_private.gpt_tokens (
 access_hash text primary key,refresh_hash text not null unique,
 client_id uuid not null,owner_id uuid not null,family_id uuid not null,
 expires_at timestamptz not null default now()+interval '1 hour',
 refresh_expires_at timestamptz not null default now()+interval '30 days',
 refresh_used boolean not null default false,revoked boolean not null default false,
 foreign key(client_id,owner_id) references dailyfuel_private.gpt_grants(client_id,owner_id) on delete cascade
);
create index gpt_tokens_grant_idx on dailyfuel_private.gpt_tokens(client_id,owner_id);
create index gpt_tokens_family_idx on dailyfuel_private.gpt_tokens(family_id);
create table dailyfuel_private.gpt_drafts (
 id uuid primary key default gen_random_uuid(),client_id uuid not null,owner_id uuid not null,
 request_id uuid not null,request_hash text not null,entries jsonb not null,
 expires_at timestamptz not null default now()+interval '15 minutes',response jsonb,
 unique(client_id,owner_id,request_id),
 foreign key(client_id,owner_id) references dailyfuel_private.gpt_grants(client_id,owner_id) on delete cascade
);
do $$ declare t text; begin
 foreach t in array array['gpt_clients','gpt_grants','gpt_codes','gpt_tokens','gpt_drafts'] loop
  execute format('alter table dailyfuel_private.%I enable row level security',t);
  execute format('revoke all on dailyfuel_private.%I from public,anon,authenticated',t);
  execute format('create policy "no direct access" on dailyfuel_private.%I for all to anon,authenticated using(false) with check(false)',t);
 end loop;
end $$;

alter table public.entries add column nutrition_source text not null default 'manual'
 check(nutrition_source in ('manual','chatgpt_estimate','label','provided'));

create function dailyfuel_private.gpt_hash(value text) returns text
language sql immutable strict set search_path='' as $$
 select encode(extensions.digest(value,'sha256'),'hex');
$$;
create function dailyfuel_private.gpt_client_allowed(actor uuid,client uuid) returns boolean
language sql stable set search_path='' as $$
 select exists(select 1 from dailyfuel_private.gpt_clients c where c.id=client and not c.revoked and
  (c.creator=actor or (exists(select 1 from dailyfuel_private.menu_links l where l.owner_id=actor and l.partner_id=c.creator)
   and exists(select 1 from dailyfuel_private.menu_links l where l.owner_id=c.creator and l.partner_id=actor))));
$$;
create function dailyfuel_private.gpt_identity(token text) returns table(actor uuid,client uuid)
language sql stable set search_path='' as $$
 select t.owner_id,t.client_id from dailyfuel_private.gpt_tokens t
 join dailyfuel_private.gpt_grants g on g.client_id=t.client_id and g.owner_id=t.owner_id
 where t.access_hash=dailyfuel_private.gpt_hash(token) and not t.revoked and t.expires_at>now()
  and g.active and dailyfuel_private.gpt_client_allowed(t.owner_id,t.client_id);
$$;
create function dailyfuel_private.gpt_targets(actor uuid,client uuid) returns jsonb
language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('recipient_id',g.recipient_id,'display_name',p.name,
  'person',p.slot,'relationship',case when g.owner_id=actor then 'self' else 'partner' end)
  order by (g.owner_id=actor) desc,p.slot),'[]'::jsonb)
 from dailyfuel_private.gpt_grants g join public.profiles p on p.id=g.profile_id and p.owner_id=g.owner_id
 join dailyfuel_private.gpt_grants own on own.client_id=client and own.owner_id=actor and own.active
 where g.client_id=client and g.active and dailyfuel_private.gpt_client_allowed(g.owner_id,client) and (g.owner_id=actor or
  (own.allow_partner and g.allow_partner
   and exists(select 1 from dailyfuel_private.menu_links l where l.owner_id=actor and l.partner_id=g.owner_id)
   and exists(select 1 from dailyfuel_private.menu_links l where l.owner_id=g.owner_id and l.partner_id=actor)));
$$;
revoke all on function dailyfuel_private.gpt_hash(text),dailyfuel_private.gpt_client_allowed(uuid,uuid),
 dailyfuel_private.gpt_identity(text),dailyfuel_private.gpt_targets(uuid,uuid) from public,anon,authenticated;

-- A deliberately narrow security-definer boundary: ordinary Supabase sessions may
-- manage their own consent; opaque OAuth capabilities may only list recipients,
-- prepare drafts and append an atomic, idempotent batch. No diary reads/edits,
-- weight/profile/goal writes, or self-created partner relationships are exposed.
create function dailyfuel_private.gpt_bridge(action text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 actor uuid; client uuid; profile uuid; callback text; secret text; code text;
 access_value text;refresh_value text;family uuid;refresh_deadline timestamptz;
 client_row dailyfuel_private.gpt_clients%rowtype;
 grant_row dailyfuel_private.gpt_grants%rowtype;
 code_row dailyfuel_private.gpt_codes%rowtype;
 token_row dailyfuel_private.gpt_tokens%rowtype;
 draft dailyfuel_private.gpt_drafts%rowtype;
 targets jsonb;item jsonb;target jsonb;normalized jsonb:='[]';summary jsonb:='[]';result jsonb:='[]';
 request_uuid uuid;request_hash text;recipient uuid;entry_uuid uuid;key text;value numeric;normalized_item jsonb;
begin
 if jsonb_typeof(payload) is distinct from 'object' then raise exception 'Invalid request' using errcode='22023'; end if;
 if action in ('connections','register','configure','authorize','revoke','revoke_client') then
  actor:=(select auth.uid());
  if actor is null then raise exception 'Sign in to Daily Fuel' using errcode='42501'; end if;
 end if;

 if action='connections' then
  return jsonb_build_object('clients',coalesce((select jsonb_agg(jsonb_build_object(
   'client_id',c.id,'redirect_uri',c.redirect_uri,'is_creator',c.creator=actor,
   'person',p.slot,'allow_partner',coalesce(g.allow_partner,false),'active',coalesce(g.active,false)) order by c.created_at)
   from dailyfuel_private.gpt_clients c left join dailyfuel_private.gpt_grants g on g.client_id=c.id and g.owner_id=actor
   left join public.profiles p on p.id=g.profile_id and p.owner_id=actor
   where dailyfuel_private.gpt_client_allowed(actor,c.id)),'[]'::jsonb));
 elsif action='register' then
  callback:=payload->>'redirect_uri';
  if callback is null or length(callback)>512 or callback ~ '[[:cntrl:]]' or
   callback !~ '^https://(chatgpt\.com|chat\.openai\.com)/aip/g-[A-Za-z0-9-]+/oauth/callback$' then
   raise exception 'Use the exact ChatGPT OAuth callback URL' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('gpt-client:'||actor::text,0));
  if (select count(*) from dailyfuel_private.gpt_clients where creator=actor and not revoked)>=3 then
   raise exception 'Revoke an old GPT connection before creating another' using errcode='22023';
  end if;
  secret:='df_s_'||encode(extensions.gen_random_bytes(32),'hex');
  insert into dailyfuel_private.gpt_clients(creator,redirect_uri,secret_hash)
   values(actor,callback,dailyfuel_private.gpt_hash(secret)) returning id into client;
  return jsonb_build_object('client_id',client,'client_secret',secret,'redirect_uri',callback);
 elsif action='metadata' then
  client:=(payload->>'client_id')::uuid;
  select * into client_row from dailyfuel_private.gpt_clients c where c.id=client and not c.revoked;
  if not found or client_row.redirect_uri is distinct from payload->>'redirect_uri' then
   raise exception 'Invalid OAuth client or callback' using errcode='22023';
  end if;
  return jsonb_build_object('client_id',client,'client_name','Daily Fuel GPT','redirect_uri',client_row.redirect_uri);
 elsif action in ('configure','authorize','revoke','revoke_client') then
  client:=(payload->>'client_id')::uuid;
  if not dailyfuel_private.gpt_client_allowed(actor,client) then raise exception 'Connection is not available to this account' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('gpt-grants:'||client::text,0));
  if action='revoke_client' then
   update dailyfuel_private.gpt_clients set revoked=true where id=client and creator=actor;
   if not found then raise exception 'Only the creator can revoke this client' using errcode='42501'; end if;
   return jsonb_build_object('revoked',true);
  elsif action='revoke' then
   update dailyfuel_private.gpt_grants set active=false,allow_partner=false where client_id=client and owner_id=actor;
   update dailyfuel_private.gpt_tokens set revoked=true where client_id=client and owner_id=actor;
   update dailyfuel_private.gpt_codes set used=true where client_id=client and owner_id=actor;
   return jsonb_build_object('revoked',true);
  end if;
  select p.id into profile from public.profiles p where p.owner_id=actor and p.slot=payload->>'person';
  if profile is null or jsonb_typeof(payload->'allow_partner') is distinct from 'boolean' then
   raise exception 'Choose your own profile and consent preference' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('gpt-grants:'||client::text,0));
  if exists(select 1 from dailyfuel_private.gpt_grants g join public.profiles p on p.id=g.profile_id
   where g.client_id=client and g.owner_id<>actor and g.active and dailyfuel_private.gpt_client_allowed(g.owner_id,client) and p.slot=payload->>'person') then
   raise exception 'The two accounts must select different people' using errcode='22023';
  end if;
  if exists(select 1 from dailyfuel_private.gpt_grants g where g.client_id=client and g.owner_id=actor and (g.profile_id<>profile or not g.active)) then
   update dailyfuel_private.gpt_tokens set revoked=true where client_id=client and owner_id=actor;
   update dailyfuel_private.gpt_codes set used=true where client_id=client and owner_id=actor;
  end if;
  insert into dailyfuel_private.gpt_grants(client_id,owner_id,profile_id,allow_partner)
   values(client,actor,profile,(payload->>'allow_partner')::boolean)
   on conflict(client_id,owner_id) do update set profile_id=excluded.profile_id,
    recipient_id=case when gpt_grants.profile_id<>excluded.profile_id or not gpt_grants.active then gen_random_uuid() else gpt_grants.recipient_id end,
    allow_partner=excluded.allow_partner,active=true;
  if action='configure' then return jsonb_build_object('configured',true); end if;
  select * into client_row from dailyfuel_private.gpt_clients c where c.id=client;
  if client_row.redirect_uri is distinct from payload->>'redirect_uri' or payload->>'scope' is distinct from 'meals.write' then
   raise exception 'Invalid OAuth callback or scope' using errcode='22023'; end if;
  if payload->>'challenge' is not null and (payload->>'challenge' !~ '^[A-Za-z0-9_-]{43}$') then
   raise exception 'Invalid S256 challenge' using errcode='22023'; end if;
  code:='df_c_'||encode(extensions.gen_random_bytes(32),'hex');
  insert into dailyfuel_private.gpt_codes(code_hash,client_id,owner_id,redirect_uri,challenge)
   values(dailyfuel_private.gpt_hash(code),client,actor,client_row.redirect_uri,payload->>'challenge');
  return jsonb_build_object('code',code,'redirect_uri',client_row.redirect_uri);
 elsif action='exchange' then
  begin client:=(payload->>'client_id')::uuid; exception when invalid_text_representation then return jsonb_build_object('error','invalid_client'); end;
  select * into client_row from dailyfuel_private.gpt_clients c where c.id=client and not c.revoked
   and c.secret_hash=dailyfuel_private.gpt_hash(payload->>'client_secret');
  if not found then return jsonb_build_object('error','invalid_client'); end if;
  -- Serialize exchange/rotation with consent changes so old credentials cannot
  -- escape a concurrent profile change or revoke.
  perform pg_advisory_xact_lock(hashtextextended('gpt-grants:'||client::text,0));
  if payload->>'grant_type'='authorization_code' then
   select * into code_row from dailyfuel_private.gpt_codes c where c.code_hash=dailyfuel_private.gpt_hash(payload->>'code') and c.client_id=client for update;
   if not found or code_row.used or code_row.expires_at<=now() or code_row.redirect_uri is distinct from payload->>'redirect_uri' then
    return jsonb_build_object('error','invalid_grant'); end if;
   if code_row.challenge is not null and (payload->>'code_verifier' is null or payload->>'code_verifier' !~ '^[A-Za-z0-9._~-]{43,128}$' or
    code_row.challenge<>rtrim(translate(encode(extensions.digest(payload->>'code_verifier','sha256'),'base64'),'+/','-_'),'=')) then
    return jsonb_build_object('error','invalid_grant'); end if;
   actor:=code_row.owner_id;family:=gen_random_uuid();refresh_deadline:=now()+interval '30 days';
   update dailyfuel_private.gpt_codes set used=true where code_hash=code_row.code_hash;
  elsif payload->>'grant_type'='refresh_token' then
   select * into token_row from dailyfuel_private.gpt_tokens t where t.refresh_hash=dailyfuel_private.gpt_hash(payload->>'refresh_token') and t.client_id=client for update;
   if not found then return jsonb_build_object('error','invalid_grant'); end if;
   if token_row.refresh_used then
    update dailyfuel_private.gpt_tokens set revoked=true where family_id=token_row.family_id;
    return jsonb_build_object('error','invalid_grant');
   end if;
   if token_row.revoked or token_row.refresh_expires_at<=now() then return jsonb_build_object('error','invalid_grant'); end if;
   actor:=token_row.owner_id;family:=token_row.family_id;refresh_deadline:=token_row.refresh_expires_at;
   update dailyfuel_private.gpt_tokens set refresh_used=true,revoked=true where access_hash=token_row.access_hash;
  else return jsonb_build_object('error','unsupported_grant_type'); end if;
  if not dailyfuel_private.gpt_client_allowed(actor,client) or not exists(select 1 from dailyfuel_private.gpt_grants g where g.client_id=client and g.owner_id=actor and g.active) then
   return jsonb_build_object('error','invalid_grant'); end if;
  access_value:='df_a_'||encode(extensions.gen_random_bytes(32),'hex');refresh_value:='df_r_'||encode(extensions.gen_random_bytes(32),'hex');
  insert into dailyfuel_private.gpt_tokens(access_hash,refresh_hash,client_id,owner_id,family_id,refresh_expires_at)
   values(dailyfuel_private.gpt_hash(access_value),dailyfuel_private.gpt_hash(refresh_value),client,actor,family,refresh_deadline);
  return jsonb_build_object('access_token',access_value,'refresh_token',refresh_value,'token_type','bearer','expires_in',3600,'scope','meals.write');
 elsif action in ('targets','prepare','confirm') then
  select i.actor,i.client into actor,client from dailyfuel_private.gpt_identity(payload->>'access_token') i;
  if actor is null then raise exception 'Invalid or expired access token' using errcode='28000'; end if;
  if action='targets' then return jsonb_build_object('recipients',dailyfuel_private.gpt_targets(actor,client)); end if;
  -- Hold consent/client/relationship rows through the append transaction.
  perform 1 from dailyfuel_private.gpt_clients c where c.id=client for share;
  perform 1 from dailyfuel_private.gpt_grants g where g.client_id=client for share;
  perform 1 from dailyfuel_private.menu_links l where l.owner_id=actor or l.partner_id=actor for share;
  if not exists(select 1 from dailyfuel_private.gpt_identity(payload->>'access_token')) then raise exception 'Authorization revoked' using errcode='28000'; end if;
  targets:=dailyfuel_private.gpt_targets(actor,client);
  if action='prepare' then
   request_uuid:=(payload->>'request_id')::uuid;
   if request_uuid is null or jsonb_typeof(payload->'entries') is distinct from 'array' or jsonb_array_length(payload->'entries') not between 1 and 2 then
    raise exception 'Provide one or two meal entries and a request UUID' using errcode='22023'; end if;
   for item in select x.value from jsonb_array_elements(payload->'entries') x loop
    if jsonb_typeof(item) is distinct from 'object' then raise exception 'Invalid meal entry' using errcode='22023'; end if;
    if exists(select 1 from jsonb_object_keys(item) k where k not in ('recipient_id','date','meal','name','calories','protein','carbs','fat','nutrition_source')) then
     raise exception 'Unexpected meal field' using errcode='22023'; end if;
    recipient:=(item->>'recipient_id')::uuid;
    if recipient is null or item->>'date' is null or item->>'date' !~ '^\d{4}-\d{2}-\d{2}$' or
     item->>'meal' is null or item->>'meal' not in ('Breakfast','Lunch','Dinner','Snack') or
     jsonb_typeof(item->'name') is distinct from 'string' or length(btrim(item->>'name')) not between 1 and 200 then
     raise exception 'Check recipient, date, meal and food name' using errcode='22023'; end if;
    perform (item->>'date')::date;
    if coalesce(item->>'nutrition_source','chatgpt_estimate') not in ('chatgpt_estimate','label','provided') then raise exception 'Invalid nutrition source' using errcode='22023'; end if;
    normalized_item:=jsonb_build_object('recipient_id',recipient,'date',item->>'date','meal',item->>'meal','name',btrim(item->>'name'),'nutrition_source',coalesce(item->>'nutrition_source','chatgpt_estimate'));
    foreach key in array array['calories','protein','carbs','fat'] loop
     if jsonb_typeof(item->key) is distinct from 'number' then raise exception 'All four nutrient values are required numbers' using errcode='22023'; end if;
     value:=(item->>key)::numeric;
     if value<0 or value>100000 then raise exception 'Nutrient value out of range' using errcode='22023'; end if;
     normalized_item:=normalized_item||jsonb_build_object(key,round(value,2));
    end loop;
    normalized:=normalized||jsonb_build_array(normalized_item);
   end loop;
   if (select count(distinct x->>'recipient_id') from jsonb_array_elements(normalized) x)<>jsonb_array_length(normalized) then raise exception 'Use one entry per recipient' using errcode='22023'; end if;
   select jsonb_agg(x order by x->>'recipient_id') into normalized from jsonb_array_elements(normalized) x;
   request_hash:=dailyfuel_private.gpt_hash(normalized::text);
   perform pg_advisory_xact_lock(hashtextextended('gpt-draft:'||client::text||actor::text||request_uuid::text,0));
   select * into draft from dailyfuel_private.gpt_drafts d where d.client_id=client and d.owner_id=actor and d.request_id=request_uuid for update;
   if found then
    if draft.request_hash<>request_hash then raise exception 'Request ID already used with different meal data' using errcode='23505'; end if;
    if draft.response is not null then return draft.response||jsonb_build_object('replayed',true); end if;
    if draft.expires_at<=now() then raise exception 'Draft expired; create a new request' using errcode='22023'; end if;
    return jsonb_build_object('draft_id',draft.id,'status','awaiting_confirmation','expires_at',draft.expires_at,'entries',draft.entries);
   end if;
   for item in select x.value from jsonb_array_elements(normalized) x loop
    select x.value into target from jsonb_array_elements(targets) x where x.value->>'recipient_id'=item->>'recipient_id';
    if target is null then raise exception 'Recipient has not authorized joint logging' using errcode='42501'; end if;
    summary:=summary||jsonb_build_array(item||jsonb_build_object('recipient_name',target->>'display_name','person',target->>'person'));
   end loop;
   insert into dailyfuel_private.gpt_drafts(client_id,owner_id,request_id,request_hash,entries)
    values(client,actor,request_uuid,request_hash,summary) returning * into draft;
   return jsonb_build_object('draft_id',draft.id,'status','awaiting_confirmation','expires_at',draft.expires_at,'entries',draft.entries);
  end if;
  select * into draft from dailyfuel_private.gpt_drafts d where d.id=(payload->>'draft_id')::uuid and d.owner_id=actor and d.client_id=client for update;
  if not found then raise exception 'Draft not found' using errcode='P0002'; end if;
  if draft.response is not null then return draft.response||jsonb_build_object('replayed',true); end if;
  if draft.expires_at<=now() then raise exception 'Draft expired; prepare it again' using errcode='22023'; end if;
  for item in select x.value from jsonb_array_elements(draft.entries) x loop
   select x.value into target from jsonb_array_elements(targets) x where x.value->>'recipient_id'=item->>'recipient_id';
   if target is null then raise exception 'Recipient permission changed; prepare the meal again' using errcode='42501'; end if;
   select * into grant_row from dailyfuel_private.gpt_grants g where g.client_id=client and g.recipient_id=(item->>'recipient_id')::uuid and g.active;
   if not found then raise exception 'Recipient unavailable' using errcode='42501'; end if;
   insert into public.entries(owner_id,profile_id,date,meal,name,calories,protein,carbs,fat,nutrition_source)
    values(grant_row.owner_id,grant_row.profile_id,(item->>'date')::date,item->>'meal',item->>'name',
     (item->>'calories')::numeric,(item->>'protein')::numeric,(item->>'carbs')::numeric,(item->>'fat')::numeric,item->>'nutrition_source') returning id into entry_uuid;
   result:=result||jsonb_build_array(item||jsonb_build_object('entry_id',entry_uuid));
  end loop;
  result:=jsonb_build_object('draft_id',draft.id,'request_id',draft.request_id,'status','recorded','replayed',false,'entries',result);
  update dailyfuel_private.gpt_drafts set response=result where id=draft.id;
  return result;
 end if;
 raise exception 'Unknown operation' using errcode='22023';
end;
$$;
revoke all on function dailyfuel_private.gpt_bridge(text,jsonb) from public;
grant usage on schema dailyfuel_private to anon,authenticated;
grant execute on function dailyfuel_private.gpt_bridge(text,jsonb) to anon,authenticated;
create function public.gpt_bridge(action text,payload jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$
 select dailyfuel_private.gpt_bridge(action,payload);
$$;
revoke all on function public.gpt_bridge(text,jsonb) from public;
grant execute on function public.gpt_bridge(text,jsonb) to anon,authenticated;

-- MCP adapter: issuer/resource binding, S256, and native-user review before writes.
alter table dailyfuel_private.gpt_clients add column integration text not null default 'gpt_action'
 check(integration in ('gpt_action','mcp'));
alter table dailyfuel_private.gpt_codes add column resource text;
alter table dailyfuel_private.gpt_tokens add column resource text;
alter table dailyfuel_private.gpt_drafts add column resource text;
alter table dailyfuel_private.gpt_drafts add column approved_at timestamptz;
alter table dailyfuel_private.gpt_drafts add column approved_by uuid references auth.users(id) on delete set null;
create index gpt_drafts_approved_by_idx on dailyfuel_private.gpt_drafts(approved_by);

create function dailyfuel_private.valid_mcp_callback(value text) returns boolean
language sql immutable set search_path='' as $$
 select value='https://chatgpt.com/connector_platform_oauth_redirect' or
  value ~ '^https://chatgpt\.com/connector/oauth/[A-Za-z0-9_-]+$';
$$;
revoke all on function dailyfuel_private.valid_mcp_callback(text) from public,anon,authenticated;

-- Private helper shared by the existing REST API and native review page. The model
-- cannot assert native_confirmation: only an authenticated Supabase user matching
-- the draft owner can approve an MCP draft. Both people still need fresh consent.
create function dailyfuel_private.commit_meal_draft(actor uuid,client uuid,draft_id uuid,native_confirmation boolean default false)
returns jsonb language plpgsql set search_path='' as $$
declare
 draft dailyfuel_private.gpt_drafts%rowtype; grant_row dailyfuel_private.gpt_grants%rowtype;
 targets jsonb; item jsonb; target jsonb; entry_uuid uuid; result jsonb:='[]';
begin
 perform 1 from dailyfuel_private.gpt_clients c where c.id=client for share;
 perform 1 from dailyfuel_private.gpt_grants g where g.client_id=client for share;
 perform 1 from dailyfuel_private.menu_links l where l.owner_id=actor or l.partner_id=actor for share;
 if not dailyfuel_private.gpt_client_allowed(actor,client) or not exists(select 1 from dailyfuel_private.gpt_grants g where g.client_id=client and g.owner_id=actor and g.active) then
  raise exception 'Authorization revoked' using errcode='42501'; end if;
 select * into draft from dailyfuel_private.gpt_drafts d where d.id=draft_id and d.owner_id=actor and d.client_id=client for update;
 if not found then raise exception 'Draft not found' using errcode='P0002'; end if;
 if native_confirmation and ((select auth.uid()) is distinct from actor or draft.resource is distinct from 'https://daily-fuel-inky.vercel.app/mcp') then
  raise exception 'Native account confirmation required' using errcode='42501'; end if;
 if draft.response is not null then return draft.response||jsonb_build_object('replayed',true); end if;
 if draft.expires_at<=now() then raise exception 'Draft expired; prepare it again' using errcode='22023'; end if;
 if draft.resource='https://daily-fuel-inky.vercel.app/mcp' and not native_confirmation then
  return jsonb_build_object('draft_id',draft.id,'status','awaiting_user_confirmation','expires_at',draft.expires_at,
   'confirmation_url','https://daily-fuel-inky.vercel.app/gpt/review/'||draft.id::text,'entries',draft.entries);
 end if;
 targets:=dailyfuel_private.gpt_targets(actor,client);
 for item in select x.value from jsonb_array_elements(draft.entries) x loop
  select x.value into target from jsonb_array_elements(targets) x where x.value->>'recipient_id'=item->>'recipient_id';
  if target is null then raise exception 'Recipient permission changed; prepare the meal again' using errcode='42501'; end if;
  select * into grant_row from dailyfuel_private.gpt_grants g where g.client_id=client and g.recipient_id=(item->>'recipient_id')::uuid and g.active;
  if not found then raise exception 'Recipient unavailable' using errcode='42501'; end if;
  insert into public.entries(owner_id,profile_id,date,meal,name,calories,protein,carbs,fat,nutrition_source)
   values(grant_row.owner_id,grant_row.profile_id,(item->>'date')::date,item->>'meal',item->>'name',
    (item->>'calories')::numeric,(item->>'protein')::numeric,(item->>'carbs')::numeric,(item->>'fat')::numeric,item->>'nutrition_source') returning id into entry_uuid;
  result:=result||jsonb_build_array(item||jsonb_build_object('entry_id',entry_uuid));
 end loop;
 result:=jsonb_build_object('draft_id',draft.id,'request_id',draft.request_id,'status','recorded','replayed',false,'entries',result);
 update dailyfuel_private.gpt_drafts set response=result,
  approved_at=case when native_confirmation then now() else approved_at end,
  approved_by=case when native_confirmation then actor else approved_by end where id=draft.id;
 return result;
end;
$$;
revoke all on function dailyfuel_private.commit_meal_draft(uuid,uuid,uuid,boolean) from public,anon,authenticated;

create or replace function dailyfuel_private.gpt_bridge(action text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 actor uuid; client uuid; profile uuid; callback text; secret text; code text; integration_kind text; requested_resource text;
 access_value text;refresh_value text;family uuid;refresh_deadline timestamptz;
 client_row dailyfuel_private.gpt_clients%rowtype;
 grant_row dailyfuel_private.gpt_grants%rowtype;
 code_row dailyfuel_private.gpt_codes%rowtype;
 token_row dailyfuel_private.gpt_tokens%rowtype;
 draft dailyfuel_private.gpt_drafts%rowtype;
 targets jsonb;item jsonb;target jsonb;normalized jsonb:='[]';summary jsonb:='[]';result jsonb:='[]';
 request_uuid uuid;request_hash text;recipient uuid;entry_uuid uuid;key text;value numeric;normalized_item jsonb;
begin
 if jsonb_typeof(payload) is distinct from 'object' then raise exception 'Invalid request' using errcode='22023'; end if;
 if action in ('connections','register','configure','authorize','revoke','revoke_client','review_mcp_draft','approve_mcp_draft') then
  actor:=(select auth.uid());
  if actor is null then raise exception 'Sign in to Daily Fuel' using errcode='42501'; end if;
 end if;

 if action='connections' then
  return jsonb_build_object('clients',coalesce((select jsonb_agg(jsonb_build_object(
   'client_id',c.id,'redirect_uri',c.redirect_uri,'is_creator',c.creator=actor,
   'person',p.slot,'allow_partner',coalesce(g.allow_partner,false),'active',coalesce(g.active,false),'integration',c.integration) order by c.created_at)
   from dailyfuel_private.gpt_clients c left join dailyfuel_private.gpt_grants g on g.client_id=c.id and g.owner_id=actor
   left join public.profiles p on p.id=g.profile_id and p.owner_id=actor
   where dailyfuel_private.gpt_client_allowed(actor,c.id)),'[]'::jsonb));
 elsif action='register' then
  callback:=payload->>'redirect_uri';
  integration_kind:=coalesce(payload->>'integration','gpt_action');
  if integration_kind not in ('gpt_action','mcp') or callback is null or length(callback)>512 or callback ~ '[[:cntrl:]]' or
   (integration_kind='mcp' and not coalesce(dailyfuel_private.valid_mcp_callback(callback),false)) or
   (integration_kind='gpt_action' and callback !~ '^https://(chatgpt\.com|chat\.openai\.com)/aip/g-[A-Za-z0-9-]+/oauth/callback$') then
   raise exception 'Use the exact ChatGPT OAuth callback URL' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('gpt-client:'||actor::text,0));
  if (select count(*) from dailyfuel_private.gpt_clients where creator=actor and not revoked)>=3 then
   raise exception 'Revoke an old GPT connection before creating another' using errcode='22023';
  end if;
  secret:='df_s_'||encode(extensions.gen_random_bytes(32),'hex');
  insert into dailyfuel_private.gpt_clients(creator,redirect_uri,secret_hash,integration)
   values(actor,callback,dailyfuel_private.gpt_hash(secret),integration_kind) returning id into client;
  return jsonb_build_object('client_id',client,'client_secret',secret,'redirect_uri',callback);
 elsif action='metadata' then
  client:=(payload->>'client_id')::uuid;
  select * into client_row from dailyfuel_private.gpt_clients c where c.id=client and not c.revoked;
  if not found or client_row.redirect_uri is distinct from payload->>'redirect_uri' then
   raise exception 'Invalid OAuth client or callback' using errcode='22023';
  end if;
  return jsonb_build_object('client_id',client,'client_name',case when client_row.integration='mcp' then 'Daily Fuel Plugin' else 'Daily Fuel GPT' end,'redirect_uri',client_row.redirect_uri,'integration',client_row.integration);
 elsif action in ('configure','authorize','revoke','revoke_client') then
  client:=(payload->>'client_id')::uuid;
  if not dailyfuel_private.gpt_client_allowed(actor,client) then raise exception 'Connection is not available to this account' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('gpt-grants:'||client::text,0));
  if action='revoke_client' then
   update dailyfuel_private.gpt_clients set revoked=true where id=client and creator=actor;
   if not found then raise exception 'Only the creator can revoke this client' using errcode='42501'; end if;
   return jsonb_build_object('revoked',true);
  elsif action='revoke' then
   update dailyfuel_private.gpt_grants set active=false,allow_partner=false where client_id=client and owner_id=actor;
   update dailyfuel_private.gpt_tokens set revoked=true where client_id=client and owner_id=actor;
   update dailyfuel_private.gpt_codes set used=true where client_id=client and owner_id=actor;
   return jsonb_build_object('revoked',true);
  end if;
  select p.id into profile from public.profiles p where p.owner_id=actor and p.slot=payload->>'person';
  if profile is null or jsonb_typeof(payload->'allow_partner') is distinct from 'boolean' then
   raise exception 'Choose your own profile and consent preference' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('gpt-grants:'||client::text,0));
  if exists(select 1 from dailyfuel_private.gpt_grants g join public.profiles p on p.id=g.profile_id
   where g.client_id=client and g.owner_id<>actor and g.active and dailyfuel_private.gpt_client_allowed(g.owner_id,client) and p.slot=payload->>'person') then
   raise exception 'The two accounts must select different people' using errcode='22023';
  end if;
  if exists(select 1 from dailyfuel_private.gpt_grants g where g.client_id=client and g.owner_id=actor and (g.profile_id<>profile or not g.active)) then
   update dailyfuel_private.gpt_tokens set revoked=true where client_id=client and owner_id=actor;
   update dailyfuel_private.gpt_codes set used=true where client_id=client and owner_id=actor;
  end if;
  insert into dailyfuel_private.gpt_grants(client_id,owner_id,profile_id,allow_partner)
   values(client,actor,profile,(payload->>'allow_partner')::boolean)
   on conflict(client_id,owner_id) do update set profile_id=excluded.profile_id,
    recipient_id=case when gpt_grants.profile_id<>excluded.profile_id or not gpt_grants.active then gen_random_uuid() else gpt_grants.recipient_id end,
    allow_partner=excluded.allow_partner,active=true;
  if action='configure' then return jsonb_build_object('configured',true); end if;
  select * into client_row from dailyfuel_private.gpt_clients c where c.id=client;
  if client_row.redirect_uri is distinct from payload->>'redirect_uri' or payload->>'scope' is distinct from 'meals.write' then
   raise exception 'Invalid OAuth callback or scope' using errcode='22023'; end if;
  if payload->>'challenge' is not null and (payload->>'challenge' !~ '^[A-Za-z0-9_-]{43}$') then
   raise exception 'Invalid S256 challenge' using errcode='22023'; end if;
  requested_resource:=payload->>'resource';
  if (client_row.integration='mcp' and (requested_resource is distinct from 'https://daily-fuel-inky.vercel.app/mcp' or payload->>'challenge' is null)) or
   (client_row.integration='gpt_action' and requested_resource is not null) then raise exception 'MCP requires resource binding and S256 PKCE' using errcode='22023'; end if;
  code:='df_c_'||encode(extensions.gen_random_bytes(32),'hex');
  insert into dailyfuel_private.gpt_codes(code_hash,client_id,owner_id,redirect_uri,challenge,resource)
   values(dailyfuel_private.gpt_hash(code),client,actor,client_row.redirect_uri,payload->>'challenge',requested_resource);
  return jsonb_build_object('code',code,'redirect_uri',client_row.redirect_uri);
 elsif action='exchange' then
  begin client:=(payload->>'client_id')::uuid; exception when invalid_text_representation then return jsonb_build_object('error','invalid_client'); end;
  select * into client_row from dailyfuel_private.gpt_clients c where c.id=client and not c.revoked
   and c.secret_hash=dailyfuel_private.gpt_hash(payload->>'client_secret');
  if not found then return jsonb_build_object('error','invalid_client'); end if;
  -- Serialize exchange/rotation with consent changes so old credentials cannot
  -- escape a concurrent profile change or revoke.
  perform pg_advisory_xact_lock(hashtextextended('gpt-grants:'||client::text,0));
  requested_resource:=payload->>'resource';
  if (client_row.integration='mcp' and requested_resource is distinct from 'https://daily-fuel-inky.vercel.app/mcp') or (client_row.integration='gpt_action' and requested_resource is not null) then return jsonb_build_object('error','invalid_target'); end if;
  if payload->>'grant_type'='authorization_code' then
   select * into code_row from dailyfuel_private.gpt_codes c where c.code_hash=dailyfuel_private.gpt_hash(payload->>'code') and c.client_id=client for update;
   if not found or code_row.used or code_row.expires_at<=now() or code_row.redirect_uri is distinct from payload->>'redirect_uri' or code_row.resource is distinct from requested_resource then
    return jsonb_build_object('error','invalid_grant'); end if;
   if code_row.challenge is not null and (payload->>'code_verifier' is null or payload->>'code_verifier' !~ '^[A-Za-z0-9._~-]{43,128}$' or
    code_row.challenge<>rtrim(translate(encode(extensions.digest(payload->>'code_verifier','sha256'),'base64'),'+/','-_'),'=')) then
    return jsonb_build_object('error','invalid_grant'); end if;
   actor:=code_row.owner_id;family:=gen_random_uuid();refresh_deadline:=now()+interval '30 days';
   update dailyfuel_private.gpt_codes set used=true where code_hash=code_row.code_hash;
  elsif payload->>'grant_type'='refresh_token' then
   select * into token_row from dailyfuel_private.gpt_tokens t where t.refresh_hash=dailyfuel_private.gpt_hash(payload->>'refresh_token') and t.client_id=client for update;
   if not found then return jsonb_build_object('error','invalid_grant'); end if;
   if token_row.refresh_used then
    update dailyfuel_private.gpt_tokens set revoked=true where family_id=token_row.family_id;
    return jsonb_build_object('error','invalid_grant');
   end if;
   if token_row.revoked or token_row.refresh_expires_at<=now() or token_row.resource is distinct from requested_resource then return jsonb_build_object('error','invalid_grant'); end if;
   actor:=token_row.owner_id;family:=token_row.family_id;refresh_deadline:=token_row.refresh_expires_at;
   update dailyfuel_private.gpt_tokens set refresh_used=true,revoked=true where access_hash=token_row.access_hash;
  else return jsonb_build_object('error','unsupported_grant_type'); end if;
  if not dailyfuel_private.gpt_client_allowed(actor,client) or not exists(select 1 from dailyfuel_private.gpt_grants g where g.client_id=client and g.owner_id=actor and g.active) then
   return jsonb_build_object('error','invalid_grant'); end if;
  access_value:='df_a_'||encode(extensions.gen_random_bytes(32),'hex');refresh_value:='df_r_'||encode(extensions.gen_random_bytes(32),'hex');
  insert into dailyfuel_private.gpt_tokens(access_hash,refresh_hash,client_id,owner_id,family_id,refresh_expires_at,resource)
   values(dailyfuel_private.gpt_hash(access_value),dailyfuel_private.gpt_hash(refresh_value),client,actor,family,refresh_deadline,requested_resource);
  return jsonb_build_object('access_token',access_value,'refresh_token',refresh_value,'token_type','bearer','expires_in',3600,'scope','meals.write');
 elsif action in ('review_mcp_draft','approve_mcp_draft') then
  select * into draft from dailyfuel_private.gpt_drafts d where d.id=(payload->>'draft_id')::uuid and d.owner_id=actor and d.resource='https://daily-fuel-inky.vercel.app/mcp';
  if not found then raise exception 'Draft not found for this account' using errcode='P0002'; end if;
  client:=draft.client_id;
  if action='approve_mcp_draft' then return dailyfuel_private.commit_meal_draft(actor,client,draft.id,true); end if;
  if not dailyfuel_private.gpt_client_allowed(actor,client) then raise exception 'Connection revoked' using errcode='42501'; end if;
  if draft.response is not null then return draft.response; end if;
  return jsonb_build_object('draft_id',draft.id,'status',case when draft.expires_at<=now() then 'expired' else 'awaiting_user_confirmation' end,'expires_at',draft.expires_at,'entries',draft.entries);
 elsif action in ('targets','prepare','confirm') then
  select i.actor,i.client into actor,client from dailyfuel_private.gpt_identity(payload->>'access_token') i;
  if actor is null or not exists(select 1 from dailyfuel_private.gpt_tokens t where t.access_hash=dailyfuel_private.gpt_hash(payload->>'access_token') and t.resource is not distinct from payload->>'resource') then raise exception 'Invalid or expired access token' using errcode='28000'; end if;
  if action='targets' then return jsonb_build_object('recipients',dailyfuel_private.gpt_targets(actor,client)); end if;
  -- Hold consent/client/relationship rows through the append transaction.
  perform 1 from dailyfuel_private.gpt_clients c where c.id=client for share;
  perform 1 from dailyfuel_private.gpt_grants g where g.client_id=client for share;
  perform 1 from dailyfuel_private.menu_links l where l.owner_id=actor or l.partner_id=actor for share;
  if not exists(select 1 from dailyfuel_private.gpt_identity(payload->>'access_token')) then raise exception 'Authorization revoked' using errcode='28000'; end if;
  targets:=dailyfuel_private.gpt_targets(actor,client);
  if action='prepare' then
   request_uuid:=(payload->>'request_id')::uuid;
   if request_uuid is null or jsonb_typeof(payload->'entries') is distinct from 'array' or jsonb_array_length(payload->'entries') not between 1 and 2 then
    raise exception 'Provide one or two meal entries and a request UUID' using errcode='22023'; end if;
   for item in select x.value from jsonb_array_elements(payload->'entries') x loop
    if jsonb_typeof(item) is distinct from 'object' then raise exception 'Invalid meal entry' using errcode='22023'; end if;
    if exists(select 1 from jsonb_object_keys(item) k where k not in ('recipient_id','date','meal','name','calories','protein','carbs','fat','nutrition_source')) then
     raise exception 'Unexpected meal field' using errcode='22023'; end if;
    recipient:=(item->>'recipient_id')::uuid;
    if recipient is null or item->>'date' is null or item->>'date' !~ '^\d{4}-\d{2}-\d{2}$' or
     item->>'meal' is null or item->>'meal' not in ('Breakfast','Lunch','Dinner','Snack') or
     jsonb_typeof(item->'name') is distinct from 'string' or length(btrim(item->>'name')) not between 1 and 200 then
     raise exception 'Check recipient, date, meal and food name' using errcode='22023'; end if;
    perform (item->>'date')::date;
    if coalesce(item->>'nutrition_source','chatgpt_estimate') not in ('chatgpt_estimate','label','provided') then raise exception 'Invalid nutrition source' using errcode='22023'; end if;
    normalized_item:=jsonb_build_object('recipient_id',recipient,'date',item->>'date','meal',item->>'meal','name',btrim(item->>'name'),'nutrition_source',coalesce(item->>'nutrition_source','chatgpt_estimate'));
    foreach key in array array['calories','protein','carbs','fat'] loop
     if jsonb_typeof(item->key) is distinct from 'number' then raise exception 'All four nutrient values are required numbers' using errcode='22023'; end if;
     value:=(item->>key)::numeric;
     if value<0 or value>100000 then raise exception 'Nutrient value out of range' using errcode='22023'; end if;
     normalized_item:=normalized_item||jsonb_build_object(key,round(value,2));
    end loop;
    normalized:=normalized||jsonb_build_array(normalized_item);
   end loop;
   if (select count(distinct x->>'recipient_id') from jsonb_array_elements(normalized) x)<>jsonb_array_length(normalized) then raise exception 'Use one entry per recipient' using errcode='22023'; end if;
   select jsonb_agg(x order by x->>'recipient_id') into normalized from jsonb_array_elements(normalized) x;
   request_hash:=dailyfuel_private.gpt_hash(normalized::text);
   perform pg_advisory_xact_lock(hashtextextended('gpt-draft:'||client::text||actor::text||request_uuid::text,0));
   select * into draft from dailyfuel_private.gpt_drafts d where d.client_id=client and d.owner_id=actor and d.request_id=request_uuid for update;
   if found then
    if draft.request_hash<>request_hash then raise exception 'Request ID already used with different meal data' using errcode='23505'; end if;
    if draft.response is not null then return draft.response||jsonb_build_object('replayed',true); end if;
    if draft.expires_at<=now() then raise exception 'Draft expired; create a new request' using errcode='22023'; end if;
    return jsonb_build_object('draft_id',draft.id,'status','awaiting_confirmation','expires_at',draft.expires_at,'entries',draft.entries);
   end if;
   for item in select x.value from jsonb_array_elements(normalized) x loop
    select x.value into target from jsonb_array_elements(targets) x where x.value->>'recipient_id'=item->>'recipient_id';
    if target is null then raise exception 'Recipient has not authorized joint logging' using errcode='42501'; end if;
    summary:=summary||jsonb_build_array(item||jsonb_build_object('recipient_name',target->>'display_name','person',target->>'person'));
   end loop;
   insert into dailyfuel_private.gpt_drafts(client_id,owner_id,request_id,request_hash,entries,resource)
    values(client,actor,request_uuid,request_hash,summary,payload->>'resource') returning * into draft;
   return jsonb_build_object('draft_id',draft.id,'status','awaiting_confirmation','expires_at',draft.expires_at,'entries',draft.entries);
  end if;
  if not exists(select 1 from dailyfuel_private.gpt_drafts d where d.id=(payload->>'draft_id')::uuid and d.owner_id=actor and d.client_id=client and d.resource is not distinct from payload->>'resource') then raise exception 'Draft not found for this resource' using errcode='P0002'; end if;
  return dailyfuel_private.commit_meal_draft(actor,client,(payload->>'draft_id')::uuid,false);
 end if;
 raise exception 'Unknown operation' using errcode='22023';
end;
$$;
