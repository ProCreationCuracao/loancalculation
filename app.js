const sb = window.sb;
let pieChart, barChart;
let defaultInterestRate = 0.25;
let _allLoans = [], _paymentsMap = {};
let expandedLoanIds = new Set(), currentLoanId = null;

// ─── INIT ────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  console.log("⚙️ DOMContentLoaded");

  // 1) Interest rate
  const savedRate = localStorage.getItem("interestRate");
  if (savedRate) defaultInterestRate = parseFloat(savedRate);
  const irIn = document.getElementById("interestRateInput");
  console.log("→ interestRateInput:", irIn);
  if (irIn) irIn.value = defaultInterestRate * 100;

  // 2) Cash on hand
  const cashInput = document.getElementById("cashOnHandInput");
  console.log("→ cashOnHandInput:", cashInput);
  if (cashInput) {
    const savedCash = localStorage.getItem("cashOnHand");
    cashInput.value = savedCash !== null ? savedCash : "";
    cashInput.addEventListener("input", e => {
      localStorage.setItem("cashOnHand", e.target.value);
      updateDashboard();
    });
  }

  // 3) Late fee
  const lateFeeInput = document.getElementById("lateFeeInput");
  console.log("→ lateFeeInput:", lateFeeInput);
  if (lateFeeInput) {
    lateFeeInput.value = localStorage.getItem("lateFee") || "10";
    lateFeeInput.addEventListener("input", e => {
      localStorage.setItem("lateFee", e.target.value);
    });
  }

  // 4) “I agree” checkbox
  const agreeChk  = document.getElementById("agreeRules");
  const submitBtn = document.getElementById("submitLoanBtn");
  console.log("→ agreeRules:", agreeChk, "submitLoanBtn:", submitBtn);
  if (agreeChk && submitBtn) {
    agreeChk.addEventListener("change", () => {
      submitBtn.disabled = !agreeChk.checked;
    });
    submitBtn.disabled = true;
  }

  // 5) Tabs & modal click-away
  console.log("→ segDash:", document.getElementById("segDash"));
  selectTab("dashboard", document.getElementById("segDash"));
  document.querySelectorAll(".modal").forEach(m =>
    m.addEventListener("click", e => {
      if (e.target === m) m.classList.remove("show");
    })
  );

  // 6) Delegate clicks in loanList
  const loanList = document.getElementById("loanList");
  console.log("→ loanList:", loanList);
  if (loanList) {
    loanList.addEventListener("click", loanListClickHandler);
  }

  // 7) Load & render
  await loadAllData();
  updateDashboard();
});

// ─── RESET ───────────────────────────────────────────────────────────
window.resetAllData = () => {
  if (!confirm("Really clear all loans & payments?")) return;
  localStorage.clear();
  location.reload();
};

// ─── TABS ────────────────────────────────────────────────────────────
function selectTab(id, btn) {
  if (!btn) return console.warn(`selectTab: button #seg${id} not found`);
  document.querySelectorAll(".segmented-control button")
    .forEach(b => b.classList.remove("active"));
  btn.classList.add("active");

  document.querySelectorAll(".tab")
    .forEach(t => t.classList.remove("active"));
  const sec = document.getElementById(id);
  if (!sec) return console.warn(`selectTab: section #${id} not found`);
  sec.classList.add("active");

  const fab = document.querySelector(".fab");
  if (fab) fab.style.display = (id === "loans") ? "block" : "none";
}

// ─── LOAD DATA ──────────────────────────────────────────────────────
async function loadAllData() {
  console.log("⏳ loadAllData");
  const loansRes = await sb.from("loans").select("*").order("start_date", { ascending:false });
  _allLoans = loansRes.data || [];
  console.log("→ loans:", _allLoans.length);

  const payRes = await sb.from("payments").select("*").order("date",{ ascending:true });
  const payments = payRes.data || [];
  console.log("→ payments:", payments.length);

  _paymentsMap = {};
  for (const p of payments) {
    if (!_paymentsMap[p.loan_id]) _paymentsMap[p.loan_id] = [];
    _paymentsMap[p.loan_id].push(p);
  }

  applyFilters();
}

