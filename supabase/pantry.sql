-- Additive shared pantry update; applied remotely as add_shared_pantry.
create table public.pantry_items (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(length(trim(name))>0),brand text not null default '',
 barcode text check(barcode ~ '^(\d{8}|\d{12}|\d{13}|\d{14})$'),
 category text not null check(category in ('protein','carb','vegetable','seasoning','other')),
 state text not null check(state in ('raw','cooked','as_sold')),
 basis_unit text not null default 'g' check(basis_unit in ('g','ml')),
 label_basis numeric not null default 100 check(label_basis>0 and label_basis<'Infinity'::numeric),
 calories numeric not null check(calories>=0 and calories<'Infinity'::numeric),
 protein numeric not null check(protein>=0 and protein<'Infinity'::numeric),
 carbs numeric not null check(carbs>=0 and carbs<'Infinity'::numeric),
 fat numeric not null check(fat>=0 and fat<'Infinity'::numeric),
 description text not null default '',source text not null,source_url text,source_id text,
 archived boolean not null default false,created_at timestamptz not null default now(),
 unique(owner_id,barcode)
);
alter table public.pantry_items enable row level security;
revoke all on public.pantry_items from public,anon;
grant select,insert,update on public.pantry_items to authenticated;
create policy "owner pantry items" on public.pantry_items for all to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));

create or replace function public.import_local_data(payload jsonb) returns jsonb
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
  insert into public.pantry_items(id,owner_id,name,brand,barcode,category,state,basis_unit,label_basis,calories,protein,carbs,fat,description,source,source_url,source_id,archived)
  values((item->>'id')::uuid,household,item->>'name',coalesce(item->>'brand',''),nullif(item->>'barcode',''),coalesce(item->>'category','other'),item->>'state',coalesce(item->>'basis_unit','g'),coalesce((item->>'label_basis')::numeric,100),
   (item->>'calories')::numeric,(item->>'protein')::numeric,(item->>'carbs')::numeric,(item->>'fat')::numeric,coalesce(item->>'description',''),coalesce(item->>'source','Imported label'),item->>'source_url',item->>'source_id',coalesce((item->>'archived')::boolean,false));
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
