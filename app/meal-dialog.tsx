'use client';

import {useEffect, useRef, useState, type Dispatch, type SetStateAction} from 'react';
import {ArrowLeft, ArrowRight, BookOpen, Plus, X, Utensils} from 'lucide-react';
import type {Profile} from '../lib/nutrition';
import type {Recipe, RecipeLog, IngredientMealDraft, Food} from '../lib/recipes';
import {RecipePortionForm} from './recipe-portions';
import {formatNumber} from './ingredient-editor';
import IngredientMealForm from './ingredient-meal-form';

type FoodDraft={name:string;meal:string;calories:number;protein:number;carbs:number;fat:number};
type Props={recipes:Recipe[];profiles:Profile[];who:string;day:string;food:FoodDraft;setFood:Dispatch<SetStateAction<FoodDraft>>;error:string;addFood:()=>Promise<boolean>;onIngredientMeal:(draft:IngredientMealDraft)=>Promise<boolean>;extraFoods:Food[];onLog:(recipe:Recipe,log:RecipeLog)=>Promise<boolean>;onCreateRecipe:()=>void;onClose:()=>void;onSuccess:(message:string)=>void};

export default function MealDialog({recipes,profiles,who,day,food,setFood,error,addFood,onIngredientMeal,extraFoods,onLog,onCreateRecipe,onClose,onSuccess}:Props) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [selected,setSelected]=useState<string|null>(null);
  const [manual,setManual]=useState(false);
  const [fromIngredients,setFromIngredients]=useState(false);
  const [query,setQuery]=useState('');
  const [saving,setSaving]=useState(false);
  const [manualError,setManualError]=useState('');
  const recipe=recipes.find(recipe=>recipe.id===selected);
  const filtered=recipes.filter(recipe=>recipe.name.toLowerCase().includes(query.trim().toLowerCase()));
  useEffect(()=>{dialog.current?.showModal()},[]);
  return <dialog ref={dialog} className="food-dialog meal-picker-dialog" aria-labelledby="meal-dialog-title" onClose={onClose}>
    <div className="dialog-header"><div><span className="eyebrow">A LITTLE NOURISHMENT</span><h2 id="meal-dialog-title">Add a meal</h2></div><button type="button" className="icon-button" aria-label="Close meal form" onClick={onClose}><X size={22}/></button></div>
    {!fromIngredients&&<p className="sub">{profiles.find(profile=>profile.id===who)?.name} · {day} · {food.meal}</p>}
    {fromIngredients?<>
      <button type="button" className="textbutton" onClick={()=>setFromIngredients(false)}><ArrowLeft size={15}/> กลับไปเลือกวิธีบันทึก</button>
      <IngredientMealForm profiles={profiles} who={who} day={day} initialMeal={food.meal} recipes={recipes} extraFoods={extraFoods} onSave={onIngredientMeal} onSuccess={onSuccess}/>
    </>:<>
    {manual?<><button type="button" className="textbutton" onClick={()=>setManual(false)}><ArrowLeft size={15}/> กลับไปเลือกสูตร</button><h3 className="wizard-title">กรอกสารอาหารเอง</h3><p className="field-help">สำหรับอาหารที่มีข้อมูลบนฉลากหรือรู้ค่าอยู่แล้ว ใส่เฉพาะปริมาณที่กินจริง</p><form onSubmit={async event=>{event.preventDefault();if(saving)return;setSaving(true);setManualError('');try{if(await addFood())onSuccess('บันทึกมื้ออาหารแล้ว');else setManualError('บันทึกไม่สำเร็จ ตรวจสอบข้อมูลและลองอีกครั้ง')}catch{setManualError('บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง')}finally{setSaving(false)}}}><div className="formgrid"><label>ชื่ออาหาร<input required value={food.name} onChange={event=>setFood({...food,name:event.target.value})}/></label><label>มื้ออาหาร<select value={food.meal} onChange={event=>setFood({...food,meal:event.target.value})}>{['Breakfast','Lunch','Dinner','Snack'].map(meal=><option key={meal}>{meal}</option>)}</select></label>{(['calories','protein','carbs','fat'] as const).map(key=><label key={key}>{({calories:'พลังงาน (kcal)',protein:'โปรตีน (g)',carbs:'คาร์บ (g)',fat:'ไขมัน (g)'})[key]}<input required type="number" min="0" step="any" value={food[key]} onChange={event=>setFood({...food,[key]:Number(event.target.value)})}/></label>)}</div>{(error||manualError)&&<p className="alert" role="alert">{error||manualError}</p>}<button className="primary dialog-submit" disabled={saving}><Plus size={16}/>{saving?'กำลังบันทึก…':'บันทึกมื้ออาหาร'}</button></form></>:recipe?<>
      <button type="button" className="textbutton" onClick={()=>setSelected(null)}><ArrowLeft size={15}/> เปลี่ยนสูตร</button>
      <RecipePortionForm key={recipe.id} recipe={recipe} profiles={profiles} who={who} day={day} initialMeal={food.meal} onSave={onLog} onSuccess={onSuccess}/>
    </>:<>
      <button type="button" className="one-off-meal-choice" onClick={()=>setFromIngredients(true)}><span className="small-icon cream"><Utensils size={22}/></span><span><b>เลือกวัตถุดิบสำหรับมื้อนี้</b><small>ใส่กรัมที่กิน คำนวณให้เลย ไม่ต้องเก็บเป็นสูตร</small></span><ArrowRight size={18}/></button>
      <div className="meal-method-heading"><BookOpen size={21}/><div><h3>หรือเลือกสูตรที่บันทึกไว้</h3><p>เลือกสูตร แล้วระบุปริมาณที่กิน</p></div></div>
      {recipes.length>0?<><label>ค้นหาสูตรที่บันทึกไว้<input type="search" placeholder="พิมพ์ชื่อเมนู" value={query} onChange={event=>setQuery(event.target.value)}/></label><div className="meal-recipe-options">{filtered.map(recipe=><button type="button" key={recipe.id} onClick={()=>setSelected(recipe.id)}><div><b>{recipe.name}</b><span>{formatNumber(recipe.calories/recipe.servings,0)} kcal / เสิร์ฟ · {recipe.servings} เสิร์ฟทั้งสูตร</span></div><ArrowRight size={18}/></button>)}{!filtered.length&&<p className="field-help">ไม่พบสูตรชื่อนี้ ลองค้นหาใหม่หรือสร้างสูตรใหม่</p>}</div></>:<p className="field-help">ยังไม่มีสูตรอาหาร เลือกวัตถุดิบด้านบนเพื่อบันทึกมื้อนี้ได้เลย หรือสร้างสูตรไว้ใช้ซ้ำด้านล่าง</p>}
      <button type="button" className="secondary dialog-submit" onClick={onCreateRecipe}><Plus size={16}/> สร้างสูตรจากวัตถุดิบ</button>
      <details className="manual-meal-option"><summary>มีข้อมูลโภชนาการอยู่แล้ว?</summary><p className="field-help">ใช้สำหรับอาหารที่รู้ค่าแคลและสารอาหารจากฉลาก ไม่ต้องสร้างสูตร</p><button type="button" className="textbutton" onClick={()=>setManual(true)}>กรอกสารอาหารเอง <ArrowRight size={14}/></button></details>
    </>}
    </>}
  </dialog>;
}
