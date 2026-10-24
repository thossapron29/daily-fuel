'use client';

import {useState} from 'react';
import {Plus, X, Search} from 'lucide-react';
import {foodCatalog} from '../lib/foods';
import {foodFromLabel, ingredientNutrition, nutrientKeys, stateLabels, type Food, type FoodState, type Recipe, type RecipeIngredient, type Nutrients} from '../lib/recipes';

export const formatNumber = (value: number, digits = 1) => Number.isFinite(value) ? value.toLocaleString('en-US', {maximumFractionDigits: digits}) : '—';
const labels = {calories: 'พลังงาน', protein: 'โปรตีน', carbs: 'คาร์บ', fat: 'ไขมัน'};
export function NutritionValues({values}: {values: Nutrients | null}) {
  return <div className="recipe-nutrients">{nutrientKeys.map(key => <div key={key}><span>{labels[key]}</span><b>{values ? formatNumber(values[key], key === 'calories' ? 0 : 1) : '—'}<small>{key === 'calories' ? ' kcal' : ' g'}</small></b></div>)}</div>;
}

export default function IngredientEditor({items, recipes, onChange, mealFor, extraFoods=[]}: {items: RecipeIngredient[]; recipes: Recipe[]; onChange: (items: RecipeIngredient[]) => void; mealFor?:string; extraFoods?:Food[]}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Food | null>(null);
  const [grams, setGrams] = useState('');
  const [labelOpen, setLabelOpen] = useState(false);
  const [custom, setCustom] = useState({name: '', state: 'as_sold' as FoodState, basis: '100', calories: '', protein: '', carbs: '', fat: ''});
  const [error, setError] = useState('');
  const foods = [...new Map([...foodCatalog, ...extraFoods, ...recipes.flatMap(recipe => (recipe.ingredient_items || []).map(item => item.food)), ...items.map(item => item.food)].map(food => [food.id,food])).values()];
  const groups = [...new Map(foods.map(food => [food.group,food])).values()].filter(food => `${food.name} ${food.description}`.toLowerCase().includes(query.trim().toLowerCase()));
  const variants = selected ? foods.filter(food => food.group === selected.group) : [];

  function add() {
    setError('');
    try {
      let food = selected;
      if (labelOpen) {
        if (nutrientKeys.some(key => custom[key].trim() === '')) throw new Error('กรอกสารอาหารให้ครบ หากฉลากระบุ 0 ให้ใส่ 0');
        food = foodFromLabel({name:custom.name,state:custom.state,basis:Number(custom.basis),calories:Number(custom.calories),protein:Number(custom.protein),carbs:Number(custom.carbs),fat:Number(custom.fat)}, `label-${crypto.randomUUID()}`);
      }
      if (!food) throw new Error('เลือกวัตถุดิบก่อน');
      const item = {id: crypto.randomUUID(), food: {...food}, grams: Number(grams)};
      ingredientNutrition(item);
      onChange([...items,item]);
      setSelected(null);setGrams('');setQuery('');setLabelOpen(false);
      setCustom({name:'',state:'as_sold',basis:'100',calories:'',protein:'',carbs:'',fat:''});
    } catch (error) {setError(error instanceof Error ? error.message : 'ตรวจสอบปริมาณวัตถุดิบ');}
  }

  return <div className="ingredient-workflow" onKeyDown={event=>{if(event.key==='Enter'&&event.target instanceof HTMLInputElement){event.preventDefault();if(event.target.id==='ingredient-grams')add()}}}>
    <div className="instruction-note"><b>{mealFor?`ใส่เฉพาะปริมาณที่ ${mealFor} กินในมื้อนี้`:'ใส่วัตถุดิบทั้งหมดที่ใช้ทำ 1 สูตร'}</b><p>{mealFor?'เช่น เนื้อบดดิบ 125 g + ข้าวสุก 150 g รวมถึงน้ำมันและซอสที่กิน ไม่ต้องใส่ปริมาณทั้งหม้อหรือแบ่งเสิร์ฟ':'เช่น เนื้อบดดิบ 250 g + ข้าวสุก 300 g แล้วค่อยแบ่งว่าแต่ละคนกินเท่าไรในภายหลัง'}</p></div>
    <div className="ingredient-list" aria-label={mealFor?'วัตถุดิบในมื้อนี้':'วัตถุดิบในสูตร'}>{items.map((item,index) => {
      let values: Nutrients | null = null;try {values = ingredientNutrition(item);} catch {}
      const rowVariants=foods.filter(food=>food.group===item.food.group);
      return <div className="ingredient-line" key={item.id}><div className="ingredient-line-name"><b>{item.food.name}</b>{rowVariants.length>1&&<select aria-label={`สถานะวัตถุดิบ ${index+1}`} value={item.food.id} onChange={event=>{const food=rowVariants.find(food=>food.id===event.target.value);if(food)onChange(items.map(row=>row.id===item.id?{...row,food:{...food}}:row))}}>{rowVariants.map(food=><option key={food.id} value={food.id}>{stateLabels[food.state]}</option>)}</select>}<span>{stateLabels[item.food.state]} · {values ? `${formatNumber(values.calories,0)} kcal` : 'ตรวจสอบกรัม'}</span></div><label className="ingredient-line-grams">กรัม รายการ {index + 1}<input type="number" min="0.1" step="any" required value={item.grams || ''} onChange={event => onChange(items.map(row => row.id === item.id ? {...row,grams:Number(event.target.value)} : row))}/></label><button type="button" className="icon-button" aria-label={`ลบวัตถุดิบ ${index + 1}`} onClick={() => onChange(items.filter(row => row.id !== item.id))}><X size={17}/></button></div>;
    })}</div>
    <div className="ingredient-picker">
      {!labelOpen ? <>
        <label htmlFor="ingredient-search"><Search size={15}/> ค้นหาวัตถุดิบ<input id="ingredient-search" type="search" value={query} placeholder="เช่น เนื้อบด ข้าว อกไก่" onChange={event => {setQuery(event.target.value);setSelected(null);setError('')}}/></label>
        {!selected && <div className="food-results" aria-label="ผลค้นหาวัตถุดิบ">{groups.map(food => <button key={food.group} type="button" onClick={() => {setSelected(foods.find(value => value.group === food.group && value.state === 'raw') || food);setGrams('');setError('')}}><span>{food.name}</span><Plus size={15}/></button>)}{!groups.length && <p>ยังไม่มีในคลัง ลองเพิ่มข้อมูลจากฉลากด้านล่าง</p>}</div>}
        {selected && <div className="selected-ingredient"><div className="section-heading"><h3>{selected.name}</h3><button type="button" className="textbutton" onClick={() => setSelected(null)}>เปลี่ยนวัตถุดิบ</button></div>
          <fieldset className="food-state-choices"><legend>ชั่งตอนดิบหรือสุก?</legend>{variants.map(food => <label key={food.id}><input type="radio" name="ingredient-state" checked={selected.id === food.id} onChange={() => setSelected(food)}/>{stateLabels[food.state]}</label>)}</fieldset>
          <p className="field-help">เลือกให้ตรงกับตอนที่ชั่ง เช่น ชั่งข้าวหลังหุง ให้เลือก “สุก”</p>
          <details className="food-source"><summary>ดูสารอาหารและแหล่งข้อมูล</summary><p>{selected.description}</p><NutritionValues values={selected}/><p className="field-help">ค่าต่อ 100 g · ใช้ข้อมูลของสถานะที่เลือก ไม่แปลงน้ำหนักดิบเป็นสุก</p>{selected.source_url ? <a href={selected.source_url} target="_blank" rel="noreferrer">{selected.source} · {selected.source_id}</a> : <p>{selected.source}</p>}</details>
        </div>}
      </> : <div className="label-editor"><h3>เพิ่มวัตถุดิบจากฉลาก</h3><p className="field-help">คัดลอกค่าบนฉลาก เช่น สารอาหารต่อ 15 g แล้วระบุกรัมที่ใช้จริงด้านล่าง</p><label>ชื่อวัตถุดิบ / ยี่ห้อ<input value={custom.name} onChange={event => setCustom({...custom,name:event.target.value})}/></label><div className="formgrid"><label>ปริมาณอ้างอิงบนฉลาก (g)<input type="number" min="0.1" step="any" value={custom.basis} onChange={event => setCustom({...custom,basis:event.target.value})}/></label><label>สถานะ<select value={custom.state} onChange={event => setCustom({...custom,state:event.target.value as FoodState})}>{Object.entries(stateLabels).map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label>{nutrientKeys.map(key => <label key={key}>{labels[key]} ({key === 'calories' ? 'kcal' : 'g'})<input type="number" min="0" step="any" value={custom[key]} onChange={event => setCustom({...custom,[key]:event.target.value})}/></label>)}</div></div>}
      {(selected || labelOpen) && <div className="ingredient-add"><label htmlFor="ingredient-grams">{mealFor?'ปริมาณที่กินในมื้อนี้ (g)':'ใช้วัตถุดิบนี้กี่กรัม ทั้งสูตร?'}<input id="ingredient-grams" type="number" min="0.1" step="any" placeholder={mealFor?'เช่น 125':'เช่น 250'} value={grams} onChange={event => setGrams(event.target.value)}/></label><button type="button" className="secondary" onClick={add}><Plus size={16}/> {mealFor?'เพิ่มในมื้อนี้':'เพิ่มลงสูตร'}</button></div>}
      {error && <p className="alert" role="alert">{error}</p>}
      <button type="button" className="textbutton label-toggle" onClick={() => {setLabelOpen(!labelOpen);setSelected(null);setError('')}}>{labelOpen ? 'กลับไปเลือกจากคลัง' : 'ไม่พบวัตถุดิบ? เพิ่มจากฉลากสินค้า'}</button>
    </div>
    <details className="ingredient-guidance"><summary>น้ำมันและเครื่องปรุง ต้องใส่ไหม?</summary><p>ใส่น้ำมัน เนย น้ำตาล ซอส และเครื่องปรุงที่มีพลังงานด้วย ใช้ค่าจากฉลากถ้ารู้ยี่ห้อ เกลือกับน้ำไม่มีพลังงาน ส่วนเครื่องเทศปริมาณเล็กน้อยจะมีผลต่อยอดพลังงานน้อย</p><p>คลังตอนนี้เป็นรายการพื้นฐานจาก USDA ยังไม่ได้ค้นหาฐานข้อมูลอาหารทุกชนิดแบบออนไลน์</p></details>
  </div>;
}
