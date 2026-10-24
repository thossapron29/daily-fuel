'use client';

import {useState} from 'react';
import {Plus,X,Search,Barcode,Package} from 'lucide-react';
import {foodCatalog,categoryForFood} from '../lib/foods';
import {ingredientNutrition,nutrientKeys,stateLabels,type Food,type Recipe,type RecipeIngredient,type Nutrients,type FoodCategory} from '../lib/recipes';
import {categoryLabels} from '../lib/pantry';
import {usePantry} from './pantry-context';
import PantryEditor from './pantry-editor';

export const formatNumber=(value:number,digits=1)=>Number.isFinite(value)?value.toLocaleString('en-US',{maximumFractionDigits:digits}):'—';
const labels={calories:'พลังงาน',protein:'โปรตีน',carbs:'คาร์บ',fat:'ไขมัน'};
export function NutritionValues({values}:{values:Nutrients|null}){return <div className="recipe-nutrients">{nutrientKeys.map(key=><div key={key}><span>{labels[key]}</span><b>{values?formatNumber(values[key],key==='calories'?0:1):'—'}<small>{key==='calories'?' kcal':' g'}</small></b></div>)}</div>}

export default function IngredientEditor({items,recipes,onChange,mealFor,extraFoods=[]}:{items:RecipeIngredient[];recipes:Recipe[];onChange:(items:RecipeIngredient[])=>void;mealFor?:string;extraFoods?:Food[]}) {
 const pantry=usePantry();const active=pantry.items.filter(food=>!food.archived);
 const [query,setQuery]=useState(''),[selected,setSelected]=useState<Food|null>(null),[amount,setAmount]=useState(''),[error,setError]=useState('');
 const [editor,setEditor]=useState<'manual'|'barcode'|null>(null);
 const [scope,setScope]=useState<'all'|'pantry'|'catalog'>(active.length?'pantry':'catalog');
 const [category,setCategory]=useState<FoodCategory|'all'>('all');
 const foods=[...new Map([...foodCatalog,...extraFoods,...recipes.flatMap(recipe=>(recipe.ingredient_items||[]).map(item=>item.food)),...active,...items.map(item=>item.food)].map(food=>[food.id,food])).values()];
 const ids=new Set(active.map(food=>food.id));const catalogIds=new Set(foodCatalog.map(food=>food.id));
 const visible=foods.filter(food=>(scope==='all'||(scope==='pantry'?ids.has(food.id):catalogIds.has(food.id)))&&(category==='all'||categoryForFood(food)===category));
 const groups=[...new Map(visible.map(food=>[food.group,food])).values()].filter(food=>visible.some(variant=>variant.group===food.group&&`${variant.name} ${variant.brand||''} ${(variant.aliases||[]).join(' ')} ${variant.description}`.toLowerCase().includes(query.trim().toLowerCase())));
 const variants=selected?foods.filter(food=>food.group===selected.group):[];
 function add(){setError('');try{if(!selected)throw new Error('เลือกวัตถุดิบก่อน');const item={id:crypto.randomUUID(),food:{...selected},grams:Number(amount),unit:selected.basis_unit||'g' as const};ingredientNutrition(item);onChange([...items,item]);setSelected(null);setAmount('');setQuery('')}catch(error){setError(error instanceof Error?error.message:'ตรวจสอบปริมาณวัตถุดิบ')}}
 return <>
  <div className="ingredient-workflow" onKeyDown={event=>{if(event.key==='Enter'&&event.target instanceof HTMLInputElement){event.preventDefault();if(event.target.id==='ingredient-grams')add()}}}>
   <div className="instruction-note"><b>{mealFor?`ใส่เฉพาะปริมาณที่ ${mealFor} กินในมื้อนี้`:'ใส่วัตถุดิบทั้งหมดที่ใช้ทำ 1 สูตร'}</b><p>{mealFor?'เลือกวัตถุดิบและปริมาณที่กิน รวมถึงน้ำมันและซอส ไม่ต้องแบ่งเสิร์ฟ':'ใส่ปริมาณที่ใช้ทั้งสูตร แล้วค่อยแบ่งว่าแต่ละคนกินเท่าไรภายหลัง'}</p></div>
   <div className="ingredient-list" aria-label={mealFor?'วัตถุดิบในมื้อนี้':'วัตถุดิบในสูตร'}>{items.map((item,index)=>{let values:Nutrients|null=null;try{values=ingredientNutrition(item)}catch{}const rowVariants=foods.filter(food=>food.group===item.food.group);return <div className="ingredient-line" key={item.id}><div className="ingredient-line-name"><b>{item.food.name}</b>{rowVariants.length>1&&<select aria-label={`สถานะวัตถุดิบ ${index+1}`} value={item.food.id} onChange={event=>{const food=rowVariants.find(food=>food.id===event.target.value);if(food)onChange(items.map(row=>row.id===item.id?{...row,food:{...food},unit:food.basis_unit||'g'}:row))}}>{rowVariants.map(food=><option key={food.id} value={food.id}>{stateLabels[food.state]}</option>)}</select>}<span>{stateLabels[item.food.state]} · {values?`${formatNumber(values.calories,0)} kcal`:'ตรวจสอบปริมาณและหน่วย'}</span></div><label className="ingredient-line-grams">{item.unit||'g'} รายการ {index+1}<input required type="number" min="0.01" step="any" value={item.grams||''} onChange={event=>onChange(items.map(row=>row.id===item.id?{...row,grams:Number(event.target.value)}:row))}/></label><button type="button" className="icon-button" aria-label={`ลบวัตถุดิบ ${index+1}`} onClick={()=>onChange(items.filter(row=>row.id!==item.id))}><X size={17}/></button></div>})}</div>
   <div className="ingredient-picker">
    <div className="pantry-picker-actions"><button type="button" className="textbutton" onClick={()=>setEditor('manual')}><Package size={16}/> เพิ่มเครื่องปรุงเข้าตู้</button><button type="button" className="textbutton" onClick={()=>setEditor('barcode')}><Barcode size={16}/> ค้นบาร์โค้ด</button></div>
    <div className="picker-tabs pantry-scopes">{([['pantry','ของในตู้'],['catalog','คลังอาหารไทย'],['all','ทั้งหมด']] as const).map(([value,label])=><button type="button" key={value} aria-pressed={scope===value} onClick={()=>{setScope(value);setSelected(null)}}>{label}{value==='pantry'?` (${active.length})`:''}</button>)}</div>
    <label htmlFor="ingredient-search"><Search size={15}/> ค้นหาวัตถุดิบ<input id="ingredient-search" type="search" value={query} placeholder="เช่น หมู ข้าว กระเทียม ซอส" onChange={event=>{setQuery(event.target.value);setSelected(null);setError('')}}/></label>
    {!selected&&<><div className="food-category-filters" aria-label="หมวดวัตถุดิบ"><button type="button" aria-pressed={category==='all'} onClick={()=>setCategory('all')}>ทุกหมวด</button>{Object.entries(categoryLabels).map(([value,label])=><button type="button" key={value} aria-pressed={category===value} onClick={()=>setCategory(value as FoodCategory)}>{label}</button>)}</div><div className="food-results" aria-label="ผลค้นหาวัตถุดิบ">{groups.map(food=><button key={food.group} type="button" onClick={()=>{setSelected(foods.find(value=>value.group===food.group&&value.state==='raw')||food);setAmount('');setError('')}}><span>{food.name}{food.brand&&<small>{food.brand}</small>}</span><Plus size={15}/></button>)}{!groups.length&&<p>{scope==='pantry'?'ยังไม่มีรายการที่ตรง ลองคลังอาหารไทย หรือเพิ่มเครื่องปรุงเข้าตู้ด้านบน':'ไม่พบวัตถุดิบ ลองค้นชื่ออื่น หรือเพิ่มจากฉลากเข้าตู้'}</p>}</div></>}
    {selected&&<div className="selected-ingredient"><div className="section-heading"><h3>{selected.name}</h3><button type="button" className="textbutton" onClick={()=>setSelected(null)}>เปลี่ยนวัตถุดิบ</button></div>{selected.brand&&<p className="field-help">{selected.brand}</p>}
     {variants.length>1&&<><fieldset className="food-state-choices"><legend>ชั่งตอนดิบหรือสุก?</legend>{variants.map(food=><label key={food.id}><input type="radio" name="ingredient-state" checked={selected.id===food.id} onChange={()=>setSelected(food)}/>{stateLabels[food.state]}</label>)}</fieldset><p className="field-help">เลือกให้ตรงกับตอนที่ชั่ง เช่น ชั่งข้าวหลังหุง ให้เลือก “สุก”</p></>}
     <details className="food-source"><summary>ดูสารอาหารและแหล่งข้อมูล</summary><p>{selected.description}</p><NutritionValues values={selected}/><p className="field-help">ค่าต่อ 100 {selected.basis_unit||'g'} · {stateLabels[selected.state]}</p>{selected.source_url?<a href={selected.source_url} target="_blank" rel="noreferrer">{selected.source} · {selected.source_id}</a>:<p>{selected.source}</p>}</details>
     <div className="ingredient-add"><label htmlFor="ingredient-grams">{mealFor?'ปริมาณที่กินในมื้อนี้':'ปริมาณที่ใช้ทั้งสูตร'} ({selected.basis_unit||'g'})<input id="ingredient-grams" type="number" min="0.01" step="any" placeholder="เช่น 15" value={amount} onChange={event=>setAmount(event.target.value)}/></label><button type="button" className="secondary" onClick={add}><Plus size={16}/>{mealFor?'เพิ่มในมื้อนี้':'เพิ่มลงสูตร'}</button></div>{selected.basis_unit==='ml'&&<p className="field-help">ใช้ ml ตามฉลาก ไม่ถือว่า 1 ml เท่ากับ 1 g</p>}
    </div>}
    {error&&<p className="alert" role="alert">{error}</p>}
   </div>
   <details className="ingredient-guidance"><summary>น้ำมันและเครื่องปรุง ต้องใส่ไหม?</summary><p>ใส่น้ำมัน เนย น้ำตาล และซอสที่กินด้วย เครื่องปรุงยี่ห้อเฉพาะให้เก็บค่าจากฉลากไว้ในตู้ แล้วเลือกใช้ซ้ำได้ทั้งนิวและเบ้น</p><p>คลังอาหารไทยใช้ค่าอ้างอิงทั่วไปจาก USDA ไม่ใช่ค่าของเครื่องปรุงทุกยี่ห้อ เลือกสถานะให้ตรงกับที่ชั่ง</p></details>
  </div>
  {editor&&<PantryEditor barcodeFirst={editor==='barcode'} onClose={()=>setEditor(null)} onSaved={food=>{setSelected(food);setScope('pantry');setAmount('');setError('')}}/>}
 </>;
}
