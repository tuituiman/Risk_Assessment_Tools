# 🛡️ IRA Assistant: ระบบประเมินความเสี่ยงเหตุการณ์ฉุกเฉินทางสาธารณสุข
### (Initial Risk Assessment for Acute Public Health Events - WHO Standard)

ระบบประเมินความเสี่ยงเหตุการณ์ฉุกเฉินทางสาธารณสุขเบื้องต้น พัฒนาตามแนวทาง **WHO Initial Risk Assessment (IRA) Algorithm** พร้อมระบบเขียนบทบรรยายสรุปสถานการณ์อัตโนมัติด้วย **Typhoon AI API** และการจัดเก็บข้อมูลตรวจสอบย้อนหลังลง **Google Sheets (Audit Trail)**

---

## 🌟 คุณสมบัติเด่น (Features)

1. **WHO IRA Decision Engine (5 Domains):**
   - คำนวณตรรกะแบบต้นไม้การตัดสินใจตามเกณฑ์มาตรฐานขององค์การอนามัยโลก (WHO) และกรมควบคุมโรค (หน้า 26–40)
   - ครอบคลุมทั้ง 5 มิติ: 
     - **Domain 1:** ภัยคุกคามระดับสูง (High Threat Hazard)
     - **Domain 2:** การสัมผัสต่อเนื่อง (Exposure)
     - **Domain 3:** ความรุนแรงทางคลินิก (Severity & CFR)
     - **Domain 4:** ศักยภาพการแพร่กระจาย (Spread Potential)
     - **Domain 5:** ศักยภาพการควบคุมและความเสี่ยงระบบสุขภาพล่ม (Capacity & Overwhelmed)
   - แสดงผลลัพธ์เป็น 5 ระดับความเสี่ยง (**ต่ำมาก, ต่ำ, ปานกลาง, สูง, สูงมาก**) พร้อมข้อเสนอแนะมาตรการเชิงบริหารจัดการทันที

2. **🌪️ Typhoon AI Narrative Summary Generator:**
   - เชื่อมต่อกับ LLM ภาษาไทยขนาดใหญ่จาก SCB 10X (Typhoon AI)
   - สรุปสถานการณ์เป็นรายงานทางการแพทย์และระบาดวิทยา 3 ย่อหน้าอย่างถูกต้องตามหลักวิชาการ
   - มีโหมดจำลองสถานการณ์ (Simulation) ใช้งานได้ทันทีแม้ยังไม่มี API Key

3. **📊 Google Sheets Audit Trail Integration:**
   - บันทึกประวัติการตัดสินใจและคำตอบทั้ง 5 มิติลง Google Sheets ผ่าน Google Apps Script Web App
   - มีระบบบันทึกประวัติภายในเครื่อง (LocalStorage) และปุ่มดาวน์โหลดไฟล์ CSV ในตัว

4. **🧪 Preset Outbreak Case Study:**
   - ปุ่มลัด **"ตัวอย่างเคสอู่ฮั่น"** จำลองข้อมูลการระบาดของโรคปอดอักเสบสายพันธุ์ใหม่ (อู่ฮั่น ม.ค. 2563 จากหน้า 64–67) เพื่อการสาธิตและทดสอบระบบได้ใน 1 คลิก

5. **📱 Responsive Medical Dashboard:**
   - ออกแบบด้วย Vanilla CSS ดีไซน์ระดับพรีเมียม (Dark Medical Theme + Glassmorphism)
   - รองรับทุกขนาดหน้าจอ ทั้งมือถือ (Mobile), แท็บเล็ต (Tablet) และคอมพิวเตอร์ (PC)

---

## 🚀 วิธีการเปิดใช้งาน (How to Run)

เปิดผ่านเว็บเซิร์ฟเวอร์แบบเบา เช่น:
```bash
# ใช้ Python HTTP Server (เปิดที่พอร์ต 3000)
python -m http.server 3000
```
จากนั้นเปิดเบราว์เซอร์ไปที่: `http://localhost:3000`

---

## ⚙️ การตั้งค่าการเชื่อมต่อ (Settings)

กดที่ปุ่ม **"⚙️ ตั้งค่า API & ชีต"** ที่แถบด้านบนของเว็บ:

### 1. การเชื่อมต่อ Typhoon AI API
1. สมัครรับ API Key ได้ที่ [opentyphoon.ai](https://opentyphoon.ai)
2. นำ API Key มาใส่ในช่อง `Typhoon AI API Key`
3. เลือกรุ่นโมเดล เช่น `typhoon-v1.5x-70b-instruct` หรือ `typhoon-v2-70b-instruct`
4. กดบันทึก

### 2. การเชื่อมต่อ Google Sheets (Audit Trail)
1. เปิด Google Sheet ที่ต้องการเก็บข้อมูล
2. ไปที่เมนู **ส่วนขยาย (Extensions)** > **Apps Script**
3. คัดลอกโค้ดจากไฟล์ `google_apps_script.js` ไปวางแล้วกดบันทึก
4. กดปุ่ม **การทำให้ใช้งานได้ (Deploy)** > **การทำให้ใช้งานได้รายการใหม่ (New deployment)**
5. เลือกประเภท **เว็บแอป (Web app)**:
   - ผู้มีสิทธิ์เข้าถึง (Who has access): **ทุกคน (Anyone)** *(สำคัญมาก)*
6. คัดลอก Web App URL (ลงท้ายด้วย `/exec`) มาใส่ในหน้าต่างตั้งค่าของระบบ
