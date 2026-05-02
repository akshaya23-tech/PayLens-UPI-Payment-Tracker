// =============================================
//  PayLens — Analytics Page (Flask + MySQL)
// =============================================

let charts = {};

document.addEventListener("DOMContentLoaded", async () => {
  await initMonthPicker();
  renderPage();
});

async function renderPage() {
  const month = document.getElementById("globalMonth")?.value || currentMonth;
  const [data, err] = await fetchAnalytics(month === "all" ? "" : month);
  if (err) { showToast("Failed to load analytics: " + err, "error"); return; }
  renderCatMonth(data.cat_month || []);
  renderDaily(data.daily || []);
  renderDist(data.dist || {});
  renderUpiPie(data.upi_pie || []);
  renderWeekday(data.weekday || []);
}

function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}

function renderCatMonth(rows) {
  destroyChart("catMonth");
  const months = [...new Set(rows.map(r => r.month))].sort();
  const cats   = [...new Set(rows.map(r => r.category))];
  const CAT_COLORS = { Transport:"#4ade80",Food:"#fbbf24",Shopping:"#60a5fa",Utilities:"#a78bfa",Entertainment:"#f472b6",Health:"#34d399",Education:"#fb923c",Rent:"#94a3b8",Other:"#6b7280" };

  const datasets = cats.map(cat => ({
    label: cat,
    data: months.map(m => {
      const r = rows.find(x => x.month === m && x.category === cat);
      return r ? r.total : 0;
    }),
    backgroundColor: (CAT_COLORS[cat] || "#888") + "cc",
    borderColor: CAT_COLORS[cat] || "#888",
    borderWidth: 1, borderRadius: 4,
  }));

  const labels = months.map(m => {
    const [y, mo] = m.split("-");
    return new Date(+y, +mo-1, 1).toLocaleString("en-IN", { month:"short", year:"2-digit" });
  });

  const ctx = document.getElementById("catMonthChart");
  if (!ctx) return;
  charts.catMonth = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: true, labels: { color:"#9a9bac", font:{size:11}, boxWidth:10, padding:16 } },
        tooltip: { backgroundColor:"#1d1f28", borderColor:"#2d3748", borderWidth:1, titleColor:"#9a9bac", bodyColor:"#f0f0f0", padding:10, callbacks:{ label: v => " " + v.dataset.label + ": " + fmt(v.raw) } } },
      scales: {
        x: { stacked:true, grid:{display:false}, ticks:{color:"#5e6070"} },
        y: { stacked:true, grid:{color:"rgba(255,255,255,0.04)"}, ticks:{color:"#5e6070", callback: v => "₹"+(v/1000).toFixed(0)+"K"} }
      }
    }
  });
}

function renderDaily(rows) {
  destroyChart("daily");
  const ctx = document.getElementById("dailyChart");
  if (!ctx) return;
  charts.daily = new Chart(ctx, {
    type: "line",
    data: {
      labels: rows.map(r => r.txn_date?.slice(5) || ""),
      datasets: [{ data: rows.map(r => r.total), borderColor:"#4ade80", backgroundColor:"rgba(74,222,128,0.06)", borderWidth:2, fill:true, tension:0.35, pointRadius:3, pointBackgroundColor:"#4ade80" }]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins: { legend:{display:false}, tooltip:{ backgroundColor:"#1d1f28",borderColor:"#2d3748",borderWidth:1,titleColor:"#9a9bac",bodyColor:"#f0f0f0",padding:10,callbacks:{label:v=>" "+fmt(v.raw)} } },
      scales: {
        x: { grid:{display:false}, ticks:{color:"#5e6070",font:{size:10},maxTicksLimit:12} },
        y: { grid:{color:"rgba(255,255,255,0.04)"}, ticks:{color:"#5e6070",font:{size:10},callback:v=>"₹"+(v/1000).toFixed(0)+"K"} }
      }
    }
  });
}

