-- 1 สำหรับค้นหาและดึงข้อมูลรายการขอซื้อ (Requisitions) จากฐานข้อมูล Procurement & Purchase Order
DECLARE @status        VARCHAR(20)   = NULL;
DECLARE @department_id INT           = NULL;
DECLARE @search        NVARCHAR(100) = NULL;
DECLARE @page          INT           = 1;
DECLARE @page_size     INT           = 10;

SELECT
    r.requisition_id,
    s.first_name,
    d.department_name,
    r.request_date,
    ISNULL(t.total_amount, 0) AS total_amount,
    v.vendor_name,
    r.status,
    COUNT(*) OVER () AS total_rows
FROM dbo.requisitions AS r
JOIN dbo.staff AS s
    ON s.staff_id = r.requester_staff_id
JOIN dbo.budget_limits AS b
    ON b.budget_id = r.budget_id
JOIN dbo.departments AS d
    ON d.department_id = b.department_id
LEFT JOIN dbo.vendors AS v
    ON v.vendor_id = r.preferred_vendor_id
LEFT JOIN (
    SELECT
        requisition_id,
        SUM(line_total) AS total_amount
    FROM dbo.requisition_items
    GROUP BY requisition_id
) AS t
    ON t.requisition_id = r.requisition_id
WHERE
    (@status IS NULL OR r.status = @status)
    AND (@department_id IS NULL
         OR d.department_id = @department_id)
    AND (
        @search IS NULL
        OR r.requisition_id =
           TRY_CAST(REPLACE(UPPER(@search), 'REQ-', '') AS INT)
        OR s.first_name + ' ' + s.last_name
           LIKE '%' + @search + '%'
        OR d.department_name LIKE '%' + @search + '%'
        OR d.department_code = @search
    )
ORDER BY r.request_date, r.requisition_id
OFFSET (@page - 1) * @page_size ROWS
FETCH NEXT @page_size ROWS ONLY;

-- 2 ใช้ดึงข้อมูลประวัติใบสั่งซื้อ (Purchase Orders) ตามปีงบประมาณที่กำหนด โดยแสดงข้อมูลผู้ขอซื้อ ผู้ขาย และยอดเงินของใบสั่งซื้อ
DECLARE @fiscal_year INT = 2026;

SELECT
	p.po_id,
	p.po_date,
	r.requisition_id,
	s.first_name + ' ' + s.last_name AS requester_name,
	v.vendor_name,
	p.subtotal_amount,
	p.vat_amount,
	p.total_amount,
	p.[status]
FROM dbo.purchase_orders AS p
JOIN dbo.requisitions    AS r ON r.requisition_id = p.requisition_id
JOIN dbo.staff           AS s ON s.staff_id       = r.requester_staff_id
JOIN dbo.budget_limits   AS b ON b.budget_id      = r.budget_id
JOIN dbo.departments     AS d ON d.department_id  = b.department_id
JOIN dbo.vendors         AS v ON v.vendor_id      = p.vendor_id
WHERE b.fiscal_year = @fiscal_year
ORDER BY p.po_date DESC  , p.po_id DESC;

-- 3 ใช้ดูจำนวนใบสั่งซื้อ ยอดซื้อรวม และเปอร์เซ็นต์การใช้งบประมาณ โดยแสดงเฉพาะแผนกที่มียอดซื้อรวมตั้งแต่ 75% ของงบประมาณขึ้นไป
DECLARE @fiscal_year INT = 2026;

SELECT 
	d.department_code,
	d.department_name,
	b.budget_amount,     
	COUNT(p.po_id)                                                   AS po_count,
	SUM(p.total_amount)                                              AS total_pruchase,
	CAST(100*SUM(p.total_amount)/  NULLIF(b.budget_amount,0) AS DECIMAL (5,2)) AS used_percentage
	FROM dbo.budget_limits AS b
    JOIN dbo.departments AS d     ON d.department_id = b.department_id
    JOIN dbo.requisitions AS r    ON r.budget_id = b.budget_id
    JOIN dbo.purchase_orders AS p ON p.requisition_id = r.requisition_id
	WHERE b.fiscal_year = 2026 AND p.status <> 'Cancelled'
	GROUP BY b.budget_id, d.department_code, d.department_name, b.budget_amount
	HAVING SUM(p.total_amount) >= 0.75 * b.budget_amount
    ORDER BY used_percentage DESC;

