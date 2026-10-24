export type Nutrients = {calories: number; protein: number; carbs: number; fat: number};
export type FoodState = 'raw' | 'cooked' | 'as_sold';
export type FoodUnit = 'g' | 'ml';
export type FoodCategory = 'protein' | 'carb' | 'vegetable' | 'seasoning' | 'other';
// Nutrients are per 100 of basis_unit; older snapshots are always per 100 g.
export type Food = Nutrients & {id: string; group: string; name: string; description: string; state: FoodState; source: string; source_url?: string; source_id?: string; basis_unit?:FoodUnit; category?:FoodCategory; brand?:string; barcode?:string; label_basis?:number; aliases?:string[]};
// Keep the legacy quantity key for saved data; unit disambiguates ml quantities.
export type RecipeIngredient = {id: string; food: Food; grams: number; unit?:FoodUnit};
export type Recipe = Nutrients & {id: string; name: string; servings: number; ingredients: string; ingredient_items?: RecipeIngredient[]; yield_grams?: number | null};
export type RecipeDraft = {id?: string; name: string; servings: number; yield_grams: number | null; ingredient_items: RecipeIngredient[]};
export type PortionUnit = 'grams' | 'servings';
export type RecipeLog = {date: string; meal: string; unit: PortionUnit; portions: {profile_id: string; amount: number}[]};
export type IngredientMealDraft = {name: string; profile_id: string; date: string; meal: string; ingredient_items: RecipeIngredient[]};
export const nutrientKeys = ['calories', 'protein', 'carbs', 'fat'] as const;
export const stateLabels: Record<FoodState, string> = {raw: 'ดิบ', cooked: 'สุก', as_sold: 'ตามฉลาก / พร้อมใช้'};
export const emptyRecipe = (): RecipeDraft => ({name: '', servings: 2, yield_grams: null, ingredient_items: []});
const positive = (value: number) => Number.isFinite(value) && value > 0;
export const validNutrients = (values: Nutrients) => nutrientKeys.every(key => Number.isFinite(values[key]) && values[key] >= 0);
export const roundNutrition = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function foodFromLabel(label: Nutrients & {name: string; state: FoodState; basis: number; basis_unit?:FoodUnit}, id: string): Food {
  if (!label.name.trim() || !positive(label.basis) || !validNutrients(label) || !Object.hasOwn(stateLabels, label.state)) throw new Error('กรอกชื่อ ปริมาณอ้างอิง และสารอาหารจากฉลากให้ถูกต้อง');
  if(label.basis_unit!=null&&!['g','ml'].includes(label.basis_unit))throw new Error('เลือกหน่วย g หรือ ml ตามฉลาก');
  const values = Object.fromEntries(nutrientKeys.map(key => [key, label[key] * 100 / label.basis])) as Nutrients;
  if (!validNutrients(values)) throw new Error('ตรวจสอบปริมาณอ้างอิงบนฉลาก');
  return {...values, id, group: id, name: label.name.trim(), description: `ฉลากต่อ ${label.basis} ${label.basis_unit||'g'}`, state: label.state, source: 'ฉลากสินค้า / กรอกเอง',basis_unit:label.basis_unit||'g',label_basis:label.basis};
}

export function ingredientNutrition(item: RecipeIngredient): Nutrients {
  if (!positive(item.grams) || !validNutrients(item.food) || !Object.hasOwn(stateLabels, item.food.state)) throw new Error('ตรวจสอบปริมาณ สถานะ และสารอาหารของวัตถุดิบ');
  if(!['g','ml'].includes(item.unit||'g')||!['g','ml'].includes(item.food.basis_unit||'g')||(item.unit||'g')!==(item.food.basis_unit||'g'))throw new Error('ใช้หน่วยให้ตรงกับฉลาก ไม่แปลง g เป็น ml อัตโนมัติ');
  const values = Object.fromEntries(nutrientKeys.map(key => [key, item.food[key] * item.grams / 100])) as Nutrients;
  if (!validNutrients(values)) throw new Error('ปริมาณวัตถุดิบมากเกินไป');
  return values;
}
export function recipeNutrition(items: RecipeIngredient[]): Nutrients {
  const total: Nutrients = {calories: 0, protein: 0, carbs: 0, fat: 0};
  for (const item of items) {
    const values = ingredientNutrition(item);
    for (const key of nutrientKeys) total[key] += values[key];
  }
  if (!validNutrients(total)) throw new Error('ผลรวมสารอาหารไม่ถูกต้อง');
  return total;
}

