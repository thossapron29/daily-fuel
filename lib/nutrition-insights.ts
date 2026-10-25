export const extraNutrientFields=[
 {key:'sodium_mg',label:'โซเดียม',unit:'mg',hint:'เช่น 850'},
 {key:'total_sugar_g',label:'น้ำตาลรวม',unit:'g',hint:'เช่น 12'},
 {key:'free_sugar_g',label:'น้ำตาลอิสระ',unit:'g',hint:'เช่น 8'},
] as const;
export type ExtraKey=typeof extraNutrientFields[number]['key'];
export type ExtraNutrition=Partial<Record<ExtraKey,number|null>>;
export const known=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=100000;
export const nutritionNumber=(value:number)=>value.toLocaleString('th-TH',{maximumFractionDigits:2});
export function parseExtraNutrition(values:Record<string,unknown>):ExtraNutrition{
 const result:ExtraNutrition={};
 for(const {key,label} of extraNutrientFields){
  const value=values[key];
  if(value===undefined)continue;
  if(value===null){result[key]=null;continue}
  if(!known(value))throw new Error(`${label}ต้องเป็นตัวเลขตั้งแต่ 0 ถึง 100,000`);
  result[key]=value;
 }
 if(known(result.free_sugar_g)&&known(result.total_sugar_g)&&result.free_sugar_g>result.total_sugar_g+.01)throw new Error('น้ำตาลอิสระต้องไม่มากกว่าน้ำตาลรวม');
 return result;
}
export function extraTotals(entries:ExtraNutrition[],key:ExtraKey){
 const values=entries.map(entry=>entry[key]).filter(known);
 return {value:values.length?Math.round(values.reduce((sum,n)=>sum+n,0)*100)/100:null,known:values.length,count:entries.length,complete:entries.length>0&&values.length===entries.length};
}
export type NutritionNotice={key:string;label:string;value:number;goal:number;unit:string;level:'note'|'warning';kind:'plan'|'limit';partial?:boolean};
type Core={calories:number;protein:number;carbs:number;fat:number}&ExtraNutrition;
export function dailyNutritionNotices(entries:Core[],calorieGoal:number,macros:{carbs:number;fat:number}):NutritionNotice[]{
 const notices:NutritionNotice[]=[];
 for(const [key,label,goal,unit] of [['calories','พลังงาน',calorieGoal,'kcal'],['carbs','คาร์บ',macros.carbs,'g'],['fat','ไขมัน',macros.fat,'g']] as const){
  const value=Math.round(entries.reduce((sum,e)=>sum+(Number.isFinite(e[key])&&e[key]>=0?e[key]:0),0)*100)/100;
  if(goal>0&&value>goal)notices.push({key,label,value,goal,unit,kind:'plan',level:'note'});
 }
 // WHO adult planning references: sodium <2,000 mg; free sugars <10% energy.
 // A calorie target is used as a planning allowance, not as measured total intake.
 for(const [key,label,goal,unit] of [['sodium_mg','โซเดียม',2000,'mg'],['free_sugar_g','น้ำตาลอิสระ',calorieGoal*.1/4,'g']] as const){
  const total=extraTotals(entries,key);
  if(goal>0&&total.value!==null&&total.value>=goal)notices.unshift({key,label,value:total.value,goal,unit,kind:'limit',level:'warning',partial:!total.complete});
 }
 return notices;
}
export function freshNoticeKeys(notices:NutritionNotice[],seen:Set<string>){return notices.filter(notice=>!seen.has(notice.key)).map(notice=>notice.key)}
