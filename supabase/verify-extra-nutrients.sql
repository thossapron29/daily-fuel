begin;
insert into auth.users(id,email) values
 ('aaaaaaaa-7100-4100-8100-000000000001','mcp-a@example.invalid'),
 ('aaaaaaaa-7100-4100-8100-000000000002','mcp-b@example.invalid');
insert into public.profiles(id,owner_id,slot,name,sex,age,weight,height,activity,adjustment) values
 ('bbbbbbbb-7100-4100-8100-000000000001','aaaaaaaa-7100-4100-8100-000000000001','new','MCP New','female',30,60,165,1.2,-300),
 ('bbbbbbbb-7100-4100-8100-000000000002','aaaaaaaa-7100-4100-8100-000000000001','ben','MCP Ben','male',30,70,175,1.2,200),
 ('bbbbbbbb-7100-4100-8100-000000000003','aaaaaaaa-7100-4100-8100-000000000002','new','Foreign New','female',30,60,165,1.2,-500);
insert into dailyfuel_private.menu_links values
 ('aaaaaaaa-7100-4100-8100-000000000001','aaaaaaaa-7100-4100-8100-000000000002'),
 ('aaaaaaaa-7100-4100-8100-000000000002','aaaaaaaa-7100-4100-8100-000000000001');
set local role authenticated;
do $$ declare
 a constant text:='aaaaaaaa-7100-4100-8100-000000000001';b constant text:='aaaaaaaa-7100-4100-8100-000000000002';
 resource constant text:='https://daily-fuel-inky.vercel.app/mcp';callback constant text:='https://chatgpt.com/connector_platform_oauth_redirect';
 registration jsonb;code jsonb;tokens jsonb;targets jsonb;batch jsonb;prepared jsonb;status jsonb;receipt jsonb;again jsonb;
 client text;own_id text;other_id text;denied boolean;challenge text:=rtrim(translate(encode(extensions.digest(repeat('a',43),'sha256'),'base64'),'+/','-_'),'=');
