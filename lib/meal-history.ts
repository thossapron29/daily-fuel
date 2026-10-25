import type {Entry} from './data';
import type {MealDraft} from './manual-meals';
import type {Nutrients} from './recipes';

export type MealSuggestion = Nutrients & {key:string;name:string;profile_id:string;date:string|null;shared?:boolean;source_name?:string};
export type SharedMenu = MealSuggestion & {shared:true;source_name:string;date:null};
const nutrientKeys=['calories','protein','carbs','fat'] as const;
const normalize=(value:string)=>value.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('th');

// Use all loaded dates, keep different portions separate, and never average nutrients.
// Array position breaks same-date ties for newly appended entries (legacy rows have no timestamp).
export function mealSuggestions(entries:Entry[],who:string,profileIds:string[],query:string,includeBoth=false,sharedMenus:SharedMenu[]=[]):MealSuggestion[]{
  const search=normalize(query);
  const people=[who,...profileIds.filter(id=>id!==who)];
  const sorted=entries.map((entry,index)=>({entry,index})).filter(({entry})=>
    people.includes(entry.profile_id)&&(includeBoth||entry.profile_id===who)&&
    typeof entry.name==='string'&&normalize(entry.name)&&normalize(entry.name).includes(search)&&
    typeof entry.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(entry.date)&&
    nutrientKeys.every(key=>Number.isFinite(entry[key])&&entry[key]>=0)
  ).sort((a,b)=>b.entry.date.localeCompare(a.entry.date)||b.index-a.index);
  const seen=new Set<string>();
  const counts=new Map<string,number>();
  const suggestions:MealSuggestion[]=[];
  for(const {entry} of sorted){
    const key=JSON.stringify([entry.profile_id,normalize(entry.name),...nutrientKeys.map(key=>entry[key])]);
    if(seen.has(key)||(counts.get(entry.profile_id)||0)>=5)continue;
    seen.add(key);counts.set(entry.profile_id,(counts.get(entry.profile_id)||0)+1);
    suggestions.push({key,name:entry.name.trim(),profile_id:entry.profile_id,date:entry.date,calories:entry.calories,protein:entry.protein,carbs:entry.carbs,fat:entry.fat});
  }
  suggestions.sort((a,b)=>people.indexOf(a.profile_id)-people.indexOf(b.profile_id));
  if(includeBoth){
    const shared=sharedMenus.filter(menu=>normalize(menu.name).includes(search)).sort((a,b)=>people.indexOf(a.profile_id.slice(7))-people.indexOf(b.profile_id.slice(7)));
    const sharedKeys=new Set<string>();
    for(const menu of shared){
      const key=JSON.stringify([menu.profile_id,normalize(menu.name),...nutrientKeys.map(key=>menu[key])]);
      if(sharedKeys.has(key))continue;
      sharedKeys.add(key);suggestions.push(menu);
    }
  }
  return suggestions;
}

// Accept only the limited RPC projection. Partner dates, diary IDs and owner IDs
// never enter the autocomplete model, draft, Dashboard or local backup.
export function parseSharedMenus(rows:unknown):SharedMenu[]{
  if(!Array.isArray(rows))throw new Error('ข้อมูลเมนูที่แชร์มีรูปแบบไม่ถูกต้อง');
  return rows.map(row=>{
    if(!row||typeof row!=='object'||!['new','ben'].includes(row.profile_slot)||
      typeof row.menu_key!=='string'||!row.menu_key||typeof row.profile_name!=='string'||!row.profile_name.trim()||
      typeof row.name!=='string'||!row.name.trim()||!nutrientKeys.every(key=>Number.isFinite(row[key])&&row[key]>=0))throw new Error('ข้อมูลเมนูที่แชร์มีรูปแบบไม่ถูกต้อง');
    return {key:`shared:${row.menu_key}`,profile_id:`shared:${row.profile_slot}`,name:row.name.trim(),source_name:row.profile_name.trim(),date:null,shared:true,calories:row.calories,protein:row.protein,carbs:row.carbs,fat:row.fat};
  });
}

// Reusing nutrition creates a new manual meal, retaining the destination's meal slot.
export function applyMealSuggestion(draft:MealDraft,suggestion:MealSuggestion):MealDraft {
  return {...draft,name:suggestion.name,calories:String(suggestion.calories),protein:String(suggestion.protein),carbs:String(suggestion.carbs),fat:String(suggestion.fat)};
}
