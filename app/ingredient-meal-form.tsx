'use client';

import {useState, type FormEvent} from 'react';
import {Check} from 'lucide-react';
import type {Profile} from '../lib/nutrition';
import {buildIngredientMeal, recipeNutrition, type IngredientMealDraft, type Recipe, type RecipeIngredient, type Nutrients, type Food} from '../lib/recipes';
import IngredientEditor, {NutritionValues} from './ingredient-editor';

type Props={profiles:Profile[];who:string;day:string;initialMeal:string;recipes:Recipe[];extraFoods:Food[];onSave:(draft:IngredientMealDraft)=>Promise<boolean>;onSuccess:(message:string)=>void};

export default function IngredientMealForm({profiles,who,day,initialMeal,recipes,extraFoods,onSave,onSuccess}:Props) {
  const [items,setItems]=useState<RecipeIngredient[]>([]);
  const [name,setName]=useState('');
  const [profileId,setProfileId]=useState(who);
  const [date,setDate]=useState(day);
  const [meal,setMeal]=useState(initialMeal);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const person=profiles.find(profile=>profile.id===profileId)!;
  let totals:Nutrients|null=null;try{totals=recipeNutrition(items)}catch{}

  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();if(saving)return;setError('');
    const draft:IngredientMealDraft={name,profile_id:profileId,date,meal,ingredient_items:items};
    try{buildIngredientMeal(draft,'preview',profiles.map(profile=>profile.id))}catch(error){setError(error instanceof Error?error.message:'ตรวจสอบวัตถุดิบและปริมาณ');return}
    setSaving(true);
    try{if(await onSave(draft))onSuccess(`บันทึกมื้ออาหารจากวัตถุดิบให้ ${person.name} แล้ว`);else setError('บันทึกมื้ออาหารไม่สำเร็จ กรุณาลองอีกครั้ง ข้อมูลที่กรอกยังอยู่')}catch{setError('บันทึกมื้ออาหารไม่สำเร็จ กรุณาลองอีกครั้ง ข้อมูลที่กรอกยังอยู่')}finally{setSaving(false)}
  }

  return <form className="ingredient-meal-form" onSubmit={submit}>
    <h3 className="wizard-title">วัตถุดิบสำหรับมื้อนี้</h3>
    <p className="sub">คำนวณแคลและสารอาหารอัตโนมัติ บันทึกเป็นมื้อเดียว ไม่เพิ่มใน Cookbook</p>
    <fieldset disabled={saving} className="ingredient-meal-fields">
      <div className="formgrid"><label>บันทึกให้ใคร<select value={profileId} onChange={event=>setProfileId(event.target.value)}>{profiles.map(profile=><option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label><label>มื้ออาหาร<select value={meal} onChange={event=>setMeal(event.target.value)}>{['Breakfast','Lunch','Dinner','Snack'].map(value=><option key={value}>{value}</option>)}</select></label></div>
      <details className="ingredient-meal-details"><summary>ปรับชื่อมื้อ / วันที่ · {date}</summary><div className="formgrid"><label>วันที่<input type="date" value={date} onChange={event=>setDate(event.target.value)}/></label><label>ชื่อมื้อ · ไม่จำเป็น<input value={name} placeholder="เว้นว่าง ใช้ชื่อวัตถุดิบให้" onChange={event=>setName(event.target.value)}/></label></div></details>
      <IngredientEditor items={items} recipes={recipes} extraFoods={extraFoods} mealFor={person.name} onChange={items=>{setItems(items);setError('')}}/>
      <div className="recipe-totals"><span className="eyebrow">รวมปริมาณที่ {person.name} กินในมื้อนี้</span><NutritionValues values={totals}/></div>
      {error&&<p className="alert" role="alert">{error}</p>}
      <button className="primary dialog-submit" disabled={saving}><Check size={17}/>{saving?'กำลังบันทึก…':'บันทึกมื้อนี้'}</button>
    </fieldset>
  </form>;
}
