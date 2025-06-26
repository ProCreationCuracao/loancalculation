// app.js – iOS‐style UI + dynamic diminishing‐balance schedule

const sb = window.sb;
let pieChart, barChart;
let defaultInterestRate = 0.25;
let _allLoans = [];
let _paymentsMap = {};
let expandedLoanIds = new Set();
let currentLoanId = null;

// ─── INIT ─────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  const saved = localStorage.getItem("interestRate");
  if (saved) defaultInterestRate = parseFloat(saved);
  document.getElementById("interestRateInput").value = defaultInterestRate * 100;

  selectTab("dashboard", document.getElementById("segDash"));
  await loadAllData();
  updateDashboard();
});

// ─── TAB HANDLING ───────────────────────────────────────────────────────────
function selectTab(id, btn) {
  document.querySelectorAll(".segmented-control button")
    .forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  document.querySelector(".fab").classList.toggle("show", id === "loans");
}

// ─── LOAD LOANS + PAYMENTS ──────────────────────────────────────────────────
async function loadAllData() {
  const { data: loans } = await sb.from("loans")
    .select("*").order("start_date",{ ascending: false });
  _allLoans = loans || [];

  const { data: payments } = await sb.from("payments")
    .select("*").order("date",{ ascending: true });
  _paymentsMap = {};
  (payments || []).forEach(p => {
    (_paymentsMap[p.loan_id] ||= []).push(p);
  });

  applyFilters();
}

// ─── DASHBOARD ──────────────────────────────────────────────────────────────
async function updateDashboard() {
  const loans = _allLoans;
  document.getElementById("totalCustomers").textContent = loans.length;

  const loaned = loans.reduce((s,l) => s + l.amount, 0);
  const dueAmt = loans.reduce((s,l) => {
    const initInt = l.amount * defaultInterestRate * l.duration;
    const initTot = l.amount + initInt;
    const paidSum = (_paymentsMap[l.id] || []).reduce((ss,p) => ss + p.amount, 0);
    return s + (initTot - paidSum);
  }, 0);
  const activeCt = loans.filter(l => l.status === "active").length;

  document.getElementById("totalLoaned").textContent = loaned.toFixed(2) + " XCG";
  document.getElementById("totalDue").textContent    = dueAmt.toFixed(2) + " XCG";
  document.getElementById("countActive").textContent= activeCt;

  // rebuild charts
  const pCtx = document.getElementById("pieChart").getContext("2d");
  const bCtx = document.getElementById("barChart").getContext("2d");
  if (pieChart) pieChart.destroy();
  if (barChart) barChart.destroy();

  pieChart = new Chart(pCtx, {
    type: "pie",
    data: {
      labels: ["Loaned","Due"],
      datasets: [{ data:[loaned,dueAmt], backgroundColor:["#263238","#ec407a"] }]
    }
  });
  barChart = new Chart(bCtx,{
    type: "bar",
    data: {
      labels:["Active","Completed"],
      datasets:[{ data:[
        activeCt,
        loans.filter(l=>l.status==="completed").length
      ], backgroundColor:["#42a5f5","#66bb6a"] }]
    }
  });
}

// ─── BUILD SCHEDULE ─────────────────────────────────────────────────────────
function buildSchedule(principal, rate, months) {
  let totalDue = principal + principal * rate; // one-time interest
  const sched = [];
  for (let m = 1; m <= months; m++) {
    const left      = months - m + 1;
    const payment   = totalDue / left;
    const remaining = totalDue - payment;
    const nextInt   = m < months ? remaining * rate : 0;
    const nextTot   = remaining + nextInt;

    sched.push({
      month: m,
      currTotal: totalDue,
      payment,
      remBeforeInterest: remaining,
      nextInterest: nextInt,
      nextTotalDue: nextTot
    });
    totalDue = nextTot;
  }
  return sched;
}

// ─── CALCULATOR ─────────────────────────────────────────────────────────────
function calculateLoan() {
  const amt    = parseFloat(document.getElementById("calcAmount").value);
  const months = parseInt(document.getElementById("calcMonths").value, 10);
  if (!amt || !months) return;

  const interest = amt * defaultInterestRate;
  const total    = amt + interest;
  const monthly  = total / months;

  document.getElementById("calcInterest").textContent = interest.toFixed(2);
  document.getElementById("calcTotal").textContent    = total.toFixed(2);
  document.getElementById("calcMonthly").textContent  = monthly.toFixed(2);
  document.getElementById("calcResults").style.display = "block";

  const sched = buildSchedule(amt, defaultInterestRate, months);
  let html = `<table>
    <thead><tr>
      <th>Mo</th><th>Curr Due</th><th>Payment</th><th>Rem</th><th>Int</th><th>Next Due</th>
    </tr></thead><tbody>`;
  sched.forEach(r => {
    html += `<tr>
      <td>${r.month}</td>
      <td>${r.currTotal.toFixed(2)}</td>
      <td>${r.payment.toFixed(2)}</td>
      <td>${r.remBeforeInterest.toFixed(2)}</td>
      <td>${r.nextInterest.toFixed(2)}</td>
      <td>${r.nextTotalDue.toFixed(2)}</td>
    </tr>`;
  });
  html += `</tbody></table>`;
  document.getElementById("calcSchedule").innerHTML = html;
}

