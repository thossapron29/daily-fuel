-- Reserved disposable identities and all rows are rolled back.
begin;
insert into auth.users(id,email) values('aaaaaaaa-4321-4321-aaaa-123456789abc','pantry-test-a@example.invalid'),('cccccccc-4321-4321-cccc-123456789abc','pantry-test-b@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-4321-4321-aaaa-123456789abc',true);
select set_config('dailyfuel.pantry_payload','{"profiles":[{"id":"new","name":"New fixture","sex":"female","age":30,"weight":60,"height":165,"activity":1.2,"goal":"maintain","adjustment":0},{"id":"ben","name":"Ben fixture","sex":"male","age":30,"weight":70,"height":175,"activity":1.2,"goal":"maintain","adjustment":0}],"entries":[],"recipes":[],"weights":[],"pantry":[{"id":"bbbbbbbb-4321-4321-bbbb-123456789abc","owner_id":"cccccccc-4321-4321-cccc-123456789abc","name":"Sauce fixture","brand":"Fixture","barcode":"8850038400080","category":"seasoning","state":"as_sold","basis_unit":"ml","label_basis":15,"calories":66.6666666667,"protein":6.6666666667,"carbs":13.3333333333,"fat":1.3333333333,"source":"Label"}]}',true);
select public.import_local_data(current_setting('dailyfuel.pantry_payload')::jsonb);
do $$ declare rejected boolean:=false; begin
 if (select count(*) from public.pantry_items)<>1 or exists(select 1 from public.entries) or exists(select 1 from public.recipes) then raise exception 'Pantry save created meals/recipes'; end if;
 if not exists(select 1 from public.pantry_items where owner_id=auth.uid() and basis_unit='ml' and label_basis=15) then raise exception 'Import ownership/unit failed'; end if;
 if not (public.import_local_data(current_setting('dailyfuel.pantry_payload')::jsonb)->>'already_imported')::boolean then raise exception 'Import retry failed'; end if;
 insert into public.entries(owner_id,profile_id,date,meal,name,calories,ingredient_items) select owner_id,id,'2026-10-24','Lunch','Meal fixture',20,'[{"id":"row","grams":30,"unit":"ml","food":{"id":"bbbbbbbb-4321-4321-bbbb-123456789abc","name":"Sauce fixture","basis_unit":"ml","calories":66.6666666667}}]' from public.profiles where slot='new';
 update public.pantry_items set calories=100,archived=true;
 if not exists(select 1 from public.entries where calories=20 and ingredient_items->0->>'unit'='ml' and ingredient_items->0->'food'->>'calories'='66.6666666667') then raise exception 'History snapshot changed'; end if;
 update public.pantry_items set archived=false;
 begin insert into public.pantry_items(owner_id,name,barcode,category,state,calories,protein,carbs,fat,source) values(auth.uid(),'Duplicate','8850038400080','seasoning','as_sold',0,0,0,0,'Label'); exception when unique_violation then rejected:=true; end;
 if not rejected then raise exception 'Duplicate household barcode accepted'; end if;
end $$;
select set_config('request.jwt.claim.sub','cccccccc-4321-4321-cccc-123456789abc',true);
do $$ declare rejected boolean:=false; begin
 if exists(select 1 from public.pantry_items) or exists(select 1 from public.entries) then raise exception 'Cross-account read leaked'; end if;
 update public.pantry_items set name='Forbidden';
 begin insert into public.pantry_items(owner_id,name,category,state,calories,protein,carbs,fat,source) values('aaaaaaaa-4321-4321-aaaa-123456789abc','Forbidden','seasoning','as_sold',0,0,0,0,'Label'); exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'Foreign owner write accepted'; end if;
 if has_table_privilege('anon','public.pantry_items','SELECT') then raise exception 'Anonymous pantry access enabled'; end if;
end $$;
rollback;
select 'PASS: pantry persistence/import, units, barcode uniqueness, archive/restore, immutable meals, ownership and RLS; all fixtures rolled back' as verification;
