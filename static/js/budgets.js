// =============================================
//  PayLens — Budgets Page (Flask + MySQL)
// =============================================

document.addEventListener("DOMContentLoaded", async () => {
  await initMonthPicker();
  renderPage();
});

async function renderPage() {
  const month = document.getElementById("globalMonth")?.value || currentMonth;
  const activeMonth = (!month || month === "all") ? new Date().toISOString().slice(0,7) : month;

  const [rows, err] = await fetchBudgets(activeMonth);
  if (err) { showToast("Failed to load budgets: " + err, "error"); return; }

  const container = document.getElementById("budgetGrid");
  if (!container) return;

  if (!rows?.length) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;padding:60px">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l3 3"/></svg>
        <p>No budgets set for ${activeMonth}. Click "Set budget" to get started.</p>
      </div>`;
    return;
  }

  container.innerHTML = rows.map(b => {
    const pct = Math.min((b.spent / b.limit_amount) * 100, 100);
    const over = b.spent > b.limit_amount;
    const warn = pct >= 80 && !over;
    const state = over ? "over" : warn ? "warn" : "ok";
    const barColor = over ? "#f87171" : warn ? "#fbbf24" : "#4ade80";
    const remaining = b.limit_amount - b.spent;
    return `
      <div class="budget-card">
        <div class="budget-card-head">
          <div>
            <div class="budget-cat-name">${getCatEmoji(b.category)} ${b.category}</div>
            <div class="budget-month">${b.month}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <div class="budget-pct ${state}">${pct.toFixed(0)}%</div>
            <button class="delete-budget" onclick="deleteBudgetRow(${b.budget_id})" title="Delete">✕</button>
          </div>
        </div>
        <div class="budget-progress">
          <div class="budget-progress-fill" style="width:${pct}%;background:${barColor}"></div>
        </div>
        <div class="budget-amounts">
          <span>Spent: <span class="spent">${fmt(b.spent)}</span></span>
          <span>${over ? "Over by " + fmt(b.spent - b.limit_amount) : fmt(remaining) + " left"}</span>
        </div>
        <div style="font-size:11px;color:#5e6070;margin-top:6px">Budget: ${fmt(b.limit_amount)}</div>
      </div>`;
  }).join("");
}

function openBudgetModal() {
  const month = document.getElementById("globalMonth")?.value;
  const bm = document.getElementById("b-month");
  if (bm && month && month !== "all") bm.value = month;
  document.getElementById("budgetModal").style.display = "flex";
}

function closeBudgetModal(e) {
  if (e.target === document.getElementById("budgetModal"))
    document.getElementById("budgetModal").style.display = "none";
}

async function saveBudget(e) {
  e.preventDefault();
  const data = {
    category:     document.getElementById("b-cat").value,
    month:        document.getElementById("b-month").value,
    limit_amount: parseFloat(document.getElementById("b-limit").value),
  };
  const [, err] = await addBudget(data);
  if (err) { showToast("Save failed: " + err, "error"); return; }
  document.getElementById("budgetModal").style.display = "none";
  document.getElementById("budgetForm").reset();
  showToast("Budget saved!", "success");
  renderPage();
}

async function deleteBudgetRow(id) {
  if (!confirm("Delete this budget?")) return;
  const [, err] = await removeBudget(id);
  if (err) { showToast("Delete failed: " + err, "error"); return; }
  showToast("Budget deleted.", "success");
  renderPage();
}
