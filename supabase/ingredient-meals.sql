-- Additive update for an existing Daily Fuel installation.
-- Applied remotely as add_one_off_meal_ingredients; schema.sql is the fresh bootstrap.
alter table public.entries add column ingredient_items jsonb not null default '[]'::jsonb
 constraint entries_ingredient_items_check check(jsonb_typeof(ingredient_items)='array');

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
begin
 if household is null then raise exception 'Sign in before importing' using errcode='42501'; end if;
 if jsonb_typeof(payload)<>'object' or jsonb_typeof(payload->'profiles')<>'array'
    or jsonb_typeof(payload->'recipes')<>'array' or jsonb_typeof(payload->'entries')<>'array'
    or jsonb_typeof(payload->'weights')<>'array' then raise exception 'Invalid local snapshot'; end if;
 -- Serialize imports for this account, including retries from another tab.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(household::text,0));
 if exists(select 1 from public.import_receipts where owner_id=household and fingerprint=fingerprint_value) then
  return jsonb_build_object('already_imported',true);
 end if;
 if exists(select 1 from public.entries where owner_id=household)
    or exists(select 1 from public.recipes where owner_id=household)
    or exists(select 1 from public.weights where owner_id=household) then
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
 return jsonb_build_object('profiles',profile_count,'recipes',recipe_count,'entries',entry_count,'weights',weight_count);
end;
$$;
revoke all on function public.import_local_data(jsonb) from public,anon;
grant execute on function public.import_local_data(jsonb) to authenticated;