function prefillLoanForm() {
  document.getElementById("amount").value   = document.getElementById("calcAmount").value;
  document.getElementById("duration").value = document.getElementById("calcMonths").value;
  toggleLoanForm(true);
}

// ─── FILTER & RENDER LOANS ──────────────────────────────────────────────────
function applyFilters() {
  const term   = document.getElementById("loanSearch").value.trim().toLowerCase();
  const status = document.getElementById("statusFilter").value;
  const list   = document.getElementById("loanList");
  list.innerHTML = "";

  _allLoans.forEach(l => {
    const payments   = _paymentsMap[l.id] || [];
    const paidSum    = payments.reduce((s,p) => s + p.amount, 0);
    const initInt    = l.amount * defaultInterestRate * l.duration;
    const initTot    = l.amount + initInt;
    const remaining  = initTot - paidSum;
    const dueDate    = new Date(l.start_date);
    dueDate.setMonth(dueDate.getMonth() + l.duration);
    const isOver     = new Date() > dueDate && l.status !== "completed";
    const disp       = isOver ? "overdue" : l.status;
    if (status !== "all" && disp !== status) return;
    if (term && !l.name.toLowerCase().includes(term)) return;

    const card = document.createElement("div");
    card.className = "loan-card";
    if (expandedLoanIds.has(l.id)) card.classList.add("expanded");
    card.innerHTML = `
      <div class="loan-card-title">${l.name}</div>
      <div class="loan-card-details">
        <p><strong>Paid:</strong> ${paidSum.toFixed(2)} XCG</p>
        <p><strong>Rem:</strong>  ${remaining.toFixed(2)} XCG</p>
        <button onclick="event.stopPropagation(); togglePaymentModal(true,'${l.id}')">Pay</button>
      </div>
      <div class="breakdown">
        <p><strong>Interest on rem (25%):</strong> ${(remaining * defaultInterestRate).toFixed(2)} XCG</p>
        <p><strong>Next Due:</strong>             ${(remaining + remaining*defaultInterestRate).toFixed(2)} XCG</p>
        <p><strong>Status:</strong>              ${disp}</p>
        <hr>
        ${payments.map((p,i)=>`<p>● [${p.date}] ${p.amount.toFixed(2)} XCG</p>`).join("")}
      </div>`;
    card.onclick = () => {
      const open = card.classList.toggle("expanded");
      open ? expandedLoanIds.add(l.id) : expandedLoanIds.delete(l.id);
    };
    list.appendChild(card);
  });
}

// ─── NEW LOAN ───────────────────────────────────────────────────────────────
function toggleLoanForm(show) {
  document.getElementById("loanModal").classList.toggle("show", !!show);
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
  const { error } = await sb.from("loans").insert([loan]);
  if (error) return alert(error.message);
  toggleLoanForm(false);
  await loadAllData();
  updateDashboard();
}

// ─── PAYMENT ───────────────────────────────────────────────────────────────
function togglePaymentModal(show, loanId) {
  document.getElementById("paymentModal").classList.toggle("show", !!show);
  currentLoanId = loanId || currentLoanId;
  if (show) {
    document.getElementById("paymentAmount").value = "";
    document.getElementById("paymentDate").value   = new Date().toISOString().split("T")[0];
  }
}
async function submitPayment() {
  const amt  = +document.getElementById("paymentAmount").value;
  const date = document.getElementById("paymentDate").value;
  const { error: pe } = await sb.from("payments").insert([{
    loan_id: currentLoanId, amount: amt, date
  }]);
  if (pe) return alert(pe.message);
  togglePaymentModal(false);
  await loadAllData();
  updateDashboard();
}

// ─── INTEREST RATE ─────────────────────────────────────────────────────────
function setInterestRate(v) {
  defaultInterestRate = parseFloat(v) / 100;
  localStorage.setItem("interestRate", defaultInterestRate);
}

// Expose
window.selectTab           = selectTab;
window.calculateLoan       = calculateLoan;
window.prefillLoanForm     = prefillLoanForm;
window.toggleLoanForm      = toggleLoanForm;
window.saveLoan            = saveLoan;
window.togglePaymentModal  = togglePaymentModal;
window.submitPayment       = submitPayment;
window.applyFilters        = applyFilters;
window.setInterestRate     = setInterestRate;
