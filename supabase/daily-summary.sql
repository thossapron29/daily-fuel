-- Additional, opt-in read permission. Existing meal-writing grants do not imply diary access.
create table if not exists dailyfuel_private.gpt_analysis_permissions (
 client_id uuid not null, owner_id uuid not null,
 primary key(client_id,owner_id),
 foreign key(client_id,owner_id) references dailyfuel_private.gpt_grants(client_id,owner_id) on delete cascade
);
alter table dailyfuel_private.gpt_analysis_permissions enable row level security;
revoke all on dailyfuel_private.gpt_analysis_permissions from public,anon,authenticated;
create or replace function dailyfuel_private.clear_analysis_permission() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if not new.active or not new.household_access then
  delete from dailyfuel_private.gpt_analysis_permissions where client_id=new.client_id and owner_id=new.owner_id;
 end if;
 return new;
end $$;
revoke all on function dailyfuel_private.clear_analysis_permission() from public,anon,authenticated;
drop trigger if exists clear_analysis_permission_on_revoke on dailyfuel_private.gpt_grants;
create trigger clear_analysis_permission_on_revoke after update of active,household_access on dailyfuel_private.gpt_grants for each row execute function dailyfuel_private.clear_analysis_permission();

create or replace function dailyfuel_private.daily_summary_bridge(action text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; client uuid; requested_day date; person text; result jsonb;
begin
 if jsonb_typeof(payload) is distinct from 'object' then raise exception 'Invalid request' using errcode='22023'; end if;
 if action in ('status','allow','deny') then
  actor:=auth.uid(); client:=(payload->>'client_id')::uuid;
  if actor is null or not dailyfuel_private.gpt_client_allowed(actor,client) or not exists(
   select 1 from dailyfuel_private.gpt_grants g join dailyfuel_private.gpt_clients c on c.id=g.client_id
   where g.owner_id=actor and g.client_id=client and g.active and g.household_access and c.integration='mcp' and not c.revoked
  ) then raise exception 'An active shared Plugin connection is required' using errcode='42501'; end if;
  if action='allow' then insert into dailyfuel_private.gpt_analysis_permissions values(client,actor) on conflict do nothing;
  elsif action='deny' then delete from dailyfuel_private.gpt_analysis_permissions where client_id=client and owner_id=actor; end if;
  return jsonb_build_object('allowed',exists(select 1 from dailyfuel_private.gpt_analysis_permissions where client_id=client and owner_id=actor));
 elsif action='read' then
  if exists(select 1 from jsonb_object_keys(payload) k where k not in ('access_token','resource','date','person')) then raise exception 'Unexpected field' using errcode='22023'; end if;
  select i.actor,i.client into actor,client from dailyfuel_private.gpt_identity(payload->>'access_token') i;
  if actor is null or payload->>'resource' is distinct from 'https://daily-fuel-inky.vercel.app/mcp' or not exists(
   select 1 from dailyfuel_private.gpt_tokens t where t.access_hash=dailyfuel_private.gpt_hash(payload->>'access_token') and t.resource=payload->>'resource'
  ) then raise exception 'Invalid or expired access token' using errcode='28000'; end if;
  -- Serialize reads with changes to the underlying connection consent.
  perform 1 from dailyfuel_private.gpt_grants g where g.client_id=client and g.owner_id=actor for share;
  perform 1 from dailyfuel_private.gpt_analysis_permissions a where a.client_id=client and a.owner_id=actor for share;
  if not exists(select 1 from dailyfuel_private.gpt_analysis_permissions a join dailyfuel_private.gpt_grants g using(client_id,owner_id)
   join dailyfuel_private.gpt_clients c on c.id=g.client_id where a.owner_id=actor and a.client_id=client and g.active and g.household_access and c.integration='mcp' and not c.revoked)
   then raise exception 'Daily summary permission is not enabled' using errcode='42501'; end if;
  if payload->>'date' is null or payload->>'date' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Use YYYY-MM-DD' using errcode='22023'; end if;
  requested_day:=(payload->>'date')::date; person:=payload->>'person';
  if person is null or person not in ('new','ben','both') then raise exception 'Choose new, ben or both' using errcode='22023'; end if;
  if exists(select 1 from public.entries e where e.owner_id=actor and e.date=requested_day group by e.profile_id having count(*)>200) then raise exception 'Too many meals to summarize safely' using errcode='22023'; end if;
  select jsonb_agg(jsonb_build_object('person',p.slot,'name',p.name,'goal',p.goal,'macro_plan',p.macro_plan,
   'targets',jsonb_build_object('calories',calc.calories,'protein',round(calc.calories * (case p.macro_plan when 'lower' then .4 else .3 end) / 4),'carbs',round(calc.calories * (case p.macro_plan when 'lower' then .2 when 'higher' then .5 else .35 end) / 4),'fat',round(calc.calories * (case p.macro_plan when 'lower' then .4 when 'higher' then .2 else .35 end) / 9),'sodium_mg',2000,'free_sugar_g',calc.calories * .1 / 4),
   'entries',coalesce((select jsonb_agg(jsonb_build_object('meal',e.meal,'name',e.name,'calories',e.calories,'protein',e.protein,'carbs',e.carbs,'fat',e.fat,'sodium_mg',e.sodium_mg,'total_sugar_g',e.total_sugar_g,'free_sugar_g',e.free_sugar_g,'nutrition_source',e.nutrition_source) order by e.meal,e.id) from public.entries e where e.owner_id=actor and e.profile_id=p.id and e.date=requested_day),'[]'::jsonb)) order by p.slot)
   into result from public.profiles p join dailyfuel_private.gpt_household_recipients h on h.profile_id=p.id and h.owner_id=p.owner_id and h.client_id=client
   cross join lateral (select round((case when p.body_fat is not null then 370+21.6*p.weight*(1-p.body_fat/100) else 10*p.weight+6.25*p.height-5*p.age+(case when p.sex='male' then 5 else -161 end) end)*p.activity)+p.adjustment as calories) calc
   where p.owner_id=actor and (person='both' or p.slot=person);
  if result is null or (person='both' and jsonb_array_length(result)<>2) then raise exception 'Requested profile is not authorized' using errcode='42501'; end if;
  return jsonb_build_object('date',requested_day,'profiles',result);
 end if;
 raise exception 'Unknown action' using errcode='22023';
end $$;
revoke all on function dailyfuel_private.daily_summary_bridge(text,jsonb) from public;
grant execute on function dailyfuel_private.daily_summary_bridge(text,jsonb) to anon,authenticated;
create or replace function public.daily_summary_bridge(action text,payload jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select dailyfuel_private.daily_summary_bridge(action,payload) $$;
revoke all on function public.daily_summary_bridge(text,jsonb) from public;
grant execute on function public.daily_summary_bridge(text,jsonb) to anon,authenticated;
