'use client';

import {useState, type Dispatch, type SetStateAction} from 'react';
import {ArrowUpRight, ArrowRight, Plus, X, Sun, LayoutDashboard, Utensils, Scale, Settings, ChevronLeft, ChevronRight, CalendarDays, Flame, Leaf, Heart, Check, LogOut, Package} from 'lucide-react';
import {type Profile, type Entry, type Recipe, target, tdee, bmr, today} from '../lib/data';
import {goalOption, isCustomGoal, macroOption, macroTargets} from '../lib/nutrition';
import NutritionSettings from './nutrition-settings';
import RecipeBuilder from './recipe-builder';
import MealDialog from './meal-dialog';
import type {MealDraft} from '../lib/manual-meals';
import {emptyMealDraft} from '../lib/manual-meals';
import Pantry from './pantry';
import {stateLabels, type Food, type IngredientMealDraft, type RecipeDraft, type RecipeLog} from '../lib/recipes';

type Weight = {id:string;profile_id:string;date:string;weight:number};
type Setter<T> = Dispatch<SetStateAction<T>>;
type Props = {
  account:string|null; cloud:boolean; email:string; password:string; error:string;
  setEmail:Setter<string>; setPassword:Setter<string>; setError:Setter<string>;
  auth:(signup:boolean)=>Promise<void>; authPending:boolean; authMessage:string; signOut:()=>unknown;
  localImport:{pantry:number;profiles:number;recipes:number;entries:number;weights:number}|null; importing:boolean; importLocalData:()=>Promise<void>; cloudNotice:string;
  profiles:Profile[]; who:string; setWho:Setter<string>;
  tab:string; setTab:Setter<string>; day:string; setDay:Setter<string>;
  entries:Entry[]; mealHistory:Entry[]; recipes:Recipe[]; weights:Weight[];
  food:MealDraft; setFood:Setter<MealDraft>;
  weight:number; setWeight:Setter<number>;
  addIngredientMeal:(draft:IngredientMealDraft)=>Promise<boolean>; ingredientFoods:Food[]; addFood:()=>Promise<boolean>; removeFood:(id:string)=>Promise<void>; saveRecipe:(draft:RecipeDraft)=>Promise<Recipe|null>; logRecipe:(recipe:Recipe,log:RecipeLog)=>Promise<boolean>;
  saveProfile:(profile:Profile)=>Promise<boolean>; addWeight:()=>Promise<void>;
};

const navigation = [
  {name:'Dashboard', icon:LayoutDashboard}, {name:'Food diary', icon:Utensils},
  {name:'Pantry', icon:Package}, {name:'Weight log', icon:Scale},
];
const meals = [
  {name:'Breakfast', icon:Sun, hint:'เริ่มวันด้วยมื้อดีๆ'},
  {name:'Lunch', icon:Utensils, hint:'เติมพลังระหว่างวัน'},
  {name:'Dinner', icon:Flame, hint:'อิ่มสบาย ส่งท้ายวัน'},
  {name:'Snack', icon:Leaf, hint:'ความอร่อยเล็กๆ ระหว่างมื้อ'},
];

