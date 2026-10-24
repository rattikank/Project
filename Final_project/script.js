

// Dashboard Summary Section

async function loadDashboardSummary() {
    const money = new Intl.NumberFormat('th-TH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

    const number = new Intl.NumberFormat('th-TH');

    try {
        const response = await fetch('Api.ashx?action=summary');

        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status}`);
        }

        const result = await response.json();
        const data = Array.isArray(result) ? result[0] : result;

        if (!data) {
            throw new Error('ไม่พบข้อมูล Summary');
        }

        const budgetUsed = Number(data.budget_used);
        const budgetTotal = Number(data.budget_total);

        if (!Number.isFinite(budgetUsed) ||
            !Number.isFinite(budgetTotal)) {
            throw new Error('ข้อมูล Budget ไม่ถูกต้อง');
        }

        const budgetRemaining = budgetTotal - budgetUsed;
        const usedPercent = budgetTotal > 0
            ? (budgetUsed / budgetTotal) * 100
            : 0;

        document.getElementById('requisitions-count').textContent =
            number.format(data.requisitions_count);

        document.getElementById('purchase-orders-count').textContent =
            number.format(data.purchase_orders_count);

        document.getElementById('pending-count').textContent =
            number.format(data.pending_count);

        document.getElementById('budget-remaining').textContent =
            '฿' + money.format(budgetRemaining);

        document.getElementById('budget-detail').textContent =
            `ใช้ไป ฿${money.format(budgetUsed)} จากงบรวม ` +
            `฿${money.format(budgetTotal)} (${usedPercent.toFixed(2)}%)`;

    } catch (error) {
        console.error('Dashboard Summary Error:', error);

        const detail = document.getElementById('budget-detail');
        if (detail) {
            detail.textContent = 'ไม่สามารถโหลดข้อมูลงบประมาณได้';
        }

        [
            'requisitions-count',
            'purchase-orders-count',
            'pending-count',
            'budget-remaining'
        ].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = '-';
        });
    }
}



// Monthly Chart Section

async function loadMonthlyChart() {
    const chart = document.getElementById('monthly-chart');

    if (!chart) {
        console.error('ไม่พบ element #monthly-chart');
        return;
    }

    try {
        // ใช้รูปแบบ URL เดียวกับ Summary
        const response = await fetch(
            'Api.ashx?action=monthly-requisitions'
        );

        const responseText = await response.text();

        console.log('Monthly Chart HTTP Status:', response.status);
        console.log('Monthly Chart Response:', responseText);

        if (!response.ok) {
            throw new Error(
                `HTTP ${response.status}: ${responseText}`
            );
        }

        const rows = JSON.parse(responseText);

        if (!Array.isArray(rows)) {
            throw new Error('API ไม่ได้ส่งข้อมูลในรูปแบบ Array');
        }

        // สร้างเดือนย้อนหลัง 12 เดือน รวมเดือนที่ไม่มีข้อมูล
        const now = new Date();
        const months = [];

        for (let i = 11; i >= 0; i--) {
            const date = new Date(
                now.getFullYear(),
                now.getMonth() - i,
                1
            );

            months.push({
                year: date.getFullYear(),
                month: date.getMonth() + 1,
                label: date.toLocaleDateString('th-TH', {
                    month: 'short'
                }),
                count: 0
            });
        }

        // จับคู่ข้อมูลจาก API กับเดือนที่เตรียมไว้
        rows.forEach(row => {
            const item = months.find(m =>
                m.year === Number(row.request_year) &&
                m.month === Number(row.request_month)
            );

            if (item) {
                item.count = Number(row.requisition_count) || 0;
            }
        });

        const maxCount = Math.max(
            1,
            ...months.map(m => m.count)
        );

        chart.replaceChildren();

        months.forEach(item => {
            const wrap = document.createElement('div');
            wrap.className = 'bar-wrap';

            const value = document.createElement('span');
            value.className = 'bar-value';
            value.textContent = item.count.toLocaleString('th-TH');

            const bar = document.createElement('div');
            bar.className = 'bar';
            bar.style.height =
                `${Math.max(3, item.count / maxCount * 100)}%`;

            bar.title =
                `${item.month}/${item.year}: ${item.count} ใบขอซื้อ`;

            const label = document.createElement('span');
            label.className = 'bar-label';
            label.textContent = item.label;

            wrap.title = `${item.label} ${item.year}`;
            wrap.append(value, bar, label);
            chart.appendChild(wrap);
        });

    } catch (error) {
        console.error('Monthly Chart Error:', error);
        chart.textContent =
            'โหลดข้อมูลกราฟไม่สำเร็จ: ' + error.message;
    }
}



// Initialize Dashboard

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById("monthly-chart")) {
        loadDashboardSummary();
        loadMonthlyChart();
        loadPendingRequests();
        loadRecentActivities();
    }

    // โหลดเฉพาะเมื่ออยู่หน้าอนุมัติ
    if (document.getElementById("approval-list")) {
        loadApprovalList();
    }
    const pagination =
        document.getElementById("approval-pagination");

    if (pagination) {
        pagination.addEventListener("click", function (event) {
            const button = event.target.closest("button[data-page]");

            if (!button || button.disabled) return;

            currentApprovalPage = Number(button.dataset.page);
            renderApprovalList();
        });
    }

    const search = document.getElementById("approval-search");
    const status = document.getElementById("approval-status-filter");
    const department = document.getElementById("approval-department-filter");

    function resetApprovalPage() {
        currentApprovalPage = 1;
        renderApprovalList();
    }

    if (search) {
        search.addEventListener("input", resetApprovalPage);
    }

    if (status) {
        status.addEventListener("change", resetApprovalPage);
    }

    if (department) {
        department.addEventListener("change", resetApprovalPage);
    }

});


// loadPendingRequests


async function loadPendingRequests() {
    const tbody = document.getElementById('pending-list');
    if (!tbody) return;

    try {
        const response = await fetch('Api.ashx?action=pending-requests');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const rows = await response.json();
        tbody.replaceChildren();

        if (!rows.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" style="text-align:center">
                        ไม่มีรายการรอดำเนินการ
                    </td>
                </tr>`;
            return;
        }

        rows.forEach(item => {
            const tr = document.createElement('tr');

            const values = [
                `REQ-${String(item.requisition_id).padStart(3, '0')}`,
                item.department_name ?? '-',
                Number(item.total_amount ?? 0).toLocaleString('th-TH', {
                    style: 'currency',
                    currency: 'THB',
                    maximumFractionDigits: 2
                })
            ];

            values.forEach(value => {
                const td = document.createElement('td');
                td.textContent = value;
                tr.appendChild(td);
            });

            const statusTd = document.createElement('td');
            const status = document.createElement('span');
            status.className = 'status pending';
            status.textContent = 'รออนุมัติ';
            statusTd.appendChild(status);
            tr.appendChild(statusTd);

            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error('Pending requests error:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align:center">
                    โหลดรายการรอดำเนินการไม่สำเร็จ
                </td>
            </tr>`;
    }
}

//loadRecentActivities
async function loadRecentActivities() {
    const tbody = document.getElementById('activity-list');
    if (!tbody) return;

    try {
        const response = await fetch('Api.ashx?action=recent-activities');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const rows = await response.json();
        tbody.replaceChildren();

        if (!rows.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" style="text-align:center">
                        ยังไม่มีกิจกรรม
                    </td>
                </tr>`;
            return;
        }

        rows.slice(0, 10).forEach(item => {
            const tr = document.createElement('tr');


            const id = String(item.document_id);
            const prefix = item.activity_type === 'สร้างใบสั่งซื้อ'
                ? 'PO-'
                : 'REQ-';




            const activity = ` ${prefix}${id.padStart(3, '0')}`;


            const rawDate = item.activity_date;
            const parsedDate = rawDate ? new Date(rawDate) : null;

            const date =
                parsedDate && !Number.isNaN(parsedDate.getTime())
                    ? parsedDate.toLocaleDateString('th-TH')
                    : '-';


            const statusMap = {
                'Pending Approval': 'รออนุมัติ',
                'Pending': 'รอดำเนินการ',
                'Approved': 'อนุมัติแล้ว',
                'Completed': 'สำเร็จ',
                'Cancelled': 'ยกเลิก',
                'Rejected': 'ไม่อนุมัติ'
            };

            const statusClassMap = {
                'Pending Approval': 'pending',
                'Pending': 'pending',
                'Approved': 'approved',
                'Completed': 'approved',
                'Cancelled': 'rejected',
                'Rejected': 'rejected'
            };

            const statusText = statusMap[item.activity_status]
                ?? item.activity_status
                ?? '-';

            const cells = [
                activity,
                item.actor ?? '-',
                date
            ];

            cells.forEach(value => {
                const td = document.createElement('td');
                td.textContent = value;
                tr.appendChild(td);
            });

            const statusTd = document.createElement('td');
            const badge = document.createElement('span');
            badge.className =
                `status ${statusClassMap[item.activity_status] ?? 'pending'}`;
            badge.textContent = statusText;
            statusTd.appendChild(badge);
            tr.appendChild(statusTd);

            tbody.appendChild(tr);
        });
    } catch (error) {
        console.error('Recent activities error:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align:center">
                    โหลดกิจกรรมล่าสุดไม่สำเร็จ
                </td>
            </tr>`;
    }
}



// Approval Page

async function loadApprovalList() {
    const tbody = document.getElementById("approval-list");

    // ถ้าไม่ใช่หน้าอนุมัติ ให้หยุดทำงาน
    if (!tbody) return;

    const countElement = document.getElementById("approval-count");

    try {
        const response = await fetch(
            "Api.ashx?action=pending-requests"
        );

        if (!response.ok) {
            throw new Error("ไม่สามารถโหลดข้อมูลได้");
        }

        const result = await response.json();

        // รองรับกรณี API ส่งข้อมูลเป็น Array
        const items = Array.isArray(result) ? result : [];

        if (items.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align:center">
                        ไม่มีรายการใบขอซื้อ
                    </td>
                </tr>
            `;

            if (countElement) {
                countElement.textContent = "แสดง 0 รายการ";
            }

            return;
        }

        tbody.innerHTML = items.map(item => {
            const id = String(item.requisition_id ?? "");
            const department = item.department_name ?? "-";
            const amount = Number(item.total_amount ?? 0);
            const status = item.status ?? "-";

            return `
                <tr>
                    <td>
                        <span class="id">
                            REQ-${id.padStart(3, "0")}
                        </span>
                    </td>
                    <td>-</td>
                    <td>${escapeHtml(department)}</td>
                    <td>-</td>
                   <td>
    <div class="approval-amount">
        <small>ก่อน VAT: ฿${money(subtotal)}</small>
        <small>VAT 7%: ฿${money(vat)}</small>
        <strong>สุทธิ: ฿${money(grandTotal)}</strong>
    </div>
</td>
                    <td>-</td>
                    <td>
                        <span class="status pending">
                            ${escapeHtml(status)}
                        </span>
                    </td>
                    <td>
                        <a class="table-link"
                           href="requisition-create.html">
                            ตรวจสอบ
                        </a>
                    </td>
                </tr>
            `;
        }).join("");

        if (countElement) {
            countElement.textContent =
                `แสดง ${items.length} รายการ`;
        }

    } catch (error) {
        console.error("Approval list error:", error);

        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align:center">
                    โหลดข้อมูลไม่สำเร็จ กรุณาตรวจสอบ API
                </td>
            </tr>
        `;

        if (countElement) {
            countElement.textContent = "โหลดข้อมูลไม่สำเร็จ";
        }
    }
}

// ป้องกันข้อความจากฐานข้อมูลถูกตีความเป็น HTML
function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

let approvalItems = [];
let currentApprovalPage = 1;
const approvalPageSize = 25;

async function loadApprovalList() {
    const tbody = document.getElementById("approval-list");

    // ทำงานเฉพาะหน้า approvals.html
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="8" style="text-align:center">
                กำลังโหลดข้อมูล...
            </td>
        </tr>`;

    try {
        const response = await fetch(
            "Api.ashx?action=approval-list"
        );

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
            throw new Error("รูปแบบข้อมูล API ไม่ถูกต้อง");
        }

        approvalItems = data;
        renderApprovalList();

    } catch (error) {
        console.error("Approval list error:", error);

        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align:center">
                    โหลดข้อมูลไม่สำเร็จ
                </td>
            </tr>`;

        const count = document.getElementById("approval-count");
        if (count) count.textContent = "โหลดข้อมูลไม่สำเร็จ";
    }
}


function renderApprovalList() {
    const tbody = document.getElementById("approval-list");
    if (!tbody) return;

    const search = (
        document.getElementById("approval-search")?.value || ""
    ).trim().toLowerCase();

    const statusFilter =
        document.getElementById("approval-status-filter")?.value || "";

    const departmentFilter =
        document.getElementById("approval-department-filter")?.value || "";

    // 1. กรองข้อมูลก่อนแบ่งหน้า
    const filtered = approvalItems.filter(item => {
        const id = String(item.requisition_id ?? "");
        const requester = String(item.requester_name ?? "");
        const department = String(item.department ?? "");
        const departmentCode = String(item.department_code ?? "");
        const status = String(item.status ?? "");

        // ค้นหาด้วยเลขที่ใบขอซื้อ ชื่อผู้ขอซื้อ หรือชื่อแผนก
        const searchable =
            `${id} ${requester} ${department} ${departmentCode}`.toLowerCase();

        const matchesSearch = searchable.includes(search);

        // กรองแผนกด้วยรหัส เช่น IT, FIN, PROC
        const matchesDepartment =
            !departmentFilter ||
            departmentCode.toLowerCase() === departmentFilter.toLowerCase();

        // แปลงสถานะเป็นตัวพิมพ์เล็กเพื่อให้เปรียบเทียบได้ง่าย
        const normalizedStatus = status.trim().toLowerCase();

        const matchesStatus =
            !statusFilter ||
            (statusFilter === "pending" &&
                ["pending", "pending approval", "รออนุมัติ"]
                    .includes(normalizedStatus)) ||
            (statusFilter === "approved" &&
                ["approved", "อนุมัติแล้ว"]
                    .includes(normalizedStatus)) ||
            (statusFilter === "rejected" &&
                ["rejected", "reject", "ปฏิเสธ"]
                    .includes(normalizedStatus));

        return matchesSearch && matchesDepartment && matchesStatus;
    });

    // 2. คำนวณจำนวนหน้า
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / approvalPageSize);

    // ป้องกันกรณีหน้าปัจจุบันเกินจำนวนหน้าหลังกรอง
    if (totalPages === 0) {
        currentApprovalPage = 1;
    } else if (currentApprovalPage > totalPages) {
        currentApprovalPage = totalPages;
    }

    // 3. เลือกข้อมูลเฉพาะหน้าปัจจุบัน
    const startIndex =
        (currentApprovalPage - 1) * approvalPageSize;

    const pageItems = filtered.slice(
        startIndex,
        startIndex + approvalPageSize
    );

    // 4. แสดงรายการในตาราง
    if (pageItems.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align:center">
                    ไม่พบรายการที่ตรงกับเงื่อนไข
                </td>
            </tr>`;
    } else {
        tbody.innerHTML = pageItems.map(item => {
            const id = String(item.requisition_id ?? "");
            const requester =
                escapeHtml(item.requester_name ?? "-");
            const department =
                escapeHtml(item.department ?? "-");
            const vendor =
                escapeHtml(item.vendor_name ?? "-");
            const status = String(item.status ?? "-");
            // ยอดก่อน VAT
            const subtotal = Number(item.subtotal_amount ?? item.total_amount ?? 0);

            // VAT 7%
            const vat = Math.round((subtotal * 0.07 + Number.EPSILON) * 100) / 100;

            // ยอดรวมสุทธิ
            const grandTotal = subtotal + vat;

            const money = (value) =>
                value.toLocaleString("th-TH", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                });

            const rawDate = item.request_date;
            const parsedDate = rawDate
                ? new Date(rawDate)
                : null;

            const date = parsedDate &&
                !Number.isNaN(parsedDate.getTime())
                ? parsedDate.toLocaleDateString("th-TH")
                : "-";

            let statusClass = "pending";
            let statusLabel = status;
            const normalizedStatus = status.toLowerCase();

            if (
                ["approved", "อนุมัติแล้ว"]
                    .includes(normalizedStatus)
            ) {
                statusClass = "approved";
                statusLabel = "อนุมัติแล้ว";
            } else if (
                ["rejected", "reject", "ปฏิเสธ"]
                    .includes(normalizedStatus)
            ) {
                statusClass = "rejected";
                statusLabel = "ปฏิเสธ";
            } else if (
                ["pending", "pending approval"]
                    .includes(normalizedStatus)
            ) {
                statusLabel = "รออนุมัติ";
            }

            const requestCode =
                `REQ-${id.padStart(3, "0")}`;

            return `
                <tr>
                    <td>
                        <span class="id">
                            ${escapeHtml(requestCode)}
                        </span>
                    </td>
                    <td>${requester}</td>
                    <td>${department}</td>
                    <td>${date}</td>
                    <td>฿${money(grandTotal)}</td>
                    <td>${vendor}</td>
                    <td>
                        <span class="status ${statusClass}">
                            ${escapeHtml(statusLabel)}
                        </span>
                    </td>
                    <td>
                        <a class="table-link"
                           href="approval-detail.html?id=${encodeURIComponent(id)}">
                            ตรวจสอบ
                        </a>
                    </td>
                </tr>`;
        }).join("");
    }

    // 5. แสดงจำนวนรายการ
    const countElement =
        document.getElementById("approval-count");

    if (countElement) {
        const firstItem = totalItems === 0 ? 0 : startIndex + 1;
        const lastItem = Math.min(
            startIndex + approvalPageSize,
            totalItems
        );

        countElement.textContent =
            `แสดง ${firstItem}-${lastItem} จาก ${totalItems} รายการ`;
    }

    // 6. สร้างปุ่มแบ่งหน้าอัตโนมัติ
    const pagination =
        document.getElementById("approval-pagination");

    if (pagination) {
        if (totalPages <= 1) {
            pagination.innerHTML = "";
        } else {
            let buttons = `
                <button type="button"
                    class="page-btn"
                    data-page="${currentApprovalPage - 1}"
                    ${currentApprovalPage === 1 ? "disabled" : ""}
                    aria-label="หน้าก่อนหน้า">
                    ‹
                </button>`;

            for (let page = 1; page <= totalPages; page++) {
                buttons += `
                    <button type="button"
                        class="page-btn ${page === currentApprovalPage ? "current" : ""}"
                        data-page="${page}"
                        ${page === currentApprovalPage ? 'aria-current="page"' : ""}>
                        ${page}
                    </button>`;
            }

            buttons += `
                <button type="button"
                    class="page-btn"
                    data-page="${currentApprovalPage + 1}"
                    ${currentApprovalPage === totalPages ? "disabled" : ""}
                    aria-label="หน้าถัดไป">
                    ›
                </button>`;

            pagination.innerHTML = buttons;
        }
    }
}

