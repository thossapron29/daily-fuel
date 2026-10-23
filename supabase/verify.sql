-- Isolated transaction: reserved test users and fixture rows are all rolled back.
begin;
insert into auth.users(id,email) values('11111111-1111-4111-8111-111111111111','daily-fuel-test-a@example.invalid'),('22222222-2222-4222-8222-222222222222','daily-fuel-test-b@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select set_config('dailyfuel.test_payload','{"profiles":[{"id":"new","name":"Test New","sex":"female","age":30,"weight":60,"height":160,"activity":1.2,"body_fat":null,"goal":"maintain","adjustment":0,"macro_plan":"lower"},{"id":"ben","name":"Test Ben","sex":"male","age":29,"weight":75,"height":175,"activity":1.375,"body_fat":null,"goal":"gain","adjustment":200,"macro_plan":"higher"}],"recipes":[{"id":"33333333-3333-4333-8333-333333333333","name":"Test shared recipe","servings":2,"ingredients":"Test fixture","calories":800,"protein":40,"carbs":60,"fat":30,"ingredient_items":[],"yield_grams":1000}],"entries":[{"id":"44444444-4444-4444-8444-444444444444","profile_id":"new","date":"2026-10-23","meal":"Lunch","name":"Test shared recipe","calories":320,"protein":16,"carbs":24,"fat":12,"recipe_id":"33333333-3333-4333-8333-333333333333","portion_amount":400,"portion_unit":"grams"},{"id":"55555555-5555-4555-8555-555555555555","profile_id":"ben","date":"2026-10-23","meal":"Lunch","name":"Test shared recipe","calories":480,"protein":24,"carbs":36,"fat":18,"recipe_id":"33333333-3333-4333-8333-333333333333","portion_amount":600,"portion_unit":"grams"}],"weights":[{"id":"66666666-6666-4666-8666-666666666666","profile_id":"new","date":"2026-10-23","weight":60}]}',true);
select public.import_local_data(current_setting('dailyfuel.test_payload')::jsonb);
do $$ begin
 if (select count(*) from public.entries)<>2 or (select count(*) from public.recipes)<>1 or (select count(*) from public.weights)<>1 then raise exception 'Import did not populate all tables'; end if;
 if (select count(*) from public.entries e join public.profiles p on e.profile_id=p.id where (p.slot='new' and e.calories=320) or (p.slot='ben' and e.calories=480))<>2 then raise exception 'Profile mapping failed'; end if;
 if not (public.import_local_data(current_setting('dailyfuel.test_payload')::jsonb)->>'already_imported')::boolean then raise exception 'Import retry not idempotent'; end if;
 if (select count(*) from public.entries)<>2 then raise exception 'Import retry duplicated rows'; end if;
 update public.profiles set goal='lose',adjustment=-300,macro_plan='higher' where slot='new';
 if not exists(select 1 from public.profiles where slot='new' and goal='lose' and adjustment=-300 and macro_plan='higher') then raise exception 'Profile update failed'; end if;
 update public.recipes set name='Edited recipe' where id='33333333-3333-4333-8333-333333333333';
 if not exists(select 1 from public.entries where name='Test shared recipe' and calories=320) then raise exception 'Historical nutrition changed'; end if;
 perform set_config('dailyfuel.fixture_profile',(select id::text from public.profiles where slot='new'),true);
 delete from public.weights where id='66666666-6666-4666-8666-666666666666';
 if (select count(*) from public.weights)<>0 then raise exception 'Owner deletion failed'; end if;
end $$;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$ declare failed boolean:=false; begin
 if (select count(*) from public.profiles)<>0 or (select count(*) from public.entries)<>0 or (select count(*) from public.recipes)<>0 then raise exception 'Cross-account read leaked'; end if;
 begin insert into public.recipes(owner_id,name,servings) values('11111111-1111-4111-8111-111111111111','Forbidden',1); exception when insufficient_privilege then failed:=true; end;
 if not failed then raise exception 'Foreign owner write accepted'; end if;
 failed:=false;
 begin insert into public.entries(owner_id,profile_id,date,meal,name,calories) values('22222222-2222-4222-8222-222222222222',current_setting('dailyfuel.fixture_profile')::uuid,'2026-10-23','Lunch','Forbidden profile',100); exception when foreign_key_violation then failed:=true; end;
 if not failed then raise exception 'Foreign profile link accepted'; end if;
 failed:=false;
 begin perform public.import_local_data('{"profiles":[{"id":"new","name":"Test New","sex":"female","age":30,"weight":60,"height":160,"activity":1.2,"body_fat":null,"goal":"maintain","adjustment":0,"macro_plan":"lower"},{"id":"ben","name":"Test Ben","sex":"male","age":29,"weight":75,"height":175,"activity":1.375,"body_fat":null,"goal":"gain","adjustment":200,"macro_plan":"higher"}],"recipes":[{"id":"77777777-7777-4777-8777-777777777777","name":"Test shared recipe","servings":2,"ingredients":"Test fixture","calories":800,"protein":40,"carbs":60,"fat":30,"ingredient_items":[],"yield_grams":1000}],"entries":[{"id":"88888888-8888-4888-8888-888888888888","profile_id":"new","date":"2026-10-23","meal":"Lunch","name":"Test shared recipe","calories":320,"protein":16,"carbs":24,"fat":12,"recipe_id":"77777777-7777-4777-8777-777777777777","portion_amount":400,"portion_unit":"grams"},{"id":"55555555-5555-4555-8555-555555555555","profile_id":"unknown","date":"2026-10-23","meal":"Lunch","name":"Test shared recipe","calories":480,"protein":24,"carbs":36,"fat":18,"recipe_id":"77777777-7777-4777-8777-777777777777","portion_amount":600,"portion_unit":"grams"}],"weights":[{"id":"66666666-6666-4666-8666-666666666666","profile_id":"new","date":"2026-10-23","weight":60}]}'::jsonb); exception when others then failed:=true; end;
 if not failed then raise exception 'Invalid profile import accepted'; end if;
 if (select count(*) from public.profiles)<>0 or (select count(*) from public.recipes)<>0 or (select count(*) from public.entries)<>0 or (select count(*) from public.import_receipts)<>0 then raise exception 'Failed import left partial data'; end if;
end $$;
reset role;
rollback;
select 'PASS: CRUD, profile mapping, immutable diary snapshots, idempotent import, atomic rollback, RLS isolation and ownership foreign keys; all fixtures rolled back' as verification;
