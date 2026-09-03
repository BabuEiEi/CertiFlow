# Certificate Management System (GAS)

ระบบสร้าง ค้นหา ตรวจสอบ และดาวน์โหลดเกียรติบัตรออนไลน์ สำหรับหลายกิจกรรม โดยใช้ Google Workspace เป็นแกนหลัก

> เอกสารนี้เป็นทั้งข้อกำหนดโครงการ (project specification) และคู่มือสั่งงาน AI Agent ใน VS Code ให้พัฒนาทีละ Phase อย่างเป็นลำดับ

---

## 1. วัตถุประสงค์

ระบบรองรับการบริหารเกียรติบัตรตั้งแต่สร้างกิจกรรม นำเข้ารายชื่อ กำหนดเลขที่เกียรติบัตร ค้นหา ตรวจสอบผ่าน QR Code และดาวน์โหลดไฟล์ โดยมุ่งให้ใช้งานได้จริงในระดับหน่วยงานการศึกษา

ความสามารถหลัก

1. ผู้ดูแลสร้างและตั้งค่ากิจกรรม รวมถึง Google Slides template
2. Admin/Staff นำเข้ารายชื่อและตรวจข้อมูลซ้ำก่อนบันทึก
3. ระบบกำหนด `certificateId` และเลขที่เกียรติบัตรที่ไม่ซ้ำ
4. สาธารณชนค้นหาจากชื่อ นามสกุล โรงเรียน หรือเลขที่เกียรติบัตรได้โดยไม่ต้องเข้าสู่ระบบ
5. ระบบแสดงตัวอย่างและดาวน์โหลด PDF/JPEG แบบ on demand
6. QR Code นำไปสู่หน้าตรวจสอบความถูกต้องของเกียรติบัตร
7. Admin/Staff แก้ไขข้อมูล ออกใหม่ หรือยกเลิกเกียรติบัตรได้ พร้อม Audit Log
8. หน้า Public Search นำไปฝัง (Embed) ใน Google Sites ได้
9. ผู้มีสิทธิ์สลับระหว่าง Public Mode และ Management Mode ได้จากปุ่มด้านขวาบน

### ขอบเขตที่ต้องยึด

- ใช้ HTML5, Tailwind CSS และ Vanilla JavaScript เท่านั้น: **ไม่ใช้ React, Vue หรือ TypeScript**
- ใช้ Google Apps Script เป็น Web App, backend และ API
- ใช้ Google Sheets เป็นฐานข้อมูล และ Google Drive เก็บ template/asset ของระบบ
- 1 กิจกรรมต่อ 1 Google Slides template (slide หลัก 1 หน้า)
- Dynamic field บน template มีเพียง `{{name}}` และ `{{certNo}}`
- PDF/JPEG ที่ผู้ใช้ดาวน์โหลดสร้างแบบชั่วคราว แล้วลบไฟล์/สำเนาชั่วคราวทันทีหลังส่งกลับ: **ห้ามเก็บไฟล์เกียรติบัตรที่สร้างแล้วเป็นคลังถาวรใน Drive**

---

## 2. Technology Stack

| ส่วน | เทคโนโลยี | หน้าที่ |
|---|---|---|
| Frontend | HTML5, Tailwind CSS, Vanilla JavaScript | UI, การค้นหา, dashboard, ฟอร์มจัดการ |
| Backend | Google Apps Script (GAS) | Web App, API, authorization, business logic |
| Database | Google Sheets | ข้อมูลกิจกรรม ผู้ใช้ ผู้เข้าร่วม เกียรติบัตร และ log |
| Storage | Google Drive | Google Slides template, โลโก้ ลายเซ็น พื้นหลัง และไฟล์ประกอบ |
| Template | Google Slides | แม่แบบเกียรติบัตรต่อกิจกรรม |
| PDF | Google Slides → PDF | ส่งออก PDF จากสำเนา slide ชั่วคราว |
| Image/Preview | Slides thumbnail/export → JPEG | สร้างภาพตัวอย่าง/ดาวน์โหลด JPEG ชั่วคราว |
| Authentication | userId/password + Users sheet | ตรวจ credential, session token และ role ของ Admin/Staff |
| Public site | GAS Web App | หน้าค้นหาและหน้าตรวจสอบ |
| Main website | Google Sites | เว็บไซต์หลักที่ Embed หน้าค้นหาสาธารณะ |
| QR | Verification URL | ลิงก์ไปยังข้อมูลยืนยันของ `certificateId` |

---

## 3. สถาปัตยกรรมระบบ

```text
Google Sites (เว็บไซต์หลัก)
        │ Embed URL
        ▼
GAS Web App ───────────────┐
│ Public: search / verify  │
│ Management: admin/staff  │
└───────────┬──────────────┘
            ▼
Google Apps Script services
├─ Authentication & authorization
├─ Sheets repository / registry
├─ Certificate number service
├─ Search & verification service
├─ Template validation service
├─ Temporary PDF/JPEG generation service
└─ Audit log service
      │                     │
      ▼                     ▼
Google Sheets          Google Drive / Google Slides
Database               Templates and temporary copies only
```

### โหมดการใช้งาน

| โหมด | ผู้ใช้ | สิทธิ์ |
|---|---|---|
| Public Mode | ทุกคน | ค้นหา ดูตัวอย่าง ดาวน์โหลด ตรวจสอบ และแจ้งข้อมูลไม่ถูกต้อง |
| Management Mode | ADMIN / STAFF | ล็อกอินด้วย userId/รหัสผ่านและทำงานตามสิทธิ์ใน Users sheet |

Public mode เป็นค่าเริ่มต้น และห้ามแสดงคำสั่งแก้ไข/ยกเลิก/ลบต่อสาธารณะ

---

## 4. บทบาทและสิทธิ์

