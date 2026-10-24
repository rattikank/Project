# Procurement & Purchase Order — Backend starter (ASP.NET .NET Framework + SQL Server)

## ไฟล์สำคัญ
- `schema.sql` — สร้างฐานข้อมูล `final_project`, 10 ตาราง, constraints, indexes, trigger, stored procedure และ reporting view
- `Api.ashx` — API สำหรับอ่านข้อมูล สร้างใบขอซื้อ และอนุมัติใบขอซื้อ
- `Web.config` — connection string แบบ Windows Authentication
- `api-test.html` — หน้าทดสอบ API แบบง่าย
- `Frontend/` — หน้า HTML/CSS เดิมจาก ZIP ที่ให้มา (ยังเป็น frontend เดิม; ต้องเปลี่ยนให้เรียก API หากต้องการใช้เป็นหน้าจอจริง)

## ขั้นที่ 1 — รัน SQL ใน SSMS
1. เปิด SSMS และเชื่อมต่อ SQL Server instance ที่ใช้งานอยู่
2. เปิด `schema.sql`
3. กด Execute (F5) ด้วยบัญชีที่มีสิทธิ์สร้างฐานข้อมูล
4. ตรวจสอบว่าได้ฐานข้อมูล `final_project` และมี 10 ตาราง

> สคริปต์นี้ตั้งใจสร้างตารางใหม่ ถ้ามีตารางชื่อเดิมอยู่แล้วใน `final_project` จะเกิด error ให้สำรองข้อมูลก่อน และใช้ฐานข้อมูลทดสอบใหม่หรือลบตารางเดิมตามลำดับ FK ก่อนรันซ้ำ

## ขั้นที่ 2 — ตั้งค่า connection string
เปิด `Web.config` แล้วแก้ `Data Source=.` ให้ตรงกับ Server name ใน SSMS เช่น
- `Data Source=.;Initial Catalog=final_project;Integrated Security=True;TrustServerCertificate=True;`
- SQL Express อาจเป็น `Data Source=.\SQLEXPRESS;Initial Catalog=final_project;Integrated Security=True;TrustServerCertificate=True;`
- LocalDB อาจเป็น `Data Source=(localdb)\MSSQLLocalDB;Initial Catalog=final_project;Integrated Security=True;TrustServerCertificate=True;`

Windows Authentication ใช้สิทธิ์ Windows account ที่รัน IIS Express/เว็บเซิร์ฟเวอร์ บัญชีนั้นต้องมีสิทธิ์อ่าน/เขียนฐานข้อมูล

## ขั้นที่ 3 — เปิดเว็บใน Visual Studio
1. เปิดโฟลเดอร์/สร้าง ASP.NET Web Application (.NET Framework 4.7.2) ใน Visual Studio
2. เพิ่ม `Api.ashx`, `Web.config`, `api-test.html` และโฟลเดอร์ `Frontend` เข้าโปรเจกต์
3. ตรวจว่า project target เป็น .NET Framework 4.7.2 และมี System.Data / System.Web.Extensions
4. ตั้ง `api-test.html` เป็น Start Page แล้วกด Ctrl+F5 หรือ F5
5. เปิด `Api.ashx?action=summary` ใน browser ควรเห็น JSON ตัวเลขสรุป ถ้าได้ 500 ให้ตรวจ connection string และ error detail

> ถ้าเปิด `api-test.html` ด้วยการดับเบิลคลิก (URL ขึ้นต้น `file://`) การเรียก API จะไม่ทำงาน ต้องเปิดผ่าน IIS Express/Visual Studio บน origin เดียวกับ `Api.ashx`

## API ที่มีให้
GET:
- `Api.ashx?action=summary`
- `Api.ashx?action=requisitions`
- `Api.ashx?action=vendors`
- `Api.ashx?action=staff`
- `Api.ashx?action=budgets`
- `Api.ashx?action=purchase-orders`
- `Api.ashx?action=approvals`

POST JSON:
- `Api.ashx?action=create-requisition`
- `Api.ashx?action=approve`

ตัวอย่าง JSON สร้างใบขอซื้อ:
```json
{
  "requester_staff_id": 1,
  "budget_id": 1,
  "preferred_vendor_id": 1,
  "purpose": "อุปกรณ์สำนักงาน",
  "items": [
    { "item_name": "Keyboard", "quantity": 2, "unit_price": 450.00 }
  ]
}
```

ตัวอย่าง JSON อนุมัติ:
```json
{ "requisition_id": 1, "approver_staff_id": 2, "vendor_id": 1 }
```

## ก่อนทดสอบ workflow
ต้องมีข้อมูลพื้นฐานใน `departments`, `staff`, `vendors` และ `budget_limits` ก่อนสร้างใบขอซื้อ โดยต้องมีพนักงาน active ที่มี `staff_role` เป็น `Manager`, `Procurement` และ `CFO` อย่างน้อยบทบาทละหนึ่งคน ระบบสร้างขั้นอนุมัติ 3 ระดับตามลำดับ Manager → Procurement → CFO

หลังสร้างใบขอซื้อ ให้เรียก API approve ทีละขั้นโดยใช้ staff_id ที่ตรงกับ role ของขั้นปัจจุบัน เมื่ออนุมัติครบ Stored Procedure จะสร้าง Purchase Order และ PO_Items พร้อมตรวจงบประมาณใน Transaction

## ข้อควรทราบ
- ชื่อ role และลำดับอนุมัติเป็นกติกาตัวอย่างที่ผูกกับ schema ปัจจุบัน แก้ให้ตรง business rules ที่อาจารย์กำหนดได้
- API นี้เป็น starter สำหรับงานเรียนและ local demo ไม่ใช่ระบบ production: ยังไม่มีระบบ login/authorization, CSRF protection, rate limiting หรือ audit log สำหรับ API calls
- `schema.sql` สร้างฐานข้อมูล/ตารางและ database objects แต่ไม่ได้สร้าง mock data 500 records ให้อัตโนมัติ
