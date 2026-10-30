

// Dashboard Summary Section


async function loadDashboardSummary(year) {
    const money = new Intl.NumberFormat('th-TH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

    const number = new Intl.NumberFormat('th-TH');

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    try {
        const response = await fetch(
            `Api.ashx?action=summary&year=${encodeURIComponent(year)}`
        );

        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status}`);
        }

        const result = await response.json();
        const data = Array.isArray(result) ? result[0] : result;

        if (!data) {
            throw new Error('ไม่พบข้อมูล Summary');
        }

        const requisitionsCount = Number(data.requisitions_count);
        const purchaseOrdersCount = Number(data.purchase_orders_count);
        const pendingCount = Number(data.pending_count);
        const budgetUsed = Number(data.budget_used);
        const budgetTotal = Number(data.budget_total);

        if (
            !Number.isFinite(requisitionsCount) ||
            !Number.isFinite(purchaseOrdersCount) ||
            !Number.isFinite(pendingCount) ||
            !Number.isFinite(budgetUsed) ||
            !Number.isFinite(budgetTotal)
        ) {
            throw new Error('ข้อมูล Summary หรือ Budget ไม่ถูกต้อง');
        }

        const budgetRemaining = budgetTotal - budgetUsed;
        const usedPercent = budgetTotal > 0
            ? (budgetUsed / budgetTotal) * 100
            : 0;

        setText('requisitions-count', number.format(requisitionsCount));
        setText('purchase-orders-count', number.format(purchaseOrdersCount));
        setText('pending-count', number.format(pendingCount));

        setText(
            'budget-remaining',
            '฿' + money.format(budgetRemaining)
        );

        setText(
            'budget-detail',
            `ใช้ไป ฿${money.format(budgetUsed)} จากงบรวม ` +
            `฿${money.format(budgetTotal)} (${usedPercent.toFixed(2)}%)`
        );

        console.log(`Dashboard Summary ปี ${year}:`, data);

    } catch (error) {
        console.error('Dashboard Summary Error:', error);

        setText('budget-detail', 'ไม่สามารถโหลดข้อมูลงบประมาณได้');

        [
            'requisitions-count',
            'purchase-orders-count',
            'pending-count',
            'budget-remaining'
        ].forEach(id => setText(id, '-'));
    }
}



// Monthly Chart Section

async function loadMonthlyChart(year) {
    const chart = document.getElementById('monthly-chart');

    if (!chart) {
        console.error('ไม่พบ element #monthly-chart');
        return;
    }

    try {
        // ใช้รูปแบบ URL เดียวกับ Summary
        const response = await fetch(
            `Api.ashx?action=monthly-requisitions&year=${encodeURIComponent(year)}`
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
        const selectedYear = Number(year);
        const months = [];

        for (let month = 1; month <= 12; month++) {
            const date = new Date(selectedYear, month - 1, 1);

            months.push({
                year: selectedYear,
                month: month,
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

// Initialize Dashboard

async function loadDashboardByYear() {
    const yearSelector = document.getElementById('dashboard-year');
    if (!yearSelector) return;

    const year = Number(yearSelector.value);
    if (![2024, 2025, 2026, 2027].includes(year)) {
        console.error('ปีที่เลือกไม่ถูกต้อง');
        return;
    }

    const budgetYearLabel = document.getElementById("budget-year-label");
    const departmentYearLabel = document.getElementById("department-budget-year-label");
    if (budgetYearLabel) budgetYearLabel.textContent = String(year);
    if (departmentYearLabel) departmentYearLabel.textContent = String(year);

    await Promise.all([
        loadDashboardSummary(year),
        loadMonthlyChart(year),
        loadDepartmentBudgets(year)
    ]);

    const detailModal = document.getElementById("budget-detail-modal");
    if (detailModal && !detailModal.hidden &&
        typeof activeBudgetDepartmentId !== "undefined" &&
        activeBudgetDepartmentId !== null) {
        const detailYear = document.getElementById("budget-detail-year");
        if (detailYear) detailYear.value = String(year);
        await loadDepartmentBudgetDetail(
            activeBudgetDepartmentId, year, activeBudgetDepartmentName
        );
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('monthly-chart')) {
        const yearSelector = document.getElementById('dashboard-year');

        if (yearSelector) {
            yearSelector.addEventListener('change', loadDashboardByYear);
        }

        loadDashboardByYear();
        loadPendingRequests();
        loadRecentActivities();
    }

    // โหลดเฉพาะเมื่ออยู่หน้าอนุมัติ
    if (document.getElementById('approval-list')) {
        loadApprovalList();
    }

    const pagination =
        document.getElementById('approval-pagination');

    if (pagination) {
        pagination.addEventListener('click', function (event) {
            const button = event.target.closest('button[data-page]');

            if (!button || button.disabled) return;

            currentApprovalPage = Number(button.dataset.page);
            renderApprovalList();
        });
    }

    const search = document.getElementById('approval-search');
    const status = document.getElementById('approval-status-filter');
    const department = document.getElementById('approval-department-filter');

    function resetApprovalPage() {
        currentApprovalPage = 1;
        renderApprovalList();
    }

    if (search) {
        search.addEventListener('input', resetApprovalPage);
    }

    if (status) {
        status.addEventListener('change', resetApprovalPage);
    }

    if (department) {
        department.addEventListener('change', resetApprovalPage);
    }
});



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

// รองรับทั้ง ISO date และรูปแบบวันที่ของ .NET เช่น /Date(1790528400000)/
function formatApiDate(value) {
    if (!value) return "-";

    const match = String(value).match(/^\/Date\((-?\d+)\)\/$/);
    const date = match ? new Date(Number(match[1])) : new Date(value);

    if (Number.isNaN(date.getTime())) return "-";

    return date.toLocaleDateString("th-TH", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    });
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


            const date = formatApiDate(item.activity_date);

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
            // ใช้ยอดเงินจาก API ก่อน เพื่อให้ตรงกับหน้ารายละเอียด
            const subtotal = Number(item.subtotal_amount ?? item.total_amount ?? 0);
            const calculatedVat = Math.round(
                (subtotal * 0.07 + Number.EPSILON) * 100
            ) / 100;
            const vat = Number(item.vat_amount ?? calculatedVat);
            const grandTotal = Number(item.total_amount ?? (subtotal + vat));

            const money = (value) =>
                (Number.isFinite(value) ? value : 0).toLocaleString("th-TH", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                });

            const date = formatApiDate(item.request_date);

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
            "Api.ashx?action=purchase-order-list",
            {
                credentials: "same-origin"
            }
        );

        if (response.status === 401) {
            window.location.href = "login.html";
            return;
        }

        if (response.status === 403) {
            throw new Error("คุณไม่มีสิทธิ์ดูใบสั่งซื้อรายการนี้");
        }

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
    const classes = {
        "Issued": "approved",
        "Partially Received": "processing",
        "Received": "received",
        "Cancelled": "rejected",
        "Pending": "processing",
        "Other": "processing"
    };

    return classes[normalizePOStatus(status)] || "processing";
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
                        <a class="table-link"
                           href="goods-receipts.html?po_id=${poId}"
                           style="margin-left:8px">
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
        '<tr><td colspan="9">กำลังโหลดข้อมูล...</td></tr>';

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
                <td colspan="9">โหลดข้อมูลไม่สำเร็จ กรุณาตรวจสอบ API</td>
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
            '<tr><td colspan="9">ไม่พบข้อมูลรับสินค้า</td></tr>';
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
                            
                        </a>
                    </td>
                    <td>
                         ${status === "received"
                    ? `<span class="status received">รับครบแล้ว</span>`
                    : `
                        <button
                            class="btn"
                            type="button"
                            data-receive-po="${escapeHtml(item.po_id)}">
                            รับสินค้า
                        </button>
                    `
                }
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


let grSelectedPO = null;
let grReceivableItems = [];

async function openGoodsReceiptModal(poId) {
    const modal = document.getElementById("gr-modal");
    const poLabel = document.getElementById("gr-modal-po");
    const info = document.getElementById("gr-modal-info");
    const lineSelect = document.getElementById("gr-line-select");
    const lineInfo = document.getElementById("gr-line-info");
    const errorBox = document.getElementById("gr-modal-error");
    const qtyInput = document.getElementById("gr-receive-qty");
    const saveButton = document.getElementById("gr-save-btn");

    if (!modal || !lineSelect) {
        alert("ไม่พบหน้าต่างบันทึกรับสินค้า กรุณาตรวจสอบ HTML");
        return;
    }

    grSelectedPO = String(poId);
    grReceivableItems = [];
    errorBox.textContent = "";
    qtyInput.value = "";
    lineSelect.innerHTML = '<option value="">กำลังโหลด...</option>';
    lineInfo.textContent = "กำลังโหลดรายการสินค้า...";
    saveButton.disabled = true;

    // Render the receive dialog as a direct child of <body> so it cannot be
    // constrained by the page content/table layout or an ancestor stacking context.
    if (modal.parentElement !== document.body) {
        document.body.appendChild(modal);
    }
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    modal.style.setProperty("position", "fixed", "important");
    modal.style.setProperty("inset", "0", "important");
    modal.style.setProperty("z-index", "99999", "important");
    modal.style.setProperty("display", "flex", "important");
    modal.style.setProperty("align-items", "center", "important");
    modal.style.setProperty("justify-content", "center", "important");
    document.body.style.setProperty("overflow", "hidden", "important");

    try {
        const response = await fetch(
            "Api.ashx?action=receivable-po-items&po_id=" + encodeURIComponent(grSelectedPO),
            { credentials: "same-origin", cache: "no-store" }
        );

        if (!response.ok) {
            throw new Error("โหลดรายการสินค้าไม่สำเร็จ");
        }

        const items = await response.json();

        if (!Array.isArray(items)) {
            throw new Error(items.error || items.message || "รูปแบบข้อมูลรายการสินค้าไม่ถูกต้อง");
        }

        grReceivableItems = items.filter(
            item => String(item.po_id) === grSelectedPO
        );

        poLabel.textContent =
            "PO-" + String(poId).padStart(6, "0");

        if (grReceivableItems.length === 0) {
            info.textContent = "ไม่พบสินค้าคงเหลือสำหรับรับเข้า";
            lineSelect.innerHTML =
                '<option value="">ไม่มีรายการสินค้าคงเหลือ</option>';
            lineInfo.textContent = "ใบสั่งซื้อนี้รับสินค้าครบแล้ว";
            return;
        }

        const first = grReceivableItems[0];

        info.innerHTML = `
            <div><strong>ผู้ขาย:</strong> ${escapeHtml(first.vendor_name || "-")}</div>
            <div><strong>แผนก:</strong> ${escapeHtml(first.department || "-")}</div>
        `;

        lineSelect.innerHTML = `
            <option value="">เลือกรายการสินค้า</option>
            ${grReceivableItems.map(item => `
                <option value="${Number(item.line_no)}">
                    ${escapeHtml(item.item_name)}
                    (คงเหลือ ${Number(item.remaining_quantity)})
                </option>
            `).join("")}
        `;

        saveButton.disabled = false;
        updateGRLineInfo();

    } catch (error) {
        console.error(error);
        errorBox.textContent = error.message;
        lineInfo.textContent = "ไม่สามารถโหลดรายการสินค้าได้";
    }
}

function updateGRLineInfo() {
    const lineSelect = document.getElementById("gr-line-select");
    const lineInfo = document.getElementById("gr-line-info");
    const qtyInput = document.getElementById("gr-receive-qty");
    const qtyHint = document.getElementById("gr-qty-hint");
    const saveButton = document.getElementById("gr-save-btn");

    const lineNo = Number(lineSelect.value);
    const item = grReceivableItems.find(
        row => Number(row.line_no) === lineNo
    );

    if (!item) {
        lineInfo.textContent = "กรุณาเลือกรายการสินค้า";
        qtyInput.value = "";
        qtyInput.removeAttribute("max");
        qtyHint.textContent = "";
        saveButton.disabled = true;
        return;
    }

    const ordered = Number(item.ordered_quantity);
    const received = Number(item.received_quantity);
    const remaining = Number(item.remaining_quantity);

    lineInfo.innerHTML = `
        <div><strong>สินค้า:</strong> ${escapeHtml(item.item_name)}</div>
        <div><strong>จำนวนสั่งซื้อ:</strong> ${ordered}</div>
        <div><strong>รับแล้ว:</strong> ${received}</div>
        <div><strong>คงเหลือ:</strong> ${remaining}</div>
        <div><strong>ราคาต่อหน่วย:</strong> ${formatGRMoney(item.unit_price)}</div>
    `;

    qtyInput.min = "1";
    qtyInput.max = String(remaining);
    qtyInput.step = "1";
    qtyInput.value = "";
    qtyHint.textContent = `รับได้ตั้งแต่ 1 ถึง ${remaining} หน่วย`;
    saveButton.disabled = remaining <= 0;
}

function closeGoodsReceiptModal() {
    const modal = document.getElementById("gr-modal");
    if (modal) {
        modal.hidden = true;
        modal.setAttribute("aria-hidden", "true");
        // Keep the inline display rule in sync with the hidden attribute.
        modal.style.setProperty("display", "none", "important");
    }
    document.body.style.removeProperty("overflow");
    grSelectedPO = null;
    grReceivableItems = [];
}

function initGoodsReceiptModal() {
    const modal = document.getElementById("gr-modal");
    const lineSelect = document.getElementById("gr-line-select");
    const form = document.getElementById("gr-receive-form");

    if (!modal || modal.dataset.initialized === "true") return;
    modal.dataset.initialized = "true";

    // Keep the dialog outside the content section so fixed positioning is always
    // relative to the browser viewport, not the table or page layout.
    if (modal.parentElement !== document.body) {
        document.body.appendChild(modal);
    }
    modal.setAttribute("aria-hidden", "true");

    document.addEventListener("click", event => {
        const button = event.target.closest("[data-receive-po]");
        if (button) {
            openGoodsReceiptModal(button.dataset.receivePo);
            return;
        }

        if (event.target.closest("[data-close-modal]")) {
            closeGoodsReceiptModal();
        }
    });

    lineSelect.addEventListener("change", updateGRLineInfo);

    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && !modal.hidden) {
            closeGoodsReceiptModal();
        }
    });

    modal.addEventListener("click", event => {
        if (event.target.classList.contains("gr-modal-backdrop")) {
            closeGoodsReceiptModal();
        }
    });

    form.addEventListener("submit", async event => {
        event.preventDefault();

        const errorBox = document.getElementById("gr-modal-error");
        const saveButton = document.getElementById("gr-save-btn");
        const qtyInput = document.getElementById("gr-receive-qty");

        const lineNo = Number(lineSelect.value);
        const quantity = Number(qtyInput.value);

        const item = grReceivableItems.find(
            row => Number(row.line_no) === lineNo
        );

        if (!item) {
            errorBox.textContent = "กรุณาเลือกรายการสินค้า";
            return;
        }

        const remaining = Number(item.remaining_quantity);

        if (
            !Number.isInteger(quantity) ||
            quantity < 1 ||
            quantity > remaining
        ) {
            errorBox.textContent =
                `กรุณาระบุจำนวนเต็มตั้งแต่ 1 ถึง ${remaining}`;
            return;
        }

        saveButton.disabled = true;
        errorBox.textContent = "กำลังบันทึก...";
        const savedPO = grSelectedPO;

        try {
            await saveGoodsReceipt(
                Number(grSelectedPO),
                lineNo,
                quantity
            );

            closeGoodsReceiptModal();

            const notice = document.getElementById("gr-notice");
            if (notice) {
                notice.textContent =
                    `บันทึกรับสินค้า PO-${String(savedPO || "").padStart(6, "0")} สำเร็จ`;
            }

            await loadGoodsReceiptList();

        } catch (error) {
            console.error(error);
            errorBox.textContent =
                error.message || "บันทึกข้อมูลไม่สำเร็จ";
        } finally {
            saveButton.disabled = false;
        }
    });
}



function initGoodsReceiptPage() {
    if (!document.getElementById("gr-list")) return;

    initGoodsReceiptModal();

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




console.log("script.js loaded");

document.addEventListener("DOMContentLoaded", function () {
    loadCurrentUser();
    loadProfilePage();
    initProfileForms();

    initDepartmentBudgetDetail();
    loadDepartmentBudgets();

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
let vendorsCache = [];


function updateSelectedVendorDetails() {
    const vendorSelect = document.getElementById("preferred_vendor_id");
    const details = document.getElementById("selected-vendor-details");

    if (!vendorSelect || !details) return;

    const vendor = vendorsCache.find(
        item => String(item.vendor_id) === String(vendorSelect.value)
    );

    if (!vendor) {
        details.hidden = true;
        return;
    }

    const setText = (id, value) => {
        const element = document.getElementById(id);

        if (!element) return;

        element.textContent =
            value !== null &&
                value !== undefined &&
                String(value).trim() !== ""
                ? String(value)
                : "-";
    };

    setText("selected-vendor-name", vendor.vendor_name);
    setText("selected-vendor-tax-id", vendor.tax_id);
    setText("selected-vendor-phone", vendor.phone);
    setText("selected-vendor-email", vendor.email);
    setText("selected-vendor-address", vendor.address);

    details.hidden = false;
}



async function loadCreateReqOptions() {
    const requesterSelect =
        document.getElementById("requester_staff_id");
    const budgetSelect =
        document.getElementById("budget_id");
    const vendorSelect =
        document.getElementById("preferred_vendor_id");

    try {
        // โหลดข้อมูลผู้ใช้ที่เข้าสู่ระบบ
        const meResponse = await fetch(
            "Api.ashx?action=me",
            {
                credentials: "same-origin",
                cache: "no-store"
            }
        );

        if (meResponse.status === 401) {
            window.location.replace("index.html");
            return;
        }

        if (!meResponse.ok) {
            throw new Error("โหลดข้อมูลผู้ใช้ไม่สำเร็จ");
        }

        const meResult = await meResponse.json();

        if (!meResult.success || !meResult.user) {
            window.location.replace("index.html");
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

        // โหลดงบประมาณปี 2027 ของแผนกผู้ใช้
        budgetSelect.disabled = true;

        budgetSelect.replaceChildren(
            new Option("กำลังโหลดงบประมาณ...", "")
        );

        const budgetResponse = await fetch(
            "Api.ashx?action=budgets",
            {
                credentials: "same-origin",
                cache: "no-store"
            }
        );

        if (!budgetResponse.ok) {
            throw new Error("โหลดงบประมาณไม่สำเร็จ");
        }

        const budgets = await budgetResponse.json();

        if (!Array.isArray(budgets)) {
            throw new Error("รูปแบบข้อมูลงบประมาณไม่ถูกต้อง");
        }

        budgetSelect.replaceChildren(
            new Option("เลือกงบประมาณ", "")
        );

        // API ต้องกรองตามแผนกผู้ใช้และปี 2027 อยู่แล้ว
        // ฝั่งหน้าเว็บตรวจสอบปีซ้ำอีกครั้ง
        budgets.forEach(item => {
            if (
                item.budget_id == null ||
                Number(item.fiscal_year) !== 2027
            ) {
                return;
            }

            const remaining =
                Number(item.remaining_amount) || 0;

            budgetSelect.add(
                new Option(
                    `${item.department_name || "ไม่ระบุแผนก"} — ปีงบประมาณ ${item.fiscal_year} (คงเหลือ ${remaining.toLocaleString("th-TH", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    })
                    } บาท)`,
                    String(item.budget_id)
                )
            );
        });

        if (budgetSelect.options.length === 1) {
            budgetSelect.replaceChildren(
                new Option(
                    "ไม่พบงบประมาณปี 2027 ของแผนกนี้",
                    ""
                )
            );
        } else {
            budgetSelect.disabled = false;
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

        if (!Array.isArray(vendors)) {
            throw new Error("รูปแบบข้อมูลผู้ขายไม่ถูกต้อง");
        }

        // เก็บเฉพาะผู้ขายที่มีสถานะ Active
        vendorsCache = vendors.filter(item =>
            String(item.status || "").toLowerCase() === "active"
        );

        // สร้าง Dropdown ผู้ขาย
        vendorSelect.replaceChildren(
            new Option("ไม่ระบุผู้ขาย", "")
        );

        vendorsCache.forEach(item => {
            if (item.vendor_id == null) return;

            vendorSelect.add(
                new Option(
                    item.vendor_name || "ไม่ระบุชื่อผู้ขาย",
                    String(item.vendor_id)
                )
            );
        });

        // ป้องกัน Event Listener ซ้ำ
        vendorSelect.removeEventListener(
            "change",
            updateSelectedVendorDetails
        );

        vendorSelect.addEventListener(
            "change",
            updateSelectedVendorDetails
        );

        updateSelectedVendorDetails();

    } catch (error) {
        console.error(
            "Create requisition options error:",
            error
        );

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
            const response = await fetch("Api.ashx?action=create-requisition", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(
                    result.error || "บันทึกใบขอซื้อไม่สำเร็จ"
                );
            }


            if (
                result.requisition_id === undefined ||
                result.requisition_id === null ||
                String(result.requisition_id).trim() === ""
            ) {
                throw new Error(
                    "บันทึกข้อมูลแล้ว แต่ API ไม่ได้ส่งเลขที่ใบขอซื้อกลับมา"
                );
            }

            message.textContent =
                `บันทึกสำเร็จ เลขที่ใบขอซื้อ REQ - ${result.requisition_id}`;

            // เปิดหน้ารายละเอียดของใบขอซื้อที่เพิ่งบันทึก
            window.location.href =
                `approval-detail.html?id=${encodeURIComponent(result.requisition_id)}`;

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

    if (!message || !itemsBody) return;

    if (!id || !/^\d+$/.test(id) || Number(id) <= 0) {
        message.textContent =
            "ไม่พบเลขที่ใบขอซื้อ กรุณากลับไปเลือกจากรายการ";

        itemsBody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align:center">
                    ไม่พบข้อมูล
                </td>
            </tr>`;

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

        // แสดงชื่อผู้ขายจากข้อมูลที่ API ส่งมา
        if (req && req.vendor_name) {
            renderDetailVendor({
                vendor_name: req.vendor_name
            });

            // ค้นหารายละเอียด Vendor เพิ่มเติมจากชื่อบริษัท
            await loadDetailVendor(
                req.preferred_vendor_id,
                req.vendor_name
            );
        } else {
            renderDetailVendor(null);
        }

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
    const select = currentApprover;
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

    let decisionSaved = false;

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
        decisionSaved = true;

        await loadApprovalDetail();

    } catch (error) {
        message.textContent =
            error.message || "เกิดข้อผิดพลาดในการบันทึกข้อมูล";
        message.className = "error";
    } finally {
        // บันทึกสำเร็จแล้วให้ปิดปุ่มไว้ ป้องกันการส่งซ้ำจากหน้าเดิม
        approveButton.disabled = decisionSaved;
        rejectButton.disabled = decisionSaved;
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

// Current user and profile
async function fetchCurrentUser() {
    const response = await fetch("Api.ashx?action=me", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store"
    });

    if (response.status === 401) {
        window.location.replace("index.html");
        return null;
    }

    if (!response.ok) throw new Error("โหลดข้อมูลผู้ใช้ไม่สำเร็จ");

    const result = await response.json();
    if (!result.success || !result.user) {
        window.location.replace("index.html");
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
    const role = user.staff_role || "";
    const initial = name.charAt(0).toUpperCase();

    setTextIfExists("currentUserName", name);
    setTextIfExists("currentUserRole", role);
    setTextIfExists("currentUserAvatar", initial);
    setTextIfExists("profileName", name);
    setTextIfExists("profileFullName", name);
    setTextIfExists("profileRole", role);
    setTextIfExists("profileAvatar", initial);
    setValueIfExists("profileUsername", user.username);
    setValueIfExists("profileEmail", user.email);
    setValueIfExists("profileDepartment", user.department_name ?? user.department);
}

async function loadCurrentUser() {
    if (!document.getElementById("currentUserName")) return;
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
        if (user) displayCurrentUser(user);
    } catch (error) {
        console.error("Load profile error:", error);
        setTextIfExists("profileName", "โหลดข้อมูลไม่สำเร็จ");
    }
}


