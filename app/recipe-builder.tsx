'use client';

import {useRef, useState} from 'react';
import {Plus, BookOpen, Pencil, Check, ArrowRight, ArrowLeft} from 'lucide-react';
import type {Profile} from '../lib/nutrition';
import {buildRecipe, emptyRecipe, recipeNutrition, type Recipe, type RecipeDraft, type RecipeLog, type Nutrients} from '../lib/recipes';
import IngredientEditor, {NutritionValues, formatNumber as number} from './ingredient-editor';
import {RecipePortionDialog} from './recipe-portions';

type Props = {recipes: Recipe[]; profiles: Profile[]; who: string; day: string; startNew?: boolean; initialMeal?: string; onSave: (draft: RecipeDraft) => Promise<Recipe | null>; onLog: (recipe: Recipe, log: RecipeLog) => Promise<boolean>};
export default function RecipeBuilder({recipes, profiles, who, day, startNew=false, initialMeal='Lunch', onSave, onLog}:Props) {
  const [draft,setDraft]=useState<RecipeDraft>(emptyRecipe);
  const [editing,setEditing]=useState(startNew);
  const [step,setStep]=useState(1);
  const [error,setError]=useState('');
  const [saved,setSaved]=useState<Recipe|null>(null);
  const [message,setMessage]=useState('');
  const [saving,setSaving]=useState(false);
  const [logging,setLogging]=useState<Recipe|null>(null);
  const heading=useRef<HTMLHeadingElement>(null);
  let totals:Nutrients|null=null;try{totals=recipeNutrition(draft.ingredient_items)}catch{}
  function patch(values:Partial<RecipeDraft>){setDraft(current=>({...current,...values}));setError('')}
  function go(next:number){setStep(next);setError('');requestAnimationFrame(()=>heading.current?.focus())}
  function begin(recipe?:Recipe){setDraft(recipe?{id:recipe.id,name:recipe.name,servings:recipe.servings,yield_grams:recipe.yield_grams??null,ingredient_items:(recipe.ingredient_items||[]).map(item=>({...item,food:{...item.food}}))}:emptyRecipe());setEditing(true);setSaved(null);go(1)}
  function next(){
    if(step===1&&(!draft.ingredient_items.length||!totals)){setError('เพิ่มวัตถุดิบอย่างน้อย 1 รายการ และตรวจสอบกรัมให้ถูกต้อง');return}
    if(step===2){try{buildRecipe(draft,draft.id||'preview')}catch(error){setError(error instanceof Error?error.message:'ตรวจสอบข้อมูลสูตร');return}}
    go(step+1);
  }
  return <div className="cookbook-flow">
    <p className="recipe-status" role="status">{message}</p>
    {!editing ? <section className="panel cookbook-library">
      <div className="section-heading"><div><span className="eyebrow">OUR LITTLE COOKBOOK</span><h2>สูตรอาหารของเรา<span className="count-badge">{recipes.length}</span></h2></div><button type="button" className="primary" onClick={()=>begin()}><Plus size={17}/> สร้างสูตรใหม่</button></div>
      <p className="sub">เก็บส่วนผสมไว้ครั้งเดียว ครั้งต่อไปเลือกสูตรแล้วใส่แค่ปริมาณที่กิน</p>
      {saved&&<div className="recipe-saved-note" role="status"><div><b>เก็บสูตร “{saved.name}” แล้ว</b><p>การเก็บสูตรไม่เพิ่มยอดใน Dashboard ถ้ากินมื้อนี้แล้ว กดบันทึกมื้อได้เลย</p></div><button type="button" className="secondary" onClick={()=>setLogging(saved)}>บันทึกมื้อจากสูตรนี้ <ArrowRight size={15}/></button></div>}
      {!recipes.length?<div className="empty-state"><img src="/illustrations/salad-bowl.svg" alt=""/><h3>วันนี้ทำเมนูอะไรดี?</h3><p>1. ใส่วัตถุดิบทั้งสูตร → 2. บอกว่าทำได้กี่เสิร์ฟ → 3. เก็บไว้ใช้ซ้ำ</p><button className="secondary" onClick={()=>begin()}><Plus size={16}/> เริ่มสูตรแรก</button></div>:<div className="recipe-library-grid">{recipes.map(recipe=><article className="saved-recipe" key={recipe.id}><span className="recipe-kind"><BookOpen size={13}/> {recipe.ingredient_items?.length?`${recipe.ingredient_items.length} วัตถุดิบ · คำนวณอัตโนมัติ`:'สูตรเดิม · สารอาหารกรอกเอง'}</span><h3>{recipe.name}</h3><p className="saved-ingredients">{recipe.ingredients}</p><div className="saved-recipe-facts"><b>{number(recipe.calories/recipe.servings,0)} <small>kcal / 1 เสิร์ฟ</small></b><span>ทั้งสูตร {recipe.servings} เสิร์ฟ{recipe.yield_grams?` · ${recipe.yield_grams} g หลังปรุง`:''}</span></div><div className="saved-recipe-actions"><button type="button" className="textbutton" onClick={()=>begin(recipe)}><Pencil size={13}/> แก้ไขสูตร</button><button type="button" className="secondary" onClick={()=>setLogging(recipe)}>บันทึกมื้อนี้ <ArrowRight size={14}/></button></div></article>)}</div>}
    </section>:<section className="panel recipe-wizard">
      <div className="section-heading"><div><span className="eyebrow">A RECIPE WORTH KEEPING</span><h2>{draft.id?'แก้ไขสูตรอาหาร':'สร้างสูตรอาหาร'}</h2></div><button type="button" className="textbutton" disabled={saving} onClick={()=>setEditing(false)}>กลับไปดูสูตร</button></div>
      <ol className="recipe-steps" aria-label="ขั้นตอนสร้างสูตร">{['วัตถุดิบ','แบ่งเสิร์ฟ','ตรวจและบันทึก'].map((label,index)=><li key={label} aria-current={step===index+1?'step':undefined} className={step>=index+1?'reached':''}><span>{index+1}</span>{label}</li>)}</ol>
      <h3 ref={heading} tabIndex={-1} className="wizard-title">{step===1?'ใส่อะไรลงไปบ้าง?':step===2?'สูตรนี้แบ่งกินได้เท่าไร?':'ตรวจสูตรก่อนเก็บ'}</h3>
      <form onSubmit={async event=>{event.preventDefault();if(saving)return;if(step<3){next();return}setError('');setSaving(true);try{const result=await onSave(draft);if(result){setSaved(result);setEditing(false);setDraft(emptyRecipe());setMessage('เก็บสูตรแล้ว เลือกบันทึกมื้อเพื่อเพิ่มใน Food diary')}else setError('บันทึกสูตรไม่สำเร็จ กรุณาลองอีกครั้ง')}catch{setError('บันทึกสูตรไม่สำเร็จ กรุณาลองอีกครั้ง')}finally{setSaving(false)}}}>
        {step===1&&<IngredientEditor items={draft.ingredient_items} recipes={recipes} onChange={ingredient_items=>patch({ingredient_items})}/>}
        {step===2&&<div className="recipe-division"><p className="sub">ยังไม่ต้องแบ่งให้นิวหรือเบ้น ขั้นนี้บอกปริมาณอาหารที่ทำได้ทั้งสูตรก่อน</p><label>ชื่อสูตร<input required value={draft.name} placeholder="เช่น ข้าวเนื้อบดของบ้านเรา" onChange={event=>patch({name:event.target.value})}/></label><label>ทำได้กี่เสิร์ฟ / จาน / กล่อง?<input required type="number" min="0.1" step="any" value={draft.servings||''} onChange={event=>patch({servings:Number(event.target.value)})}/></label><p className="field-help">เช่น ทำได้ 2 กล่องเท่า ๆ กัน ใส่ 2 · ตอนบันทึกมื้อ เลือกได้ว่ากิน 1 หรือครึ่งกล่อง</p><label className="yield-toggle"><input type="checkbox" checked={draft.yield_grams!==null} onChange={event=>patch({yield_grams:event.target.checked?0:null})}/> อยากแบ่งปริมาณที่กินเป็นกรัมด้วย</label>{draft.yield_grams!==null&&<><label>น้ำหนักอาหารทั้งสูตรหลังปรุง (g)<input required type="number" min="0.1" step="any" placeholder="ชั่งอาหารทั้งหมด ไม่รวมภาชนะ" value={draft.yield_grams||''} onChange={event=>patch({yield_grams:Number(event.target.value)})}/></label><p className="field-help">ชั่งอาหารที่ปรุงเสร็จแล้วจริง ๆ เช่น รวมได้ 600 g ไม่ใช้ผลรวมกรัมวัตถุดิบแทน เพราะน้ำหนักเปลี่ยนระหว่างปรุง</p></>}</div>}
        {step===3&&<div className="recipe-review"><h3>{draft.name}</h3><p>{draft.ingredient_items.length} วัตถุดิบ · ทำได้ {draft.servings} เสิร์ฟ{draft.yield_grams?` · ${draft.yield_grams} g หลังปรุง`:''}</p><ul>{draft.ingredient_items.map(item=><li key={item.id}>{item.food.name} · {item.food.state==='raw'?'ดิบ':item.food.state==='cooked'?'สุก':'พร้อมใช้'} <b>{item.grams} g</b></li>)}</ul><span className="eyebrow">ต่อ 1 เสิร์ฟ</span><NutritionValues values={totals&&{calories:totals.calories/draft.servings,protein:totals.protein/draft.servings,carbs:totals.carbs/draft.servings,fat:totals.fat/draft.servings}}/><div className="instruction-note"><b>บันทึกสูตร ≠ บันทึกว่ากินแล้ว</b><p>สูตรเก็บไว้ใช้ซ้ำ ยอดใน Dashboard จะเปลี่ยนเมื่อเลือกสูตรและบันทึกปริมาณที่กิน</p></div></div>}
        {step!==3&&<div className="recipe-totals"><span className="eyebrow">รวมวัตถุดิบทั้งสูตร · ยังไม่แบ่งเสิร์ฟ</span><NutritionValues values={totals}/></div>}
        {error&&<p className="alert" role="alert">{error}</p>}<div className="wizard-actions">{step>1&&<button type="button" className="secondary" disabled={saving} onClick={()=>go(step-1)}><ArrowLeft size={15}/> ย้อนกลับ</button>}<button className="primary" disabled={saving}>{step===3?<><Check size={16}/>{saving?'กำลังบันทึก…':'เก็บสูตรไว้ใช้ซ้ำ'}</>:<>ถัดไป: {step===1?'แบ่งเสิร์ฟ':'ตรวจสูตร'} <ArrowRight size={16}/></>}</button></div>
      </form>
    </section>}
    {logging&&<RecipePortionDialog recipe={logging} profiles={profiles} who={who} day={day} initialMeal={initialMeal} onClose={()=>setLogging(null)} onSave={onLog} onSuccess={message=>{setMessage(message);setSaved(null);setLogging(null)}}/>}
  </div>;
}
