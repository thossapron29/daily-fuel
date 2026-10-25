'use client';

import {useEffect, useRef, useState, type Dispatch, type SetStateAction} from 'react';
import {ArrowLeft, ArrowRight, BookOpen, ChevronDown, Plus, X, Utensils} from 'lucide-react';
import type {Profile} from '../lib/nutrition';
import type {MealDraft} from '../lib/manual-meals';
import type {Entry} from '../lib/data';
import {applyMealSuggestion,type SharedMenu} from '../lib/meal-history';
import MealNameAutocomplete from './meal-name-autocomplete';
import type {Recipe, RecipeLog, IngredientMealDraft, Food} from '../lib/recipes';
import {RecipePortionForm} from './recipe-portions';
import {formatNumber} from './ingredient-editor';
import IngredientMealForm from './ingredient-meal-form';

type Props={loadSharedMenus:(query:string)=>Promise<SharedMenu[]>;history:Entry[];recipes:Recipe[];profiles:Profile[];who:string;day:string;food:MealDraft;setFood:Dispatch<SetStateAction<MealDraft>>;error:string;addFood:()=>Promise<boolean>;onIngredientMeal:(draft:IngredientMealDraft)=>Promise<boolean>;extraFoods:Food[];onLog:(recipe:Recipe,log:RecipeLog)=>Promise<boolean>;onOpenRecipes:()=>void;onClose:()=>void;onSuccess:(message:string)=>void};
const nutrients=[{key:'protein',label:'โปรตีน',short:'P'},{key:'carbs',label:'คาร์บ',short:'C'},{key:'fat',label:'ไขมัน',short:'F'}] as const;