| ความสามารถ | ADMIN | STAFF | Public |
|---|:---:|:---:|:---:|
| ดู dashboard / กิจกรรม | ✓ | ✓ | – |
| สร้าง แก้ไข หรือลบกิจกรรม | ✓ | ดูอย่างเดียว | – |
| ตั้งค่า template | ✓ | – | – |
| นำเข้า/แก้ไขผู้เข้าร่วม | ✓ | ✓ | – |
| กำหนดเลขเกียรติบัตร | ✓ | ✓ | – |
| ดูตัวอย่าง/ดาวน์โหลด | ✓ | ✓ | ✓ |
| แก้ไขข้อมูลเกียรติบัตร | ✓ | ✓ | – |
| ออกใหม่/ยกเลิก (revoke) | ✓ | ✓ | – |
| ลบถาวร | ✓ | – | – |
| จัดการ Users / Settings | ✓ | – | – |
| ดู Audit Logs | ✓ | – | – |

ให้ใช้ `REVOKED` แทนการลบเมื่อเกียรติบัตรเคยออกให้ผู้รับแล้ว และแสดงผลอย่างชัดเจนในหน้า Verify

---

## 5. โครงสร้างฐานข้อมูล Google Sheets

สร้าง Spreadsheet หลัก 1 ไฟล์ เช่น `Certificate_System_DB` และมี Sheet ต่อไปนี้

```text
Settings
Activities
Users
Participants
Certificates
GenerationQueue
AuditLogs
```

> `Certificates` คือ registry กลางของเกียรติบัตร ใช้สำหรับค้นหาและตรวจสอบโดยไม่ต้องไล่อ่านข้อมูลทุกกิจกรรม ส่วน `Participants` เก็บข้อมูลรายชื่อที่นำเข้าและสถานะการเข้าร่วม

### 5.1 Settings

```text
key | value | description | updatedAt | updatedBy
```

ค่าที่ควรมี

```text
SYSTEM_NAME
ORGANIZATION
WEB_APP_URL
DATABASE_SPREADSHEET_ID
TEMPLATE_FOLDER_ID
TEMP_FOLDER_ID
DEFAULT_TIMEZONE
```

### 5.2 Activities

```text
activityId | sequence | activityName | organizer | issueAgency | startDate | endDate |
issueDate | prefixText | prefix | startNumber | endNumber | digitLength | separator |
year | numberFormat | templateId | status | createdBy | createdAt | updatedBy | updatedAt
```

ค่าที่กำหนดได้

```text
status: DRAFT | ACTIVE | CLOSED
numberFormat: THAI | ARABIC
```

### 5.3 Users

```text
userId | email | name | role | status | passwordSalt | passwordHash | createdAt | updatedAt | lastLogin
```

`userId` เป็นชื่อสำหรับเข้าสู่ระบบและอาจใช้รูปแบบคล้ายอีเมล เช่น `admin@info.com` ได้โดยไม่จำเป็นต้องเป็นอีเมลจริง ส่วน `email` เป็นข้อมูลประกอบที่ไม่ใช้ยืนยันตัวตน รหัสผ่านจริงไม่ถูกบันทึกลงชีต

```text
role: ADMIN | STAFF
status: ACTIVE | INACTIVE
```

### 5.4 Participants

```text
participantId | activityId | prefixName | firstName | lastName | school |
participantStatus | importBatchId | sourceRow | createdAt | createdBy | updatedAt | updatedBy
```

```text
participantStatus: เข้าร่วม | ผ่านการอบรม
```

### 5.5 Certificates

```text
certificateId | activityId | participantId | certificateNo | runningNumber |
prefixName | firstName | lastName | school | participantStatus | certificateStatus |
originalPrefixName | originalFirstName | originalLastName |
issuedAt | issuedBy | revokedAt | revokedBy | revokeReason |
createdAt | createdBy | updatedAt | updatedBy
```

```text
certificateStatus: DRAFT | PENDING | ISSUED | REVOKED | DELETED
```

**หลักการสำคัญ**

- `certificateId` เป็น primary key ที่ไม่เปลี่ยน เช่น `CERT-ACT001-000001`
- `certificateNo` คือเลขที่แสดงบนใบ ซึ่งอาจมีข้อความนำหน้า/เลขไทย จึงไม่ควรเป็น primary key
- ไม่เก็บ `pdfFileId`, `jpegFileId`, หรือ URL ไฟล์ถาวร เพราะไฟล์ผลลัพธ์สร้างชั่วคราวเท่านั้น

### 5.6 GenerationQueue

ใช้เฉพาะกรณีสร้าง preview หรือออกเอกสารเป็นชุด เพื่อป้องกัน Apps Script timeout

```text
queueId | activityId | jobType | startRow | endRow | currentRow | totalCount |
successCount | failCount | status | retryCount | lastError | createdAt | updatedAt
```

```text
jobType: ASSIGN_NUMBER | PREVIEW_BATCH | EXPORT_BATCH
status: WAITING | RUNNING | DONE | FAILED | CANCELLED
```

### 5.7 AuditLogs

```text
logId | action | entityType | entityId | actorEmail | actorRole |
beforeJson | afterJson | note | createdAt
```

ตัวอย่าง action: `CREATE_ACTIVITY`, `IMPORT_PARTICIPANTS`, `ASSIGN_NUMBER`, `UPDATE_NAME`, `ISSUE_CERTIFICATE`, `REVOKE_CERTIFICATE`, `DELETE_CERTIFICATE`

---

## 6. หลักเกณฑ์เลขที่เกียรติบัตรและชื่อ

### Certificate ID

```text
CERT-{activityId}-{sixDigitSequence}
เช่น CERT-ACT001-000001
```

### Certificate Number

ข้อมูลมาจาก `Activities` ได้แก่ `prefixText`, `prefix`, `runningNumber`, `separator`, `year`, `numberFormat`

```text
prefixText = เลขที่
prefix = สพม.พลอต
runningNumber = 2221
separator = /
year = 2569
```

ผลลัพธ์

```text
ARABIC: เลขที่ สพม.พลอต 2221/2569
THAI:   เลขที่ สพม.พลอต ๒๒๒๑/๒๕๖๙
```

ต้องใช้ LockService ระหว่างการกำหนดเลข เพื่อป้องกันเลขซ้ำเมื่อมีผู้ใช้งานพร้อมกัน และต้องตรวจซ้ำใน Certificates ก่อนบันทึกทุกครั้ง

### Name generator

ฟิลด์ `{{name}}` สร้างจาก

```text
prefixName + firstName + " " + lastName
```

ตัวอย่าง: `นาย` + `ภัทรพล` + `แก้วเสนา` → `นายภัทรพล แก้วเสนา`

