const sb = window.sb;
let pieChart, barChart;
let defaultInterestRate = 0.25;
let _allLoans = [], _paymentsMap = {};
let expandedLoanIds = new Set(), currentLoanId = null;

// ─── INIT ────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async function() {
  // Load saved interest rate
  var saved = localStorage.getItem("interestRate");
  if (saved) defaultInterestRate = parseFloat(saved);
  document.getElementById("interestRateInput").value = defaultInterestRate * 100;

  // Initialize tabs
  selectTab("dashboard", document.getElementById("segDash"));

  // Click-away to close modals
  document.querySelectorAll(".modal").forEach(function(modal) {
    modal.addEventListener("click", function(e) {
      if (e.target === modal) {
        if (modal.id === "loanModal")      toggleLoanForm(false);
        else if (modal.id === "paymentModal") togglePaymentModal(false);
      }
    });
  });

  // Load data & render
  await loadAllData();
  updateDashboard();
});

// ─── TABS ─────────────────────────────────────────────────────────────
function selectTab(id, btn) {
  document.querySelectorAll(".segmented-control button")
    .forEach(function(b){ b.classList.remove("active"); });
  btn.classList.add("active");
  document.querySelectorAll(".tab")
    .forEach(function(t){ t.classList.remove("active"); });
  document.getElementById(id).classList.add("active");
  document.querySelector(".fab").style.display = (id === "loans") ? "block" : "none";
}

// ─── DATA LOADING ────────────────────────────────────────────────────
async function loadAllData() {
  var r1 = await sb.from("loans").select("*").order("start_date",{ascending:false});
  _allLoans = r1.data || [];

  var r2 = await sb.from("payments").select("*").order("date",{ascending:true});
  var pmts = r2.data || [];

  // Build payments map
  _paymentsMap = {};
  for (var i = 0; i < pmts.length; i++) {
    var p = pmts[i];
    if (!_paymentsMap[p.loan_id]) _paymentsMap[p.loan_id] = [];
    _paymentsMap[p.loan_id].push(p);
  }

  applyFilters();
}

// ─── DASHBOARD ───────────────────────────────────────────────────────
async function updateDashboard() {
  var loans = _allLoans;
  document.getElementById("totalCustomers").textContent = loans.length;

  var loaned = loans.reduce(function(s, l){ return s + l.amount; }, 0);
  var dueAmt = loans.reduce(function(s, l){
    var initInt = l.amount * defaultInterestRate * l.duration;
    var initTot = l.amount + initInt;
    var paidSum = (_paymentsMap[l.id] || []).reduce(function(ss,p){
      return ss + p.amount;
    }, 0);
    return s + (initTot - paidSum);
  }, 0);

  var activeCt = loans.filter(function(l){ return l.status === "active"; }).length;

  document.getElementById("totalLoaned").textContent = loaned.toFixed(2) + " XCG";
  document.getElementById("totalDue").textContent    = dueAmt.toFixed(2) + " XCG";
  document.getElementById("countActive").textContent= activeCt;

  var pCtx = document.getElementById("pieChart").getContext("2d");
  var bCtx = document.getElementById("barChart").getContext("2d");
  if (pieChart) pieChart.destroy();
  if (barChart) barChart.destroy();

  pieChart = new Chart(pCtx, {
    type: "pie",
    data: {
      labels: ["Loaned","Due"],
      datasets: [{ data:[loaned,dueAmt], backgroundColor:["#263238","#ec407a"] }]
    }
  });
  barChart = new Chart(bCtx, {
    type: "bar",
    data: {
      labels: ["Active","Completed"],
      datasets: [{ data:[
        activeCt,
        loans.filter(function(l){ return l.status==="completed"; }).length
      ], backgroundColor:["#42a5f5","#66bb6a"] }]
    }
  });
}

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
  var amt    = parseFloat(document.getElementById("calcAmount").value);
  var months = parseInt(document.getElementById("calcMonths").value, 10);
  if (!amt || !months) return;

  var sched = buildSchedule(amt, defaultInterestRate, months);
  var totalPaid     = sched.reduce(function(s, r){ return s + r.payment; }, 0);
  var totalInterest = totalPaid - amt;

  document.getElementById("calcInterest").textContent = totalInterest.toFixed(2);
  document.getElementById("calcTotal").textContent    = totalPaid.toFixed(2);
  document.getElementById("calcMonthly").textContent  = (totalPaid/months).toFixed(2);
  document.getElementById("calcResults").style.display = "grid";

  // Build the schedule cards without any line-starting '+'
  var parts = [];
  parts.push('<div class="schedule-cards">');

  for (var i = 0; i < sched.length; i++) {
    var r = sched[i];
    parts.push('<div class="schedule-card">');
    parts.push('<div class="card-month">Month ' + r.month + '</div>');
    parts.push('<div class="card-detail"><strong>Payment:</strong> ' + r.payment.toFixed(2) + ' XCG</div>');
    parts.push('<div class="card-detail"><strong>Interest:</strong> ' + r.nextInt.toFixed(2) + ' XCG</div>');
    parts.push('</div>');
  }

  parts.push('</div>');
  var html = parts.join('');

  document.getElementById("calcSchedule").innerHTML      = html;
  document.getElementById("calcTotalInterest").textContent =
    "Total Interest Earned: " + totalInterest.toFixed(2) + " XCG";
}

