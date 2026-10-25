begin;
insert into auth.users(id,email) values
 ('aaaaaaaa-7050-4050-8050-000000000001','menu-share-a@example.invalid'),
 ('aaaaaaaa-7050-4050-8050-000000000002','menu-share-b@example.invalid'),
 ('aaaaaaaa-7050-4050-8050-000000000003','menu-share-outsider@example.invalid');
insert into public.profiles(id,owner_id,slot,name,sex,age,weight,height,activity,adjustment) values
 ('bbbbbbbb-7050-4050-8050-000000000001','aaaaaaaa-7050-4050-8050-000000000001','new','Fixture A','female',30,60,165,1.2,-300),
 ('bbbbbbbb-7050-4050-8050-000000000002','aaaaaaaa-7050-4050-8050-000000000002','ben','Fixture B','male',30,70,175,1.2,200),
 ('bbbbbbbb-7050-4050-8050-000000000003','aaaaaaaa-7050-4050-8050-000000000003','new','Outsider','female',30,60,165,1.2,0);
insert into dailyfuel_private.menu_links(owner_id,partner_id) values
 ('aaaaaaaa-7050-4050-8050-000000000001','aaaaaaaa-7050-4050-8050-000000000002'),
 ('aaaaaaaa-7050-4050-8050-000000000002','aaaaaaaa-7050-4050-8050-000000000001');
insert into public.entries(owner_id,profile_id,date,meal,name,calories,protein,carbs,fat) values
 ('aaaaaaaa-7050-4050-8050-000000000001','bbbbbbbb-7050-4050-8050-000000000001','2026-10-20','Lunch','Own menu',300,20,30,10),
 ('aaaaaaaa-7050-4050-8050-000000000002','bbbbbbbb-7050-4050-8050-000000000002','2026-10-21','Lunch','Shared menu',600,35,75,18),
 ('aaaaaaaa-7050-4050-8050-000000000002','bbbbbbbb-7050-4050-8050-000000000002','2026-10-22','Dinner','Shared menu',600,35,75,18),
 ('aaaaaaaa-7050-4050-8050-000000000002','bbbbbbbb-7050-4050-8050-000000000002','2026-10-23','Lunch','Shared menu',500,35,50,18),
 ('aaaaaaaa-7050-4050-8050-000000000003','bbbbbbbb-7050-4050-8050-000000000003','2026-10-21','Lunch','Private outsider',999,99,99,99);
set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-7050-4050-8050-000000000001',true);
do $$ declare denied boolean:=false; columns jsonb; begin
 if (select count(*) from public.shared_menu_options('Shared'))<>2 then raise exception 'Distinct partner menu options missing'; end if;
 if (select count(*) from public.entries)<>1 or (select sum(calories) from public.entries)<>300 then raise exception 'Partner calories leaked into own diary'; end if;
 if (select count(*) from public.profiles)<>1 or (select adjustment from public.profiles)<>-300 then raise exception 'Partner profile/goal leaked'; end if;
 select to_jsonb(m) into columns from public.shared_menu_options('Shared') m limit 1;
 if columns ?| array['owner_id','profile_id','date','meal','recipe_id','ingredient_items','portion_amount','weight','goal','adjustment'] or (select count(*) from jsonb_object_keys(columns))<>8 then raise exception 'Projection contains private diary fields'; end if;
 if exists(select 1 from public.shared_menu_options('Private outsider')) then raise exception 'Unlinked menu leaked'; end if;
 if exists(select 1 from public.shared_menu_options('%')) then raise exception 'Search wildcard was not literal'; end if;
 update public.entries set calories=1 where owner_id='aaaaaaaa-7050-4050-8050-000000000002';
 if found then raise exception 'Partner diary could be updated'; end if;
 begin insert into dailyfuel_private.menu_links values('aaaaaaaa-7050-4050-8050-000000000001','aaaaaaaa-7050-4050-8050-000000000003'); exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Caller could grant themselves a partner'; end if;
 insert into public.entries(owner_id,profile_id,date,meal,name,calories,protein,carbs,fat)
 select 'aaaaaaaa-7050-4050-8050-000000000001','bbbbbbbb-7050-4050-8050-000000000001','2026-10-25','Dinner',m.name,450,m.protein,40,m.fat from public.shared_menu_options('Shared') m where m.calories=600;
 if (select count(*) from public.entries)<>2 or (select sum(calories) from public.entries)<>750 then raise exception 'Copy was not logged separately'; end if;
end $$;
select set_config('request.jwt.claim.sub','aaaaaaaa-7050-4050-8050-000000000002',true);
do $$ begin
 if (select sum(calories) from public.entries)<>1700 or (select adjustment from public.profiles)<>200 then raise exception 'Original diary or goal was changed'; end if;
 if not exists(select 1 from public.shared_menu_options('Shared') where calories=450 and carbs=40) then raise exception 'Reciprocal lookup did not see newly saved menu'; end if;
end $$;
select set_config('request.jwt.claim.sub','aaaaaaaa-7050-4050-8050-000000000003',true);
do $$ begin
 if exists(select 1 from public.shared_menu_options('')) or (select count(*) from public.entries)<>1 then raise exception 'Unlinked account isolation failed'; end if;
 if has_function_privilege('anon','public.shared_menu_options(text)','execute') then raise exception 'Anonymous RPC access granted'; end if;
end $$;
reset role;
delete from dailyfuel_private.menu_links where owner_id='aaaaaaaa-7050-4050-8050-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-7050-4050-8050-000000000001',true);
do $$ begin if exists(select 1 from public.shared_menu_options('')) then raise exception 'Revoked link still granted lookup'; end if; end $$;
rollback;
select 'PASS: narrow linked-menu lookup, deduplication, separate totals/goals, immutable source, reciprocal updates, outsider/anon isolation and revocation; fixtures rolled back' as verification;
