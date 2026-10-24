USE final_project;
GO

------------- สร้าง table

CREATE TABLE [dbo].[staff] ( 
    [staff_id]      INT NOT NULL IDENTITY(1,1), 
    [department_id] INT NOT NULL,
    [first_name]    NVARCHAR(100) NOT NULL,
    [last_name]     NVARCHAR(100) NOT NULL, 
    [email]         VARCHAR(50) NOT NULL, 
    [phone]         VARCHAR(20) NULL,
    [address]       NVARCHAR(255) NULL,
    [staff_role]    VARCHAR(50) NOT NULL CONSTRAINT [df_staff_role] DEFAULT ('Staff'),
    [is_active]     BIT NOT NULL CONSTRAINT [df_staff_is_active] DEFAULT (1),
    [username]      VARCHAR(50) NOT NULL,
    [password]      VARCHAR(255) NOT NULL, 

    CONSTRAINT [pk_staff]        PRIMARY KEY ([staff_id]),
    CONSTRAINT [uq_staff_email]  UNIQUE ([email]),
    CONSTRAINT [uq_staff_user]   UNIQUE ([username]), 
    CONSTRAINT [ck_staff_role]   CHECK ([staff_role] IN ('Staff', 'Manager', 'Procurement', 'CFO', 'CEO')),
    CONSTRAINT [ck_staff_phone]  CHECK ([phone] IS NULL OR (LEN([phone]) BETWEEN 9 AND 10 AND [phone] NOT LIKE '%[^0-9]%'))
) 
GO
CREATE TABLE [dbo].[departments] ( 
    [department_id] int NOT NULL IDENTITY(1,1), 
    [department_code] varchar(20) NOT NULL, 
    [department_name] nvarchar(100) NOT NULL,
    [is_active] BIT NOT NULL CONSTRAINT [df_departments_is_active] DEFAULT (1),

    CONSTRAINT [pk_departments]      PRIMARY KEY ([department_id]),
    CONSTRAINT [uq_departments_code] UNIQUE ([department_code])
) 
GO 

CREATE TABLE [dbo].[vendors] ( 
    [vendor_id] int NOT NULL IDENTITY(1,1), 
    [vendor_name] nvarchar(150) NOT NULL, 
    [tax_id] varchar(20) NOT NULL, 
    [phone] varchar(20) NULL,
    [email] varchar(100) NULL, 
    [address] nvarchar(255) NULL,
    [status] varchar(20) NOT NULL CONSTRAINT [df_vendors_status] DEFAULT ('Active'),

    CONSTRAINT [pk_vendors]        PRIMARY KEY ([vendor_id]),
    CONSTRAINT [uq_vendors_tax_id] UNIQUE ([tax_id]),
    CONSTRAINT [ck_vendors_tax_id] CHECK (LEN([tax_id]) = 13 AND [tax_id] NOT LIKE '%[^0-9]%'),
    CONSTRAINT [ck_vendors_status] CHECK ([status] IN ('Active', 'Inactive', 'Blacklisted')),
    CONSTRAINT [ck_vendors_phone]  CHECK ([phone] IS NULL OR (LEN([phone]) BETWEEN 9 AND 10 AND [phone] NOT LIKE '%[^0-9]%'))
) 
GO 

CREATE TABLE [dbo].[requisitions] ( 
    [requisition_id] int NOT NULL IDENTITY(1,1), 
    [requester_staff_id] int NOT NULL, 
    [budget_id] int NOT NULL,
    [preferred_vendor_id]  INT NULL,
    [request_date] date NOT NULL CONSTRAINT [df_requisitions_request_date] DEFAULT (CAST(SYSDATETIME() AS DATE)), 
    [status] varchar(30) NOT NULL CONSTRAINT [df_requisitions_status]       DEFAULT ('Draft'),
    [purpose] nvarchar(255) NULL,

    CONSTRAINT [pk_requisitions]        PRIMARY KEY ([requisition_id]),
    CONSTRAINT [ck_requisitions_status] CHECK ([status] IN ('Draft', 'Pending Approval', 'Approved', 'Rejected', 'Cancelled'))
)
GO 