---

## 7. Google Slides Template

หนึ่งกิจกรรมใช้ Google Slides template หนึ่งไฟล์ โดยมี slide หลักเพียงหน้าเดียว และกำหนด dynamic placeholders แค่สองจุด

```text
{{name}}
{{certNo}}
```

รูปแบบตำแหน่งที่ต้องใช้

```text
┌──────────────────────────────────────────────────────────┐
│                                                [ CERT NO ] │
│                                                          │
│                         Logo                             │
│                      เกียรติบัตร                        │
│                                                          │
│                       ขอแสดงว่า                          │
│                                                          │
│                      [ NAME ]                            │
│                                                          │
│             ได้ผ่านการอบรม........................       │
│                                                          │
│                                                          │
│                    ลงชื่อ................                │
└──────────────────────────────────────────────────────────┘
```

| Placeholder | ตำแหน่ง | การจัดข้อความ |
|---|---|---|
| `{{certNo}}` | มุมขวาบน | RIGHT |
| `{{name}}` | ช่วงกึ่งกลางแนวนอน | CENTER |

Template สามารถมี background, logo, ลายเซ็น และข้อความคงที่ได้ แต่ไม่ควรเพิ่ม placeholder อื่นโดยไม่จำเป็น

### การตรวจ Template

ก่อนผูกกับกิจกรรม ระบบต้อง

1. ตรวจว่า `templateId` เข้าถึงได้และเป็น Google Slides
2. ตรวจว่ามี slide อย่างน้อยหนึ่งหน้า
3. ค้นหา `{{name}}` และ `{{certNo}}` ทั้งสองค่า
4. แจ้ง error แบบชัดเจนหาก placeholder หาย หรือมีซ้ำมากกว่าที่ออกแบบไว้
5. มีปุ่ม `Preview Template` สำหรับทดสอบด้วยข้อมูลจำลอง

---

## 8. กระบวนการสร้าง Preview / PDF / JPEG

```text
ค้นหาหรือเลือก Certificate
        ↓
อ่านข้อมูลจาก Certificates + Activities
        ↓
คัดลอก Google Slides template ไปยัง TEMP_FOLDER_ID
        ↓
แทน {{name}} และ {{certNo}}
        ↓
สร้าง preview หรือ export เป็น PDF/JPEG
        ↓
ส่ง Blob/URL ชั่วคราวให้ browser
        ↓
ลบสำเนา slide และไฟล์ชั่วคราวเสมอ (finally)
```

ข้อกำหนด

- ห้ามแก้ไข template ต้นฉบับ
- ตั้งชื่อไฟล์ชั่วคราวด้วย `certificateId` และสุ่ม nonce เพื่อไม่ชนกัน
- ใช้ `try/finally` สำหรับลบ temporary slide/ไฟล์ แม้ export ล้มเหลว
- Preview และดาวน์โหลดต้องตรวจ `certificateStatus`; ถ้า `REVOKED` ห้ามออกไฟล์ใหม่
- หากต้องประมวลผลชุดใหญ่ ให้แบ่ง batch (เช่น 25 รายการต่อครั้ง) และบันทึก progress ใน `GenerationQueue`

---

## 9. Public Website

### 9.1 หน้า Search (ค่าเริ่มต้น หรือ `?page=search`)

ฟอร์มค้นหา

```text
กิจกรรม        [ Dropdown ]
ค้นหา          [ ชื่อ / นามสกุล / ชื่อ-นามสกุล / โรงเรียน / เลขที่เกียรติบัตร ]
               [ ค้นหา ]
```

Search logic ต้อง

- ตัด whitespace หัวท้าย และ normalize ช่องว่างซ้ำ
- ค้นหาแบบ partial match
- ไม่สนตัวพิมพ์เล็กใหญ่สำหรับข้อมูลภาษาอังกฤษ
- รองรับชื่อ, นามสกุล, ชื่อเต็ม, โรงเรียน และ `certificateNo`
- ไม่แสดงข้อมูลเกินจำเป็น เช่น อีเมลหรือประวัติการแก้ไข

ผลลัพธ์แสดงเป็น card

```text
เกียรติบัตรของ: นายภัทรพล แก้วเสนา
กิจกรรม: อบรมเชิงปฏิบัติการสร้างข้อสอบ PISA
เลขที่: เลขที่ สพม.พลอต ๒๒๒๑/๒๕๖๙
วันที่ออก: 31 สิงหาคม 2569
หน่วยงานที่ออก: กลุ่มนิเทศ ติดตาม และประเมินผลการจัดการศึกษา

[ ดูตัวอย่าง ] [ ดาวน์โหลด PDF ] [ ดาวน์โหลด JPEG ]
[ แจ้งข้อมูลไม่ถูกต้อง ]
```

### 9.2 หน้า Verify (`?page=verify&id=CERTIFICATE_ID`)

QR Code ต้องบรรจุเพียง URL ที่มี `certificateId` เช่น

```text
https://script.google.com/macros/s/DEPLOYMENT_ID/exec?page=verify&id=CERT-ACT001-000001
```

ห้ามใส่ชื่อ โรงเรียน หรือข้อมูลส่วนบุคคลลงใน QR โดยตรง

หน้าตรวจสอบต้องแสดงสถานะอย่างชัดเจน

```text
✓ เกียรติบัตรถูกต้อง / ออกแล้ว
หรือ
⚠ เกียรติบัตรฉบับนี้ถูกยกเลิก
หรือ
✕ ไม่พบข้อมูลเกียรติบัตร
```

### 9.3 การฝังใน Google Sites

Embed เฉพาะ Public Search URL ใน Google Sites ส่วน Management Mode ให้เปิดผ่าน URL ของ GAS Web App โดยตรง เพื่อไม่ให้ประสบปัญหา iframe และการรับรู้ตัวตนของผู้ใช้

---

## 10. Management Website

หน้าและความสามารถขั้นต่ำ

