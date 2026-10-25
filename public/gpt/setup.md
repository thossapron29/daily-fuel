# ตั้งค่า Daily Fuel GPT

ใช้ GPT หนึ่งตัวและแชตเดียวสำหรับนิวกับเบ้นได้ แต่แต่ละบัญชี Daily Fuel ต้องยินยอมให้เพิ่มมื้อแทนกันก่อน API จะบันทึกเข้าบัญชีที่ได้รับอนุญาตเท่านั้น เป้าหมาย น้ำหนัก และบันทึกรายวันยังแยกตามบัญชี

## 1. สร้าง GPT ฉบับร่าง

- ชื่อ: Daily Fuel
- Description: ช่วยคิดโภชนาการและบันทึกมื้อของนิวกับเบ้นหลังตรวจและยืนยัน
- Instructions: นำข้อความจาก https://daily-fuel-inky.vercel.app/gpt/instructions.txt ไปวาง
- ตั้งให้ใช้เฉพาะตัวเอง หรือแชร์ลิงก์ให้คู่ตามที่ต้องการ
- เพิ่ม Action แล้ว Import from URL: https://daily-fuel-inky.vercel.app/api/gpt/openapi
- บันทึก GPT ฉบับร่างให้มี GPT ID ก่อน (ยังไม่ต้องกรอก Client ID/Secret) แล้วคัดลอกลิงก์ GPT หรือ ID ที่ขึ้นต้น g-

## 2. ลงทะเบียนการเชื่อมต่อครั้งเดียว

เปิด https://daily-fuel-inky.vercel.app/gpt ด้วยบัญชี Daily Fuel ของคนตั้งค่า นำลิงก์ GPT หรือ GPT ID มาใส่ แล้วกดสร้างการเชื่อมต่อ ระบบจะสร้าง Callback URL ให้ หรือใส่ Callback URL ที่ GPT แสดงโดยตรงก็ได้ ต้องเป็น URL เต็มตามที่ GPT ให้มา เช่น https://chatgpt.com/aip/g-…/oauth/callback (รองรับรูปแบบ chat.openai.com ด้วย แต่ต้องตรงกับ URL ที่ลงทะเบียนทุกตัวอักษร)

คัดลอก Client ID และ Client Secret จากหน้านี้ไปใส่ใน OAuth ของ GPT ด้วยตัวเอง Secret จะแสดงครั้งเดียวและต้องไม่ส่งในแชตหรือใส่ในไฟล์สาธารณะ จากนั้นตรวจ Callback URL ใน GPT ให้ตรงกับ URL ที่ลงทะเบียนไว้ หากทำ Secret หาย ให้ปิดการเชื่อมต่อเดิมแล้วสร้างใหม่

- Authorization URL: https://daily-fuel-inky.vercel.app/oauth/authorize
- Token URL: https://daily-fuel-inky.vercel.app/oauth/token
- Scope: meals.write
- Token Exchange: ใช้ POST form หรือ Basic authentication ได้
- Privacy Policy URL: https://daily-fuel-inky.vercel.app/gpt/privacy

ไม่ต้องใช้ OpenAI API key สำหรับตัวเชื่อมนี้ โมเดลทำงานอยู่ใน ChatGPT ส่วนเว็บรับเฉพาะผลโภชนาการผ่าน Action

## 3. ผูกบัญชีทั้งคู่

ให้แต่ละคนเปิด https://daily-fuel-inky.vercel.app/gpt ด้วยบัญชี Daily Fuel ของตัวเอง เลือก GPT การเชื่อมต่อเดียวกัน แล้วเลือก "บัญชีนี้เป็นของใคร" ให้ต่างกัน (นิว / เบ้น)

ถ้าต้องการบันทึกพร้อมกัน ให้ทั้งสองบัญชีเปิด "อนุญาตบันทึกมื้อให้กัน" และบันทึกสิทธิ์ บัญชีที่แชร์เมนูกันจะเห็นการเชื่อมต่อของอีกคนโดยอัตโนมัติ แต่การแชร์เมนูอย่างเดียวไม่ให้สิทธิ์เพิ่มมื้อแทนกัน

จากนั้นเปิด GPT ใน ChatGPT และเชื่อม Daily Fuel ด้วยบัญชีใดบัญชีหนึ่งที่ตั้งค่าไว้ แชตเดียวจะเห็นผู้รับสองคนเมื่อสิทธิ์ครบ ส่วนอีกบัญชีไม่จำเป็นต้องล็อกอิน ChatGPT ในแชตนั้น

## 4. ทดลอง

ให้ GPT เรียก getMealRecipients เพื่อตรวจว่ามีนิวและเบ้น จากนั้นลองให้เตรียมมื้อที่มีค่าต่างกัน ตรวจชื่อคน วันที่ มื้อ และตัวเลขที่สรุป ก่อนกดยืนยัน Action

- prepareMealBatch สร้าง draft อายุ 15 นาที ยังไม่เพิ่มใน Food diary
- confirmMealBatch มี x-openai-isConsequential=true ให้ ChatGPT ขอการยืนยันก่อนทำงานเสมอ
- ยืนยันหนึ่งครั้งบันทึกทั้งหมดในธุรกรรมเดียว ถ้าสิทธิ์ของคนใดขาด จะไม่มีการบันทึกครึ่งเดียว
- request_id เป็น UUID ต่อหนึ่งมื้อที่ตั้งใจบันทึก คำขอซ้ำใช้ UUID เดิม ส่วนการแก้ข้อมูลใช้ UUID ใหม่
- ยืนยัน draft_id เดิมซ้ำจะคืนใบรับเดิม ไม่เพิ่มอาหารซ้ำ แม้คำตอบครั้งแรกหายระหว่างทาง
- กลับมาเปิด Daily Fuel หรือรีเฟรชเพื่อดูยอดที่บันทึก

## ยกเลิก/เปลี่ยน

ยกเลิกสิทธิ์ของบัญชีตัวเองที่หน้า Daily Fuel GPT ได้ทันที ปิดการอนุญาตคู่เพื่อหยุดเพิ่มมื้อให้กัน หรือผู้สร้างปิดการเชื่อมต่อ GPT ทั้งตัวเพื่อเลิกใช้ credential เดิม มื้อที่บันทึกแล้วจะยังอยู่ใน Food diary ของเจ้าของ

OAuth ใช้ authorization code อายุ 5 นาทีและใช้ได้ครั้งเดียว, access token อายุ 1 ชั่วโมง และ rotating refresh token สูงสุด 30 วัน รองรับ S256 PKCE เมื่อ client ส่งมา Credential เก็บในฐานข้อมูลเป็น SHA-256 hash; ไม่ใช่ Supabase session token และใช้เปิดอ่าน diary/goals/weights ไม่ได้

เอกสารอ้างอิง: https://developers.openai.com/api/docs/actions/authentication และ https://developers.openai.com/api/docs/actions/production#consequential-flag
