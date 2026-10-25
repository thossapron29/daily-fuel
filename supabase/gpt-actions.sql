-- Scoped OAuth bridge for Daily Fuel GPT. No service-role key is needed by the app.
-- Only SHA-256 hashes of high-entropy credentials are persisted. Raw credentials
-- are checked inside Postgres; stored hashes cannot be replayed as bearer tokens.
create table dailyfuel_private.gpt_clients (
 id uuid primary key default gen_random_uuid(),
 creator uuid not null references auth.users(id) on delete cascade,
 redirect_uri text not null, secret_hash text not null,
 revoked boolean not null default false,created_at timestamptz not null default now()
);
create index gpt_clients_creator_idx on dailyfuel_private.gpt_clients(creator);
create table dailyfuel_private.gpt_grants (
 client_id uuid not null references dailyfuel_private.gpt_clients(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 profile_id uuid not null,recipient_id uuid not null default gen_random_uuid() unique,
 allow_partner boolean not null default false,active boolean not null default true,
 primary key(client_id,owner_id),
 foreign key(profile_id,owner_id) references public.profiles(id,owner_id) on delete cascade
);
create index gpt_grants_owner_idx on dailyfuel_private.gpt_grants(owner_id);
create index gpt_grants_profile_idx on dailyfuel_private.gpt_grants(profile_id,owner_id);
create table dailyfuel_private.gpt_codes (
 code_hash text primary key,client_id uuid not null,owner_id uuid not null,
 redirect_uri text not null,challenge text,
 expires_at timestamptz not null default now()+interval '5 minutes',used boolean not null default false,
 foreign key(client_id,owner_id) references dailyfuel_private.gpt_grants(client_id,owner_id) on delete cascade
);
create index gpt_codes_grant_idx on dailyfuel_private.gpt_codes(client_id,owner_id);
create table dailyfuel_private.gpt_tokens (
 access_hash text primary key,refresh_hash text not null unique,
 client_id uuid not null,owner_id uuid not null,family_id uuid not null,
 expires_at timestamptz not null default now()+interval '1 hour',
 refresh_expires_at timestamptz not null default now()+interval '30 days',
 refresh_used boolean not null default false,revoked boolean not null default false,
 foreign key(client_id,owner_id) references dailyfuel_private.gpt_grants(client_id,owner_id) on delete cascade
);
create index gpt_tokens_grant_idx on dailyfuel_private.gpt_tokens(client_id,owner_id);
create index gpt_tokens_family_idx on dailyfuel_private.gpt_tokens(family_id);
create table dailyfuel_private.gpt_drafts (
 id uuid primary key default gen_random_uuid(),client_id uuid not null,owner_id uuid not null,
 request_id uuid not null,request_hash text not null,entries jsonb not null,
 expires_at timestamptz not null default now()+interval '15 minutes',response jsonb,
 unique(client_id,owner_id,request_id),
 foreign key(client_id,owner_id) references dailyfuel_private.gpt_grants(client_id,owner_id) on delete cascade
);
do $$ declare t text; begin
 foreach t in array array['gpt_clients','gpt_grants','gpt_codes','gpt_tokens','gpt_drafts'] loop
  execute format('alter table dailyfuel_private.%I enable row level security',t);
  execute format('revoke all on dailyfuel_private.%I from public,anon,authenticated',t);
  execute format('create policy "no direct access" on dailyfuel_private.%I for all to anon,authenticated using(false) with check(false)',t);
 end loop;
end $$;

alter table public.entries add column nutrition_source text not null default 'manual'
 check(nutrition_source in ('manual','chatgpt_estimate','label','provided'));

create function dailyfuel_private.gpt_hash(value text) returns text
language sql immutable strict set search_path='' as $$
 select encode(extensions.digest(value,'sha256'),'hex');
$$;
create function dailyfuel_private.gpt_client_allowed(actor uuid,client uuid) returns boolean
language sql stable set search_path='' as $$
 select exists(select 1 from dailyfuel_private.gpt_clients c where c.id=client and not c.revoked and
  (c.creator=actor or (exists(select 1 from dailyfuel_private.menu_links l where l.owner_id=actor and l.partner_id=c.creator)
   and exists(select 1 from dailyfuel_private.menu_links l where l.owner_id=c.creator and l.partner_id=actor))));
$$;
create function dailyfuel_private.gpt_identity(token text) returns table(actor uuid,client uuid)
language sql stable set search_path='' as $$
 select t.owner_id,t.client_id from dailyfuel_private.gpt_tokens t
 join dailyfuel_private.gpt_grants g on g.client_id=t.client_id and g.owner_id=t.owner_id
 where t.access_hash=dailyfuel_private.gpt_hash(token) and not t.revoked and t.expires_at>now()
  and g.active and dailyfuel_private.gpt_client_allowed(t.owner_id,t.client_id);
$$;
create function dailyfuel_private.gpt_targets(actor uuid,client uuid) returns jsonb
language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('recipient_id',g.recipient_id,'display_name',p.name,
  'person',p.slot,'relationship',case when g.owner_id=actor then 'self' else 'partner' end)
  order by (g.owner_id=actor) desc,p.slot),'[]'::jsonb)
 from dailyfuel_private.gpt_grants g join public.profiles p on p.id=g.profile_id and p.owner_id=g.owner_id
 join dailyfuel_private.gpt_grants own on own.client_id=client and own.owner_id=actor and own.active
 where g.client_id=client and g.active and dailyfuel_private.gpt_client_allowed(g.owner_id,client) and (g.owner_id=actor or
  (own.allow_partner and g.allow_partner
   and exists(select 1 from dailyfuel_private.menu_links l where l.owner_id=actor and l.partner_id=g.owner_id)
   and exists(select 1 from dailyfuel_private.menu_links l where l.owner_id=g.owner_id and l.partner_id=actor)));