// loadRequisitionList

let requisitionItems = [];
let currentRequisitionPage = 1;
const requisitionPageSize = 25;

async function loadRequisitionList() {
    const tbody = document.getElementById("requisition-list");

    if (!tbody) return;

    try {
        const response = await fetch(
            "Api.ashx?action=requisition-list",
            { cache: "no-store" }
        );

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
            throw new Error("รูปแบบข้อมูล API ไม่ถูกต้อง");
        }

        requisitionItems = data;
        currentRequisitionPage = 1;
        renderRequisitionList();

    } catch (error) {
        console.error("Requisition List Error:", error);

        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center">
                    โหลดข้อมูลไม่สำเร็จ กรุณาตรวจสอบ Api.ashx
                </td>
            </tr>
        `;

        document.getElementById("requisition-count").textContent =
            "ไม่สามารถโหลดข้อมูลได้";
    }
}

function renderRequisitionList() {
    const tbody = document.getElementById("requisition-list");
    if (!tbody) return;

    const searchInput =
        document.getElementById("requisition-search");

    const statusSelect =
        document.getElementById("requisition-status-filter");

    const departmentSelect =
        document.getElementById("requisition-department-filter");

    const search = (searchInput?.value || "").trim().toLowerCase();
    const statusFilter = statusSelect?.value || "";
    const departmentFilter = departmentSelect?.value || "";

    const filtered = requisitionItems.filter(item => {
        const id = String(item.requisition_no ?? item.requisition_id ?? "");
        const requester = String(item.requester_name ?? "");
        const department = String(item.department ?? "");
        const departmentCode = String(item.department_code ?? "");
        const status = String(item.status ?? "").trim().toLowerCase();

        const searchable =
            `${id} ${requester} ${department} ${departmentCode}`
                .toLowerCase();

        const matchesSearch = searchable.includes(search);

        const matchesDepartment =
            !departmentFilter ||
            departmentCode.toLowerCase() ===
            departmentFilter.toLowerCase();

        const matchesStatus =
            !statusFilter ||
            (statusFilter === "pending" &&
                ["pending", "pending approval", "รออนุมัติ"]
                    .includes(status)) ||
            (statusFilter === "approved" &&
                ["approved", "อนุมัติแล้ว"]
                    .includes(status)) ||
            (statusFilter === "rejected" &&
                ["rejected", "reject", "ปฏิเสธ"]
                    .includes(status));

        return matchesSearch && matchesDepartment && matchesStatus;
    });

    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / requisitionPageSize);

    if (totalPages > 0 && currentRequisitionPage > totalPages) {
        currentRequisitionPage = totalPages;
    }

    if (totalPages === 0) {
        currentRequisitionPage = 1;
    }

    const startIndex = (currentRequisitionPage - 1) * requisitionPageSize;
    const pageItems = filtered.slice(
        startIndex,
        startIndex + requisitionPageSize
    );

    if (pageItems.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center">
                    ไม่พบรายการใบขอซื้อ
                </td>
            </tr>
        `;
    } else {

        tbody.innerHTML = pageItems.map(item => {
            const requisitionId = String(item.requisition_id ?? "");

            const requisitionNo =
                item.requisition_no ??
                `REQ-${requisitionId}`;

            const requester = item.requester_name || "-";
            const department = item.department || "-";
            const status = String(item.status || "").trim().toLowerCase();

            let statusClass = "pending";
            let statusText = "รออนุมัติ";

            if (["approved", "อนุมัติแล้ว"].includes(status)) {
                statusClass = "approved";
                statusText = "อนุมัติแล้ว";
            } else if (
                ["rejected", "reject", "ปฏิเสธ"].includes(status)
            ) {
                statusClass = "rejected";
                statusText = "ปฏิเสธ";
            } else if (
                !["pending", "pending approval", "รออนุมัติ"]
                    .includes(status)
            ) {
                statusText = item.status || "ไม่ระบุสถานะ";
            }

            const dateText = item.request_date
                ? formatRequisitionDate(item.request_date)
                : "-";

            const amount = Number(item.total_amount || 0);
            const amountText = Number.isFinite(amount)
                ? amount.toLocaleString("th-TH", {
                    style: "currency",
                    currency: "THB",
                    maximumFractionDigits: 2
                })
                : "-";

            return `
        <tr>
            <td>
                <span class="id">${escapeHtml(requisitionNo)}</span>
            </td>
            <td>${escapeHtml(requester)}</td>
            <td>${escapeHtml(department)}</td>
            <td>${escapeHtml(dateText)}</td>
            <td>${escapeHtml(amountText)}</td>
            <td>
                <span class="status ${statusClass}">
                    ${escapeHtml(statusText)}
                </span>
            </td>
            <td>
                <a class="table-link"
                   href="approval-detail.html?id=${encodeURIComponent(requisitionId)}">
                    ดูรายละเอียด
                </a>
            </td>
        </tr>
    `;
        }).join("");

    }

    const firstItem = totalItems === 0 ? 0 : startIndex + 1;
    const lastItem = Math.min(
        startIndex + requisitionPageSize,
        totalItems
    );

    document.getElementById("requisition-count").textContent =
        `แสดง ${firstItem}-${lastItem} จาก ${totalItems} รายการ`;

    renderRequisitionPagination(totalPages);
}