begin
 perform set_config('request.jwt.claim.sub',a,true);
 registration:=public.gpt_bridge('register',jsonb_build_object('redirect_uri',callback,'integration','mcp'));client:=registration->>'client_id';
 denied:=false;begin perform public.gpt_bridge('authorize',jsonb_build_object('client_id',client,'redirect_uri',callback,'scope','meals.write','household_access',true));exception when invalid_parameter_value then denied:=true;end;
 if not denied then raise exception 'MCP authorization accepted without PKCE/resource';end if;
 denied:=false;begin perform public.gpt_bridge('configure',jsonb_build_object('client_id',client,'person','ben','allow_partner',true));exception when invalid_parameter_value then denied:=true;end;
 if not denied then raise exception 'Old individual consent silently expanded';end if;
 code:=public.gpt_bridge('authorize',jsonb_build_object('client_id',client,'redirect_uri',callback,'scope','meals.write','household_access',true,'resource',resource,'challenge',challenge));
 if public.gpt_bridge('exchange',jsonb_build_object('client_id',client,'client_secret',registration->>'client_secret','grant_type','authorization_code','code',code->>'code','redirect_uri',callback,'code_verifier',repeat('a',43)))->>'error'<>'invalid_target' then raise exception 'Code exchange accepted without resource';end if;
 tokens:=public.gpt_bridge('exchange',jsonb_build_object('client_id',client,'client_secret',registration->>'client_secret','grant_type','authorization_code','code',code->>'code','redirect_uri',callback,'code_verifier',repeat('a',43),'resource',resource));
 if tokens->>'access_token' is null then raise exception 'MCP exchange failed';end if;
 denied:=false;begin perform public.gpt_bridge('targets',jsonb_build_object('access_token',tokens->>'access_token'));exception when invalid_authorization_specification then denied:=true;end;
 if not denied then raise exception 'MCP token replayed at legacy resource';end if;
 denied:=false;begin perform public.gpt_bridge('targets',jsonb_build_object('access_token',tokens->>'access_token','resource','https://evil.example/mcp'));exception when invalid_authorization_specification then denied:=true;end;
 if not denied then raise exception 'Wrong token audience accepted';end if;
 perform set_config('request.jwt.claim.sub',b,true);
 denied:=false;begin perform public.gpt_bridge('configure',jsonb_build_object('client_id',client,'household_access',true));exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Menu-linked account gained central client access';end if;
 perform set_config('request.jwt.claim.sub',a,true);
 targets:=public.gpt_bridge('targets',jsonb_build_object('access_token',tokens->>'access_token','resource',resource))->'recipients';
 if targets::text like '%owner_id%' or targets::text like '%profile_id%' or exists(select 1 from jsonb_array_elements(targets) x where x->>'relationship'<>'self') then raise exception 'Private IDs/foreign targets leaked';end if;
 if jsonb_array_length(targets)<>2 then raise exception 'Household recipients missing';end if;
 select x->>'recipient_id' into own_id from jsonb_array_elements(targets) x where x->>'person'='new';
 select x->>'recipient_id' into other_id from jsonb_array_elements(targets) x where x->>'person'='ben';
 batch:=jsonb_build_object('access_token',tokens->>'access_token','resource',resource,'request_id',gen_random_uuid(),'entries',jsonb_build_array(
  jsonb_build_object('recipient_id',own_id,'date','2026-10-25','meal','Lunch','name','MCP pair','calories',450,'protein',30.125,'carbs',45,'fat',16,'sodium_mg',2100.254,'total_sugar_g',20.1,'free_sugar_g',12.4),
  jsonb_build_object('recipient_id',other_id,'date','2026-10-25','meal','Lunch','name','MCP pair','calories',650,'protein',40,'carbs',80,'fat',20,'sodium_mg',0,'total_sugar_g',0,'free_sugar_g',0)));
 denied:=false;begin perform public.gpt_bridge('prepare',jsonb_set(batch,'{entries,0,sodium_mg}','"20"'));exception when invalid_parameter_value then denied:=true;end;
 if not denied then raise exception 'String sodium accepted';end if;
 denied:=false;begin perform public.gpt_bridge('prepare',jsonb_set(batch,'{entries,0,free_sugar_g}','30'));exception when invalid_parameter_value then denied:=true;end;
 if not denied then raise exception 'Free sugars greater than total accepted';end if;
 prepared:=public.gpt_bridge('prepare',batch);
 denied:=false;begin perform public.gpt_bridge('prepare',jsonb_set(batch,'{entries,0,sodium_mg}','2200'));exception when unique_violation then denied:=true;end;
 if not denied then raise exception 'Same request accepted changed optional nutrients';end if;

 perform set_config('request.jwt.claim.sub','',true);
 status:=public.gpt_bridge('confirm',jsonb_build_object('access_token',tokens->>'access_token','resource',resource,'draft_id',prepared->>'draft_id','approved',true));
 if status->>'status'<>'awaiting_user_confirmation' or status->>'confirmation_url' is null then raise exception 'Missing native review gate/link';end if;
 denied:=false;begin perform public.gpt_bridge('approve_mcp_draft',jsonb_build_object('access_token',tokens->>'access_token','draft_id',prepared->>'draft_id'));exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Model token could approve native review';end if;
 perform set_config('request.jwt.claim.sub',b,true);
 if exists(select 1 from public.entries) then raise exception 'Tool wrote before native confirmation';end if;
 denied:=false;begin perform public.gpt_bridge('approve_mcp_draft',jsonb_build_object('draft_id',prepared->>'draft_id'));exception when no_data_found then denied:=true;end;
 if not denied then raise exception 'Wrong native account approved a draft';end if;
 perform set_config('request.jwt.claim.sub',a,true);
 perform public.gpt_bridge('review_mcp_draft',jsonb_build_object('draft_id',prepared->>'draft_id'));
 receipt:=public.gpt_bridge('approve_mcp_draft',jsonb_build_object('draft_id',prepared->>'draft_id'));
 again:=public.gpt_bridge('approve_mcp_draft',jsonb_build_object('draft_id',prepared->>'draft_id'));
 if not exists(select 1 from public.entries where profile_id='bbbbbbbb-7100-4100-8100-000000000001' and sodium_mg=2100.25 and total_sugar_g=20.1 and free_sugar_g=12.4) or not exists(select 1 from public.entries where profile_id='bbbbbbbb-7100-4100-8100-000000000002' and sodium_mg=0 and total_sugar_g=0 and free_sugar_g=0) then raise exception 'Optional nutrients lost or people mixed';end if;
 if receipt->>'status'<>'recorded' or receipt->'entries'<>again->'entries' or again->>'replayed'<>'true' then raise exception 'Native receipt idempotency failed';end if;
 if (select count(*) from public.entries)<>2 or (select calories from public.entries where profile_id='bbbbbbbb-7100-4100-8100-000000000001')<>450 or (select protein from public.entries where profile_id='bbbbbbbb-7100-4100-8100-000000000001')<>30.13 or (select adjustment from public.profiles where slot='new')<>-300 or (select calories from public.entries where profile_id='bbbbbbbb-7100-4100-8100-000000000002')<>650 or (select adjustment from public.profiles where slot='ben')<>200 then raise exception 'Own totals/rounding/goal failed';end if;
 status:=public.gpt_bridge('confirm',jsonb_build_object('access_token',tokens->>'access_token','resource',resource,'draft_id',prepared->>'draft_id'));
 if status->>'status'<>'recorded' or status->'entries'<>receipt->'entries' then raise exception 'MCP status did not return native receipt';end if;
 perform set_config('request.jwt.claim.sub',b,true);
 if exists(select 1 from public.entries) or (select adjustment from public.profiles)<>-500 then raise exception 'Foreign account diary/goals changed';end if;
 perform set_config('request.jwt.claim.sub',a,true);
 perform public.gpt_bridge('revoke',jsonb_build_object('client_id',client));
 denied:=false;begin perform public.gpt_bridge('targets',jsonb_build_object('access_token',tokens->>'access_token','resource',resource));exception when invalid_authorization_specification then denied:=true;end;
 if not denied then raise exception 'Revoked household token still works';end if;