function showProfileNotice(id, message, type) {
    const element = document.getElementById(id);
    if (!element) return;
    element.textContent = message;
    element.className = type || "";
}

async function submitProfileForm(event) {
    event.preventDefault();
    const button = document.getElementById("saveProfileButton");
    const fullName = (document.getElementById("profileFullName")?.value || "").trim();
    const email = (document.getElementById("profileEmail")?.value || "").trim();

    if (!fullName) {
        showProfileNotice("profileNotice", "กรุณากรอกชื่อ-นามสกุล", "error");
        return;
    }
    if (email.length > 50) {
        showProfileNotice("profileNotice", "อีเมลต้องมีความยาวไม่เกิน 50 ตัวอักษร", "error");
        return;
    }

    if (button) button.disabled = true;
    showProfileNotice("profileNotice", "กำลังบันทึกข้อมูล...", "muted");

    try {
        const response = await fetch("Api.ashx?action=update-profile", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json; charset=utf-8" },
            body: JSON.stringify({ full_name: fullName, email: email })
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.error || "ไม่สามารถบันทึกข้อมูลได้");
        }

        const user = await fetchCurrentUser();
        if (user) displayCurrentUser(user);
        showProfileNotice("profileNotice", result.message || "บันทึกข้อมูลสำเร็จ", "success");
    } catch (error) {
        console.error("Update profile error:", error);
        showProfileNotice("profileNotice", error.message || "เกิดข้อผิดพลาดในการบันทึกข้อมูล", "error");
    } finally {
        if (button) button.disabled = false;
    }
}

