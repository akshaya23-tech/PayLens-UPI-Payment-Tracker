// =============================================
//  PayLens — API Client (talks to Flask backend)
//  Replaces localStorage with real MySQL calls
// =============================================

const BASE = "";   // same origin — Flask serves everything

const CAT_CONFIG = {
  Transport:     { color: "#4ade80", bg: "rgba(74,222,128,0.12)",  emoji: "🚌" },
  Food:          { color: "#fbbf24", bg: "rgba(251,191,36,0.12)",  emoji: "🍔" },
  Shopping:      { color: "#60a5fa", bg: "rgba(96,165,250,0.12)",  emoji: "🛍️" },
  Utilities:     { color: "#a78bfa", bg: "rgba(167,139,250,0.12)", emoji: "⚡" },
  Entertainment: { color: "#f472b6", bg: "rgba(244,114,182,0.12)", emoji: "🎬" },
  Health:        { color: "#34d399", bg: "rgba(52,211,153,0.12)",  emoji: "💊" },
  Education:     { color: "#fb923c", bg: "rgba(251,146,60,0.12)",  emoji: "📚" },
  Rent:          { color: "#94a3b8", bg: "rgba(148,163,184,0.12)", emoji: "🏠" },
  Other:         { color: "#6b7280", bg: "rgba(107,114,128,0.12)", emoji: "📦" },
};

