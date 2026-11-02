import type {Entry} from './data';

export const dateAt=(date:string)=>new Date(`${date}T12:00:00Z`);
export const dateKey=(date:Date)=>date.toISOString().slice(0,10);
export function shiftDays(date:string,amount:number){const d=dateAt(date);d.setUTCDate(d.getUTCDate()+amount);return dateKey(d)}
export function weekDates(date:string){const d=dateAt(date);const monday=shiftDays(date,-((d.getUTCDay()+6)%7));return Array.from({length:7},(_,i)=>shiftDays(monday,i))}
export function monthDates(date:string){const d=dateAt(date);const year=d.getUTCFullYear(),month=d.getUTCMonth();const count=new Date(Date.UTC(year,month+1,0)).getUTCDate();return Array.from({length:count},(_,i)=>dateKey(new Date(Date.UTC(year,month,i+1,12))))}
export function shiftMonth(date:string,amount:number){const d=dateAt(date);return dateKey(new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+amount,1,12)))}
export type DayTotal={count:number;calories:number;protein:number;carbs:number;fat:number};
export function dailyTotals(entries:Entry[],profile:string){
 const result=new Map<string,DayTotal>();
 for(const entry of entries){if(entry.profile_id!==profile)continue;const value=result.get(entry.date)||{count:0,calories:0,protein:0,carbs:0,fat:0};value.count++;value.calories+=Number(entry.calories);value.protein+=Number(entry.protein);value.carbs+=Number(entry.carbs);value.fat+=Number(entry.fat);result.set(entry.date,value)}
 return result;
}
export function periodSummary(dates:string[],totals:Map<string,DayTotal>){const logged=dates.map(date=>totals.get(date)).filter((value):value is DayTotal=>!!value);return {days:logged.length,calories:logged.length?logged.reduce((sum,day)=>sum+day.calories,0)/logged.length:null,protein:logged.length?logged.reduce((sum,day)=>sum+day.protein,0)/logged.length:null}}
