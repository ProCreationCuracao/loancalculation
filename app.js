const sb = window.sb;
let pieChart, barChart;
let defaultInterestRate = 0.25;
let _allLoans = [], _paymentsMap = {};
let expandedLoanIds = new Set(), currentLoanId = null;

document.addEventListener("DOMContentLoaded", async () => {
  // Load saved rate
  const saved = localStorage.getItem("interestRate");
  if (saved) defaultInterestRate = parseFloat(saved);
  document.getElementById("interestRateInput").value = defaultInterestRate * 100;

  // Initialize tabs
  selectTab("dashboard", document.getElementById("segDash"));

  // Click-away to close modals
  document.querySelectorAll(".modal").forEach(modal => {
    modal.addEventListener("click", e => {
      if (e.target === modal) {
        if (modal.id === "loanModal") toggleLoanForm(false);
        else if (modal.id === "paymentModal") togglePaymentModal(false);
      }
    });
  });

  await loadAllData();
  updateDashboard();
});

function selectTab(id, btn) {
  document.querySelectorAll(".segmented-control button").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  document.querySelector(".fab").style.display = (id === "loans") ? "block" : "none";
}

async function loadAllData() {
  let { data: loans } = await sb.from("loans").select("*").order("start_date",{ascending:false});
  _allLoans = loans||[];
  let { data: payments } = await sb.from("payments").select("*").order("date",{ascending:true});
  _paymentsMap = {};
  (payments||[]).forEach(p => (_paymentsMap[p.loan_id]||=[]).push(p));
  applyFilters();
}

async function updateDashboard() {
  const loans = _allLoans;
  document.getElementById("totalCustomers").textContent = loans.length;
  const loaned = loans.reduce((s,l)=>s+l.amount,0);
  const dueAmt = loans.reduce((s,l)=>{
    const initInt = l.amount*defaultInterestRate*l.duration;
    const initTot = l.amount+initInt;
    const paidSum = (_paymentsMap[l.id]||[]).reduce((s,p)=>s+p.amount,0);
    return s+(initTot-paidSum);
  },0);
  const activeCt = loans.filter(l=>l.status==="active").length;
  document.getElementById("totalLoaned").textContent = loaned.toFixed(2)+" XCG";
  document.getElementById("totalDue").textContent    = dueAmt.toFixed(2)+" XCG";
  document.getElementById("countActive").textContent= activeCt;

  const pCtx = document.getElementById("pieChart").getContext("2d");
  const bCtx = document.getElementById("barChart").getContext("2d");
  if (pieChart) pieChart.destroy();
  if (barChart) barChart.destroy();
  pieChart = new Chart(pCtx,{type:"pie",data:{labels:["Loaned","Due"],datasets:[{data:[loaned,dueAmt],backgroundColor:["#263238","#ec407a"]}]}});  
  barChart = new Chart(bCtx,{type:"bar",data:{labels:["Active","Completed"],datasets:[{data:[activeCt,loans.filter(l=>l.status==="completed").length],backgroundColor:["#42a5f5","#66bb6a"]}]}});  
}

function buildSchedule(principal, rate, months) {
  let totalDue = principal + principal*rate;
  const sched = [];
  for (let m=1; m<=months; m++){
    const left = months-m+1;
    const payment = totalDue/left;
    const rem = totalDue-payment;
    const nextInt = m<months? rem*rate:0;
    const nextTot = rem+nextInt;
    sched.push({ month:m, payment, nextInt });
    totalDue = nextTot;
  }
  return sched;
}

function calculateLoan(){
  const amt = parseFloat(document.getElementById("calcAmount").value);
  const months = parseInt(document.getElementById("calcMonths").value,10);
  if(!amt||!months) return;

  const sched = buildSchedule(amt,defaultInterestRate,months);
  const totalPaid = sched.reduce((s,r)=>s+r.payment,0);
  const totalInterest = totalPaid-amt;

  document.getElementById("calcInterest").textContent = totalInterest.toFixed(2);
  document.getElementById("calcTotal").textContent    = totalPaid.toFixed(2);
  document.getElementById("calcMonthly").textContent  = (totalPaid/months).toFixed(2);
  document.getElementById("calcResults").style.display="grid";

  let html=`<table><thead><tr><th>Mo</th><th>Payment</th><th>Interest</th></tr></thead><tbody>`;
  sched.forEach(r=>{
    html+=`<tr><td>${r.month}</td><td>${r.payment.toFixed(2)}</td><td>${r.nextInt.toFixed(2)}</td></tr>`;
  });
  html+=`</tbody></table>`;
  document.getElementById("calcSchedule").innerHTML=html;
  document.getElementById("calcTotalInterest").textContent=`Total Interest Earned: ${totalInterest.toFixed(2)} XCG`;
}

