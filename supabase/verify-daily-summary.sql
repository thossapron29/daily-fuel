insert into auth.users(id,email) values ('aaaaaaaa-7200-4200-8200-000000000001','daily-summary-a@example.invalid'),('aaaaaaaa-7200-4200-8200-000000000002','daily-summary-b@example.invalid');
insert into public.profiles(id,owner_id,slot,name,sex,age,weight,height,activity,adjustment) values
 ('bbbbbbbb-7200-4200-8200-000000000001','aaaaaaaa-7200-4200-8200-000000000001','new','Fixture New','female',30,60,165,1.2,-300),
 ('bbbbbbbb-7200-4200-8200-000000000002','aaaaaaaa-7200-4200-8200-000000000001','ben','Fixture Ben','male',30,70,175,1.2,200),
 ('bbbbbbbb-7200-4200-8200-000000000003','aaaaaaaa-7200-4200-8200-000000000002','new','Foreign','female',30,60,165,1.2,0);
insert into public.entries(owner_id,profile_id,date,meal,name,calories,protein,carbs,fat,sodium_mg) values
 ('aaaaaaaa-7200-4200-8200-000000000001','bbbbbbbb-7200-4200-8200-000000000001','2026-10-28','Lunch','Fixture',400,20,30,10,0),
 ('aaaaaaaa-7200-4200-8200-000000000002','bbbbbbbb-7200-4200-8200-000000000003','2026-10-28','Lunch','Foreign',900,90,90,90,900);
set local role authenticated;
do $$ declare a constant text:='aaaaaaaa-7200-4200-8200-000000000001'; b constant text:='aaaaaaaa-7200-4200-8200-000000000002'; resource constant text:='https://daily-fuel-inky.vercel.app/mcp'; callback constant text:='https://chatgpt.com/connector_platform_oauth_redirect'; reg jsonb; code jsonb; token jsonb; payload jsonb; data jsonb; denied boolean; client text; challenge text:=rtrim(translate(encode(extensions.digest(repeat('a',43),'sha256'),'base64'),'+/','-_'),'=');
begin
 perform set_config('request.jwt.claim.sub',a,true);
 reg:=public.gpt_bridge('register',jsonb_build_object('redirect_uri',callback,'integration','mcp')); client:=reg->>'client_id';
 code:=public.gpt_bridge('authorize',jsonb_build_object('client_id',client,'redirect_uri',callback,'scope','meals.write','household_access',true,'resource',resource,'challenge',challenge));
 token:=public.gpt_bridge('exchange',jsonb_build_object('client_id',client,'client_secret',reg->>'client_secret','grant_type','authorization_code','code',code->>'code','redirect_uri',callback,'code_verifier',repeat('a',43),'resource',resource));
 payload:=jsonb_build_object('access_token',token->>'access_token','resource',resource,'person','both','date','2026-10-28');
 denied:=false;begin perform public.daily_summary_bridge('read',payload);exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Read permitted without separate consent';end if;
 perform set_config('request.jwt.claim.sub',b,true);denied:=false;begin perform public.daily_summary_bridge('allow',jsonb_build_object('client_id',client));exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Foreign owner permitted consent';end if;
 perform set_config('request.jwt.claim.sub',a,true);perform public.daily_summary_bridge('allow',jsonb_build_object('client_id',client));
 data:=public.daily_summary_bridge('read',payload);
 if jsonb_array_length(data->'profiles')<>2 or data::text like '%Foreign%' or data::text like '%weight%' or data::text like '%height%' or data::text like '%owner_id%' then raise exception 'Incorrect scope or sensitive profile data leaked';end if;
 if not exists(select 1 from jsonb_array_elements(data->'profiles') p where p->>'person'='new' and (p->'entries'->0->>'sodium_mg')::numeric=0 and (p->'targets'->>'calories')::numeric=1284) then raise exception 'Missing meal, zero or target';end if;
 denied:=false;begin perform public.daily_summary_bridge('read',payload||jsonb_build_object('resource','https://evil.example/mcp'));exception when invalid_authorization_specification then denied:=true;end;if not denied then raise exception 'Wrong audience accepted';end if;
 perform public.daily_summary_bridge('deny',jsonb_build_object('client_id',client));denied:=false;begin perform public.daily_summary_bridge('read',payload);exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Revoked read permission accepted';end if;
 perform public.daily_summary_bridge('allow',jsonb_build_object('client_id',client));perform public.gpt_bridge('revoke',jsonb_build_object('client_id',client));perform public.gpt_bridge('configure',jsonb_build_object('client_id',client,'household_access',true));
 if (public.daily_summary_bridge('status',jsonb_build_object('client_id',client))->>'allowed')::boolean then raise exception 'Read permission survived revocation';end if;
end $$;
