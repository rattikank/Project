
-- function --
-- ยอดรวมใบขอซื้อ ไม่มีรายการ = 0
CREATE OR ALTER FUNCTION [dbo].[fn_requisition_total] (@requisition_id INT)
RETURNS DECIMAL(13,2)
AS
BEGIN
    DECLARE @total DECIMAL(13,2);

    SELECT @total = SUM(ri.[line_total])
    FROM [dbo].[requisition_items] AS ri
    WHERE ri.[requisition_id] = @requisition_id;

    RETURN ISNULL(@total, 0);
END;
GO

-- งบคงเหลือของก้อนงบ ไม่พบงบ = NULL
CREATE OR ALTER FUNCTION [dbo].[fn_remaining_budget] (@budget_id INT)
RETURNS DECIMAL(13,2)
AS
BEGIN
    DECLARE @remaining DECIMAL(13,2);

    SELECT @remaining = b.[budget_amount] - b.[used_amount]
    FROM [dbo].[budget_limits] AS b
    WHERE b.[budget_id] = @budget_id;

    RETURN @remaining;
END;
GO

-- ลำดับอนุมัติปัจจุบัน = ลำดับต่ำสุดที่ยัง Pending ไม่มีแล้ว = NULL
CREATE OR ALTER FUNCTION [dbo].[fn_current_approval_level] (@requisition_id INT)
RETURNS INT
AS
BEGIN
    DECLARE @level INT;

    SELECT @level = MIN(a.[approval_level])
    FROM [dbo].[approvals] AS a
    WHERE a.[requisition_id] = @requisition_id
      AND a.[approval_status] = 'Pending';

    RETURN @level;
END;
GO

