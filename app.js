const sb = window.sb;
let pieChart, barChart;
let defaultInterestRate = 0.25;
let _allLoans = [], _paymentsMap = {};
let expandedLoanIds = new Set(), currentLoanId = null;

// ─── INIT ────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  // Load saved interest rate
  const savedRate = localStorage.getItem("interestRate");
  if (savedRate) defaultInterestRate = parseFloat(savedRate);
  document.getElementById("interestRateInput").value = defaultInterestRate * 100;

  // Cash on Hand input
  const cashInput = document.getElementById("cashOnHandInput");
  const savedCash = localStorage.getItem("cashOnHand");
  cashInput.value = savedCash !== null ? savedCash : "";
  cashInput.addEventListener("input", e => {
    localStorage.setItem("cashOnHand", e.target.value);
    updateDashboard();
  });

  // Initialize tabs & modal click-away
  selectTab("dashboard", document.getElementById("segDash"));
  document.querySelectorAll(".modal").forEach(m =>
    m.addEventListener("click", e => { if (e.target === m) m.classList.remove("show"); })
  );

  // Load data and render
  await loadAllData();
  updateDashboard();
});
// Late‐Fee per day
const lateFeeInput = document.getElementById("lateFeeInput");
lateFeeInput.value = localStorage.getItem("lateFee") || "10";
lateFeeInput.addEventListener("input", e => {
  localStorage.setItem("lateFee", e.target.value);
});

// App Version & Support need no JS—version is static, support opens mailto.

// Reset All Data (already defined earlier)
window.resetAllData = () => {
  if (!confirm("Really clear all loans & payments?")) return;
  // You could also delete via Supabase here if desired
  localStorage.clear();
  location.reload();
};

// ─── TABS ─────────────────────────────────────────────────────────────
function selectTab(id, btn) {
  document.querySelectorAll(".segmented-control button")
    .forEach(b => b.classList.remove("active"));
  btn.classList.add("active");

  document.querySelectorAll(".tab")
    .forEach(t => t.classList.remove("active"));
  document.getElementById(id).classList.add("active");

  document.querySelector(".fab").style.display = (id === "loans") ? "block" : "none";
}

// ─── LOAD DATA ──────────────────────────────────────────────────────
async function loadAllData() {
  // Loans
  const loansRes = await sb.from("loans")
    .select("*")
    .order("start_date", { ascending: false });
  _allLoans = loansRes.data || [];

  // Payments
  const payRes = await sb.from("payments")
    .select("*")
    .order("date", { ascending: true });
  const payments = payRes.data || [];

  // Build payments map
  _paymentsMap = {};
  for (let i = 0; i < payments.length; i++) {
    const p = payments[i];
    if (!_paymentsMap[p.loan_id]) _paymentsMap[p.loan_id] = [];
    _paymentsMap[p.loan_id].push(p);
  }

  applyFilters();
}

// ─── DASHBOARD ───────────────────────────────────────────────────────
async function updateDashboard() {
  // 1) Cash on Hand
  const cash = parseFloat(localStorage.getItem("cashOnHand")) || 0;
  document.getElementById("cashOnHand").textContent = cash.toFixed(2) + " XCG";

  // 2) Aggregate loan stats
  let totalLoaned        = 0;
  let totalDue           = 0;
  let expectedInterest   = 0;
  let countActive        = 0;
  let countOverdue       = 0;
  let countCompleted     = 0;
  const today = new Date();

  for (const l of _allLoans) {
    totalLoaned += l.amount;

    // initial total = principal + (principal * rate * duration)
    const initInterest = l.amount * defaultInterestRate * l.duration;
    const initTotal    = l.amount + initInterest;

    // sum of payments
    const paid = (_paymentsMap[l.id]||[]).reduce((sum,p)=>sum+p.amount, 0);

    // remaining due on this loan
    const remaining = initTotal - paid;
    totalDue += remaining;

    // how much interest remains (on the remaining principal proportionally)
    // (this is “expected” additional interest)
    expectedInterest += remaining - (l.amount - paid);

    // status counts
    const dueDate = new Date(l.start_date);
    dueDate.setMonth(dueDate.getMonth() + l.duration);
    if (paid >= initTotal) {
      countCompleted++;
    } else {
      countActive++;
      if (today > dueDate) countOverdue++;
    }
  }

  // 3) Write out
  document.getElementById("totalLoaned"       ).textContent = totalLoaned.toFixed(2)      + " XCG";
  document.getElementById("totalDue"          ).textContent = totalDue.toFixed(2)         + " XCG";
  document.getElementById("expectedInterest"  ).textContent = expectedInterest.toFixed(2) + " XCG";
  document.getElementById("countActive"       ).textContent = countActive;
  document.getElementById("countOverdue"      ).textContent = countOverdue;
  document.getElementById("countCompleted"    ).textContent = countCompleted;

  // 4) Charts: pie = [Loaned, Due]  bar = [Active, Completed, Overdue]
  const pCtx = document.getElementById("pieChart").getContext("2d"),
        bCtx = document.getElementById("barChart").getContext("2d");
  if (pieChart) pieChart.destroy();
  if (barChart) barChart.destroy();

  pieChart = new Chart(pCtx, {
    type: "pie",
    data: {
      labels: ["Loaned","Due"],
      datasets: [{ data:[totalLoaned, totalDue], backgroundColor:["#263238","#ec407a"] }]
    }
  });
  barChart = new Chart(bCtx, {
    type: "bar",
    data: {
      labels: ["Active","Completed","Overdue"],
      datasets: [{
        data: [countActive, countCompleted, countOverdue],
        backgroundColor:["#42a5f5","#66bb6a","#e53935"]
      }]
    },
    options: { scales:{ y:{ beginAtZero:true } } }
  });
}
// inside updateDashboard() or wherever you compute fines:
const feePerDay = parseFloat(localStorage.getItem("lateFee"))||0;
let totalFine = 0;
for (const l of _allLoans) {
  // compute dueDate & paidSum as before...
  if (today > dueDate && paidSum < initTotal) {
    const daysOver = Math.floor((today - dueDate)/86400000);
    totalFine += daysOver * feePerDay;
  }
}
// you could render totalFine anywhere (e.g. add a new card)


