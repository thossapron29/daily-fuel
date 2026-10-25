import MealReview from './review';
import {UUID} from '../../../../lib/gpt-api';
export default async function Page({params}:{params:Promise<{draft_id:string}>}){
 const {draft_id}=await params;
 if(!UUID.test(draft_id))return <main className="gpt-page"><section className="panel"><h1>ลิงก์รายการไม่ถูกต้อง</h1><p>กลับไปเปิดลิงก์ที่ Plugin ให้มาอีกครั้ง</p></section></main>;
 return <MealReview draftId={draft_id}/>;
}
