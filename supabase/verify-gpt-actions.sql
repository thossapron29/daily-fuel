begin;
insert into auth.users(id,email) values
 ('aaaaaaaa-7060-4060-8060-000000000001','gpt-a@example.invalid'),
 ('aaaaaaaa-7060-4060-8060-000000000002','gpt-b@example.invalid'),
 ('aaaaaaaa-7060-4060-8060-000000000003','gpt-outsider@example.invalid');
insert into public.profiles(id,owner_id,slot,name,sex,age,weight,height,activity,adjustment) values
 ('bbbbbbbb-7060-4060-8060-000000000001','aaaaaaaa-7060-4060-8060-000000000001','new','Fixture New','female',30,60,165,1.2,-300),
 ('bbbbbbbb-7060-4060-8060-000000000002','aaaaaaaa-7060-4060-8060-000000000002','ben','Fixture Ben','male',30,70,175,1.2,200),
 ('bbbbbbbb-7060-4060-8060-000000000003','aaaaaaaa-7060-4060-8060-000000000003','new','Outsider','female',30,60,165,1.2,0);
insert into dailyfuel_private.menu_links(owner_id,partner_id) values
 ('aaaaaaaa-7060-4060-8060-000000000001','aaaaaaaa-7060-4060-8060-000000000002'),
 ('aaaaaaaa-7060-4060-8060-000000000002','aaaaaaaa-7060-4060-8060-000000000001');
set local role authenticated;
do $$
declare
 a constant text:='aaaaaaaa-7060-4060-8060-000000000001';
 b constant text:='aaaaaaaa-7060-4060-8060-000000000002';
 c constant text:='aaaaaaaa-7060-4060-8060-000000000003';
 callback constant text:='https://chatgpt.com/aip/g-fixture7060/oauth/callback';
 registered jsonb;code jsonb;tokens jsonb;targets jsonb;own_id text;other_id text;
 batch jsonb;prepared jsonb;receipt jsonb;again jsonb;other_draft jsonb;stale_code jsonb;
 denied boolean;refreshed jsonb;client text;secret text;access_value text;request_id uuid:=gen_random_uuid();
