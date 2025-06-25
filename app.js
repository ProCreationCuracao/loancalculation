let currentLoanIndex = null;

// ---- Tabs ----
function showTab(tab) {
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.getElementById(tab).classList.add('active');
}

// ---- Dashboard ----
let pieChart, barChart;
function updateDashboard() {
  const loans = JSON.parse(localStorage.getItem('loans')||'[]');
  document.getElementById('totalCustomers').textContent = loans.length;
  const loaned = loans.reduce((s,l)=>s+l.amount,0);
  const due = loans.reduce((s,l)=>s+(l.amount*1.25*l.duration - l.paid),0);
  const active = loans.filter(l=>l.status==='active').length;
  document.getElementById('totalLoaned').textContent = loaned.toFixed(2)+' XCG';
  document.getElementById('totalDue').textContent = due.toFixed(2)+' XCG';
  document.getElementById('countActive').textContent = active;
  renderCharts([loaned,due],[active,loans.filter(l=>l.status==='completed').length]);
}
function renderCharts(pieData,barData){
  const pCtx = document.getElementById('pieChart').getContext('2d');
  const bCtx = document.getElementById('barChart').getContext('2d');
  if(pieChart) pieChart.destroy(); if(barChart) barChart.destroy();
  pieChart = new Chart(pCtx, {
    type:'pie',
    data:{ labels:['Loaned','Due'], datasets:[{ data:pieData, backgroundColor:['#263238','#ec407a'] }] }
  });
  barChart = new Chart(bCtx, {
    type:'bar',
    data:{ labels:['Active','Completed'], datasets:[{ data:barData, backgroundColor:['#42a5f5','#66bb6a'] }] }
  });
}

// ---- Calculator ----
function calculateLoan(){
  const amt = parseFloat(document.getElementById('calcAmount').value);
  const m = parseInt(document.getElementById('calcMonths').value);
  if(!amt||!m) return;
  const interest = amt*0.25*m, total = amt+interest, monthly = total/m;
  document.getElementById('calcInterest').textContent = interest.toFixed(2);
  document.getElementById('calcTotal').textContent = total.toFixed(2);
  document.getElementById('calcMonthly').textContent = monthly.toFixed(2);
  document.getElementById('calcResults').style.display='block';
}

// ---- Loan Creation ----
function prefillLoanForm(){
  document.getElementById('amount').value = document.getElementById('calcAmount').value;
  document.getElementById('duration').value = document.getElementById('calcMonths').value;
  toggleLoanForm(true);
}
function toggleLoanForm(show){
  document.getElementById('loanModal').style.display = show ? 'block' : 'none';
}
function saveLoan(){
  const loan = {
    name:document.getElementById('name').value,
    phone:document.getElementById('phone').value,
    amount:parseFloat(document.getElementById('amount').value),
    duration:parseInt(document.getElementById('duration').value),
    startDate:document.getElementById('startDate').value,
    paid:0,
    status:'active'
  };
  const loans = JSON.parse(localStorage.getItem('loans')||'[]');
  loans.push(loan);
  localStorage.setItem('loans', JSON.stringify(loans));
  toggleLoanForm(false);
  loadLoans();
  updateDashboard();
}

// ---- Loans List & Payment ----
function loadLoans(){
  const list = document.getElementById('loanList');
  list.innerHTML = '';
  const loans = JSON.parse(localStorage.getItem('loans')||'[]');
  loans.forEach((l,i)=>{
    const totalDue = l.amount*1.25*l.duration;
    const remaining = (totalDue-l.paid).toFixed(2);
    const card = document.createElement('div');
    card.className='loan-card';
    card.innerHTML=`
      <div class="loan-card-title">${l.name}</div>
      <div class="loan-card-details">
        Amt: ${l.amount} XCG | Dur: ${l.duration}m<br>
        Paid: ${l.paid.toFixed(2)} | Rem: ${remaining} | Status: ${l.status}
      </div>
      <button onclick="togglePaymentModal(true,${i})">Pay</button>
    `;
    list.appendChild(card);
  });
}
function togglePaymentModal(show,i=0){
  document.getElementById('paymentModal').style.display = show ? 'block' : 'none';
  currentLoanIndex = i;
}
function submitPayment(){
  const amt = parseFloat(document.getElementById('paymentAmount').value);
  const loans = JSON.parse(localStorage.getItem('loans')||'[]');
  loans[currentLoanIndex].paid += amt;
  const totalDue = loans[currentLoanIndex].amount*1.25*loans[currentLoanIndex].duration;
  if(loans[currentLoanIndex].paid >= totalDue) loans[currentLoanIndex].status = 'completed';
  localStorage.setItem('loans', JSON.stringify(loans));
  togglePaymentModal(false);
  loadLoans();
  updateDashboard();
}

// ---- Settings ----
function setLogoPosition(pos){
  const lg = document.getElementById('logo');
  lg.style.margin = pos==='center'
    ? '0 auto' : pos==='left' ? '0 0 0 0' : '0 0 0 auto';
  localStorage.setItem('logoPos', pos);
}
function setThemeColor(c){
  document.documentElement.style.setProperty('--primary', c);
  localStorage.setItem('themeColor', c);
}

// ---- Init ----
document.addEventListener('DOMContentLoaded', ()=>{
  showTab('dashboard');
  const lp = localStorage.getItem('logoPos') || 'center';
  setLogoPosition(lp);
  const tc = localStorage.getItem('themeColor') || '#ec407a';
  setThemeColor(tc);
  loadLoans();
  updateDashboard();
});
