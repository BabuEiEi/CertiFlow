# Deployment Guide & Script Properties Setup

เอกสารนี้อธิบายขั้นตอนการตั้งค่าการพัฒนาและ Deploy โครงการ **CertiFlow** ด้วย `clasp` และการตั้งค่า Script Properties บน Google Apps Script

---

## 1. สิ่งที่ต้องเตรียมก่อนเริ่มต้น (Prerequisites)

1. ติดตั้ง **clasp** (Google Apps Script CLI) แบบ Global:
   ```bash
   npm install -g @google/clasp
   ```
2. บัญชี Google Account ที่มีสิทธิ์สร้าง/เข้าถึง Google Sheets, Google Drive และ Google Slides
3. เปิดใช้งาน **Google Apps Script API** ใน [Google Apps Script Settings](https://script.google.com/home/usersettings) (สวิตช์เปิดเป็น ON)

---

## 2. ขั้นตอนการผูกและจัดการโครงการด้วย clasp

### 2.1 เข้าสู่ระบบ (Login)
```bash
clasp login
```

### 2.2 สร้างสคริปต์ใหม่ หรือ ผูกกับสคริปต์เดิม

**กรณีที่ 1: สร้างโครงการ Google Apps Script ใหม่จาก command line**
> *หมายเหตุ:* ใช้ `--type standalone` (`webapp` ไม่ใช่ประเภทคอนเทนเนอร์ของ `clasp create` แต่สคริปต์แบบ `standalone` สามารถนำไป deploy เป็น Web App ได้)
```bash
clasp create --title "CertiFlow" --type standalone
```

**กรณีที่ 2: มีสคริปต์เดิมที่สร้างไว้ล่วงหน้าแล้วบน Google Drive**
ให้คัดลอก `scriptId` จาก URL ของ Apps Script Editor แล้วสร้างไฟล์ `.clasp.json` (อ้างอิงจาก `.clasp.example.json`):
```json
{
  "scriptId": "YOUR_SCRIPT_ID_HERE",
  "rootDir": "."
}
```

### 2.3 อัปโหลดไฟล์ไปยัง Google Apps Script (Push)
```bash
clasp push
```

### 2.4 การสร้าง Web App Deployment
1. สร้าง Deployment ใหม่:
   ```bash
   clasp deploy --description "CertiFlow Production Deployment"
   ```
2. หรือไปที่ Google Apps Script Editor > **Deploy** > **New deployment**
   - **Select type:** Web app
   - **Execute as:** `Me` (หรือ `User deploying`)
   - **Who has access:** `Anyone` รวมผู้ใช้ที่ไม่ลงชื่อเข้าใช้ (`ANYONE_ANONYMOUS`)

Public Search และ Management Mode ใช้ deployment เดียวกันได้ โดย Management Mode ตรวจ `userId`, รหัสผ่าน และ session token ภายในระบบ ไม่พึ่ง Google Account ของผู้เข้าชม

### 2.5 สร้าง ADMIN คนแรก

1. รัน `setupDatabase()` เพื่อสร้างและปรับ schema ของชีต
2. ตั้ง Script Properties ชั่วคราว:
   - `BOOTSTRAP_ADMIN_USER_ID` เช่น `admin` หรือ `admin@info.com` (เป็นเพียงชื่อผู้ใช้ ไม่จำเป็นต้องเป็นอีเมลจริง)
   - `BOOTSTRAP_ADMIN_PASSWORD` รหัสผ่านอย่างน้อย 8 ตัวอักษร
   - `BOOTSTRAP_ADMIN_NAME` ชื่อผู้ดูแล (ไม่บังคับ)
3. รัน `bootstrapAdmin()` หนึ่งครั้งจาก Apps Script Editor
4. ระบบจะลบ `BOOTSTRAP_ADMIN_PASSWORD` ออกจาก Script Properties หลังสร้างบัญชีสำเร็จ
5. เปิด `?page=dashboard` และล็อกอินด้วย userId/rหัสผ่านที่กำหนด

---

## 3. การตั้งค่า Script Properties (การจัดการ Secrets/IDs)

ห้าม hard-code `DATABASE_SPREADSHEET_ID`, `TEMPLATE_FOLDER_ID`, หรือ `TEMP_FOLDER_ID` ไว้ในไฟล์ `.gs` หรือ commit ขึ้น git โดยเด็ดขาด ให้ตั้งค่าใน **Project Settings > Script Properties** บน Apps Script Editor

| Script Property Key | คำอธิบาย | ตัวอย่างค่า |
|---|---|---|
| `DATABASE_SPREADSHEET_ID` | ID ของไฟล์ Google Sheets ฐานข้อมูลหลัก | `1A2B3C4D5E6F7G8H9I0J` |
| `TEMPLATE_FOLDER_ID` | ID ของโฟลเดอร์ Google Drive เก็บ Google Slides Templates | `1X2Y3Z...` |
| `TEMP_FOLDER_ID` | ID ของโฟลเดอร์ Google Drive เก็บไฟล์ชั่วคราว | `1M2N3O...` |
| `WEB_APP_URL` | URL ของ Web App หลัง Deploy (ใช้สร้าง Verification QR Code) | `https://script.google.com/macros/s/.../exec` |
| `SYSTEM_NAME` | ชื่อระบบที่แสดงบนหน้าเว็บ | `CertiFlow` |
| `ORGANIZATION` | ชื่อหน่วยงาน/สถานศึกษา | `สำนักงานเขตพื้นที่การศึกษา...` |
| `DEFAULT_TIMEZONE` | เขตเวลาของระบบ | `Asia/Bangkok` |

---

## 4. Scopes และสิทธิ์การใช้งาน (OAuth Scopes)

ไฟล์ `appsscript.json` กำหนด Scopes เท่าที่จำเป็นต่อการทำงานของระบบ ได้แก่:
- `https://www.googleapis.com/auth/spreadsheets` (เข้าถึง Google Sheets ฐานข้อมูล)
- `https://www.googleapis.com/auth/drive` (คัดลอก/ลบ temporary files ใน Drive)
- `https://www.googleapis.com/auth/presentations` (อ่านและแก้ไข Slide template ชั่วคราว)
- `https://www.googleapis.com/auth/script.external_request` (การร้องขอภายนอก)

ระบบไม่ต้องใช้ scope `userinfo.email` เนื่องจาก Management Mode ใช้บัญชีภายใน Users sheet
