import {extraTotals,type ExtraKey} from './nutrition-insights';
import {validSelectedDay} from './tab-paths';
import {ApiError} from './gpt-api';
export function validateSummaryArgs(args:Record<string,unknown>){
 if(Object.keys(args).some(key=>!['date','person'].includes(key))||typeof args.date!=='string'||!validSelectedDay(args.date)||typeof args.person!=='string'||!['new','ben','both'].includes(args.person))throw new ApiError(400,'invalid_request','Use a real YYYY-MM-DD date and person new, ben or both');
 return {date:args.date,person:args.person as 'new'|'ben'|'both'};
}
type Meal={meal:string;name:string;calories:number;protein:number;carbs:number;fat:number;sodium_mg:number|null;total_sugar_g:number|null;free_sugar_g:number|null;nutrition_source:string};
export function formatDailySummary(data:{date:string;profiles:{person:string;name:string;goal:string;macro_plan:string;targets:Record<string,number>;entries:Meal[]}[]}){
 return {date:data.date,timezone:'Asia/Bangkok',goal_reference:'current goal, including for past dates',profiles:data.profiles.map(({person,name,goal,macro_plan,targets,entries})=>{
  const sums=Object.fromEntries((['calories','protein','carbs','fat'] as const).map(key=>[key,Math.round(entries.reduce((sum,entry)=>sum+Number(entry[key]),0)*100)/100]));
  const extras=Object.fromEntries((['sodium_mg','total_sugar_g','free_sugar_g'] as ExtraKey[]).map(key=>[key,extraTotals(entries,key)]));
  return {person,name,goal,macro_plan,targets,meal_count:entries.length,totals:sums,optional_nutrients:extras,entries};
 })};
}