// ─── Helpers ─────────────────────────────────────────────────
function getCatColor(cat)  { return CAT_CONFIG[cat]?.color || "#6b7280"; }
function getCatBg(cat)     { return CAT_CONFIG[cat]?.bg    || "rgba(107,114,128,0.1)"; }
function getCatEmoji(cat)  { return CAT_CONFIG[cat]?.emoji || "📦"; }
function fmt(n)            { return "₹" + Math.round(n).toLocaleString("en-IN"); }
function fmtCompact(n)     {
  if (n >= 100000) return "₹" + (n / 100000).toFixed(1) + "L";
  if (n >= 1000)   return "₹" + (n / 1000).toFixed(1) + "K";
  return "₹" + Math.round(n);
}
function formatDate(d) {
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Core fetch wrapper ───────────────────────────────────────
async function api(path, opts = {}) {
  try {
    const res = await fetch(BASE + path, {
      headers: { "Content-Type": "application/json" },
      ...opts,
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Request failed");
    return [json, null];
  } catch (e) {
    console.error("[API]", e.message);
    return [null, e.message];
  }
}

// ─── Transactions ─────────────────────────────────────────────
async function fetchTransactions(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return api(`/api/transactions?${qs}`);
}

async function addTransaction(data) {
  return api("/api/transactions", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

async function updateTransaction(id, data) {
  return api(`/api/transactions/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

async function deleteTransaction(id) {
  return api(`/api/transactions/${id}`, { method: "DELETE" });
}

async function bulkImport(transactions) {
  return api("/api/transactions/bulk", {
    method: "POST",
    body: JSON.stringify({ transactions }),
  });
}

// ─── Dashboard ────────────────────────────────────────────────
async function fetchDashboard(month) {
  const qs = month ? `?month=${month}` : "";
  return api(`/api/dashboard/summary${qs}`);
}

// ─── Analytics ────────────────────────────────────────────────
async function fetchAnalytics(month) {
  const qs = month ? `?month=${month}` : "";
  return api(`/api/analytics${qs}`);
}

// ─── Merchants ────────────────────────────────────────────────
async function fetchMerchants(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return api(`/api/merchants?${qs}`);
}

// ─── Budgets ──────────────────────────────────────────────────
async function fetchBudgets(month) {
  const qs = month ? `?month=${month}` : "";
  return api(`/api/budgets${qs}`);
}

async function addBudget(data) {
  return api("/api/budgets", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

async function removeBudget(id) {
  return api(`/api/budgets/${id}`, { method: "DELETE" });
}

// ─── Meta (categories, apps, months) ─────────────────────────
let _meta = null;
async function fetchMeta() {
  if (_meta) return [_meta, null];
  const [data, err] = await api("/api/meta");
  if (data) _meta = data;
  return [data, err];
}

// ─── CSV parser (client-side, then bulk import) ───────────────
function parseCSV(text) {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.replace(/"/g, "").trim().toLowerCase());

  const find = (...keys) => {
    for (const k of keys) {
      const i = headers.findIndex(h => h.includes(k));
      if (i >= 0) return i;
    }
    return -1;
  };

  const dateIdx  = find("date", "time", "txn date");
  const amtIdx   = find("amount", "debit", "paid");
  const merIdx   = find("merchant", "description", "payee", "to", "name");
  const upiIdx   = find("app", "upi", "source");
  const catIdx   = find("category", "cat");
  const noteIdx  = find("note", "narration", "comment");

  if (amtIdx < 0 || merIdx < 0) return null; // signal error

  const results = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map(c => c.replace(/"/g, "").trim());
    const amt  = parseFloat(cols[amtIdx]?.replace(/[^0-9.]/g, ""));
    if (!amt || isNaN(amt) || amt <= 0) continue;
    let date = cols[dateIdx] || new Date().toISOString().slice(0, 10);
    const d = new Date(date);
    date = isNaN(d) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
    results.push({
      merchant_name: cols[merIdx] || "Unknown",
      amount:        amt,
      category:      catIdx >= 0 ? (cols[catIdx] || "Other") : "Other",
      upi_app:       upiIdx >= 0 ? (cols[upiIdx] || "Other") : "Other",
      txn_date:      date,
      note:          noteIdx >= 0 ? (cols[noteIdx] || "") : "",
    });
  }
  return results;
}

// ─── Toast ────────────────────────────────────────────────────
function showToast(msg, type = "") {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.className = "toast show" + (type ? " " + type : "");
  setTimeout(() => { t.className = "toast"; }, 3500);
}

// ─── Sidebar toggle ───────────────────────────────────────────
function toggleSidebar() {
  document.getElementById("sidebar")?.classList.toggle("open");
}

// ─── Global month state ───────────────────────────────────────
let currentMonth = "2024-03";

function onMonthChange() {
  const el = document.getElementById("globalMonth");
  if (el) currentMonth = el.value;
  if (typeof renderPage === "function") renderPage();
}

// ─── Populate month dropdown from API ────────────────────────
async function initMonthPicker() {
  const sel = document.getElementById("globalMonth");
  if (!sel) return;

  const [meta] = await fetchMeta();
  if (!meta) return;

  const current = sel.value || currentMonth;
  sel.innerHTML = `<option value="all">All time</option>` +
    meta.months.map(m => {
      const [y, mo] = m.split("-");
      const label = new Date(+y, +mo - 1, 1).toLocaleString("en-IN", { month: "long", year: "numeric" });
      return `<option value="${m}" ${m === current ? "selected" : ""}>${label}</option>`;
    }).join("");
  currentMonth = sel.value;
}

// ─── Modal helpers ────────────────────────────────────────────
function openAddModal() {
  document.getElementById("addModal").style.display = "flex";
  document.getElementById("f-date").value = new Date().toISOString().slice(0, 10);
}

function closeAddModal(e) {
  if (e.target === document.getElementById("addModal"))
    document.getElementById("addModal").style.display = "none";
}

async function saveTransaction(e) {
  e.preventDefault();
  const data = {
    merchant_name: document.getElementById("f-merchant").value.trim(),
    amount:        parseFloat(document.getElementById("f-amount").value),
    txn_date:      document.getElementById("f-date").value,
    category:      document.getElementById("f-cat").value,
    upi_app:       document.getElementById("f-upi").value,
    note:          document.getElementById("f-note").value.trim(),
  };
  const [res, err] = await addTransaction(data);
  if (err) { showToast("Error: " + err, "error"); return; }
  document.getElementById("addModal").style.display = "none";
  document.getElementById("addForm").reset();
  showToast("Transaction saved!", "success");
  if (typeof renderPage === "function") renderPage();
}

// ─── Upload / CSV import ──────────────────────────────────────
let _pendingImport = [];

function openUpload() {
  _pendingImport = [];
  document.getElementById("uploadModal").style.display = "flex";
  document.getElementById("csvPreview").innerHTML = "";
  document.getElementById("importActions").style.display = "none";
  const fi = document.getElementById("csvFile");
  if (fi) fi.value = "";
}

function closeUploadModal(e) {
  if (e.target === document.getElementById("uploadModal"))
    document.getElementById("uploadModal").style.display = "none";
}

function handleDrop(e) {
  e.preventDefault();
  const f = e.dataTransfer.files[0];
  if (f) processFile(f);
}

function handleCSV(e) {
  const f = e.target.files[0];
  if (f) processFile(f);
}

function processFile(file) {
  const r = new FileReader();
  r.onload = ev => {
    const rows = parseCSV(ev.target.result);
    if (rows === null) {
      document.getElementById("csvPreview").innerHTML =
        `<p style="color:#f87171;font-size:13px;padding:10px 0">
          CSV must have <strong>Amount</strong> and <strong>Merchant</strong> columns.
         </p>`;
      document.getElementById("importActions").style.display = "none";
      return;
    }
    _pendingImport = rows;
    renderCSVPreview(rows);
  };
  r.readAsText(file);
}

function renderCSVPreview(rows) {
  const preview = document.getElementById("csvPreview");
  const actions = document.getElementById("importActions");
  if (!rows.length) {
    preview.innerHTML = `<p style="color:#f87171;font-size:13px;padding:8px 0">No valid transactions found.</p>`;
    actions.style.display = "none";
    return;
  }
  const show = rows.slice(0, 5);
  preview.innerHTML = `
    <p style="font-size:12px;color:#5e6070;margin-bottom:8px">
      Found <strong style="color:#f0f0f0">${rows.length}</strong> transactions. Preview:
    </p>
    <div style="overflow-x:auto">
    <table class="csv-preview-table">
      <thead><tr><th>Merchant</th><th>Amount</th><th>Date</th><th>Category</th></tr></thead>
      <tbody>
        ${show.map(t => `<tr>
          <td>${t.merchant_name}</td>
          <td>${fmt(t.amount)}</td>
          <td>${t.txn_date}</td>
          <td>${t.category}</td>
        </tr>`).join("")}
      </tbody>
    </table></div>
  `;
  actions.style.display = "flex";
}

async function confirmImport() {
  if (!_pendingImport.length) return;
  const btn = document.getElementById("confirmImport");
  btn.textContent = "Importing…";
  btn.disabled = true;

  const [res, err] = await bulkImport(_pendingImport);
  btn.textContent = "Import transactions";
  btn.disabled = false;

  if (err) { showToast("Import failed: " + err, "error"); return; }
  document.getElementById("uploadModal").style.display = "none";
  showToast(`Imported ${res.inserted} transactions!`, "success");
  _pendingImport = [];
  if (typeof renderPage === "function") renderPage();
}