function prefillLoanForm(){
  document.getElementById("amount").value   = document.getElementById("calcAmount").value;
  document.getElementById("duration").value = document.getElementById("calcMonths").value;
  toggleLoanForm(true);
}

function applyFilters(){
  const term = document.getElementById("loanSearch").value.trim().toLowerCase();
  const status = document.getElementById("statusFilter").value;
  const c = document.getElementById("loanList"); c.innerHTML="";
  _allLoans.forEach(l=>{
    const payments = _paymentsMap[l.id]||[];
    const paidSum = payments.reduce((s,p)=>s+p.amount,0);
    const initInt = l.amount*defaultInterestRate*l.duration;
    const initTot = l.amount+initInt;
    const rem = initTot-paidSum;
    const dueDate = new Date(l.start_date); dueDate.setMonth(dueDate.getMonth()+l.duration);
    const isOver = new Date()>dueDate && l.status!=="completed";
    const disp = isOver?"overdue":l.status;
    if(status!=="all"&&disp!==status) return;
    if(term&&!l.name.toLowerCase().includes(term)) return;

    const card=document.createElement("div");
    card.className="loan-card"; if(expandedLoanIds.has(l.id)) card.classList.add("expanded");
    card.innerHTML=`<div class="loan-card-title">${l.name}</div>
      <div class="loan-card-details">
        <p><strong>Paid:</strong> ${paidSum.toFixed(2)} XCG</p>
        <p><strong>Rem:</strong>  ${rem.toFixed(2)} XCG</p>
        <button onclick="event.stopPropagation(); togglePaymentModal(true,'${l.id}')">Pay</button>
      </div>
      <div class="breakdown">
        <p><strong>Interest on rem (25%):</strong> ${(rem*defaultInterestRate).toFixed(2)} XCG</p>
        <p><strong>Next Due:</strong> ${(rem+rem*defaultInterestRate).toFixed(2)} XCG</p>
        <p><strong>Status:</strong> ${disp}</p><hr>
        ${payments.map(p=>`<p>● [${p.date}] ${p.amount.toFixed(2)}</p>`).join("")}
      </div>`;
    card.onclick=()=>{ const o=card.classList.toggle("expanded"); o? expandedLoanIds.add(l.id): expandedLoanIds.delete(l.id) };
    c.appendChild(card);
  });
}

function toggleLoanForm(show){
  document.getElementById("loanModal").classList.toggle("show",!!show);
  const fab=document.querySelector(".fab");
  if(show) fab.style.display="none";
  else fab.style.display=document.getElementById("loans").classList.contains("active")?"block":"none";
}

async function saveLoan(){
  const loan={
    name:document.getElementById("name").value,
    phone:document.getElementById("phone").value,
    amount:+document.getElementById("amount").value,
    duration:+document.getElementById("duration").value,
    start_date:document.getElementById("startDate").value,
    paid:0,status:"active"
  };
  const {error}=await sb.from("loans").insert([loan]);
  if(error) return alert(error.message);
  toggleLoanForm(false); await loadAllData(); updateDashboard();
}

function togglePaymentModal(show,id){
  document.getElementById("paymentModal").classList.toggle("show",!!show);
  currentLoanId=id||currentLoanId;
  if(show){
    document.getElementById("paymentAmount").value="";
    document.getElementById("paymentDate").value=new Date().toISOString().slice(0,10);
  }
}

async function submitPayment(){
  const amt=+document.getElementById("paymentAmount").value;
  const date=document.getElementById("paymentDate").value;
  const {error}=await sb.from("payments").insert([{loan_id:currentLoanId,amount:amt,date}]);
  if(error) return alert(error.message);
  togglePaymentModal(false); await loadAllData(); updateDashboard();
}

function setInterestRate(v){
  defaultInterestRate=parseFloat(v)/100;
  localStorage.setItem("interestRate",defaultInterestRate);
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