function prefillLoanForm(){
  document.getElementById("amount").value   =
    document.getElementById("calcAmount").value;
  document.getElementById("duration").value =
    document.getElementById("calcMonths").value;
  toggleLoanForm(true);
}

// ─── NEW LOAN CREATION ─────────────────────────────────────────────
function toggleLoanForm(show){
  document.getElementById("loanModal").classList.toggle("show", !!show);
  document.querySelector(".fab").style.display =
    show ? "none" : document.getElementById("loans").classList.contains("active") ? "block" : "none";
}

async function saveLoan(){
  var loan = {
    name:       document.getElementById("name").value,
    phone:      document.getElementById("phone").value,
    amount:     +document.getElementById("amount").value,
    duration:   +document.getElementById("duration").value,
    start_date: document.getElementById("startDate").value,
    paid:       0,
    status:     "active"
  };
  var res = await sb.from("loans").insert([loan]);
  if (res.error) return alert(res.error.message);
  toggleLoanForm(false);
  await loadAllData();
}

// ─── PAYMENTS: OPEN/CLOSE & SUBMIT ─────────────────────────────────
function togglePaymentModal(show, id) {
  currentLoanId = id || currentLoanId;
  var modal = document.getElementById("paymentModal");
  modal.classList.toggle("show", !!show);
  if (show) {
    document.getElementById("paymentAmount").value = "";
    document.getElementById("paymentDate").value   = new Date().toISOString().slice(0,10);
  }
}

async function submitPayment(){
  var amt  = parseFloat(document.getElementById("paymentAmount").value);
  var date = document.getElementById("paymentDate").value;
  if (!amt || !date) {
    return alert("Please enter both date and amount.");
  }

  var res = await sb.from("payments").insert([{
    loan_id: currentLoanId,
    amount:  amt,
    date:    date
  }]);
  if (res.error) return alert(res.error.message);

  togglePaymentModal(false);
  await loadAllData();
}