async function submitPasswordForm(event) {
    event.preventDefault();
    const button = document.getElementById("changePasswordButton");
    const currentPassword = document.getElementById("currentPassword")?.value || "";
    const newPassword = document.getElementById("newPassword")?.value || "";
    const confirmPassword = document.getElementById("confirmPassword")?.value || "";

    if (newPassword.length < 8) {
        showProfileNotice("passwordNotice", "รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร", "error");
        return;
    }
    if (newPassword !== confirmPassword) {
        showProfileNotice("passwordNotice", "รหัสผ่านใหม่และการยืนยันรหัสผ่านไม่ตรงกัน", "error");
        return;
    }
    if (currentPassword === newPassword) {
        showProfileNotice("passwordNotice", "รหัสผ่านใหม่ต้องแตกต่างจากรหัสผ่านปัจจุบัน", "error");
        return;
    }

    if (button) button.disabled = true;
    showProfileNotice("passwordNotice", "กำลังเปลี่ยนรหัสผ่าน...", "muted");

    try {
        const response = await fetch("Api.ashx?action=change-password", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json; charset=utf-8" },
            body: JSON.stringify({
                current_password: currentPassword,
                new_password: newPassword,
                confirm_password: confirmPassword
            })
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.error || "ไม่สามารถเปลี่ยนรหัสผ่านได้");
        }

        showProfileNotice("passwordNotice", result.message || "เปลี่ยนรหัสผ่านสำเร็จ", "success");
        document.getElementById("passwordForm")?.reset();
    } catch (error) {
        console.error("Change password error:", error);
        showProfileNotice("passwordNotice", error.message || "เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน", "error");
    } finally {
        if (button) button.disabled = false;
    }
}

