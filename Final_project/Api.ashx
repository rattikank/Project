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
{
    if (ctx.Session == null ||
        ctx.Session["staff_id"] == null ||
        ctx.Session["staff_role"] == null)
    {
        Write(ctx, 401, new
        {
            success = false,
            error = "กรุณาเข้าสู่ระบบก่อน"
        });
        break;
    }

    int staffId = Convert.ToInt32(ctx.Session["staff_id"]);
    string role = Convert.ToString(ctx.Session["staff_role"]);

    int departmentId = ctx.Session["department_id"] == null
        ? 0
        : Convert.ToInt32(ctx.Session["department_id"]);

    bool isExecutive =
        role == "CEO" || role == "CFO";

    bool isProcurement =
        role == "Procurement";

    bool isManager =
        role == "Manager";

    bool isStaff =
        role == "Staff";

    if (!isExecutive && departmentId <= 0)
    {
        Write(ctx, 403, new
        {
            success = false,
            error = "ไม่พบข้อมูลแผนกของผู้ใช้งาน"
        });
        break;
    }

    string requisitionFilter;
    string purchaseOrderFilter;
    string budgetFilter;
    string pendingFilter;

    if (isExecutive)
    {
        // CEO / CFO: ดูข้อมูลทุกแผนก
        requisitionFilter = "";
        purchaseOrderFilter = "";
        budgetFilter = "";

        pendingFilter = @"
            WHERE r.status = 'Pending Approval'";
    }
    else if (isStaff)
    {
        // Staff: เฉพาะคำขอที่ตัวเองสร้าง
        requisitionFilter = @"
            WHERE r.requester_staff_id = @staff_id";

        purchaseOrderFilter = @"
            WHERE EXISTS (
                SELECT 1
                FROM dbo.requisitions r
                WHERE r.requisition_id = po.requisition_id
                  AND r.requester_staff_id = @staff_id
            )";

        budgetFilter = @"
            WHERE b.department_id = @department_id";

        pendingFilter = @"
            WHERE r.requester_staff_id = @staff_id
              AND r.status = 'Pending Approval'";
    }
    else if (isProcurement)
    {
        // Procurement: ดูคำขอและ PO จากทุกแผนก
        requisitionFilter = "";
        purchaseOrderFilter = "";

        // ยังคงจำกัดงบประมาณไว้เฉพาะแผนกของผู้ใช้
        budgetFilter = @"
            WHERE b.department_id = @department_id";

        // นับเฉพาะคำขอที่รออนุมัติในระดับ Procurement
        pendingFilter = @"
            WHERE r.status = 'Pending Approval'
              AND EXISTS (
                  SELECT 1
                  FROM dbo.approvals a
                  INNER JOIN dbo.staff s
                      ON s.staff_id = a.approver_staff_id
                  WHERE a.requisition_id = r.requisition_id
                    AND a.approval_status = 'Pending'
                    AND a.approval_level =
                        dbo.fn_current_approval_level(r.requisition_id)
                    AND s.staff_role = 'Procurement'
                    AND s.is_active = 1
              )";
    }
    else if (isManager)
    {
        // Manager: เฉพาะคำขอและ PO ของแผนกตัวเอง
        requisitionFilter = @"
            WHERE EXISTS (
                SELECT 1
                FROM dbo.staff s
                WHERE s.staff_id = r.requester_staff_id
                  AND s.department_id = @department_id
            )";

        purchaseOrderFilter = @"
            WHERE EXISTS (
                SELECT 1
                FROM dbo.requisitions r
                INNER JOIN dbo.staff s
                    ON s.staff_id = r.requester_staff_id
                WHERE r.requisition_id = po.requisition_id
                  AND s.department_id = @department_id
            )";

        budgetFilter = @"
            WHERE b.department_id = @department_id";

        // นับคำขอที่รออนุมัติในแผนกตัวเอง
        pendingFilter = @"
            WHERE r.status = 'Pending Approval'
              AND EXISTS (
                  SELECT 1
                  FROM dbo.staff s
                  WHERE s.staff_id = r.requester_staff_id
                    AND s.department_id = @department_id
              )";
    }
    else
    {
        Write(ctx, 403, new
        {
            success = false,
            error = "ไม่มีสิทธิ์เข้าถึง Dashboard"
        });
        break;
    }

    
int selectedYear;

if (!int.TryParse(
    ctx.Request.QueryString["year"],
    out selectedYear))
{
    selectedYear = DateTime.Now.Year;
}

if (selectedYear < 2000 || selectedYear > 2100)
{
    Write(ctx, 400, new
    {
        success = false,
        error = "ปีที่เลือกไม่ถูกต้อง"
    });
    break;
}

DateTime startDate = new DateTime(selectedYear, 1, 1);
DateTime endDate = new DateTime(selectedYear + 1, 1, 1);

// กรองใบขอซื้อตามปีที่เลือก
string requisitionYearFilter =
    String.IsNullOrWhiteSpace(requisitionFilter)
        ? @"WHERE r.request_date >= @StartDate
              AND r.request_date < @EndDate"
        : requisitionFilter + @"
              AND r.request_date >= @StartDate
              AND r.request_date < @EndDate";

// กรองใบสั่งซื้อตามปีที่เลือก
string purchaseOrderYearFilter =
    String.IsNullOrWhiteSpace(purchaseOrderFilter)
        ? @"WHERE po.po_date >= @StartDate
              AND po.po_date < @EndDate"
        : purchaseOrderFilter + @"
              AND po.po_date >= @StartDate
              AND po.po_date < @EndDate";


    
string summarySql = @"
    SELECT
        (
            SELECT COUNT(*)
            FROM dbo.requisitions r
            " + requisitionYearFilter + @"
        ) AS requisitions_count,

        (
            SELECT COUNT(*)
            FROM dbo.requisitions r
            " + pendingFilter + @"
        ) AS pending_count,

        (
            SELECT COUNT(*)
            FROM dbo.purchase_orders po
            " + purchaseOrderYearFilter + @"
        ) AS purchase_orders_count,

        (
            SELECT COALESCE(SUM(b.used_amount), 0)
            FROM dbo.budget_limits b
            " + budgetFilter + @"
              " + (String.IsNullOrEmpty(budgetFilter)
                    ? "WHERE"
                    : "AND") + @" b.fiscal_year = @SelectedYear
        ) AS budget_used,

        (
            SELECT COALESCE(SUM(b.budget_amount), 0)
            FROM dbo.budget_limits b
            " + budgetFilter + @"
              " + (String.IsNullOrEmpty(budgetFilter)
                    ? "WHERE"
                    : "AND") + @" b.fiscal_year = @SelectedYear
        ) AS budget_total;