-- weak entity  PK = คีย์ของเจ้าของ + partial key
CREATE TABLE [dbo].[requisition_items] ( 
    [requisition_id] int NOT NULL,
    [line_no] int NOT NULL, 
    [item_name] nvarchar(150) NOT NULL, 
    [quantity] int NOT NULL, 
    [unit_price] decimal(12,2) NOT NULL, 
    [line_total] AS ([quantity] * [unit_price]),

    CONSTRAINT [pk_requisition_items]       PRIMARY KEY ([requisition_id], [line_no]),
    CONSTRAINT [ck_requisition_items_line]  CHECK ([line_no] > 0),
    CONSTRAINT [ck_requisition_items_qty]   CHECK ([quantity] > 0),
    CONSTRAINT [ck_requisition_items_price] CHECK ([unit_price] >= 0)
) 
GO 

-- vat_amount และ total_amount เป็น derived attribute 
CREATE TABLE [dbo].[purchase_orders] ( 
    [po_id] int NOT NULL IDENTITY(1,1), 
    [requisition_id] int NOT NULL, 
    [vendor_id] int NOT NULL, 
    [po_date] date NOT NULL              CONSTRAINT [df_purchase_orders_po_date] DEFAULT (CAST(SYSDATETIME() AS DATE)), 
    [status] varchar(30) NOT NULL        CONSTRAINT [df_purchase_orders_status]  DEFAULT ('Issued'),
    [subtotal_amount]  DECIMAL(13,2) NOT NULL,
    [vat_rate] DECIMAL(5,2) NOT NULL     CONSTRAINT [df_purchase_orders_vat]     DEFAULT (7.00),
    [vat_amount]       AS CAST(ROUND([subtotal_amount] * [vat_rate] / 100, 2) AS DECIMAL(13,2)),
    [total_amount]     AS CAST([subtotal_amount] + ROUND([subtotal_amount] * [vat_rate] / 100, 2) AS DECIMAL(14,2)),

    CONSTRAINT [pk_purchase_orders]             PRIMARY KEY ([po_id]),
    CONSTRAINT [uq_purchase_orders_requisition] UNIQUE ([requisition_id]),
    CONSTRAINT [ck_purchase_orders_subtotal]    CHECK ([subtotal_amount] >= 0),
    CONSTRAINT [ck_purchase_orders_vat]         CHECK ([vat_rate] BETWEEN 0 AND 30),
    CONSTRAINT [ck_purchase_orders_status]      CHECK ([status] IN ('Issued', 'Partially Received', 'Received', 'Cancelled'))
) 
GO 

-- weak entity
--  (requisition_id, line_no) เป็น FK ไปยังรายการในใบขอซื้อ และ UNIQUE (รายการหนึ่งบรรทัดในใบขอซื้อ (req item) ถูกนำไปออกใบสั่งซื้อได้ไม่เกิน 1 ครั้ง)
CREATE TABLE [dbo].[po_items] ( 
    [requisition_id] INT NOT NULL,
    [po_id] INT NOT NULL,
    [line_no] INT NOT NULL,
    [item_name] nvarchar(150) NOT NULL, 
    [quantity] int NOT NULL, 
    [unit_price] decimal(12,2) NOT NULL,
    [line_total] AS ([quantity]*[unit_price]),

    CONSTRAINT [pk_po_items]                  PRIMARY KEY ([po_id], [line_no]),
    CONSTRAINT [uq_po_items_requisition_line] UNIQUE ([requisition_id], [line_no]),
    CONSTRAINT [ck_po_items_line]             CHECK ([line_no] > 0),
    CONSTRAINT [ck_po_items_qty]              CHECK ([quantity] > 0),
    CONSTRAINT [ck_po_items_price]            CHECK ([unit_price] >= 0)
)
GO 

CREATE TABLE [dbo].[budget_limits] ( 
    [budget_id] int NOT NULL IDENTITY(1,1), 
    [department_id] int NOT NULL, 
    [fiscal_year] int NOT NULL, 
    [budget_amount] decimal(14,2) NOT NULL, 
    [used_amount] decimal(14,2) NOT NULL CONSTRAINT [df_budget_limits_used] DEFAULT (0),

    CONSTRAINT [pk_budget_limits]           PRIMARY KEY ([budget_id]),
    CONSTRAINT [uq_budget_limits_dept_year] UNIQUE ([department_id], [fiscal_year]),
    CONSTRAINT [ck_budget_limits_year]      CHECK ([fiscal_year] BETWEEN 2000 AND 2100),
    CONSTRAINT [ck_budget_limits_amount]    CHECK ([budget_amount] >= 0),
    CONSTRAINT [ck_budget_limits_used]      CHECK ([used_amount] >= 0 AND [used_amount] <= [budget_amount])
) 
GO 