function initProfileForms() {
    const profileForm = document.getElementById("profileForm");
    const passwordForm = document.getElementById("passwordForm");

    if (profileForm && !profileForm.dataset.bound) {
        profileForm.dataset.bound = "true";
        profileForm.addEventListener("submit", submitProfileForm);
    }
    if (passwordForm && !passwordForm.dataset.bound) {
        passwordForm.dataset.bound = "true";
        passwordForm.addEventListener("submit", submitPasswordForm);
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



function renderDetailVendor(vendor) {
    const details = document.getElementById("detail-vendor-details");
    const empty = document.getElementById("detail-vendor-empty");

    if (!details || !empty) return;

    const setText = (id, value) => {
        const element = document.getElementById(id);
        if (!element) return;

        element.textContent =
            value !== null &&
                value !== undefined &&
                String(value).trim() !== ""
                ? String(value)
                : "-";
    };

    if (!vendor) {
        details.hidden = true;
        empty.hidden = false;
        return;
    }

    setText("detail-vendor-name", vendor.vendor_name);
    setText("detail-vendor-tax-id", vendor.tax_id);
    setText("detail-vendor-phone", vendor.phone);
    setText("detail-vendor-email", vendor.email);
    setText("detail-vendor-address", vendor.address);

    empty.hidden = true;
    details.hidden = false;
}




async function loadDetailVendor(preferredVendorId, vendorName) {
    try {
        const response = await fetch(
            "Api.ashx?action=vendors",
            {
                credentials: "same-origin",
                cache: "no-store"
            }
        );

        if (!response.ok) {
            throw new Error("โหลดข้อมูลผู้ขายไม่สำเร็จ");
        }

        const vendors = await response.json();
        console.log("Vendors API:", vendors);

        if (!Array.isArray(vendors)) {
            throw new Error("รูปแบบข้อมูลผู้ขายไม่ถูกต้อง");
        }

        const vendor = vendors.find(item =>
            preferredVendorId != null &&
            String(item.vendor_id) === String(preferredVendorId)
        ) || vendors.find(item =>
            vendorName &&
            String(item.vendor_name).trim() === String(vendorName).trim()
        );

        renderDetailVendor(vendor || null);

    } catch (error) {
        console.error("Load detail vendor error:", error);
        renderDetailVendor(null);
    }
}

async function saveGoodsReceipt(poId, lineNo, receivedQuantity) {
    const response = await fetch(
        "Api.ashx?action=save-goods-receipt",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            credentials: "same-origin",
            body: JSON.stringify({
                po_id: Number(poId),
                line_no: Number(lineNo),
                received_quantity: Number(receivedQuantity)
            })
        }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
        throw new Error(result.error || "บันทึกการรับสินค้าไม่สำเร็จ");
    }

    return result;
}


let departmentBudgetRequestVersion = 0;

async function loadDepartmentBudgets(year) {
    const container = document.getElementById("department-budget-list");
    if (!container) return;

    const selectedYear = Number(
        year ?? document.getElementById("dashboard-year")?.value ?? 2027
    );
    const requestVersion = ++departmentBudgetRequestVersion;
    container.innerHTML = "<p>กำลังโหลดข้อมูลงบประมาณ...</p>";

    try {
        const response = await fetch(
            `Api.ashx?action=department-budget-list&year=${encodeURIComponent(selectedYear)}`,
            { credentials: "same-origin", cache: "no-store" }
        );

        const budgets = await response.json();
        if (!response.ok) {
            throw new Error(budgets.error || "โหลดงบประมาณไม่สำเร็จ");
        }
        if (requestVersion !== departmentBudgetRequestVersion) return;

        // ป้องกันข้อมูลปีอื่นจาก API/response เก่าถูกนำมาแสดง
        const matchingBudgets = Array.isArray(budgets)
            ? budgets.filter(b => Number(b.fiscal_year) === selectedYear)
            : [];

        if (matchingBudgets.length === 0) {
            container.textContent = `ไม่พบข้อมูลงบประมาณปี ${selectedYear}`;
            return;
        }

        container.innerHTML = matchingBudgets.map(b => {
            const amount = Number(b.budget_amount) || 0;
            const used = Number(b.used_amount) || 0;
            const remaining = amount - used;
            const percent = amount > 0 ? Math.max(0, used / amount * 100) : 0;

            return `
                <button type="button"
                    class="department-budget-card"
                    data-budget-department="${Number(b.department_id)}"
                    data-budget-year="${selectedYear}"
                    data-budget-name="${escapeHtml(b.department_name || "")}"
                    data-budget-amount="${amount}"
                    data-budget-used="${used}"
                    data-budget-remaining="${remaining}"
                    data-budget-percent="${percent}">
                    <strong>${escapeHtml(b.department_name)}</strong>
                    <div class="muted">ปีงบประมาณ ${selectedYear}</div>
                    <div class="budget-remaining">${remaining.toLocaleString("th-TH")} บาท</div>
                    <div class="muted">งบประมาณคงเหลือ</div>
                    <div class="budget-progress">
                        <div class="budget-progress-bar" style="width:${Math.max(0, Math.min(100, percent))}%"></div>
                    </div>
                    <div class="budget-meta">
                        <span>ใช้ไป ${used.toLocaleString("th-TH")} บาท</span>
                        <span>${percent.toFixed(1)}%</span>
                    </div>
                    <div class="budget-meta">
                        <span>งบทั้งหมด</span>
                        <span>${amount.toLocaleString("th-TH")} บาท</span>
                    </div>
                </button>
            `;
        }).join("");
    } catch (error) {
        if (requestVersion !== departmentBudgetRequestVersion) return;
        console.error("Department budget error:", error);
        container.textContent = "โหลดข้อมูลงบประมาณไม่สำเร็จ";
    }
}

let activeBudgetDepartmentId = null;
let activeBudgetDepartmentName = "";
let activeBudgetRequestVersion = 0;

async function loadDepartmentBudgetDetail(departmentId, fiscalYear, departmentName = "") {
    const modal = document.getElementById("budget-detail-modal");
    const title = document.getElementById("budget-detail-title");
    const department = document.getElementById("budget-detail-department");
    const summary = document.getElementById("budget-detail-summary");
    const tbody = document.getElementById("budget-detail-list");
    const yearSelector = document.getElementById("budget-detail-year");
    if (!modal || !title || !department || !summary || !tbody) return;

    // บังคับขนาดเฉพาะ Modal รายละเอียดงบประมาณ เพื่อไม่ให้ CSS เดิม
    // ที่กำหนด max-width: 560px ทำให้กรอบแคบเกินไป
    const modalPanel = modal.querySelector(".gr-modal-panel");
    if (modalPanel) {
        modalPanel.style.setProperty("width", "min(1100px, calc(100vw - 32px))");
        modalPanel.style.setProperty("max-width", "1100px");
        modalPanel.style.setProperty("max-height", "calc(100vh - 32px)");
        modalPanel.style.setProperty("box-sizing", "border-box");
        modalPanel.style.setProperty("overflow-x", "auto");
        modalPanel.style.setProperty("overflow-y", "auto");
    }

    // ตารางนี้ต้องมี 5 คอลัมน์: วันที่, เลขที่เอกสาร, รายการ, ยอดเงิน, สถานะ
    const detailTable = modal.querySelector(".table-wrap table");
    if (detailTable) {
        detailTable.style.setProperty("width", "100%");
        detailTable.style.setProperty("min-width", "900px");
        detailTable.style.setProperty("border-collapse", "collapse");

        detailTable.querySelectorAll("thead th, tbody td").forEach(cell => {
            cell.style.setProperty("display", "table-cell", "important");
            cell.style.setProperty("white-space", "normal");
            cell.style.setProperty("overflow-wrap", "anywhere");
            cell.style.setProperty("vertical-align", "top");
            cell.style.setProperty("padding", "12px 14px");
        });
    }

    const selectedYear = Number(fiscalYear);
    const requestVersion = ++activeBudgetRequestVersion;
    if (yearSelector) yearSelector.value = String(selectedYear);

    title.textContent = departmentName || "รายละเอียดการใช้จ่าย";
    department.textContent = `ปีงบประมาณ ${selectedYear}`;
    summary.textContent = "กำลังโหลดสรุปงบประมาณ...";
    tbody.innerHTML = '<tr><td colspan="5">กำลังโหลดข้อมูล...</td></tr>';
    modal.hidden = false;

    try {
        const params = new URLSearchParams({
            action: "department-budget-list",
            year: String(selectedYear)
        });
        const budgetResponse = await fetch(`Api.ashx?${params.toString()}`, {
            credentials: "same-origin",
            cache: "no-store"
        });
        const budgets = await budgetResponse.json();
        if (!budgetResponse.ok) throw new Error(budgets.error || "โหลดงบประมาณไม่สำเร็จ");
        const budget = Array.isArray(budgets) ? budgets.find(item =>
            Number(item.department_id) === Number(departmentId) &&
            Number(item.fiscal_year) === selectedYear
        ) : null;

        if (requestVersion !== activeBudgetRequestVersion) return;

        if (budget) {
            const amount = Number(budget.budget_amount) || 0;
            const used = Number(budget.used_amount) || 0;
            const remaining = amount - used;
            const percent = amount > 0 ? used / amount * 100 : 0;
            const money = value => (Number(value) || 0).toLocaleString("th-TH", {
                minimumFractionDigits: 2, maximumFractionDigits: 2
            });
            summary.textContent =
                `งบรวม ${money(amount)} บาท · ใช้ไป ${money(used)} บาท · ` +
                `คงเหลือ ${money(remaining)} บาท · ใช้งบ ${percent.toFixed(2)}%`;
        } else {
            summary.textContent = `ไม่พบข้อมูลงบประมาณของแผนกนี้ในปี ${selectedYear}`;
        }

        const detailParams = new URLSearchParams({
            action: "department-budget-detail",
            department_id: String(departmentId),
            fiscal_year: String(selectedYear)
        });
        const response = await fetch(`Api.ashx?${detailParams.toString()}`, {
            credentials: "same-origin",
            cache: "no-store"
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "โหลดรายละเอียดไม่สำเร็จ");
        if (requestVersion !== activeBudgetRequestVersion) return;

        const matchingRows = Array.isArray(data)
            ? data.filter(item => Number(item.fiscal_year) === selectedYear &&
                Number(item.department_id) === Number(departmentId))
            : [];

        if (matchingRows.length === 0) {
            tbody.innerHTML =
                `<tr><td colspan="5">ไม่พบรายการใบสั่งซื้อของแผนกนี้ในปี ${selectedYear}</td></tr>`;
            return;
        }

        title.textContent = matchingRows[0].department_name || departmentName || "รายละเอียดการใช้จ่าย";
        department.textContent = `ปีงบประมาณ ${selectedYear}`;
        const money = value => (Number(value) || 0).toLocaleString("th-TH", {
            minimumFractionDigits: 2, maximumFractionDigits: 2
        }) + " บาท";

        tbody.innerHTML = matchingRows.map(item => `
            <tr>
                <td>${escapeHtml(item.document_date || "-")}</td>
                <td>
                    ${escapeHtml(item.document_no || "-")}
                    <div class="muted">${escapeHtml(item.requisition_no || "-")}</div>
                </td>
                <td>
                    ${escapeHtml(item.item_name || "-")}
                    <div class="muted">
                        จำนวน ${Number(item.quantity) || 0} × ${money(item.unit_price)}
                    </div>
                </td>
                <td>${money(item.item_amount)}</td>
                <td>${escapeHtml(item.document_status || "-")}</td>
            </tr>
        `).join("");
    } catch (error) {
        if (requestVersion !== activeBudgetRequestVersion) return;
        console.error("Department budget detail error:", error);
        summary.textContent = "ไม่สามารถโหลดสรุปงบประมาณได้";
        tbody.innerHTML = `<tr><td colspan="5">${escapeHtml(error.message)}</td></tr>`;
    }
}

function initDepartmentBudgetDetail() {
    const container = document.getElementById("department-budget-list");
    const modal = document.getElementById("budget-detail-modal");
    if (!container || !modal || modal.dataset.initialized === "true") return;
    modal.dataset.initialized = "true";

    container.addEventListener("click", event => {
        const button = event.target.closest("[data-budget-department]");
        if (!button) return;

        activeBudgetDepartmentId = Number(button.dataset.budgetDepartment);
        activeBudgetDepartmentName = button.dataset.budgetName || "";
        // ใช้ปีปัจจุบันที่เลือกจาก Dashboard ไม่อิงข้อมูลค้างบนการ์ดเก่า
        const fiscalYear = Number(document.getElementById("dashboard-year")?.value ||
            button.dataset.budgetYear || 2027);
        loadDepartmentBudgetDetail(
            activeBudgetDepartmentId, fiscalYear, activeBudgetDepartmentName
        );
    });

    document.getElementById("budget-detail-year")?.addEventListener("change", event => {
        if (activeBudgetDepartmentId == null) return;
        loadDepartmentBudgetDetail(
            activeBudgetDepartmentId,
            Number(event.target.value),
            activeBudgetDepartmentName
        );
    });

    modal.addEventListener("click", event => {
        if (event.target.closest("[data-close-budget-modal]")) {
            modal.hidden = true;
        }
    });
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
            window.location.replace("index.html");
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

document.addEventListener("DOMContentLoaded", loadCurrentApprover);