1. **Dashboard** — จำนวนกิจกรรม ผู้เข้าร่วม ออกแล้ว รอดำเนินการ ยกเลิก และตารางสรุปต่อกิจกรรม
2. **Activities** — สร้าง/แก้ไขกิจกรรม ตั้งค่าเลขที่และ template
3. **Participants** — นำเข้า CSV/XLSX, preview, validation, duplicate check และแก้ไขรายชื่อ
4. **Certificate Generator** — กำหนดเลขที่, สร้างคิว/batch และติดตาม progress
5. **Certificates** — ค้นหา ดูตัวอย่าง แก้ไข ออกใหม่ ยกเลิก และลบตาม role
6. **Users** — ADMIN เท่านั้น สำหรับเพิ่ม/ปิดใช้งานผู้ใช้และกำหนด role
7. **Settings / Audit Logs** — ADMIN เท่านั้น

### Import validation

รองรับ CSV และ XLSX (แปลง/อ่านข้อมูลก่อนบันทึก) โดยต้องแสดงผลก่อน import เช่น

```text
พบข้อมูล 200 รายการ
ถูกต้อง 198 | ผิดพลาด 2 | อาจซ้ำ 1
[ ยืนยันการนำเข้า ]
```

Duplicate detection ขั้นต่ำใช้คีย์ผสม

```text
activityId + firstName + lastName + school
```

---

## 11. API Contract ที่แนะนำ

ทุก response ใช้โครงสร้างเดียวกัน

```json
{
  "success": true,
  "data": {},
  "error": null,
  "requestId": "..."
}
```

### Public endpoints (`doGet`)

| action | พารามิเตอร์ | หน้าที่ |
|---|---|---|
| `activities` | – | อ่านกิจกรรมที่เปิดค้นหา |
| `search` | `activityId`, `q`, `page`, `pageSize` | ค้นหา registry |
| `verify` | `id` | ตรวจสถานะ certificate |
| `preview` | `id` | สร้าง preview ชั่วคราว |
| `download` | `id`, `format=pdf\|jpeg` | สร้างไฟล์ชั่วคราว |

### Management actions (`doPost` หรือ `google.script.run`)

```text
createActivity
updateActivity
validateTemplate
importParticipants
assignNumbers
createGenerationQueue
getGenerationProgress
updateCertificate
issueCertificate
issueCertificates
revokeCertificate
revokeCertificates
reissueCertificate
deleteCertificate
deleteCertificates
manageUser
getAuditLogs
```

ทุก management action ต้องตรวจ session token, userId, role, input validation และบันทึก Audit Log

---

## 12. โครงสร้างไฟล์ที่แนะนำ

```text
certificate-management-system/
├── appsscript.json
├── src/
│   ├── Code.gs                 # doGet/doPost และ entry point
│   ├── Config.gs               # keys/ค่าคงที่
│   ├── AuthService.gs          # ตรวจ user และ role
│   ├── SheetService.gs         # อ่าน/เขียน Sheets แบบ batch
│   ├── ActivityService.gs
│   ├── ParticipantService.gs
│   ├── CertificateService.gs
│   ├── NumberService.gs
│   ├── TemplateService.gs
│   ├── ExportService.gs        # temporary Slides/PDF/JPEG
│   ├── SearchService.gs
│   ├── QueueService.gs
│   ├── AuditService.gs
│   ├── Validation.gs
│   └── Utils.gs
├── web/
│   ├── Index.html
│   ├── Styles.html
│   ├── Scripts.html
│   └── partials/
│       ├── PublicSearch.html
│       ├── Verify.html
│       ├── Dashboard.html
│       ├── Activities.html
│       ├── Participants.html
│       ├── Certificates.html
│       └── Settings.html
├── tests/
│   ├── NumberService.test.js
│   ├── Validation.test.js
│   └── fixtures/
├── docs/
│   ├── sheet-schema.md
│   ├── deployment.md
│   └── template-guide.md
└── README.md
```

ใช้ `clasp` เพื่อ sync source จาก VS Code ไปยัง Apps Script แต่ไม่ commit `.clasp.json` หากไฟล์มี `scriptId` หรือข้อมูลเฉพาะ environment โดยไม่จำเป็น

---

## 13. Security และความน่าเชื่อถือ

1. Public endpoint ส่งเฉพาะข้อมูลที่จำเป็นต่อการยืนยันและแสดงผล
2. ห้ามมี API key หรือ secret ใน JavaScript ฝั่ง browser
3. ตรวจ role ทุกครั้งที่เรียก management action; ห้ามเชื่อ role ที่ client ส่งมา
4. sanitize/validate input ทุกชนิด โดยเฉพาะ query ค้นหา และข้อมูลนำเข้า
5. จำกัด `pageSize` ของ search และกันการเรียก export ซ้ำถี่เกินไป
6. ใช้ `LockService` ในการออกเลขและแก้ไข record สำคัญ
7. แก้ไขชื่อโดยเก็บค่าเดิมและค่าใหม่ พร้อมผู้แก้ไขและเวลา
8. ใช้ `REVOKED` เพื่อคงหลักฐาน; ลบถาวรได้เฉพาะ ADMIN และต้องบันทึก Audit Log
9. ล้าง temporary file ใน `finally` และตั้ง scheduled cleanup สำหรับไฟล์ค้าง
10. กำหนด sharing ของ template/temp folder เป็น restricted และ deploy public web app ให้เข้าถึงเฉพาะสิ่งที่ endpoint อนุญาต

---

## 14. เกณฑ์ยอมรับงาน (Acceptance Criteria)

- Admin สร้างกิจกรรมและบันทึก `templateId` ได้หลังผ่าน validation
- Template ที่ขาด `{{name}}` หรือ `{{certNo}}` ถูกปฏิเสธพร้อมข้อความอธิบาย
- Import แสดง preview, error และ duplicate ก่อนยืนยันบันทึก
- การกำหนดเลขพร้อมกันไม่ทำให้ `certificateId` หรือ `certificateNo` ซ้ำ
- Public user ค้นหาและตรวจ QR ได้โดยไม่ต้อง login
- Public user ไม่เห็นคำสั่งแก้ไข, revoke, delete หรือ Audit Log
- PDF/JPEG ที่ดาวน์โหลดมีชื่อและเลขที่ถูกต้อง และไม่มีไฟล์ผลลัพธ์คงอยู่ใน Drive หลังงานเสร็จ
- Certificate ที่ถูก revoke แสดงสถานะใน Verify และไม่อนุญาต export ใหม่
- ทุกการเปลี่ยนแปลงสำคัญสร้าง Audit Log
- Public Search URL ฝังใน Google Sites ได้ และ Management URL มี authorization ครบถ้วน