// A one-off meal uses grams actually eaten, without a recipe or serving denominator.
export function buildIngredientMeal(draft: IngredientMealDraft, id: string, profileIds: string[]) {
  validateRecipeLog({date:draft.date,meal:draft.meal,unit:'servings',portions:[{profile_id:draft.profile_id,amount:1}]},profileIds);
  if (!draft.ingredient_items.length) throw new Error('เพิ่มวัตถุดิบอย่างน้อย 1 รายการ');
  if (draft.ingredient_items.some(item=>!item.food.name.trim())) throw new Error('กรุณาระบุชื่อวัตถุดิบ');
  const values=recipeNutrition(draft.ingredient_items);
  const totals=Object.fromEntries(nutrientKeys.map(key=>[key,roundNutrition(values[key])])) as Nutrients;
  if (!validNutrients(totals)) throw new Error('ผลรวมสารอาหารมากเกินไป');
  return {id,profile_id:draft.profile_id,date:draft.date,meal:draft.meal,
    name:draft.name.trim() || draft.ingredient_items.map(item=>item.food.name).join(' + '),
    ingredient_items:draft.ingredient_items.map(item=>({...item,food:{...item.food}})),...totals};
}
export function buildRecipe(draft: RecipeDraft, id: string): Recipe {
  if (!draft.name.trim()) throw new Error('กรุณาตั้งชื่อสูตร');
  if (!positive(draft.servings)) throw new Error('จำนวนเสิร์ฟต้องมากกว่า 0');
  if (draft.yield_grams != null && !positive(draft.yield_grams)) throw new Error('น้ำหนักหลังปรุงต้องมากกว่า 0 หรือเว้นว่าง');
  if (!draft.ingredient_items.length) throw new Error('เพิ่มวัตถุดิบอย่างน้อย 1 รายการ');
  for (const item of draft.ingredient_items) if (!item.food.name.trim()) throw new Error('กรุณาระบุชื่อวัตถุดิบ');
  const totals = recipeNutrition(draft.ingredient_items);
  return {id, name: draft.name.trim(), servings: draft.servings, yield_grams: draft.yield_grams,
    ingredient_items: draft.ingredient_items.map(item => ({...item, food: {...item.food}})),
    ingredients: draft.ingredient_items.map(item => `${item.food.name} (${stateLabels[item.food.state]}) ${item.grams} ${item.unit||'g'}`).join(' · '), ...totals};
}
export function portionNutrition(recipe: Recipe, amount: number, unit: PortionUnit): Nutrients {
  if (!['grams','servings'].includes(unit)) throw new Error('หน่วยปริมาณไม่ถูกต้อง');
  if (!positive(amount)) throw new Error('ปริมาณที่กินต้องมากกว่า 0');
  if (!validNutrients(recipe)) throw new Error('สารอาหารของสูตรไม่ถูกต้อง');
  const denominator = unit === 'grams' ? recipe.yield_grams : recipe.servings;
  if (!denominator || !positive(denominator)) throw new Error(unit === 'grams' ? 'กรอกน้ำหนักอาหารหลังปรุงก่อนแบ่งเป็นกรัม หรือเลือกจำนวนเสิร์ฟ' : 'จำนวนเสิร์ฟของสูตรไม่ถูกต้อง');
  const values = Object.fromEntries(nutrientKeys.map(key => [key, roundNutrition(recipe[key] * amount / denominator)])) as Nutrients;
  if (!validNutrients(values)) throw new Error('ปริมาณที่กินมากเกินไป');
  return values;
}
export function validateRecipeLog(log: RecipeLog, profileIds: string[]) {
  const parsed = new Date(log.date + 'T12:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(log.date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== log.date) throw new Error('กรุณาเลือกวันที่ให้ถูกต้อง');
  if (!['Breakfast','Lunch','Dinner','Snack'].includes(log.meal)) throw new Error('กรุณาเลือกมื้ออาหาร');
  if (!['grams','servings'].includes(log.unit)) throw new Error('หน่วยปริมาณไม่ถูกต้อง');
  if (!log.portions.length) throw new Error('กรอกปริมาณให้โปรไฟล์อย่างน้อย 1 คน');
  const seen = new Set<string>();
  for (const portion of log.portions) {
    if (!profileIds.includes(portion.profile_id) || seen.has(portion.profile_id) || !positive(portion.amount)) throw new Error('ตรวจสอบโปรไฟล์และปริมาณที่กิน');
    seen.add(portion.profile_id);
  }
}
