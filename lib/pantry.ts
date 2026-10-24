import {foodFromLabel, validNutrients, type Food, type FoodState, type FoodUnit, type FoodCategory, type Nutrients} from './recipes';

export const categoryLabels:Record<FoodCategory,string>={protein:'เนื้อสัตว์ / โปรตีน',carb:'ข้าว / เส้น / แป้ง',vegetable:'ผัก / สมุนไพร',seasoning:'เครื่องปรุง',other:'อื่น ๆ'};
type NullableNutrients={[Key in keyof Nutrients]:number|null};
export type PantryItem=Omit<Food,keyof Nutrients>&NullableNutrients&{archived:boolean;needs_nutrition:boolean};
export type ReadyPantryItem=PantryItem&Food;
export type PantryDraft=Nutrients&{id?:string;name:string;brand:string;barcode:string;category:FoodCategory;state:FoodState;basis:number;basis_unit:FoodUnit;source:string;source_url?:string;source_id?:string};
export type BarcodeCandidate={name:string;brand:string;barcode:string;basis:number|null;basis_unit:FoodUnit|null;values:Record<keyof Nutrients,number|null>;source:string;source_url:string;source_id:string};
export function hasNutrition(food:Food|PantryItem):food is Food {
  return !('needs_nutrition' in food&&food.needs_nutrition)&&(['calories','protein','carbs','fat'] as const).every(key=>{const value=food[key];return typeof value==='number'&&Number.isFinite(value)&&value>=0});
}

