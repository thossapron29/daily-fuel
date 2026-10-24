-- Disposable fixture account; every row and identity is rolled back.
begin;
insert into auth.users(id,email) values('aaaaaaaa-1234-4321-aaaa-123456789abc','daily-fuel-one-off-test@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-1234-4321-aaaa-123456789abc',true);
select set_config('dailyfuel.one_off_payload','{"profiles":[{"id":"new","name":"Fixture New","sex":"female","age":30,"weight":60,"height":165,"activity":1.2,"goal":"maintain","adjustment":0},{"id":"ben","name":"Fixture Ben","sex":"male","age":30,"weight":70,"height":175,"activity":1.2,"goal":"maintain","adjustment":0}],"recipes":[],"weights":[],"entries":[{"id":"bbbbbbbb-1234-4321-bbbb-123456789abc","profile_id":"new","date":"2026-10-24","meal":"Dinner","name":"One-off fixture","calories":220,"protein":25,"carbs":0,"fat":12.5,"ingredient_items":[{"id":"beef-row","grams":125,"food":{"id":"usda-174030","group":"beef-90","name":"Beef","description":"Raw beef","state":"raw","source":"USDA","source_id":"174030","calories":176,"protein":20,"carbs":0,"fat":10}}]}]}',true);
select public.import_local_data(current_setting('dailyfuel.one_off_payload')::jsonb);
do $$ declare rejected boolean:=false; begin
 if not exists(select 1 from public.entries where recipe_id is null and calories=220 and ingredient_items->0->>'grams'='125' and ingredient_items->0->'food'->>'source_id'='174030') then raise exception 'Ingredient snapshot did not round trip'; end if;
 if exists(select 1 from public.recipes) then raise exception 'One-off meal created a recipe'; end if;
 if not (public.import_local_data(current_setting('dailyfuel.one_off_payload')::jsonb)->>'already_imported')::boolean or (select count(*) from public.entries)<>1 then raise exception 'Retry duplicated the meal'; end if;
 insert into public.entries(owner_id,profile_id,date,meal,name,calories) select owner_id,id,'2026-10-24','Snack','Legacy fixture',0 from public.profiles where slot='ben';
 if not exists(select 1 from public.entries where name='Legacy fixture' and ingredient_items='[]'::jsonb) then raise exception 'Legacy meal default changed'; end if;
 begin update public.entries set ingredient_items='{}'::jsonb where name='One-off fixture'; exception when check_violation then rejected:=true; end;
 if not rejected then raise exception 'Invalid ingredient JSON accepted'; end if;
end $$;
select set_config('request.jwt.claim.sub','cccccccc-1234-4321-cccc-123456789abc',true);
do $$ begin
 if exists(select 1 from public.entries) or exists(select 1 from public.profiles) then raise exception 'Cross-account read leaked'; end if;
end $$;
rollback;
select 'PASS: ingredient import/read, no recipe creation, retry, legacy default, JSON validation and RLS isolation; all fixtures rolled back' as verification;
