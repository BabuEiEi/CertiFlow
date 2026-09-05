# Certificate Management System (GAS)

ระบบสร้าง ค้นหา ตรวจสอบ และดาวน์โหลดเกียรติบัตรออนไลน์ สำหรับหลายกิจกรรม โดยใช้ Google Workspace เป็นแกนหลัก

> เอกสารนี้เป็นข้อกำหนดโครงการ (project specification) ของระบบที่ใช้งานจริงอยู่ — หัวข้อ 1-14 คือสิ่งที่ระบบเป็นและต้องรักษาไว้ หัวข้อ 15 เป็นบันทึกย้อนหลังว่าระบบถูกสร้างขึ้นมาอย่างไร ส่วนวิธีใช้งานรายหน้าอยู่ที่ [`docs/user-guide.md`](docs/user-guide.md)

---

## 1. วัตถุประสงค์

ระบบรองรับการบริหารเกียรติบัตรตั้งแต่สร้างกิจกรรม นำเข้ารายชื่อ กำหนดเลขที่เกียรติบัตร ค้นหา ตรวจสอบผ่าน QR Code และดาวน์โหลดไฟล์ โดยมุ่งให้ใช้งานได้จริงในระดับหน่วยงานการศึกษา

ความสามารถหลัก

1. ผู้ดูแลสร้างและตั้งค่ากิจกรรม รวมถึง Google Slides template
2. Admin/Staff เพิ่มรายชื่อทีละคน หรือนำเข้าเป็นชุดจากไฟล์ Excel/CSV พร้อมตรวจข้อมูลซ้ำก่อนบันทึก
3. ระบบกำหนด `certificateId` และเลขที่เกียรติบัตรที่ไม่ซ้ำ
4. สาธารณชนค้นหาจากชื่อ นามสกุล โรงเรียน หรือเลขที่เกียรติบัตรได้โดยไม่ต้องเข้าสู่ระบบ
5. ระบบแสดงตัวอย่างและดาวน์โหลด PDF/JPEG แบบ on demand
6. QR Code นำไปสู่หน้าตรวจสอบความถูกต้องของเกียรติบัตร
7. Admin/Staff แก้ไขข้อมูล ออกใหม่ หรือยกเลิกเกียรติบัตรได้ ส่วน Admin ลบและกู้คืน (restore) ใบที่ลบไปแล้วได้ ทุกขั้นตอนมี Audit Log
8. หน้า Public Search นำไปฝัง (Embed) ใน Google Sites ได้
9. ผู้มีสิทธิ์สลับระหว่าง Public Mode และ Management Mode ได้จากปุ่มด้านขวาบน

### ขอบเขตที่ต้องยึด

- ใช้ HTML5, Tailwind CSS และ Vanilla JavaScript เท่านั้น: **ไม่ใช้ React, Vue หรือ TypeScript**
- ใช้ Google Apps Script เป็น Web App, backend และ API
- ใช้ Google Sheets เป็นฐานข้อมูล และ Google Drive เก็บ template/asset ของระบบ
- 1 กิจกรรมต่อ 1 Google Slides template (slide หลัก 1 หน้า)
- Dynamic field บน template บังคับเพียง `{{name}}` และ `{{certNo}}` เพิ่ม `{{office}}`, `{{type}}`, `{{qr}}` ได้แบบไม่บังคับ (อย่างละไม่เกิน 1 ตำแหน่ง)
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
| ลบเกียรติบัตรออกจากทะเบียน | ✓ | – | – |
| กู้คืนเกียรติบัตรที่ถูกลบ (restore) | ✓ | – | – |
| ลบผู้เข้าร่วม | ✓ | ✓ | – |
| จัดการ Users / Settings | ✓ | – | – |
| ดู Audit Logs / รายงานปัญหา | ✓ | – | – |

