import type {Nutrients} from './recipes';

// Keep editable text until submit: an empty field is different from a known zero.
export type MealDraft = {name:string; meal:string} & {[Key in keyof Nutrients]:string};
export const emptyMealDraft = ():MealDraft => ({name:'',meal:'Lunch',calories:'',protein:'',carbs:'',fat:''});

export function parseMealDraft(draft:MealDraft):{name:string;meal:string}&Nutrients {
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
  return {name:draft.name.trim(),meal:draft.meal,...values};
}
