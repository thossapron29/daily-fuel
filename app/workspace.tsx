'use client';

import {useState, type Dispatch, type SetStateAction} from 'react';
import {ArrowUpRight, ArrowRight, Plus, X, Sun, LayoutDashboard, Utensils, Scale, Settings, ChevronLeft, ChevronRight, CalendarDays, Flame, Leaf, Heart, Check, LogOut, Package, ChartNoAxesCombined} from 'lucide-react';
import NutritionOverview from './nutrition-overview';
import HouseholdDashboard from './household-dashboard';
import type {AnalysisRequest,AnalysisResult} from '../lib/nutrition-analysis';
import {type Profile, type Entry, type Recipe, today} from '../lib/data';
import {ExtraNutritionSummary} from './nutrition-awareness';
import NutritionSettings from './nutrition-settings';
import RecipeBuilder from './recipe-builder';
import MealDialog from './meal-dialog';
import type {MealDraft} from '../lib/manual-meals';
import {emptyMealDraft} from '../lib/manual-meals';
import type {SharedMenu} from '../lib/meal-history';
import Pantry from './pantry';
import {stateLabels, type Food, type IngredientMealDraft, type RecipeDraft, type RecipeLog} from '../lib/recipes';

type Weight = {id:string;profile_id:string;date:string;weight:number};
type Setter<T> = Dispatch<SetStateAction<T>>;
type Props = {
  analyzeNutrition:(args:AnalysisRequest,signal:AbortSignal)=>Promise<AnalysisResult>;
  account:string|null; cloud:boolean; email:string; password:string; error:string;
  setEmail:Setter<string>; setPassword:Setter<string>; setError:Setter<string>;
  auth:(signup:boolean)=>Promise<void>; authPending:boolean; authMessage:string; signOut:()=>unknown;
  localImport:{pantry:number;profiles:number;recipes:number;entries:number;weights:number}|null; importing:boolean; importLocalData:()=>Promise<void>; cloudNotice:string;
  profiles:Profile[]; who:string; setWho:Setter<string>;
  tab:string; setTab:Setter<string>; day:string; setDay:Setter<string>;
  entries:Entry[]; mealHistory:Entry[]; loadSharedMenus:(query:string)=>Promise<SharedMenu[]>; recipes:Recipe[]; weights:Weight[];
  food:MealDraft; setFood:Setter<MealDraft>;
  weight:number; setWeight:Setter<number>;
  addIngredientMeal:(draft:IngredientMealDraft)=>Promise<boolean>; ingredientFoods:Food[]; addFood:()=>Promise<boolean>; removeFood:(id:string)=>Promise<void>; saveRecipe:(draft:RecipeDraft)=>Promise<Recipe|null>; logRecipe:(recipe:Recipe,log:RecipeLog)=>Promise<boolean>;
  saveProfile:(profile:Profile)=>Promise<boolean>; addWeight:()=>Promise<void>;
};

const navigation = [
  {name:'Dashboard', icon:LayoutDashboard}, {name:'Overview', icon:ChartNoAxesCombined}, {name:'Food diary', icon:Utensils},
  {name:'Weight log', icon:Scale},
];
const nutritionChat='https://chatgpt.com/c/6addb2bb-1bdc-83ec-bb70-f24d87244f8d';
const meals = [
  {name:'Breakfast', icon:Sun, hint:'เริ่มวันด้วยมื้อดีๆ'},
  {name:'Lunch', icon:Utensils, hint:'เติมพลังระหว่างวัน'},
  {name:'Dinner', icon:Flame, hint:'อิ่มสบาย ส่งท้ายวัน'},
  {name:'Snack', icon:Leaf, hint:'ความอร่อยเล็กๆ ระหว่างมื้อ'},
];