---

# 15. แผนดำเนินงานและ Prompts สำหรับ AI Agent ใน VS Code

## วิธีใช้

1. เริ่มจาก Phase 0 แล้วทำตามลำดับ
2. คัดลอก prompt ในแต่ละ step ไปส่ง AI Agent ใน VS Code ทีละกล่อง
3. ให้ Agent สรุปไฟล์ที่เปลี่ยน ผลทดสอบ และสิ่งที่ยังต้องตั้งค่าก่อนจบแต่ละ step
4. ตรวจและ commit งานก่อนเริ่ม phase ถัดไป
5. ห้ามให้ Agent เปลี่ยน technology stack หรือเพิ่ม dynamic placeholders โดยไม่ได้รับอนุมัติ

> Prompt ทุกชุดด้านล่างเป็นภาษาไทยเพื่อให้คัดลอกไปใช้งานได้โดยตรง

---

## Phase 0 — ตั้งค่าโครงการและกติกา

### Step 0.1: สำรวจและวางโครงสร้าง

```text
คุณเป็น Senior Google Apps Script Engineer ทำงานในโครงการ Certificate Management System

ข้อกำหนดที่ห้ามเปลี่ยน:
- Frontend: HTML5 + Tailwind CSS + Vanilla JavaScript เท่านั้น (ไม่ใช้ React/Vue/TypeScript)
- Backend: Google Apps Script
- Database: Google Sheets
- Storage: Google Drive เก็บเฉพาะ template และ asset ของระบบ
- Certificate template: Google Slides, 1 activity ต่อ 1 template, 1 slide หลัก
- Dynamic fields มีเพียง {{name}} และ {{certNo}}
- PDF/JPEG สร้างแบบ on demand และลบ temporary file/slide หลังส่งกลับ ห้ามเก็บไฟล์เกียรติบัตรถาวร

ให้สำรวจ repository ปัจจุบันก่อน แล้วสร้างหรือปรับโครงสร้างไฟล์ให้ตรงกับ README ส่วน “โครงสร้างไฟล์ที่แนะนำ” รวม appsscript.json, src/, web/, tests/, docs/ และ README ที่ไม่ซ้ำซ้อน
อย่าเขียน business logic ขนาดใหญ่ใน step นี้
เพิ่ม .gitignore ที่เหมาะกับ clasp และ secrets โดยไม่ลบไฟล์เดิม
สรุปไฟล์ที่สร้าง/แก้ไข และบอกคำสั่งทดสอบหรือ sync ที่ควรรัน
```

### Step 0.2: ตั้งค่า clasp และ environment

```text
ดำเนินการตั้งค่าโครงการ Google Apps Script สำหรับพัฒนาจาก VS Code โดยใช้ clasp
ให้สร้างเอกสาร docs/deployment.md อธิบายขั้นตอน login, create/bind script, push, deploy web app และการตั้ง Script Properties โดยไม่ใส่ค่า secret จริง
ให้สร้างตัวอย่าง .clasp.example.json และแนวทางเก็บ DATABASE_SPREADSHEET_ID, TEMPLATE_FOLDER_ID, TEMP_FOLDER_ID, WEB_APP_URL ใน Script Properties
ห้าม commit หรือ hard-code scriptId, spreadsheetId, URL จริง หรือข้อมูลลับ
ตรวจว่า appsscript.json มี scopes เท่าที่จำเป็นสำหรับ Spreadsheet, Drive, Slides และ web app
สรุปการเปลี่ยนแปลงและความตั้งค่าที่ผู้ดูแลต้องทำเองใน Google Workspace
```

---

## Phase 1 — Schema, Config และฐานข้อมูล

### Step 1.1: สร้าง schema และ bootstrap

```text
พัฒนาโมดูล Config.gs, SheetService.gs และ Validation.gs สำหรับ Certificate Management System
ให้กำหนด schema ของ Sheets: Settings, Activities, Users, Participants, Certificates, GenerationQueue และ AuditLogs ตาม README
สร้างฟังก์ชัน initializeDatabase() ที่สร้าง sheet ที่ขาด, ใส่ header ตามลำดับที่กำหนด, freeze header row และไม่เขียนทับข้อมูลเดิม
สร้าง helper อ่าน Script Properties และ validate ว่า DATABASE_SPREADSHEET_ID ตั้งค่าแล้ว
การอ่าน/เขียนต้องทำเป็น batch เมื่อทำได้ และคืน error ที่เข้าใจง่าย
เขียน unit tests สำหรับ schema/header และ validation หลักเท่าที่ทำได้ใน local test environment
ห้ามเขียนข้อมูลตัวอย่างลง production sheet โดยอัตโนมัติ
```

### Step 1.2: Repository และ Audit Log

```text
สร้าง repository/service layer สำหรับ Activities, Participants, Certificates, Users และ AuditLogs
กำหนด model และ validation ที่ชัดเจน ไม่ให้ UI เข้าถึง SpreadsheetApp โดยตรง
สร้าง AuditService.log(action, entityType, entityId, before, after, note) ที่บันทึก actorEmail/actorRole/server timestamp
ให้ beforeJson/afterJson ถูกตัด/ปกป้องข้อมูลอ่อนไหวตามความเหมาะสม
เพิ่ม helper สำหรับ pagination, lookup by ID และ duplicate check ของ participant โดยใช้ activityId + firstName + lastName + school
เขียน tests สำหรับ duplicate detection และ audit payload
```

---

## Phase 2 — Authentication และ Authorization

### Step 2.1: Role guard

```text
พัฒนา AuthService.gs สำหรับตรวจ userId/รหัสผ่าน ออก session token อายุจำกัด และเทียบ role กับ Users sheet
รองรับ role ADMIN และ STAFF, status ACTIVE/INACTIVE และ public visitor ที่ไม่มีสิทธิ์ management
สร้าง requireAuthenticatedUser(), requireRole(...roles) และ getCurrentUserContext()
ทุกฟังก์ชัน management ต้องใช้ role guard ฝั่ง server; ห้ามเชื่อ email/role ที่ browser ส่งมา
ออกแบบ fallback/error ที่ชัดเจนสำหรับ deployment configuration ที่อ่าน email ผู้ใช้ไม่ได้
เพิ่ม tests หรือ testable pure functions สำหรับ permission matrix ตาม README
```

