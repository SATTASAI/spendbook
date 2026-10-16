# สมุดรายจ่าย (spendbook)

แอปบันทึกรายรับรายจ่ายบน Cloudflare Worker + D1 ติดตั้งบน iPhone เป็นแอปหน้าจอโฮม
รับ SMS ธนาคารและสลิปผ่านแอปคำสั่งลัด (Shortcuts)

- ฐานข้อมูล `spendbook-db` สร้างไว้แล้วใน Cloudflare (มีตารางครบ)
- ไฟล์ที่ต้องนำขึ้นมีไฟล์เดียว: `dist/worker.js`

## นำขึ้นออนไลน์ (ทำครั้งเดียว)

### วิธี A: จากคอมพิวเตอร์ (แนะนำ)

ในโฟลเดอร์นี้:

```bash
npx wrangler deploy
npx wrangler secret put APP_KEY
```

คำสั่งที่สองจะให้พิมพ์รหัสแอป ตั้งเป็นรหัสยาวๆ ที่เดายาก (อย่างน้อย 16 ตัว) แล้วจดไว้
เสร็จแล้วจะได้ที่อยู่แบบ `https://spendbook.<ชื่อบัญชี>.workers.dev`

### วิธี B: ผ่านหน้าเว็บ Cloudflare

1. Workers & Pages → Create → Start with Hello World → ตั้งชื่อ `spendbook` → Deploy
2. Edit code → ลบโค้ดเดิม วางเนื้อหา `dist/worker.js` ทั้งไฟล์ → Deploy
3. Settings → Bindings → Add → D1 database → Variable name `DB` → เลือก `spendbook-db`
4. Settings → Variables and Secrets → Add → Type: Secret → Name `APP_KEY` → ใส่รหัสแอป

## ใช้งานบน iPhone

1. เปิดที่อยู่ของแอปใน Safari → ใส่รหัสแอป
2. แชร์ → เพิ่มไปยังหน้าจอโฮม
3. ในแอป แตะ ⚙︎ → ทำตามขั้นตอนตั้งคำสั่งลัด (มี URL และรหัสให้คัดลอก)

## API

ทุกเส้นทางใต้ `/api/` ต้องมีส่วนหัว `Authorization: Bearer <APP_KEY>`

| เส้นทาง | ใช้ทำอะไร |
|---|---|
| `POST /api/capture` | `{text, source: "sms"\|"slip", sender?}` อ่านข้อความแล้วบันทึก ตอบ `{status, message}` |
| `GET /api/data` | รายการ แพ็กเกจ และค่าตั้ง |
| `POST/PUT/DELETE /api/expenses[/id]` | เพิ่ม/แก้/ลบรายการ |
| `POST/PATCH/DELETE /api/subs[/id]` | แพ็กเกจรายเดือน |
| `PUT /api/settings` | เช่น `{budget: 15000}` |
| `POST /api/import` | นำเข้า JSON จากสมุดรายจ่ายเดิม |

## แก้โค้ด

ต้นฉบับอยู่ใน `src/` (`parse.js` ตัวอ่าน SMS/สลิป, `worker.js`, `app.html`)
แก้แล้วรัน `python3 scripts/build.py` เพื่อสร้าง `dist/worker.js` ใหม่
ทดสอบ: `node test/parse.test.mjs` และ `node --experimental-sqlite test/worker.test.mjs`
