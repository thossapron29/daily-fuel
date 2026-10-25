-- Reusable menu projection across explicitly linked accounts.
-- Private links are administered separately; no real account identifiers belong in source.
create schema if not exists dailyfuel_private;
revoke all on schema dailyfuel_private from public,anon,authenticated;
grant usage on schema dailyfuel_private to authenticated;

create table dailyfuel_private.menu_links (
 owner_id uuid not null references auth.users(id) on delete cascade,
 partner_id uuid not null references auth.users(id) on delete cascade,
 primary key(owner_id,partner_id),check(owner_id<>partner_id)
);
create index menu_links_partner_idx on dailyfuel_private.menu_links(partner_id);
alter table dailyfuel_private.menu_links enable row level security;
create policy "no direct link access" on dailyfuel_private.menu_links for all to authenticated using(false) with check(false);
revoke all on dailyfuel_private.menu_links from public,anon,authenticated;

-- Deliberate narrow privilege boundary: foreign diaries remain owner-only under RLS.
-- This private, read-only function releases only distinct reusable name/nutrient values
-- for an administrator-linked partner of auth.uid(). No diary IDs, dates, meal slots,
-- portions, ingredient snapshots, goals, weights, or account identifiers are returned.
create function dailyfuel_private.partner_menu_options(search_query text default '')
returns table(menu_key text,profile_slot text,profile_name text,name text,calories numeric,protein numeric,carbs numeric,fat numeric)
language plpgsql stable security definer set search_path='' as $$
begin
 if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if length(coalesce(search_query,''))>200 then raise exception 'Search text is too long' using errcode='22023'; end if;
 return query
 with menus as (
  select p.slot as source_slot,p.name as source_name,btrim(e.name) as food_name,
   e.calories as energy,e.protein as proteins,e.carbs as carbohydrates,e.fat as fats,max(e.date) as last_seen
  from dailyfuel_private.menu_links l
  join public.entries e on e.owner_id=l.partner_id
  join public.profiles p on p.id=e.profile_id and p.owner_id=e.owner_id
  where l.owner_id=(select auth.uid()) and length(btrim(e.name))>0
   and strpos(lower(e.name),lower(btrim(coalesce(search_query,''))))>0
   and e.calories>=0 and e.calories<'Infinity'::numeric and e.protein>=0 and e.protein<'Infinity'::numeric
   and e.carbs>=0 and e.carbs<'Infinity'::numeric and e.fat>=0 and e.fat<'Infinity'::numeric
  group by p.slot,p.name,btrim(e.name),e.calories,e.protein,e.carbs,e.fat
 ), ranked as (
  select m.*,row_number() over(partition by m.source_slot order by m.last_seen desc,m.food_name,m.energy,m.proteins,m.carbohydrates,m.fats) as position
  from menus m
 )
 select md5(jsonb_build_array(r.source_slot,r.source_name,r.food_name,r.energy,r.proteins,r.carbohydrates,r.fats)::text),
  r.source_slot,r.source_name,r.food_name,r.energy,r.proteins,r.carbohydrates,r.fats
 from ranked r where r.position<=5 order by r.source_slot,r.position;
end;
$$;
revoke all on function dailyfuel_private.partner_menu_options(text) from public,anon;
grant execute on function dailyfuel_private.partner_menu_options(text) to authenticated;

create function public.shared_menu_options(search_query text default '')
returns table(menu_key text,profile_slot text,profile_name text,name text,calories numeric,protein numeric,carbs numeric,fat numeric)
language sql stable security invoker set search_path='' as $$
 select * from dailyfuel_private.partner_menu_options(search_query);
$$;
revoke all on function public.shared_menu_options(text) from public,anon;
grant execute on function public.shared_menu_options(text) to authenticated;