### Step 2.2: API entry point ที่ปลอดภัย

```text
สร้าง Code.gs เป็น entry point ของ GAS Web App
รองรับ doGet(e) สำหรับการ render หน้า HTML และ public actions ที่ปลอดภัย: activities, search, verify, preview, download
วางโครง doPost(e) หรือ server-side handlers สำหรับ management actions พร้อม routing แบบ allowlist
กำหนด response envelope {success, data, error, requestId} และ error handling กลาง
อย่าเปิด endpoint สำหรับแก้ไขข้อมูลโดยไม่มี requireRole และอย่าใส่ API key ใน client
เพิ่ม request validation, pageSize limit และ structured logging
```

---

## Phase 3 — Activities, Template และเลขที่เกียรติบัตร

### Step 3.1: Activity management

```text
พัฒนา ActivityService สำหรับสร้าง แก้ไข อ่าน และปิดกิจกรรม
ให้รองรับ fields ตาม Activities sheet รวม templateId, prefixText, prefix, startNumber, endNumber, digitLength, separator, year, numberFormat และ status
validate ว่า activityId ไม่ซ้ำ, ช่วง start/end number ถูกต้อง, status อยู่ใน DRAFT/ACTIVE/CLOSED และ numberFormat อยู่ใน THAI/ARABIC
เฉพาะ ADMIN เท่านั้นที่สร้าง แก้ไข หรือลบกิจกรรม; STAFF อ่านได้
ทุกการเปลี่ยนแปลงต้องบันทึก Audit Log
เขียน tests สำหรับ validation ของ activity
```

### Step 3.2: Template validation และ preview

```text
สร้าง TemplateService สำหรับตรวจ Google Slides template จาก templateId
ให้ตรวจการเข้าถึงไฟล์ ประเภทไฟล์ จำนวน slide และการมีอยู่ของ {{name}} กับ {{certNo}} ใน slide หลัก
ต้องรายงาน placeholder ที่ขาด/เกิน/ซ้ำอย่างชัดเจน และห้ามแก้ไข template ต้นฉบับ
เพิ่ม createTemplatePreview(activityId) ที่ใช้สำเนาชั่วคราวแทน placeholder ด้วยข้อมูลตัวอย่าง แล้วคืน preview อย่างปลอดภัยและลบทิ้งใน finally
ออกแบบ TEMP_FOLDER_ID ผ่าน Script Properties
เขียน tests สำหรับการแยก/ตรวจ placeholder โดยใช้ pure functions
```

### Step 3.3: Number service

```text
พัฒนา NumberService.gs เพื่อสร้าง certificateId และ certificateNo
certificateId ต้องมีรูปแบบ CERT-{activityId}-{sixDigitSequence}; certificateNo ต้องประกอบจาก prefixText, prefix, runningNumber, separator, year และรองรับ THAI/ARABIC digit conversion
ใช้ LockService ระหว่าง assignNumbers(activityId, participantIds) และตรวจ collision กับ Certificates ก่อนบันทึก
การกำหนดเลขต้อง atomic เท่าที่ Apps Script รองรับ: ถ้าพบ error ให้ไม่เหลือ record ครึ่งทาง และบันทึก Audit Log
รองรับการตรวจช่วง startNumber/endNumber และห้าม reset เลขหากจะทำให้เลขที่ออกแล้วซ้ำ
เขียน tests ครอบคลุมเลขไทย, digit padding, collision และขอบเขตเลข
```

---

## Phase 4 — Import และ Certificate Registry

### Step 4.1: Import pipeline

```text
พัฒนา ParticipantService import pipeline ที่รับข้อมูลจาก CSV/XLSX หรือ array ที่แปลงแล้ว
กำหนด column mapping ขั้นต่ำ: prefixName, firstName, lastName, school, participantStatus
สร้าง validateImport() เพื่อคืน rows ที่ถูกต้อง, errors และ suspected duplicates ก่อนเขียนจริง
normalize ช่องว่าง, validate required fields และ participantStatus (เข้าร่วม/ผ่านการอบรม)
สร้าง commitImport() ที่บันทึกเฉพาะเมื่อผู้ใช้ยืนยัน และเขียนแบบ batch พร้อม Audit Log
อย่าให้ import ซ้ำหาก participant key เดิมอยู่ใน activity เดียวกัน เว้นแต่ผู้มีสิทธิ์ระบุ override อย่างชัดเจน
เขียน tests สำหรับ normalization, validation และ duplicate detection
```

### Step 4.2: Certificate lifecycle

```text
พัฒนา CertificateService สำหรับสร้าง/อ่าน/แก้ไข/issue/revoke/delete certificate registry
แยก certificateId ซึ่งไม่เปลี่ยน ออกจาก certificateNo ที่แสดงบนใบ
เมื่อแก้ชื่อ ให้เก็บ originalPrefixName/originalFirstName/originalLastName ไว้ครั้งแรก และบันทึก before/after ใน AuditLogs
รองรับสถานะ DRAFT, PENDING, ISSUED, REVOKED, DELETED พร้อม state transition ที่ปลอดภัย
STAFF แก้ไขและ revoke ได้ แต่ delete ถาวรได้เฉพาะ ADMIN
ห้ามเก็บ file ID หรือ URL ของ PDF/JPEG ถาวรใน Certificates
เขียน tests สำหรับ permission และ state transition
```

---

## Phase 5 — Certificate generation, Queue และ QR

### Step 5.1: Temporary exporter

```text
พัฒนา ExportService.gs สำหรับสร้าง certificate preview, PDF และ JPEG แบบ on demand
flow ต้องเป็น: copy template → replace {{name}}/{{certNo}} → export → ส่งผลลัพธ์ → ลบ temporary slide/file ใน finally
ห้ามแก้ template ต้นฉบับ และห้ามเก็บ PDF/JPEG ที่สร้างเสร็จเป็นไฟล์ถาวรใน Drive
ตรวจว่า certificate อยู่สถานะ ISSUED ก่อน export; REVOKED/DELETED ต้องถูกปฏิเสธพร้อม error ที่ปลอดภัย
ตั้งชื่อ output ชั่วคราวด้วย certificateId และชื่อที่ sanitize แล้ว
จัดการ error และ cleanup อย่างครบถ้วน รวมถึงกรณี export ล้มเหลว
เขียน integration test plan และ unit tests สำหรับ filename/data mapping ที่เป็น pure function
```

