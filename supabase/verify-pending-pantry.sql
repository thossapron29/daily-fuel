begin;
insert into auth.users(id,email) values('aaaaaaaa-6543-4654-aaaa-123456789abc','pending-pantry@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-6543-4654-aaaa-123456789abc',true);
select public.import_local_data('{"profiles":[],"entries":[],"recipes":[],"weights":[],"pantry":[{"id":"bbbbbbbb-6543-4654-bbbb-123456789abc","name":"Pending fixture","brand":"Fixture","barcode":"8850250013747","category":"seasoning","state":"as_sold","basis_unit":"g","label_basis":100,"calories":null,"protein":null,"carbs":null,"fat":null,"needs_nutrition":true,"source":"Fixture"}]}'::jsonb);
do $$ declare rejected boolean:=false; begin
 if not exists(select 1 from public.pantry_items where needs_nutrition and calories is null and protein is null and carbs is null and fat is null) then raise exception 'Unknown nutrients were not preserved as NULL'; end if;
 begin update public.pantry_items set needs_nutrition=false where id='bbbbbbbb-6543-4654-bbbb-123456789abc'; exception when check_violation then rejected:=true; end;
 if not rejected then raise exception 'Incomplete product marked ready'; end if;
 update public.pantry_items set calories=10,protein=0,carbs=2,fat=0,needs_nutrition=false where id='bbbbbbbb-6543-4654-bbbb-123456789abc';
 if not exists(select 1 from public.pantry_items where not needs_nutrition and calories=10) then raise exception 'Complete nutrition could not be saved'; end if;
end $$;
select set_config('request.jwt.claim.sub','cccccccc-6543-4654-cccc-123456789abc',true);
do $$ begin if exists(select 1 from public.pantry_items) then raise exception 'Cross-account read leaked'; end if; end $$;
rollback;
select 'PASS: pending import retains NULL, incomplete-ready guard, completion and ownership; all fixtures rolled back' as verification;