end $$;
reset role;
do $$ begin
 if not exists(select 1 from dailyfuel_private.gpt_drafts where owner_id='aaaaaaaa-7100-4100-8100-000000000001' and approved_at is not null and approved_by=owner_id) then raise exception 'Missing native approval audit';end if;
 if has_function_privilege('authenticated','dailyfuel_private.commit_meal_draft(uuid,uuid,uuid,boolean)','execute') then raise exception 'Private commit helper exposed';end if;
end $$;
-- Import keeps explicit zeros/source and leaves missing old fields unknown.
insert into auth.users(id,email) values('aaaaaaaa-7100-4100-8100-000000000003','extras-import@example.invalid');
set local role authenticated;
do $$ declare snapshot jsonb;receipt jsonb;again jsonb;begin
 perform set_config('request.jwt.claim.sub','aaaaaaaa-7100-4100-8100-000000000003',true);
 snapshot:=jsonb_build_object('profiles',jsonb_build_array(
  jsonb_build_object('id','new','name','Import New','sex','female','age',30,'weight',60,'height',165,'activity',1.2,'goal','maintain','adjustment',0),
  jsonb_build_object('id','ben','name','Import Ben','sex','male','age',30,'weight',70,'height',175,'activity',1.2,'goal','maintain','adjustment',0)),
  'recipes','[]'::jsonb,'weights','[]'::jsonb,'pantry','[]'::jsonb,'entries',jsonb_build_array(
   jsonb_build_object('id',gen_random_uuid(),'profile_id','new','date','2026-10-25','meal','Lunch','name','Import known','calories',500,'protein',30,'carbs',50,'fat',20,'sodium_mg',0,'total_sugar_g',10,'free_sugar_g',0,'nutrition_source','label'),
   jsonb_build_object('id',gen_random_uuid(),'profile_id','ben','date','2026-10-25','meal','Lunch','name','Import old','calories',500,'protein',30,'carbs',50,'fat',20)));
 receipt:=public.import_local_data(snapshot);again:=public.import_local_data(snapshot);
 if again->>'already_imported'<>'true' then raise exception 'Import replay broken';end if;
 if not exists(select 1 from public.entries where name='Import known' and sodium_mg=0 and total_sugar_g=10 and free_sugar_g=0 and nutrition_source='label') or
 not exists(select 1 from public.entries where name='Import old' and sodium_mg is null and total_sugar_g is null and free_sugar_g is null) then raise exception 'Import optional values/source changed';end if;
end $$;
reset role;
rollback;
select 'PASS: optional sodium/total/free sugar validation, mg units, SQL rounding, independent portions and zeros, immutable nutrient conflicts, native approval, stable receipt and revocation; all fixtures rolled back' as verification;