### Step 5.2: Queue และ batch processing

```text
พัฒนา QueueService.gs สำหรับงานที่ต้องประมวลผลเป็นชุด เช่น assign number หรือสร้าง preview จำนวนมาก
ใช้ GenerationQueue schema ตาม README; แบ่งงาน default 25 รายการต่อ batch, บันทึก currentRow, successCount, failCount และ lastError
ทำให้ job ทำต่อได้หลัง timeout โดยไม่สร้างเลขหรือไฟล์ซ้ำ และมี LockService ป้องกัน worker ซ้อน
เพิ่ม API getGenerationProgress(queueId) และ UI-friendly status
อย่าสร้าง trigger แบบไม่จำเป็น; ถ้าใช้ trigger ให้มี cleanup และเอกสารวิธีลบ trigger
เขียน tests สำหรับ resume logic และ status transition
```

### Step 5.3: QR verification

```text
พัฒนา VerificationService สำหรับสร้าง URL ตรวจสอบจาก WEB_APP_URL + ?page=verify&id={certificateId}
QR ต้องไม่มีชื่อ โรงเรียน หรือข้อมูลส่วนบุคคลใน query string
สร้าง getVerificationRecord(certificateId) ที่คืนเฉพาะข้อมูลจำเป็น: name, activity, certificateNo, issueDate, issueAgency และ status
สถานะ ISSUED ต้องแสดงว่าถูกต้อง; REVOKED ต้องแสดงว่าใบถูกยกเลิก; ไม่พบข้อมูลต้องแสดง not found โดยไม่เปิดเผยรายละเอียดภายใน
เพิ่ม helper สำหรับ QR generation ที่ไม่ hard-code provider หรือให้ frontend สร้างภาพ QR จาก verification URL
เขียน tests สำหรับ URL encoding และ response ตามสถานะ
```

---

## Phase 6 — Frontend Public Mode

### Step 6.1: Design system และ layout

```text
สร้าง frontend GAS HTMLService ด้วย HTML5, Tailwind CSS และ Vanilla JavaScript เท่านั้น
ออกแบบ responsive layout สำหรับ Public Mode และ Management Mode โดยใช้ไฟล์/partials ตามโครงสร้างโครงการ
สร้าง top bar ที่แสดง Public Mode เป็นค่าเริ่มต้น และแสดงปุ่ม Management Mode เฉพาะผู้มีสิทธิ์
ใส่ loading, empty, error และ success states ที่เข้าถึงได้ (keyboard, label, focus, aria ที่เหมาะสม)
ห้ามใช้ framework, build system หนัก หรือ inline secret
รักษาภาษาไทยให้อ่านง่ายทั้งมือถือและเดสก์ท็อป
```

### Step 6.2: Public search และ result cards

```text
พัฒนาหน้า Public Search
ให้โหลดรายการกิจกรรม ACTIVE เข้า dropdown และค้นหาได้จากชื่อ นามสกุล ชื่อเต็ม โรงเรียน หรือเลขที่เกียรติบัตร
ทำ client-side debounce/validation ที่พอดี แต่ให้ server เป็นผู้บังคับ validation และ pagination
แสดง result card ตาม README พร้อมปุ่ม ดูตัวอย่าง, ดาวน์โหลด PDF, ดาวน์โหลด JPEG และ แจ้งข้อมูลไม่ถูกต้อง
Public ห้ามเห็นคำสั่ง edit/revoke/delete หรือ audit data
รองรับลิงก์ direct ไปยัง verify page และจัดการไม่มีผลการค้นหาอย่างสุภาพ
ทดสอบ responsive, XSS-safe rendering และกรณี query ภาษาไทย/ช่องว่างซ้ำ
```

### Step 6.3: Verify page

```text
พัฒนาหน้า Verify Certificate ที่อ่าน certificateId จาก query string
เรียก public verify endpoint แล้วแสดงผล 3 สถานะ: ถูกต้อง/ออกแล้ว, ถูกยกเลิก, ไม่พบข้อมูล
แสดงเฉพาะ name, activity, certificateNo, issueDate, issueAgency และสถานะ
อย่า render HTML จากข้อมูลโดยตรงโดยไม่ escape และอย่าเปิดเผย email, audit history หรือข้อมูลภายใน
เพิ่มปุ่มกลับหน้าค้นหา และให้ layout เหมาะกับการเปิดจากมือถือหลังสแกน QR
```

---

## Phase 7 — Frontend Management Mode

### Step 7.1: Dashboard และ Activities UI

```text
พัฒนา Management Mode สำหรับ ADMIN/STAFF โดยตรวจ user context จาก server เมื่อเริ่มหน้า
สร้าง Dashboard แสดงจำนวนกิจกรรม ผู้เข้าร่วม ออกแล้ว รอดำเนินการ และยกเลิก รวมตารางสรุปต่อกิจกรรม
สร้าง Activities UI สำหรับ ADMIN: create/edit/close activity, กรอกเลขที่ และผูก templateId พร้อมปุ่ม validate/preview template
STAFF ต้องเข้าดูได้ แต่ไม่สามารถแก้ไขกิจกรรม
ทุก mutation ต้องแสดง loading/result/error และ refresh ข้อมูลโดยไม่ทำให้ผู้ใช้สับสน
```

### Step 7.2: Participants, import และ certificates UI