ให้ใช้ `REVOKED` แทนการลบเมื่อเกียรติบัตรเคยออกให้ผู้รับแล้ว และแสดงผลอย่างชัดเจนในหน้า Verify — ระบบบังคับกติกานี้จริง โดยปฏิเสธการลบใบสถานะ `ISSUED` ทุกกรณี

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
participantStatus | importBatchId | sourceRow | createdAt | createdBy | updatedAt | updatedBy |
trainingType
```

```text
participantStatus: เข้าร่วม | ผ่านการอบรม
```

`trainingType` คือ "ด้านการอบรม" ที่พิมพ์ลง `{{type}}` ในเกียรติบัตร เว้นว่างได้ตอนนำเข้า ระบบจะเติมค่าที่ตั้งไว้ระดับกิจกรรมให้แทน

### 5.5 Certificates

```text
certificateId | activityId | participantId | certificateNo | runningNumber |
prefixName | firstName | lastName | school | participantStatus | certificateStatus |
originalPrefixName | originalFirstName | originalLastName |
issuedAt | issuedBy | revokedAt | revokedBy | revokeReason |
createdAt | createdBy | updatedAt | updatedBy | trainingType
```

```text
certificateStatus: DRAFT | PENDING | ISSUED | REVOKED | DELETED
```

**หลักการสำคัญ**

- `certificateId` เป็น primary key ที่ไม่เปลี่ยน เช่น `CERT-ACT001-000001`
- `certificateNo` คือเลขที่แสดงบนใบ ซึ่งอาจมีข้อความนำหน้า/เลขไทย จึงไม่ควรเป็น primary key
- ไม่เก็บ `pdfFileId`, `jpegFileId`, หรือ URL ไฟล์ถาวร เพราะไฟล์ผลลัพธ์สร้างชั่วคราวเท่านั้น
- **`DELETED` เป็น soft delete** แถวไม่เคยถูกลบออกจากชีต เปลี่ยนเฉพาะ `certificateStatus` แล้วกรองออกจากทะเบียนและผลค้นหาสาธารณะ — ข้อมูลทุกช่องรวมถึงเลขที่ยังอยู่ครบ จึงกู้คืนกลับมาเป็นใบเดิมได้ด้วย `restoreCertificate`
- แถว `DELETED` ยัง**ถือครองเลขและลำดับ id ของตัวเองไว้ตลอด** ทั้ง `NumberService` (ตอนจองเลขถัดไป) และ `ParticipantService` (ตอนตั้ง suffix ของ id ที่นำเข้าใหม่) จึงต้องนับแถวเหล่านี้ด้วยเสมอ ไม่เช่นนั้นเลขหรือ id จะถูกแจกซ้ำ

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

action ที่ระบบใช้จริง: `CREATE_ACTIVITY`, `UPDATE_ACTIVITY`, `DELETE_ACTIVITY`, `IMPORT_PARTICIPANTS`, `DELETE_PARTICIPANT`, `ASSIGN_NUMBER`, `UPDATE_NAME`, `ISSUE_CERTIFICATE`, `REVOKE_CERTIFICATE`, `REISSUE_CERTIFICATE`, `DELETE_CERTIFICATE`, `RESTORE_CERTIFICATE`, `MANAGE_USER`

---

## 6. หลักเกณฑ์เลขที่เกียรติบัตรและชื่อ

### Certificate ID

```text
CERT-{activityId}-{sixDigitSequence}
เช่น CERT-ACT001-000001
```

`participantId` ใช้ suffix ชุดเดียวกัน (`PAR-ACT001-000001`) เพราะสร้างคู่กันตอนนำเข้า ลำดับ suffix ต้องเดินหน้าอย่างเดียว จึงคำนวณจาก**ทั้งแถว Participants และแถว Certificates** — แถว participant ถูกลบออกจากชีตได้จริง ส่วนแถว certificate เป็น soft delete ที่ยังถือ suffix นั้นไว้ ถ้านับเฉพาะฝั่ง participant ตัวนับจะถอยหลังและแจก `certificateId` ซ้ำ

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

หนึ่งกิจกรรมใช้ Google Slides template หนึ่งไฟล์ โดยมี slide หลักเพียงหน้าเดียว และกำหนด dynamic placeholders 2 จุดที่บังคับ

```text
{{name}}      บังคับ
{{certNo}}    บังคับ
{{office}}    ไม่บังคับ — สถานศึกษา/หน่วยงานของผู้รับ
{{type}}      ไม่บังคับ — ด้านการอบรม
{{qr}}        ไม่บังคับ — QR สำหรับหน้า Verify
```

placeholder ที่ไม่บังคับจะใส่หรือไม่ใส่ก็ได้ แต่ถ้าใส่ต้องมีไม่เกิน 1 ตำแหน่งเช่นเดียวกับตัวบังคับ

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
| `{{office}}` | ใต้ชื่อผู้รับ | CENTER |
| `{{type}}` | ในบรรทัด "ได้ผ่านการอบรม..." | CENTER |

Template สามารถมี background, logo, ลายเซ็น และข้อความคงที่ได้ แต่ไม่ควรเพิ่ม placeholder อื่นโดยไม่จำเป็น

### การตรวจ Template

ก่อนผูกกับกิจกรรม ระบบต้อง

1. ตรวจว่า `templateId` เข้าถึงได้และเป็น Google Slides
2. ตรวจว่ามี slide อย่างน้อยหนึ่งหน้า
3. ค้นหา `{{name}}` และ `{{certNo}}` ทั้งสองค่า
4. แจ้ง error แบบชัดเจนหาก placeholder หาย หรือมีซ้ำมากกว่าที่ออกแบบไว้ — รวมถึง `{{office}}`, `{{type}}`, `{{qr}}` ที่ไม่บังคับแต่ห้ามซ้ำ
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
3. **Participants** — เพิ่มทีละรายการ หรือนำเข้าจากไฟล์ CSV/XLSX พร้อม preview, validation, duplicate check และแก้ไข/ลบรายชื่อ
4. **Certificate Generator** — กำหนดเลขที่, สร้างคิว/batch และติดตาม progress
5. **Certificates** — ค้นหา ดูตัวอย่าง แก้ไข ออกใหม่ ยกเลิก ลบ และกู้คืนตาม role
6. **Guide** — คู่มือการใช้งานในระบบ (เนื้อหาเดียวกับ `docs/user-guide.md`)
7. **Users** — ADMIN เท่านั้น สำหรับเพิ่ม/ปิดใช้งานผู้ใช้และกำหนด role
8. **Settings / Audit Logs / รายงานปัญหา** — ADMIN เท่านั้น

### การนำเข้ารายชื่อ

หน้า Participants มี 2 ทางเข้า ซึ่งใช้ pipeline ตรวจสอบชุดเดียวกัน (`validateImport` → `importParticipants`) จึงได้ duplicate check และการสร้าง Certificate สถานะ `DRAFT` เหมือนกัน

1. **เพิ่มทีละรายการ** — ฟอร์มกรอกทีละคน ส่ง payload 1 แถว เตือนเมื่อซ้ำและให้ติ๊กยืนยันก่อนบันทึก
2. **นำเข้าจากไฟล์ Excel/CSV** — อัปโหลด `.csv/.xlsx/.xls` (จับคู่หัวคอลัมน์ไทย/อังกฤษอัตโนมัติ) หรือวางข้อความคั่นด้วยจุลภาค/Tab พร้อมปุ่มดาวน์โหลด Template Excel

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

ข้อจำกัดที่ระบบบังคับจริง: นำเข้าได้สูงสุด **5,000 แถวต่อครั้ง**, แถวที่ขาดชื่อหรือนามสกุลถูกปฏิเสธ, `participantStatus` ต้องเป็น `เข้าร่วม` หรือ `ผ่านการอบรม` เท่านั้น (เว้นว่าง = `ผ่านการอบรม`) และ `commitImport` จะ revalidate อีกครั้งหลังจับ `LockService` แล้ว เพื่อไม่ให้การนำเข้าพร้อมกันผ่าน duplicate check จาก snapshot เดียวกัน

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
| `reportIssue` | `id`, รายละเอียดปัญหา | ให้ผู้รับแจ้งข้อมูลผิดจากหน้า Verify |
| `login` / `logout` / `session` | `userId`, `password` / token | จัดการ session ของ Management Mode |

### Management actions (`doPost` หรือ `google.script.run`)

รายการจริงตามที่ประกาศไว้ใน `Code.gs` (`PERMISSIONS.MANAGEMENT`) พร้อม role ที่เรียกได้

```text
ADMIN + STAFF
  getActivities  importParticipants  validateImport  getParticipants
  updateParticipant  deleteParticipant  deleteParticipants
  getCertificates  getDashboardStats  assignNumbers
  createGenerationQueue  getGenerationProgress  processGenerationQueue  cancelGenerationQueue
  updateCertificate  issueCertificate  issueCertificates
  revokeCertificate  revokeCertificates  reissueCertificate

