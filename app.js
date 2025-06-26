const sb = window.sb; // from index.html

let pieChart, barChart, currentLoanId;

// ─── INIT ────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  showTab("dashboard");
  loadLoans();
  updateDashboard();
});

// ─── TABS ────────────────────────────────────────────────────────────────────
function showTab(id) {
  document.querySelectorAll(".tab").forEach(t=>t.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
async function updateDashboard() {
  const { data: loans } = await sb.from("loans").select("*");
  document.getElementById("totalCustomers").textContent = loans.length;
  const loaned = loans.reduce((s,l)=>s+l.amount,0);
  const due    = loans.reduce((s,l)=>s+(l.amount*1.25*l.duration - l.paid),0);
  const active = loans.filter(l=>l.status==="active").length;
  document.getElementById("totalLoaned").textContent = loaned.toFixed(2)+" XCG";
  document.getElementById("totalDue").textContent    = due.toFixed(2)+" XCG";
  document.getElementById("countActive").textContent = active;

  const pCtx = document.getElementById("pieChart").getContext("2d");
  const bCtx = document.getElementById("barChart").getContext("2d");
  if(pieChart) pieChart.destroy(); if(barChart) barChart.destroy();
  pieChart = new Chart(pCtx, { type:"pie", data:{ labels:["Loaned","Due"], datasets:[{ data:[loaned,due], backgroundColor:["#263238","#ec407a"] }] }});
  barChart = new Chart(bCtx, { type:"bar", data:{ labels:["Active","Completed"], datasets:[{ data:[active, loans.filter(l=>l.status==="completed").length], backgroundColor:["#42a5f5","#66bb6a"] }] }});
}

// ─── CALCULATOR ─────────────────────────────────────────────────────────────
function calculateLoan() {
  const amt = parseFloat(document.getElementById("calcAmount").value);
  const m   = parseInt(document.getElementById("calcMonths").value);
  if(!amt||!m) return;
  const interest = amt*0.25*m, total = amt+interest, monthly = total/m;
  document.getElementById("calcInterest").textContent = interest.toFixed(2);
  document.getElementById("calcTotal").textContent    = total.toFixed(2);
  document.getElementById("calcMonthly").textContent  = monthly.toFixed(2);
  document.getElementById("calcResults").style.display = "block";
}

function prefillLoanForm() {
  document.getElementById("amount").value   = document.getElementById("calcAmount").value;
  document.getElementById("duration").value = document.getElementById("calcMonths").value;
  toggleLoanForm(true);
}

// ─── LOANS ───────────────────────────────────────────────────────────────────
async function loadLoans() {
  const { data: loans } = await sb.from("loans").select("*").order("inserted_at",{ascending:false});
  const list = document.getElementById("loanList");
  list.innerHTML = "";
  loans.forEach(l => {
    const totalDue = l.amount*1.25*l.duration, rem=(totalDue-l.paid).toFixed(2);
    const card = document.createElement("div");
    card.className = "loan-card";
    card.innerHTML = `
      <div class="loan-card-title">${l.name}</div>
      <div class="loan-card-details">
        Amt: ${l.amount} XCG | Dur: ${l.duration}m<br>
        Paid: ${l.paid.toFixed(2)} | Rem: ${rem} | Status: ${l.status}
      </div>
      <button onclick="togglePaymentModal(true,'${l.id}')">Pay</button>
    `;
    list.appendChild(card);
  });
}

function toggleLoanForm(show) {
  document.getElementById("loanModal").style.display = show ? "block" : "none";
}

async function saveLoan() {
  const loan = {
    name:       document.getElementById("name").value,
    phone:      document.getElementById("phone").value,
    amount:     parseFloat(document.getElementById("amount").value),
    duration:   parseInt(document.getElementById("duration").value),
    start_date: document.getElementById("startDate").value,
    paid:       0,
    status:     "active"
  };
  const { error } = await sb.from("loans").insert([loan]);
  if(error) return alert(error.message);
  toggleLoanForm(false);
  loadLoans(); updateDashboard();
}

function togglePaymentModal(show,id) {
  document.getElementById("paymentModal").style.display = show ? "block":"none";
  currentLoanId = id;
}

async function submitPayment() {
  const amt = parseFloat(document.getElementById("paymentAmount").value);
  const { data:[l] } = await sb.from("loans").select("*").eq("id",currentLoanId);
  const totalDue = l.amount*1.25*l.duration;
  const newPaid = l.paid + amt;
  const newStatus = newPaid>=totalDue?"completed":"active";
  const { error } = await sb.from("loans").update({ paid:newPaid, status:newStatus }).eq("id",currentLoanId);
  if(error) return alert(error.message);
  togglePaymentModal(false);
  loadLoans(); updateDashboard();
}
// modify togglePaymentModal to set the date
function togglePaymentModal(show, loanId) {
  document.getElementById('paymentModal').style.display = show ? 'block' : 'none';
  currentLoanId = loanId;
  if (show) {
    // default to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('paymentDate').value = today;
    // clear amount
    document.getElementById('paymentAmount').value = '';
  }
}

// in submitPayment, read the date if you like
async function submitPayment() {
  const amt  = parseFloat(document.getElementById('paymentAmount').value);
  const date = document.getElementById('paymentDate').value;  // YYYY-MM-DD
  // ... existing fetch & update logic ...
  // if you later add a payments table, you can store this date field
  // For now we just proceed as before:
  const { data: [l] } = await sb
    .from('loans')
    .select('*')
    .eq('id', currentLoanId);

  const totalDue = l.amount * 1.25 * l.duration;
  const newPaid  = l.paid + amt;
  const newStatus= newPaid >= totalDue ? 'completed' : 'active';

  const { error } = await sb
    .from('loans')
    .update({ paid: newPaid, status: newStatus })
    .eq('id', currentLoanId);
  if (error) return alert(error.message);

  togglePaymentModal(false);
  loadLoans();
  updateDashboard();
}

// Show/hide the New Loan form, always clearing inputs
function toggleLoanForm(show) {
  const modal = document.getElementById('loanModal');
  modal.style.display = show ? 'block' : 'none';

  if (show) {
    // Clear every field
    document.getElementById('name').value      = '';
    document.getElementById('phone').value     = '';
    document.getElementById('amount').value    = '';
    document.getElementById('duration').value  = '';
    document.getElementById('startDate').value = '';
  }
}

// Show/hide the Payment form, always clearing the amount (and resetting date to today)
function togglePaymentModal(show, loanId) {
  const modal = document.getElementById('paymentModal');
  modal.style.display = show ? 'block' : 'none';
  currentLoanId = loanId;

  if (show) {
    // Clear amount
    document.getElementById('paymentAmount').value = '';
    // Optionally reset date to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('paymentDate').value   = today;
  }
}


// ─── SETTINGS ───────────────────────────────────────────────────────────────
function setLogoPosition(pos) {
  const lg=document.getElementById("logo");
  lg.style.margin = pos==="center"?"0 auto":pos==="left"?"0":"0 0 0 auto";
}
function setThemeColor(c) {
  document.documentElement.style.setProperty("--primary",c);
}

// ─── Expose handlers ─────────────────────────────────────────────────────────
window.showTab            = showTab;
window.calculateLoan      = calculateLoan;
window.prefillLoanForm    = prefillLoanForm;
window.loadLoans          = loadLoans;
window.toggleLoanForm     = toggleLoanForm;
window.saveLoan           = saveLoan;
window.togglePaymentModal = togglePaymentModal;
window.submitPayment      = submitPayment;
window.setLogoPosition    = setLogoPosition;
window.setThemeColor      = setThemeColor;