export function normalizeBarcode(input:string):string {
  const code=input.replace(/[\s-]/g,'');
  if(!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(code))throw new Error('กรอกบาร์โค้ดตัวเลข 8, 12, 13 หรือ 14 หลัก');
  let sum=0;for(let i=code.length-2,weight=3;i>=0;i--,weight=weight===3?1:3)sum+=Number(code[i])*weight;
  if((10-sum%10)%10!==Number(code.at(-1)))throw new Error('เลขตรวจสอบบาร์โค้ดไม่ตรง ลองตรวจตัวเลขอีกครั้ง');
  return code.length===12?`0${code}`:code.length===14&&code.startsWith('0')?code.slice(1):code;
}
export function buildPantryItem(draft:PantryDraft,id:string):ReadyPantryItem {
  if(!Object.hasOwn(categoryLabels,draft.category))throw new Error('เลือกหมวดวัตถุดิบ');
  const food=foodFromLabel(draft,id);
  return {...food,brand:draft.brand.trim(),barcode:draft.barcode.trim()?normalizeBarcode(draft.barcode):undefined,category:draft.category,
    source:draft.source.trim()||'ฉลากสินค้า / กรอกเอง',source_url:draft.source_url,source_id:draft.source_id,archived:false,needs_nutrition:false};
}
type PantryRow=Omit<PantryItem,'group'|'aliases'|'brand'|'barcode'|'category'|'basis_unit'|'label_basis'|'source_url'|'source_id'>&{brand:string;barcode:string|null;category:FoodCategory;basis_unit:FoodUnit;label_basis:number;source_url:string|null;source_id:string|null};
export function pantryToRow(item:ReadyPantryItem):PantryRow {
  if(!validNutrients(item))throw new Error('ตรวจสอบสารอาหาร');
  return {id:item.id,name:item.name,brand:item.brand||'',barcode:item.barcode||null,category:item.category||'other',state:item.state,basis_unit:item.basis_unit||'g',label_basis:item.label_basis||100,
    calories:item.calories,protein:item.protein,carbs:item.carbs,fat:item.fat,description:item.description,source:item.source,source_url:item.source_url||null,source_id:item.source_id||null,archived:item.archived,needs_nutrition:false};
}
export function pantryFromRow(row:PantryRow):PantryItem {
  return {id:row.id,group:row.id,name:row.name,brand:row.brand,barcode:row.barcode||undefined,category:row.category as FoodCategory,state:row.state,
    basis_unit:row.basis_unit as FoodUnit,label_basis:Number(row.label_basis),calories:row.calories==null?null:Number(row.calories),protein:row.protein==null?null:Number(row.protein),carbs:row.carbs==null?null:Number(row.carbs),fat:row.fat==null?null:Number(row.fat),
    description:row.description,source:row.source,source_url:row.source_url||undefined,source_id:row.source_id||undefined,archived:row.archived,needs_nutrition:row.needs_nutrition||row.calories==null||row.protein==null||row.carbs==null||row.fat==null};
}
export function draftFromFood(food:Food|PantryItem):Omit<PantryDraft,keyof Nutrients>&NullableNutrients {
  const basis=food.label_basis||100;
  return {id:food.id,name:food.name,brand:food.brand||'',barcode:food.barcode||'',category:food.category||'other',state:food.state,basis,basis_unit:food.basis_unit||'g',
    calories:food.calories==null?null:food.calories*basis/100,protein:food.protein==null?null:food.protein*basis/100,carbs:food.carbs==null?null:food.carbs*basis/100,fat:food.fat==null?null:food.fat*basis/100,source:'needs_nutrition' in food&&food.needs_nutrition?'ฉลากสินค้า / ผู้ใช้เติมข้อมูล':food.source,source_url:food.source_url,source_id:food.source_id};
}
// Never fill an absent nutrient with zero or assume a liquid's density.
export function parseBarcodeProduct(payload:unknown,requested:string):BarcodeCandidate {
  const barcode=normalizeBarcode(requested);
  if(!payload||typeof payload!=='object'||!('product' in payload)||!payload.product||typeof payload.product!=='object')throw new Error('ไม่พบสินค้าในฐานข้อมูล ลองเพิ่มจากฉลาก');
  const product=payload.product as Record<string,unknown>;
  if(product.code!=null&&normalizeBarcode(String(product.code)).padStart(14,'0')!==barcode.padStart(14,'0'))throw new Error('บาร์โค้ดสินค้าที่ตอบกลับไม่ตรงกัน');
  const nutrition=product.nutrition as {input_sets?:unknown[]}|undefined;
  if(Array.isArray(nutrition?.input_sets)) {
    type Set={source?:string;preparation?:string;per?:string;per_quantity?:number;per_unit?:string;last_updated_t?:number;nutrients?:Record<string,{value?:unknown;unit?:string;modifier?:string}>};
    const sets=(nutrition.input_sets as Set[]).filter(set=>set.source==='packaging'&&set.preparation==='as_sold'&&['g','ml'].includes(set.per_unit||'')&&typeof set.per_quantity==='number'&&Number.isFinite(set.per_quantity)&&set.per_quantity>0);
    const read=(set:Set,key:string,unit:string):number|null=>{const n=set.nutrients?.[key];return n&&(!n.modifier||n.modifier==='=')&&n.unit===unit&&typeof n.value==='number'&&Number.isFinite(n.value)&&n.value>=0?n.value:null};
    const values=(set:Set)=>({calories:read(set,'energy-kcal','kcal')??(()=>{const kj=read(set,'energy-kj','kJ')??read(set,'energy','kJ');return kj==null?null:Number((kj/4.184).toFixed(4))})(),protein:read(set,'proteins','g'),carbs:read(set,'carbohydrates','g'),fat:read(set,'fat','g')});
    sets.sort((a,b)=>Object.values(values(b)).filter(v=>v!=null).length-Object.values(values(a)).filter(v=>v!=null).length||Number(b.per===product.nutrition_data_per)-Number(a.per===product.nutrition_data_per)||(b.last_updated_t||0)-(a.last_updated_t||0));
    const set=sets[0];
    return {barcode,name:typeof product.product_name==='string'?product.product_name.trim():'',brand:typeof product.brands==='string'?product.brands:'',basis:set?.per_quantity??null,basis_unit:set?.per_unit as FoodUnit||null,
      values:set?values(set):{calories:null,protein:null,carbs:null,fat:null},source:'Open Food Facts · ข้อมูลชุมชน',source_url:`https://world.openfoodfacts.org/product/${barcode}`,source_id:barcode};
  }
  const n=product.nutriments&&typeof product.nutriments==='object'?product.nutriments as Record<string,unknown>:{};
  const value=(key:string):number|null=>typeof n[key]==='number'&&Number.isFinite(n[key])&&Number(n[key])>=0?Number(n[key]):null;
  const basisText=String(product.nutrition_data_per||'').toLowerCase().replace(/\s/g,'');
  let unit:FoodUnit|null=basisText==='100ml'?'ml':basisText==='100g'?'g':null;
  let basis:number|null=unit?100:null;let suffix='_100g';
  if(basisText==='serving') {
    const servingUnit=String(product.serving_quantity_unit||'').toLowerCase();
    const qty=product.serving_quantity;
    if((servingUnit==='g'||servingUnit==='ml')&&typeof qty==='number'&&Number.isFinite(qty)&&qty>0){unit=servingUnit;basis=qty;suffix='_serving'}
  }
  const kcal=value('energy-kcal'+suffix),kj=value('energy-kj'+suffix);
  return {barcode,name:typeof product.product_name==='string'?product.product_name.trim():'',brand:typeof product.brands==='string'?product.brands:'',basis,basis_unit:unit,
    values:{calories:kcal??(kj==null?null:Number((kj/4.184).toFixed(4))),protein:value('proteins'+suffix),carbs:value('carbohydrates'+suffix),fat:value('fat'+suffix)},
    source:'Open Food Facts · ข้อมูลชุมชน',source_url:`https://world.openfoodfacts.org/product/${barcode}`,source_id:barcode};
}
