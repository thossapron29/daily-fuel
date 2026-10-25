'use client';
import {useEffect,useState} from 'react';
import Workspace from './workspace';
import {PantryContext} from './pantry-context';
import {buildPantryItem,pantryToRow,pantryFromRow,normalizeBarcode,type PantryItem,type ReadyPantryItem,type PantryDraft,type BarcodeCandidate} from '../lib/pantry';
import {defaultProfiles,Profile,Entry,Recipe,today,uid,getSupabase} from '../lib/data';
import {validateNutritionProfile} from '../lib/nutrition';
import {emptyMealDraft,parseMealDraft} from '../lib/manual-meals';
import {parseLocalBackup, type LocalBackup} from '../lib/local-backup';
import {buildIngredientMeal, type IngredientMealDraft, buildRecipe, portionNutrition, validateRecipeLog, type RecipeDraft, type RecipeLog} from '../lib/recipes';
const db=getSupabase();
const messageOf=(error:unknown,fallback:string)=>error&&typeof error==='object'&&'message' in error&&typeof error.message==='string'?error.message:fallback;
export default function Home(){
 const [account,setAccount]=useState<string|null>(null),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState('');
 const [profiles,setProfiles]=useState<Profile[]>(defaultProfiles),[who,setWho]=useState('new'),[tab,setTab]=useState('Dashboard'),[day,setDay]=useState(today());
 const [entries,setEntries]=useState<Entry[]>([]),[recipes,setRecipes]=useState<Recipe[]>([]),[weights,setWeights]=useState<{id:string;profile_id:string;date:string;weight:number}[]>([]);
 const [pantry,setPantry]=useState<PantryItem[]>([]);
 const [food,setFood]=useState(emptyMealDraft),[weight,setWeight]=useState(0);
 const list=entries.filter(x=>x.profile_id===who&&x.date===day);
 const save=(ps=profiles,es=entries,rs=recipes,ws=weights,pantryItems=pantry)=>{if(!db)localStorage.setItem('dailyfuel',JSON.stringify({profiles:ps,entries:es,recipes:rs,weights:ws,pantry:pantryItems}))};
 const [authReady,setAuthReady]=useState(!db),[loadedAccount,setLoadedAccount]=useState<string|null>(null);
 const [loadFailure,setLoadFailure]=useState(''),[reloadVersion,setReloadVersion]=useState(0);
 const [localBackup,setLocalBackup]=useState<LocalBackup|null>(null),[importing,setImporting]=useState(false),[cloudNotice,setCloudNotice]=useState('');
 const [authPending,setAuthPending]=useState(false),[authMessage,setAuthMessage]=useState('');
 useEffect(()=>{
  if(!db){
   try{const x=parseLocalBackup(localStorage.getItem('dailyfuel'));if(x){setProfiles(x.profiles);setEntries(x.entries);setRecipes(x.recipes);setWeights(x.weights);setPantry(x.pantry)}}catch{setError('อ่านข้อมูลในอุปกรณ์ไม่สำเร็จ ข้อมูลต้นฉบับยังอยู่ในเบราว์เซอร์')}
   return;
  }
  const {data:{subscription}}=db.auth.onAuthStateChange((_,session)=>{setAccount(session?.user?.id??null);setAuthReady(true)});
  return()=>subscription.unsubscribe();
 },[]);
 useEffect(()=>{
  if(!db)return;
  if(!account){setProfiles(defaultProfiles);setEntries([]);setRecipes([]);setWeights([]);setPantry([]);setLocalBackup(null);setLoadedAccount(null);return}
  let cancelled=false;
  setLoadFailure('');
  (async()=>{
   try{
    const defaults=defaultProfiles.map(profile=>({owner_id:account,slot:profile.id,name:profile.name,sex:profile.sex,age:profile.age,weight:profile.weight,height:profile.height,activity:profile.activity,body_fat:profile.body_fat,goal:profile.goal,adjustment:profile.adjustment,macro_plan:profile.macro_plan??'moderate'}));
    const bootstrap=await db.from('profiles').upsert(defaults,{onConflict:'owner_id,slot',ignoreDuplicates:true});
    if(bootstrap.error)throw bootstrap.error;
    const [ps,es,rs,ws,receipts,pantryResult]=await Promise.all(['profiles','entries','recipes','weights','import_receipts','pantry_items'].map(table=>db.from(table).select('*').eq('owner_id',account)));
    for(const result of [ps,es,rs,ws,receipts,pantryResult])if(result.error)throw result.error;
    if(cancelled)return;
    const lookup=new Map((ps.data||[]).map(profile=>[profile.id,profile.slot]));
    const loadedProfiles=(ps.data||[]).map(profile=>({...profile,id:profile.slot,dbid:profile.id}));
    if(!loadedProfiles.some(profile=>profile.id==='new')||!loadedProfiles.some(profile=>profile.id==='ben'))throw new Error('โหลดโปรไฟล์ไม่ครบ กรุณาลองอีกครั้ง');
    setProfiles(loadedProfiles);
    setEntries((es.data||[]).map(entry=>({...entry,profile_id:lookup.get(entry.profile_id)||entry.profile_id})));
    setRecipes(rs.data||[]);
    setWeights((ws.data||[]).map(entry=>({...entry,profile_id:lookup.get(entry.profile_id)||entry.profile_id})));
    setPantry((pantryResult.data||[]).map(pantryFromRow));
    const isEmpty=!es.data?.length&&!rs.data?.length&&!ws.data?.length&&!receipts.data?.length&&!pantryResult.data?.length;
    try{setLocalBackup(isEmpty?parseLocalBackup(localStorage.getItem('dailyfuel')):null)}catch{setCloudNotice('ข้อมูลเดิมในอุปกรณ์นี้ยังอยู่ แต่ยังอ่านเพื่อนำเข้าไม่ได้')}
    setLoadedAccount(account);
   }catch(error){if(!cancelled)setLoadFailure(messageOf(error,'โหลดข้อมูลจาก Supabase ไม่สำเร็จ'))}
  })();
  return()=>{cancelled=true};
 },[account,reloadVersion]);
 async function savePantry(draft:PantryDraft):Promise<ReadyPantryItem>{
  const item=buildPantryItem(draft,draft.id||uid());
  if(draft.id&&!pantry.some(food=>food.id===draft.id))throw new Error('ไม่พบรายการเดิม กรุณาเปิดตู้ใหม่');
  if(item.barcode&&pantry.some(food=>food.id!==item.id&&food.barcode===item.barcode))throw new Error('มีบาร์โค้ดนี้ในตู้แล้ว ให้เปิดแก้ไขหรือนำรายการเดิมกลับเข้าตู้');
  if(db){
   if(!account)throw new Error('กรุณาเข้าสู่ระบบก่อนบันทึก');
   const row=pantryToRow(item);
   const request=draft.id?db.from('pantry_items').update(row).eq('id',item.id).eq('owner_id',account):db.from('pantry_items').insert({...row,owner_id:account});
   const {error}=await request.select('id').single();if(error)throw error;
  }
  const next=draft.id?pantry.map(food=>food.id===item.id?item:food):[...pantry,item];
  save(profiles,entries,recipes,weights,next);setPantry(next);return item;
 }
 async function archivePantry(id:string,archived:boolean){
  if(!pantry.some(food=>food.id===id))throw new Error('ไม่พบรายการเดิม กรุณาเปิดตู้ใหม่');
  if(db){if(!account)throw new Error('กรุณาเข้าสู่ระบบก่อนบันทึก');const {error}=await db.from('pantry_items').update({archived}).eq('id',id).eq('owner_id',account).select('id').single();if(error)throw error}
  const next=pantry.map(food=>food.id===id?{...food,archived}:food);save(profiles,entries,recipes,weights,next);setPantry(next);
 }
 async function lookupBarcode(input:string):Promise<BarcodeCandidate>{
  const barcode=normalizeBarcode(input);const existing=pantry.find(food=>food.barcode===barcode);
  if(existing)return {name:existing.name,brand:existing.brand||'',barcode,basis:100,basis_unit:existing.basis_unit||'g',values:{calories:existing.calories,protein:existing.protein,carbs:existing.carbs,fat:existing.fat},source:existing.source,source_url:existing.source_url||'',source_id:existing.source_id||barcode};
  const headers:Record<string,string>={'Content-Type':'application/json'};
  if(db){const {data,error}=await db.auth.getSession();if(error||!data.session)throw new Error('กรุณาเข้าสู่ระบบก่อนค้นหา');headers.Authorization=`Bearer ${data.session.access_token}`}
  const response=await fetch('/api/barcode',{method:'POST',headers,body:JSON.stringify({barcode})});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'ค้นหาสินค้าไม่สำเร็จ ลองใหม่ได้ครับ');return result.product;
 }
 async function importLocalData(){
  if(!db||!account||!localBackup||importing)return;
  setImporting(true);setError('');
  try{
   const {error}=await db.rpc('import_local_data',{payload:localBackup});
   if(error)throw error;
   setLocalBackup(null);setCloudNotice('นำเข้าข้อมูลเดิมแล้ว ข้อมูลต้นฉบับในอุปกรณ์ยังเก็บไว้');
   setLoadedAccount(null);setReloadVersion(value=>value+1);
  }catch(error){setError(messageOf(error,'นำเข้าข้อมูลไม่สำเร็จ กรุณาลองอีกครั้ง'))}
  finally{setImporting(false)}
 }
 async function signOut(){
  if(!db)return;
  setError('');setCloudNotice('');setPassword('');
  const {error}=await db.auth.signOut();if(error)setError(error.message);
 }
 const dbid=(slot:string)=>(profiles.find(x=>x.id===slot) as Profile&{dbid?:string})?.dbid;
 async function addFood(){
  setError('');
  try{
   const x={...parseMealDraft(food),id:uid(),profile_id:who,date:day};
   if(db){
    if(!account)throw new Error('กรุณาเข้าสู่ระบบ');
    const {error}=await db.from('entries').insert({...x,profile_id:dbid(who),owner_id:account}).select('id').single();
    if(error)throw error;
   }
   const a=[...entries,x];save(profiles,a);setEntries(a);setFood(emptyMealDraft());return true;
  }catch(error){setError(messageOf(error,'บันทึกมื้ออาหารไม่สำเร็จ'));return false}
 }
 async function addIngredientMeal(draft:IngredientMealDraft):Promise<boolean>{
  setError('');
  try{
   const entry=buildIngredientMeal(draft,uid(),profiles.map(profile=>profile.id));
   if(db){
    if(!account)throw new Error('กรุณาเข้าสู่ระบบก่อนบันทึกมื้ออาหาร');
    const {error}=await db.from('entries').insert({...entry,owner_id:account,profile_id:dbid(entry.profile_id)}).select('id').single();
    if(error)throw error;
   }
   const next=[...entries,entry];save(profiles,next);setEntries(next);setWho(entry.profile_id);setDay(entry.date);return true;
  }catch(error){setError(messageOf(error,'บันทึกมื้ออาหารไม่สำเร็จ กรุณาลองอีกครั้ง'));return false}
 }
 async function removeFood(id:string){
  setError('');
  try{
   if(db){if(!account)throw new Error('กรุณาเข้าสู่ระบบ');const {error}=await db.from('entries').delete().eq('id',id).eq('owner_id',account);if(error)throw error;}
   const a=entries.filter(x=>x.id!==id);save(profiles,a);setEntries(a);
  }catch(error){setError(messageOf(error,'ลบรายการอาหารไม่สำเร็จ'))}
 }
 async function saveRecipe(draft:RecipeDraft):Promise<Recipe|null>{
  setError('');
  try{
   const x=buildRecipe(draft,draft.id||uid());
   if(draft.id&&!recipes.some(recipe=>recipe.id===draft.id))throw new Error('ไม่พบสูตรที่ต้องการแก้ไข');
   if(db){
    if(!account)throw new Error('กรุณาเข้าสู่ระบบก่อนบันทึกสูตร');
    const {id,...values}=x;
    const request=draft.id?db.from('recipes').update(values).eq('id',id).eq('owner_id',account):db.from('recipes').insert({...x,owner_id:account});
    const {error}=await request.select('id').single();
    if(error)throw error;
   }
   const next=draft.id?recipes.map(recipe=>recipe.id===x.id?x:recipe):[...recipes,x];
   save(profiles,entries,next);
   setRecipes(next);
   return x;
  }catch(error){setError(error instanceof Error?error.message:'บันทึกสูตรไม่สำเร็จ ตรวจสอบข้อมูลและลองอีกครั้ง');return null}
 }
 async function logRecipe(recipe:Recipe,log:RecipeLog):Promise<boolean>{
  setError('');
  try{
   validateRecipeLog(log,profiles.map(profile=>profile.id));
   const savedRecipe=recipes.find(value=>value.id===recipe.id);
   if(!savedRecipe)throw new Error('ไม่พบสูตรอาหาร');
   const added:Entry[]=log.portions.map(portion=>({id:uid(),profile_id:portion.profile_id,date:log.date,meal:log.meal,name:savedRecipe.name,recipe_id:savedRecipe.id,portion_amount:portion.amount,portion_unit:log.unit,...portionNutrition(savedRecipe,portion.amount,log.unit)}));
   if(db){
    if(!account)throw new Error('กรุณาเข้าสู่ระบบก่อนบันทึกมื้ออาหาร');
    const {error}=await db.from('entries').insert(added.map(entry=>({...entry,profile_id:dbid(entry.profile_id),owner_id:account})));
    if(error)throw error;
   }
   const next=[...entries,...added];
   save(profiles,next);
   setEntries(next);
   setDay(log.date);
   return true;
  }catch(error){setError(error instanceof Error?error.message:'บันทึกมื้ออาหารไม่สำเร็จ กรุณาลองอีกครั้ง');return false}
 }
 async function saveProfile(x:Profile):Promise<boolean>{
  const issues=validateNutritionProfile(x);
  if(Object.keys(issues).length){setError(Object.values(issues)[0]||'Please check your profile');return false}
  setError('');
  try{
   if(db){
    const {error}=await db.from('profiles').update({name:x.name,sex:x.sex,age:x.age,weight:x.weight,height:x.height,activity:x.activity,body_fat:x.body_fat,goal:x.goal,adjustment:x.adjustment,macro_plan:x.macro_plan??'moderate'}).eq('id',dbid(x.id)).select('id').single();
    if(error){setError(error.message);return false}
   }
   const a=profiles.map(y=>y.id===x.id?x:y);
   save(a);
   setProfiles(a);
   return true;
  }catch{setError('บันทึกเป้าหมายไม่สำเร็จ กรุณาลองอีกครั้ง');return false}
 }
 async function addWeight(){
  if(!Number.isFinite(weight)||weight<=0)return;
  setError('');
  try{
   const x={id:uid(),profile_id:who,date:day,weight};
   if(db){if(!account)throw new Error('กรุณาเข้าสู่ระบบ');const {error}=await db.from('weights').insert({...x,profile_id:dbid(who),owner_id:account}).select('id').single();if(error)throw error;}
   const a=[...weights,x];save(profiles,entries,recipes,a);setWeights(a);setWeight(0);
  }catch(error){setError(messageOf(error,'บันทึกน้ำหนักไม่สำเร็จ'))}
 }
 async function auth(signup:boolean){
  if(!db||authPending)return;
  setError('');setAuthMessage('');
  if(!email.trim()||password.length<6){setError('กรอกอีเมลและรหัสผ่านอย่างน้อย 6 ตัวอักษร');return}
  setAuthPending(true);
  try{
   if(signup){
    const {data,error}=await db.auth.signUp({email:email.trim(),password,options:{emailRedirectTo:window.location.origin}});
    if(error)throw error;
    setAuthMessage(data.session?'สร้างบัญชีแล้ว':'ตรวจอีเมลเพื่อยืนยันบัญชี แล้วกลับมาล็อกอินที่หน้านี้');
   }else{
    const {error}=await db.auth.signInWithPassword({email:email.trim(),password});if(error)throw error;setPassword('');
   }
  }catch(error){setError(messageOf(error,'เข้าสู่ระบบไม่สำเร็จ กรุณาลองอีกครั้ง'))}
  finally{setAuthPending(false)}
 }
 if(db&&(!authReady||(account&&loadedAccount!==account))){
  return <div className="cloud-state"><div className="cloud-state-card"><span className="eyebrow">DAILY FUEL · YOUR SHARED SPACE</span><h1>{loadFailure?'ยังโหลดข้อมูลไม่ได้':'กำลังเชื่อมต่อครัวของเรา'}</h1><p role={loadFailure?'alert':'status'}>{loadFailure||'กำลังโหลดข้อมูลจาก Supabase'}</p>{loadFailure&&<div><button className="primary" onClick={()=>setReloadVersion(value=>value+1)}>ลองอีกครั้ง</button><button className="textbutton" onClick={signOut}>Sign out</button></div>}</div></div>;
 }


 return <PantryContext.Provider value={{items:pantry,save:savePantry,archive:archivePantry,lookup:lookupBarcode}}><Workspace account={account} cloud={!!db} email={email} password={password} error={error} setEmail={setEmail} setPassword={setPassword} setError={setError} auth={auth} authPending={authPending} authMessage={authMessage} signOut={signOut} localImport={localBackup?{pantry:localBackup.pantry.length,profiles:localBackup.profiles.length,recipes:localBackup.recipes.length,entries:localBackup.entries.length,weights:localBackup.weights.length}:null} importing={importing} importLocalData={importLocalData} cloudNotice={cloudNotice} profiles={profiles} who={who} setWho={setWho} tab={tab} setTab={setTab} day={day} setDay={setDay} entries={list} mealHistory={entries} recipes={recipes} weights={weights} food={food} setFood={setFood} weight={weight} setWeight={setWeight} addFood={addFood} addIngredientMeal={addIngredientMeal} ingredientFoods={entries.flatMap(entry=>(entry.ingredient_items||[]).map(item=>item.food))} removeFood={removeFood} saveRecipe={saveRecipe} logRecipe={logRecipe} saveProfile={saveProfile} addWeight={addWeight}/></PantryContext.Provider>
}