// ─── CALCULATOR ─────────────────────────────────────────────────────
function buildSchedule(principal, rate, months) {
  let total = principal + principal * rate;
  const sched = [];
  for (let m = 1; m <= months; m++) {
    const payment = total / (months - m + 1);
    const nextInt = (total - payment) * rate;
    sched.push({ month: m, payment, nextInt });
    total = (total - payment) + (total - payment) * rate;
  }
  return sched;
}

function calculateLoan() {
  const amt    = parseFloat(document.getElementById("calcAmount").value);
  const months = parseInt(document.getElementById("calcMonths").value, 10);
  if (!amt || !months) return;

  const sched = buildSchedule(amt, defaultInterestRate, months);
  let totalPaid = 0;
  for (let i = 0; i < sched.length; i++) totalPaid += sched[i].payment;
  const totalInterest = totalPaid - amt;

  document.getElementById("calcInterest").textContent = totalInterest.toFixed(2);
  document.getElementById("calcTotal"   ).textContent = totalPaid.toFixed(2);
  document.getElementById("calcMonthly" ).textContent = (totalPaid/months).toFixed(2);
  document.getElementById("calcResults" ).style.display = "grid";

  const schEl = document.getElementById("calcSchedule");
  schEl.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "schedule-cards";
  for (let i = 0; i < sched.length; i++) {
    const r = sched[i];
    const card = document.createElement("div");
    card.className = "schedule-card";
    card.innerHTML =
      `<div class="card-month">Month ${r.month}</div>` +
      `<div class="card-detail"><strong>Payment:</strong> ${r.payment.toFixed(2)} XCG</div>` +
      `<div class="card-detail"><strong>Interest:</strong> ${r.nextInt.toFixed(2)} XCG</div>`;
    wrap.appendChild(card);
  }
  schEl.appendChild(wrap);

  document.getElementById("calcTotalInterest").textContent =
    "Total Interest Earned: " + totalInterest.toFixed(2) + " XCG";
}

function prefillLoanForm() {
  document.getElementById("amount"  ).value = document.getElementById("calcAmount").value;
  document.getElementById("duration").value = document.getElementById("calcMonths").value;
  toggleLoanForm(true);
}

// ─── NEW LOAN ───────────────────────────────────────────────────────
function toggleLoanForm(show) {
  const m = document.getElementById("loanModal");
  m.classList.toggle("show", !!show);
  document.querySelector(".fab").style.display =
    show ? "none"
         : document.getElementById("loans").classList.contains("active") ? "block" : "none";
}

async function saveLoan() {
  const loan = {
    name:       document.getElementById("name").value,
    phone:      document.getElementById("phone").value,
    amount:     +document.getElementById("amount").value,
    duration:   +document.getElementById("duration").value,
    start_date: document.getElementById("startDate").value,
    paid:       0,
    status:     "active"
  };
  const res = await sb.from("loans").insert([loan]);
  if (res.error) return alert(res.error.message);
  toggleLoanForm(false);
  await loadAllData();
}

// ─── PAYMENTS ────────────────────────────────────────────────────────
function togglePaymentModal(show, id) {
  currentLoanId = id || currentLoanId;
  const m = document.getElementById("paymentModal");
  m.classList.toggle("show", !!show);
  if (show) {
    document.getElementById("paymentAmount").value = "";
    document.getElementById("paymentDate"  ).value = new Date().toISOString().slice(0,10);
  }
}

