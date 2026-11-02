import type {Entry} from './data';
import {target,macroTargets,type Profile} from './nutrition';
import {extraNutrientFields,extraTotals,known} from './nutrition-insights';

export function householdDay(profiles:Profile[],entries:Entry[],date:string){
 return profiles.map(profile=>{
  const meals=entries.filter(entry=>entry.profile_id===profile.id&&entry.date===date);
  const totals={calories:0,protein:0,carbs:0,fat:0};
  for(const key of ['calories','protein','carbs','fat'] as const)totals[key]=Math.round(meals.reduce((sum,entry)=>sum+Number(entry[key]),0)*100)/100;
  const coverage=extraNutrientFields.map(field=>({...field,...extraTotals(meals,field.key),estimated:meals.filter(entry=>known(entry[field.key])&&entry.nutrition_source==='chatgpt_estimate').length}));
  const sources={label:0,estimate:0,provided:0,manual:0};
  for(const meal of meals){if(meal.nutrition_source==='label')sources.label++;else if(meal.nutrition_source==='chatgpt_estimate')sources.estimate++;else if(meal.nutrition_source==='provided')sources.provided++;else sources.manual++}
  const missing=meals.map(meal=>({id:meal.id,name:meal.name,fields:extraNutrientFields.filter(field=>!known(meal[field.key])).map(field=>field.label)})).filter(meal=>meal.fields.length>0);
  return {profile,entries:meals,totals,goal:target(profile),macros:macroTargets(profile),coverage,sources,missing};
 });
}
export type HouseholdPerson=ReturnType<typeof householdDay>[number];
