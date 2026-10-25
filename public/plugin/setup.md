# Daily Fuel Plugin + MCP

## 1. สร้าง Client ใน Daily Fuel

เปิด https://daily-fuel-inky.vercel.app/gpt ด้วยบัญชี Daily Fuel ของผู้ที่จะเชื่อม Plugin

Callback URL เริ่มต้นคือ https://chatgpt.com/connector_platform_oauth_redirect หาก Advanced OAuth settings ของ ChatGPT แสดง URL ต่างออกไป ให้คัดลอก URL นั้นมาใช้ตรง ๆ แทน ต้องเป็น URL สำหรับ Plugin ไม่ใช่ /aip/g-… ของ GPT Actions

กดสร้าง Client สำหรับ Plugin แล้วคัดลอก Client ID และ Client Secret ไว้ใส่ใน ChatGPT โดยตรง Secret แสดงครั้งเดียว อย่าส่งในแชตหรือใส่ไฟล์สาธารณะ

## 2. เพิ่ม custom MCP ใน ChatGPT

เปิด https://chatgpt.com/plugins → Add → Add custom MCP server

- Name: Daily Fuel
- Description: เตรียมโภชนาการและบันทึกมื้อนิวกับเบ้นหลังยืนยันบน Daily Fuel
- Server URL: https://daily-fuel-inky.vercel.app/mcp
- Authentication: OAuth
- Advanced OAuth settings: User-Defined OAuth Client
- OAuth client ID / secret: จากขั้นตอนที่ 1
- Token endpoint auth method: client_secret_basic
- Scopes: meals.write

OAuth endpoints, resource และ PKCE จะถูกค้นพบอัตโนมัติ:

- Auth URL: https://daily-fuel-inky.vercel.app/oauth/authorize
- Token URL: https://daily-fuel-inky.vercel.app/oauth/token
- Authorization server base / issuer: https://daily-fuel-inky.vercel.app
- Resource: https://daily-fuel-inky.vercel.app/mcp
- PKCE: S256
- ไม่ใช้ OIDC หรือ DCR/CIMD ในการเชื่อมแบบนี้

ตรวจข้อมูลแล้วคุณเป็นคนกดยืนยันการสร้าง/เชื่อม Plugin และล็อกอิน Daily Fuel ของตัวเอง

## 3. ผูกนิวกับเบ้น

ใช้บัญชีกลาง Daily Fuel บัญชีเดียวที่มีโปรไฟล์นิวและเบ้น เปิด https://daily-fuel-inky.vercel.app/gpt เลือก Client ของ Plugin แล้วติ๊ก “อนุญาต Plugin ใช้ทั้งสองโปรไฟล์ในบัญชีนี้” และกด “บันทึกสิทธิ์นิวและเบ้น” หนึ่งครั้ง ไม่ต้องล็อกอินหรือขออนุญาตอีกบัญชี

การเชื่อม OAuth ครั้งแรกจะมีช่องอนุญาตทั้งสองโปรไฟล์เช่นกัน มื้อใหม่อยู่ในบัญชีกลางและแยกตามโปรไฟล์ ข้อมูลเดิมในบัญชีอื่นไม่ถูกย้ายหรือรวมอัตโนมัติ GPT Actions เดิมยังแสดงแยกไว้

## 4. ลองใช้ในแชตเดียว

ติดตั้ง/เปิดใช้ Plugin จากนั้นเริ่มแชตและเลือก @Daily Fuel ให้เรียก getMealRecipients เพื่อตรวจว่ามีทั้งนิวและเบ้น

ตัวอย่าง: "ช่วยเตรียมมื้อเช้าของเบ้นกับนิวให้ตรวจ เบ้นกินข้าว 200 g นิวยังเหมือนกันแต่ข้าว 120 g ส่วนเนื้อเท่ากัน"

Plugin จะสรุปต่อคนและให้ลิงก์ตรวจรายการบน Daily Fuel คุณเปิดลิงก์ด้วยบัญชีเดียวกับที่เชื่อม Plugin แล้วกด **ยืนยันบันทึกทั้ง 2 คน** หนึ่งครั้ง จึงเพิ่มมื้อทั้งคู่ในธุรกรรมเดียว จากนั้นกลับแชตบอก "ยืนยันแล้ว" เพื่อให้ getMealBatchStatus ตรวจใบรับ

การเตรียมหรือถามสถานะอย่างเดียวไม่เพิ่มแคลอรี โมเดลไม่สามารถอนุมัติแทนการกดบนเว็บได้ คำขอ UUID เดิมและ draft เดิมซ้ำจะไม่เพิ่มมื้อซ้ำ ยอดและเป้าหมายยังแยกตามโปรไฟล์ในบัญชีกลาง

## การเชื่อมต่อและสิทธิ์

เปลี่ยน/ยกเลิกสิทธิ์ได้จากหน้า Daily Fuel Plugin บันทึกที่ทำแล้วอยู่ใน Food diary ของเจ้าของ การยกเลิกไม่ลบประวัติ

MCP ใช้ stateless Streamable HTTP, OAuth discovery, exact callback, issuer identification, mandatory S256 และ resource-bound opaque tokens Token นี้ใช้กับ MCP ของ Daily Fuel เท่านั้น ไม่ใช่ Supabase session และไม่ใช้เปิด diary/goals/weights โดยตรง

API และระบบ idempotency เดิมใช้ต่ออยู่ การบันทึกจริงสำหรับ MCP ต้องผ่านหน้า review ด้วย Supabase session ของเจ้าของรายการ จึงไม่อาศัย tool approval hints เพียงอย่างเดียว

อ้างอิง: https://developers.openai.com/plugins/build/auth และ https://developers.openai.com/plugins/deploy/connect-chatgpt
