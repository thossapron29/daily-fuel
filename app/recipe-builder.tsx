'use client';

import {useEffect, useRef, useState} from 'react';
import {Plus, X, BookOpen, Leaf, Pencil, Check, ArrowRight, Scale} from 'lucide-react';
import type {Profile} from '../lib/nutrition';
import {foodCatalog} from '../lib/foods';
import {type Nutrients, type Recipe, type RecipeDraft, type RecipeLog, type PortionUnit, type FoodState, emptyRecipe, foodFromLabel, ingredientNutrition, recipeNutrition, portionNutrition, stateLabels, nutrientKeys} from '../lib/recipes';

type Props = {recipes: Recipe[]; profiles: Profile[]; who: string; day: string; onSave: (draft: RecipeDraft) => Promise<boolean>; onLog: (recipe: Recipe, log: RecipeLog) => Promise<boolean>};
const number = (value: number, digits = 1) => Number.isFinite(value) ? value.toLocaleString('en-US', {maximumFractionDigits: digits}) : '—';
const labels = {calories: 'Calories', protein: 'Protein', carbs: 'Carbs', fat: 'Fat'};
function NutritionValues({values}: {values: Nutrients | null}) {return <div className="recipe-nutrients">{nutrientKeys.map(key => <div key={key}><span>{labels[key]}</span><b>{values ? number(values[key], key === 'calories' ? 0 : 1) : '—'}<small>{key === 'calories' ? ' kcal' : ' g'}</small></b></div>)}</div>}