export default function Workspace(props:Props) {
  const {account, cloud, email, password, error, setEmail, setPassword, setError, auth, authPending, authMessage, signOut, localImport, importing, importLocalData, cloudNotice,
    profiles, who, setWho, tab, setTab, day, setDay, entries, mealHistory, loadSharedMenus, recipes, weights,
    food, setFood, weight, setWeight, addFood, addIngredientMeal, ingredientFoods, removeFood, saveRecipe, logRecipe, saveProfile, addWeight} = props;
  const [foodOpen, setFoodOpen] = useState(false);
  const [mealMessage,setMealMessage]=useState('');
  const p = profiles.find(x=>x.id===who)!;
  const eaten = entries.reduce((sum,x)=>sum+Number(x.calories),0);
  const dateText = new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'long',year:'numeric'}).format(new Date(day+'T12:00:00'));
  function changeDay(amount:number) {
    const d = new Date(day+'T12:00:00');
    d.setDate(d.getDate()+amount);
    setDay(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
  }
  function openFood(meal='Lunch') { setMealMessage('');setError('');setFood({...food,meal}); setFoodOpen(true); }


  if (cloud && !account) return <div className="auth">
    <div className="auth-art"><img src="/illustrations/kitchen-kindness-animated.svg" width="520" height="360" alt="ภาพวาดคนทำอาหารด้วยความใส่ใจ"/><h2>Good food.<br/>Better together.</h2></div>
    <form className="authbox" onSubmit={e=>{e.preventDefault();auth(false)}}>
      <Brand/><small>YOUR DAILY DOSE OF GOOD</small><h1>Welcome home.</h1><p>ล็อกอินบัญชีเดียวกัน เพื่อใช้โปรไฟล์นิวกับเบ้นและบันทึกมื้ออาหารได้ทุกอุปกรณ์</p>
      <label>Email<input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>
      <label>Password<input required minLength={6} type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>
      <button disabled={authPending} className="primary" type="submit">{authPending?'Connecting…':'Sign in'} <ArrowRight size={17}/></button>
      <button disabled={authPending} type="button" className="secondary" onClick={()=>auth(true)}>Create account</button><p role="status">{error||authMessage}</p><small className="auth-local-note">ข้อมูลเดิมในอุปกรณ์ยังอยู่ หลังล็อกอินจะมีตัวเลือกให้นำเข้า</small>
    </form>
  </div>;

  return <div className="shell">
    <header className="topbar">
      <button className="brand-button" aria-label="Daily Fuel home" onClick={()=>setTab('Dashboard')}><Brand/></button>
      <nav aria-label="Main navigation">{navigation.map(({name,icon:Icon})=><button key={name} className={tab===name?'selected':''} aria-current={tab===name?'page':undefined} onClick={()=>{setMealMessage('');setTab(name)}}><Icon size={17}/><span>{name}</span></button>)}</nav>
      <div className="top-actions">
        <button className={'icon-button settings-button '+(tab==='Settings'?'active':'')} aria-label="Settings" onClick={()=>setTab('Settings')}><Settings size={20}/></button><span className="top-divider"/>
        {tab==='Dashboard'?<div className="household-people" aria-label="แสดงทั้งสองโปรไฟล์">{profiles.map(profile=><span key={profile.id}><Avatar ben={profile.id==='ben'}/><span>{profile.name}</span></span>)}</div>:<div className="profile-switch" aria-label="Select profile">{profiles.map(profile=><button key={profile.id} aria-label={profile.name} className={who===profile.id?'chosen':''} aria-pressed={who===profile.id} onClick={()=>{if(who!==profile.id){setFood(emptyMealDraft());setWeight(0);setError('')}setWho(profile.id)}}><Avatar ben={profile.id==='ben'}/><span>{profile.name}</span>{who===profile.id&&<Check size={12}/>}</button>)}</div>}
      </div>
    </header>

    <main className="content">
      <div className={`page-heading ${tab==='Dashboard'?'dashboard-heading':''}`}><div>
        <div className="eyebrow"><span/> A LITTLE BETTER, EVERY DAY</div>
        <h1>{tab==='Dashboard'?<>Feeling good starts here<span className="heading-dot">.</span></>:tab==='Overview'?'A little progress, every day.':tab==='Food diary'?'Your daily bites.':tab==='My recipes'?'Made with love.':tab==='Pantry'?'Our everyday ingredients.':tab==='Weight log'?'Small steps, real progress.':'A little more about you.'}</h1>
        <p className="sub">{tab==='Dashboard'?`ภาพรวมของ${profiles.map(profile=>profile.name).join('กับ')} · แต่ละคนเทียบกับเป้าหมายของตัวเอง`:tab==='Overview'?`ภาพรวมโภชนาการของ${p.name} ในจังหวะของตัวเอง`:tab==='Food diary'?'ทุกมื้อเล็กๆ คือส่วนหนึ่งของการดูแลตัวเอง':tab==='My recipes'?'สูตรโปรดจากครัวของเรา แชร์กันได้ทั้งนิวและเบ้น':tab==='Pantry'?'เครื่องปรุงและวัตถุดิบที่บ้านเราใช้ เลือกง่ายได้ทุกมื้อ':tab==='Weight log'?'ค่อยๆ ดูแลตัวเอง ในจังหวะที่เป็นคุณ':'ปรับข้อมูลและเป้าหมายให้เหมาะกับตัวเอง'}</p>
      </div>{['Dashboard','Food diary'].includes(tab)&&<a className={`primary add-food chat-meal-link ${tab==='Dashboard'?'dashboard-quick-log':''}`} href={nutritionChat}>บันทึกผ่าน ChatGPT <ArrowUpRight size={17}/></a>}</div>

      <p className="meal-status" role="status">{mealMessage}</p>
      {cloudNotice&&<p className="cloud-notice" role="status">{cloudNotice}</p>}
      {localImport&&<section className="local-import"><div><span className="eyebrow">BRING YOUR GOOD DAYS WITH YOU</span><h3>นำเข้าข้อมูลเดิมจากอุปกรณ์นี้</h3><p>{localImport.profiles} โปรไฟล์ · {localImport.pantry} ของในตู้ · {localImport.recipes} สูตร · {localImport.entries} รายการอาหาร · {localImport.weights} บันทึกน้ำหนัก</p><span>นำเข้าโปรไฟล์และเป้าหมายไปยังบัญชีที่ล็อกอินอยู่ โดยเก็บต้นฉบับในอุปกรณ์ไว้</span></div><button className="primary" disabled={importing} onClick={importLocalData}>{importing?'กำลังนำเข้า…':'นำเข้าข้อมูลเดิม'}</button></section>}
      {error&&<div className="alert" role="alert">{error}<button aria-label="Dismiss error" onClick={()=>setError('')}><X size={16}/></button></div>}
      {['Dashboard','Food diary','Weight log'].includes(tab)&&<div className="day-toolbar"><div className="day-picker">
        <button className="icon-button" aria-label="Previous day" onClick={()=>changeDay(-1)}><ChevronLeft size={17}/></button>
        <label className="date-label"><CalendarDays size={16}/><span>{day===today()?'Today, ':''}{dateText}</span><input aria-label="Select date" type="date" value={day} onChange={e=>{if(e.target.value)setDay(e.target.value)}}/></label>
        <button className="icon-button" aria-label="Next day" onClick={()=>changeDay(1)}><ChevronRight size={17}/></button>
      </div><span className="day-note"><Leaf size={14}/> Your pace. Your progress.</span></div>}

      {tab==='Overview'&&<NutritionOverview entries={mealHistory} profile={p} day={day} setDay={setDay} openDay={()=>setTab('Dashboard')}/>}
      {tab==='Dashboard'&&<HouseholdDashboard profiles={profiles} entries={mealHistory} date={day} account={account} cloud={cloud} weights={weights} onAnalyze={props.analyzeNutrition} openDiary={person=>{setWho(person);setTab('Food diary')}}/>}

      {tab==='Food diary'&&<section className="panel"><div className="section-heading"><div><span className="eyebrow">YOUR FOOD JOURNAL</span><h2 className="card-title">A day of nourishment</h2></div><span className="total-badge">{eaten.toLocaleString()} kcal</span></div>
        {entries.length?entries.map(x=><div className="entry" key={x.id}><span className="meal-icon meal-1"><Utensils size={20}/></span><div className="entry-description"><b>{x.name}</b><span>{x.meal}{x.portion_amount ? ` · ${x.portion_amount} ${x.portion_unit === 'grams' ? 'g' : 'เสิร์ฟ'}` : ''} · Protein {x.protein}g / Carbs {x.carbs}g / Fat {x.fat}g</span>{x.nutrition_source==='chatgpt_estimate'&&<span className="entry-source">ประมาณจาก ChatGPT</span>}<ExtraNutritionSummary meal={x}/>{!!x.ingredient_items?.length&&<details className="entry-ingredients"><summary>วัตถุดิบ ({x.ingredient_items.length})</summary><ul>{x.ingredient_items.map(item=><li key={item.id}>{item.food.name} ({stateLabels[item.food.state]}) <b>{item.grams} {item.unit||'g'}</b></li>)}</ul></details>}</div><b>{x.calories} <small>kcal</small></b><button className="icon-button" aria-label={`Delete ${x.name}`} onClick={()=>removeFood(x.id)}><X size={17}/></button></div>):<div className="empty-state"><img src="/illustrations/salad-bowl-animated.svg" width="300" height="230" alt=""/><h3>Your first bite starts here.</h3><p>ยังไม่มีมื้ออาหารในวันนี้ คุยกับ ChatGPT เพื่อเตรียมบันทึกมื้อได้เลย</p><a className="primary chat-meal-link" href={nutritionChat}>บันทึกผ่าน ChatGPT <ArrowUpRight size={16}/></a></div>}
      </section>}


      {tab==='Weight log'&&<section className="panel weight-panel"><div className="section-heading"><div><span className="eyebrow">ONE STEP AT A TIME</span><h2 className="card-title">บันทึกน้ำหนักของ{p.name}</h2><p className="weight-profile-hint">แสดงเฉพาะข้อมูลของ{p.name} · สลับคนได้ที่ด้านบน</p></div><Scale size={27}/></div>
        <form className="weight-form" onSubmit={e=>{e.preventDefault();addWeight()}}><label>น้ำหนักของ{p.name} (kg)<input required min="1" type="number" step="0.1" placeholder={String(p.weight)} value={weight||''} onChange={e=>setWeight(Number(e.target.value))}/></label><button className="primary"><Plus size={17}/> บันทึกน้ำหนัก</button></form>
        {weights.filter(x=>x.profile_id===who).length?weights.filter(x=>x.profile_id===who).sort((a,b)=>b.date.localeCompare(a.date)).map(x=><div className="entry" key={x.id}><span>{x.date}</span><b>{x.weight} <small>kg</small></b></div>):<div className="simple-empty"><Leaf size={30}/><p>เริ่มบันทึกน้ำหนัก แล้วค่อยๆ ดูความเปลี่ยนแปลงไปด้วยกัน</p></div>}
      </section>}

      {tab==='Settings'&&<><section className="panel gpt-settings-link"><div><span className="eyebrow">ONE CHAT, TWO HAPPY PLATES</span><h2 className="card-title">Daily Fuel Plugin</h2><p>เชื่อม Plugin เพื่อเตรียมและบันทึกมื้อให้นิวกับเบ้น</p></div><a className="secondary" href="/gpt">ตั้งค่าการเชื่อมต่อ <ArrowRight size={16}/></a></section><NutritionSettings key={who} profile={p} onSave={saveProfile}/></>}

      <footer><Brand/><span>A little care goes a long way.</span><div><span className="sync-dot"/>{cloud?'Connected':'Saved on this device'}{cloud&&<button className="textbutton" onClick={signOut}><LogOut size={13}/> Sign out</button>}</div></footer>
    </main>

  </div>;
}

function Brand() {return <span className="brand"><span className="brand-mark"><Flame size={23} strokeWidth={1.8}/></span>daily<span>fuel</span><i>.</i></span>}
function Avatar({ben=false}:{ben?:boolean}) {return <svg className="avatar" viewBox="0 0 36 36" fill="none" aria-hidden="true"><circle cx="18" cy="18" r="18" fill={ben?'#FFF0B3':'#E8EDFF'}/><path d="M6 36c0-9 5-14 12-14s12 5 12 14" fill={ben?'#04329A':'#063FBE'}/>{!ben&&<circle cx="20" cy="9" r="6" fill="#393939"/>}<path d="M9 16c-2-14 20-14 18 0v8H9Z" fill="#393939"/><ellipse cx="18" cy="18" rx="7" ry="9" fill="#F0B891"/><path d="M10 15c3 0 8-3 9-6 2 4 5 6 8 6-1-11-17-10-17 0Z" fill="#393939"/><path d="M14 18h1m6 0h1m-6 5q2 2 4 0" stroke="#393939" strokeWidth="1.2" strokeLinecap="round"/></svg>}