function formatRequisitionDate(value) {
    // API ส่งวันที่รูปแบบ YYYY-MM-DD
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);

    if (match) {
        return `${match[3]}/${match[2]}/${match[1]}`;
    }

    return String(value);
}

function renderRequisitionPagination(totalPages) {
    const pagination =
        document.getElementById("requisition-pagination");

    if (!pagination) return;

    if (totalPages <= 1) {
        pagination.innerHTML = "";
        return;
    }

    let html = `
        <button type="button" data-page="${currentRequisitionPage - 1}"
            ${currentRequisitionPage === 1 ? "disabled" : ""}
            aria-label="หน้าก่อนหน้า">‹</button>
    `;

    for (let page = 1; page <= totalPages; page++) {
        html += `
            <button type="button"
                data-page="${page}"
                class="${page === currentRequisitionPage ? "current" : ""}"
                ${page === currentRequisitionPage ? 'aria-current="page"' : ""}>
                ${page}
            </button>
        `;
    }

    html += `
        <button type="button" data-page="${currentRequisitionPage + 1}"
            ${currentRequisitionPage === totalPages ? "disabled" : ""}
            aria-label="หน้าถัดไป">›</button>
    `;

    pagination.innerHTML = html;
}


async function setupRequisitionDepartmentFilter() {
    const department = document.getElementById(
        "requisition-department-filter"
    );

    if (!department) return false;

    // ซ่อนตัวกรองไว้ก่อน ระหว่างตรวจสอบสิทธิ์
    department.hidden = true;
    department.disabled = true;

    try {
        const response = await fetch("Api.ashx?action=me", {
            method: "GET",
            credentials: "same-origin",
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error("ตรวจสอบข้อมูลผู้ใช้ไม่สำเร็จ");
        }

        const result = await response.json();

        if (!result.success || !result.user) {
            return false;
        }

        const role = String(
            result.user.staff_role || ""
        ).trim().toUpperCase();

        const canViewAll = ["CEO", "CFO"].includes(role);

        // แสดงตัวกรองเฉพาะ CEO และ CFO
        department.hidden = !canViewAll;
        department.disabled = !canViewAll;

        if (!canViewAll) {
            department.value = "";
        }

        return true;

    } catch (error) {
        console.error(
            "Department filter permission error:",
            error
        );

        department.hidden = true;
        department.disabled = true;

        return false;
    }
}

async function initRequisitionPage() {
    const tbody = document.getElementById("requisition-list");

    // ไม่ทำงานในหน้าอื่น
    if (!tbody) return;

    setupRequisitionDepartmentFilter();

    const search = document.getElementById("requisition-search");
    const status = document.getElementById("requisition-status-filter");
    const department =
        document.getElementById("requisition-department-filter");
    await setupRequisitionDepartmentFilter();
    const reset = document.getElementById("requisition-reset");
    const pagination =
        document.getElementById("requisition-pagination");

    const resetPageAndRender = () => {
        currentRequisitionPage = 1;
        renderRequisitionList();
    };

    search?.addEventListener("input", resetPageAndRender);
    status?.addEventListener("change", resetPageAndRender);
    department?.addEventListener("change", resetPageAndRender);

    reset?.addEventListener("click", () => {
        if (search) search.value = "";
        if (status) status.value = "";
        if (department) department.value = "";

        currentRequisitionPage = 1;
        renderRequisitionList();
    });

    pagination?.addEventListener("click", event => {
        const button = event.target.closest("button[data-page]");

        if (!button || button.disabled) return;

        const page = Number(button.dataset.page);

        if (!Number.isInteger(page) || page < 1) return;

        currentRequisitionPage = page;
        renderRequisitionList();
    });

    loadRequisitionList();
}

document.addEventListener("DOMContentLoaded", initRequisitionPage);

// loadPurchaseOrderList

let purchaseOrderItems = [];
let currentPOPage = 1;
const poPageSize = 25;

async function loadPurchaseOrderList() {
    const tbody = document.getElementById("po-list");
    if (!tbody) return;

    tbody.innerHTML = `
        <tr><td colspan="8">กำลังโหลดข้อมูล...</td></tr>
    `;

    try {
        const response = await fetch(
            "Api.ashx?action=purchase-order-list"
        );

        if (!response.ok) {
            throw new Error("HTTP " + response.status);
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
            throw new Error("รูปแบบข้อมูลจาก API ไม่ถูกต้อง");
        }

        purchaseOrderItems = data;
        currentPOPage = 1;
        renderPurchaseOrderList();
    } catch (error) {
        console.error("Purchase Order List Error:", error);

        tbody.innerHTML = `
            <tr>
                <td colspan="8">
                    ไม่สามารถโหลดข้อมูลใบสั่งซื้อได้
                    กรุณาตรวจสอบ API และการเชื่อมต่อฐานข้อมูล
                </td>
            </tr>
        `;

        document.getElementById("po-count").textContent =
            "โหลดข้อมูลไม่สำเร็จ";
    }
}


function normalizePOStatus(status) {
    const value = String(status ?? "")
        .trim()
        .toLowerCase()
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ");

    if (
        value.includes("cancel") ||
        value.includes("ยกเลิก")
    ) {
        return "Cancelled";
    }

    if (
        value.includes("partial") ||
        value.includes("บางส่วน")
    ) {
        return "Partially Received";
    }

    if (
        value.includes("received") ||
        value.includes("complete") ||
        value.includes("รับครบ") ||
        value.includes("รับสินค้าแล้ว")
    ) {
        return "Received";
    }

    if (
        value.includes("issued") ||
        value.includes("ordered") ||
        value.includes("sent") ||
        value.includes("approved") ||
        value.includes("สั่งซื้อ") ||
        value.includes("อนุมัติแล้ว")
    ) {
        return "Issued";
    }

    if (
        value.includes("pending") ||
        value.includes("รออนุมัติ") ||
        value.includes("รอดำเนินการ")
    ) {
        return "Pending";
    }

    return "Other";
}



function getPOStatusLabel(status) {
    const normalized = normalizePOStatus(status);

    const labels = {
        "Issued": "สั่งซื้อแล้ว",
        "Partially Received": "รับสินค้าบางส่วน",
        "Received": "รับครบแล้ว",
        "Cancelled": "ยกเลิก",
        "Pending": "รอดำเนินการ",
        "Other": "ไม่ระบุสถานะ"
    };

    return labels[normalized] || "ไม่ระบุสถานะ";
}

function getPOStatusClass(status) {
    const normalized = normalizePOStatus(status);

    const classes = {
        pending: "processing",
        ordered: "approved",
        partial: "processing",
        received: "received",
        cancelled: "rejected",
        other: "processing"
    };

    return classes[normalized];
}

function formatPOMoney(amount) {
    const value = Number(amount);
    return (Number.isFinite(value) ? value : 0).toLocaleString("th-TH", {
        style: "currency",
        currency: "THB",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatPODate(dateString) {
    if (!dateString) return "-";

    const parts = String(dateString).split("-");
    if (parts.length !== 3) return escapeHtml(dateString);

    // API ส่งวันที่ในรูปแบบ YYYY-MM-DD
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function renderPurchaseOrderList() {
    const tbody = document.getElementById("po-list");
    const count = document.getElementById("po-count");

    if (!tbody || !count) return;

    const searchText = (
        document.getElementById("po-search")?.value || ""
    ).trim().toLowerCase();

    const statusFilter =
        document.getElementById("po-status-filter")?.value || "";

    const departmentFilter =
        document.getElementById("po-department-filter")?.value || "";

    const filteredItems = purchaseOrderItems.filter(item => {
        const searchValues = [
            item.po_number,
            item.requisition_number,
            item.vendor_name,
            item.department,
            item.department_code
        ];

        const matchesSearch = searchValues.some(value =>
            String(value ?? "").toLowerCase().includes(searchText)
        );

        const matchesStatus =
            !statusFilter ||
            normalizePOStatus(item.status) === statusFilter;

        const matchesDepartment =
            !departmentFilter ||
            String(item.department_code || "").toUpperCase() ===
            departmentFilter.toUpperCase();

        return matchesSearch && matchesStatus && matchesDepartment;
    });

    const totalPages = Math.max(
        1,
        Math.ceil(filteredItems.length / poPageSize)
    );

    currentPOPage = Math.min(currentPOPage, totalPages);

    const startIndex = (currentPOPage - 1) * poPageSize;
    const pageItems = filteredItems.slice(
        startIndex,
        startIndex + poPageSize
    );

    if (pageItems.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8">ไม่พบข้อมูลใบสั่งซื้อ</td>
            </tr>
        `;
    } else {
        tbody.innerHTML = pageItems.map(item => {
            const poNumber = escapeHtml(item.po_number || "-");
            const requisitionNumber = escapeHtml(
                item.requisition_number || "-"
            );
            const vendorName = escapeHtml(item.vendor_name || "-");
            const department = escapeHtml(item.department || "-");
            const statusLabel = escapeHtml(
                getPOStatusLabel(item.status)
            );
            const statusClass = getPOStatusClass(item.status);
            const date = formatPODate(item.po_date);
            const amount = formatPOMoney(item.total_amount);
            const poId = encodeURIComponent(item.po_id);

            return `
                <tr>
                    <td>
                        <span class="id">${poNumber}</span>
                    </td>
                    <td>${requisitionNumber}</td>
                    <td>${vendorName}</td>
                    <td>${department}</td>
                    <td>${date}</td>
                    <td>${amount}</td>
                    <td>
                        <span class="status ${statusClass}">
                            ${statusLabel}
                        </span>
                    </td>
                    <td>
                        <a class="table-link"
                           href="goods-receipts.html?po_id=${poId}">
                            ดูรายละเอียด
                        </a>
                    </td>
                </tr>
            `;
        }).join("");
    }

    count.textContent = filteredItems.length === 0
        ? "ไม่พบรายการ"
        : `แสดง ${startIndex + 1}–${Math.min(startIndex + poPageSize, filteredItems.length)
        } จาก ${filteredItems.length} รายการ`;

    renderPOPagination(totalPages);
}

function renderPOPagination(totalPages) {
    const pagination = document.getElementById("po-pagination");
    if (!pagination) return;

    if (totalPages <= 1) {
        pagination.innerHTML = "";
        return;
    }

    let html = `
        <button type="button"
            class="page-button"
            data-page="${currentPOPage - 1}"
            ${currentPOPage === 1 ? "disabled" : ""}>
            ‹
        </button>
    `;

    for (let page = 1; page <= totalPages; page++) {
        html += `
            <button type="button"
                class="page-button ${page === currentPOPage ? "current" : ""}"
                data-page="${page}"
                ${page === currentPOPage ? 'aria-current="page"' : ""}>
                ${page}
            </button>
        `;
    }

    html += `
        <button type="button"
            class="page-button"
            data-page="${currentPOPage + 1}"
            ${currentPOPage === totalPages ? "disabled" : ""}>
            ›
        </button>
    `;

    pagination.innerHTML = html;
}

function initPurchaseOrderPage() {
    const tbody = document.getElementById("po-list");
    if (!tbody) return;

    document.getElementById("po-search")
        ?.addEventListener("input", () => {
            currentPOPage = 1;
            renderPurchaseOrderList();
        });

    document.getElementById("po-status-filter")
        ?.addEventListener("change", () => {
            currentPOPage = 1;
            renderPurchaseOrderList();
        });

    document.getElementById("po-department-filter")
        ?.addEventListener("change", () => {
            currentPOPage = 1;
            renderPurchaseOrderList();
        });

    document.getElementById("po-reset")
        ?.addEventListener("click", () => {
            document.getElementById("po-search").value = "";
            document.getElementById("po-status-filter").value = "";
            document.getElementById("po-department-filter").value = "";

            currentPOPage = 1;
            renderPurchaseOrderList();
        });

    document.getElementById("po-pagination")
        ?.addEventListener("click", event => {
            const button = event.target.closest("button[data-page]");
            if (!button || button.disabled) return;

            const page = Number(button.dataset.page);
            if (!Number.isInteger(page) || page < 1) return;

            currentPOPage = page;
            renderPurchaseOrderList();
        });

    loadPurchaseOrderList();
}

document.addEventListener(
    "DOMContentLoaded",
    initPurchaseOrderPage
);


// loadGoodsReceiptList

let goodsReceiptItems = [];
let currentGRPage = 1;
const grPageSize = 25;

async function loadGoodsReceiptList() {
    const tbody = document.getElementById("gr-list");
    console.log("gr-list:", tbody);
    if (!tbody) return;

    tbody.innerHTML =
        '<tr><td colspan="8">กำลังโหลดข้อมูล...</td></tr>';

    try {
        const response = await fetch(
            "Api.ashx?action=goods-receipt-list"
        );

        if (!response.ok) {
            throw new Error("HTTP " + response.status);
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
            throw new Error("รูปแบบข้อมูล API ไม่ถูกต้อง");
        }

        goodsReceiptItems = data;
        currentGRPage = 1;

        renderGoodsReceiptList();
        filterGoodsReceiptByPO();
    } catch (error) {
        console.error("Goods Receipt Error:", error);

        tbody.innerHTML = `
            <tr>
                <td colspan="8">โหลดข้อมูลไม่สำเร็จ กรุณาตรวจสอบ API</td>
            </tr>
        `;

        document.getElementById("gr-count").textContent =
            "โหลดข้อมูลไม่สำเร็จ";
    }
}

function normalizeGRStatus(status) {
    const value = String(status || "").trim().toLowerCase();

    if (["accepted", "received", "complete", "completed"].includes(value)) {
        return "received";
    }

    if (["partial", "partially received", "processing"].includes(value)) {
        return "processing";
    }

    return "pending";
}

function getGRStatusLabel(status) {
    const labels = {
        pending: "รอรับสินค้า",
        processing: "รับบางส่วน",
        received: "รับครบแล้ว"
    };

    return labels[normalizeGRStatus(status)];
}

function formatGRMoney(amount) {
    return Number(amount || 0).toLocaleString("th-TH", {
        style: "currency",
        currency: "THB",
        maximumFractionDigits: 2
    });
}

function formatGRDate(value) {
    if (!value) return "-";

    const parts = String(value).split("-");
    if (parts.length !== 3) return escapeHtml(value);

    return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function renderGoodsReceiptList() {
    const tbody = document.getElementById("gr-list");
    const count = document.getElementById("gr-count");

    if (!tbody || !count) return;

    const search = (
        document.getElementById("gr-search")?.value || ""
    ).trim().toLowerCase();

    const statusFilter =
        document.getElementById("gr-status-filter")?.value || "";

    const departmentFilter =
        document.getElementById("gr-department-filter")?.value || "";

    const filtered = goodsReceiptItems.filter(item => {
        const matchesSearch = [
            item.po_number,
            item.vendor_name,
            item.department,
            item.department_code
        ].some(value =>
            String(value ?? "").toLowerCase().includes(search)
        );

        const matchesStatus =
            !statusFilter ||
            normalizeGRStatus(item.receipt_status) === statusFilter;

        const matchesDepartment =
            !departmentFilter ||
            String(item.department_code || "").toUpperCase() ===
            departmentFilter.toUpperCase();

        return matchesSearch && matchesStatus && matchesDepartment;
    });

    const totalPages = Math.max(
        1,
        Math.ceil(filtered.length / grPageSize)
    );

    currentGRPage = Math.min(currentGRPage, totalPages);

    const start = (currentGRPage - 1) * grPageSize;
    const pageItems = filtered.slice(start, start + grPageSize);

    if (pageItems.length === 0) {
        tbody.innerHTML =
            '<tr><td colspan="8">ไม่พบข้อมูลรับสินค้า</td></tr>';
    } else {
        tbody.innerHTML = pageItems.map(item => {
            const status = normalizeGRStatus(item.receipt_status);
            const statusClass = status === "received"
                ? "received"
                : status === "processing"
                    ? "processing"
                    : "pending";

            const poId = encodeURIComponent(item.po_id);

            return `
                <tr>
                    <td>
                        <span class="id">
                            GR-${String(item.receipt_id).padStart(6, "0")}
                        </span>
                    </td>
                    <td>${escapeHtml(item.po_number || "-")}</td>
                    <td>${escapeHtml(item.vendor_name || "-")}</td>
                    <td>${formatGRDate(item.received_date)}</td>
                    <td>${formatGRMoney(item.order_amount)}</td>
                    <td>${formatGRMoney(item.accepted_amount)}</td>
                    <td>${formatGRMoney(item.remaining_amount)}</td>
                    <td>
                        <span class="status ${statusClass}">
                            ${getGRStatusLabel(status)}
                        </span>
                        <a class="table-link"
                           href="goods-receipts.html?po_id=${poId}"
                           style="margin-left:8px">
                            ดู
                        </a>
                    </td>
                </tr>
            `;
        }).join("");
    }

    count.textContent = filtered.length === 0
        ? "ไม่พบรายการ"
        : `แสดง ${start + 1}–${Math.min(
            start + grPageSize,
            filtered.length
        )} จาก ${filtered.length} รายการ`;

    renderGRPagination(totalPages);
}

function renderGRPagination(totalPages) {
    const container = document.getElementById("gr-pagination");
    if (!container) return;

    if (totalPages <= 1) {
        container.innerHTML = "";
        return;
    }

    let html = `
        <button type="button" data-page="${currentGRPage - 1}"
            ${currentGRPage === 1 ? "disabled" : ""}>‹</button>
    `;

    for (let page = 1; page <= totalPages; page++) {
        html += `
            <button type="button"
                data-page="${page}"
                class="${page === currentGRPage ? "current" : ""}">
                ${page}
            </button>
        `;
    }

    html += `
        <button type="button" data-page="${currentGRPage + 1}"
            ${currentGRPage === totalPages ? "disabled" : ""}>›</button>
    `;

    container.innerHTML = html;
}

function filterGoodsReceiptByPO() {
    const params = new URLSearchParams(window.location.search);
    const poId = params.get("po_id");
    const notice = document.getElementById("gr-notice");

    if (!poId || !notice) return;

    const found = goodsReceiptItems.some(
        item => String(item.po_id) === String(poId)
    );

    if (found) {
        document.getElementById("gr-search").value =
            "PO-" + String(poId).padStart(6, "0");

        notice.textContent = `กำลังแสดงข้อมูลของใบสั่งซื้อ PO-${String(poId).padStart(6, "0")}`;

        renderGoodsReceiptList();
    } else {
        notice.textContent =
            `ไม่พบใบสั่งซื้อ PO-${poId} ในข้อมูลที่โหลด`;
    }
}


function initGoodsReceiptPage() {
    if (!document.getElementById("gr-list")) return;

    document.getElementById("gr-search")
        ?.addEventListener("input", () => {
            currentGRPage = 1;
            renderGoodsReceiptList();
        });

    document.getElementById("gr-status-filter")
        ?.addEventListener("change", () => {
            currentGRPage = 1;
            renderGoodsReceiptList();
        });

    document.getElementById("gr-department-filter")
        ?.addEventListener("change", () => {
            currentGRPage = 1;
            renderGoodsReceiptList();
        });

    document.getElementById("gr-reset")
        ?.addEventListener("click", () => {
            document.getElementById("gr-search").value = "";
            document.getElementById("gr-status-filter").value = "";
            document.getElementById("gr-department-filter").value = "";

            const notice = document.getElementById("gr-notice");
            if (notice) notice.textContent = "";

            currentGRPage = 1;
            renderGoodsReceiptList();
        });

    document.getElementById("gr-pagination")
        ?.addEventListener("click", event => {
            const button = event.target.closest("button[data-page]");
            if (!button || button.disabled) return;

            const page = Number(button.dataset.page);
            if (!Number.isInteger(page) || page < 1) return;

            currentGRPage = page;
            renderGoodsReceiptList();
        });

    loadGoodsReceiptList();
}


// ตรวจสอบผู้ใช้ที่เข้าสู่ระบบ
async function loadCurrentUser() {
    const nameElement = document.getElementById("currentUserName");
    const roleElement = document.getElementById("currentUserRole");
    const avatarElement = document.getElementById("currentUserAvatar");

    // ทำงานเฉพาะหน้าที่มีส่วนแสดงข้อมูลผู้ใช้
    if (!nameElement) return;

    try {
        const response = await fetch("Api.ashx?action=me", {
            method: "GET",
            credentials: "same-origin",
            cache: "no-store"
        });

        if (response.status === 401) {
            window.location.replace("login.html");
            return;
        }

        if (!response.ok) {
            throw new Error("โหลดข้อมูลผู้ใช้ไม่สำเร็จ");
        }

        const result = await response.json();

        if (!result.success || !result.user) {
            window.location.replace("login.html");
            return;
        }

        const name = result.user.name || "ผู้ใช้งาน";

        nameElement.textContent = name;

        if (roleElement) {
            roleElement.textContent = result.user.staff_role || "";
        }

        if (avatarElement) {
            avatarElement.textContent = name.charAt(0).toUpperCase();
        }

    } catch (error) {
        console.error("Load current user error:", error);
        nameElement.textContent = "โหลดข้อมูลไม่สำเร็จ";
    }
}



console.log("script.js loaded");

document.addEventListener("DOMContentLoaded", function () {
    loadCurrentUser();
    loadProfilePage();

    // เริ่มทำงานเฉพาะหน้าที่มีตาราง Goods Receipts
    if (document.getElementById("gr-list")) {
        console.log("Goods Receipts page loaded");
        initGoodsReceiptPage();
    }
});




// Create Requisition Page 

let createReqSubmitting = false;

function createReqMoney(value) {
    return Number(value || 0).toLocaleString("th-TH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function createReqAddItem() {
    const container = document.getElementById("request-items");
    if (!container) return;

    const row = document.createElement("div");
    row.className = "item-row request-item-row";

    row.innerHTML = `
        <div class="field">
            <label>ชื่อสินค้า</label>
            <input class="req-item-name" maxlength="150"
                   placeholder="เช่น Laptop" required>
        </div>

        <div class="field">
            <label>จำนวน</label>
            <input class="req-item-qty" type="number"
                   min="1" step="1" value="1" required>
        </div>

        <div class="field">
            <label>ราคาต่อหน่วย (บาท)</label>
            <input class="req-item-price" type="number"
                   min="0" step="0.01" value="0" required>
        </div>

        <div class="field">
            <label>รวม (บาท)</label>
            <output class="req-item-subtotal">฿0.00</output>
        </div>

        <button class="btn secondary req-item-remove"
                type="button" aria-label="ลบรายการสินค้า">
            ลบ
        </button>
    `;

    container.appendChild(row);
    updateCreateReqTotal();
}

function updateCreateReqTotal() {
    const rows = document.querySelectorAll(".request-item-row");
    let total = 0;

    rows.forEach(row => {
        const qty = Number(row.querySelector(".req-item-qty").value);
        const priceInput = row.querySelector(".req-item-price");
        const price = Number(priceInput.value);
        const valid = priceInput.value.trim() !== "" &&
            Number.isFinite(qty) && Number.isFinite(price) &&
            qty > 0 && price >= 0;

        const subtotal = valid ? qty * price : 0;
        total += subtotal;

        row.querySelector(".req-item-subtotal").textContent =
            "฿" + createReqMoney(subtotal);
    });

    // ปัดเศษเป็น 2 ตำแหน่ง เพื่อให้ตรงกับการแสดงผลสกุลเงินบาท
    total = Math.round((total + Number.EPSILON) * 100) / 100;
    const vat = Math.round((total * 0.07 + Number.EPSILON) * 100) / 100;
    const grandTotal = Math.round((total + vat + Number.EPSILON) * 100) / 100;

    const totalElement = document.getElementById("request-total");
    const vatElement = document.getElementById("request-vat");
    const grandTotalElement = document.getElementById("request-grand-total");

    if (totalElement) totalElement.textContent = "฿" + createReqMoney(total);
    if (vatElement) vatElement.textContent = "฿" + createReqMoney(vat);
    if (grandTotalElement) {
        grandTotalElement.textContent = "฿" + createReqMoney(grandTotal);
    }
}

let currentUser = null;
async function loadCreateReqOptions() {
    const requesterSelect =
        document.getElementById("requester_staff_id");
    const budgetSelect =
        document.getElementById("budget_id");
    const vendorSelect =
        document.getElementById("preferred_vendor_id");

    try {
        const meResponse = await fetch(
            "Api.ashx?action=me",
            {
                credentials: "same-origin",
                cache: "no-store"
            }
        );

        if (meResponse.status === 401) {
            window.location.replace("login.html");
            return;
        }

        if (!meResponse.ok) {
            throw new Error("โหลดข้อมูลผู้ใช้ไม่สำเร็จ");
        }

        const meResult = await meResponse.json();

        if (!meResult.success || !meResult.user) {
            window.location.replace("login.html");
            return;
        }

        currentUser = meResult.user;
        const user = currentUser;

        // แสดงผู้ขอซื้อที่เข้าสู่ระบบ
        requesterSelect.replaceChildren(
            new Option(user.name, String(user.staff_id))
        );

        requesterSelect.value = String(user.staff_id);
        requesterSelect.disabled = true;

        // โหลดงบประมาณของแผนกผู้ใช้
        budgetSelect.replaceChildren(
            new Option("กำลังโหลดงบประมาณ...", "")
        );

        if (user.department_id == null) {
            budgetSelect.replaceChildren(
                new Option("ไม่พบแผนกของผู้ใช้", "")
            );
        } else {
            const budgetResponse = await fetch(
                `Api.ashx?action=budgets&department_id=${encodeURIComponent(user.department_id)
                }`,
                {
                    credentials: "same-origin",
                    cache: "no-store"
                }
            );

            if (!budgetResponse.ok) {
                throw new Error("โหลดงบประมาณไม่สำเร็จ");
            }

            const budgets = await budgetResponse.json();

            budgetSelect.replaceChildren(
                new Option("เลือกงบประมาณ", "")
            );

            budgets.forEach(item => {
                if (item.budget_id == null) return;

                const year = item.fiscal_year != null
                    ? `ปีงบประมาณ ${item.fiscal_year}`
                    : "ไม่ระบุปี";

                budgetSelect.add(
                    new Option(
                        `${year} (คงเหลือ ${Number(
                            item.remaining_amount || 0
                        ).toLocaleString("th-TH")} บาท)`,
                        String(item.budget_id)
                    )
                );
            });

            if (budgetSelect.options.length === 1) {
                budgetSelect.replaceChildren(
                    new Option("ไม่พบงบประมาณของแผนกนี้", "")
                );
            }
        }

        // โหลดผู้ขาย
        const vendorResponse = await fetch(
            "Api.ashx?action=vendors",
            {
                credentials: "same-origin",
                cache: "no-store"
            }
        );

        if (!vendorResponse.ok) {
            throw new Error("โหลดข้อมูลผู้ขายไม่สำเร็จ");
        }

        const vendors = await vendorResponse.json();

        vendorSelect.replaceChildren(
            new Option("ไม่ระบุผู้ขาย", "")
        );

        vendors.forEach(item => {
            vendorSelect.add(
                new Option(
                    item.vendor_name,
                    String(item.vendor_id)
                )
            );
        });

    } catch (error) {
        console.error("Create requisition options error:", error);

        const message =
            document.getElementById("request-message");

        if (message) {
            message.textContent =
                "โหลดข้อมูลไม่สำเร็จ กรุณาตรวจสอบ API";
        }
    }
}

function initCreateRequisitionPage() {
    const form = document.getElementById("requisition-form");
    if (!form) return;

    const container = document.getElementById("request-items");
    const message = document.getElementById("request-message");
    const submitButton = document.getElementById("submit-requisition");

    createReqAddItem();
    loadCreateReqOptions();

    document.getElementById("add-request-item")
        .addEventListener("click", createReqAddItem);

    container.addEventListener("input", event => {
        if (event.target.matches(".req-item-qty, .req-item-price")) {
            updateCreateReqTotal();
        }
    });

    container.addEventListener("click", event => {
        const button = event.target.closest(".req-item-remove");
        if (!button) return;

        const rows = container.querySelectorAll(".request-item-row");

        if (rows.length <= 1) {
            message.textContent = "ต้องมีสินค้าอย่างน้อย 1 รายการ";
            return;
        }

        button.closest(".request-item-row").remove();
        message.textContent = "";
        updateCreateReqTotal();
    });

    form.addEventListener("submit", async event => {
        event.preventDefault();

        if (createReqSubmitting) return;

        message.textContent = "";

        const requester = Number(
            document.getElementById("requester_staff_id").value
        );

        const budget = Number(
            document.getElementById("budget_id").value
        );

        const vendorValue =
            document.getElementById("preferred_vendor_id").value;

        const purpose =
            document.getElementById("purpose").value.trim();

        const items = [];
        let invalid = false;

        container.querySelectorAll(".request-item-row").forEach(row => {
            const name = row.querySelector(".req-item-name").value.trim();
            const qtyValue = row.querySelector(".req-item-qty").value;
            const priceValue = row.querySelector(".req-item-price").value;

            const quantity = Number(qtyValue);
            const unitPrice = Number(priceValue);

            if (
                !name ||
                !Number.isInteger(quantity) ||
                quantity <= 0 ||
                priceValue.trim() === "" ||
                !Number.isFinite(unitPrice) ||
                unitPrice < 0
            ) {
                invalid = true;
                return;
            }

            items.push({
                item_name: name,
                quantity: quantity,
                unit_price: unitPrice
            });
        });

        if (!Number.isInteger(requester) || requester <= 0) {
            message.textContent = "กรุณาเลือกผู้ขอซื้อ";
            return;
        }

        if (!Number.isInteger(budget) || budget <= 0) {
            message.textContent = "กรุณาเลือกงบประมาณ";
            return;
        }

        if (!purpose) {
            message.textContent = "กรุณาระบุวัตถุประสงค์";
            return;
        }

        if (invalid || items.length === 0) {
            message.textContent =
                "กรุณาตรวจสอบชื่อสินค้า จำนวน และราคาต่อหน่วย";
            return;
        }

        if (
            currentUser?.department_id == null ||
            !Number.isInteger(Number(currentUser.department_id))
        ) {
            throw new Error("ไม่พบรหัสแผนก กรุณาเข้าสู่ระบบใหม่");
        }
        const payload = {
            requester_staff_id: requester,
            department_id: Number(currentUser?.department_id),
            budget_id: budget,
            preferred_vendor_id: vendorValue || null,
            purpose: purpose,
            items: items
        };
        console.log("Create requisition payload:", payload);
        console.log("department_id:", payload.department_id);

        createReqSubmitting = true;
        submitButton.disabled = true;
        submitButton.textContent = "กำลังบันทึก...";

        try {
            const response = await fetch(
                "Api.ashx?action=create-requisition",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json; charset=utf-8"
                    },
                    body: JSON.stringify(payload)
                }
            );

            const result = await response.json();

            if (!response.ok) {
                throw new Error(
                    result.error || "บันทึกใบขอซื้อไม่สำเร็จ"
                );
            }

            message.textContent =
                `บันทึกสำเร็จ เลขที่ใบขอซื้อ REQ-${result.requisition_id}`;

            form.reset();
            container.replaceChildren();
            createReqAddItem();

        } catch (error) {
            console.error("Create requisition error:", error);
            message.textContent =
                error.message || "เกิดข้อผิดพลาดขณะบันทึกข้อมูล";
        } finally {
            createReqSubmitting = false;
            submitButton.disabled = false;
            submitButton.textContent = "บันทึกใบขอซื้อ";
        }
    });
}

document.addEventListener(
    "DOMContentLoaded",
    initCreateRequisitionPage
);




// Approval Detail Page

async function loadApprovalDetail() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");

    const message = document.getElementById("detail-message");
    const itemsBody = document.getElementById("detail-items");

    if (!id || !/^\d+$/.test(id) || Number(id) <= 0) {
        message.textContent = "ไม่พบเลขที่ใบขอซื้อ กรุณากลับไปเลือกจากรายการ";
        itemsBody.innerHTML = `
    <tr>
    <td colspan="5" style="text-align:center">
        ไม่พบข้อมูล
    </td>
            </tr >`;
        return;
    }

    try {
        const response = await fetch(
            `Api.ashx?action=requisition-detail&id=${encodeURIComponent(id)}`
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "ไม่สามารถโหลดข้อมูลได้");
        }

        const req = data.requisition;
        console.log("Requisition detail:", req);

        renderApprovalDetailTotals(req);



        // รายละเอียดใบขอซื้อ
        document.getElementById("detail-id").textContent =
            req.requisition_no || `REQ - ${req.requisition_id}`;

        document.getElementById("detail-requester").textContent =
            req.requester_name || "-";

        document.getElementById("detail-department").textContent =
            req.department || "-";

        document.getElementById("detail-date").textContent =
            formatApprovalDate(req.request_date);

        document.getElementById("detail-purpose").textContent =
            req.purpose || "-";

        document.getElementById("detail-status").textContent =
            req.status || "-";

        // รายการสินค้า
        if (!data.items || data.items.length === 0) {
            itemsBody.innerHTML = `
    <tr>
    <td colspan="5" style="text-align:center">
        ไม่มีรายการสินค้า
    </td>
                </tr >`;
        } else {
            itemsBody.innerHTML = data.items.map(item => `
    <tr>
                    <td>${escapeApprovalText(item.line_no)}</td>
                    <td>${escapeApprovalText(item.item_name)}</td>
                    <td>${Number(item.quantity).toLocaleString("th-TH")}</td>
                    <td>${formatApprovalMoney(item.unit_price)}</td>
                    <td>${formatApprovalMoney(item.line_total)}</td>
                </tr >
    `).join("");
        }

        

        // ประวัติการอนุมัติ
        const approvalMessage = document.getElementById("approval-message");

        if (data.approvals && data.approvals.length > 0) {
            approvalMessage.innerHTML = `
    <div class="table-wrap">
        <table>
            <thead>
                <tr>
                    <th>ลำดับ</th>
                    <th>ผู้อนุมัติ</th>
                    <th>สถานะ</th>
                    <th>วันที่ดำเนินการ</th>
                    <th>ความคิดเห็น</th>
                </tr>
            </thead>
            <tbody>
                ${data.approvals.map(a => `
                                <tr>
                                    <td>${escapeApprovalText(a.approval_level)}</td>
                                    <td>${escapeApprovalText(a.approver_name || "-")}</td>
                                    <td>${escapeApprovalText(a.approval_status || "-")}</td>
                                    <td>${formatApprovalDate(a.approved_at)}</td>
                                    <td>${escapeApprovalText(a.comments || "-")}</td>
                                </tr>
                            `).join("")}
            </tbody>
        </table>
                </div >`;
        } else {
            approvalMessage.textContent = "ยังไม่มีข้อมูลการอนุมัติ";
        }



        message.textContent = "โหลดรายละเอียดใบขอซื้อสำเร็จ";

    } catch (error) {
        console.error("Load approval detail failed:", error);
        message.textContent = "โหลดข้อมูลไม่สำเร็จ: " + error.message;
        itemsBody.innerHTML = `
    <tr>
    <td colspan="5" style="text-align:center">
        ไม่สามารถโหลดรายการสินค้าได้
    </td>
            </tr>`;
    }
}

function formatApprovalMoney(value) {
    return Number(value || 0).toLocaleString("th-TH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}


function renderApprovalDetailTotals(req) {
    const subtotal = Number(req.subtotal_amount ?? 0);
    const vat = Number(req.vat_amount ?? 0);
    const grandTotal = Number(req.total_amount ?? 0);

    const money = value =>
        "฿" + value.toLocaleString("th-TH", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });

    const totalElement = document.getElementById("detail-total");
    const vatElement = document.getElementById("detail-vat");
    const grandTotalElement =
        document.getElementById("detail-grand-total");

    if (totalElement) {
        totalElement.textContent = money(subtotal);
    }

    if (vatElement) {
        vatElement.textContent = money(vat);
    }

    if (grandTotalElement) {
        grandTotalElement.textContent = money(grandTotal);
    }
}

function formatApprovalDate(value) {
    if (!value) return "-";

    let date;

    // รองรับวันที่รูปแบบ /Date(1790528400000)/
    const match = String(value).match(/^\/Date\((-?\d+)\)\/$/);

    if (match) {
        date = new Date(Number(match[1]));
    } else {
        date = new Date(value);
    }

    if (Number.isNaN(date.getTime())) {
        return "-";
    }

    return date.toLocaleDateString("th-TH", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    });
}



function escapeApprovalText(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

// ทำงานเฉพาะหน้ารายละเอียดใบขอซื้อ
if (document.getElementById("requisition-detail")) {
    loadApprovalDetail();
}

// loadApproverOptions

async function loadApproverOptions() {
    const currentApprover = document.getElementById("current-approver");
    const approveButton = document.getElementById("approve-button");
    const rejectButton = document.getElementById("reject-button");
    const message = document.getElementById("approval-message");

    if (!select || !approveButton || !rejectButton || !message) {
        return;
    }

    approveButton.disabled = true;
    rejectButton.disabled = true;
    select.innerHTML = '<option value="">กำลังโหลดรายชื่อ...</option>';

    try {
        const response = await fetch("Api.ashx?action=staff");
        const staffList = await response.json();

        if (!response.ok || !Array.isArray(staffList)) {
            throw new Error("ไม่สามารถโหลดรายชื่อพนักงานได้");
        }

        select.innerHTML =
            '<option value="">-- เลือกผู้อนุมัติ --</option>';

        staffList.forEach(staff => {
            const option = document.createElement("option");
            option.value = staff.staff_id;

            const fullName = [
                staff.first_name,
                staff.last_name
            ].filter(Boolean).join(" ");

            option.textContent =
                `${fullName} (${staff.staff_role || "Staff"})`;

            select.appendChild(option);
        });

        message.textContent =
            "เลือกรายชื่อผู้อนุมัติที่ตรงกับขั้นตอนปัจจุบันก่อนดำเนินการ";

        message.className = "";

        select.addEventListener("change", () => {
            const hasApprover = select.value !== "";
            approveButton.disabled = !hasApprover;
            rejectButton.disabled = !hasApprover;
        });

    } catch (error) {
        select.innerHTML =
            '<option value="">โหลดรายชื่อไม่สำเร็จ</option>';

        message.textContent = error.message;
        message.className = "error";
    }
}


async function submitApprovalDecision(decision) {
    const commentsInput = document.getElementById("approval-comments");
    const approveButton = document.getElementById("approve-button");
    const rejectButton = document.getElementById("reject-button");
    const message = document.getElementById("approval-message");

    const params = new URLSearchParams(window.location.search);
    const requisitionId = Number(params.get("id"));
    const comments = commentsInput?.value.trim() || "";

    if (!Number.isInteger(requisitionId) || requisitionId <= 0) {
        message.textContent = "ไม่พบรหัสใบขอซื้อที่ถูกต้อง";
        message.className = "error";
        return;
    }

    if (decision !== "Approved" && decision !== "Rejected") {
        message.textContent = "สถานะการพิจารณาไม่ถูกต้อง";
        message.className = "error";
        return;
    }

    if (decision === "Rejected" && !comments) {
        message.textContent = "กรุณาระบุเหตุผลกรณีไม่อนุมัติ";
        message.className = "error";
        commentsInput?.focus();
        return;
    }

    const confirmed = window.confirm(
        decision === "Approved"
            ? "ยืนยันการอนุมัติใบขอซื้อนี้หรือไม่?"
            : "ยืนยันการไม่อนุมัติใบขอซื้อนี้หรือไม่?"
    );

    if (!confirmed) return;

    approveButton.disabled = true;
    rejectButton.disabled = true;
    message.textContent = "กำลังบันทึกผลการพิจารณา...";
    message.className = "";

    try {
        const response = await fetch("Api.ashx?action=approve", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                requisition_id: requisitionId,
                decision: decision,
                comments: comments,
                vendor_id: null,
                vat_rate: 7
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result.error ||
                result.message ||
                "ไม่สามารถบันทึกผลการพิจารณาได้"
            );
        }

        const resultRow = Array.isArray(result) ? result[0] : result;

        if (
            resultRow &&
            resultRow.result_message
        ) {
            message.textContent = resultRow.result_message;
        } else {
            message.textContent = "ส่งคำขอเรียบร้อยแล้ว";
        }

        message.className = "success";

        await loadApprovalDetail();

    } catch (error) {
        message.textContent =
            error.message || "เกิดข้อผิดพลาดในการบันทึกข้อมูล";
        message.className = "error";
    } finally {
        approveButton.disabled = false;
        rejectButton.disabled = false;
    }
}




function setupApprovalButtons() {
    const approveButton = document.getElementById("approve-button");
    const rejectButton = document.getElementById("reject-button");

    if (!approveButton || !rejectButton) return;

    approveButton.addEventListener("click", () => {
        submitApprovalDecision("Approved");
    });

    rejectButton.addEventListener("click", () => {
        submitApprovalDecision("Rejected");
    });
}

if (document.getElementById("approval-message")) {

    setupApprovalButtons();
}

// loadCurrentUser
async function loadCurrentUser() {
    const nameElement = document.getElementById("currentUserName");
    const roleElement = document.getElementById("currentUserRole");
    const avatarElement = document.getElementById("currentUserAvatar");

    try {
        const response = await fetch("Api.ashx?action=me", {
            method: "GET",
            credentials: "same-origin",
            cache: "no-store"
        });

        if (response.status === 401) {
            window.location.replace("login.html");
            return;
        }

        if (!response.ok) {
            throw new Error("โหลดข้อมูลผู้ใช้ไม่สำเร็จ");
        }

        const result = await response.json();

        if (!result.success || !result.user) {
            window.location.replace("login.html");
            return;
        }

        const name = result.user.name || "ผู้ใช้งาน";

        if (nameElement) {
            nameElement.textContent = name;
        }

        if (roleElement) {
            roleElement.textContent = result.user.staff_role || "";
        }

        if (avatarElement) {
            avatarElement.textContent = name.charAt(0).toUpperCase();
        }

    } catch (error) {
        console.error("Load current user error:", error);

        if (nameElement) {
            nameElement.textContent = "โหลดข้อมูลไม่สำเร็จ";
        }
    }
}

document.addEventListener("DOMContentLoaded", loadCurrentUser);



async function loadProfilePage() {
    if (!document.getElementById("profileName")) return;

    try {
        const response = await fetch("Api.ashx?action=me", {
            method: "GET",
            credentials: "same-origin",
            cache: "no-store"
        });

        if (response.status === 401) {
            window.location.replace("login.html");
            return;
        }

        if (!response.ok) {
            throw new Error("โหลดข้อมูลผู้ใช้ไม่สำเร็จ");
        }

        const result = await response.json();

        if (!result.success || !result.user) {
            window.location.replace("login.html");
            return;
        }

        const user = result.user;
        const name = user.name || "ผู้ใช้งาน";
        const role = user.staff_role || "";

        const setText = (id, value) => {
            const element = document.getElementById(id);
            if (element) element.textContent = value;
        };

        setText("currentUserName", name);
        setText("currentUserRole", role);
        setText("profileName", name);
        setText("profileRole", role);
        setText("currentUserAvatar", name.charAt(0).toUpperCase());
        setText("profileAvatar", name.charAt(0).toUpperCase());

    } catch (error) {
        console.error("Load profile error:", error);
        setTextIfExists("profileName", "โหลดข้อมูลไม่สำเร็จ");
    }
}

function setTextIfExists(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
}

async function fetchCurrentUser() {
    const response = await fetch("Api.ashx?action=me", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store"
    });

    if (response.status === 401) {
        window.location.replace("login.html");
        return null;
    }

    if (!response.ok) {
        throw new Error("โหลดข้อมูลผู้ใช้ไม่สำเร็จ");
    }

    const result = await response.json();

    if (!result.success || !result.user) {
        window.location.replace("login.html");
        return null;
    }

    return result.user;
}

function setTextIfExists(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = value ?? "";
    }
}

function displayCurrentUser(user) {
    const name = user.name || "ผู้ใช้งาน";
    const role = user.staff_role || "";
    const initial = name.charAt(0).toUpperCase();

    setTextIfExists("currentUserName", name);
    setTextIfExists("currentUserRole", role);
    setTextIfExists("currentUserAvatar", initial);
}

async function loadCurrentUser() {
    // หน้า Profile จะโหลดข้อมูลผ่าน loadProfilePage()
    if (document.getElementById("profileName")) return;

    try {
        const user = await fetchCurrentUser();
        if (user) displayCurrentUser(user);
    } catch (error) {
        console.error("Load current user error:", error);
        setTextIfExists("currentUserName", "โหลดข้อมูลไม่สำเร็จ");
    }
}

async function loadProfilePage() {
    if (!document.getElementById("profileName")) return;

    try {
        const user = await fetchCurrentUser();
        if (!user) return;

        displayCurrentUser(user);

        const name = user.name || "ผู้ใช้งาน";
        const initial = name.charAt(0).toUpperCase();

        setTextIfExists("profileName", name);
        setTextIfExists("profileRole", user.staff_role || "");
        setTextIfExists("profileAvatar", initial);

        // เติมข้อมูลเมื่อ API ส่งฟิลด์เหล่านี้กลับมา
        setTextIfExists("profileUsername", user.username || "");
        setTextIfExists("profileEmail", user.email || "");
        setTextIfExists("profileDepartment", user.department_name || "");

    } catch (error) {
        console.error("Load profile error:", error);
        setTextIfExists("profileName", "โหลดข้อมูลไม่สำเร็จ");
    }
}

document.addEventListener("DOMContentLoaded", () => {
    loadCurrentUser();
    loadProfilePage();
});

async function fetchCurrentUser() {
    const response = await fetch("Api.ashx?action=me", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store"
    });

    if (response.status === 401) {
        window.location.replace("login.html");
        return null;
    }

    if (!response.ok) {
        throw new Error("โหลดข้อมูลผู้ใช้ไม่สำเร็จ");
    }

    const result = await response.json();

    if (!result.success || !result.user) {
        window.location.replace("login.html");
        return null;
    }

    return result.user;
}

function setTextIfExists(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value ?? "";
}

function displayCurrentUser(user) {
    const name = user.name || "ผู้ใช้งาน";
    const initial = name.charAt(0).toUpperCase();

    setTextIfExists("currentUserName", name);
    setTextIfExists("currentUserRole", user.staff_role || "");
    setTextIfExists("currentUserAvatar", initial);

    setTextIfExists("profileName", name);
    setTextIfExists("profileRole", user.staff_role || "");
    setTextIfExists("profileAvatar", initial);
}


async function loadProfilePage() {
    if (!document.getElementById("profileName")) return;

    try {
        const user = await fetchCurrentUser();
        if (!user) return;

        const name = user.name || "ผู้ใช้งาน";
        const initial = name.charAt(0).toUpperCase();

        setValueIfExists("currentUserName", name);
        setValueIfExists("currentUserRole", user.staff_role);
        setValueIfExists("currentUserAvatar", initial);

        setValueIfExists("profileName", name);
        setValueIfExists("profileFullName", name);
        setValueIfExists("profileRole", user.staff_role);
        setValueIfExists("profileAvatar", initial);
        setValueIfExists("profileUsername", user.username);
        setValueIfExists("profileEmail", user.email);
        setValueIfExists("profileDepartment", user.department);

    } catch (error) {
        console.error("Load profile error:", error);
        setValueIfExists("profileName", "โหลดข้อมูลไม่สำเร็จ");
    }
}

document.addEventListener("DOMContentLoaded", () => {
    loadCurrentUser();
    loadProfilePage();
});


function setValueIfExists(id, value) {
    const element = document.getElementById(id);
    if (!element) return;

    const safeValue = value ?? "";

    if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement
    ) {
        element.value = safeValue;
    } else {
        element.textContent = safeValue;
    }
}

// loadCurrentApprover

async function loadCurrentApprover() {
    const approverElement =
        document.getElementById("current-approver");

    const approveButton =
        document.getElementById("approve-button");

    const rejectButton =
        document.getElementById("reject-button");

    if (!approverElement) return;

    try {
        const response = await fetch(
            "Api.ashx?action=me",
            {
                method: "GET",
                credentials: "same-origin",
                cache: "no-store"
            }
        );

        if (response.status === 401) {
            window.location.replace("login.html");
            return;
        }

        if (!response.ok) {
            throw new Error("ไม่สามารถตรวจสอบผู้ใช้ได้");
        }

        const result = await response.json();

        if (!result.success || !result.user) {
            throw new Error("ไม่พบข้อมูลผู้ใช้");
        }

        const user = result.user;

        // แสดงชื่อของผู้ใช้ที่เข้าสู่ระบบ
        approverElement.textContent = user.name;

    } catch (error) {
        console.error("Load current approver error:", error);

        approverElement.textContent =
            "ไม่สามารถโหลดข้อมูลผู้อนุมัติได้";

        if (approveButton) approveButton.disabled = true;
        if (rejectButton) rejectButton.disabled = true;
    }
}

loadCurrentApprover();