";


    using (SqlCommand cmd = new SqlCommand(summarySql, c))
    {
        cmd.Parameters.Add("@staff_id", SqlDbType.Int).Value =
            staffId;

        cmd.Parameters.Add("@department_id", SqlDbType.Int).Value =
            departmentId;

        cmd.Parameters.Add("@StartDate", SqlDbType.Date).Value =
            startDate;

        cmd.Parameters.Add("@EndDate", SqlDbType.Date).Value =
            endDate;

        cmd.Parameters.Add("@SelectedYear", SqlDbType.Int).Value =
            selectedYear;

        DataTable dt = new DataTable();

        using (SqlDataAdapter adapter = new SqlDataAdapter(cmd))
        {
            adapter.Fill(dt);
        }

        Write(ctx, 200, Rows(dt));
    }

    break;
}





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
                    {
                        DataTable vendors = Query(c, @"
                            SELECT
                                vendor_id,
                                vendor_name,
                                tax_id,
                                phone,
                                email,
                                address,
                                status
                            FROM dbo.vendors
                            ORDER BY vendor_name;
                        ");

                        Write(ctx, 200, Rows(vendors));
                        break;
                    }

                case "staff":
                    Write(ctx, 200, Rows(Query(c, "SELECT staff_id, first_name, last_name, staff_role, department_id FROM dbo.staff WHERE is_active=1 ORDER BY first_name,last_name")));
                    break;

               

                case "department-budget-list":
                {
                    if (ctx.Session == null ||
                        ctx.Session["staff_id"] == null ||
                        ctx.Session["staff_role"] == null)
                    {
                        Write(ctx, 401, new
                        {
                            success = false,
                            error = "กรุณาเข้าสู่ระบบก่อน"
                        });
                        break;
                    }

                    string role = Convert.ToString(ctx.Session["staff_role"]);

                    int departmentId = ctx.Session["department_id"] == null
                        ? 0
                        : Convert.ToInt32(ctx.Session["department_id"]);

                    if (role != "CEO" &&
                        role != "CFO" &&
                        departmentId <= 0)
                    {
                        Write(ctx, 403, new
                        {
                            success = false,
                            error = "ไม่พบข้อมูลแผนกของผู้ใช้งาน"
                        });
                        break;
                    }

                    int selectedYear;
                    if (!Int32.TryParse(ctx.Request.QueryString["year"], out selectedYear))
                    {
                        selectedYear = DateTime.Now.Year;
                    }

                    if (selectedYear < 2024 || selectedYear > 2027)
                    {
                        Write(ctx, 400, new
                        {
                            success = false,
                            error = "ปีที่เลือกไม่ถูกต้อง"
                        });
                        break;
                    }

                    string departmentSql = @"SELECT
                            d.department_id,
                            d.department_code,
                            d.department_name,
                            b.fiscal_year,

                            CAST(COALESCE(b.budget_amount, 0)
                                AS DECIMAL(18,2)) AS budget_amount,

                            CAST(COALESCE(b.used_amount, 0)
                                AS DECIMAL(18,2)) AS used_amount,

                            CAST(
                                COALESCE(b.budget_amount, 0)
                                - COALESCE(b.used_amount, 0)
                                AS DECIMAL(18,2)
                            ) AS remaining_amount,

                            CAST(
                                CASE
                                    WHEN COALESCE(b.budget_amount, 0) > 0
                                    THEN COALESCE(b.used_amount, 0) * 100.0
                                         / b.budget_amount
                                    ELSE 0
                                END AS DECIMAL(6,2)
                            ) AS used_percent

                        FROM dbo.departments d

                        INNER JOIN dbo.budget_limits b
                            ON b.department_id = d.department_id
                           AND b.fiscal_year = @fiscal_year

                        WHERE d.is_active = 1
                          AND (
                                @isExecutive = 1
                                OR d.department_id = @department_id
                              )

                        ORDER BY d.department_name;
                    ";

                    using (SqlCommand cmd = new SqlCommand(departmentSql, c))
                    {
                        bool isExecutive = role == "CEO" || role == "CFO";

                        cmd.Parameters.Add("@isExecutive", SqlDbType.Bit)
                            .Value = isExecutive;

                        cmd.Parameters.Add("@department_id", SqlDbType.Int)
                            .Value = departmentId;
                        cmd.Parameters.Add("@fiscal_year", SqlDbType.Int)
                            .Value = selectedYear;

                        DataTable dt = new DataTable();

                        using (SqlDataAdapter adapter = new SqlDataAdapter(cmd))
                        {
                            adapter.Fill(dt);
                        }

                        Write(ctx, 200, Rows(dt));
                    }

                    break;
                }



                        case "department-budget-detail":
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

                            int departmentId;
                            int fiscalYear;

                            if (!Int32.TryParse(
                                    ctx.Request.QueryString["department_id"],
                                    out departmentId) ||
                                departmentId <= 0)
                            {
                                Write(ctx, 400, new
                                {
                                    success = false,
                                    error = "กรุณาระบุ department_id ให้ถูกต้อง"
                                });
                                break;
                            }

                            if (!Int32.TryParse(
                                    ctx.Request.QueryString["fiscal_year"],
                                    out fiscalYear))
                            {
                                Write(ctx, 400, new
                                {
                                    success = false,
                                    error = "กรุณาระบุ fiscal_year ให้ถูกต้อง"
                                });
                                break;
                            }

                            using (SqlCommand cmd = new SqlCommand(@"
                                SELECT
                                    b.budget_id,
                                    d.department_id,
                                    d.department_name,
                                    b.fiscal_year,

                                    po.po_id,
                                    'PO-' + RIGHT(
                                        '000000' + CAST(po.po_id AS VARCHAR(20)), 6
                                    ) AS document_no,

                                    'REQ-' + CAST(r.requisition_id AS VARCHAR(20))
                                        AS requisition_no,

                                    CONVERT(VARCHAR(10), po.po_date, 23) AS document_date,

                                    pi.line_no,
                                    pi.item_name,
                                    pi.quantity,
                                    pi.unit_price,

                                    CAST(
                                        COALESCE(pi.line_total,
                                            COALESCE(pi.quantity, 0) *
                                            COALESCE(pi.unit_price, 0))
                                        AS DECIMAL(18,2)
                                    ) AS item_amount,

                                    po.status AS document_status

                                FROM dbo.budget_limits AS b
                                INNER JOIN dbo.departments AS d
                                    ON d.department_id = b.department_id
                                INNER JOIN dbo.requisitions AS r
                                    ON r.budget_id = b.budget_id
                                INNER JOIN dbo.purchase_orders AS po
                                    ON po.requisition_id = r.requisition_id
                                INNER JOIN dbo.po_items AS pi
                                    ON pi.po_id = po.po_id

                                WHERE d.department_id = @department_id
                                  AND b.fiscal_year = @fiscal_year
                                  AND COALESCE(po.status, '') <> 'Cancelled'

                                ORDER BY
                                    po.po_date DESC,
                                    po.po_id DESC,
                                    pi.line_no ASC;
                            ", c))
                            {
                                cmd.Parameters.Add("@department_id", SqlDbType.Int).Value =
                                    departmentId;
                                cmd.Parameters.Add("@fiscal_year", SqlDbType.Int).Value =
                                    fiscalYear;

                                DataTable dt = new DataTable();

                                using (SqlDataAdapter adapter = new SqlDataAdapter(cmd))
                                {
                                    adapter.Fill(dt);
                                }

                                Write(ctx, 200, Rows(dt));
                            }

                            break;
                        }

                
                    
                    
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

    int staffId;

    if (!Int32.TryParse(
        Convert.ToString(ctx.Session["staff_id"]),
        out staffId))
    {
        Write(ctx, 401, new
        {
            success = false,
            error = "ข้อมูลผู้ใช้ไม่ถูกต้อง"
        });
        break;
    }

    using (SqlCommand cmd = new SqlCommand(@"
        SELECT
            b.budget_id,
            b.department_id,
            d.department_name,
            b.fiscal_year,
            b.budget_amount,
            b.used_amount,
            b.budget_amount - b.used_amount AS remaining_amount
        FROM dbo.budget_limits AS b
            INNER JOIN dbo.staff AS s
                ON s.department_id = b.department_id
            INNER JOIN dbo.departments AS d
                ON d.department_id = b.department_id
            WHERE s.staff_id = @staff_id
              AND s.is_active = 1
              AND b.fiscal_year = 2027;
        ", c))
    {
        cmd.Parameters.Add("@staff_id", SqlDbType.Int).Value =
            staffId;

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
    // ตรวจสอบผู้ใช้จาก Session ฝั่งเซิร์ฟเวอร์
    string role = Convert.ToString(ctx.Session["staff_role"])
        .Trim();

    int staffId;
    int departmentId;

    bool hasStaffId = int.TryParse(
        Convert.ToString(ctx.Session["staff_id"]),
        out staffId
    );

    bool hasDepartmentId = int.TryParse(
        Convert.ToString(ctx.Session["department_id"]),
        out departmentId
    );

    if (ctx.Session["staff_role"] == null || !hasStaffId)
    {
        Write(ctx, 401, new
        {
            message = "กรุณาเข้าสู่ระบบก่อนดูใบสั่งซื้อ"
        });
        break;
    }

    string accessCondition = "";

    switch (role)
    {
        case "CEO":
        case "CFO":
        case "Procurement":
            // สามารถดูใบสั่งซื้อได้ทุกแผนก
            break;

        case "Manager":
            if (!hasDepartmentId)
            {
                Write(ctx, 403, new
                {
                    message = "ไม่พบแผนกของผู้ใช้งาน"
                });
                break;
            }

            accessCondition = @"
                AND s.department_id = " + departmentId;
            break;

        case "Staff":
            // ดูเฉพาะใบสั่งซื้อที่มาจากใบขอซื้อของตนเอง
            accessCondition = @"
                AND r.requester_staff_id = " + staffId;
            break;

        default:
            Write(ctx, 403, new
            {
                message = "ไม่มีสิทธิ์ดูรายการใบสั่งซื้อ"
            });
            break;
    }

    // หยุดการทำงานเมื่อ Manager ไม่มี department_id
    // หรือ Role ไม่ได้รับอนุญาต
    if (
    (role == "Manager" && !hasDepartmentId) ||
    (
        role != "CEO" &&
        role != "CFO" &&
        role != "Procurement" &&
        role != "Manager" &&
        role != "Staff"
    )
)
{
    break;
}

    DataTable purchaseOrderList = Query(c, @"
        SELECT
            po.po_id,

            'PO-' + RIGHT(
                '000000' + CAST(po.po_id AS VARCHAR(20)), 6
            ) AS po_number,

            po.requisition_id,

            'REQ-' + CAST(
                po.requisition_id AS VARCHAR(20)
            ) AS requisition_number,

            COALESCE(v.vendor_name, N'-') AS vendor_name,
            COALESCE(d.department_code, '') AS department_code,
            COALESCE(d.department_name, N'-') AS department,

            CONVERT(VARCHAR(10), po.po_date, 23) AS po_date,

            COALESCE(po.subtotal_amount, 0) AS subtotal_amount,
            COALESCE(po.vat_rate, 7.00) AS vat_rate,

            COALESCE(
                po.vat_amount,
                ROUND(
                    COALESCE(po.subtotal_amount, 0)
                    * COALESCE(po.vat_rate, 7.00) / 100.0,
                    2
                )
            ) AS vat_amount,

            COALESCE(
                po.total_amount,
                COALESCE(po.subtotal_amount, 0) + COALESCE(
                    po.vat_amount,
                    ROUND(
                        COALESCE(po.subtotal_amount, 0)
                        * COALESCE(po.vat_rate, 7.00) / 100.0,
                        2
                    )
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

        WHERE 1 = 1
    " + accessCondition + @"

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
                                COALESCE(ri.subtotal_amount, 0) AS subtotal_amount,
                                CAST(7.00 AS DECIMAL(5,2)) AS vat_rate,
                                ROUND(COALESCE(ri.subtotal_amount, 0) * 0.07, 2) AS vat_amount,
                                COALESCE(ri.subtotal_amount, 0)
                                    + ROUND(COALESCE(ri.subtotal_amount, 0) * 0.07, 2)
                                    AS total_amount,
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
                                SELECT SUM(
                                    COALESCE(i.line_total,
                                        COALESCE(i.quantity, 0) * COALESCE(i.unit_price, 0))
                                ) AS subtotal_amount
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
{
    int selectedYear;

    if (!int.TryParse(
        ctx.Request.QueryString["year"],
        out selectedYear))
    {
        selectedYear = DateTime.Now.Year;
    }

    if (selectedYear < 2000 || selectedYear > 2100)
    {
        Write(ctx, 400, new
        {
            error = "ปีที่เลือกไม่ถูกต้อง"
        });
        break;
    }

    string sql = @"
        SELECT
            YEAR(request_date) AS request_year,
            MONTH(request_date) AS request_month,
            COUNT(*) AS requisition_count
        FROM dbo.requisitions
        WHERE request_date >= @StartDate
          AND request_date < @EndDate
        GROUP BY
            YEAR(request_date),
            MONTH(request_date)
        ORDER BY
            request_year,
            request_month;";

    using (SqlCommand cmd = new SqlCommand(sql, c))
    {
        cmd.Parameters.Add("@StartDate", SqlDbType.Date).Value =
            new DateTime(selectedYear, 1, 1);

        cmd.Parameters.Add("@EndDate", SqlDbType.Date).Value =
            new DateTime(selectedYear + 1, 1, 1);

        using (SqlDataAdapter adapter = new SqlDataAdapter(cmd))
        {
            DataTable dt = new DataTable();
            adapter.Fill(dt);

            Write(ctx, 200, Rows(dt));
        }
    }

    break;
}


                
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

                        
                
                    
case "receivable-po-items":
{
    // 1. ตรวจสอบ Session
    if (ctx.Session == null ||
        ctx.Session["staff_id"] == null ||
        ctx.Session["staff_role"] == null)
    {
        Write(ctx, 401, new
        {
            message = "กรุณาเข้าสู่ระบบก่อน"
        });
        break;
    }

    string role = Convert.ToString(
        ctx.Session["staff_role"]).Trim();

    int staffId;
    int departmentId;

    bool hasStaffId = int.TryParse(
        Convert.ToString(ctx.Session["staff_id"]),
        out staffId);

    bool hasDepartmentId = int.TryParse(
        Convert.ToString(ctx.Session["department_id"]),
        out departmentId);

    if (!hasStaffId)
    {
        Write(ctx, 401, new
        {
            message = "ข้อมูลผู้ใช้งานไม่ถูกต้อง"
        });
        break;
    }

    // 2. กำหนดสิทธิ์การดูรายการสินค้าที่รอรับ
    string accessCondition = "";

    if (role == "CEO" ||
        role == "CFO" ||
        role == "Procurement")
    {
        // ดูได้ทุกแผนก
    }
    else if (role == "Manager")
    {
        if (!hasDepartmentId)
        {
            Write(ctx, 403, new
            {
                message = "ไม่พบแผนกของผู้ใช้งาน"
            });
            break;
        }

        accessCondition =
            " AND st.department_id = " + departmentId;
    }
    else if (role == "Staff")
    {
        accessCondition =
            " AND r.requester_staff_id = " + staffId;
    }
    else
    {
        Write(ctx, 403, new
        {
            message = "ไม่มีสิทธิ์ดูรายการสินค้าที่รอรับ"
        });
        break;
    }

    // 2.1 ถ้าหน้าเว็บส่ง po_id มา ให้จำกัดผลลัพธ์เฉพาะ PO นั้น
    // แปลงเป็น int ก่อนนำไปต่อ SQL เพื่อไม่รับ SQL จาก query string โดยตรง
    int requestedPoId;
    string poFilter = "";
    if (int.TryParse(ctx.Request.QueryString["po_id"], out requestedPoId) && requestedPoId > 0)
    {
        poFilter = " AND po.po_id = " + requestedPoId;
    }

    // 3. ดึงรายการสินค้าที่รับไม่ครบ
    DataTable receivableItems = Query(c, @"
        ;WITH ReceiptByLine AS
        (
            SELECT
                gr.po_id,
                gr.line_no,
                SUM(
                    CASE
                        WHEN gr.received_status IN ('Accepted', 'Partial')
                            THEN COALESCE(gr.received_quantity, 0)
                        ELSE 0
                    END
                ) AS received_quantity,
                MAX(gr.received_date) AS last_received_date
            FROM dbo.goods_receipts AS gr
            GROUP BY gr.po_id, gr.line_no
        )
        SELECT
            po.po_id,

            'PO-' + RIGHT(
                '000000' + CAST(po.po_id AS VARCHAR(20)), 6
            ) AS po_number,

            pi.line_no,
            pi.item_name,
            pi.quantity AS ordered_quantity,
            pi.unit_price,
            pi.line_total,

            COALESCE(rb.received_quantity, 0)
                AS received_quantity,

            CASE
                WHEN pi.quantity - COALESCE(rb.received_quantity, 0) < 0
                    THEN 0
                ELSE pi.quantity - COALESCE(rb.received_quantity, 0)
            END AS remaining_quantity,

            COALESCE(v.vendor_name, N'-') AS vendor_name,
            COALESCE(d.department_name, N'-') AS department,

            CASE
                WHEN COALESCE(rb.received_quantity, 0) = 0
                    THEN 'Pending'
                WHEN COALESCE(rb.received_quantity, 0) >= pi.quantity
                    THEN 'Accepted'
                ELSE 'Partial'
            END AS received_status,

            CONVERT(VARCHAR(10), rb.last_received_date, 23)
                AS last_received_date

        FROM dbo.purchase_orders AS po

        INNER JOIN dbo.po_items AS pi
            ON pi.po_id = po.po_id

        LEFT JOIN ReceiptByLine AS rb
            ON rb.po_id = pi.po_id
           AND rb.line_no = pi.line_no

        LEFT JOIN dbo.vendors AS v
            ON v.vendor_id = po.vendor_id

        LEFT JOIN dbo.requisitions AS r
            ON r.requisition_id = po.requisition_id

        LEFT JOIN dbo.staff AS st
            ON st.staff_id = r.requester_staff_id

        LEFT JOIN dbo.departments AS d
            ON d.department_id = st.department_id

        WHERE COALESCE(po.status, '') NOT IN ('Cancelled', 'Rejected')
          AND COALESCE(rb.received_quantity, 0) < pi.quantity
    " + accessCondition + poFilter + @"

        ORDER BY po.po_date DESC, po.po_id DESC, pi.line_no ASC;
    ");

    Write(ctx, 200, Rows(receivableItems));
    break;
}



                
                
case "goods-receipt-list":
{
    // 1. ตรวจสอบ Session
    if (ctx.Session == null ||
        ctx.Session["staff_id"] == null ||
        ctx.Session["staff_role"] == null)
    {
        Write(ctx, 401, new
        {
            message = "กรุณาเข้าสู่ระบบก่อน"
        });
        break;
    }

    string role = Convert.ToString(
        ctx.Session["staff_role"]).Trim();

    int staffId;
    int departmentId;

    bool hasStaffId = int.TryParse(
        Convert.ToString(ctx.Session["staff_id"]),
        out staffId);

    bool hasDepartmentId = int.TryParse(
        Convert.ToString(ctx.Session["department_id"]),
        out departmentId);

    if (!hasStaffId)
    {
        Write(ctx, 401, new
        {
            message = "ข้อมูลผู้ใช้งานไม่ถูกต้อง"
        });
        break;
    }

    // 2. กำหนดเงื่อนไขการเข้าถึง
    string accessCondition = "";

    if (role == "CEO" ||
        role == "CFO" ||
        role == "Procurement")
    {
        // ดูรายการได้ทุกแผนก
    }
    else if (role == "Manager")
    {
        if (!hasDepartmentId)
        {
            Write(ctx, 403, new
            {
                message = "ไม่พบแผนกของผู้ใช้งาน"
            });
            break;
        }

        accessCondition =
            " AND s.department_id = " + departmentId;
    }
    else if (role == "Staff")
    {
        accessCondition =
            " AND r.requester_staff_id = " + staffId;
    }
    else
    {
        Write(ctx, 403, new
        {
            message = "ไม่มีสิทธิ์ดูข้อมูลรับสินค้า"
        });
        break;
    }

    // 3. ดึงรายการรับสินค้าตามสิทธิ์
    DataTable goodsReceiptList = Query(c, @"
        ;WITH ReceiptByLine AS
        (
            SELECT
                gr.po_id,
                gr.line_no,
                SUM(
                    CASE
                        WHEN gr.received_status IN ('Accepted', 'Partial')
                            THEN COALESCE(gr.received_quantity, 0)
                        ELSE 0
                    END
                ) AS received_quantity,
                MAX(gr.received_date) AS last_received_date,
                MAX(gr.receipt_id) AS latest_receipt_id
            FROM dbo.goods_receipts AS gr
            GROUP BY gr.po_id, gr.line_no
        ),
        ReceiptSummary AS
        (
            SELECT
                po_id,
                MAX(last_received_date) AS last_received_date,
                MAX(latest_receipt_id) AS latest_receipt_id,
                COUNT(*) AS receipt_item_count,
                SUM(
                    CASE
                        WHEN received_quantity > 0 THEN 1
                        ELSE 0
                    END
                ) AS received_item_count,
                SUM(received_quantity) AS received_quantity
            FROM ReceiptByLine
            GROUP BY po_id
        ),
        POItemsSummary AS
        (
            SELECT
                po_id,
                SUM(line_total) AS order_amount,
                COUNT(*) AS item_count,
                SUM(quantity) AS total_quantity
            FROM dbo.po_items
            GROUP BY po_id
        ),
        AcceptedValue AS
        (
            SELECT
                pi.po_id,
                SUM(
                    CASE
                        WHEN pi.quantity > 0 THEN
                            (pi.line_total * 1.0 / pi.quantity) *
                            CASE
                                WHEN COALESCE(rb.received_quantity, 0)
                                     > pi.quantity
                                    THEN pi.quantity
                                ELSE COALESCE(rb.received_quantity, 0)
                            END
                        ELSE 0
                    END
                ) AS accepted_amount
            FROM dbo.po_items AS pi
            LEFT JOIN ReceiptByLine AS rb
                ON rb.po_id = pi.po_id
               AND rb.line_no = pi.line_no
            GROUP BY pi.po_id
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

            CONVERT(VARCHAR(10), rs.last_received_date, 23)
                AS received_date,

            COALESCE(pi.order_amount, 0) AS order_amount,
            COALESCE(av.accepted_amount, 0) AS accepted_amount,

            COALESCE(pi.order_amount, 0)
                - COALESCE(av.accepted_amount, 0)
                AS remaining_amount,

            CASE
                WHEN COALESCE(rs.received_quantity, 0) = 0
                    THEN 'Pending'

                WHEN COALESCE(rs.received_item_count, 0) = pi.item_count
                     AND NOT EXISTS
                     (
                         SELECT 1
                         FROM dbo.po_items AS p2
                         LEFT JOIN ReceiptByLine AS rb2
                             ON rb2.po_id = p2.po_id
                            AND rb2.line_no = p2.line_no
                         WHERE p2.po_id = po.po_id
                           AND COALESCE(rb2.received_quantity, 0)
                               < p2.quantity
                     )
                    THEN 'Received'

                ELSE 'Partial'
            END AS receipt_status,

            COALESCE(rs.received_item_count, 0)
                AS receipt_item_count

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

        LEFT JOIN AcceptedValue AS av
            ON av.po_id = po.po_id

        WHERE 1 = 1
    " + accessCondition + @"

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
                            department_id,
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

                            int? departmentId = reader["department_id"] == DBNull.Value
                            ? (int?)null
                            : Convert.ToInt32(reader["department_id"]);
                                        


                            string firstName = Convert.ToString(reader["first_name"]);
                            string lastName = Convert.ToString(reader["last_name"]);
                            string role = Convert.ToString(reader["staff_role"]);

                            string staffName = (firstName + " " + lastName).Trim();

                            reader.Close();

                            ctx.Session["staff_id"] = staffId;
                            ctx.Session["staff_name"] = staffName;
                            ctx.Session["staff_role"] = role;
                            ctx.Session["department_id"] = departmentId;

                            Write(ctx, 200, new
                            {
                                success = true,
                                message = "เข้าสู่ระบบสำเร็จ",
                                user = new
                                {
                                    staff_id = staffId,
                                    department_id = departmentId,
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

                        if (firstName.Length > 100 || lastName.Length > 100)
                        {
                            Write(ctx, 400, new
                            {
                                success = false,
                                error = "ชื่อและนามสกุลต้องมีความยาวไม่เกิน 100 ตัวอักษรต่อช่อง"
                            });
                            return;
                        }

                        if (email.Length > 50)
                        {
                            Write(ctx, 400, new
                            {
                                success = false,
                                error = "อีเมลต้องมีความยาวไม่เกิน 50 ตัวอักษร"
                            });
                            return;
                        }

                        if (!String.IsNullOrWhiteSpace(email))
                        {
                            using (SqlCommand checkEmail = new SqlCommand(@"
                                SELECT COUNT(*)
                                FROM dbo.staff
                                WHERE email = @email
                                  AND staff_id <> @staff_id;", c))
                            {
                                checkEmail.Parameters.Add("@email", SqlDbType.VarChar, 50).Value = email;
                                checkEmail.Parameters.Add("@staff_id", SqlDbType.Int).Value = staffId;

                                if (Convert.ToInt32(checkEmail.ExecuteScalar()) > 0)
                                {
                                    Write(ctx, 409, new
                                    {
                                        success = false,
                                        error = "อีเมลนี้ถูกใช้งานโดยบัญชีอื่นแล้ว"
                                    });
                                    return;
                                }
                            }
                        }

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

                            cmd.Parameters.Add("@email", SqlDbType.VarChar, 50)
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

                        // 4. ตรวจสอบว่างบเป็นของแผนกผู้ขอซื้อและปี 2026 จริง
                        using (SqlCommand cmd = new SqlCommand(@"
                            SELECT COUNT(*)
                            FROM dbo.budget_limits
                            WHERE budget_id = @budget_id
                              AND department_id = @department_id
                              AND fiscal_year = 2027;
                        ", c))
                        {
                            cmd.Parameters.Add("@budget_id", SqlDbType.Int).Value =
                                budget;

                            cmd.Parameters.Add("@department_id", SqlDbType.Int).Value =
                                requesterDepartment;

                            int allowed = Convert.ToInt32(cmd.ExecuteScalar());

                            if (allowed == 0)
                            {
                                Write(ctx, 403, new
                                {
                                    success = false,
                                    error = "คุณเลือกได้เฉพาะงบปี 2026 ของแผนกตัวเอง"
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
            
            
if (action == "save-goods-receipt")
{
    if (ctx.Session == null ||
        ctx.Session["staff_id"] == null ||
        ctx.Session["staff_role"] == null)
    {
        Write(ctx, 401, new
        {
            success = false,
            error = "กรุณาเข้าสู่ระบบก่อน"
        });
        return;
    }

    int staffId;
    int departmentId = 0;

    if (!int.TryParse(
        Convert.ToString(ctx.Session["staff_id"]),
        out staffId))
    {
        Write(ctx, 401, new
        {
            success = false,
            error = "ข้อมูลผู้ใช้งานไม่ถูกต้อง"
        });
        return;
    }

    string role = Convert.ToString(
        ctx.Session["staff_role"]).Trim();

    bool hasDepartmentId = int.TryParse(
        Convert.ToString(ctx.Session["department_id"]),
        out departmentId);

    // กำหนดขอบเขตสิทธิ์ในการบันทึกรับสินค้า
    bool canReceiveAll =
        role == "CEO" ||
        role == "CFO" ||
        role == "Procurement";

    bool isManager = role == "Manager";
    bool isStaff = role == "Staff";

    if (!canReceiveAll && !isManager && !isStaff)
    {
        Write(ctx, 403, new
        {
            success = false,
            error = "ไม่มีสิทธิ์บันทึกการรับสินค้า"
        });
        return;
    }

    if (isManager && !hasDepartmentId)
    {
        Write(ctx, 403, new
        {
            success = false,
            error = "ไม่พบแผนกของผู้ใช้งาน"
        });
        return;
    }

    int poId = Int(body, "po_id");
    int lineNo = Int(body, "line_no");
    int receivedQty = Int(body, "received_quantity");

    if (poId <= 0 || lineNo <= 0 || receivedQty <= 0)
    {
        Write(ctx, 400, new
        {
            success = false,
            error = "กรุณาระบุ PO รายการสินค้า และจำนวนรับให้ถูกต้อง"
        });
        return;
    }

    using (SqlTransaction tx =
        c.BeginTransaction(IsolationLevel.Serializable))
    {
        try
        {
            int orderedQty;
            int alreadyReceived;
            int requesterStaffId;
            int requesterDepartmentId;
            string poStatus;

            // ตรวจสอบ PO พร้อมล็อกข้อมูลระหว่างทำ Transaction
            // และดึงเจ้าของ Requisition เพื่อใช้ตรวจสิทธิ์
            using (SqlCommand cmd = new SqlCommand(@"
                SELECT
                    po.status,
                    pi.quantity,
                    r.requester_staff_id,
                    s.department_id
                FROM dbo.purchase_orders AS po
                    WITH (UPDLOCK, HOLDLOCK)
                INNER JOIN dbo.po_items AS pi
                    WITH (UPDLOCK, HOLDLOCK)
                    ON pi.po_id = po.po_id
                INNER JOIN dbo.requisitions AS r
                    ON r.requisition_id = po.requisition_id
                INNER JOIN dbo.staff AS s
                    ON s.staff_id = r.requester_staff_id
                WHERE po.po_id = @po_id
                  AND pi.line_no = @line_no;
            ", c, tx))
            {
                cmd.Parameters.Add("@po_id", SqlDbType.Int).Value = poId;
                cmd.Parameters.Add("@line_no", SqlDbType.Int).Value = lineNo;

                using (SqlDataReader reader = cmd.ExecuteReader())
                {
                    if (!reader.Read())
                    {
                        throw new InvalidOperationException(
                            "ไม่พบ PO หรือรายการสินค้าที่ระบุ");
                    }

                    poStatus = Convert.ToString(reader["status"]);
                    orderedQty = Convert.ToInt32(reader["quantity"]);
                    requesterStaffId = Convert.ToInt32(
                        reader["requester_staff_id"]);
                    requesterDepartmentId = Convert.ToInt32(
                        reader["department_id"]);
                }
            }

            // ตรวจสิทธิ์กับข้อมูลจริงในฐานข้อมูล
            // ไม่เชื่อ department หรือ requester ที่ส่งมาจากหน้าเว็บ
            if (isStaff && requesterStaffId != staffId)
            {
                throw new UnauthorizedAccessException(
                    "Staff สามารถรับสินค้าได้เฉพาะ PO ของรายการที่ตนเองร้องขอ");
            }

            if (isManager &&
                requesterDepartmentId != departmentId)
            {
                throw new UnauthorizedAccessException(
                    "Manager สามารถรับสินค้าได้เฉพาะ PO ในแผนกของตนเอง");
            }

            if (poStatus == "Cancelled" ||
                poStatus == "Rejected")
            {
                throw new InvalidOperationException(
                    "ไม่สามารถรับสินค้าจาก PO ที่ยกเลิกหรือปฏิเสธแล้ว");
            }

            // รวมจำนวนรับสะสมของรายการสินค้า
            using (SqlCommand cmd = new SqlCommand(@"
                SELECT COALESCE(SUM(
                    CASE
                        WHEN received_status IN ('Accepted', 'Partial')
                            THEN COALESCE(received_quantity, 0)
                        ELSE 0
                    END
                ), 0)
                FROM dbo.goods_receipts WITH (UPDLOCK, HOLDLOCK)
                WHERE po_id = @po_id
                  AND line_no = @line_no;
            ", c, tx))
            {
                cmd.Parameters.Add("@po_id", SqlDbType.Int).Value = poId;
                cmd.Parameters.Add("@line_no", SqlDbType.Int).Value = lineNo;

                alreadyReceived = Convert.ToInt32(
                    cmd.ExecuteScalar());
            }

            if (alreadyReceived + receivedQty > orderedQty)
            {
                throw new InvalidOperationException(
                    "จำนวนรับสะสมจะเกินจำนวนที่สั่ง " +
                    "(สั่ง " + orderedQty +
                    ", รับแล้ว " + alreadyReceived + ")");
            }

            int newTotal = alreadyReceived + receivedQty;

            string receiptStatus =
                newTotal >= orderedQty ? "Accepted" : "Partial";

            // บันทึกประวัติการรับสินค้า
            using (SqlCommand cmd = new SqlCommand(@"
                INSERT INTO dbo.goods_receipts
                (
                    po_id,
                    line_no,
                    received_by_staff_id,
                    received_date,
                    received_status,
                    received_quantity
                )
                VALUES
                (
                    @po_id,
                    @line_no,
                    @staff_id,
                    CONVERT(date, SYSDATETIME()),
                    @status,
                    @qty
                );
            ", c, tx))
            {
                cmd.Parameters.Add("@po_id", SqlDbType.Int).Value = poId;
                cmd.Parameters.Add("@line_no", SqlDbType.Int).Value = lineNo;
                cmd.Parameters.Add("@staff_id", SqlDbType.Int).Value = staffId;
                cmd.Parameters.Add("@status", SqlDbType.VarChar, 30)
                    .Value = receiptStatus;
                cmd.Parameters.Add("@qty", SqlDbType.Int).Value = receivedQty;

                cmd.ExecuteNonQuery();
            }

            // อัปเดตสถานะ PO ตามจำนวนรับสะสมทุกบรรทัด
            using (SqlCommand cmd = new SqlCommand(@"
                ;WITH ReceivedByLine AS
                (
                    SELECT
                        pi.po_id,
                        pi.line_no,
                        pi.quantity,
                        COALESCE(SUM(
                            CASE
                                WHEN gr.received_status IN ('Accepted', 'Partial')
                                    THEN COALESCE(gr.received_quantity, 0)
                                ELSE 0
                            END
                        ), 0) AS received_qty
                    FROM dbo.po_items AS pi
                    LEFT JOIN dbo.goods_receipts AS gr
                        ON gr.po_id = pi.po_id
                       AND gr.line_no = pi.line_no
                    WHERE pi.po_id = @po_id
                    GROUP BY
                        pi.po_id,
                        pi.line_no,
                        pi.quantity
                )
                UPDATE po
                SET status =
                    CASE
                        WHEN NOT EXISTS
                        (
                            SELECT 1
                            FROM ReceivedByLine
                            WHERE received_qty < quantity
                        )
                            THEN 'Received'
                        WHEN EXISTS
                        (
                            SELECT 1
                            FROM ReceivedByLine
                            WHERE received_qty > 0
                        )
                            THEN 'Partially Received'
                        ELSE 'Issued'
                    END
                FROM dbo.purchase_orders AS po
                WHERE po.po_id = @po_id
                  AND po.status <> 'Cancelled'
                  AND po.status <> 'Rejected';
            ", c, tx))
            {
                cmd.Parameters.Add("@po_id", SqlDbType.Int).Value = poId;
                cmd.ExecuteNonQuery();
            }

            tx.Commit();

            Write(ctx, 200, new
            {
                success = true,
                message = "บันทึกการรับสินค้าสำเร็จ",
                po_id = poId,
                line_no = lineNo,
                received_quantity = receivedQty,
                cumulative_received = newTotal,
                ordered_quantity = orderedQty,
                received_status = receiptStatus
            });
            return;
        }
        catch (UnauthorizedAccessException ex)
        {
            tx.Rollback();

            Write(ctx, 403, new
            {
                success = false,
                error = ex.Message
            });
            return;
        }
        catch (InvalidOperationException ex)
        {
            tx.Rollback();

            Write(ctx, 400, new
            {
                success = false,
                error = ex.Message
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