ADMIN เท่านั้น
  createActivity  updateActivity  deleteActivity
  validateTemplate  previewTemplate
  deleteCertificate  deleteCertificates  restoreCertificate
  getUsers  manageUser  getSettings  updateSettings
  getAuditLogs  getReports  resolveReport
```

ทุก management action ต้องตรวจ session token, userId, role, input validation และบันทึก Audit Log — การเพิ่ม action ใหม่ต้องลงทะเบียนในตารางสิทธิ์นี้ก่อนเสมอ ไม่เช่นนั้นจะถูกปฏิเสธที่ entry point

---

## 12. โครงสร้างไฟล์

```text
CertiFlow/
├── appsscript.json
├── src/
│   ├── Code.gs                 # doGet/doPost, ตารางสิทธิ์ และ entry point
│   ├── Config.gs               # keys/ค่าคงที่/HEADERS ของทุกชีต
│   ├── AuthService.gs          # ตรวจ user, role และ session
│   ├── SheetService.gs         # อ่าน/เขียน Sheets แบบ batch
│   ├── ActivityService.gs
│   ├── ParticipantService.gs
│   ├── CertificateService.gs
│   ├── NumberService.gs
│   ├── TemplateService.gs
│   ├── ExportService.gs        # temporary Slides/PDF/JPEG
│   ├── SearchService.gs
│   ├── QueueService.gs
│   ├── ReportService.gs        # รับเรื่องแจ้งข้อมูลผิดจากหน้า Verify
│   ├── SettingsService.gs
│   ├── AuditService.gs
│   ├── ProductionSetup.gs      # bootstrap ชีตและบัญชีเริ่มต้น
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
│       ├── Guide.html
│       └── Settings.html
├── tests/                      # node ล้วน ไม่พึ่ง Apps Script runtime (`npm test`)
│   ├── ActivityTemplateNumber.test.js
│   ├── AuthAndApiRouting.test.js
│   ├── ImportAndCertificateLifecycle.test.js
│   ├── NumberIntegrity.test.js
│   ├── NumberService.test.js
│   ├── Phase5ExportQueueVerify.test.js
│   ├── QueueResume.test.js
│   ├── RepositoryAudit.test.js
│   ├── SchemaValidation.test.js
│   ├── UserIdAuth.test.js
│   ├── Validation.test.js
│   └── fixtures/
├── docs/
│   ├── sheet-schema.md
│   ├── deployment.md
│   ├── template-guide.md
│   └── user-guide.md
└── README.md
```

ทุกไฟล์ใน `src/` เป็น object literal ที่ปิดท้ายด้วย `module.exports` แบบมีเงื่อนไข จึง `require` เข้ามาทดสอบใน node ได้ตรง ๆ และเรียกหากันผ่าน global object เมื่อรันบน Apps Script (มี `typeof X !== 'undefined'` คุมไว้ทุกจุด)

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
- การลบแล้วนำเข้ารายชื่อใหม่ต้องไม่ทำให้ `certificateId` หรือ `participantId` ถูกแจกซ้ำ (ลำดับ suffix เดินหน้าอย่างเดียว)
- เกียรติบัตรที่ถูกลบ (`DELETED`) กู้คืนกลับมาเป็นใบเดิมได้ พร้อม `certificateId` และเลขที่เดิม โดยคืนสถานะตรงกับก่อนถูกลบ
- Public user ค้นหาและตรวจ QR ได้โดยไม่ต้อง login
- Public user ไม่เห็นคำสั่งแก้ไข, revoke, delete หรือ Audit Log
- PDF/JPEG ที่ดาวน์โหลดมีชื่อและเลขที่ถูกต้อง และไม่มีไฟล์ผลลัพธ์คงอยู่ใน Drive หลังงานเสร็จ
- Certificate ที่ถูก revoke แสดงสถานะใน Verify และไม่อนุญาต export ใหม่
- ทุกการเปลี่ยนแปลงสำคัญสร้าง Audit Log
- Public Search URL ฝังใน Google Sites ได้ และ Management URL มี authorization ครบถ้วน

---

## 15. บันทึกการพัฒนา (Development History)

หัวข้อนี้เดิมเป็นแผนงานและชุด prompt สำหรับสั่ง AI Agent พัฒนาระบบทีละ Phase ตอนนี้ระบบสร้างเสร็จและใช้งานจริงแล้ว จึงเก็บไว้เป็น**บันทึกย้อนหลัง**ว่าแต่ละ Phase ส่งมอบอะไรและงานนั้นไปอยู่ที่ไฟล์ไหน ไม่ใช่ขั้นตอนที่ต้องทำซ้ำ — สำหรับการใช้งานจริงให้ดูหัวข้อ 1-14 และ `docs/user-guide.md` เป็นหลัก

| Phase | ส่งมอบ | ไฟล์หลัก |
|---|---|---|
| 0 — โครงสร้างและ environment | วางโครง `src/` `web/` `tests/` `docs/`, ตั้ง clasp และ `.gitignore` ให้ไม่หลุด secret | `appsscript.json`, `.clasp.example.json`, `docs/deployment.md` |
| 1 — Schema และฐานข้อมูล | schema 7 ชีตพร้อม `initializeDatabase()` ที่สร้างชีตที่ขาดและเติมคอลัมน์ใหม่ต่อท้ายโดยไม่ทับข้อมูลเดิม, repository layer แบบ batch และ audit log | `Config.gs`, `SheetService.gs`, `Validation.gs`, `AuditService.gs` |
| 2 — Authentication | login ด้วย userId/password ในชีต Users, session token มีอายุ, `requireRole()` ฝั่ง server และ entry point แบบ allowlist | `AuthService.gs`, `Code.gs` |
| 3 — กิจกรรม เลขที่ และ template | จัดการกิจกรรม, ตรวจ Google Slides template, ออกเลขไทย/อารบิกใต้ `LockService` พร้อมกันเลขซ้ำและกันช่วงเลขทับกันข้ามกิจกรรม | `ActivityService.gs`, `TemplateService.gs`, `NumberService.gs` |
| 4 — นำเข้าและทะเบียนเกียรติบัตร | `validateImport()` / `commitImport()` พร้อม duplicate check, วงจรสถานะเกียรติบัตรครบ (issue / revoke / reissue / delete) และเก็บชื่อเดิมเมื่อแก้ครั้งแรก | `ParticipantService.gs`, `CertificateService.gs` |
| 5 — สร้างไฟล์ คิว และ QR | export PDF/JPEG แบบชั่วคราวพร้อม cleanup ใน `finally`, คิวแบบ batch ครั้งละ 25 รายการที่ทำต่อได้หลัง timeout และ verification URL สำหรับ QR | `ExportService.gs`, `QueueService.gs`, `SearchService.gs` |
| 6 — Public Mode | หน้าค้นหาสาธารณะและหน้า Verify ที่ escape ข้อมูลทุกจุดและไม่เปิดเผยข้อมูลภายใน | `web/partials/PublicSearch.html`, `Verify.html` |
| 7 — Management Mode | Dashboard, กิจกรรม, นำเข้ารายชื่อ, ทะเบียนเกียรติบัตร, ผู้ใช้ ตั้งค่า และ Audit Logs | `web/partials/*.html`, `web/Scripts.html`, `SettingsService.gs` |
| 8 — ทดสอบและ deploy | ชุดทดสอบ node ที่รันด้วย `npm test` โดยไม่ต้องพึ่ง Apps Script runtime, security review และ deploy เป็น Web App แบบกำหนดเวอร์ชัน | `tests/*.test.js`, `docs/deployment.md` |

### สิ่งที่ต่างจากแผนเดิม

- **placeholder เพิ่มจาก 2 เป็น 5** แผนเดิมล็อกไว้แค่ `{{name}}` กับ `{{certNo}}` ภายหลังเพิ่ม `{{office}}`, `{{type}}` และ `{{qr}}` เป็นตัวเลือกที่ใส่หรือไม่ใส่ก็ได้
- **ไม่มี `VerificationService.gs` แยกไฟล์** ตามที่แผน Phase 5.3 เขียนไว้ ฟังก์ชัน verification URL และ verification record อยู่ใน `SearchService.gs` ร่วมกับการค้นหา
- **การลบเกียรติบัตรเป็น soft delete** ไม่ใช่การลบแถวจริงอย่างที่คำว่า "delete ถาวร" ในแผนสื่อ และภายหลังเพิ่ม `restoreCertificate` สำหรับกู้คืน
- **STAFF ลบผู้เข้าร่วมได้** ต่างจากแผนเดิมที่สงวนการลบทุกชนิดไว้ให้ ADMIN — แต่การลบเกียรติบัตรออกจากทะเบียนยังเป็นสิทธิ์ ADMIN เท่านั้น
- **ยังไม่มี `docs/security-checklist.md`** ที่แผน Phase 8.2 ระบุไว้ รายการตรวจก่อนเปิดใช้จริงอยู่ในหัวข้อ 16 ของเอกสารนี้แทน

### งานที่เพิ่มหลังแผนจบ

ดูรายละเอียดได้จาก git log — งานหลักที่เพิ่มหลังระบบขึ้นใช้งานจริง

- ปรับดีไซน์เป็นธีมกรมท่า/ทอง ใช้ SweetAlert2 และเปลี่ยนเมนูเป็น sidebar
- เพิ่มคู่มือการใช้งานทั้งในระบบ (`web/partials/Guide.html`) และในรีโป (`docs/user-guide.md`)
- ทำงานเป็นชุดจากการติ๊กเลือกแถว (ออกเลข / ยกเลิก / ลบ) พร้อมเพดาน 25 รายการต่อรอบและแถบความคืบหน้า
- ออกใหม่ (reissue) โดยคงเลขเดิม และกันช่วงเลขทับซ้อนข้ามกิจกรรม
- ฝัง QR ลงในไฟล์เกียรติบัตรที่สร้าง
- เพิ่มฟิลด์ "ด้านการอบรม" ทั้งระดับกิจกรรมและระดับผู้เข้าร่วม
- แยกการนำเข้ารายชื่อเป็น 2 ทาง (ทีละรายการ / ไฟล์ Excel-CSV)
- กู้คืนเกียรติบัตรที่ถูกลบ พร้อมแก้ตัวนับ id ไม่ให้แจก `certificateId` ซ้ำกับใบที่ถูกลบ

---

## 16. ลำดับทดสอบก่อนเปิดใช้จริง

1. สร้าง Spreadsheet และรัน `initializeDatabase()` ในสำเนาทดสอบ
2. ตั้ง Script Properties และเพิ่มผู้ใช้ ADMIN อย่างน้อยหนึ่งราย
3. สร้างกิจกรรม test และผูก template ที่มี `{{name}}`, `{{certNo}}`
4. นำเข้ารายชื่อทดสอบทั้งสองทาง (เพิ่มทีละรายการ และไฟล์ Excel/CSV) ด้วยข้อมูลที่มีทั้งถูกต้อง ผิดพลาด และซ้ำ
5. กำหนดเลขพร้อมตรวจเลขไทย/อารบิก, ขอบเขตเลข และการชนกัน
6. ทดสอบ search, preview, PDF/JPEG บน desktop และมือถือ
7. ยืนยันว่า temporary files ถูกลบหลัง export ทั้งกรณีสำเร็จและล้มเหลว
8. สแกน QR และตรวจทั้งสถานะ ISSUED, REVOKED, Not Found
9. ทดสอบสิทธิ์ ADMIN, STAFF และ Public แยกกัน
10. Embed Public URL ใน Google Sites และตรวจการทำงานจริง
11. ลบเกียรติบัตร แล้วกู้คืน (restore) ตรวจว่าได้ `certificateId` และเลขที่เดิม สถานะตรงกับก่อนลบ
12. ลบผู้เข้าร่วมคนท้ายสุด แล้วนำเข้าใหม่ ตรวจว่า `certificateId` ไม่ถูกแจกซ้ำกับใบที่ลบไป
13. ตรวจ Audit Log ของ create, import, edit, issue, revoke, delete และ restore

---

## 17. ข้อควรระวังในการใช้งานจริง

- Apps Script มีเวลาประมวลผลต่อครั้งจำกัด จึงห้ามออกไฟล์เป็นจำนวนมากใน loop เดียว; ใช้ `GenerationQueue` และ batch
- Management Mode ใช้ credential ภายในระบบ ไม่พึ่งอีเมล Google Account; ต้องทดสอบ session expiry และ role ก่อนเปิดใช้งานจริง
- Google Slides export เป็น JPEG อาจต้องพึ่ง endpoint/thumbnail ที่เหมาะกับสิทธิ์ของไฟล์; ต้องทดลองกับ template จริงตั้งแต่ Phase 5
- เกียรติบัตรที่เคยออกไปแล้วควร `REVOKED` แทน delete เพื่อรักษาความน่าเชื่อถือของระบบ (ระบบปฏิเสธการลบใบสถานะ `ISSUED` อยู่แล้ว)
- การลบเกียรติบัตรเป็น soft delete จึงกู้คืนได้ แต่การลบผู้เข้าร่วมจากหน้า Participants ลบแถวออกจากชีตจริง — การกู้คืนเกียรติบัตรจะสร้างแถวผู้เข้าร่วมคืนจากข้อมูลบนแถวเกียรติบัตร
- ห้ามล้างแถวสถานะ `DELETED` ออกจากชีต `Certificates` ด้วยมือ เพราะแถวเหล่านั้นถือครองเลขที่และลำดับ id ไว้ ถ้าลบทิ้งระบบจะแจกเลข/id ซ้ำ
- ตั้งสิทธิ์ Drive folder และ Spreadsheet ให้แคบที่สุดเท่าที่งานจำเป็น

---

## 18. Definition of Done

โครงการถือว่าเสร็จเมื่อผ่าน Acceptance Criteria ทั้งหมด, มีเอกสาร deployment/security ครบ, ผู้ดูแล deploy และตั้งค่า Script Properties ได้ตามคู่มือ, และผ่านการทดสอบ end-to-end ตั้งแต่ import → assign number → search → download → QR verify → audit log