export default function MealDialog({loadSharedMenus,history,recipes,profiles,who,day,food,setFood,error,addFood,onIngredientMeal,extraFoods,onLog,onOpenRecipes,onClose,onSuccess}:Props) {
  const dialog=useRef<HTMLDialogElement>(null);
  const nameInput=useRef<HTMLInputElement>(null);
  const [selected,setSelected]=useState<string|null>(null);
  const [fromIngredients,setFromIngredients]=useState(false);
  const [query,setQuery]=useState('');
  const [saving,setSaving]=useState(false);
  const [manualError,setManualError]=useState('');
  const recipe=recipes.find(recipe=>recipe.id===selected);
  const filtered=recipes.filter(recipe=>recipe.name.toLowerCase().includes(query.trim().toLowerCase()));
  const dateText=new Intl.DateTimeFormat('th-TH',{day:'numeric',month:'short',year:'numeric'}).format(new Date(day+'T12:00:00'));
  useEffect(()=>{dialog.current?.showModal();nameInput.current?.focus()},[]);

  return <dialog ref={dialog} className="food-dialog meal-picker-dialog quick-meal-dialog" aria-labelledby="meal-dialog-title" onClose={onClose}>
    <div className="dialog-header"><div><span className="eyebrow">A LITTLE NOURISHMENT</span><h2 id="meal-dialog-title">Add a meal</h2></div><button type="button" className="icon-button" aria-label="Close meal form" onClick={onClose}><X size={22}/></button></div>
    {!fromIngredients&&<p className="quick-meal-context"><span>{profiles.find(profile=>profile.id===who)?.name}</span><span>{dateText}</span></p>}
    {fromIngredients?<>
      <button type="button" className="textbutton" onClick={()=>setFromIngredients(false)}><ArrowLeft size={15}/> กลับไปกรอกโภชนาการ</button>
      <IngredientMealForm profiles={profiles} who={who} day={day} initialMeal={food.meal} recipes={recipes} extraFoods={extraFoods} onSave={onIngredientMeal} onSuccess={onSuccess}/>
    </>:recipe?<>
      <button type="button" className="textbutton" onClick={()=>setSelected(null)}><ArrowLeft size={15}/> กลับไปกรอกโภชนาการ</button>
      <RecipePortionForm key={recipe.id} recipe={recipe} profiles={profiles} who={who} day={day} initialMeal={food.meal} onSave={onLog} onSuccess={onSuccess}/>
    </>:<>
      <form className="quick-meal-form" onSubmit={async event=>{
        event.preventDefault();if(saving)return;
        setSaving(true);setManualError('');
        try{if(await addFood())onSuccess('บันทึกมื้ออาหารแล้ว');else setManualError('บันทึกไม่สำเร็จ ตรวจสอบข้อมูลและลองอีกครั้ง')}
        catch{setManualError('บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง')}
        finally{setSaving(false)}
      }}>
        <fieldset disabled={saving} className="quick-meal-fields">
          <div className="formgrid quick-meal-basics">
            <MealNameAutocomplete loadSharedMenus={loadSharedMenus} value={food.name} history={history} profiles={profiles} who={who} inputRef={nameInput} onChange={name=>setFood(current=>({...current,name}))} onPick={suggestion=>setFood(current=>applyMealSuggestion(current,suggestion))}/>
            <label>มื้ออาหาร<select value={food.meal} onChange={event=>setFood(current=>({...current,meal:event.target.value}))}>{['Breakfast','Lunch','Dinner','Snack'].map(meal=><option key={meal}>{meal}</option>)}</select></label>
          </div>
          <div className="quick-nutrition-heading"><h3>โภชนาการที่กินจริง</h3><p id="meal-nutrition-help">ใส่ยอดรวมของมื้อนี้ จากฉลากหรือที่คำนวณไว้แล้ว</p></div>
          <label className="quick-calorie-field" htmlFor="meal-calories"><span>พลังงาน <small>kcal</small></span><input id="meal-calories" required type="number" inputMode="decimal" min="0" step="any" placeholder="เช่น 550" value={food.calories} aria-describedby="meal-nutrition-help meal-zero-help" onChange={event=>setFood(current=>({...current,calories:event.target.value}))}/></label>
          <div className="quick-macro-fields">{nutrients.map(({key,label,short})=><label key={key} className={`quick-macro-field quick-macro-${key}`} htmlFor={`meal-${key}`}><span><i aria-hidden="true">{short}</i>{label} <small>g</small></span><input id={`meal-${key}`} required type="number" inputMode="decimal" min="0" step="any" placeholder={key==='protein'?'เช่น 30':key==='carbs'?'เช่น 60':'เช่น 20'} value={food[key]} aria-describedby="meal-zero-help" onChange={event=>setFood(current=>({...current,[key]:event.target.value}))}/></label>)}</div>
          <p className="field-help quick-zero-help" id="meal-zero-help">กรอกให้ครบทั้ง 4 ช่อง · ถ้าไม่มีสารอาหารนั้น ให้ใส่ 0</p>
          {(error||manualError)&&<p className="alert" role="alert">{error||manualError}</p>}
          <button className="primary dialog-submit" disabled={saving}><Plus size={17}/>{saving?'กำลังบันทึก…':'บันทึกมื้ออาหาร'}</button>
        </fieldset>
      </form>
      <details className="quick-meal-alternatives"><summary><span>วิธีบันทึกเพิ่มเติม</span><ChevronDown size={16}/></summary>
        <p className="field-help">ยังไม่รู้โภชนาการ? เลือกวัตถุดิบให้คำนวณได้</p>
        <button type="button" className="one-off-meal-choice" onClick={()=>setFromIngredients(true)}><span className="small-icon cream"><Utensils size={20}/></span><span><b>คำนวณจากวัตถุดิบ</b><small>ใส่กรัมที่กินแล้วบันทึกมื้อนี้ได้เลย</small></span><ArrowRight size={17}/></button>
        {recipes.length>0&&<><div className="meal-method-heading"><BookOpen size={19}/><div><h3>สูตรเดิมที่บันทึกไว้</h3><p>เลือกใช้ข้อมูลเดิมได้</p></div></div><label>ค้นหาสูตรเดิม<input type="search" placeholder="พิมพ์ชื่อเมนู" value={query} onChange={event=>setQuery(event.target.value)}/></label><div className="meal-recipe-options">{filtered.map(recipe=><button type="button" key={recipe.id} onClick={()=>setSelected(recipe.id)}><div><b>{recipe.name}</b><span>{formatNumber(recipe.calories/recipe.servings,0)} kcal / เสิร์ฟ</span></div><ArrowRight size={17}/></button>)}{!filtered.length&&<p className="field-help">ไม่พบสูตรชื่อนี้</p>}</div><button type="button" className="textbutton" onClick={onOpenRecipes}>ดูสูตรเดิมทั้งหมด <ArrowRight size={14}/></button></>}
      </details>
    </>}
  </dialog>;
}