begin
 perform set_config('request.jwt.claim.sub',a,true);
 registered:=public.gpt_bridge('register',jsonb_build_object('redirect_uri',callback));
 client:=registered->>'client_id';secret:=registered->>'client_secret';
 denied:=false;
 begin perform public.gpt_bridge('register','{"redirect_uri":"https://evil.example/callback"}');exception when invalid_parameter_value then denied:=true;end;
 if not denied then raise exception 'Open redirect registration accepted';end if;
 code:=public.gpt_bridge('authorize',jsonb_build_object('client_id',client,'redirect_uri',callback,'scope','meals.write','person','new','allow_partner',false));
 if public.gpt_bridge('exchange',jsonb_build_object('client_id',client,'client_secret','wrong','grant_type','authorization_code','code',code->>'code','redirect_uri',callback))->>'error'<>'invalid_client' then raise exception 'Wrong client secret accepted';end if;
 if public.gpt_bridge('exchange',jsonb_build_object('client_id',client,'client_secret',secret,'grant_type','authorization_code','code',code->>'code','redirect_uri','https://evil.example'))->>'error'<>'invalid_grant' then raise exception 'Wrong callback accepted';end if;
 tokens:=public.gpt_bridge('exchange',jsonb_build_object('client_id',client,'client_secret',secret,'grant_type','authorization_code','code',code->>'code','redirect_uri',callback));
 access_value:=tokens->>'access_token';
 if access_value is null then raise exception 'OAuth code exchange failed';end if;
 if public.gpt_bridge('exchange',jsonb_build_object('client_id',client,'client_secret',secret,'grant_type','authorization_code','code',code->>'code','redirect_uri',callback))->>'error'<>'invalid_grant' then raise exception 'Authorization code replay accepted';end if;
 targets:=public.gpt_bridge('targets',jsonb_build_object('access_token',access_value))->'recipients';
 if jsonb_array_length(targets)<>1 then raise exception 'Partner consent was inferred';end if;
 perform set_config('request.jwt.claim.sub',b,true);
 perform public.gpt_bridge('configure',jsonb_build_object('client_id',client,'person','ben','allow_partner',true));
 perform set_config('request.jwt.claim.sub',a,true);
 perform public.gpt_bridge('configure',jsonb_build_object('client_id',client,'person','new','allow_partner',true));
 targets:=public.gpt_bridge('targets',jsonb_build_object('access_token',access_value))->'recipients';
 if jsonb_array_length(targets)<>2 or targets::text like '%'||a||'%' or targets::text like '%adjustment%' then raise exception 'Recipient projection failed';end if;
 select x->>'recipient_id' into own_id from jsonb_array_elements(targets) x where x->>'relationship'='self';
 select x->>'recipient_id' into other_id from jsonb_array_elements(targets) x where x->>'relationship'='partner';
 batch:=jsonb_build_object('access_token',access_value,'request_id',request_id,'entries',jsonb_build_array(
  jsonb_build_object('recipient_id',own_id,'date','2026-10-25','meal','Breakfast','name','Pair meal','calories',450,'protein',30,'carbs',45,'fat',16),
  jsonb_build_object('recipient_id',other_id,'date','2026-10-25','meal','Breakfast','name','Pair meal','calories',650,'protein',40,'carbs',80,'fat',20)));
 prepared:=public.gpt_bridge('prepare',batch);
 if exists(select 1 from public.entries) then raise exception 'Prepare wrote to diary before confirmation';end if;
 again:=public.gpt_bridge('prepare',batch||jsonb_build_object('entries',jsonb_build_array(batch->'entries'->1,batch->'entries'->0)));
 if again->>'draft_id'<>prepared->>'draft_id' then raise exception 'Prepare retry/order did not deduplicate';end if;
 denied:=false;
 begin perform public.gpt_bridge('prepare',jsonb_set(batch,'{entries,0,calories}','451'));exception when unique_violation then denied:=true;end;
 if not denied then raise exception 'Idempotency key conflict accepted';end if;
 receipt:=public.gpt_bridge('confirm',jsonb_build_object('access_token',access_value,'draft_id',prepared->>'draft_id'));
 again:=public.gpt_bridge('confirm',jsonb_build_object('access_token',access_value,'draft_id',prepared->>'draft_id'));
 if receipt->'entries'<>again->'entries' or again->>'replayed'<>'true' or (select count(*) from public.entries)<>1 or (select sum(calories) from public.entries)<>450 then raise exception 'Confirm retry duplicated or mixed diary totals';end if;
 if (select adjustment from public.profiles)<>-300 or (select nutrition_source from public.entries)<>'chatgpt_estimate' then raise exception 'Goal changed or provenance missing';end if;
 perform set_config('request.jwt.claim.sub',b,true);
 if (select count(*) from public.entries)<>1 or (select sum(calories) from public.entries)<>650 or (select adjustment from public.profiles)<>200 then raise exception 'Partner diary/goal not isolated';end if;
 perform set_config('request.jwt.claim.sub',a,true);
 other_draft:=public.gpt_bridge('prepare',batch||jsonb_build_object('request_id',gen_random_uuid()));
 perform set_config('request.jwt.claim.sub',b,true);
 perform public.gpt_bridge('configure',jsonb_build_object('client_id',client,'person','ben','allow_partner',false));
 perform set_config('request.jwt.claim.sub',a,true);
 denied:=false;
 begin perform public.gpt_bridge('confirm',jsonb_build_object('access_token',access_value,'draft_id',other_draft->>'draft_id'));exception when insufficient_privilege then denied:=true;end;
 if not denied or (select count(*) from public.entries)<>1 then raise exception 'Revocation/atomic rollback failed';end if;
 denied:=false;
 begin perform public.gpt_bridge('targets',jsonb_build_object('access_token',encode(extensions.digest(access_value,'sha256'),'hex')));exception when invalid_authorization_specification then denied:=true;end;
 if not denied then raise exception 'Stored hash accepted as bearer token';end if;
 perform set_config('request.jwt.claim.sub',c,true);
 denied:=false;
 begin perform public.gpt_bridge('configure',jsonb_build_object('client_id',client,'person','new','allow_partner',true));exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Unlinked account could grant itself access';end if;
 denied:=false;
 begin perform public.gpt_bridge('confirm',jsonb_build_object('draft_id',prepared->>'draft_id'));exception when invalid_authorization_specification then denied:=true;end;
 if not denied then raise exception 'Session identity alone could bypass OAuth';end if;
 refreshed:=public.gpt_bridge('exchange',jsonb_build_object('client_id',client,'client_secret',secret,'grant_type','refresh_token','refresh_token',tokens->>'refresh_token'));
 if refreshed->>'access_token' is null then raise exception 'Refresh failed';end if;
 perform public.gpt_bridge('targets',jsonb_build_object('access_token',refreshed->>'access_token'));
 if public.gpt_bridge('exchange',jsonb_build_object('client_id',client,'client_secret',secret,'grant_type','refresh_token','refresh_token',tokens->>'refresh_token'))->>'error'<>'invalid_grant' then raise exception 'Refresh replay accepted';end if;
 denied:=false;
 begin perform public.gpt_bridge('targets',jsonb_build_object('access_token',refreshed->>'access_token'));exception when invalid_authorization_specification then denied:=true;end;
 if not denied then raise exception 'Refresh reuse did not revoke token family';end if;
 perform set_config('request.jwt.claim.sub',a,true);
 code:=public.gpt_bridge('authorize',jsonb_build_object('client_id',client,'redirect_uri',callback,'scope','meals.write','person','new','allow_partner',false,'challenge',rtrim(translate(encode(extensions.digest(repeat('a',43),'sha256'),'base64'),'+/','-_'),'=')));
 if public.gpt_bridge('exchange',jsonb_build_object('client_id',client,'client_secret',secret,'grant_type','authorization_code','code',code->>'code','redirect_uri',callback,'code_verifier',repeat('b',43)))->>'error'<>'invalid_grant' then raise exception 'Wrong PKCE verifier accepted';end if;
 tokens:=public.gpt_bridge('exchange',jsonb_build_object('client_id',client,'client_secret',secret,'grant_type','authorization_code','code',code->>'code','redirect_uri',callback,'code_verifier',repeat('a',43)));
 if tokens->>'access_token' is null then raise exception 'Correct PKCE failed';end if;
 stale_code:=public.gpt_bridge('authorize',jsonb_build_object('client_id',client,'redirect_uri',callback,'scope','meals.write','person','new','allow_partner',false));
 perform public.gpt_bridge('revoke',jsonb_build_object('client_id',client));
 denied:=false;
 begin perform public.gpt_bridge('targets',jsonb_build_object('access_token',tokens->>'access_token'));exception when invalid_authorization_specification then denied:=true;end;
 if not denied then raise exception 'Grant revoke did not invalidate access';end if;
 perform public.gpt_bridge('configure',jsonb_build_object('client_id',client,'person','new','allow_partner',false));
 if public.gpt_bridge('exchange',jsonb_build_object('client_id',client,'client_secret',secret,'grant_type','authorization_code','code',stale_code->>'code','redirect_uri',callback))->>'error'<>'invalid_grant' then raise exception 'Revoked code became valid after re-consent';end if;
end $$;
reset role;
do $$ begin
 if exists(select 1 from dailyfuel_private.gpt_clients where secret_hash like 'df_%') or exists(select 1 from dailyfuel_private.gpt_tokens where access_hash like 'df_%' or refresh_hash like 'df_%') then raise exception 'Plaintext credentials persisted';end if;
 if has_table_privilege('anon','dailyfuel_private.gpt_tokens','select') or has_table_privilege('authenticated','dailyfuel_private.gpt_grants','update') then raise exception 'Private credential/consent tables exposed';end if;
end $$;
rollback;
select 'PASS: scoped OAuth, exact callback/client binding, code replay, S256, bilateral consent, atomic pair save, durable idempotency, conflict rejection, isolated totals/goals, outsider denial, hashed credentials, refresh rotation/reuse and revocation; fixtures rolled back' as verification;