async function submitPayment() {
  const amt  = parseFloat(document.getElementById("paymentAmount").value);
  const date = document.getElementById("paymentDate"  ).value;
  if (!amt || !date) return alert("Please enter both date and amount.");

  const res = await sb.from("payments").insert([{
    loan_id:  currentLoanId,
    amount:   amt,
    date:     date
  }]);
  if (res.error) return alert(res.error.message);

  togglePaymentModal(false);
  expandedLoanIds.add(currentLoanId);
  await loadAllData();
}

// ─── LOANS LIST ─────────────────────────────────────────────────────
function applyFilters() {
  const term      = document.getElementById("loanSearch").value.trim().toLowerCase();
  const status    = document.getElementById("statusFilter").value;
  const container = document.getElementById("loanList");
  container.innerHTML = "";

  for (let i = 0; i < _allLoans.length; i++) {
    const l = _allLoans[i];
    const origInt = l.amount * defaultInterestRate * l.duration;
    const totDue  = l.amount + origInt;
    const pmts    = _paymentsMap[l.id] || [];
    let paidSum   = 0;
    for (let j = 0; j < pmts.length; j++) paidSum += pmts[j].amount;

    const d      = new Date(l.start_date);
    d.setMonth(d.getMonth() + l.duration);
    const dueStr = d.toISOString().slice(0,10);
    const dispSt = (paidSum >= totDue) ? "completed" : "active";

    if (status !== "all" && dispSt !== status) continue;
    if (term && l.name.toLowerCase().indexOf(term) === -1) continue;

    const loanId   = l.id;
    const expanded = expandedLoanIds.has(loanId);

    const card = document.createElement("div");
    card.className = "loan-card" + (expanded ? " expanded" : "");

    // header
    const hdr = document.createElement("div");
    hdr.className = "loan-card-header";
    hdr.innerHTML =
      `<span class="loan-name">${l.name}</span>` +
      `<span class="status-pill ${dispSt}">${dispSt}</span>`;
    hdr.addEventListener("click", handleHeaderClick.bind(null, loanId));
    card.appendChild(hdr);

    // body
    const body = document.createElement("div");
    body.className = "loan-card-body";
    const fields = [
      ["Loan Amount:",  l.amount.toFixed(2) + " XCG"],
      ["Interest:",     origInt.toFixed(2)    + " XCG"],
      ["Repay Total:",  totDue.toFixed(2)     + " XCG"],
      ["Repay Date:",    dueStr]
    ];
    for (let f = 0; f < fields.length; f++) {
      const pair = fields[f];
      const fld = document.createElement("div");
      fld.className = "field";
      fld.innerHTML = `<span>${pair[0]}</span><span>${pair[1]}</span>`;
      body.appendChild(fld);
    }

    // Pay button
    const btn = document.createElement("button");
    btn.className   = "pay-btn";
    btn.textContent = "Pay";
    btn.addEventListener("click", handlePayClick.bind(null, loanId));
    body.appendChild(btn);

    // extras
    if (pmts.length) {
      body.appendChild(document.createElement("hr"));
      const extras = [
        ["Paid So Far:",    paidSum.toFixed(2) + " XCG"],
        ["Remaining:",      (totDue - paidSum).toFixed(2) + " XCG"],
        ["New Interest:",   ((totDue - paidSum)*defaultInterestRate).toFixed(2) + " XCG"],
        ["New Total:",      ((totDue - paidSum)*(1+defaultInterestRate)).toFixed(2) + " XCG"]
      ];
      for (let e = 0; e < extras.length; e++) {
        const pair = extras[e];
        const fld = document.createElement("div");
        fld.className = "field";
        fld.innerHTML = `<span>${pair[0]}</span><span>${pair[1]}</span>`;
        body.appendChild(fld);
      }
    }

    body.style.display = expanded ? "block" : "none";
    card.appendChild(body);
    container.appendChild(card);
  }
}

// ─── HANDLERS ───────────────────────────────────────────────────────
function handleHeaderClick(loanId) {
  if (expandedLoanIds.has(loanId)) expandedLoanIds.delete(loanId);
  else expandedLoanIds.add(loanId);
  applyFilters();
}

function handlePayClick(loanId, e) {
  e.stopPropagation();
  togglePaymentModal(true, loanId);
}

// ─── SETTINGS ─────────────────────────────────────────────────────
function setInterestRate(v) {
  defaultInterestRate = parseFloat(v) / 100;
  localStorage.setItem("interestRate", defaultInterestRate);
}

// ─── EXPORT ───────────────────────────────────────────────────────
window.selectTab           = selectTab;
window.calculateLoan       = calculateLoan;
window.prefillLoanForm     = prefillLoanForm;
window.toggleLoanForm      = toggleLoanForm;
window.saveLoan            = saveLoan;
window.togglePaymentModal  = togglePaymentModal;
window.submitPayment       = submitPayment;
window.applyFilters        = applyFilters;
window.setInterestRate     = setInterestRate;