-- weak entity
CREATE TABLE [dbo].[approvals] ( 
    [requisition_id] int NOT NULL,
    [approver_staff_id] INT NOT NULL,  
    [approval_level] int NOT NULL,          
    [approval_status] varchar(30) NOT NULL CONSTRAINT [df_approvals_status] DEFAULT ('Pending'),
    [approved_at] datetime2 NULL, 
    [comments] nvarchar(500) NULL,

    CONSTRAINT [pk_approvals]          PRIMARY KEY ([requisition_id], [approval_level]),
    CONSTRAINT [ck_approvals_level]    CHECK ([approval_level] BETWEEN 1 AND 3),
    CONSTRAINT [ck_approvals_status]   CHECK ([approval_status] IN ('Pending', 'Approved', 'Rejected', 'Cancelled')),
    CONSTRAINT [ck_approvals_decision] CHECK (
        ([approval_status] = 'Pending'  AND [approved_at] IS NULL) OR
        ([approval_status] <> 'Pending' AND [approved_at] IS NOT NULL))
) 
GO 

CREATE TABLE [dbo].[goods_receipts] ( 
    [receipt_id] int NOT NULL IDENTITY(1,1), 
    [po_id] int NOT NULL,
    [line_no] int NOT NULL,
    [received_by_staff_id] int NOT NULL, 
    [received_date] date NOT NULL CONSTRAINT [df_goods_receipts_date] DEFAULT (CAST(SYSDATETIME() AS DATE)),
    [received_status] varchar(30) NOT NULL,

    CONSTRAINT [pk_goods_receipts]        PRIMARY KEY ([receipt_id]),
    CONSTRAINT [ck_goods_receipts_status] CHECK ([received_status] IN ('Accepted', 'Partial', 'Rejected'))
) 
GO 

--- สร้าง fk 

ALTER TABLE [dbo].[staff] ADD CONSTRAINT [fk_staff_department]
    FOREIGN KEY ([department_id]) REFERENCES [dbo].[departments] ([department_id])
    ON DELETE NO ACTION ON UPDATE NO ACTION;
 
ALTER TABLE [dbo].[budget_limits] ADD CONSTRAINT [fk_budget_limits_department]
    FOREIGN KEY ([department_id]) REFERENCES [dbo].[departments] ([department_id])
    ON DELETE NO ACTION ON UPDATE NO ACTION;
 
ALTER TABLE [dbo].[requisitions] ADD CONSTRAINT [fk_requisitions_requester]
    FOREIGN KEY ([requester_staff_id]) REFERENCES [dbo].[staff] ([staff_id])
    ON DELETE NO ACTION ON UPDATE NO ACTION;
 
ALTER TABLE [dbo].[requisitions] ADD CONSTRAINT [fk_requisitions_budget]
    FOREIGN KEY ([budget_id]) REFERENCES [dbo].[budget_limits] ([budget_id])
    ON DELETE NO ACTION ON UPDATE NO ACTION;
 
ALTER TABLE [dbo].[requisitions] ADD CONSTRAINT [fk_requisitions_preferred_vendor]
    FOREIGN KEY ([preferred_vendor_id]) REFERENCES [dbo].[vendors] ([vendor_id])
    ON DELETE NO ACTION ON UPDATE NO ACTION;
 
--weak entity
ALTER TABLE [dbo].[requisition_items] ADD CONSTRAINT [fk_requisition_items_requisition]
    FOREIGN KEY ([requisition_id]) REFERENCES [dbo].[requisitions] ([requisition_id])
    ON DELETE CASCADE ON UPDATE NO ACTION;
 
ALTER TABLE [dbo].[approvals] ADD CONSTRAINT [fk_approvals_requisition]
    FOREIGN KEY ([requisition_id]) REFERENCES [dbo].[requisitions] ([requisition_id])
    ON DELETE CASCADE ON UPDATE NO ACTION;
 
ALTER TABLE [dbo].[approvals] ADD CONSTRAINT [fk_approvals_approver]
    FOREIGN KEY ([approver_staff_id]) REFERENCES [dbo].[staff] ([staff_id])
    ON DELETE NO ACTION ON UPDATE NO ACTION;
 