-- stored procedure --
CREATE OR ALTER PROCEDURE [dbo].[sp_approve_purchase_order]
    @requisition_id         INT,
    @approver_staff_id      INT,
    @decision               VARCHAR(10)   = 'Approved',   -- 'Approved' หรือ 'Rejected'
    @vendor_id              INT           = NULL,          -- ไม่ระบุ = ใช้ผู้ขายที่เสนอในใบขอซื้อ
    @vat_rate               DECIMAL(5,2)  = 7.00,          -- อัตรา VAT ของ PO (vendor ไม่จด VAT ให้ส่ง 0)
    @comments               NVARCHAR(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @now                 DATETIME2(0) = SYSDATETIME(),
            @today               DATE         = CAST(SYSDATETIME() AS DATE),
            @status              VARCHAR(20),
            @budget_id           INT,
            @preferred_vendor_id INT,
            @current_level       INT,
            @subtotal            DECIMAL(13,2),
            @total               DECIMAL(13,2),
            @locked_budget_id    INT,
            @po_id               INT,
            @result_message      NVARCHAR(200);

    -- ตรวจพารามิเตอร์ก่อนเปิด Transaction
    IF @decision IS NULL OR @decision NOT IN ('Approved', 'Rejected')
        THROW 50201, '@decision ต้องเป็น Approved หรือ Rejected', 1;
    IF @decision = 'Rejected' AND NULLIF(LTRIM(RTRIM(@comments)), '') IS NULL
        THROW 50202, 'กรุณาระบุเหตุผลการปฏิเสธใน @comments', 1;
    IF @vat_rate IS NULL OR @vat_rate NOT BETWEEN 0 AND 30
        THROW 50203, 'อัตรา VAT ต้องอยู่ระหว่าง 0 ถึง 30', 1;

    BEGIN TRY
        BEGIN TRANSACTION;

        -- อ่านและล็อกใบขอซื้อ (กันการอนุมัติซ้อนกัน)
        SELECT @status              = r.[status],
               @budget_id           = r.[budget_id],
               @preferred_vendor_id = r.[preferred_vendor_id]
        FROM [dbo].[requisitions] AS r WITH (UPDLOCK, HOLDLOCK)
        WHERE r.[requisition_id] = @requisition_id;

        IF @status IS NULL
            THROW 50204, 'ไม่พบใบขอซื้อที่ระบุ', 1;
        IF @status <> 'Pending Approval'
            THROW 50205, 'ใบขอซื้อนี้ไม่ได้อยู่ในสถานะรออนุมัติ', 1;

        -- ต้องเป็นผู้อนุมัติของลำดับปัจจุบัน และยังทำงานอยู่
        SET @current_level = [dbo].[fn_current_approval_level](@requisition_id);

        IF NOT EXISTS (SELECT 1
                       FROM [dbo].[approvals] AS a
                       INNER JOIN [dbo].[staff] AS s ON s.[staff_id] = a.[approver_staff_id]
                       WHERE a.[requisition_id]    = @requisition_id
                         AND a.[approval_level]    = @current_level
                         AND a.[approver_staff_id] = @approver_staff_id
                         AND s.[is_active] = 1)
            THROW 50206, 'ผู้ใช้ไม่ใช่ผู้อนุมัติในลำดับปัจจุบัน', 1;

        IF @decision = 'Rejected'
        BEGIN
            -- ปฏิเสธ: ลำดับนี้ Rejected, ลำดับที่เหลือ Cancelled, ใบขอซื้อ Rejected
            UPDATE [dbo].[approvals]
            SET [approval_status] = 'Rejected', [approved_at] = @now, [comments] = @comments
            WHERE [requisition_id] = @requisition_id AND [approval_level] = @current_level;

            UPDATE [dbo].[approvals]
            SET [approval_status] = 'Cancelled', [approved_at] = @now
            WHERE [requisition_id] = @requisition_id AND [approval_status] = 'Pending';

            UPDATE [dbo].[requisitions]
            SET [status] = 'Rejected'
            WHERE [requisition_id] = @requisition_id;

            SET @result_message = 'ปฏิเสธใบขอซื้อแล้ว';
        END
        ELSE
        BEGIN
            -- อนุมัติลำดับปัจจุบัน
            UPDATE [dbo].[approvals]
            SET [approval_status] = 'Approved', [approved_at] = @now, [comments] = @comments
            WHERE [requisition_id] = @requisition_id AND [approval_level] = @current_level;

            IF [dbo].[fn_current_approval_level](@requisition_id) IS NOT NULL
                SET @result_message = 'อนุมัติลำดับที่ ' + CAST(@current_level AS NVARCHAR(10))
                                    + ' แล้ว รอผู้อนุมัติลำดับถัดไป';
            ELSE
            BEGIN
                -- ลำดับสุดท้าย: ผู้ขายต้อง Active
                SET @vendor_id = COALESCE(@vendor_id, @preferred_vendor_id);

                IF NOT EXISTS (SELECT 1 FROM [dbo].[vendors] AS v
                               WHERE v.[vendor_id] = @vendor_id AND v.[status] = 'Active')
                    THROW 50207, 'ต้องระบุผู้ขายที่อยู่ในสถานะ Active', 1;

                SET @subtotal = [dbo].[fn_requisition_total](@requisition_id);
                SET @total    = @subtotal + ROUND(@subtotal * @vat_rate / 100, 2);

                -- ล็อกก้อนงบ แล้วตรวจงบคงเหลือ (เทียบยอดรวม VAT)
                SELECT @locked_budget_id = b.[budget_id]
                FROM [dbo].[budget_limits] AS b WITH (UPDLOCK, HOLDLOCK)
                WHERE b.[budget_id] = @budget_id;

                IF @total > ISNULL([dbo].[fn_remaining_budget](@budget_id), 0)
                    THROW 50208, 'งบประมาณคงเหลือไม่เพียงพอ', 1;

                -- สร้างใบสั่งซื้อ → trg_check_budget_exceeded ตัดงบให้อัตโนมัติ
                INSERT INTO [dbo].[purchase_orders]
                    ([requisition_id], [vendor_id], [po_date], [subtotal_amount], [vat_rate], [status])
                VALUES
                    (@requisition_id, @vendor_id, @today, @subtotal, @vat_rate, 'Issued');

                SET @po_id = CAST(SCOPE_IDENTITY() AS INT);

                -- คัดลอกรายการพร้อมราคา ณ วันออก PO (Price Snapshot)
                -- (requisition_id, line_no) = FK ไปยังรายการในใบขอซื้อ (CONVERTED TO)
                INSERT INTO [dbo].[po_items]
                    ([requisition_id], [po_id], [line_no], [item_name], [quantity], [unit_price])
                SELECT ri.[requisition_id], @po_id, ri.[line_no], ri.[item_name], ri.[quantity], ri.[unit_price]
                FROM [dbo].[requisition_items] AS ri
                WHERE ri.[requisition_id] = @requisition_id;

                -- ปิดใบขอซื้อ
                UPDATE [dbo].[requisitions]
                SET [status] = 'Approved'
                WHERE [requisition_id] = @requisition_id;

                SET @result_message = 'อนุมัติครบทุกลำดับและออกใบสั่งซื้อแล้ว';
            END;
        END;

        COMMIT TRANSACTION;

        -- ผลลัพธ์รูปแบบเดียวทุกกรณี
        SELECT @result_message                     AS [result_message],
               @requisition_id                     AS [requisition_id],
               @current_level                      AS [approval_level],
               p.[po_id],
               p.[total_amount],
               [dbo].[fn_remaining_budget](@budget_id) AS [remaining_budget]
        FROM (VALUES (1)) AS one_row (n)
        LEFT JOIN [dbo].[purchase_orders] AS p ON p.[po_id] = @po_id;
    END TRY
    BEGIN CATCH
        IF XACT_STATE() <> 0
            ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO

-- trigger --
CREATE OR ALTER TRIGGER [dbo].[trg_check_budget_exceeded]
ON [dbo].[purchase_orders]
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    -- ตรวจสอบว่ามีการเปลี่ยนแปลงข้อมูลใน PO
    IF NOT EXISTS (SELECT 1 FROM inserted) AND NOT EXISTS (SELECT 1 FROM deleted)
        RETURN;

    -- ยกเลิกได้เฉพาะ PO ที่ยังไม่รับของ
    IF EXISTS (SELECT 1 FROM inserted AS i
               INNER JOIN deleted AS d ON d.[po_id] = i.[po_id]
               WHERE i.[status] = 'Cancelled' AND d.[status] NOT IN ('Issued', 'Cancelled'))
        THROW 50302, 'ยกเลิกได้เฉพาะใบสั่งซื้อที่ยังไม่ได้รับสินค้า (สถานะ Issued)', 1;

    -- PO ที่ยกเลิกแล้วห้ามนำกลับมาใช้
    IF EXISTS (SELECT 1 FROM inserted AS i
               INNER JOIN deleted AS d ON d.[po_id] = i.[po_id]
               WHERE d.[status] = 'Cancelled' AND i.[status] <> 'Cancelled')
        THROW 50303, 'ไม่สามารถเปลี่ยนสถานะใบสั่งซื้อที่ถูกยกเลิกแล้ว', 1;

    -- รวมยอดที่เปลี่ยนแปลงต่อก้อนงบ
    DECLARE @changes TABLE (
        [budget_id]     INT           NOT NULL PRIMARY KEY,
        [change_amount] DECIMAL(18,2) NOT NULL
    );

    INSERT INTO @changes ([budget_id], [change_amount])
    SELECT r.[budget_id], SUM(x.[amount])
    FROM (
        SELECT i.[requisition_id],
               CASE WHEN i.[status] = 'Cancelled' THEN 0 ELSE i.[total_amount] END AS [amount]
        FROM inserted AS i
        UNION ALL
        SELECT d.[requisition_id],
               CASE WHEN d.[status] = 'Cancelled' THEN 0 ELSE -d.[total_amount] END
        FROM deleted AS d
    ) AS x
    INNER JOIN [dbo].[requisitions] AS r ON r.[requisition_id] = x.[requisition_id]
    GROUP BY r.[budget_id]
    HAVING SUM(x.[amount]) <> 0;

    -- ไม่มียอดเปลี่ยน เช่น เปลี่ยนสถานะ Issued → Received
    IF NOT EXISTS (SELECT 1 FROM @changes)
        RETURN;     

    -- ตรวจว่างบคงเหลือพอสำหรับยอดที่เพิ่มขึ้น
    IF EXISTS (SELECT 1 FROM @changes AS c
               WHERE c.[change_amount] > 0
                 AND c.[change_amount] > ISNULL([dbo].[fn_remaining_budget](c.[budget_id]), 0))
        THROW 50301, 'ยอดใบสั่งซื้อเกินงบประมาณคงเหลือของแผนก', 1;

    -- ตัดงบ / คืนงบ (CHECK ck_budget_limits_used กันกรณีทำรายการพร้อมกันอีกชั้น)
    UPDATE b
    SET b.[used_amount] = b.[used_amount] + c.[change_amount]
    FROM [dbo].[budget_limits] AS b
    INNER JOIN @changes AS c ON c.[budget_id] = b.[budget_id];
END;
GO

-- view --
CREATE OR ALTER VIEW [dbo].[vw_procurement_budget_status]
AS
SELECT
    b.[budget_id],
    b.[fiscal_year],
    d.[department_code],
    d.[department_name],
    b.[budget_amount],
    b.[used_amount],
    b.[budget_amount] - b.[used_amount] AS [remaining_amount],
    CAST(CASE WHEN b.[budget_amount] = 0 THEN 0
              ELSE b.[used_amount] * 100.0 / b.[budget_amount]
              END AS DECIMAL(5,2)) AS [used_percent],
    pend.[pending_count] AS [pending_requisition_count],
    ISNULL(pend.[pending_amount], 0) AS [pending_approval_amount],  -- ก่อน VAT
    po.[po_count],
    po.[vendor_count],
    tv.[vendor_name] AS [top_vendor_name],
    tv.[vendor_total] AS [top_vendor_amount]
FROM [dbo].[budget_limits] AS b
INNER JOIN [dbo].[departments] AS d ON d.[department_id] = b.[department_id]
-- ใบขอซื้อที่รออนุมัติ
OUTER APPLY (
    SELECT COUNT(*) AS [pending_count],
           SUM([dbo].[fn_requisition_total](r.[requisition_id])) AS [pending_amount]
    FROM [dbo].[requisitions] AS r
    WHERE r.[budget_id] = b.[budget_id]
      AND r.[status] = 'Pending Approval'
) AS pend
-- ใบสั่งซื้อที่ยังไม่ยกเลิก
OUTER APPLY (
    SELECT COUNT(*) AS [po_count],
           COUNT(DISTINCT p.[vendor_id]) AS [vendor_count]
    FROM [dbo].[purchase_orders] AS p
    INNER JOIN [dbo].[requisitions] AS r ON r.[requisition_id] = p.[requisition_id]
    WHERE r.[budget_id] = b.[budget_id]
      AND p.[status] <> 'Cancelled'
) AS po
-- ผู้ขายที่มียอดซื้อสูงสุดของก้อนงบนี้
OUTER APPLY (
    SELECT TOP (1) v.[vendor_name], SUM(p.[total_amount]) AS [vendor_total]
    FROM [dbo].[purchase_orders] AS p
    INNER JOIN [dbo].[requisitions] AS r ON r.[requisition_id] = p.[requisition_id]
    INNER JOIN [dbo].[vendors] AS v ON v.[vendor_id] = p.[vendor_id]
    WHERE r.[budget_id] = b.[budget_id]
      AND p.[status] <> 'Cancelled'
    GROUP BY v.[vendor_id], v.[vendor_name]
    ORDER BY SUM(p.[total_amount]) DESC
) AS tv;
GO