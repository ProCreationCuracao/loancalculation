const sb = window.sb;
let pieChart, barChart;
let defaultInterestRate = 0.25;
let _allLoans = [], _paymentsMap = {};
let expandedLoanIds = new Set(), currentLoanId = null;

// ─── INIT ────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  // 1) Load saved interest rate
  const savedRate = localStorage.getItem("interestRate");
  if (savedRate) defaultInterestRate = parseFloat(savedRate);
  document.getElementById("interestRateInput").value = defaultInterestRate * 100;

  // 2) Cash on hand
  const cashIn = document.getElementById("cashOnHandInput");
  if (cashIn) {
    const savedCash = localStorage.getItem("cashOnHand");
    cashIn.value = savedCash !== null ? savedCash : "";
    cashIn.addEventListener("input", e => {
      localStorage.setItem("cashOnHand", e.target.value);
      updateDashboard();
    });
  }

  // 3) Late fee
  const feeIn = document.getElementById("lateFeeInput");
  if (feeIn) {
    feeIn.value = localStorage.getItem("lateFee") || "10";
    feeIn.addEventListener("input", e => {
      localStorage.setItem("lateFee", e.target.value);
    });
  }

  // 4) Save rules button
  document.getElementById("saveRulesBtn")
    .addEventListener("click", () => {
      const txt = document.getElementById("rulesEditor").value;
      sb.from("rules").upsert({ id: 1, content: txt }).then(() => {
        showToast("Rules saved!");
        toggleRulesEdit(false);
      });
    });

  // 5) Tabs & click‐away for modals
  selectTab("dashboard", document.getElementById("segDash"));
  document.querySelectorAll(".modal").forEach(m =>
    m.addEventListener("click", e => {
      if (e.target === m) m.classList.remove("show");
    })
  );

  // 6) Load & render
  await loadAllData();
  updateDashboard();
});

