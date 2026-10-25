import type {Entry} from './data';
import type {MealDraft} from './manual-meals';
import type {Nutrients} from './recipes';

export type MealSuggestion = Nutrients & {key:string;name:string;profile_id:string;date:string};
const nutrientKeys=['calories','protein','carbs','fat'] as const;
const normalize=(value:string)=>value.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('th');

// Use all loaded dates, keep different portions separate, and never average nutrients.
// Array position breaks same-date ties for newly appended entries (legacy rows have no timestamp).
export function mealSuggestions(entries:Entry[],who:string,profileIds:string[],query:string,includeBoth=false):MealSuggestion[]{
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
  return suggestions.sort((a,b)=>people.indexOf(a.profile_id)-people.indexOf(b.profile_id));
}

// Reusing nutrition creates a new manual meal, retaining the destination's meal slot.
export function applyMealSuggestion(draft:MealDraft,suggestion:MealSuggestion):MealDraft {
  return {...draft,name:suggestion.name,calories:String(suggestion.calories),protein:String(suggestion.protein),carbs:String(suggestion.carbs),fat:String(suggestion.fat)};
}
