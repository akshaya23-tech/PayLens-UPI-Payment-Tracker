// =============================================
//  PayLens — Merchants Page (Flask + MySQL)
// =============================================

document.addEventListener("DOMContentLoaded", async () => {
  await initMonthPicker();
  renderPage();
});

async function renderPage() {
  const month  = document.getElementById("globalMonth")?.value || currentMonth;
  const search = document.getElementById("mSearch")?.value?.trim() || "";
  const cat    = document.getElementById("mCatFilter")?.value || "";

  const params = {};
  if (month && month !== "all") params.month = month;
  if (search) params.search = search;
  if (cat)    params.category = cat;

  const [rows, err] = await fetchMerchants(params);
  if (err) { showToast("Failed to load merchants: " + err, "error"); return; }

  const container = document.getElementById("merchantCards");
  if (!container) return;
  const maxTotal = rows?.[0]?.total || 1;

  if (!rows?.length) {
    container.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><circle cx="12" cy="12" r="10"/></svg><p>No merchants found</p></div>`;
    return;
  }

  container.innerHTML = rows.map((m, i) => {
    const initials = m.merchant_name.split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase();
    const pct = (m.total / maxTotal * 100).toFixed(1);
    return `
      <div class="merchant-card">
        <div class="mc-top">
          <div style="display:flex;align-items:center;gap:12px">
            <div class="mc-icon" style="background:${getCatBg(m.category)};color:${getCatColor(m.category)}">${initials}</div>
            <div>
              <div class="mc-name">${m.merchant_name}</div>
              <div class="mc-cat">
                <span class="cat-badge" style="background:${getCatBg(m.category)};color:${getCatColor(m.category)};font-size:10px;padding:2px 7px">
                  ${getCatEmoji(m.category)} ${m.category}
                </span>
              </div>
            </div>
          </div>
          <div style="text-align:right">
            <div class="mc-amount">${fmt(m.total)}</div>
            <div class="mc-stats">${m.txn_count} txn${m.txn_count > 1 ? "s" : ""}</div>
          </div>
        </div>
        <div class="mc-bar-wrap">
          <div class="mc-bar" style="width:${pct}%;background:${getCatColor(m.category)}"></div>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:8px">
          <span style="font-size:11px;color:#5e6070">Rank #${i+1}</span>
          <span style="font-size:11px;color:#5e6070">Last: ${formatDate(m.last_date)}</span>
        </div>
      </div>`;
  }).join("");
}