// ─── TABS ────────────────────────────────────────────────────────────
function selectTab(id, btn) {
  document.querySelectorAll(".segmented-control button")
    .forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  document.querySelectorAll(".tab")
    .forEach(t => t.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  const fab = document.querySelector(".fab");
  if (fab) fab.style.display = (id === "loans") ? "block" : "none";
}

// ─── LOAD DATA ──────────────────────────────────────────────────────
async function loadAllData() {
  let { data: loans } = await sb
    .from("loans")
    .select("*")
    .order("start_date", { ascending: false });
  _allLoans = loans || [];

  let { data: pays } = await sb
    .from("payments")
    .select("*")
    .order("date", { ascending: true });
  _paymentsMap = {};
  (pays || []).forEach(p => {
    if (!_paymentsMap[p.loan_id]) _paymentsMap[p.loan_id] = [];
    _paymentsMap[p.loan_id].push(p);
  });

  applyFilters();
}

// ─── DASHBOARD ───────────────────────────────────────────────────────
async function updateDashboard() {
  const cashEl = document.getElementById("cashOnHand");
  const cash = parseFloat(localStorage.getItem("cashOnHand")) || 0;
  if (cashEl) cashEl.textContent = cash.toFixed(2) + " XCG";

  let loaned = 0, due = 0, expInt = 0, act = 0, ovd = 0, cmp = 0;
  const today = new Date();

  for (const l of _allLoans) {
    loaned += l.amount;
    const initInt = l.amount * defaultInterestRate * l.duration;
    const initTot = l.amount + initInt;
    const paidSum = (_paymentsMap[l.id] || []).reduce((s, p) => s + p.amount, 0);
    const rem = initTot - paidSum;

    due += rem;
    expInt += rem - (l.amount - paidSum);

    const dueDate = new Date(l.start_date);
    dueDate.setMonth(dueDate.getMonth() + l.duration);
    if (paidSum >= initTot) {
      cmp++;
    } else {
      act++;
      if (today > dueDate) ovd++;
    }
  }

  document.getElementById("totalLoaned"     ).textContent = loaned.toFixed(2)      + " XCG";
  document.getElementById("totalDue"        ).textContent = due.toFixed(2)         + " XCG";
  document.getElementById("expectedInterest").textContent = expInt.toFixed(2) + " XCG";
  document.getElementById("countActive"     ).textContent = act;
  document.getElementById("countCompleted"  ).textContent = cmp;
  document.getElementById("countOverdue"    ).textContent = ovd;

  // redraw charts...
  const pCtx = document.getElementById("pieChart").getContext("2d"),
        bCtx = document.getElementById("barChart").getContext("2d");
  if (pieChart) pieChart.destroy();
  if (barChart) barChart.destroy();

  pieChart = new Chart(pCtx, {
    type: "pie",
    data: { labels:["Loaned","Due"], datasets:[{ data:[loaned,due], backgroundColor:["#263238","#ec407a"] }] }
  });
  barChart = new Chart(bCtx, {
    type: "bar",
    data: { labels:["Active","Completed","Overdue"], datasets:[{ data:[act,cmp,ovd], backgroundColor:["#42a5f5","#66bb6a","#e53935"] }] },
    options:{ scales:{ y:{ beginAtZero:true } } }
  });
}

// ─── LOANS FILTER & RENDER ─────────────────────────────────────────
function applyFilters(){
  const term   = document.getElementById("loanSearch").value.trim().toLowerCase();
  const status = document.getElementById("statusFilter").value;
  const container = document.getElementById("loanList");
  container.innerHTML = "";

  _allLoans.forEach(l => {
    const origInt = l.amount * defaultInterestRate * l.duration;
    const totDue  = l.amount + origInt;
    const pmts    = _paymentsMap[l.id] || [];
    const paidSum = pmts.reduce((s,p)=>s+p.amount,0);

    const dueDate = new Date(l.start_date);
    dueDate.setMonth(dueDate.getMonth() + l.duration);
    const dueStr = dueDate.toISOString().slice(0,10);
    const dispSt = (paidSum >= totDue) ? "completed" : "active";

    if (status !== "all" && dispSt !== status) return;
    if (term && !l.name.toLowerCase().includes(term)) return;

    const loanId = l.id.toString();
    const isExpanded = expandedLoanIds.has(loanId);

    const card = document.createElement("div");
    card.className = "loan-card" + (isExpanded ? " expanded" : "");
    card.setAttribute("data-loan-id", loanId);

    // Header
    const hdr = document.createElement("div");
    hdr.className = "loan-card-header";
    hdr.innerHTML =
      `<span class="loan-name">${l.name}</span>` +
      `<span class="paid-so-far">Paid: ${paidSum.toFixed(2)} XCG</span>` +
      `<span class="status-pill ${dispSt}">${dispSt}</span>`;
    hdr.addEventListener("click", () => {
      if (expandedLoanIds.has(loanId)) {
        expandedLoanIds.delete(loanId);
      } else {
        expandedLoanIds.add(loanId);
      }
      applyFilters();
    });
    card.appendChild(hdr);

    // Body
    const body = document.createElement("div");
    body.className = "loan-card-body";
    [
      ["Loan Amount:", l.amount.toFixed(2) + " XCG"],
      ["Interest:",    origInt.toFixed(2) + " XCG"],
      ["Repay Total:", totDue.toFixed(2) + " XCG"],
      ["Repay Date:",  dueStr]
    ].forEach(([lbl, val]) => {
      const fld = document.createElement("div");
      fld.className = "field";
      fld.innerHTML = `<span>${lbl}</span><span>${val}</span>`;
      body.appendChild(fld);
    });

    // Pay button
    const btn = document.createElement("button");
    btn.className   = "pay-btn";
    btn.textContent = "Pay";
    btn.addEventListener("click", e => {
      e.stopPropagation();
      togglePaymentModal(true, loanId);
    });
    body.appendChild(btn);

    // Show payment history / recalculated fields below if any...
    if (pmts.length) {
      body.appendChild(document.createElement("hr"));
      [
        ["Remaining:",    (totDue-paidSum).toFixed(2) + " XCG"],
        ["New Interest:", ((totDue-paidSum)*defaultInterestRate).toFixed(2) + " XCG"],
        ["New Total:",    ((totDue-paidSum)*(1+defaultInterestRate)).toFixed(2) + " XCG"]
      ].forEach(([lbl, val]) => {
        const fld = document.createElement("div");
        fld.className = "field";
        fld.innerHTML = `<span>${lbl}</span><span>${val}</span>`;
        body.appendChild(fld);
      });
    }

    body.style.display = isExpanded ? "block" : "none";
    card.appendChild(body);

    container.appendChild(card);
  });
}

// ─── PAYMENT MODAL ─────────────────────────────────────────────────
function togglePaymentModal(show, loanId) {
  currentLoanId = loanId || currentLoanId;
  const m = document.getElementById("paymentModal");
  m.classList.toggle("show", !!show);
  if (show) {
    document.getElementById("paymentAmount").value = "";
    document.getElementById("paymentDate").value   = new Date().toISOString().slice(0,10);
  }
}

async function submitPayment() {
  const amt  = parseFloat(document.getElementById("paymentAmount").value);
  const date = document.getElementById("paymentDate").value;
  if (!amt || !date) {
    return alert("Please enter both date and amount.");
  }
  // Insert into Supabase
  let { error } = await sb.from("payments").insert([{
    loan_id: currentLoanId,
    amount:  amt,
    date:    date
  }]);
  if (error) return alert(error.message);

  togglePaymentModal(false);
  expandedLoanIds.add(currentLoanId);
  await loadAllData();
}

// ─── RULES MODALS ──────────────────────────────────────────────────
function toggleRulesView(show) {
  const m = document.getElementById("rulesViewModal");
  m.classList.toggle("show", !!show);
  if (!show) return;
  sb.from("rules").select("content").eq("id", 1).single()
    .then(({ data }) => {
      const ct = document.getElementById("rulesViewContent");
      ct.innerHTML = "";
      (data.content || "").split("\n").forEach(line => {
        if (line.trim()) {
          const p = document.createElement("p");
          p.textContent = line;
          ct.appendChild(p);
        }
      });
    });
}

function toggleRulesEdit(show) {
  const m = document.getElementById("rulesEditModal");
  m.classList.toggle("show", !!show);
  if (!show) return;
  sb.from("rules").select("content").eq("id", 1).single()
    .then(({ data }) => {
      document.getElementById("rulesEditor").value = data.content || "";
    });
}

// ─── TOAST ─────────────────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2000);
}

// ─── SETTINGS HELPERS & EXPORTS ───────────────────────────────────
function setInterestRate(v){
  defaultInterestRate = parseFloat(v)/100;
  localStorage.setItem("interestRate", defaultInterestRate);
}

window.selectTab           = selectTab;
window.applyFilters        = applyFilters;
window.calculateLoan       = calculateLoan;
window.prefillLoanForm     = prefillLoanForm;
window.toggleLoanForm      = toggleLoanForm;
window.saveLoan            = saveLoan;
window.togglePaymentModal  = togglePaymentModal;
window.submitPayment       = submitPayment;
window.toggleRulesView     = toggleRulesView;
window.toggleRulesEdit     = toggleRulesEdit;
window.setInterestRate     = setInterestRate;