// ─── DASHBOARD ───────────────────────────────────────────────────────
async function updateDashboard() {
  console.log("⏱ updateDashboard");
  const cashEl = document.getElementById("cashOnHand");
  console.log("→ cashEl:", cashEl);
  const cash = parseFloat(localStorage.getItem("cashOnHand"))||0;
  if (cashEl) cashEl.textContent = cash.toFixed(2)+" XCG";

  // metrics
  let loaned=0, due=0, expInt=0, act=0, ovd=0, cmp=0;
  const today = new Date();
  for (const l of _allLoans) {
    loaned += l.amount;
    const initInt = l.amount * defaultInterestRate * l.duration;
    const initTot = l.amount + initInt;
    const paidSum = (_paymentsMap[l.id]||[]).reduce((s,p)=>s+p.amount,0);
    const rem     = initTot - paidSum;

    due   += rem;
    expInt+= rem - (l.amount - paidSum);

    const dueDate = new Date(l.start_date);
    dueDate.setMonth(dueDate.getMonth()+l.duration);
    if (paidSum>=initTot) cmp++;
    else {
      act++;
      if (today>dueDate) ovd++;
    }
  }
  console.log({ loaned,due,expInt,act,cmp,ovd });

  const ids = ["totalLoaned","totalDue","expectedInterest","countActive","countCompleted","countOverdue"];
  [ 
    loaned.toFixed(2)+" XCG",
    due.toFixed(2)+" XCG",
    expInt.toFixed(2)+" XCG",
    act, cmp, ovd
  ].forEach((val,i)=>{
    const el = document.getElementById(ids[i]);
    if (el) el.textContent = val;
    else console.warn(`missing #${ids[i]}`);
  });

  // charts
  try {
    const pCtx = document.getElementById("pieChart").getContext("2d");
    const bCtx = document.getElementById("barChart").getContext("2d");
    if (pieChart) pieChart.destroy();
    if (barChart) barChart.destroy();

    pieChart = new Chart(pCtx, {
      type:"pie",
      data:{ labels:["Loaned","Due"], datasets:[{ data:[loaned,due], backgroundColor:["#263238","#ec407a"] }] }
    });
    barChart = new Chart(bCtx, {
      type:"bar",
      data:{ labels:["Active","Completed","Overdue"], datasets:[{ data:[act,cmp,ovd], backgroundColor:["#42a5f5","#66bb6a","#e53935"] }] },
      options:{ scales:{ y:{ beginAtZero:true } } }
    });
  } catch(err) {
    console.error("Chart.js error:", err);
  }
}

// ─── CALCULATOR ─────────────────────────────────────────────────────
function buildSchedule(principal,rate,months) {
  let total = principal + principal*rate;
  const sched=[];
  for (let m=1; m<=months; m++){
    const payment=total/(months-m+1),
          nextInt=(total-payment)*rate;
    sched.push({month:m,payment,nextInt});
    total=(total-payment)+(total-payment)*rate;
  }
  return sched;
}
function calculateLoan() {
  const amt    = parseFloat(document.getElementById("calcAmount").value),
        months = parseInt(document.getElementById("calcMonths").value,10);
  if (!amt||!months) return;

  const sched = buildSchedule(amt,defaultInterestRate,months),
        paid  = sched.reduce((s,r)=>s+r.payment,0),
        intt  = paid-amt;
  document.getElementById("calcInterest").textContent=intt.toFixed(2);
  document.getElementById("calcTotal"   ).textContent=paid.toFixed(2);
  document.getElementById("calcMonthly" ).textContent=(paid/months).toFixed(2);
  document.getElementById("calcResults" ).style.display="grid";

  const schEl=document.getElementById("calcSchedule"); schEl.innerHTML="";
  const wrap=document.createElement("div"); wrap.className="schedule-cards";
  sched.forEach(r=>{
    const card=document.createElement("div"); card.className="schedule-card";
    card.innerHTML=
      `<div class="card-month">Month ${r.month}</div>`+
      `<div class="card-detail"><strong>Payment:</strong> ${r.payment.toFixed(2)} XCG</div>`+
      `<div class="card-detail"><strong>Interest:</strong> ${r.nextInt.toFixed(2)} XCG</div>`;
    wrap.appendChild(card);
  });
  schEl.appendChild(wrap);
  document.getElementById("calcTotalInterest").textContent=
    "Total Interest Earned: "+intt.toFixed(2)+" XCG";
}
function prefillLoanForm(){
  document.getElementById("amount"  ).value=document.getElementById("calcAmount").value;
  document.getElementById("duration").value=document.getElementById("calcMonths").value;
  toggleLoanForm(true);
}

// ─── NEW LOAN ───────────────────────────────────────────────────────
function toggleLoanForm(show){
  const m=document.getElementById("loanModal");
  m.classList.toggle("show",!!show);
  const fab=document.querySelector(".fab");
  if(fab) fab.style.display= show?"none":document.getElementById("loans").classList.contains("active")?"block":"none";
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
  const res=await sb.from("loans").insert([loan]);
  if(res.error) return alert(res.error.message);
  toggleLoanForm(false);
  await loadAllData();
}

// ─── PAYMENTS ────────────────────────────────────────────────────────
function togglePaymentModal(show,id){
  currentLoanId=id||currentLoanId;
  const m=document.getElementById("paymentModal");
  m.classList.toggle("show",!!show);
  if(show){
    document.getElementById("paymentAmount").value="";
    document.getElementById("paymentDate"  ).value=new Date().toISOString().slice(0,10);
  }
}
async function submitPayment(){
  const amt=parseFloat(document.getElementById("paymentAmount").value),
        date=document.getElementById("paymentDate").value;
  if(!amt||!date) return alert("Please enter both date and amount.");
  const res=await sb.from("payments").insert([{loan_id:currentLoanId,amount:amt,date}]);
  if(res.error) return alert(res.error.message);
  togglePaymentModal(false);
  expandedLoanIds.add(currentLoanId);
  await loadAllData();
}

