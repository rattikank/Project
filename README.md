# Procurement Management System

ระบบจัดการงานจัดซื้อจัดจ้าง สำหรับจัดการใบขอซื้อ (Requisitions) การอนุมัติ ใบสั่งซื้อ (Purchase Orders) การรับสินค้า และการติดตามงบประมาณ

## เทคโนโลยีที่ใช้

- **Frontend:** HTML, CSS, JavaScript
- **Backend:** ASP.NET Web Handler (`Api.ashx`) บน .NET Framework 4.7.2
- **Database:** Microsoft SQL Server
- **Database access:** ADO.NET (`System.Data.SqlClient`)
- **Development tool:** Visual Studio และ SQL Server Management Studio (SSMS)

## ฟังก์ชันหลัก

- เข้าสู่ระบบด้วย Username และ Password
- Dashboard สำหรับดูภาพรวมข้อมูลจัดซื้อ
- ค้นหาและติดตามใบขอซื้อ
- สร้างใบขอซื้อและรายการสินค้า
- ตรวจสอบและดำเนินการอนุมัติตามลำดับ
- จัดการใบสั่งซื้อ (Purchase Orders)
- บันทึกและติดตามการรับสินค้า (Goods Receipts)
- ดูข้อมูลโปรไฟล์ผู้ใช้งาน
- จัดการข้อมูลผ่าน API ที่เชื่อมต่อกับ SQL Server

> ฟังก์ชันที่ผู้ใช้แต่ละตำแหน่งสามารถทำได้จริงขึ้นอยู่กับการตรวจสอบสิทธิ์ที่พัฒนาไว้ในแต่ละหน้าและ API

## บัญชีสำหรับทดสอบการเข้าสู่ระบบ

ใช้บัญชีตัวอย่างต่อไปนี้เพื่อทดสอบการเข้าสู่ระบบตามตำแหน่ง โดยกรอก Username และ Password ให้ตรงตามตาราง

| ตำแหน่ง | ชื่อผู้ใช้ (Username) | รหัสผ่าน (Password) |
|---|---|---|
| CEO | `ceo` | `ceo123` |
| CFO | `cfo` | `cfo123` |
| Manager | `Manager` | `Manager123` |
| Procurement | `procurement` | `procurement123` |
| Staff | `staff` | `staff123` |

**หมายเหตุ:** บัญชีเหล่านี้เป็นบัญชีตัวอย่างสำหรับการพัฒนาและสาธิตเท่านั้น ต้องนำเข้าไฟล์ข้อมูล SQL ที่มีบัญชีดังกล่าวก่อนจึงจะเข้าสู่ระบบได้ บัญชีที่มี `is_active = 0` จะไม่สามารถเข้าสู่ระบบผ่าน API ปัจจุบันได้

## วิธีติดตั้งและรันโปรเจกต์

### 1. เตรียมเครื่องมือ

ติดตั้งหรือเตรียมสิ่งต่อไปนี้ให้พร้อม

1. Visual Studio ที่รองรับ **.NET Framework 4.7.2** และ IIS Express
2. Microsoft SQL Server
3. SQL Server Management Studio (SSMS)

### 2. สร้างฐานข้อมูลและนำเข้าข้อมูล

1. เปิด SSMS และเชื่อมต่อ SQL Server instance ที่ใช้งาน
2. เลือกฐานข้อมูลที่ใช้กับโปรเจกต์ (ตัวอย่างใน `Web.config` ใช้ชื่อ `final_project`)
3. รันสคริปต์สร้างตารางและความสัมพันธ์ของฐานข้อมูลก่อน หากยังไม่ได้สร้างตาราง
4. รัน `logic.sql` เพื่อสร้างฟังก์ชัน Stored Procedures, Triggers หรือ View ที่โปรเจกต์ใช้งาน
5. รัน `Data.sql` เพื่อนำเข้าข้อมูลตัวอย่าง รวมถึงบัญชีสำหรับทดสอบ

> **คำเตือน:** `Data.sql` เป็นสคริปต์สำหรับโหลดข้อมูลตัวอย่างใหม่ โดยมีคำสั่งลบข้อมูลเดิมในหลายตารางก่อนนำเข้าข้อมูล ควรสำรองฐานข้อมูลก่อนรัน และอย่ารันกับฐานข้อมูลที่มีข้อมูลจริงที่ต้องการเก็บไว้

### 3. ตั้งค่า Connection String

เปิดไฟล์ `Final_project/Web.config` แล้วแก้ `Data Source` ให้ตรงกับชื่อ Server ใน SSMS ตัวอย่างเช่น SQL Server Express:

```xml
<connectionStrings>
  <add name="ProcurementDb"
       connectionString="Data Source=.\SQLEXPRESS;Initial Catalog=final_project;Integrated Security=True;TrustServerCertificate=True;"
       providerName="System.Data.SqlClient" />
</connectionStrings>
```

หากใช้ SQL Server instance อื่น ให้เปลี่ยน `Data Source` ให้ตรงกับเครื่องของคุณ และตรวจสอบว่า Windows account ที่รัน Visual Studio/IIS Express มีสิทธิ์เข้าถึงฐานข้อมูล

### 4. เปิดและรันเว็บ

1. เปิด `Final_project/Final_project.csproj` ด้วย Visual Studio
2. ตรวจสอบว่าโปรเจกต์ใช้ .NET Framework 4.7.2
3. ตรวจสอบว่า `Web.config` เชื่อมต่อฐานข้อมูลถูกต้อง
4. ตั้ง `index.html` เป็นหน้าเริ่มต้น หาก Visual Studio ยังไม่ได้ตั้งไว้
5. กด **F5** เพื่อรันพร้อม Debug หรือ **Ctrl+F5** เพื่อรันโดยไม่ Debug
6. หน้าเข้าสู่ระบบจะปรากฏขึ้น ให้ใช้บัญชีทดสอบจากตารางด้านบน

**อย่าเปิด `index.html` ด้วยการดับเบิลคลิกจาก File Explorer** เพราะหน้าเว็บต้องเรียก `Api.ashx` ผ่านเว็บเซิร์ฟเวอร์ของ Visual Studio/IIS Express

## ไฟล์สำคัญ

| ไฟล์ | รายละเอียด |
|---|---|
| `Final_project/index.html` | หน้าเข้าสู่ระบบ |
| `Final_project/dashboard.html` | หน้า Dashboard |
| `Final_project/requisitions.html` | หน้าใบขอซื้อ |
| `Final_project/requisition-create.html` | หน้าสร้างใบขอซื้อ |
| `Final_project/approvals.html` | หน้ารายการอนุมัติ |
| `Final_project/approval-detail.html` | หน้ารายละเอียดการอนุมัติ |
| `Final_project/purchase-orders.html` | หน้ารายการใบสั่งซื้อ |
| `Final_project/goods-receipts.html` | หน้ารับสินค้า |
| `Final_project/profile.html` | หน้าโปรไฟล์ |
| `Final_project/Api.ashx` | Backend API และการตรวจสอบข้อมูลเข้าสู่ระบบ |
| `Final_project/script.js` | JavaScript สำหรับการทำงานของหน้าเว็บ |
| `Final_project/styles.css` | รูปแบบและการจัดวางหน้าเว็บ |
| `Final_project/Web.config` | การตั้งค่าเว็บและ Connection String |
| `Data/schema.sql` | สร้างตารางฐานข้อมูล |
| `Data/Data.sql` | ข้อมูลตัวอย่างสำหรับฐานข้อมูล |
| `Data/logic.sql` | ฟังก์ชัน Stored Procedures และตรรกะฐานข้อมูล |
| `Data/queries.sql` | ตัวอย่างคำสั่ง SQL สำหรับเรียกดูและวิเคราะห์ข้อมูล |

## การแก้ปัญหาเบื้องต้น

- **เข้าสู่ระบบไม่ได้:** ตรวจสอบ Username/Password, ตรวจสอบว่าข้อมูลบัญชีอยู่ในตาราง `dbo.staff` และ `is_active = 1`
- **API ตอบกลับ HTTP 500:** ตรวจสอบ Connection String, ชื่อฐานข้อมูล, ตารางและคอลัมน์ที่ API เรียกใช้ รวมถึงรายละเอียด Error ใน Visual Studio
- **เชื่อมต่อฐานข้อมูลไม่ได้:** ตรวจสอบ `Data Source`, `Initial Catalog` และสิทธิ์ Windows Authentication
- **หน้าเว็บเปิดได้แต่ข้อมูลไม่ขึ้น:** ให้รันเว็บผ่าน Visual Studio/IIS Express ไม่ใช่ `file://` และตรวจสอบแท็บ Network/Console ใน Developer Tools
- **ไม่พบตารางหรือ Stored Procedure:** ตรวจสอบว่าได้รันสคริปต์สร้างโครงสร้างฐานข้อมูลและ `logic.sql` ครบแล้ว

## ข้อควรระวังด้านความปลอดภัย

บัญชีและรหัสผ่านใน README นี้เป็นข้อมูลทดสอบสำหรับงานเรียนเท่านั้น ไม่ควรใช้รหัสผ่านเหล่านี้ในระบบจริง และไม่ควรเผยแพร่ข้อมูลส่วนบุคคลหรือ Connection String ที่มีรหัสผ่านจริงขึ้น GitHub