function renderDist(d) {
  destroyChart("dist");
  const ctx = document.getElementById("distChart");
  if (!ctx) return;
  const buckets = [
    { label:"< ₹500",    val: d.under_500 || 0 },
    { label:"₹500–2K",   val: d.s500_2k   || 0 },
    { label:"₹2K–5K",    val: d.s2k_5k    || 0 },
    { label:"₹5K–10K",   val: d.s5k_10k   || 0 },
    { label:"₹10K–25K",  val: d.s10k_25k  || 0 },
    { label:"> ₹25K",    val: d.over_25k  || 0 },
  ];
  charts.dist = new Chart(ctx, {
    type:"bar",
    data: { labels: buckets.map(b=>b.label), datasets:[{ data:buckets.map(b=>b.val), backgroundColor:["#4ade80cc","#fbbf24cc","#60a5facc","#f472b6cc","#f87171cc","#a78bfacc"], borderRadius:6, borderSkipped:false }] },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{backgroundColor:"#1d1f28",borderColor:"#2d3748",borderWidth:1,titleColor:"#9a9bac",bodyColor:"#f0f0f0",padding:10,callbacks:{label:v=>" "+v.raw+" transactions"}} },
      scales:{ x:{grid:{display:false},ticks:{color:"#5e6070",font:{size:10}}}, y:{grid:{color:"rgba(255,255,255,0.04)"},ticks:{color:"#5e6070",font:{size:11},stepSize:1}} }
    }
  });
}

function renderUpiPie(rows) {
  destroyChart("upiPie");
  const ctx = document.getElementById("upiPieChart");
  if (!ctx) return;
  const total = rows.reduce((s,r)=>s+r.total,0);
  const upiColors = { PhonePe:"#8b5cf6", GPay:"#3b82f6", Paytm:"#06b6d4", BHIM:"#f97316", Other:"#6b7280" };
  charts.upiPie = new Chart(ctx, {
    type:"doughnut",
    data: { labels: rows.map(r=>r.app_name), datasets:[{ data:rows.map(r=>r.total), backgroundColor:rows.map(r=>upiColors[r.app_name]||"#6b7280"), borderColor:"#161820", borderWidth:3 }] },
    options: {
      responsive:true, maintainAspectRatio:false, cutout:"65%",
      plugins:{ legend:{display:false}, tooltip:{backgroundColor:"#1d1f28",borderColor:"#2d3748",borderWidth:1,titleColor:"#9a9bac",bodyColor:"#f0f0f0",padding:10,callbacks:{label:v=>" "+fmt(v.raw)+" ("+(v.raw/total*100).toFixed(1)+"%)"}} }
    }
  });
  const leg = document.getElementById("upiPieLegend");
  if (leg) leg.innerHTML = rows.map(r=>`
    <div class="legend-item">
      <div class="legend-dot" style="background:${upiColors[r.app_name]||"#6b7280"}"></div>
      ${r.app_name} <span style="color:#5e6070;margin-left:4px">${total?(r.total/total*100).toFixed(0):0}%</span>
    </div>`).join("");
}

function renderWeekday(rows) {
  destroyChart("wd");
  const ctx = document.getElementById("wdChart");
  if (!ctx) return;
  // DAYOFWEEK: 1=Sun … 7=Sat
  const names = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const vals  = Array(7).fill(0);
  rows.forEach(r => { vals[r.dow - 1] = r.total; });
  const isWE = [true,false,false,false,false,false,true];
  charts.wd = new Chart(ctx, {
    type:"bar",
    data: { labels: names, datasets:[{ data:vals, backgroundColor:isWE.map(w=>w?"#f472b6cc":"#60a5facc"), borderRadius:6, borderSkipped:false }] },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{display:false}, tooltip:{backgroundColor:"#1d1f28",borderColor:"#2d3748",borderWidth:1,titleColor:"#9a9bac",bodyColor:"#f0f0f0",padding:10,callbacks:{label:v=>" "+fmt(v.raw)}} },
      scales:{ x:{grid:{display:false},ticks:{color:"#5e6070"}}, y:{grid:{color:"rgba(255,255,255,0.04)"},ticks:{color:"#5e6070",callback:v=>"₹"+(v/1000).toFixed(0)+"K"}} }
    }
  });
}
