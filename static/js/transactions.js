// =============================================
//  PayLens — Transactions Page (Flask + MySQL)
// =============================================

let hvOn = false, currentPage = 1;
const PER_PAGE = 15;

document.addEventListener("DOMContentLoaded", async () => {
  await initMonthPicker();
  await populateCatFilter();
  renderPage();
});

async function populateCatFilter() {
  const [meta] = await fetchMeta();
  const sel = document.getElementById("catFilter");
  if (!sel || !meta) return;
  sel.innerHTML = `<option value="">All categories</option>` +
    meta.categories.map(c => `<option value="${c}">${c}</option>`).join("");
}

function toggleHV() {
  hvOn = !hvOn;
  document.getElementById("hvToggle")?.classList.toggle("on", hvOn);
  currentPage = 1;
  renderPage();
}

async function renderPage() {
  const month  = document.getElementById("globalMonth")?.value || currentMonth;
  const search = document.getElementById("txnSearch")?.value?.trim() || "";
  const cat    = document.getElementById("catFilter")?.value || "";
  const upi    = document.getElementById("upiFilter")?.value || "";
  const sort   = document.getElementById("sortBy")?.value || "date_desc";

  const params = { page: currentPage, per_page: PER_PAGE, sort };
  if (month && month !== "all") params.month = month;
  if (search) params.search = search;
  if (cat)    params.category = cat;
  if (upi)    params.upi_app = upi;
  if (hvOn)   params.high_value = "1";

  const [data, err] = await fetchTransactions(params);
  if (err) { showToast("Failed to load: " + err, "error"); return; }

  const rows  = data.data || [];
  const total = data.total || 0;

  // Summary strip
  const totalAmt = rows.reduce((s, r) => s + r.amount, 0);
  const strip = document.getElementById("txnSummary");
  if (strip) {
    strip.innerHTML = `
      <span class="strip-item"><strong>${total}</strong> transactions</span>
      <span class="strip-item">Page total: <strong>${fmt(totalAmt)}</strong></span>
      ${hvOn ? `<span class="strip-item" style="color:#f87171">High-value filter ON</span>` : ""}
    `;
  }

  // Table
  const tbody = document.getElementById("txnTableBody");
  const empty = document.getElementById("txnEmpty");
  if (!rows.length) {
    if (tbody) tbody.innerHTML = "";
    if (empty) empty.style.display = "block";
  } else {
    if (empty) empty.style.display = "none";
    tbody.innerHTML = rows.map(t => `
      <tr>
        <td>
          <div class="td-merchant">${t.merchant_name}</div>
          ${t.note ? `<div class="td-meta">${t.note}</div>` : ""}
        </td>
        <td>
          <span class="cat-badge" style="background:${getCatBg(t.category)};color:${getCatColor(t.category)}">
            ${getCatEmoji(t.category)} ${t.category}
          </span>
        </td>
        <td style="color:#9a9bac;font-size:13px">${t.upi_app}</td>
        <td style="color:#9a9bac;font-size:13px">${formatDate(t.txn_date)}</td>
        <td class="td-amount ${t.amount > 10000 ? "high" : ""}">${fmt(t.amount)}</td>
        <td class="td-actions">
          <button class="edit-btn" onclick="openEditModal(${t.txn_id})">Edit</button>
        </td>
      </tr>`).join("");
  }

  renderPagination(data.total_pages || 1);
}

function renderPagination(totalPages) {
  const el = document.getElementById("pagination");
  if (!el || totalPages <= 1) { if (el) el.innerHTML = ""; return; }
  let html = `<button class="page-btn" onclick="goPage(${currentPage-1})" ${currentPage===1?"disabled":""}>‹</button>`;
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - currentPage) <= 1) {
      html += `<button class="page-btn ${i===currentPage?"active":""}" onclick="goPage(${i})">${i}</button>`;
    } else if (Math.abs(i - currentPage) === 2) {
      html += `<span style="color:#5e6070;padding:0 4px">…</span>`;
    }
  }
  html += `<button class="page-btn" onclick="goPage(${currentPage+1})" ${currentPage===totalPages?"disabled":""}>›</button>`;
  el.innerHTML = html;
}

function goPage(p) {
  currentPage = p;
  renderPage();
}

// ─── Edit modal ───────────────────────────────────────────────
let _editData = null;

async function openEditModal(id) {
  // fetch the single row directly
  const [data] = await fetchTransactions({ page: 1, per_page: 1000 });
  const t = (data?.data || []).find(r => r.txn_id === id);
  if (!t) { showToast("Transaction not found", "error"); return; }
  _editData = t;

  document.getElementById("e-id").value       = t.txn_id;
  document.getElementById("e-merchant").value = t.merchant_name;
  document.getElementById("e-amount").value   = t.amount;
  document.getElementById("e-date").value     = t.txn_date;
  document.getElementById("e-cat").value      = t.category;
  document.getElementById("e-upi").value      = t.upi_app;
  document.getElementById("e-note").value     = t.note || "";
  document.getElementById("editModal").style.display = "flex";
}

function closeEditModal(e) {
  if (e.target === document.getElementById("editModal"))
    document.getElementById("editModal").style.display = "none";
}

async function updateTransaction(e) {
  e.preventDefault();
  const id = parseInt(document.getElementById("e-id").value);
  const payload = {
    merchant_name: document.getElementById("e-merchant").value.trim(),
    amount:        parseFloat(document.getElementById("e-amount").value),
    txn_date:      document.getElementById("e-date").value,
    category:      document.getElementById("e-cat").value,
    upi_app:       document.getElementById("e-upi").value,
    note:          document.getElementById("e-note").value.trim(),
  };
  const [, err] = await window.updateTransaction(id, payload);
  if (err) { showToast("Update failed: " + err, "error"); return; }
  document.getElementById("editModal").style.display = "none";
  showToast("Updated!", "success");
  renderPage();
}

async function deleteTransaction() {
  const id = parseInt(document.getElementById("e-id").value);
  if (!confirm("Delete this transaction?")) return;
  const [, err] = await window.deleteTransaction(id);
  if (err) { showToast("Delete failed: " + err, "error"); return; }
  document.getElementById("editModal").style.display = "none";
  showToast("Deleted.", "success");
  renderPage();
}

// expose to global for html onclick
window.updateTransaction  = (id, payload) => api(`/api/transactions/${id}`, { method: "PUT", body: JSON.stringify(payload), headers: {"Content-Type":"application/json"} });
window.deleteTransaction  = (id)          => api(`/api/transactions/${id}`, { method: "DELETE" });