-- 4 ตรวจสอบว่าผู้ขายรายใดมียอดขายรวมให้บริษัทสูง และมีแผนกใดบ้างที่สั่งซื้อจากผู้ขายนั้น

DECLARE @fiscal_year INT = 2026

SELECT
    v.vendor_id,
    v.vendor_name,
    COUNT(DISTINCT b.department_id)            AS department_count,
    SUM(p.total_amount)                        AS total_amount,
    CAST(AVG(p.total_amount) AS DECIMAL(13,2)) AS avg_po_amount
FROM dbo.vendors AS v
JOIN dbo.purchase_orders AS p ON p.vendor_id = v.vendor_id
JOIN dbo.requisitions AS r    ON r.requisition_id = p.requisition_id
JOIN dbo.budget_limits AS b   ON b.budget_id = r.budget_id
WHERE b.fiscal_year = @fiscal_year
  AND p.status <> 'Cancelled'
GROUP BY v.vendor_id, v.vendor_name
HAVING SUM(p.total_amount) >= 1000000
ORDER BY total_amount DESC;

-- 5 ใช้สำหรับค้นหาสินค้าที่มีการขอซื้อจากหลายแผนก พร้อมวิเคราะห์ปริมาณและราคาต่อหน่วย

DECLARE @fiscal_year INT = 2026

SELECT
    ri.item_name,
    COUNT(DISTINCT b.department_id)           AS department_count,
    COUNT(*)                                  AS request_lines,
    SUM(ri.quantity)                          AS total_quantity,
    MIN(ri.unit_price)                        AS min_unit_price,
    MAX(ri.unit_price)                        AS max_unit_price,
    CAST(AVG(ri.unit_price) AS DECIMAL(13,2)) AS avg_unit_price
FROM dbo.requisition_items  AS ri
JOIN dbo.requisitions       AS r  ON r.requisition_id = ri.requisition_id
JOIN dbo.budget_limits      AS b ON b.budget_id = r.budget_id
WHERE b.fiscal_year = @fiscal_year
  AND r.status IN ('Approved', 'Pending Approval')
GROUP BY ri.item_name
HAVING COUNT(DISTINCT b.department_id) >= 8
ORDER BY department_count DESC, total_quantity DESC;

-- 6 ใช้สำหรับค้นหาใบขอซื้อที่มียอดรวมสูงกว่าค่าเฉลี่ยของใบขอซื้อในปีงบประมาณที่เลือก

DECLARE @fiscal_year INT = 2026

SELECT
    r.requisition_id,
    d.department_name,
    r.request_date,
    r.[status],
    x.total_amount
FROM dbo.requisitions    AS r
JOIN dbo.budget_limits   AS b   ON b.budget_id     = r.budget_id
JOIN dbo.departments     AS d   ON d.department_id = b.department_id
JOIN (
    SELECT ri.requisition_id,
           SUM(ri.line_total)                  AS total_amount
    FROM dbo.requisition_items                   AS ri
    GROUP BY ri.requisition_id
) AS x ON x.requisition_id = r.requisition_id
WHERE b.fiscal_year = @fiscal_year
  AND r.status <> 'Cancelled'
  AND x.total_amount > (
        SELECT AVG(t.total_amount)
        FROM (
            SELECT SUM(ri2.line_total)   AS total_amount
            FROM dbo.requisition_items   AS ri2
            JOIN dbo.requisitions  AS r2  ON r2.requisition_id = ri2.requisition_id
            JOIN dbo.budget_limits AS b2  ON b2.budget_id = r2.budget_id
            WHERE b2.fiscal_year = @fiscal_year
              AND r2.[status] <> 'Cancelled'
            GROUP BY ri2.requisition_id
        ) AS t
    )
ORDER BY x.total_amount DESC;

-- 7 ใช้สำหรับค้นหาผู้ขายที่ไม่มีใบสั่งซื้อในปีนั้น

DECLARE @year INT = 2026;

DECLARE @start_date DATE = CAST(
    CAST(@year AS VARCHAR(4)) + '-01-01' AS DATE
);

DECLARE @end_date DATE = CAST(
    CAST(@year + 1 AS VARCHAR(4)) + '-01-01' AS DATE
);

SELECT
    v.vendor_id,
    v.vendor_name,
    v.status,
    v.phone,
    (
        SELECT MAX(p2.po_date)
        FROM dbo.purchase_orders AS p2
        WHERE p2.vendor_id = v.vendor_id
          AND p2.status <> 'Cancelled'
    ) AS last_po_date