// ─── LOANS TAB: FILTER & RENDER ───────────────────────────────────
function applyFilters() {
  var term      = document.getElementById("loanSearch").value.trim().toLowerCase();
  var status    = document.getElementById("statusFilter").value;
  var container = document.getElementById("loanList");
  container.innerHTML = "";

  _allLoans.forEach(function(l) {
    // Compute interest, totals, etc. (same as before)
    var origInterest = l.amount * defaultInterestRate * l.duration;
    var totalDue     = l.amount + origInterest;

    var pmts = _paymentsMap[l.id] || [];
    var paidSum = 0, lastPayDate = "";
    pmts.forEach(function(p) {
      paidSum += p.amount;
      lastPayDate = p.date;
    });

    var remaining   = totalDue - paidSum;
    var newInterest = remaining * defaultInterestRate;
    var newTotalDue = remaining + newInterest;

    var dueDate = new Date(l.start_date);
    dueDate.setMonth(dueDate.getMonth() + l.duration);
    var dueDateStr = dueDate.toISOString().slice(0,10);
    var dispStatus = (paidSum >= totalDue) ? "completed" : "active";

    // Filters
    if (status !== "all" && dispStatus !== status) return;
    if (term && l.name.toLowerCase().indexOf(term) === -1) return;

    // Build card container
    var isExpanded = expandedLoanIds.has(l.id);
    var card = document.createElement("div");
    card.className = "loan-card" + (isExpanded ? " expanded" : "");

    // Header (name + status)
    var header = document.createElement("div");
    header.className = "loan-card-header";
    header.innerHTML = `<span class="loan-name">${l.name}</span>
                        <span class="status-pill ${dispStatus}">${dispStatus}</span>`;
    header.addEventListener("click", function(){
      toggleExpand(l.id);
    });
    card.appendChild(header);

    // Body (hidden until expanded)
    var body = document.createElement("div");
    body.className = "loan-card-body";
    body.innerHTML = `
      <div class="field"><span>Loan Amount:</span><span>${l.amount.toFixed(2)} XCG</span></div>
      <div class="field"><span>Interest:</span><span>${origInterest.toFixed(2)} XCG</span></div>
      <div class="field"><span>Repay Total:</span><span>${totalDue.toFixed(2)} XCG</span></div>
      <div class="field"><span>Repay Date:</span><span>${dueDateStr}</span></div>
    `;

    // Pay button
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pay-btn";
    btn.textContent = "Pay";
    btn.addEventListener("click", function(e){
      e.stopPropagation();
      togglePaymentModal(true, l.id);
    });
    body.appendChild(btn);

    // Additional payment info if any
    if (pmts.length > 0) {
      var hr = document.createElement("hr");
      body.appendChild(hr);

      [["Paid So Far:", paidSum.toFixed(2) + " XCG"],
       ["Last Paid:",  lastPayDate],
       ["Remaining:",  remaining.toFixed(2) + " XCG"],
       ["New Interest:", newInterest.toFixed(2) + " XCG"],
       ["New Total:",   newTotalDue.toFixed(2) + " XCG"]
      ].forEach(function(pair){
        var fld = document.createElement("div");
        fld.className = "field";
        fld.innerHTML = `<span>${pair[0]}</span><span>${pair[1]}</span>`;
        body.appendChild(fld);
      });
    }

    card.appendChild(body);
    container.appendChild(card);
  });
}

function toggleExpand(id){
  if (expandedLoanIds.has(id)) expandedLoanIds.delete(id);
  else                         expandedLoanIds.add(id);
  applyFilters();
}

// ─── SETTINGS ─────────────────────────────────────────────────────
function setInterestRate(v){
  defaultInterestRate = parseFloat(v)/100;
  localStorage.setItem("interestRate", defaultInterestRate);
}

// ─── EXPOSE HANDLERS ───────────────────────────────────────────────
window.selectTab           = selectTab;
window.calculateLoan       = calculateLoan;
window.prefillLoanForm     = prefillLoanForm;
window.toggleLoanForm      = toggleLoanForm;
window.saveLoan            = saveLoan;
window.togglePaymentModal  = togglePaymentModal;
window.submitPayment       = submitPayment;
window.applyFilters        = applyFilters;
window.toggleExpand        = toggleExpand;
window.setInterestRate     = setInterestRate;