// ─── LOAN LIST CLICK HANDLER ─────────────────────────────────────────
function loanListClickHandler(e){
  const card=e.target.closest(".loan-card");
  if(!card) return;
  const id=card.getAttribute("data-loan-id");
  if(e.target.closest(".loan-card-header")){
    // expand
    if(expandedLoanIds.has(id)) expandedLoanIds.delete(id);
    else expandedLoanIds.add(id);
    applyFilters();
    return;
  }
  if(e.target.closest(".pay-btn")){
    togglePaymentModal(true,id);
  }
}

// ─── RENDER LOANS ────────────────────────────────────────────────────
function applyFilters(){
  const term=document.getElementById("loanSearch").value.trim().toLowerCase(),
        status=document.getElementById("statusFilter").value,
        container=document.getElementById("loanList");
  container.innerHTML="";

  for(const l of _allLoans){
    const origInt=l.amount*defaultInterestRate*l.duration,
          totDue=l.amount+origInt,
          pmts=_paymentsMap[l.id]||[],
          paidSum=pmts.reduce((s,p)=>s+p.amount,0),
          d=new Date(l.start_date);
    d.setMonth(d.getMonth()+l.duration);
    const dueStr=d.toISOString().slice(0,10),
          dispSt= paidSum>=totDue?"completed":"active";

    if(status!=="all"&&dispSt!==status) continue;
    if(term&&!l.name.toLowerCase().includes(term)) continue;

    const id=l.id.toString(),
          expanded=expandedLoanIds.has(id),
          card=document.createElement("div");
    card.className="loan-card"+(expanded?" expanded":"");
    card.setAttribute("data-loan-id",id);

    // header
    const hdr=document.createElement("div");
    hdr.className="loan-card-header";
    hdr.innerHTML=`<span class="loan-name">${l.name}</span><span class="status-pill ${dispSt}">${dispSt}</span>`;
    card.appendChild(hdr);

    // body
    const body=document.createElement("div");
    body.className="loan-card-body";
    [
      ["Loan Amount:",l.amount.toFixed(2)+" XCG"],
      ["Interest:",origInt.toFixed(2)+" XCG"],
      ["Repay Total:",totDue.toFixed(2)+" XCG"],
      ["Repay Date:",dueStr]
    ].forEach(pair=>{
      const fld=document.createElement("div");
      fld.className="field";
      fld.innerHTML=`<span>${pair[0]}</span><span>${pair[1]}</span>`;
      body.appendChild(fld);
    });

    const btn=document.createElement("button");
    btn.className="pay-btn";
    btn.textContent="Pay";
    body.appendChild(btn);

    if(pmts.length){
      body.appendChild(document.createElement("hr"));
      [
        ["Paid So Far:",paidSum.toFixed(2)+" XCG"],
        ["Remaining:",(totDue-paidSum).toFixed(2)+" XCG"],
        ["New Interest:",((totDue-paidSum)*defaultInterestRate).toFixed(2)+" XCG"],
        ["New Total:",((totDue-paidSum)*(1+defaultInterestRate)).toFixed(2)+" XCG"]
      ].forEach(pair=>{
        const fld=document.createElement("div");
        fld.className="field";
        fld.innerHTML=`<span>${pair[0]}</span><span>${pair[1]}</span>`;
        body.appendChild(fld);
      });
    }

    body.style.display=expanded?"block":"none";
    card.appendChild(body);
    container.appendChild(card);
  }
}

// ─── RULES & TERMS ─────────────────────────────────────────────────
// after your existing initRulesEditor IIFE, replace the alert(...) with:
document.getElementById("saveRulesBtn").addEventListener("click", () => {
  localStorage.setItem("loanRules", document.getElementById("rulesEditor").value);
  showToast("Rules saved!");
});

// Toast helper (place this near the bottom of your JS file)
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2000);
}
// after your existing initRulesEditor IIFE, replace the alert(...) with:
document.getElementById("saveRulesBtn").addEventListener("click", () => {
  localStorage.setItem("loanRules", document.getElementById("rulesEditor").value);
  showToast("Rules saved!");
});

// Toast helper (place this near the bottom of your JS file)
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2000);
}


// ─── SETTINGS HELPERS ─────────────────────────────────────────────
function setInterestRate(v){
  defaultInterestRate=parseFloat(v)/100;
  localStorage.setItem("interestRate",defaultInterestRate);
}

// ─── EXPORT ─────────────────────────────────────────────────────────
window.selectTab=selectTab;
window.calculateLoan=calculateLoan;
window.prefillLoanForm=prefillLoanForm;
window.toggleLoanForm=toggleLoanForm;
window.saveLoan=saveLoan;
window.togglePaymentModal=togglePaymentModal;
window.submitPayment=submitPayment;
window.applyFilters=applyFilters;
window.setInterestRate=setInterestRate;
