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