$$;
revoke all on function dailyfuel_private.gpt_hash(text),dailyfuel_private.gpt_client_allowed(uuid,uuid),
 dailyfuel_private.gpt_identity(text),dailyfuel_private.gpt_targets(uuid,uuid) from public,anon,authenticated;

-- A deliberately narrow security-definer boundary: ordinary Supabase sessions may
-- manage their own consent; opaque OAuth capabilities may only list recipients,
-- prepare drafts and append an atomic, idempotent batch. No diary reads/edits,
-- weight/profile/goal writes, or self-created partner relationships are exposed.
create function dailyfuel_private.gpt_bridge(action text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 actor uuid; client uuid; profile uuid; callback text; secret text; code text;
 access_value text;refresh_value text;family uuid;refresh_deadline timestamptz;
 client_row dailyfuel_private.gpt_clients%rowtype;
 grant_row dailyfuel_private.gpt_grants%rowtype;
 code_row dailyfuel_private.gpt_codes%rowtype;
 token_row dailyfuel_private.gpt_tokens%rowtype;
 draft dailyfuel_private.gpt_drafts%rowtype;
 targets jsonb;item jsonb;target jsonb;normalized jsonb:='[]';summary jsonb:='[]';result jsonb:='[]';
 request_uuid uuid;request_hash text;recipient uuid;entry_uuid uuid;key text;value numeric;normalized_item jsonb;
begin
 if jsonb_typeof(payload) is distinct from 'object' then raise exception 'Invalid request' using errcode='22023'; end if;
 if action in ('connections','register','configure','authorize','revoke','revoke_client') then
  actor:=(select auth.uid());
  if actor is null then raise exception 'Sign in to Daily Fuel' using errcode='42501'; end if;
 end if;

 if action='connections' then
  return jsonb_build_object('clients',coalesce((select jsonb_agg(jsonb_build_object(
   'client_id',c.id,'redirect_uri',c.redirect_uri,'is_creator',c.creator=actor,
   'person',p.slot,'allow_partner',coalesce(g.allow_partner,false),'active',coalesce(g.active,false)) order by c.created_at)
   from dailyfuel_private.gpt_clients c left join dailyfuel_private.gpt_grants g on g.client_id=c.id and g.owner_id=actor
   left join public.profiles p on p.id=g.profile_id and p.owner_id=actor
   where dailyfuel_private.gpt_client_allowed(actor,c.id)),'[]'::jsonb));
 elsif action='register' then
  callback:=payload->>'redirect_uri';
  if callback is null or length(callback)>512 or callback ~ '[[:cntrl:]]' or
   callback !~ '^https://(chatgpt\.com|chat\.openai\.com)/aip/g-[A-Za-z0-9-]+/oauth/callback$' then
   raise exception 'Use the exact ChatGPT OAuth callback URL' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('gpt-client:'||actor::text,0));
  if (select count(*) from dailyfuel_private.gpt_clients where creator=actor and not revoked)>=3 then
   raise exception 'Revoke an old GPT connection before creating another' using errcode='22023';
  end if;
  secret:='df_s_'||encode(extensions.gen_random_bytes(32),'hex');
  insert into dailyfuel_private.gpt_clients(creator,redirect_uri,secret_hash)
   values(actor,callback,dailyfuel_private.gpt_hash(secret)) returning id into client;
  return jsonb_build_object('client_id',client,'client_secret',secret,'redirect_uri',callback);
 elsif action='metadata' then
  client:=(payload->>'client_id')::uuid;
  select * into client_row from dailyfuel_private.gpt_clients c where c.id=client and not c.revoked;
  if not found or client_row.redirect_uri is distinct from payload->>'redirect_uri' then
   raise exception 'Invalid OAuth client or callback' using errcode='22023';
  end if;
  return jsonb_build_object('client_id',client,'client_name','Daily Fuel GPT','redirect_uri',client_row.redirect_uri);
 elsif action in ('configure','authorize','revoke','revoke_client') then
  client:=(payload->>'client_id')::uuid;
  if not dailyfuel_private.gpt_client_allowed(actor,client) then raise exception 'Connection is not available to this account' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('gpt-grants:'||client::text,0));
  if action='revoke_client' then
   update dailyfuel_private.gpt_clients set revoked=true where id=client and creator=actor;
   if not found then raise exception 'Only the creator can revoke this client' using errcode='42501'; end if;
   return jsonb_build_object('revoked',true);
  elsif action='revoke' then
   update dailyfuel_private.gpt_grants set active=false,allow_partner=false where client_id=client and owner_id=actor;
   update dailyfuel_private.gpt_tokens set revoked=true where client_id=client and owner_id=actor;
   update dailyfuel_private.gpt_codes set used=true where client_id=client and owner_id=actor;
   return jsonb_build_object('revoked',true);
  end if;
  select p.id into profile from public.profiles p where p.owner_id=actor and p.slot=payload->>'person';
  if profile is null or jsonb_typeof(payload->'allow_partner') is distinct from 'boolean' then
   raise exception 'Choose your own profile and consent preference' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('gpt-grants:'||client::text,0));
  if exists(select 1 from dailyfuel_private.gpt_grants g join public.profiles p on p.id=g.profile_id
   where g.client_id=client and g.owner_id<>actor and g.active and dailyfuel_private.gpt_client_allowed(g.owner_id,client) and p.slot=payload->>'person') then
   raise exception 'The two accounts must select different people' using errcode='22023';
  end if;
  if exists(select 1 from dailyfuel_private.gpt_grants g where g.client_id=client and g.owner_id=actor and (g.profile_id<>profile or not g.active)) then
   update dailyfuel_private.gpt_tokens set revoked=true where client_id=client and owner_id=actor;
   update dailyfuel_private.gpt_codes set used=true where client_id=client and owner_id=actor;
  end if;
  insert into dailyfuel_private.gpt_grants(client_id,owner_id,profile_id,allow_partner)
   values(client,actor,profile,(payload->>'allow_partner')::boolean)
   on conflict(client_id,owner_id) do update set profile_id=excluded.profile_id,
    recipient_id=case when gpt_grants.profile_id<>excluded.profile_id or not gpt_grants.active then gen_random_uuid() else gpt_grants.recipient_id end,
    allow_partner=excluded.allow_partner,active=true;
  if action='configure' then return jsonb_build_object('configured',true); end if;
  select * into client_row from dailyfuel_private.gpt_clients c where c.id=client;
  if client_row.redirect_uri is distinct from payload->>'redirect_uri' or payload->>'scope' is distinct from 'meals.write' then
   raise exception 'Invalid OAuth callback or scope' using errcode='22023'; end if;
  if payload->>'challenge' is not null and (payload->>'challenge' !~ '^[A-Za-z0-9_-]{43}$') then
   raise exception 'Invalid S256 challenge' using errcode='22023'; end if;
  code:='df_c_'||encode(extensions.gen_random_bytes(32),'hex');
  insert into dailyfuel_private.gpt_codes(code_hash,client_id,owner_id,redirect_uri,challenge)
   values(dailyfuel_private.gpt_hash(code),client,actor,client_row.redirect_uri,payload->>'challenge');
  return jsonb_build_object('code',code,'redirect_uri',client_row.redirect_uri);
 elsif action='exchange' then
  begin client:=(payload->>'client_id')::uuid; exception when invalid_text_representation then return jsonb_build_object('error','invalid_client'); end;
  select * into client_row from dailyfuel_private.gpt_clients c where c.id=client and not c.revoked
   and c.secret_hash=dailyfuel_private.gpt_hash(payload->>'client_secret');
  if not found then return jsonb_build_object('error','invalid_client'); end if;
  -- Serialize exchange/rotation with consent changes so old credentials cannot
  -- escape a concurrent profile change or revoke.
  perform pg_advisory_xact_lock(hashtextextended('gpt-grants:'||client::text,0));
  if payload->>'grant_type'='authorization_code' then
   select * into code_row from dailyfuel_private.gpt_codes c where c.code_hash=dailyfuel_private.gpt_hash(payload->>'code') and c.client_id=client for update;
   if not found or code_row.used or code_row.expires_at<=now() or code_row.redirect_uri is distinct from payload->>'redirect_uri' then
    return jsonb_build_object('error','invalid_grant'); end if;
   if code_row.challenge is not null and (payload->>'code_verifier' is null or payload->>'code_verifier' !~ '^[A-Za-z0-9._~-]{43,128}$' or
    code_row.challenge<>rtrim(translate(encode(extensions.digest(payload->>'code_verifier','sha256'),'base64'),'+/','-_'),'=')) then
    return jsonb_build_object('error','invalid_grant'); end if;
   actor:=code_row.owner_id;family:=gen_random_uuid();refresh_deadline:=now()+interval '30 days';
   update dailyfuel_private.gpt_codes set used=true where code_hash=code_row.code_hash;
  elsif payload->>'grant_type'='refresh_token' then
   select * into token_row from dailyfuel_private.gpt_tokens t where t.refresh_hash=dailyfuel_private.gpt_hash(payload->>'refresh_token') and t.client_id=client for update;
   if not found then return jsonb_build_object('error','invalid_grant'); end if;
   if token_row.refresh_used then
    update dailyfuel_private.gpt_tokens set revoked=true where family_id=token_row.family_id;
    return jsonb_build_object('error','invalid_grant');
   end if;
   if token_row.revoked or token_row.refresh_expires_at<=now() then return jsonb_build_object('error','invalid_grant'); end if;
   actor:=token_row.owner_id;family:=token_row.family_id;refresh_deadline:=token_row.refresh_expires_at;
   update dailyfuel_private.gpt_tokens set refresh_used=true,revoked=true where access_hash=token_row.access_hash;
  else return jsonb_build_object('error','unsupported_grant_type'); end if;
  if not dailyfuel_private.gpt_client_allowed(actor,client) or not exists(select 1 from dailyfuel_private.gpt_grants g where g.client_id=client and g.owner_id=actor and g.active) then
   return jsonb_build_object('error','invalid_grant'); end if;
  access_value:='df_a_'||encode(extensions.gen_random_bytes(32),'hex');refresh_value:='df_r_'||encode(extensions.gen_random_bytes(32),'hex');
  insert into dailyfuel_private.gpt_tokens(access_hash,refresh_hash,client_id,owner_id,family_id,refresh_expires_at)
   values(dailyfuel_private.gpt_hash(access_value),dailyfuel_private.gpt_hash(refresh_value),client,actor,family,refresh_deadline);
  return jsonb_build_object('access_token',access_value,'refresh_token',refresh_value,'token_type','bearer','expires_in',3600,'scope','meals.write');
 elsif action in ('targets','prepare','confirm') then
  select i.actor,i.client into actor,client from dailyfuel_private.gpt_identity(payload->>'access_token') i;
  if actor is null then raise exception 'Invalid or expired access token' using errcode='28000'; end if;
  if action='targets' then return jsonb_build_object('recipients',dailyfuel_private.gpt_targets(actor,client)); end if;
  -- Hold consent/client/relationship rows through the append transaction.
  perform 1 from dailyfuel_private.gpt_clients c where c.id=client for share;
  perform 1 from dailyfuel_private.gpt_grants g where g.client_id=client for share;
  perform 1 from dailyfuel_private.menu_links l where l.owner_id=actor or l.partner_id=actor for share;
  if not exists(select 1 from dailyfuel_private.gpt_identity(payload->>'access_token')) then raise exception 'Authorization revoked' using errcode='28000'; end if;
  targets:=dailyfuel_private.gpt_targets(actor,client);
  if action='prepare' then
   request_uuid:=(payload->>'request_id')::uuid;
   if request_uuid is null or jsonb_typeof(payload->'entries') is distinct from 'array' or jsonb_array_length(payload->'entries') not between 1 and 2 then
    raise exception 'Provide one or two meal entries and a request UUID' using errcode='22023'; end if;
   for item in select x.value from jsonb_array_elements(payload->'entries') x loop
    if jsonb_typeof(item) is distinct from 'object' then raise exception 'Invalid meal entry' using errcode='22023'; end if;
    if exists(select 1 from jsonb_object_keys(item) k where k not in ('recipient_id','date','meal','name','calories','protein','carbs','fat','nutrition_source')) then
     raise exception 'Unexpected meal field' using errcode='22023'; end if;
    recipient:=(item->>'recipient_id')::uuid;
    if recipient is null or item->>'date' is null or item->>'date' !~ '^\d{4}-\d{2}-\d{2}$' or
     item->>'meal' is null or item->>'meal' not in ('Breakfast','Lunch','Dinner','Snack') or
     jsonb_typeof(item->'name') is distinct from 'string' or length(btrim(item->>'name')) not between 1 and 200 then
     raise exception 'Check recipient, date, meal and food name' using errcode='22023'; end if;
    perform (item->>'date')::date;
    if coalesce(item->>'nutrition_source','chatgpt_estimate') not in ('chatgpt_estimate','label','provided') then raise exception 'Invalid nutrition source' using errcode='22023'; end if;
    normalized_item:=jsonb_build_object('recipient_id',recipient,'date',item->>'date','meal',item->>'meal','name',btrim(item->>'name'),'nutrition_source',coalesce(item->>'nutrition_source','chatgpt_estimate'));
    foreach key in array array['calories','protein','carbs','fat'] loop
     if jsonb_typeof(item->key) is distinct from 'number' then raise exception 'All four nutrient values are required numbers' using errcode='22023'; end if;
     value:=(item->>key)::numeric;
     if value<0 or value>100000 then raise exception 'Nutrient value out of range' using errcode='22023'; end if;
     normalized_item:=normalized_item||jsonb_build_object(key,round(value,2));
    end loop;
    normalized:=normalized||jsonb_build_array(normalized_item);
   end loop;
   if (select count(distinct x->>'recipient_id') from jsonb_array_elements(normalized) x)<>jsonb_array_length(normalized) then raise exception 'Use one entry per recipient' using errcode='22023'; end if;
   select jsonb_agg(x order by x->>'recipient_id') into normalized from jsonb_array_elements(normalized) x;
   request_hash:=dailyfuel_private.gpt_hash(normalized::text);
   perform pg_advisory_xact_lock(hashtextextended('gpt-draft:'||client::text||actor::text||request_uuid::text,0));
   select * into draft from dailyfuel_private.gpt_drafts d where d.client_id=client and d.owner_id=actor and d.request_id=request_uuid for update;
   if found then
    if draft.request_hash<>request_hash then raise exception 'Request ID already used with different meal data' using errcode='23505'; end if;
    if draft.response is not null then return draft.response||jsonb_build_object('replayed',true); end if;
    if draft.expires_at<=now() then raise exception 'Draft expired; create a new request' using errcode='22023'; end if;
    return jsonb_build_object('draft_id',draft.id,'status','awaiting_confirmation','expires_at',draft.expires_at,'entries',draft.entries);
   end if;
   for item in select x.value from jsonb_array_elements(normalized) x loop
    select x.value into target from jsonb_array_elements(targets) x where x.value->>'recipient_id'=item->>'recipient_id';
    if target is null then raise exception 'Recipient has not authorized joint logging' using errcode='42501'; end if;
    summary:=summary||jsonb_build_array(item||jsonb_build_object('recipient_name',target->>'display_name','person',target->>'person'));
   end loop;
   insert into dailyfuel_private.gpt_drafts(client_id,owner_id,request_id,request_hash,entries)
    values(client,actor,request_uuid,request_hash,summary) returning * into draft;
   return jsonb_build_object('draft_id',draft.id,'status','awaiting_confirmation','expires_at',draft.expires_at,'entries',draft.entries);
  end if;
  select * into draft from dailyfuel_private.gpt_drafts d where d.id=(payload->>'draft_id')::uuid and d.owner_id=actor and d.client_id=client for update;
  if not found then raise exception 'Draft not found' using errcode='P0002'; end if;
  if draft.response is not null then return draft.response||jsonb_build_object('replayed',true); end if;
  if draft.expires_at<=now() then raise exception 'Draft expired; prepare it again' using errcode='22023'; end if;
  for item in select x.value from jsonb_array_elements(draft.entries) x loop
   select x.value into target from jsonb_array_elements(targets) x where x.value->>'recipient_id'=item->>'recipient_id';
   if target is null then raise exception 'Recipient permission changed; prepare the meal again' using errcode='42501'; end if;
   select * into grant_row from dailyfuel_private.gpt_grants g where g.client_id=client and g.recipient_id=(item->>'recipient_id')::uuid and g.active;
   if not found then raise exception 'Recipient unavailable' using errcode='42501'; end if;
   insert into public.entries(owner_id,profile_id,date,meal,name,calories,protein,carbs,fat,nutrition_source)
    values(grant_row.owner_id,grant_row.profile_id,(item->>'date')::date,item->>'meal',item->>'name',
     (item->>'calories')::numeric,(item->>'protein')::numeric,(item->>'carbs')::numeric,(item->>'fat')::numeric,item->>'nutrition_source') returning id into entry_uuid;
   result:=result||jsonb_build_array(item||jsonb_build_object('entry_id',entry_uuid));
  end loop;
  result:=jsonb_build_object('draft_id',draft.id,'request_id',draft.request_id,'status','recorded','replayed',false,'entries',result);
  update dailyfuel_private.gpt_drafts set response=result where id=draft.id;
  return result;
 end if;
 raise exception 'Unknown operation' using errcode='22023';
end;
$$;
revoke all on function dailyfuel_private.gpt_bridge(text,jsonb) from public;
grant usage on schema dailyfuel_private to anon,authenticated;
grant execute on function dailyfuel_private.gpt_bridge(text,jsonb) to anon,authenticated;
create function public.gpt_bridge(action text,payload jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$
 select dailyfuel_private.gpt_bridge(action,payload);
$$;
revoke all on function public.gpt_bridge(text,jsonb) from public;
grant execute on function public.gpt_bridge(text,jsonb) to anon,authenticated;
