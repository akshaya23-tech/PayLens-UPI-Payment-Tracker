// =============================================
//  PayLens — Dashboard Page (Flask + MySQL)
// =============================================

let trendChart = null, donutChart = null;

document.addEventListener("DOMContentLoaded", async () => {
  await initMonthPicker();
  renderPage();
});

async function renderPage() {
  const month = document.getElementById("globalMonth")?.value || currentMonth;
  const [data, err] = await fetchDashboard(month === "all" ? "" : month);
  if (err) { showToast("Failed to load dashboard: " + err, "error"); return; }

  renderMetrics(data);
  renderTrend(data.trend, month);
  renderDonut(data.categories);
  renderRecent(data.recent);
  renderUPI(data.upi_apps);
  renderHighVal(data.high_value);
}

function renderMetrics(d) {
  const s = d.stats || {};
  const total = s.total_spent || 0;
  const count = s.txn_count || 0;
  const hv    = s.high_value_count || 0;
  const hvT   = s.high_value_total || 0;
  const avg   = s.avg_amount || 0;
  const topCat = (d.categories || [])[0]?.category || "—";

  document.getElementById("metricsGrid").innerHTML = `
    <div class="metric-card">
      <div class="mc-label">Total spent</div>
      <div class="mc-value">${fmtCompact(total)}</div>
      <div class="mc-sub">${count} transactions</div>
    </div>
    <div class="metric-card">
      <div class="mc-label">Transactions</div>
      <div class="mc-value">${count}</div>
      <div class="mc-sub">Avg ${fmt(avg)} each</div>
    </div>
    <div class="metric-card">
      <div class="mc-label">High value (&gt;₹10k)</div>
      <div class="mc-value mc-red">${hv}</div>
      <div class="mc-sub">${fmt(hvT)} total</div>
    </div>
    <div class="metric-card">
      <div class="mc-label">Top category</div>
      <div class="mc-value" style="font-size:18px">${getCatEmoji(topCat)} ${topCat}</div>
      <div class="mc-sub" style="color:${getCatColor(topCat)}">${fmt((d.categories||[])[0]?.total||0)}</div>
    </div>
  `;
}

function renderTrend(trend, activeMonth) {
  const ctx = document.getElementById("trendChart");
  if (!ctx) return;
  if (trendChart) trendChart.destroy();

  const labels = (trend || []).map(r => {
    const [y, m] = r.month.split("-");
    return new Date(+y, +m - 1, 1).toLocaleString("en-IN", { month: "short", year: "2-digit" });
  });
  const vals   = (trend || []).map(r => r.total);
  const months = (trend || []).map(r => r.month);
  const colors = months.map(m => m === activeMonth ? "#4ade80" : "#2d3748");

  trendChart = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ data: vals, backgroundColor: colors, borderRadius: 6, borderSkipped: false }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: v => " " + fmt(v.raw) },
          backgroundColor: "#1d1f28", borderColor: "#2d3748", borderWidth: 1,
          titleColor: "#9a9bac", bodyColor: "#f0f0f0", padding: 10,
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: "#5e6070", font: { size: 12 } } },
        y: {
          grid: { color: "rgba(255,255,255,0.04)" },
          ticks: { color: "#5e6070", font: { size: 11 }, callback: v => "₹" + (v/1000).toFixed(0) + "K" }
        }
      }
    }
  });
  document.getElementById("trendLegend").innerHTML = `
    <div class="legend-item"><div class="legend-dot" style="background:#4ade80"></div>Selected</div>
    <div class="legend-item"><div class="legend-dot" style="background:#2d3748"></div>Other months</div>
  `;
}

function renderDonut(cats) {
  const ctx = document.getElementById("donutChart");
  if (!ctx) return;
  if (donutChart) donutChart.destroy();

  const total = (cats || []).reduce((s, c) => s + c.total, 0);
  const top   = (cats || []).slice(0, 6);

  donutChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: top.map(c => c.category),
      datasets: [{
        data: top.map(c => c.total),
        backgroundColor: top.map(c => getCatColor(c.category)),
        borderColor: "#161820", borderWidth: 3,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: "72%",
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: v => " " + fmt(v.raw) + " (" + (v.raw/total*100).toFixed(1) + "%)" },
          backgroundColor: "#1d1f28", borderColor: "#2d3748", borderWidth: 1,
          titleColor: "#9a9bac", bodyColor: "#f0f0f0", padding: 10,
        }
      }
    }
  });

  document.getElementById("donutCenter").innerHTML = `
    <div class="dc-label">total</div>
    <div class="dc-value">${fmtCompact(total)}</div>
  `;
  document.getElementById("donutLegend").innerHTML = top.map(c => `
    <div class="legend-item">
      <div class="legend-dot" style="background:${getCatColor(c.category)}"></div>
      ${c.category} <span style="color:#5e6070;margin-left:4px">${total ? (c.total/total*100).toFixed(0) : 0}%</span>
    </div>`).join("");
}

function renderRecent(rows) {
  const el = document.getElementById("recentTxns");
  if (!rows?.length) { el.innerHTML = `<div class="empty-state" style="padding:30px"><p>No transactions</p></div>`; return; }
  el.innerHTML = rows.map(t => `
    <div class="txn-mini">
      <div class="txn-mini-left">
        <div class="txn-icon" style="background:${getCatBg(t.category)}">
          <span style="font-size:16px">${getCatEmoji(t.category)}</span>
        </div>
        <div>
          <div class="txn-mini-merchant">${t.merchant_name}</div>
          <div class="txn-mini-meta">${t.upi_app} · ${formatDate(t.txn_date)}</div>
        </div>
      </div>
      <div class="txn-mini-amt ${t.amount > 10000 ? "high" : ""}">${fmt(t.amount)}</div>
    </div>`).join("");
}

function renderUPI(rows) {
  const max = (rows || [])[0]?.total || 1;
  const upiColors = { PhonePe: "#8b5cf6", GPay: "#3b82f6", Paytm: "#06b6d4", BHIM: "#f97316", Other: "#6b7280" };
  document.getElementById("upiBreak").innerHTML = (rows || []).map(r => `
    <div class="upi-row">
      <div class="upi-name">${r.app_name}</div>
      <div class="upi-bar-wrap">
        <div class="upi-bar-fill" style="width:${(r.total/max*100).toFixed(1)}%;background:${upiColors[r.app_name]||"#6b7280"}"></div>
      </div>
      <div class="upi-amt">${fmt(r.total)}</div>
    </div>`).join("");
}

function renderHighVal(rows) {
  const el = document.getElementById("highValList");
  if (!rows?.length) { el.innerHTML = `<div style="padding:16px 0;text-align:center;color:#5e6070;font-size:13px">No high-value transactions</div>`; return; }
  el.innerHTML = rows.map(t => `
    <div class="txn-mini">
      <div class="txn-mini-left">
        <div class="txn-icon" style="background:rgba(248,113,113,0.1)">
          <span style="font-size:16px">${getCatEmoji(t.category)}</span>
        </div>
        <div>
          <div class="txn-mini-merchant">${t.merchant_name}</div>
          <div class="txn-mini-meta">${t.category} · ${formatDate(t.txn_date)}</div>
        </div>
      </div>
      <div class="txn-mini-amt high">${fmt(t.amount)}</div>
    </div>`).join("");
}
