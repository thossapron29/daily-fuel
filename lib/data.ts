import {createClient, SupabaseClient} from '@supabase/supabase-js';
import type {Profile} from './nutrition';
import type {RecipeIngredient} from './recipes';
export type {Profile} from './nutrition';
export {bmr, tdee, target} from './nutrition';
export type Entry={id:string;profile_id:string;date:string;meal:string;name:string;calories:number;protein:number;carbs:number;fat:number;recipe_id?:string;portion_amount?:number;portion_unit?:'grams'|'servings';ingredient_items?:RecipeIngredient[]};
export type {Recipe} from './recipes';
// Public example values only. Existing accounts keep their saved Supabase data.
export const defaultProfiles:Profile[]=[{id:'new',name:'นิว',sex:'female',age:30,weight:60,height:165,activity:1.2,body_fat:null,goal:'lose',adjustment:-300,macro_plan:'moderate'},{id:'ben',name:'เบ้น',sex:'male',age:30,weight:70,height:175,activity:1.375,body_fat:null,goal:'maintain',adjustment:0,macro_plan:'moderate'}];
export const uid=()=>crypto.randomUUID();
export const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
export const getSupabase=():SupabaseClient|null=>{
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if((url&&!key)||(!url&&key))throw new Error('Supabase configuration is incomplete');
 return url&&key?createClient(url,key):null;
};
