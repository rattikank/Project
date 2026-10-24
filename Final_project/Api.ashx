<%@ WebHandler Language="C#" Class="ProcurementApi" %>
using System;
using System.Collections;
using System.Collections.Generic;
using System.Configuration;
using System.Data;
using System.Data.SqlClient;
using System.IO;
using System.Web;
using System.Web.Script.Serialization;


public class ProcurementApi : IHttpHandler, System.Web.SessionState.IRequiresSessionState
{
    private readonly JavaScriptSerializer json = new JavaScriptSerializer();
    private string Cs { get { return ConfigurationManager.ConnectionStrings["ProcurementDb"].ConnectionString; } }
    public bool IsReusable { get { return false; } }

    public void ProcessRequest(HttpContext ctx)
    {
        ctx.Response.ContentType = "application/json; charset=utf-8";
        ctx.Response.ContentEncoding = System.Text.Encoding.UTF8;
        ctx.Response.Headers["X-Content-Type-Options"] = "nosniff";
        try
        {
            string action = (ctx.Request["action"] ?? "").Trim().ToLowerInvariant();
            if (ctx.Request.HttpMethod == "OPTIONS") { ctx.Response.StatusCode = 204; return; }
            if (ctx.Request.HttpMethod == "GET") HandleGet(ctx, action);
            else if (ctx.Request.HttpMethod == "POST") HandlePost(ctx, action);
            else Write(ctx, 405, new { error = "Method not allowed" });
        }
        catch (Exception ex)
        {
            // Return a safe message for the UI; detailed errors belong in server logs.
            Write(ctx, 500, new { error = "Request failed. Check the server connection and input values.", detail = ex.Message });
        }
    }

