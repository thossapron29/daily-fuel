import {extraNutrientFields,parseExtraNutrition,type ExtraKey,type ExtraNutrition} from './nutrition-insights';
import type {Nutrients} from './recipes';

// Keep editable text until submit: an empty field is different from a known zero.
export type MealDraft = {name:string; meal:string} & {[Key in keyof Nutrients]:string} & Partial<Record<ExtraKey,string>> & {nutrition_source?:'manual'|'provided'|'label'|'chatgpt_estimate'};
export const emptyMealDraft = ():MealDraft => ({name:'',meal:'Lunch',calories:'',protein:'',carbs:'',fat:''});

export function parseMealDraft(draft:MealDraft):{name:string;meal:string}&Nutrients&ExtraNutrition&{nutrition_source?:MealDraft['nutrition_source']} {
  if(!draft.name.trim())throw new Error('กรุณาใส่ชื่ออาหาร');
  if(!['Breakfast','Lunch','Dinner','Snack'].includes(draft.meal))throw new Error('กรุณาเลือกมื้ออาหาร');
  const values={} as Nutrients;
  for(const key of ['calories','protein','carbs','fat'] as const){
    const text=draft[key].trim();
    if(!text)throw new Error('กรอกสารอาหารให้ครบ ถ้าไม่มีสารอาหารนั้นให้ใส่ 0');
    const value=Number(text);
    if(!Number.isFinite(value)||value<0)throw new Error('สารอาหารต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป');
    values[key]=value;
  }
  if(draft.nutrition_source&&!['manual','provided','label','chatgpt_estimate'].includes(draft.nutrition_source))throw new Error('ตรวจสอบที่มาของตัวเลขโภชนาการ');
  const extras:Record<string,unknown>={};
  for(const {key} of extraNutrientFields){const text=draft[key]?.trim();if(text)extras[key]=Number(text)}
  return {name:draft.name.trim(),meal:draft.meal,...values,...parseExtraNutrition(extras),...(draft.nutrition_source?{nutrition_source:draft.nutrition_source}:{})};
}
