import {normalizeBarcode,parseBarcodeProduct} from '../../../lib/pantry';

export const runtime='nodejs';
const recent=new Map<string,number[]>();
export async function POST(request:Request) {
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 let owner='local-development';
 if(url&&key){
  const token=request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
  if(!token)return Response.json({error:'กรุณาเข้าสู่ระบบก่อนค้นหา'},{status:401});
  // Verify with Supabase Auth; never trust a decoded client JWT or user id.
  try{
   const auth=await fetch(`${url.replace(/\/$/,'')}/auth/v1/user`,{headers:{apikey:key,Authorization:`Bearer ${token}`},cache:'no-store',signal:AbortSignal.timeout(5000)});
   if(auth.status===401||auth.status===403)return Response.json({error:'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่'},{status:401});
   if(!auth.ok)return Response.json({error:'ตรวจสอบเซสชันไม่ได้ กรุณาลองอีกครั้ง'},{status:503});
   const user=await auth.json();if(!user||typeof user.id!=='string'||!user.id)return Response.json({error:'กรุณาเข้าสู่ระบบใหม่'},{status:401});
   owner=user.id;
  }catch{return Response.json({error:'ตรวจสอบเซสชันไม่ได้ กรุณาลองอีกครั้ง'},{status:503})}
 }else if(process.env.NODE_ENV!=='development'||url||key)return Response.json({error:'ยังไม่ได้ตั้งค่าระบบค้นหา'},{status:503});
 let barcode:string;
 try{const body=await request.text();if(body.length>512)throw new Error('ข้อมูลยาวเกินไป');const value=JSON.parse(body);if(typeof value.barcode!=='string')throw new Error('กรอกเลขบาร์โค้ด');barcode=normalizeBarcode(value.barcode)}catch(error){return Response.json({error:error instanceof Error?error.message:'ตรวจสอบบาร์โค้ด'},{status:400})}
 const now=Date.now();for(const [id,times]of recent)if(!times.some(time=>now-time<60000))recent.delete(id);
 const times=(recent.get(owner)||[]).filter(time=>now-time<60000);
 if(times.length>=8)return Response.json({error:'ค้นหาบ่อยเกินไป รอสักครู่แล้วลองใหม่'},{status:429,headers:{'Retry-After':'60'}});
 recent.set(owner,[...times,now]);
 try{
  const fields='code,product_name,brands,nutrition,nutriments,nutrition_data_per,serving_quantity,serving_quantity_unit';
  const response=await fetch(`https://world.openfoodfacts.org/api/v3.6/product/${barcode}.json?fields=${fields}`,{headers:{'User-Agent':'DailyFuel/0.1 (https://github.com/thossapron29/daily-fuel)'},next:{revalidate:86400},signal:AbortSignal.timeout(10000)});
  if(response.status===404)return Response.json({error:'ไม่พบสินค้านี้ เพิ่มจากฉลากได้เลย'},{status:404});
  if(!response.ok)return Response.json({error:'ฐานข้อมูลสินค้ายังไม่พร้อม ลองใหม่หรือกรอกฉลากเองได้'},{status:502});
  const payload=await response.json();
  if(!payload.product)return Response.json({error:'ไม่พบสินค้านี้ เพิ่มจากฉลากได้เลย'},{status:404});
  return Response.json({product:parseBarcodeProduct(payload,barcode)},{headers:{'Cache-Control':'private, no-store'}});
 }catch{return Response.json({error:'เชื่อมต่อฐานข้อมูลสินค้าไม่สำเร็จ ลองใหม่หรือกรอกฉลากเองได้'},{status:502})}
}