export default function Workspace(props:Props) {
  const {account, cloud, email, password, error, setEmail, setPassword, setError, auth, authPending, authMessage, signOut, localImport, importing, importLocalData, cloudNotice,
    profiles, who, setWho, tab, setTab, day, setDay, entries, mealHistory, recipes, weights,
    food, setFood, weight, setWeight, addFood, addIngredientMeal, ingredientFoods, removeFood, saveRecipe, logRecipe, saveProfile, addWeight} = props;
  const [foodOpen, setFoodOpen] = useState(false);
  const [mealMessage,setMealMessage]=useState('');
  const p = profiles.find(x=>x.id===who)!;
  const eaten = entries.reduce((sum,x)=>sum+Number(x.calories),0);
  const goal = target(p);
  const progress = Math.min(100,Math.max(0,eaten/Math.max(1,goal)*100));
  const macroGoals = macroTargets(p);
  const macroPlan = macroOption(p.macro_plan);
  const latestWeight = weights.filter(x=>x.profile_id===who).sort((a,b)=>b.date.localeCompare(a.date))[0];
  const macroInfo = [
    {key:'protein', label:'Protein', goal:macroGoals.protein, color:'blue'},
    {key:'carbs', label:'Carbs', goal:macroGoals.carbs, color:'butter'},
    {key:'fat', label:'Fat', goal:macroGoals.fat, color:'slate'},
  ] as const;
  const dateText = new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'long',year:'numeric'}).format(new Date(day+'T12:00:00'));
  function changeDay(amount:number) {
    const d = new Date(day+'T12:00:00');
    d.setDate(d.getDate()+amount);
    setDay(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
  }
  function openFood(meal='Lunch') { setMealMessage('');setError('');setFood({...food,meal}); setFoodOpen(true); }


  if (cloud && !account) return <div className="auth">
    <div className="auth-art"><img src="/illustrations/kitchen-kindness.svg" alt="ภาพวาดคนทำอาหารด้วยความใส่ใจ"/><h2>Good food.<br/>Better together.</h2></div>
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
        <div className="profile-switch" aria-label="Select profile">{profiles.map(profile=><button key={profile.id} aria-label={profile.name} className={who===profile.id?'chosen':''} aria-pressed={who===profile.id} onClick={()=>{if(who!==profile.id)setFood(emptyMealDraft());setWho(profile.id)}}><Avatar ben={profile.id==='ben'}/><span>{profile.name}</span>{who===profile.id&&<Check size={12}/>}</button>)}</div>
      </div>
    </header>

    <main className="content">
      <div className="page-heading"><div>
        <div className="eyebrow"><span/> A LITTLE BETTER, EVERY DAY</div>
        <h1>{tab==='Dashboard'?<>Feeling good starts here<span className="heading-dot">.</span></>:tab==='Food diary'?'Your daily bites.':tab==='My recipes'?'Made with love.':tab==='Pantry'?'Our everyday ingredients.':tab==='Weight log'?'Small steps, real progress.':'A little more about you.'}</h1>
        <p className="sub">{tab==='Dashboard'?`วันนี้กินดี ดูแลตัวเองไปด้วยกันนะ ${p.name}`:tab==='Food diary'?'ทุกมื้อเล็กๆ คือส่วนหนึ่งของการดูแลตัวเอง':tab==='My recipes'?'สูตรโปรดจากครัวของเรา แชร์กันได้ทั้งนิวและเบ้น':tab==='Pantry'?'เครื่องปรุงและวัตถุดิบที่บ้านเราใช้ เลือกง่ายได้ทุกมื้อ':tab==='Weight log'?'ค่อยๆ ดูแลตัวเอง ในจังหวะที่เป็นคุณ':'ปรับข้อมูลและเป้าหมายให้เหมาะกับตัวเอง'}</p>
      </div>{['Dashboard','Food diary'].includes(tab)&&<button className="primary add-food" onClick={()=>openFood()}><Plus size={19}/> Add a meal</button>}</div>

      <p className="meal-status" role="status">{mealMessage}</p>
      {cloudNotice&&<p className="cloud-notice" role="status">{cloudNotice}</p>}
      {localImport&&<section className="local-import"><div><span className="eyebrow">BRING YOUR GOOD DAYS WITH YOU</span><h3>นำเข้าข้อมูลเดิมจากอุปกรณ์นี้</h3><p>{localImport.profiles} โปรไฟล์ · {localImport.pantry} ของในตู้ · {localImport.recipes} สูตร · {localImport.entries} รายการอาหาร · {localImport.weights} บันทึกน้ำหนัก</p><span>นำเข้าโปรไฟล์และเป้าหมายไปยังบัญชีที่ล็อกอินอยู่ โดยเก็บต้นฉบับในอุปกรณ์ไว้</span></div><button className="primary" disabled={importing} onClick={importLocalData}>{importing?'กำลังนำเข้า…':'นำเข้าข้อมูลเดิม'}</button></section>}
      {error&&<div className="alert" role="alert">{error}<button aria-label="Dismiss error" onClick={()=>setError('')}><X size={16}/></button></div>}
      {['Dashboard','Food diary','Weight log'].includes(tab)&&<div className="day-toolbar"><div className="day-picker">
        <button className="icon-button" aria-label="Previous day" onClick={()=>changeDay(-1)}><ChevronLeft size={17}/></button>
        <label className="date-label"><CalendarDays size={16}/><span>{day===today()?'Today, ':''}{dateText}</span><input aria-label="Select date" type="date" value={day} onChange={e=>{if(e.target.value)setDay(e.target.value)}}/></label>
        <button className="icon-button" aria-label="Next day" onClick={()=>changeDay(1)}><ChevronRight size={17}/></button>
      </div><span className="day-note"><Leaf size={14}/> Your pace. Your progress.</span></div>}

      {tab==='Dashboard'&&<>
        <div className="dashboard-grid">
          <section className="welcome-card">
            <div className="welcome-copy"><span className="pill"><Sun size={14}/> A FRESH LITTLE START</span><h2>A little care,<br/>in every bite.</h2><p>มื้อดีๆ เริ่มจากความใส่ใจเล็กๆ<br/>มาเติมพลังให้วันนี้กัน</p></div>
            <img className="kitchen-art" src="/illustrations/kitchen-kindness.svg" alt="ภาพเวกเตอร์คนน่ารักกำลังทำสลัดในครัว"/>
            <div className="welcome-footer"><Heart size={14}/> Made for you, shared with love.</div>
          </section>
          <section className="energy-card">
            <div className="card-heading"><h3>Daily energy</h3><span className="small-icon peach"><Flame size={18}/></span></div><p className="card-sub current-goal-label">{goalOption(p.goal).label}<span>·</span>{isCustomGoal(p) ? 'ปรับเอง' : 'เป้าหมายของคุณ'}</p>
            <div className="energy-ring" role="img" aria-label={`Consumed ${eaten} of ${goal} kilocalories, ${Math.round(progress)} percent`}>
              <svg viewBox="0 0 200 200" aria-hidden="true"><circle className="ring-track" cx="100" cy="100" r="86"/><circle className="ring-progress" cx="100" cy="100" r="86" strokeDasharray={`${progress*5.4035} 540.35`}/></svg>
              <div className="ring-label"><span>You've enjoyed</span><strong>{eaten.toLocaleString()}</strong><span>of {goal.toLocaleString()} kcal</span></div><span className="ring-leaf"><Leaf size={19}/></span>
            </div>
            <div className="energy-bottom"><div><span>Daily goal</span><b>{goal.toLocaleString()} <small>kcal</small></b></div><span className="vertical-line"/><div><span>{eaten>goal?'Above goal':'Remaining'}</span><b className="accent">{Math.abs(goal-eaten).toLocaleString()} <small>kcal</small></b></div></div>
          </section>
          <section className="macro-card">
            <div className="card-heading"><h3>A little balance</h3><span className="small-icon sage"><Leaf size={18}/></span></div><p className="card-sub">สารอาหารของวันนี้</p>
            <div className="macro-list">{macroInfo.map(m=>{const value=Math.round(entries.reduce((sum,x)=>sum+Number(x[m.key]),0));return <div className={`macro-row ${m.color}`} key={m.key}>
              <div className="macro-title"><span><i/>{m.label}</span><b>{value}<small> / {m.goal} g</small></b></div><div className="progress-track" role="progressbar" aria-label={m.label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={Math.max(value,m.goal)}><div style={{width:`${Math.min(100,value/Math.max(1,m.goal)*100)}%`}}/></div>
            </div>})}</div>
            <div className="macro-note"><Leaf size={17}/><p>{macroPlan.label}<span>P {macroPlan.protein}% · C {macroPlan.carbs}% · F {macroPlan.fat}%</span></p></div>
          </section>
        </div>

        <div className="lower-grid">
          <section className="journal-card"><div className="section-heading"><div><span className="eyebrow">ONE MEAL AT A TIME</span><h3>On the menu today<span className="count-badge">{entries.length}</span></h3></div><button className="textbutton" onClick={()=>setTab('Food diary')}>View diary <ArrowUpRight size={15}/></button></div>
            <div className="meal-list">{meals.map(({name,icon:Icon,hint},i)=>{const items=entries.filter(x=>x.meal===name);return <div className="meal-row" key={name}>
              <span className={`meal-icon meal-${i}`}><Icon size={20}/></span><div className="meal-info"><b>{name}</b><span>{items.length?items.map(x=>x.name).join(', '):hint}</span></div>
              {items.length?<span className="meal-calories">{items.reduce((sum,x)=>sum+Number(x.calories),0).toLocaleString()} <small>kcal</small></span>:<span className="not-logged">Not logged yet</span>}
              <button className="add-meal-button" aria-label={`Add ${name}`} onClick={()=>openFood(name)}><Plus size={16}/></button>
            </div>})}</div>
          </section>
          <div className="side-stack">
            <section className="recipe-prompt"><div><span className="eyebrow">A LITTLE MOMENT TO LOG</span><h3>A good meal.<br/>A quick little note.</h3><button className="textbutton" onClick={()=>openFood()}>บันทึกโภชนาการ <ArrowRight size={16}/></button></div><img src="/illustrations/salad-bowl.svg" alt="ภาพเวกเตอร์ชามสลัดผักกับไข่"/></section>
            <section className="weight-card"><span className="small-icon cream"><Scale size={21}/></span><div><span>Your latest weight</span><b>{latestWeight?.weight??p.weight} <small>kg</small></b><span className="weight-source">{latestWeight?latestWeight.date:'จากข้อมูลโปรไฟล์'}</span></div><button className="round-button" aria-label="View weight log" onClick={()=>setTab('Weight log')}><ArrowUpRight size={20}/></button></section>
          </div>
        </div>
        <div className="body-stats"><span><Leaf size={14}/> A little insight into your daily needs</span><div><span>TDEE <b>{tdee(p).toLocaleString()}</b> kcal</span><i/><span>BMR <b>{Math.round(bmr(p)).toLocaleString()}</b> kcal</span><button className="textbutton" onClick={()=>setTab('Settings')}>Your goals <ArrowUpRight size={14}/></button></div></div>
      </>}

      {tab==='Food diary'&&<section className="panel"><div className="section-heading"><div><span className="eyebrow">YOUR FOOD JOURNAL</span><h3>A day of nourishment</h3></div><span className="total-badge">{eaten.toLocaleString()} kcal</span></div>
        {entries.length?entries.map(x=><div className="entry" key={x.id}><span className="meal-icon meal-1"><Utensils size={20}/></span><div className="entry-description"><b>{x.name}</b><span>{x.meal}{x.portion_amount ? ` · ${x.portion_amount} ${x.portion_unit === 'grams' ? 'g' : 'เสิร์ฟ'}` : ''} · Protein {x.protein}g / Carbs {x.carbs}g / Fat {x.fat}g</span>{!!x.ingredient_items?.length&&<details className="entry-ingredients"><summary>วัตถุดิบ ({x.ingredient_items.length})</summary><ul>{x.ingredient_items.map(item=><li key={item.id}>{item.food.name} ({stateLabels[item.food.state]}) <b>{item.grams} {item.unit||'g'}</b></li>)}</ul></details>}</div><b>{x.calories} <small>kcal</small></b><button className="icon-button" aria-label={`Delete ${x.name}`} onClick={()=>removeFood(x.id)}><X size={17}/></button></div>):<div className="empty-state"><img src="/illustrations/salad-bowl.svg" alt=""/><h3>Your first bite starts here.</h3><p>ยังไม่มีมื้ออาหารในวันนี้ เพิ่มเมนูที่คุณอร่อยได้เลย</p><button className="primary" onClick={()=>openFood()}><Plus size={17}/> Add your first meal</button></div>}
      </section>}

      {tab==='My recipes'&&<RecipeBuilder extraFoods={ingredientFoods} recipes={recipes} profiles={profiles} who={who} day={day} onSave={saveRecipe} onLog={logRecipe}/>}

      {tab==='Weight log'&&<section className="panel weight-panel"><div className="section-heading"><div><span className="eyebrow">ONE STEP AT A TIME</span><h3>Your weight journal</h3></div><Scale size={27}/></div>
        <form className="weight-form" onSubmit={e=>{e.preventDefault();addWeight()}}><label>Weight (kg)<input required min="1" type="number" step="0.1" placeholder={String(p.weight)} value={weight||''} onChange={e=>setWeight(Number(e.target.value))}/></label><button className="primary"><Plus size={17}/> Log weight</button></form>
        {weights.filter(x=>x.profile_id===who).length?weights.filter(x=>x.profile_id===who).sort((a,b)=>b.date.localeCompare(a.date)).map(x=><div className="entry" key={x.id}><span>{x.date}</span><b>{x.weight} <small>kg</small></b></div>):<div className="simple-empty"><Leaf size={30}/><p>เริ่มบันทึกน้ำหนัก แล้วค่อยๆ ดูความเปลี่ยนแปลงไปด้วยกัน</p></div>}
      </section>}

      {tab==='Pantry'&&<Pantry/>}
      {tab==='Settings'&&<NutritionSettings key={who} profile={p} onSave={saveProfile}/>}

      <footer><Brand/><span>A little care goes a long way.</span><div><span className="sync-dot"/>{cloud?'Connected':'Saved on this device'}{cloud&&<button className="textbutton" onClick={signOut}><LogOut size={13}/> Sign out</button>}</div></footer>
    </main>

    {foodOpen&&<MealDialog history={mealHistory} recipes={recipes} profiles={profiles} who={who} day={day} food={food} setFood={setFood} error={error} addFood={addFood} onIngredientMeal={addIngredientMeal} extraFoods={ingredientFoods} onLog={logRecipe} onClose={()=>setFoodOpen(false)} onOpenRecipes={()=>{setFoodOpen(false);setTab('My recipes')}} onSuccess={message=>{setMealMessage(message);setFoodOpen(false)}}/>}
  </div>;
}

function Brand() {return <span className="brand"><span className="brand-mark"><Flame size={23} strokeWidth={1.8}/></span>daily<span>fuel</span><i>.</i></span>}
function Avatar({ben=false}:{ben?:boolean}) {return <svg className="avatar" viewBox="0 0 36 36" fill="none" aria-hidden="true"><circle cx="18" cy="18" r="18" fill={ben?'#F0E1AD':'#D1E1EC'}/><path d="M6 36c0-9 5-14 12-14s12 5 12 14" fill={ben?'#879FAF':'#668AA5'}/>{!ben&&<circle cx="20" cy="9" r="6" fill="#4A3F37"/>}<path d="M9 16c-2-14 20-14 18 0v8H9Z" fill="#4A3F37"/><ellipse cx="18" cy="18" rx="7" ry="9" fill="#F0B891"/><path d="M10 15c3 0 8-3 9-6 2 4 5 6 8 6-1-11-17-10-17 0Z" fill="#4A3F37"/><path d="M14 18h1m6 0h1m-6 5q2 2 4 0" stroke="#4A3F37" strokeWidth="1.2" strokeLinecap="round"/></svg>}