```text
พัฒนา Participants และ Certificates UI ใน Management Mode
รองรับ upload/import CSV/XLSX, แสดง mapping และ preview validation (ถูกต้อง/ผิดพลาด/อาจซ้ำ) ก่อนปุ่มยืนยัน
เพิ่มการเลือก participant เพื่อ assign numbers และแสดง progress ของ queue
หน้า Certificates ต้องค้นหา ดูตัวอย่าง แก้ไขชื่อ issue/revoke และ (เฉพาะ ADMIN) delete พร้อม confirmation ที่ระบุผลกระทบชัดเจน
เมื่อแก้ไขหรือยกเลิก ให้แสดงเหตุผล/ผลสำเร็จโดยไม่แก้หน้า Public แบบผิดสิทธิ์
อย่า bypass authorization: UI ซ่อนได้ แต่ server guard ต้องเป็นตัวตัดสินเสมอ
```

### Step 7.3: Users, settings และ logs

```text
พัฒนา Users, Settings และ Audit Logs UI เฉพาะ ADMIN
Users: เพิ่ม/แก้ role/activate/deactivate ด้วย email ที่ validate แล้ว ห้ามลบตนเองโดยไม่มีกลไกป้องกัน
Settings: แสดงค่า configuration ที่แก้ได้โดยไม่เปิดเผย secret และ validate URL/ID ก่อนบันทึก
Audit Logs: filter ตาม action, entityType, actor, ช่วงเวลา และแสดง before/after แบบอ่านง่ายโดยคำนึงถึงข้อมูลส่วนบุคคล
เพิ่ม confirmation สำหรับการเปลี่ยนสิทธิ์และการลบถาวร
```

---

## Phase 8 — Test, Security Review และ Deployment

### Step 8.1: Test และ quality review

```text
ตรวจทานโครงการ Certificate Management System ทั้งระบบเทียบกับ README นี้
สร้างหรือปรับ test plan ครอบคลุม: schema bootstrap, roles, activity validation, template placeholders, number collision/Thai digits, import duplicate, certificate lifecycle, export cleanup, public search, verify QR และ queue resume
รัน tests/lint ที่มีอยู่ แก้เฉพาะความผิดพลาดใน scope และรายงานผลพร้อมรายการที่ยังต้องทดสอบใน Google Workspace จริง
ตรวจ code quality: ไม่มี hard-coded secret, ไม่มี frontend access ไป Sheets, ไม่มี dynamic field นอก {{name}}/{{certNo}}, และไม่มีการเก็บ PDF/JPEG ถาวร
```

### Step 8.2: Security review

```text
ทำ security review แบบเน้นการปฏิบัติสำหรับ GAS Web App นี้
ตรวจ public/admin route separation, server-side authorization ทุก mutation, data exposure ใน search/verify, input validation, XSS, IDOR ของ certificateId, rate limiting/abuse safeguards, LockService และ temporary file cleanup
เสนอและลงมือแก้เฉพาะช่องโหว่ที่ยืนยันได้ใน codebase โดยไม่เปลี่ยน requirements
สร้าง docs/security-checklist.md ที่มีรายการตั้งค่า deployment และ manual checks ก่อนเปิดใช้จริง
สรุปความเสี่ยงที่ยังเหลือและวิธีตรวจสอบ
```

### Step 8.3: Deploy และ Embed

```text
เตรียมโครงการสำหรับ deploy เป็น Google Apps Script Web App
ตรวจ appsscript.json, Script Properties, scopes, route, error page และ documentation ให้พร้อม production โดยไม่ deploy แทนผู้ใช้และไม่เผยข้อมูลลับ
อัปเดต docs/deployment.md ให้มีขั้นตอน deploy version, กำหนด access ของ Public Search, ทดสอบ ADMIN/STAFF, ตั้ง WEB_APP_URL, ทดลอง QR verification และ Embed URL ใน Google Sites
เพิ่ม pre-launch checklist และ rollback steps ที่ปลอดภัย
สรุปสิ่งที่ผู้ดูแลต้องทำใน Google Workspace ด้วยตนเอง
```

---

## 16. ลำดับทดสอบก่อนเปิดใช้จริง

1. สร้าง Spreadsheet และรัน `initializeDatabase()` ในสำเนาทดสอบ
2. ตั้ง Script Properties และเพิ่มผู้ใช้ ADMIN อย่างน้อยหนึ่งราย
3. สร้างกิจกรรม test และผูก template ที่มี `{{name}}`, `{{certNo}}`
4. นำเข้ารายชื่อทดสอบที่มีทั้งข้อมูลถูกต้อง ผิดพลาด และซ้ำ
5. กำหนดเลขพร้อมตรวจเลขไทย/อารบิก, ขอบเขตเลข และการชนกัน
6. ทดสอบ search, preview, PDF/JPEG บน desktop และมือถือ
7. ยืนยันว่า temporary files ถูกลบหลัง export ทั้งกรณีสำเร็จและล้มเหลว
8. สแกน QR และตรวจทั้งสถานะ ISSUED, REVOKED, Not Found
9. ทดสอบสิทธิ์ ADMIN, STAFF และ Public แยกกัน
10. Embed Public URL ใน Google Sites และตรวจการทำงานจริง
11. ตรวจ Audit Log ของ create, import, edit, issue, revoke และ delete

---

## 17. ข้อควรระวังในการใช้งานจริง

- Apps Script มีเวลาประมวลผลต่อครั้งจำกัด จึงห้ามออกไฟล์เป็นจำนวนมากใน loop เดียว; ใช้ `GenerationQueue` และ batch
- Management Mode ใช้ credential ภายในระบบ ไม่พึ่งอีเมล Google Account; ต้องทดสอบ session expiry และ role ก่อนเปิดใช้งานจริง
- Google Slides export เป็น JPEG อาจต้องพึ่ง endpoint/thumbnail ที่เหมาะกับสิทธิ์ของไฟล์; ต้องทดลองกับ template จริงตั้งแต่ Phase 5
- เกียรติบัตรที่เคยออกไปแล้วควร `REVOKED` แทน delete เพื่อรักษาความน่าเชื่อถือของระบบ
- ตั้งสิทธิ์ Drive folder และ Spreadsheet ให้แคบที่สุดเท่าที่งานจำเป็น

---

## 18. Definition of Done

โครงการถือว่าเสร็จเมื่อผ่าน Acceptance Criteria ทั้งหมด, มีเอกสาร deployment/security ครบ, ผู้ดูแล deploy และตั้งค่า Script Properties ได้ตามคู่มือ, และผ่านการทดสอบ end-to-end ตั้งแต่ import → assign number → search → download → QR verify → audit log