ALTER TABLE [dbo].[purchase_orders] ADD CONSTRAINT [fk_purchase_orders_requisition]
    FOREIGN KEY ([requisition_id]) REFERENCES [dbo].[requisitions] ([requisition_id])
    ON DELETE NO ACTION ON UPDATE NO ACTION;
 
ALTER TABLE [dbo].[purchase_orders] ADD CONSTRAINT [fk_purchase_orders_vendor]
    FOREIGN KEY ([vendor_id]) REFERENCES [dbo].[vendors] ([vendor_id])
    ON DELETE NO ACTION ON UPDATE NO ACTION;
 
ALTER TABLE [dbo].[po_items] ADD CONSTRAINT [fk_po_items_purchase_order]
    FOREIGN KEY ([po_id]) REFERENCES [dbo].[purchase_orders] ([po_id])
    ON DELETE CASCADE ON UPDATE NO ACTION;
 
ALTER TABLE [dbo].[po_items] ADD CONSTRAINT [fk_po_items_requisition_item]
    FOREIGN KEY ([requisition_id], [line_no]) REFERENCES [dbo].[requisition_items] ([requisition_id], [line_no])
    ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[goods_receipts] ADD CONSTRAINT [fk_goods_receipts_po_item]
    FOREIGN KEY ([po_id], [line_no]) REFERENCES [dbo].[po_items] ([po_id], [line_no])
    ON DELETE NO ACTION ON UPDATE NO ACTION;
 
ALTER TABLE [dbo].[goods_receipts] ADD CONSTRAINT [fk_goods_receipts_receiver]
    FOREIGN KEY ([received_by_staff_id]) REFERENCES [dbo].[staff] ([staff_id])
    ON DELETE NO ACTION ON UPDATE NO ACTION;
GO
------- สร้าง indexes 

-- หาแผนก กับ บทบาทของพนักงาน
CREATE INDEX [ix_staff_department_role]         ON [dbo].[staff] ([department_id], [staff_role]);
-- ค้นหา/เรียงผู้ขายตามชื่อ
CREATE INDEX [ix_vendors_vendor_name]           ON [dbo].[vendors] ([vendor_name]);
-- ดึงใบขอซื้อของพนักงานแต่ละคน เรียงตามวันที่
CREATE INDEX [ix_requisitions_requester]        ON [dbo].[requisitions] ([requester_staff_id], [request_date]);
-- หาใบขอซื้อของงบแต่ละก้อนตามสถานะ
CREATE INDEX [ix_requisitions_budget_status]    ON [dbo].[requisitions] ([budget_id], [status]);
-- หาใบขอซื้อที่ระบุผู้ขายรายนี้ไว้เป็นตัวเลือก
CREATE INDEX [ix_requisitions_preferred_vendor] ON [dbo].[requisitions] ([preferred_vendor_id]);
-- งานรออนุมัติ
CREATE INDEX [ix_approvals_approver_status]     ON [dbo].[approvals] ([approver_staff_id], [approval_status])
    INCLUDE ([requisition_id], [approval_level]);
-- ดูประวัติการสั่งซื้อต่อผู้ขาย และรายงานยอดสั่งซื้อต่อผู้ขายตามช่วงเวลา
CREATE INDEX [ix_purchase_orders_vendor]        ON [dbo].[purchase_orders] ([vendor_id], [po_date]);
-- ค้น PO ตามช่วงวันที่ 
CREATE INDEX [ix_purchase_orders_po_date]       ON [dbo].[purchase_orders] ([po_date]);
-- ค้น PO ตามสถานะ
CREATE INDEX [ix_purchase_orders_status]        ON [dbo].[purchase_orders] ([status]);
-- หาประวัติการตรวจรับของแต่ละรายการของ PO
CREATE INDEX [ix_goods_receipts_po_item]        ON [dbo].[goods_receipts] ([po_id], [line_no]) INCLUDE ([received_status], [received_date]);
-- หาใบตรวจรับที่พนักงานคนหนึ่งเป็นผู้ตรวจรับ
CREATE INDEX [ix_goods_receipts_receiver]       ON [dbo].[goods_receipts] ([received_by_staff_id]);
-- ค้นใบตรวจรับตามช่วงวันที่
CREATE INDEX [ix_goods_receipts_received_date]  ON [dbo].[goods_receipts] ([received_date]);
GO