FROM dbo.vendors AS v
WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.purchase_orders AS p
    WHERE p.vendor_id = v.vendor_id
      AND p.status <> 'Cancelled'
      AND p.po_date >= @start_date
      AND p.po_date < @end_date
)
ORDER BY last_po_date, v.vendor_name;

-- 8 ใช้สำหรับติดตามใบสั่งซื้อที่ยังรับสินค้าไม่ครบ

SELECT
    p.po_id,
    v.vendor_name,
    v.phone,
    p.po_date,
    DATEDIFF(
        DAY,
        p.po_date,
        CAST(GETDATE() AS DATE)
    ) AS days_waiting,
    p.[status],
    (
        SELECT COUNT(*)
        FROM dbo.po_items AS pi
        WHERE pi.po_id = p.po_id
    ) AS total_lines,
    (
        SELECT COUNT(*)
        FROM dbo.po_items AS pi
        WHERE pi.po_id = p.po_id
          AND NOT EXISTS (
              SELECT 1
              FROM dbo.goods_receipts AS g
              WHERE g.po_id = pi.po_id
                AND g.line_no = pi.line_no
                AND g.received_status = 'Accepted'
          )
    ) AS outstanding_lines

FROM dbo.purchase_orders AS p
JOIN dbo.vendors AS v
    ON v.vendor_id = p.vendor_id
WHERE p.[status] IN ('Issued', 'Partially Received')
ORDER BY days_waiting DESC;

-- 9 ใช้สำหรับจัดอันดับใบสั่งซื้อ 3 อันดับแรกของแต่ละแผนกตามยอดเงิน

DECLARE @fiscal_year INT = 2026;

WITH ranked AS (
    SELECT
        d.department_name,
        p.po_id,
        p.po_date,
        v.vendor_name,
        p.total_amount,
        RANK() OVER (PARTITION BY b.department_id ORDER BY p.total_amount DESC)                                AS amount_rank,
        CAST(100.0 * p.total_amount /NULLIF(SUM(p.total_amount) OVER (PARTITION BY b.department_id),0) AS DECIMAL(5,2))  AS percent_of_department
    FROM dbo.purchase_orders AS p
    JOIN dbo.requisitions  AS r  ON r.requisition_id = p.requisition_id
    JOIN dbo.budget_limits AS b  ON b.budget_id = r.budget_id
    JOIN dbo.departments   AS d  ON d.department_id = b.department_id
    JOIN dbo.vendors       AS v  ON v.vendor_id = p.vendor_id
    WHERE b.fiscal_year = @fiscal_year
      AND p.[status] <> 'Cancelled'
)
SELECT department_name, amount_rank, po_id, po_date, vendor_name, total_amount, percent_of_department
FROM ranked
WHERE amount_rank <= 3
ORDER BY department_name, amount_rank;

-- 10 สรุปยอดใบสั่งซื้อรายเดือนและยอดสะสมตามแผนก

DECLARE @fiscal_year INT ;

WITH monthly AS (
    SELECT
        b.budget_id,
        d.department_code,
        b.budget_amount,
        DATEFROMPARTS(YEAR(p.po_date), MONTH(p.po_date), 1) AS po_month,
        COUNT(*)                                            AS po_count,
        SUM(p.total_amount)                                 AS month_amount
    FROM dbo.purchase_orders AS p
    JOIN dbo.requisitions  AS r  ON r.requisition_id = p.requisition_id
    JOIN dbo.budget_limits AS b ON b.budget_id = r.budget_id
    JOIN dbo.departments   AS d   ON d.department_id = b.department_id
    WHERE b.fiscal_year = @fiscal_year
      AND p.[status] <> 'Cancelled'
    GROUP BY b.budget_id,
             d.department_code,
             b.budget_amount,
             DATEFROMPARTS(YEAR(p.po_date), MONTH(p.po_date), 1)
)
SELECT
    department_code,
    po_month,
    po_count,
    month_amount,
    month_amount - LAG(month_amount) OVER (PARTITION BY budget_id ORDER BY po_month)                     AS change_from_prev_month,
    SUM(month_amount) OVER (PARTITION BY budget_id ORDER BY po_month ROWS UNBOUNDED PRECEDING)           AS cumulative_amount,
    CAST(100.0 * SUM(month_amount) OVER (PARTITION BY budget_id ORDER BY po_month ROWS UNBOUNDED PRECEDING)/ budget_amount AS DECIMAL(5,2))                                            AS cumulative_percent
FROM monthly
ORDER BY department_code, po_month;