export default function RecipeBuilder({recipes, profiles, who, day, onSave, onLog}: Props) {
  const [draft, setDraft] = useState<RecipeDraft>(emptyRecipe);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('beef-90');
  const [foodState, setFoodState] = useState<FoodState>('raw');
  const [grams, setGrams] = useState(100);
  const [mode, setMode] = useState<'catalog' | 'label'>('catalog');
  const [custom, setCustom] = useState({name: '', state: 'as_sold' as FoodState, basis: 100, calories: 0, protein: 0, carbs: 0, fat: 0});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [logging, setLogging] = useState<Recipe | null>(null);
  const editor = useRef<HTMLElement>(null);
  const customFoods = recipes.flatMap(recipe => (recipe.ingredient_items || []).map(item => item.food)).filter(food => food.id.startsWith('label-'));
  const foods = [...new Map([...foodCatalog, ...customFoods].map(food => [food.id, food])).values()];
  const groups = [...new Map(foods.map(food => [food.group, food])).values()].filter(food => `${food.name} ${food.description}`.toLowerCase().includes(query.toLowerCase()));
  const chosenGroup = groups.find(food => food.group === group)?.group || groups[0]?.group;
  const variants = foods.filter(food => food.group === chosenGroup);
  const chosenFood = variants.find(food => food.state === foodState) || variants[0];
  let totals: Nutrients | null = null;
  try { totals = recipeNutrition(draft.ingredient_items); } catch {}
  function patch(values: Partial<RecipeDraft>) {setDraft(current => ({...current, ...values})); setMessage('');}
  function addIngredient() {
    setError('');
    if (!Number.isFinite(grams) || grams <= 0) {setError('กรอกกรัมที่ใช้มากกว่า 0');return;}
    let food = chosenFood;
    if (mode === 'label') {
      try {food = foodFromLabel(custom, `label-${crypto.randomUUID()}`);} catch (error) {setError(error instanceof Error ? error.message : 'ตรวจสอบข้อมูลฉลาก');return;}
    }
    if (!food) {setError('เลือกวัตถุดิบ หรือเพิ่มข้อมูลจากฉลาก');return;}
    patch({ingredient_items: [...draft.ingredient_items, {id: crypto.randomUUID(), food: {...food}, grams}]});
  }
  function edit(recipe: Recipe) {
    setDraft({id: recipe.id, name: recipe.name, servings: recipe.servings, yield_grams: recipe.yield_grams ?? null, ingredient_items: (recipe.ingredient_items || []).map(item => ({...item, food: {...item.food}}))});
    setError('');setMessage('');editor.current?.scrollIntoView({behavior: 'smooth', block: 'start'});
  }

  return <>
    <p className="recipe-status" role="status">{message}</p>
    <div className="cookbook-layout">
      <section className="panel cookbook-library"><div className="section-heading"><div><span className="eyebrow">SHARED BY NEW & BEN</span><h2>Our little cookbook<span className="count-badge">{recipes.length}</span></h2></div><BookOpen size={23}/></div>
        <p className="sub">สูตรเดียวกัน แบ่งปริมาณที่กินแยกกันได้</p>
        {!recipes.length ? <div className="empty-state"><img src="/illustrations/salad-bowl.svg" alt=""/><h3>A recipe worth keeping.</h3><p>เริ่มจากวัตถุดิบที่รู้จัก แล้วเก็บสูตรโปรดของเราไว้</p></div> : <div className="saved-recipes">{recipes.map(recipe => <article className="saved-recipe" key={recipe.id}>
          <span className="recipe-kind"><Leaf size={12}/>{recipe.ingredient_items?.length ? `${recipe.ingredient_items.length} วัตถุดิบ · คำนวณอัตโนมัติ` : 'สูตรเดิม · สารอาหารกรอกเอง'}</span><h3>{recipe.name}</h3>
          <p className="saved-ingredients">{recipe.ingredients}</p><div className="saved-recipe-facts"><b>{number(recipe.calories,0)} <small>kcal / ทั้งสูตร</small></b><span>{recipe.servings} เสิร์ฟ{recipe.yield_grams ? ` · ${recipe.yield_grams} g หลังปรุง` : ''}</span></div>
          <div className="saved-recipe-actions"><button type="button" className="textbutton" onClick={() => edit(recipe)}><Pencil size={13}/> แก้ไขสูตร</button><button type="button" className="secondary" onClick={() => setLogging(recipe)}>บันทึกปริมาณที่กิน <ArrowRight size={14}/></button></div>
        </article>)}</div>}
      </section>

      <section className="panel recipe-editor" ref={editor}>
        <div className="section-heading"><div><span className="eyebrow">FROM INGREDIENTS TO GOOD DAYS</span><h2>{draft.id ? 'A little recipe update.' : "What's cooking?"}</h2></div>{draft.id && <button type="button" className="textbutton" onClick={() => {setDraft(emptyRecipe());setError('')}}><Plus size={14}/> สูตรใหม่</button>}</div>
        <p className="sub">เลือกสถานะที่ชั่งให้ตรงกับข้อมูล แล้วกรอกปริมาณที่ใช้ทั้งสูตร</p>
        <form onSubmit={async event => {
          event.preventDefault();setError('');setMessage('');
          if (saving) return;
          if (!draft.name.trim() || !draft.ingredient_items.length || !totals || !Number.isFinite(draft.servings) || draft.servings <= 0) {setError('กรอกชื่อสูตร จำนวนเสิร์ฟ และเพิ่มวัตถุดิบให้ครบ');return;}
          setSaving(true);
          try {if (await onSave(draft)) {setMessage(draft.id ? 'อัปเดตสูตรแล้ว รายการอาหารที่เคยบันทึกยังใช้ค่าเดิม' : 'เก็บสูตรไว้ในครัวของเราแล้ว');setDraft(emptyRecipe());} else setError('บันทึกสูตรไม่สำเร็จ กรุณาลองอีกครั้ง');} catch {setError('บันทึกสูตรไม่สำเร็จ กรุณาลองอีกครั้ง');} finally {setSaving(false);}
        }}>
          <label htmlFor="recipe-name">Recipe name<input id="recipe-name" required value={draft.name} placeholder="เช่น ข้าวเนื้อบดสูตรบ้านเรา" onChange={event => patch({name: event.target.value})}/></label>
          <div className="ingredient-picker">
            <div className="picker-tabs"><button type="button" aria-pressed={mode === 'catalog'} onClick={() => setMode('catalog')}>เลือกจากคลัง</button><button type="button" aria-pressed={mode === 'label'} onClick={() => setMode('label')}>ใช้ฉลากสินค้า</button></div>
            {mode === 'catalog' ? <>
              <label htmlFor="ingredient-search">ค้นหาวัตถุดิบ<input id="ingredient-search" type="search" placeholder="เช่น เนื้อบด ข้าว อกไก่" value={query} onChange={event => setQuery(event.target.value)}/></label>
              <label htmlFor="ingredient-food">Ingredient<select id="ingredient-food" value={chosenGroup || ''} onChange={event => setGroup(event.target.value)}>{!groups.length && <option value="">ไม่พบ — เพิ่มจากฉลากสินค้าได้</option>}{groups.map(food => <option key={food.group} value={food.group}>{food.name}</option>)}</select></label>
              <label htmlFor="ingredient-state">สถานะที่ชั่ง<select id="ingredient-state" value={chosenFood?.state || ''} onChange={event => setFoodState(event.target.value as FoodState)}>{variants.map(food => <option key={food.id} value={food.state}>{stateLabels[food.state]}</option>)}</select></label>
              {chosenFood && <div className="ingredient-reference"><p>{chosenFood.description}</p><span>ต่อ 100 g: {number(chosenFood.calories,0)} kcal · P {number(chosenFood.protein)} / C {number(chosenFood.carbs)} / F {number(chosenFood.fat)} g</span>{chosenFood.source_url ? <a href={chosenFood.source_url} target="_blank" rel="noreferrer">{chosenFood.source} · {chosenFood.source_id}</a> : <span>{chosenFood.source}</span>}<p>มีเฉพาะสถานะที่มีข้อมูลอ้างอิง ไม่ได้แปลงน้ำหนักดิบเป็นสุกให้</p></div>}
            </> : <>
              <label htmlFor="label-name">ชื่อวัตถุดิบ / ยี่ห้อ<input id="label-name" value={custom.name} placeholder="เช่น ซอสปรุงรสยี่ห้อที่ใช้" onChange={event => setCustom({...custom,name: event.target.value})}/></label>
              <div className="formgrid"><label htmlFor="label-state">สถานะตามฉลาก<select id="label-state" value={custom.state} onChange={event => setCustom({...custom,state: event.target.value as FoodState})}>{Object.entries(stateLabels).map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label><label htmlFor="label-basis">ปริมาณอ้างอิงบนฉลาก (g)<input id="label-basis" type="number" min="0.1" step="any" value={custom.basis || ''} onChange={event => setCustom({...custom,basis: Number(event.target.value)})}/></label>{nutrientKeys.map(key => <label key={key} htmlFor={`label-${key}`}>{labels[key]} {key === 'calories' ? '(kcal)' : '(g)'}<input id={`label-${key}`} type="number" min="0" step="any" value={custom[key]} onChange={event => setCustom({...custom,[key]: Number(event.target.value)})}/></label>)}</div><p className="field-help">กรอกสารอาหารตามปริมาณอ้างอิงบนฉลาก เช่น ต่อ 15 g ระบบจะคำนวณเทียบปริมาณที่ใช้จริงให้</p>
            </>}
            <div className="ingredient-add"><label htmlFor="ingredient-grams">กรัมที่ใช้ในสูตร (g)<input id="ingredient-grams" type="number" min="0.1" step="any" value={grams || ''} onChange={event => setGrams(Number(event.target.value))}/></label><button type="button" className="secondary" onClick={addIngredient}><Plus size={16}/> เพิ่มวัตถุดิบ</button></div>
          </div>

          <div className="ingredient-list" aria-label="Recipe ingredients">{draft.ingredient_items.length ? draft.ingredient_items.map((item,index) => {
            let values: Nutrients | null = null;try {values = ingredientNutrition(item);} catch {}
            const rowVariants = foods.filter(food => food.group === item.food.group);
            if (!rowVariants.some(food => food.id === item.food.id)) rowVariants.push(item.food);
            return <div className="ingredient-line" key={item.id}><div className="ingredient-line-name"><b>{item.food.name}</b><label className="sr-only" htmlFor={`row-state-${item.id}`}>สถานะวัตถุดิบ {index + 1}</label><select id={`row-state-${item.id}`} value={item.food.id} onChange={event => patch({ingredient_items: draft.ingredient_items.map(row => row.id === item.id ? {...row,food: {...rowVariants.find(food => food.id === event.target.value)!}} : row)})}>{rowVariants.map(food => <option key={food.id} value={food.id}>{stateLabels[food.state]}</option>)}</select><span>{values ? `${number(values.calories,0)} kcal · P ${number(values.protein)} / C ${number(values.carbs)} / F ${number(values.fat)} g` : 'กรอกปริมาณมากกว่า 0'}</span></div><label className="ingredient-line-grams">กรัม รายการ {index + 1}<input required type="number" min="0.1" step="any" value={item.grams || ''} onChange={event => patch({ingredient_items: draft.ingredient_items.map(row => row.id === item.id ? {...row,grams: Number(event.target.value)} : row)})}/></label><button type="button" className="icon-button" aria-label={`ลบวัตถุดิบ ${index + 1}`} onClick={() => patch({ingredient_items: draft.ingredient_items.filter(row => row.id !== item.id)})}><X size={17}/></button></div>;
          }) : <p className="ingredients-empty">เพิ่มวัตถุดิบ แล้วผลรวมจะคำนวณให้อัตโนมัติ</p>}</div>
          <div className="recipe-totals"><span className="eyebrow">WHOLE RECIPE · รวมทั้งสูตร</span><NutritionValues values={totals}/></div>
          <div className="formgrid recipe-yield"><label htmlFor="recipe-servings">จำนวนเสิร์ฟทั้งหมด<input id="recipe-servings" required type="number" min="0.1" step="any" value={draft.servings || ''} onChange={event => patch({servings: Number(event.target.value)})}/></label><label htmlFor="recipe-yield">น้ำหนักหลังปรุง (g) · optional<input id="recipe-yield" type="number" min="0.1" step="any" placeholder="ชั่งอาหารทั้งหมดหลังปรุง" value={draft.yield_grams ?? ''} onChange={event => patch({yield_grams: event.target.value === '' ? null : Number(event.target.value)})}/></label></div>
          <p className="field-help">กรอกน้ำหนักหลังปรุงเพื่อแบ่งตามกรัม ถ้าเว้นว่างจะแบ่งตามจำนวนเสิร์ฟ ไม่ใช้ผลรวมกรัมวัตถุดิบแทนน้ำหนักหลังปรุง</p>
          {totals && draft.servings > 0 && <p className="per-serving">ต่อ 1 เสิร์ฟ ≈ {number(totals.calories / draft.servings,0)} kcal · P {number(totals.protein / draft.servings)} / C {number(totals.carbs / draft.servings)} / F {number(totals.fat / draft.servings)} g</p>}
          {error && <p className="alert" role="alert">{error}</p>}<button className="primary recipe-save" disabled={saving}><Check size={16}/>{saving ? 'Saving…' : draft.id ? 'Save recipe changes' : 'Save recipe'}</button>
        </form>
      </section>
    </div>
    {logging && <RecipePortionDialog recipe={logging} profiles={profiles} who={who} day={day} onClose={() => setLogging(null)} onSave={onLog} onSuccess={message => {setMessage(message);setLogging(null)}}/>}
  </>;
}

function RecipePortionDialog({recipe, profiles, who, day, onClose, onSave, onSuccess}: {recipe: Recipe; profiles: Profile[]; who: string; day: string; onClose: () => void; onSave: Props['onLog']; onSuccess: (message: string) => void}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [unit, setUnit] = useState<PortionUnit>(recipe.yield_grams ? 'grams' : 'servings');
  const [amounts, setAmounts] = useState<Record<string,number>>(() => Object.fromEntries(profiles.map(profile => [profile.id,profile.id === who ? (recipe.yield_grams ? recipe.yield_grams / recipe.servings : 1) : 0])));
  const [date, setDate] = useState(day);
  const [meal, setMeal] = useState('Lunch');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {dialog.current?.showModal();},[]);
  const unitLabel = unit === 'grams' ? 'g' : 'เสิร์ฟ';
  return <dialog ref={dialog} className="food-dialog portion-dialog" aria-labelledby="portion-dialog-title" onClose={onClose} onClick={event => {if (event.target !== event.currentTarget) return;const r=event.currentTarget.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)onClose();}}>
    <div className="dialog-header"><div><span className="eyebrow">SAME RECIPE, YOUR OWN PORTION</span><h2 id="portion-dialog-title">แบ่งมื้ออร่อยของเรา</h2></div><button type="button" className="icon-button" aria-label="Close portions" onClick={onClose}><X size={21}/></button></div>
    <h3 className="portion-recipe-name">{recipe.name}</h3><p className="sub">สูตรเต็ม {number(recipe.calories,0)} kcal · {recipe.servings} เสิร์ฟ{recipe.yield_grams ? ` · ${recipe.yield_grams} g หลังปรุง` : ''}</p>
    <form onSubmit={async event => {event.preventDefault();setError('');if(saving)return;const portions=profiles.filter(profile=>amounts[profile.id]>0).map(profile=>({profile_id:profile.id,amount:amounts[profile.id]}));if(!portions.length){setError('กรอกปริมาณที่กินอย่างน้อย 1 คน');return;}setSaving(true);try{if(await onSave(recipe,{date,meal,unit,portions}))onSuccess(`บันทึก ${recipe.name} ให้ ${portions.map(portion=>profiles.find(profile=>profile.id===portion.profile_id)?.name).join(' และ ')} แล้ว · ${date}`);else setError('บันทึกมื้ออาหารไม่สำเร็จ กรุณาลองอีกครั้ง');}catch{setError('ตรวจสอบปริมาณและลองบันทึกอีกครั้ง');}finally{setSaving(false)}}}>
      <div className="formgrid"><label htmlFor="portion-date">วันที่<input id="portion-date" required type="date" value={date} onChange={event => setDate(event.target.value)}/></label><label htmlFor="portion-meal">มื้ออาหาร<select id="portion-meal" value={meal} onChange={event => setMeal(event.target.value)}>{['Breakfast','Lunch','Dinner','Snack'].map(value => <option key={value}>{value}</option>)}</select></label></div>
      <label htmlFor="portion-unit">แบ่งตาม<select id="portion-unit" value={unit} onChange={event => {const next=event.target.value as PortionUnit;const from=unit==='grams'?recipe.yield_grams!:recipe.servings;const to=next==='grams'?recipe.yield_grams!:recipe.servings;setAmounts(Object.fromEntries(profiles.map(profile=>[profile.id,amounts[profile.id]/from*to])));setUnit(next)}}><option value="servings">จำนวนเสิร์ฟ</option><option value="grams" disabled={!recipe.yield_grams}>กรัมอาหารหลังปรุง</option></select></label>
      {!recipe.yield_grams && <p className="field-help portion-help">หากต้องการแบ่งเป็นกรัม ให้เพิ่มน้ำหนักหลังปรุงในสูตรก่อน</p>}
      <div className="portion-profiles">{profiles.map(profile => {let values: Nutrients | null=null;try{if(amounts[profile.id]>0)values=portionNutrition(recipe,amounts[profile.id],unit)}catch{}return <div className="portion-profile" key={profile.id}><div className="portion-profile-heading"><span className="small-icon sage"><Scale size={18}/></span><h3>{profile.name}</h3><span>{values ? `${number(amounts[profile.id]/(unit==='grams'?recipe.yield_grams!:recipe.servings)*100)}% ของสูตร` : 'ไม่บันทึกให้คนนี้'}</span></div><label htmlFor={`portion-${profile.id}`}>ปริมาณที่ {profile.name} กิน ({unitLabel})<input id={`portion-${profile.id}`} type="number" min="0" step="any" value={amounts[profile.id] || ''} placeholder="0 = ไม่บันทึก" onChange={event => setAmounts({...amounts,[profile.id]:Number(event.target.value)})}/></label><NutritionValues values={values}/></div>})}</div>
      <p className="field-help">เว้นว่างหรือใส่ 0 สำหรับคนที่ไม่ได้กิน ไม่จำเป็นต้องแบ่งครบทั้งสูตร คิดตามสัดส่วนของอาหารที่ผสมสม่ำเสมอ</p>
      {error && <p className="alert" role="alert">{error}</p>}<button className="primary dialog-submit" disabled={saving}>{saving ? 'Saving…' : 'บันทึกลง Food diary'}<Check size={16}/></button>
    </form>
  </dialog>;
}
