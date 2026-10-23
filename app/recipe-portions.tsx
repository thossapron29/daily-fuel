'use client';

import {useEffect, useRef, useState} from 'react';
import {Check, X} from 'lucide-react';
import type {Profile} from '../lib/nutrition';
import {portionNutrition, validateRecipeLog, type Recipe, type RecipeLog, type PortionUnit, type Nutrients} from '../lib/recipes';
import {NutritionValues, formatNumber as number} from './ingredient-editor';

type Props = {recipe: Recipe; profiles: Profile[]; who: string; day: string; initialMeal?: string; onSave: (recipe: Recipe, log: RecipeLog) => Promise<boolean>; onSuccess: (message: string) => void};

export function RecipePortionForm({recipe, profiles, who, day, initialMeal = 'Lunch', onSave, onSuccess}: Props) {
  const [unit, setUnit] = useState<PortionUnit>('servings');
  const [selected, setSelected] = useState<string[]>([who]);
  const [amounts, setAmounts] = useState<Record<string,string>>(() => Object.fromEntries(profiles.map(profile => [profile.id,'1'])));
  const [date, setDate] = useState(day);
  const [meal, setMeal] = useState(initialMeal);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  return <form className="portion-form" onSubmit={async event => {
    event.preventDefault();if(saving)return;setError('');
    const log:RecipeLog = {date,meal,unit,portions:selected.map(profile_id => ({profile_id,amount:Number(amounts[profile_id])}))};
    try {validateRecipeLog(log,profiles.map(profile=>profile.id));for(const portion of log.portions)portionNutrition(recipe,portion.amount,unit);} catch(error){setError(error instanceof Error ? error.message : 'ตรวจสอบปริมาณที่กิน');return;}
    setSaving(true);
    try {if(await onSave(recipe,log))onSuccess(`บันทึก ${recipe.name} ให้ ${selected.map(id=>profiles.find(profile=>profile.id===id)?.name).join(' และ ')} แล้ว`);else setError('บันทึกมื้ออาหารไม่สำเร็จ กรุณาลองอีกครั้ง');}catch{setError('บันทึกมื้ออาหารไม่สำเร็จ กรุณาลองอีกครั้ง');}finally{setSaving(false)}
  }}>
    <div className="instruction-note"><b>{recipe.name}</b><p>1 เสิร์ฟ ≈ {number(recipe.calories/recipe.servings,0)} kcal · สูตรนี้ทำได้ {recipe.servings} เสิร์ฟ{recipe.yield_grams ? ` · อาหารหลังปรุง ${recipe.yield_grams} g` : ''}</p></div>
    <div className="formgrid"><label>วันที่<input required type="date" value={date} onChange={event=>setDate(event.target.value)}/></label><label>มื้ออาหาร<select value={meal} onChange={event=>setMeal(event.target.value)}>{['Breakfast','Lunch','Dinner','Snack'].map(value=><option key={value}>{value}</option>)}</select></label></div>
    <label>ระบุปริมาณที่กินเป็น<select value={unit} onChange={event=>{const next=event.target.value as PortionUnit;const from=unit==='grams'?recipe.yield_grams!:recipe.servings;const to=next==='grams'?recipe.yield_grams!:recipe.servings;setAmounts(Object.fromEntries(profiles.map(profile=>[profile.id,amounts[profile.id] === '' ? '' : String(Number((Number(amounts[profile.id])/from*to).toFixed(4)))])));setUnit(next)}}><option value="servings">เสิร์ฟ / จาน / กล่อง</option><option value="grams" disabled={!recipe.yield_grams}>กรัมอาหารหลังปรุง</option></select></label>
    <p className="field-help">{unit==='servings'?'กิน 1 กล่อง = 1 เสิร์ฟ · กินครึ่งกล่อง = 0.5 เสิร์ฟ':`คิดสัดส่วนจากน้ำหนักอาหารหลังปรุงทั้งสูตร ${recipe.yield_grams} g`}{!recipe.yield_grams && ' · อยากใช้กรัม? เพิ่มน้ำหนักหลังปรุงในสูตรก่อน'}</p>
    <fieldset className="portion-people"><legend>ใครกินมื้อนี้บ้าง?</legend>{profiles.map(profile=>{const active=selected.includes(profile.id);let values:Nutrients|null=null;try{if(active)values=portionNutrition(recipe,Number(amounts[profile.id]),unit)}catch{}return <div className={`portion-person ${active?'is-selected':''}`} key={profile.id}><label className="person-toggle"><input type="checkbox" checked={active} onChange={event=>setSelected(event.target.checked?[...selected,profile.id]:selected.filter(id=>id!==profile.id))}/><b>{profile.name}</b><span>{active?'บันทึกให้คนนี้':'ไม่ได้กิน / ไม่บันทึก'}</span></label>{active&&<><label>ปริมาณที่ {profile.name} กิน ({unit==='grams'?'g':'เสิร์ฟ'})<input required type="number" min="0.0001" step="any" value={amounts[profile.id]} onChange={event=>setAmounts({...amounts,[profile.id]:event.target.value})}/></label><NutritionValues values={values}/></>}</div>})}</fieldset>
    <p className="field-help">แคลและสารอาหารคำนวณให้ตามปริมาณของแต่ละคน ไม่ต้องแบ่งหมดทั้งสูตร · ใช้สัดส่วนเมื่ออาหารผสมสม่ำเสมอ</p>
    {error&&<p className="alert" role="alert">{error}</p>}<button className="primary dialog-submit" disabled={saving}><Check size={16}/>{saving?'กำลังบันทึก…':'บันทึกมื้ออาหาร'}</button>
  </form>;
}

export function RecipePortionDialog(props:Props & {onClose:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{dialog.current?.showModal()},[]);
  return <dialog ref={dialog} className="food-dialog portion-dialog" aria-labelledby="portion-dialog-title" onClose={props.onClose}><div className="dialog-header"><div><span className="eyebrow">FROM RECIPE TO YOUR DAY</span><h2 id="portion-dialog-title">บันทึกปริมาณที่กิน</h2></div><button type="button" className="icon-button" aria-label="ปิดบันทึกมื้ออาหาร" onClick={props.onClose}><X size={21}/></button></div><RecipePortionForm {...props}/></dialog>;
}