    private void HandleGet(HttpContext ctx, string action)
    {
        using (SqlConnection c = new SqlConnection(Cs))
        {
            c.Open();


            switch (action)
            {
                                
               
case "requisition-detail":
{
    int requisitionId;

    if (!Int32.TryParse(ctx.Request["id"], out requisitionId) ||
        requisitionId <= 0)
    {
        Write(ctx, 400, new { error = "Invalid requisition ID" });
        break;
    }

    // ดึงข้อมูลใบขอซื้อ พร้อมคำนวณยอดก่อน VAT, VAT 7% และยอดสุทธิ
    DataTable requisition = Query(c, @"
        SELECT
            r.requisition_id,
            'REQ-' + CAST(r.requisition_id AS VARCHAR(20))
                AS requisition_no,
            r.request_date,
            r.status,
            r.purpose,

            LTRIM(RTRIM(
                COALESCE(s.first_name, '') + ' ' +
                COALESCE(s.last_name, '')
            )) AS requester_name,

            COALESCE(d.department_name, N'-') AS department,
            COALESCE(v.vendor_name, N'-') AS vendor_name,

            CAST(
                COALESCE(x.subtotal_amount, 0)
                AS DECIMAL(18,2)
            ) AS subtotal_amount,

            CAST(0.07 AS DECIMAL(5,4)) AS vat_rate,

            CAST(
                ROUND(
                    COALESCE(x.subtotal_amount, 0) * 0.07,
                    2
                )
                AS DECIMAL(18,2)
            ) AS vat_amount,

            CAST(
                COALESCE(x.subtotal_amount, 0)
                + ROUND(
                    COALESCE(x.subtotal_amount, 0) * 0.07,
                    2
                )
                AS DECIMAL(18,2)
            ) AS total_amount

        FROM dbo.requisitions AS r

        LEFT JOIN dbo.staff AS s
            ON s.staff_id = r.requester_staff_id

        LEFT JOIN dbo.departments AS d
            ON d.department_id = s.department_id

        LEFT JOIN dbo.vendors AS v
            ON v.vendor_id = r.preferred_vendor_id

        OUTER APPLY (
            SELECT SUM(i.line_total) AS subtotal_amount
            FROM dbo.requisition_items AS i
            WHERE i.requisition_id = r.requisition_id
        ) AS x

        WHERE r.requisition_id = " + requisitionId);

    if (requisition.Rows.Count == 0)
    {
        Write(ctx, 404, new { error = "Requisition not found" });
        break;
    }

    // รายการสินค้าในใบขอซื้อ
    DataTable items = Query(c, @"
        SELECT
            line_no,
            item_name,
            quantity,
            unit_price,
            line_total
        FROM dbo.requisition_items
        WHERE requisition_id = " + requisitionId + @"
        ORDER BY line_no");

    // ประวัติการอนุมัติ
    DataTable approvals = Query(c, @"
        SELECT
            a.approval_level,
            a.approval_status,
            a.approved_at,
            a.comments,

            LTRIM(RTRIM(
                COALESCE(s.first_name, '') + ' ' +
                COALESCE(s.last_name, '')
            )) AS approver_name

        FROM dbo.approvals AS a

        LEFT JOIN dbo.staff AS s
            ON s.staff_id = a.approver_staff_id

        WHERE a.requisition_id = " + requisitionId + @"
        ORDER BY a.approval_level");

    Write(ctx, 200, new
    {
        requisition = Rows(requisition)[0],
        items = Rows(items),
        approvals = Rows(approvals)
    });

    break;
}

                case "summary":
                    DataTable t = Query(c, @"SELECT
                        (SELECT COUNT(*) FROM dbo.requisitions) AS requisitions_count,
                        (SELECT COUNT(*) FROM dbo.requisitions WHERE status='Pending Approval') AS pending_count,
                        (SELECT COUNT(*) FROM dbo.purchase_orders WHERE status<>'Cancelled') AS purchase_orders_count,
                        (SELECT COALESCE(SUM(used_amount),0) FROM dbo.budget_limits) AS budget_used,
                        (SELECT COALESCE(SUM(budget_amount),0) FROM dbo.budget_limits) AS budget_total");
                    Write(ctx, 200, Rows(t));
                    break;

                case "requisitions":
                    Write(ctx, 200, Rows(Query(c, @"SELECT r.requisition_id, r.request_date, r.status, r.purpose,
                        s.first_name + N' ' + s.last_name AS requester,
                        d.department_name, b.fiscal_year, v.vendor_name,
                        COALESCE(x.subtotal,0) AS subtotal
                        FROM dbo.requisitions r
                        JOIN dbo.staff s ON s.staff_id=r.requester_staff_id
                        JOIN dbo.budget_limits b ON b.budget_id=r.budget_id
                        JOIN dbo.departments d ON d.department_id=b.department_id
                        LEFT JOIN dbo.vendors v ON v.vendor_id=r.preferred_vendor_id
                        OUTER APPLY (SELECT SUM(line_total) subtotal FROM dbo.requisition_items i WHERE i.requisition_id=r.requisition_id) x
                        ORDER BY r.request_date DESC, r.requisition_id DESC")));
                    break;

                        
                
                case "requisition-list":
                {
                    // 1. ตรวจสอบว่าผู้ใช้เข้าสู่ระบบแล้วหรือไม่
                    if (ctx.Session == null ||
                        ctx.Session["staff_id"] == null)
                    {
                        Write(ctx, 401, new
                        {
                            success = false,
                            error = "กรุณาเข้าสู่ระบบก่อน"
                        });
                        break;
                    }

                    // 2. อ่านข้อมูลผู้ใช้จาก Session ฝั่งเซิร์ฟเวอร์
                    int staffId = Convert.ToInt32(
                        ctx.Session["staff_id"]
                    );

                    string staffRole = Convert.ToString(
                        ctx.Session["staff_role"]
                    );

                    bool canViewAll = 
                        string.Equals(
                            staffRole,
                            "CEO",
                            StringComparison.OrdinalIgnoreCase
                        )
                        ||
                        string.Equals(
                            staffRole,
                            "CFO",
                            StringComparison.OrdinalIgnoreCase
                        );

                    // 3. ดึงข้อมูลตามสิทธิ์
                    using (SqlCommand cmd = new SqlCommand(@"
                        SELECT
                            r.requisition_id,
                            'REQ-' + CAST(r.requisition_id AS VARCHAR(20))
                                AS requisition_no,

                            LTRIM(RTRIM(
                                COALESCE(s.first_name, '') + ' ' +
                                COALESCE(s.last_name, '')
                            )) AS requester_name,

                            COALESCE(d.department_code, '')
                                AS department_code,

                            COALESCE(d.department_name, N'-')
                                AS department,

                            CONVERT(VARCHAR(10), r.request_date, 23)
                                AS request_date,

                            COALESCE(ri.total_amount, 0)
                                AS total_amount,

                            r.status

                        FROM dbo.requisitions AS r

                        LEFT JOIN dbo.staff AS s
                            ON s.staff_id = r.requester_staff_id

                        LEFT JOIN dbo.departments AS d
                            ON d.department_id = s.department_id

                        OUTER APPLY (
                            SELECT SUM(i.line_total) AS total_amount
                            FROM dbo.requisition_items AS i
                            WHERE i.requisition_id = r.requisition_id
                        ) AS ri

                        WHERE
                            @canViewAll = 1
                            OR r.requester_staff_id = @staff_id

                        ORDER BY
                            r.request_date DESC,
                            r.requisition_id DESC;
                    ", c))
                    {
                        cmd.Parameters.Add(
                            "@canViewAll", SqlDbType.Bit
                        ).Value = canViewAll;

                        cmd.Parameters.Add(
                            "@staff_id", SqlDbType.Int
                        ).Value = staffId;

                        DataTable requisitionList = new DataTable();

                        using (SqlDataAdapter adapter =
                            new SqlDataAdapter(cmd))
                        {
                            adapter.Fill(requisitionList);
                        }

                        // ส่ง Array กลับให้ JavaScript ใช้งาน
                        Write(ctx, 200, Rows(requisitionList));
                    }

                    break;
                }



                case "vendors":
                    Write(ctx, 200, Rows(Query(c, "SELECT vendor_id, vendor_name, tax_id, phone, email, status FROM dbo.vendors ORDER BY vendor_name")));
                    break;

                case "staff":
                    Write(ctx, 200, Rows(Query(c, "SELECT staff_id, first_name, last_name, staff_role, department_id FROM dbo.staff WHERE is_active=1 ORDER BY first_name,last_name")));
                    break;

               
                case "budgets":
                {
                    if (ctx.Session == null ||
                        ctx.Session["staff_id"] == null)
                    {
                        Write(ctx, 401, new
                        {
                            success = false,
                            error = "กรุณาเข้าสู่ระบบก่อน"
                        });
                        break;
                    }

                    int departmentId;

                    if (!Int32.TryParse(
                        ctx.Request.QueryString["department_id"],
                        out departmentId))
                    {
                        Write(ctx, 200, new object[0]);
                        break;
                    }

                    using (SqlCommand cmd = new SqlCommand(@"
                        SELECT
                            budget_id,
                            department_id,
                            fiscal_year,
                            budget_amount,
                            used_amount,
                            budget_amount - used_amount AS remaining_amount
                        FROM dbo.budget_limits
                        WHERE department_id = @department_id
                        ORDER BY fiscal_year DESC;
                    ", c))
                    {
                        cmd.Parameters.Add("@department_id", SqlDbType.Int).Value =
                            departmentId;

                        using (SqlDataAdapter adapter = new SqlDataAdapter(cmd))
                        {
                            DataTable dt = new DataTable();
                            adapter.Fill(dt);

                            Write(ctx, 200, Rows(dt));
                        }
                    }

                    break;
                }

                case "purchase-orders":
                    Write(ctx, 200, Rows(Query(c, @"SELECT p.po_id,p.po_date,p.status,p.subtotal_amount,p.vat_rate,p.vat_amount,p.total_amount,
                        v.vendor_name,r.requisition_id,d.department_name
                        FROM dbo.purchase_orders p JOIN dbo.vendors v ON v.vendor_id=p.vendor_id
                        JOIN dbo.requisitions r ON r.requisition_id=p.requisition_id
                        JOIN dbo.budget_limits b ON b.budget_id=r.budget_id
                        JOIN dbo.departments d ON d.department_id=b.department_id
                        ORDER BY p.po_date DESC,p.po_id DESC")));
                    break;
                       
                case "purchase-order-list":
                {
                    DataTable purchaseOrderList = Query(c, @"
                        SELECT
                            po.po_id,
                            'PO-' + RIGHT(
                                '000000' + CAST(po.po_id AS VARCHAR(20)), 6
                            ) AS po_number,

                            po.requisition_id,
                            'REQ-' + CAST(po.requisition_id AS VARCHAR(20))
                                AS requisition_number,

                            COALESCE(v.vendor_name, N'-') AS vendor_name,
                            COALESCE(d.department_code, '') AS department_code,
                            COALESCE(d.department_name, N'-') AS department,

                            CONVERT(VARCHAR(10), po.po_date, 23) AS po_date,

                            COALESCE(po.subtotal_amount, 0) AS subtotal_amount,
                            COALESCE(po.vat_rate, 7.00) AS vat_rate,
                            COALESCE(
                                po.vat_amount,
                                ROUND(COALESCE(po.subtotal_amount, 0)
                                    * COALESCE(po.vat_rate, 7.00) / 100.0, 2)
                            ) AS vat_amount,

                            -- Prefer the saved net total. If it is NULL, rebuild it
                            -- from subtotal + saved/calculated VAT (do not double-add VAT).
                            COALESCE(
                                po.total_amount,
                                COALESCE(po.subtotal_amount, 0) + COALESCE(
                                    po.vat_amount,
                                    ROUND(COALESCE(po.subtotal_amount, 0)
                                        * COALESCE(po.vat_rate, 7.00) / 100.0, 2)
                                ),
                                0
                            ) AS total_amount,

                            COALESCE(po.status, '') AS status

                        FROM dbo.purchase_orders AS po

                        LEFT JOIN dbo.requisitions AS r
                            ON r.requisition_id = po.requisition_id

                        LEFT JOIN dbo.vendors AS v
                            ON v.vendor_id = po.vendor_id

                        LEFT JOIN dbo.staff AS s
                            ON s.staff_id = r.requester_staff_id

                        LEFT JOIN dbo.departments AS d
                            ON d.department_id = s.department_id

                        ORDER BY po.po_date DESC, po.po_id DESC
                    ");

        Write(ctx, 200, Rows(purchaseOrderList));
        break;
    }


                case "approvals":
                    Write(ctx, 200, Rows(Query(c, @"SELECT a.requisition_id,a.approval_level,a.approval_status,a.approved_at,a.comments,
                        s.first_name+' '+s.last_name AS approver,r.request_date,r.status AS requisition_status
                        FROM dbo.approvals a JOIN dbo.staff s ON s.staff_id=a.approver_staff_id
                        JOIN dbo.requisitions r ON r.requisition_id=a.requisition_id
                        ORDER BY r.request_date DESC,a.approval_level")));
                    break;

               
                
                
                    case "approval-list":
                    {
                        if (ctx.Session == null ||
                            ctx.Session["staff_id"] == null)
                        {
                            Write(ctx, 401, new
                            {
                                success = false,
                                error = "กรุณาเข้าสู่ระบบก่อน"
                            });
                            break;
                        }

                        int staffId = Convert.ToInt32(ctx.Session["staff_id"]);

                        DataTable approvalList;

                        using (SqlCommand cmd = new SqlCommand(@"
                            SELECT
                                r.requisition_id,
                                LTRIM(RTRIM(
                                    COALESCE(s.first_name, '') + ' ' +
                                    COALESCE(s.last_name, '')
                                )) AS requester_name,
                                d.department_code AS department_code,
                                COALESCE(d.department_name, N'-') AS department,
                                CONVERT(VARCHAR(10), r.request_date, 23)
                                    AS request_date,
                                COALESCE(ri.total_amount, 0) AS total_amount,
                                COALESCE(v.vendor_name, N'-') AS vendor_name,
                                r.status,
                                a.approval_level,
                                a.approval_status
                            FROM dbo.approvals AS a
                            INNER JOIN dbo.requisitions AS r
                                ON r.requisition_id = a.requisition_id
                            LEFT JOIN dbo.staff AS s
                                ON s.staff_id = r.requester_staff_id
                            LEFT JOIN dbo.departments AS d
                                ON d.department_id = s.department_id
                            LEFT JOIN dbo.vendors AS v
                                ON v.vendor_id = r.preferred_vendor_id
                            OUTER APPLY (
                                SELECT SUM(i.line_total) AS total_amount
                                FROM dbo.requisition_items AS i
                                WHERE i.requisition_id = r.requisition_id
                            ) AS ri
                            WHERE a.approver_staff_id = @staff_id
                              AND a.approval_status = 'Pending'
                            ORDER BY r.request_date DESC,
                                     a.approval_level ASC,
                                     r.requisition_id DESC;
                        ", c))
                        {
                            cmd.Parameters.Add("@staff_id", SqlDbType.Int).Value = staffId;

                            DataTable dt = new DataTable();

                            using (SqlDataAdapter adapter = new SqlDataAdapter(cmd))
                            {
                                adapter.Fill(dt);
                            }

                            approvalList = dt;
                        }

                        Write(ctx, 200, Rows(approvalList));
                        break;
                    }




                case "monthly-requisitions":
                    string sql = @"
                        SELECT
                            YEAR(request_date) AS request_year,
                            MONTH(request_date) AS request_month,
                            COUNT(*) AS requisition_count
                        FROM dbo.requisitions
                        WHERE request_date >= DATEADD(
                            MONTH, -11,
                            DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1)
                        )
                        GROUP BY
                            YEAR(request_date),
                            MONTH(request_date)
                        ORDER BY
                            request_year,
                            request_month;";

                    Write(ctx, 200, Rows(Query(c, sql)));
                    break;

                
                case "pending-requests":
                    Write(ctx, 200, Rows(Query(c, @"
                        SELECT TOP 10
                            r.requisition_id,
                            d.department_name,
                            COALESCE(x.subtotal, 0) AS total_amount,
                            r.status
                        FROM dbo.requisitions r
                        JOIN dbo.budget_limits b
                            ON b.budget_id = r.budget_id
                        JOIN dbo.departments d
                            ON d.department_id = b.department_id
                        OUTER APPLY (
                            SELECT SUM(i.line_total) AS subtotal
                            FROM dbo.requisition_items i
                            WHERE i.requisition_id = r.requisition_id
                        ) x
                        WHERE r.status = 'Pending Approval'
                        ORDER BY r.request_date DESC, r.requisition_id DESC
                    ")));
                    break;

                
                case "recent-activities":
                    DataTable activities = Query(c, @"
                        SELECT *
                        FROM (
                            SELECT
                                CONVERT(VARCHAR(19), r.request_date, 126)
                                    AS activity_date,
                                N'สร้างใบขอซื้อ' AS activity_type,
                                r.requisition_id AS document_id,
                                s.first_name + N' ' + s.last_name AS actor,
                                r.status AS activity_status,
                                1 AS sort_order
                            FROM dbo.requisitions r
                            JOIN dbo.staff s
                                ON s.staff_id = r.requester_staff_id

                            UNION ALL

                            SELECT
                                CONVERT(VARCHAR(19), p.po_date, 126)
                                    AS activity_date,
                                N'สร้างใบสั่งซื้อ' AS activity_type,
                                p.po_id AS document_id,
                                v.vendor_name AS actor,
                                p.status AS activity_status,
                                2 AS sort_order
                            FROM dbo.purchase_orders p
                            JOIN dbo.vendors v
                                ON v.vendor_id = p.vendor_id
                        ) AS activities
                        ORDER BY activity_date DESC, document_id DESC
                    ");

                    Write(ctx, 200, Rows(activities));
                    break;

                        
                case "goods-receipt-list":
                {
                    DataTable goodsReceiptList = Query(c, @"
                        ;WITH LatestReceipt AS
                        (
                            SELECT
                                gr.receipt_id,
                                gr.po_id,
                                gr.line_no,
                                gr.received_by_staff_id,
                                gr.received_date,
                                gr.received_status,
                                ROW_NUMBER() OVER
                                (
                                    PARTITION BY gr.po_id, gr.line_no
                                    ORDER BY gr.received_date DESC, gr.receipt_id DESC
                                ) AS rn
                            FROM dbo.goods_receipts AS gr
                        ),
                        ReceiptSummary AS
                        (
                            SELECT
                                po_id,
                                COUNT(*) AS item_count,
                                SUM(
                                    CASE
                                        WHEN received_status = 'Accepted'
                                            THEN 1
                                        ELSE 0
                                    END
                                ) AS accepted_count,
                                SUM(
                                    CASE
                                        WHEN received_status = 'Partial'
                                            THEN 1
                                        ELSE 0
                                    END
                                ) AS partial_count,
                                MAX(received_date) AS last_received_date,
                                MAX(receipt_id) AS latest_receipt_id,
                                SUM(
                                    CASE
                                        WHEN received_status = 'Accepted'
                                            THEN 0
                                        ELSE 1
                                    END
                                ) AS outstanding_count
                            FROM LatestReceipt
                            WHERE rn = 1
                            GROUP BY po_id
                        ),
                        POItemsSummary AS
                        (
                            SELECT
                                po_id,
                                SUM(line_total) AS order_amount,
                                COUNT(*) AS total_items
                            FROM dbo.po_items
                            GROUP BY po_id
                        )
                        SELECT
                            COALESCE(rs.latest_receipt_id, po.po_id) AS receipt_id,
                            po.po_id,
                            'PO-' + RIGHT(
                                '000000' + CAST(po.po_id AS VARCHAR(20)), 6
                            ) AS po_number,

                            COALESCE(v.vendor_name, N'-') AS vendor_name,

                            COALESCE(d.department_code, '') AS department_code,
                            COALESCE(d.department_name, N'-') AS department,

                            CONVERT(
                                VARCHAR(10),
                                rs.last_received_date,
                                23
                            ) AS received_date,

                            COALESCE(pi.order_amount, 0) AS order_amount,

                            CASE
                                WHEN rs.po_id IS NULL THEN 0
                                ELSE COALESCE(
                                    (
                                        SELECT SUM(p2.line_total)
                                        FROM dbo.po_items AS p2
                                        INNER JOIN LatestReceipt AS lr
                                            ON lr.po_id = p2.po_id
                                           AND lr.line_no = p2.line_no
                                           AND lr.rn = 1
                                        WHERE p2.po_id = po.po_id
                                          AND lr.received_status = 'Accepted'
                                    ), 0
                                )
                            END AS accepted_amount,

                            COALESCE(pi.order_amount, 0) -
                            CASE
                                WHEN rs.po_id IS NULL THEN 0
                                ELSE COALESCE(
                                    (
                                        SELECT SUM(p2.line_total)
                                        FROM dbo.po_items AS p2
                                        INNER JOIN LatestReceipt AS lr
                                            ON lr.po_id = p2.po_id
                                           AND lr.line_no = p2.line_no
                                           AND lr.rn = 1
                                        WHERE p2.po_id = po.po_id
                                          AND lr.received_status = 'Accepted'
                                    ), 0
                                )
                            END AS remaining_amount,

                            CASE
                                WHEN rs.po_id IS NULL THEN 'Pending'
                                WHEN rs.accepted_count = rs.item_count
                                     AND rs.partial_count = 0
                                    THEN 'Received'
                                WHEN rs.accepted_count > 0
                                     OR rs.partial_count > 0
                                    THEN 'Partial'
                                ELSE 'Pending'
                            END AS receipt_status,

                            COALESCE(rs.item_count, 0) AS receipt_item_count

                        FROM dbo.purchase_orders AS po
                        LEFT JOIN dbo.vendors AS v
                            ON v.vendor_id = po.vendor_id
                        LEFT JOIN dbo.requisitions AS r
                            ON r.requisition_id = po.requisition_id
                        LEFT JOIN dbo.staff AS s
                            ON s.staff_id = r.requester_staff_id
                        LEFT JOIN dbo.departments AS d
                            ON d.department_id = s.department_id
                        LEFT JOIN POItemsSummary AS pi
                            ON pi.po_id = po.po_id
                        LEFT JOIN ReceiptSummary AS rs
                            ON rs.po_id = po.po_id
                        ORDER BY po.po_date DESC, po.po_id DESC
                    ");

                    Write(ctx, 200, Rows(goodsReceiptList));
                    break;
                }

                case "me":
                    {
                        if (ctx.Session == null || ctx.Session["staff_id"] == null)
                        {
                            Write(ctx, 401, new
                            {
                                success = false,
                                error = "กรุณาเข้าสู่ระบบก่อน"
                            });
                            break;
                        }

                        int staffId = Convert.ToInt32(ctx.Session["staff_id"]);

                        using (SqlCommand cmd = new SqlCommand(@"
                            SELECT
                                s.staff_id,
                                s.username,
                                s.first_name,
                                s.last_name,
                                s.email,
                                s.department_id,
                                d.department_name,
                                s.staff_role
                            FROM dbo.staff AS s
                            LEFT JOIN dbo.departments AS d
                                ON d.department_id = s.department_id
                            WHERE s.staff_id = @staff_id
                              AND s.is_active = 1;", c))
                        {
                            cmd.Parameters.Add("@staff_id", SqlDbType.Int).Value = staffId;

                            using (SqlDataReader reader = cmd.ExecuteReader())
                            {
                                if (!reader.Read())
                                {
                                    Write(ctx, 404, new
                                    {
                                        success = false,
                                        error = "ไม่พบข้อมูลผู้ใช้"
                                    });
                                    break;
                                }

                                Write(ctx, 200, new
                                {
                                    success = true,
                                    user = new
                                    {
                                        staff_id = Convert.ToInt32(reader["staff_id"]),
                                        username = Convert.ToString(reader["username"]),
                                        name = (
                                            Convert.ToString(reader["first_name"]) + " " +
                                            Convert.ToString(reader["last_name"])
                                        ).Trim(),
                                        email = reader["email"] == DBNull.Value
                                            ? "" : Convert.ToString(reader["email"]),
                                        department = reader["department_name"] == DBNull.Value
                                            ? "-" : Convert.ToString(reader["department_name"]),
                                        department_id = reader["department_id"] == DBNull.Value
                                            ? (int?)null : Convert.ToInt32(reader["department_id"]),
                                        staff_role = Convert.ToString(reader["staff_role"])
                                    }
                                });

                                break;
                            }
                        }
                    }


                default:
                    Write(ctx, 400, new { error = "Unknown GET action" });
                    break;
            }
        }
    }

    private void HandlePost(HttpContext ctx, string action)
    {
        Dictionary<string, object> body;
        using (StreamReader sr = new StreamReader(ctx.Request.InputStream)) body = json.Deserialize<Dictionary<string, object>>(sr.ReadToEnd());
        if (body == null) { Write(ctx, 400, new { error = "JSON body is required" }); return; }
        using (SqlConnection c = new SqlConnection(Cs))
        {
            c.Open();

                if (action == "login")
                {
                    string username = Str(body, "username");
                    string password = Str(body, "password");

                    if (String.IsNullOrWhiteSpace(username) ||
                        String.IsNullOrEmpty(password))
                    {
                        Write(ctx, 400, new
                        {
                            error = "กรุณากรอกชื่อผู้ใช้และรหัสผ่าน"
                        });
                        return;
                    }

                    using (SqlCommand cmd = new SqlCommand(@"
                        SELECT
                            staff_id,
                            first_name,
                            last_name,
                            staff_role
                        FROM dbo.staff
                        WHERE username = @username
                          AND password = @password
                          AND is_active = 1;", c))
                    {
                        cmd.Parameters.Add("@username", SqlDbType.VarChar, 50)
                            .Value = username.Trim();

                        cmd.Parameters.Add("@password", SqlDbType.VarChar, 256)
                            .Value = password;

                        using (SqlDataReader reader = cmd.ExecuteReader())
                        {
                            if (!reader.Read())
                            {
                                Write(ctx, 401, new
                                {
                                    error = "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"
                                });
                                return;
                            }

                            int staffId = Convert.ToInt32(reader["staff_id"]);
                            string firstName = Convert.ToString(reader["first_name"]);
                            string lastName = Convert.ToString(reader["last_name"]);
                            string role = Convert.ToString(reader["staff_role"]);

                            string staffName = (firstName + " " + lastName).Trim();

                            reader.Close();

                            ctx.Session["staff_id"] = staffId;
                            ctx.Session["staff_name"] = staffName;
                            ctx.Session["staff_role"] = role;

                            Write(ctx, 200, new
                            {
                                success = true,
                                message = "เข้าสู่ระบบสำเร็จ",
                                user = new
                                {
                                    staff_id = staffId,
                                    name = staffName,
                                    staff_role = role
                                }
                            });

                            return;
                        }
                    }
                }

                if (action == "update-profile")
                    {
                        if (ctx.Session == null || ctx.Session["staff_id"] == null)
                        {
                            Write(ctx, 401, new
                            {
                                success = false,
                                error = "กรุณาเข้าสู่ระบบก่อน"
                            });
                            return;
                        }

                        int staffId = Convert.ToInt32(ctx.Session["staff_id"]);
                        string fullName = (Str(body, "full_name") ?? "").Trim();
                        string email = (Str(body, "email") ?? "").Trim();

                        if (String.IsNullOrWhiteSpace(fullName))
                        {
                            Write(ctx, 400, new
                            {
                                success = false,
                                error = "กรุณากรอกชื่อ-นามสกุล"
                            });
                            return;
                        }

                        string[] nameParts = fullName.Split(
                            new char[] { ' ' },
                            2,
                            StringSplitOptions.RemoveEmptyEntries
                        );

                        string firstName = nameParts[0];
                        string lastName = nameParts.Length > 1 ? nameParts[1] : "";

                        using (SqlCommand cmd = new SqlCommand(@"
                            UPDATE dbo.staff
                            SET first_name = @first_name,
                                last_name = @last_name,
                                email = @email
                            WHERE staff_id = @staff_id
                              AND is_active = 1;", c))
                        {
                            cmd.Parameters.Add("@first_name", SqlDbType.NVarChar, 100)
                                .Value = firstName;

                            cmd.Parameters.Add("@last_name", SqlDbType.NVarChar, 100)
                                .Value = lastName;

                            cmd.Parameters.Add("@email", SqlDbType.VarChar, 255)
                                .Value = String.IsNullOrWhiteSpace(email)
                                    ? (object)DBNull.Value
                                    : email;

                            cmd.Parameters.Add("@staff_id", SqlDbType.Int).Value = staffId;

                            int affected = cmd.ExecuteNonQuery();

                            if (affected == 0)
                            {
                                Write(ctx, 404, new
                                {
                                    success = false,
                                    error = "ไม่พบผู้ใช้หรือบัญชีถูกปิดใช้งาน"
                                });
                                return;
                            }
                        }

                        string updatedName = (firstName + " " + lastName).Trim();
                        ctx.Session["staff_name"] = updatedName;

                        Write(ctx, 200, new
                        {
                            success = true,
                            message = "บันทึกข้อมูลโปรไฟล์สำเร็จ"
                        });
                        return;
                    }
                if (action == "change-password")
                    {
                        if (ctx.Session == null || ctx.Session["staff_id"] == null)
                        {
                            Write(ctx, 401, new
                            {
                                success = false,
                                error = "กรุณาเข้าสู่ระบบก่อน"
                            });
                            return;
                        }

                        int staffId = Convert.ToInt32(ctx.Session["staff_id"]);
                        string currentPassword = Str(body, "current_password") ?? "";
                        string newPassword = Str(body, "new_password") ?? "";
                        string confirmPassword = Str(body, "confirm_password") ?? "";

                        if (String.IsNullOrEmpty(currentPassword) ||
                            String.IsNullOrEmpty(newPassword) ||
                            String.IsNullOrEmpty(confirmPassword))
                        {
                            Write(ctx, 400, new
                            {
                                success = false,
                                error = "กรุณากรอกข้อมูลรหัสผ่านให้ครบ"
                            });
                            return;
                        }

                        if (newPassword.Length < 8)
                        {
                            Write(ctx, 400, new
                            {
                                success = false,
                                error = "รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร"
                            });
                            return;
                        }

                        if (newPassword != confirmPassword)
                        {
                            Write(ctx, 400, new
                            {
                                success = false,
                                error = "รหัสผ่านใหม่และการยืนยันรหัสผ่านไม่ตรงกัน"
                            });
                            return;
                        }

                        using (SqlCommand cmd = new SqlCommand(@"
                            UPDATE dbo.staff
                            SET password = @new_password
                            WHERE staff_id = @staff_id
                              AND password = @current_password
                              AND is_active = 1;", c))
                        {
                            cmd.Parameters.Add("@new_password", SqlDbType.VarChar, 256)
                                .Value = newPassword;

                            cmd.Parameters.Add("@staff_id", SqlDbType.Int)
                                .Value = staffId;

                            cmd.Parameters.Add("@current_password", SqlDbType.VarChar, 256)
                                .Value = currentPassword;

                            int affected = cmd.ExecuteNonQuery();

                            if (affected == 0)
                            {
                                Write(ctx, 400, new
                                {
                                    success = false,
                                    error = "รหัสผ่านปัจจุบันไม่ถูกต้อง"
                                });
                                return;
                            }
                        }

                        Write(ctx, 200, new
                        {
                            success = true,
                            message = "เปลี่ยนรหัสผ่านสำเร็จ"
                        });
                        return;
                    }

           
                
                if (action == "create-requisition")
                {
                    // 1. ตรวจสอบ Session
                    if (ctx.Session == null ||
                        ctx.Session["staff_id"] == null)
                    {
                        Write(ctx, 401, new
                        {
                            success = false,
                            error = "กรุณาเข้าสู่ระบบก่อน"
                        });
                        return;
                    }

                    // 2. ใช้ผู้ขอซื้อจาก Session เท่านั้น
                    int requester = Convert.ToInt32(
                        ctx.Session["staff_id"]
                    );

                    int budget = Int(body, "budget_id");
                    int selectedDepartment = Int(body, "department_id");

                    string role = Convert.ToString(
                        ctx.Session["staff_role"]
                    );

                    bool canChooseOtherDepartment =
                        String.Equals(role, "CEO",
                            StringComparison.OrdinalIgnoreCase) ||
                        String.Equals(role, "CFO",
                            StringComparison.OrdinalIgnoreCase);

                    // 3. อ่านแผนกจริงของผู้ใช้
                    int requesterDepartment;

                    using (SqlCommand cmd = new SqlCommand(@"
                        SELECT department_id
                        FROM dbo.staff
                        WHERE staff_id = @staff_id
                          AND is_active = 1;
                    ", c))
                    {
                        cmd.Parameters.Add("@staff_id", SqlDbType.Int).Value =
                            requester;

                        object result = cmd.ExecuteScalar();

                        if (result == null || result == DBNull.Value)
                        {
                            Write(ctx, 403, new
                            {
                                success = false,
                                error = "ไม่พบผู้ใช้ที่มีสิทธิ์ใช้งาน"
                            });
                            return;
                        }

                        requesterDepartment = Convert.ToInt32(result);
                    }

                    // 4. ผู้ใช้ทั่วไปเลือกได้เฉพาะแผนกตัวเอง
                    if (!canChooseOtherDepartment &&
                        selectedDepartment != requesterDepartment)
                    {
                        Write(ctx, 403, new
                        {
                            success = false,
                            error = "คุณไม่มีสิทธิ์สร้างใบขอซื้อในแผนกนี้"
                        });
                        return;
                    }

                    // 5. ตรวจสอบว่างบประมาณเป็นของแผนกที่เลือกจริง
                    using (SqlCommand cmd = new SqlCommand(@"
                        SELECT COUNT(*)
                        FROM dbo.budget_limits
                        WHERE budget_id = @budget_id
                          AND department_id = @department_id;
                    ", c))
                    {
                        cmd.Parameters.Add("@budget_id", SqlDbType.Int).Value =
                            budget;

                        cmd.Parameters.Add("@department_id", SqlDbType.Int).Value =
                            selectedDepartment;

                        int allowed = Convert.ToInt32(cmd.ExecuteScalar());

                        if (allowed == 0)
                        {
                            Write(ctx, 403, new
                            {
                                success = false,
                                error = "งบประมาณไม่ตรงกับแผนกที่เลือก"
                            });
                            return;
                        }
                    }

                    // 6. อ่านข้อมูลใบขอซื้อ
                    int? vendor = NullableInt(body, "preferred_vendor_id");
                    string purpose = Str(body, "purpose");

                    object itemsObj;

                    if (!body.TryGetValue("items", out itemsObj) ||
                        !(itemsObj is ArrayList) ||
                        ((ArrayList)itemsObj).Count == 0)
                    {
                        Write(ctx, 400, new
                        {
                            error = "Add at least one item"
                        });
                        return;
                    }

                    ArrayList items = (ArrayList)itemsObj;

                    // 7. บันทึกใบขอซื้อและรายการสินค้า
                    using (SqlTransaction tx =
                        c.BeginTransaction(IsolationLevel.Serializable))
                    {
                        try
                        {
                            int reqId;

                            using (SqlCommand cmd = new SqlCommand(@"
                                INSERT dbo.requisitions
                                    (requester_staff_id, budget_id,
                                     preferred_vendor_id, status, purpose)
                                VALUES
                                    (@staff, @budget, @vendor,
                                     'Pending Approval', @purpose);

                                SELECT CAST(SCOPE_IDENTITY() AS INT);
                            ", c, tx))
                            {
                                cmd.Parameters.Add("@staff", SqlDbType.Int).Value =
                                    requester;

                                cmd.Parameters.Add("@budget", SqlDbType.Int).Value =
                                    budget;

                                cmd.Parameters.Add("@vendor", SqlDbType.Int).Value =
                                    (object)vendor ?? DBNull.Value;

                                cmd.Parameters.Add("@purpose", SqlDbType.NVarChar, 255).Value =
                                    (object)purpose ?? DBNull.Value;

                                reqId = (int)cmd.ExecuteScalar();
                            }

                            int line = 1;

                            foreach (object obj in items)
                            {
                                Dictionary<string, object> item =
                                    obj as Dictionary<string, object>;

                                if (item == null)
                                    throw new Exception("Invalid item format");

                                string name = Str(item, "item_name");
                                int qty = Int(item, "quantity");
                                decimal price = DecimalVal(item, "unit_price");

                                if (String.IsNullOrWhiteSpace(name) ||
                                    qty <= 0 || price < 0)
                                {
                                    throw new Exception(
                                        "Each item needs a name, positive quantity and non-negative unit price");
                                }

                                using (SqlCommand cmd = new SqlCommand(@"
                                    INSERT dbo.requisition_items
                                        (requisition_id, line_no, item_name,
                                         quantity, unit_price)
                                    VALUES
                                        (@id, @line, @name, @qty, @price);
                                ", c, tx))
                                {
                                    cmd.Parameters.Add("@id", SqlDbType.Int).Value =
                                        reqId;

                                    cmd.Parameters.Add("@line", SqlDbType.Int).Value =
                                        line++;

                                    cmd.Parameters.Add("@name", SqlDbType.NVarChar, 150).Value =
                                        name;

                                    cmd.Parameters.Add("@qty", SqlDbType.Int).Value =
                                        qty;

                                    SqlParameter pp =
                                        cmd.Parameters.Add("@price", SqlDbType.Decimal);

                                    pp.Precision = 12;
                                    pp.Scale = 2;
                                    pp.Value = price;

                                    cmd.ExecuteNonQuery();
                                }
                            }

                            // 8. สร้างขั้นตอนอนุมัติ
                            string[] roles = {
                                "Manager",
                                "Procurement",
                                "CFO"
                            };

                            for (int i = 0; i < roles.Length; i++)
                            {
                                using (SqlCommand cmd = new SqlCommand(@"
                                    SELECT TOP 1 staff_id
                                    FROM dbo.staff
                                    WHERE staff_role = @role
                                      AND is_active = 1
                                    ORDER BY staff_id;
                                ", c, tx))
                                {
                                    cmd.Parameters.Add("@role", SqlDbType.VarChar, 50).Value =
                                        roles[i];

                                    object id = cmd.ExecuteScalar();

                                    if (id == null)
                                    {
                                        throw new Exception(
                                            "An active staff member with role '" +
                                            roles[i] +
                                            "' is required to create approval steps.");
                                    }

                                    using (SqlCommand ins = new SqlCommand(@"
                                        INSERT dbo.approvals
                                            (requisition_id, approver_staff_id,
                                             approval_level, approval_status)
                                        VALUES
                                            (@req, @staff, @level, 'Pending');
                                    ", c, tx))
                                    {
                                        ins.Parameters.Add("@req", SqlDbType.Int).Value =
                                            reqId;

                                        ins.Parameters.Add("@staff", SqlDbType.Int).Value =
                                            id;

                                        ins.Parameters.Add("@level", SqlDbType.Int).Value =
                                            i + 1;

                                        ins.ExecuteNonQuery();
                                    }
                                }
                            }

                            tx.Commit();

                            Write(ctx, 201, new
                            {
                                success = true,
                                message = "Requisition created and sent for approval",
                                requisition_id = reqId
                            });

                            return;
                        }
                        catch
                        {
                            tx.Rollback();
                            throw;
                        }
                    }
                }

            
            
if (action == "approve")
{
    // 1. ตรวจสอบ Session
    if (ctx.Session == null ||
        ctx.Session["staff_id"] == null)
    {
        Write(ctx, 401, new
        {
            success = false,
            error = "กรุณาเข้าสู่ระบบก่อน"
        });
        return;
    }

    // 2. ใช้ตัวตนจาก Session ไม่รับ staff_id จากหน้าเว็บ
    int req = Int(body, "requisition_id");
    int staff = Convert.ToInt32(ctx.Session["staff_id"]);

    string decision = Str(body, "decision");
    string comments = Str(body, "comments");
    int? vendor = NullableInt(body, "vendor_id");

    if (req <= 0)
    {
        Write(ctx, 400, new
        {
            error = "รหัสใบขอซื้อไม่ถูกต้อง"
        });
        return;
    }

    if (String.IsNullOrWhiteSpace(decision))
    {
        Write(ctx, 400, new
        {
            error = "กรุณาระบุผลการพิจารณา"
        });
        return;
    }

    decision = decision.Trim();

    if (!decision.Equals("Approved",
            StringComparison.OrdinalIgnoreCase) &&
        !decision.Equals("Rejected",
            StringComparison.OrdinalIgnoreCase))
    {
        Write(ctx, 400, new
        {
            error = "decision ต้องเป็น Approved หรือ Rejected"
        });
        return;
    }

    if (decision.Equals("Rejected",
            StringComparison.OrdinalIgnoreCase) &&
        String.IsNullOrWhiteSpace(comments))
    {
        Write(ctx, 400, new
        {
            error = "กรุณาระบุเหตุผลกรณีไม่อนุมัติ"
        });
        return;
    }

    // 3. อ่าน VAT
    decimal vatRate = 7.00m;
    object vatValue;

    if (body.TryGetValue("vat_rate", out vatValue) &&
        vatValue != null &&
        !String.IsNullOrWhiteSpace(Convert.ToString(vatValue)))
    {
        if (!Decimal.TryParse(
            Convert.ToString(vatValue),
            System.Globalization.NumberStyles.Number,
            System.Globalization.CultureInfo.InvariantCulture,
            out vatRate))
        {
            Write(ctx, 400, new
            {
                error = "Invalid vat_rate"
            });
            return;
        }
    }

    if (vatRate < 0 || vatRate > 100)
    {
        Write(ctx, 400, new
        {
            error = "vat_rate ต้องอยู่ระหว่าง 0 ถึง 100"
        });
        return;
    }

    // 4. เรียก Stored Procedure
    using (SqlCommand cmd =
        new SqlCommand("dbo.sp_approve_purchase_order", c))
    {
        cmd.CommandType = CommandType.StoredProcedure;

        cmd.Parameters.Add("@requisition_id", SqlDbType.Int).Value =
            req;

        cmd.Parameters.Add("@approver_staff_id", SqlDbType.Int).Value =
            staff;

        cmd.Parameters.Add("@decision", SqlDbType.VarChar, 10).Value =
            decision.Equals("Approved",
                StringComparison.OrdinalIgnoreCase)
                ? "Approved"
                : "Rejected";

        cmd.Parameters.Add("@vendor_id", SqlDbType.Int).Value =
            (object)vendor ?? DBNull.Value;

        SqlParameter vatParam =
            cmd.Parameters.Add("@vat_rate", SqlDbType.Decimal);

        vatParam.Precision = 5;
        vatParam.Scale = 2;
        vatParam.Value = vatRate;

        cmd.Parameters.Add("@comments", SqlDbType.NVarChar, 1000).Value =
            String.IsNullOrWhiteSpace(comments)
                ? (object)DBNull.Value
                : comments.Trim();

        DataTable result = new DataTable();

        using (SqlDataAdapter da = new SqlDataAdapter(cmd))
        {
            da.Fill(result);
        }

        Write(ctx, 200, Rows(result));
        return;
    }
}


        }
    }

    private DataTable Query(SqlConnection c,string sql) { using(SqlCommand cmd=new SqlCommand(sql,c)) { DataTable t=new DataTable(); using(SqlDataAdapter da=new SqlDataAdapter(cmd)) da.Fill(t); return t; } }
    private List<Dictionary<string,object>> Rows(DataTable t) { var list=new List<Dictionary<string,object>>(); foreach(DataRow row in t.Rows) { var d=new Dictionary<string,object>(); foreach(DataColumn col in t.Columns) d[col.ColumnName]=row[col] == DBNull.Value ? null : row[col]; list.Add(d); } return list; }
    private int Int(Dictionary<string,object> d,string k) { object v; int n; if(!d.TryGetValue(k,out v)||v==null||!Int32.TryParse(Convert.ToString(v),out n)) throw new Exception("Missing or invalid field: "+k); return n; }
    private int? NullableInt(Dictionary<string,object> d,string k) { object v; int n; if(!d.TryGetValue(k,out v)||v==null||String.IsNullOrWhiteSpace(Convert.ToString(v))) return null; if(!Int32.TryParse(Convert.ToString(v),out n)) throw new Exception("Invalid field: "+k); return n; }
    private decimal DecimalVal(Dictionary<string,object> d,string k) { object v; decimal n; if(!d.TryGetValue(k,out v)||v==null||!Decimal.TryParse(Convert.ToString(v),out n)) throw new Exception("Missing or invalid field: "+k); return n; }
    private string Str(Dictionary<string,object> d,string k) { object v; return d.TryGetValue(k,out v)&&v!=null ? Convert.ToString(v) : null; }
    private void Write(HttpContext ctx,int code,object value) { ctx.Response.StatusCode=code; ctx.Response.Write(json.Serialize(value)); }
}