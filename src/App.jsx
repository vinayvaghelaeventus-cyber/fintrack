import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";

// ─── THEMES ──────────────────────────────────────────────────────────────────
const DARK={income:"#10b981",expense:"#f43f5e",savings:"#6366f1",bg:"#0d0f14",card:"#161b26",border:"#232b3e",text:"#e2e8f0",muted:"#64748b",accent:"#38bdf8",warning:"#f59e0b",loan:"#a78bfa",credit:"#fb923c",surface:"#1e2535",inputBg:"#0a0c10"};
const LIGHT={income:"#059669",expense:"#e11d48",savings:"#4f46e5",bg:"#f0f4f8",card:"#ffffff",border:"#e2e8f0",text:"#0f172a",muted:"#94a3b8",accent:"#0284c7",warning:"#d97706",loan:"#7c3aed",credit:"#ea580c",surface:"#f8fafc",inputBg:"#f1f5f9"};

const PAYMENT_MODES=["UPI","Credit Card","Debit Card","Cash","Net Banking","Wallet","EMI","Other"];
const CATEGORIES={income:["Salary","Freelance","Investment","Gift","Rental","Bonus","Other Income"],expense:["Housing","Food","Transport","Entertainment","Health","Shopping","Utilities","Education","Loan EMI","Credit Card Bill","Insurance","Travel","Medical","Groceries","Other"]};
const CAT_COLORS=["#38bdf8","#10b981","#f59e0b","#6366f1","#f43f5e","#a78bfa","#34d399","#fb923c","#e879f9","#22d3ee","#84cc16","#f472b6","#60a5fa","#fbbf24","#6ee7b7"];
const TABS=["Dashboard","Plan & Health","Credit Cards","Transactions","Budget","Savings","Future Goals","Insights"];
const RECUR_FREQS=["Weekly","Monthly","Quarterly","Yearly"];
const ASSET_TYPES=["Cash","Bank Account","Fixed Deposit","Mutual Fund","Stocks","Gold","Real Estate","Vehicle","Other"];
const EMPTY_DEBT={type:"loan",name:"",lender:"",bank:"",totalAmount:"",outstanding:"",emi:"",dueDate:"",interestRate:"",tenure:"",notes:""};
const EMPTY_CC={name:"",bank:"",limit:"",outstanding:"",minDue:"",statementDate:"",dueDate:"",interestRate:"36",notes:""};
const EMPTY_TX={type:"expense",amount:"",category:"Food",paymentMode:"UPI",bank:"",note:"",date:new Date().toISOString().split("T")[0]};

function fc(n){return new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(n||0);}
function fd(d){if(!d)return"—";try{return new Date(d).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"});}catch{return"—";}}
function daysUntil(ds){if(!ds)return null;const d=new Date(ds),t=new Date();t.setHours(0,0,0,0);d.setHours(0,0,0,0);return Math.ceil((d-t)/(864e5));}
function toCSV(rows,headers){return[headers.join(","),...rows.map(r=>headers.map(h=>`"${String(r[h]??"")}"`).join(","))].join("\n");}
function downloadCSV(c,f){const a=document.createElement("a");a.href="data:text/csv;charset=utf-8,"+encodeURIComponent(c);a.download=f;a.click();}

// ─── MATH ────────────────────────────────────────────────────────────────────
function calcMonths(outstanding,emi,rate){
  if(!outstanding||!emi)return null;
  const r=(rate||0)/100/12;
  if(r===0)return Math.ceil(outstanding/emi);
  let b=parseFloat(outstanding),m=0;
  while(b>0&&m<600){b=b*(1+r)-parseFloat(emi);m++;}
  return m>599?null:m;
}
function calcPayoffPlan(debts,extra,strategy){
  if(!debts.length)return[];
  const sorted=strategy==="avalanche"?[...debts].sort((a,b)=>(parseFloat(b.interestRate)||0)-(parseFloat(a.interestRate)||0)):[...debts].sort((a,b)=>(parseFloat(a.outstanding)||0)-(parseFloat(b.outstanding)||0));
  let xtra=parseFloat(extra)||0,results=[];
  for(let i=0;i<sorted.length;i++){
    const d=sorted[i];
    const bal=parseFloat(d.outstanding)||0,emi=parseFloat(d.emi)||0,rate=parseFloat(d.interestRate)||0;
    const norm=calcMonths(bal,emi,rate);
    const boost=calcMonths(bal,emi+xtra,rate);
    const saved=norm&&boost?Math.max(0,norm-boost):0;
    const iSaved=saved>0?Math.max(0,(emi*norm-bal)-(( emi+xtra)*boost-bal)):0;
    results.push({...d,bal,normalMonths:norm,boostedMonths:boost,monthsSaved:saved,interestSaved:iSaved,priority:i+1,extraApplied:xtra});
    xtra+=emi;
  }
  return results;
}
function calcHealthScore({income,emi,expense,outstanding,savings,emergency}){
  if(!income)return{score:0,grade:"F",color:"#f43f5e",items:[]};
  const dti=emi/income,sr=Math.max(0,(income-expense)/income),db=outstanding>0?Math.min(2,outstanding/(income*12)):0,ef=Math.min(1,emergency/6);
  const s1=dti<0.2?30:dti<0.35?20:dti<0.5?10:0;
  const s2=sr>0.2?25:sr>0.1?17:sr>0?8:0;
  const s3=db<0.5?25:db<1?15:db<1.5?8:0;
  const s4=ef>=1?20:ef>=0.5?13:ef>0?6:0;
  const score=s1+s2+s3+s4;
  const grade=score>=85?"A":score>=70?"B":score>=50?"C":score>=30?"D":"F";
  const color=score>=70?"#10b981":score>=50?"#f59e0b":"#f43f5e";
  return{score,grade,color,items:[
    {label:"Debt-to-Income",score:s1,max:30,tip:`${(dti*100).toFixed(0)}% of income on EMIs (ideal <20%)`},
    {label:"Savings Rate",score:s2,max:25,tip:`${(sr*100).toFixed(0)}% saved (ideal >20%)`},
    {label:"Debt Burden",score:s3,max:25,tip:`Debt = ${(db*100).toFixed(0)}% of annual income`},
    {label:"Emergency Fund",score:s4,max:20,tip:`${emergency.toFixed(1)} months covered (ideal 6)`},
  ]};
}

// ─── CC BILL CALCULATOR ──────────────────────────────────────────────────────
function calcCCDetails(cc){
  const outstanding=parseFloat(cc.outstanding)||0;
  const limit=parseFloat(cc.limit)||1;
  const rate=parseFloat(cc.interestRate)||36;
  const minDue=parseFloat(cc.minDue)||Math.max(250,outstanding*0.05);
  const utilization=(outstanding/limit)*100;
  const fullPaymentSaving=outstanding*(rate/100/12); // interest saved by paying full
  const daysLeft=daysUntil(cc.dueDate);
  const idealPayment=Math.min(outstanding,outstanding); // pay full
  const status=utilization>80?"danger":utilization>40?"warning":"good";
  return{outstanding,limit,minDue,utilization,fullPaymentSaving,daysLeft,idealPayment:outstanding,status,rate};
}

export default function App(){
  const [darkMode,setDarkMode]=useState(true);
  const C=darkMode?DARK:LIGHT;
  const [tab,setTab]=useState("Dashboard");
  const [mobileMenuOpen,setMobileMenuOpen]=useState(false);

  // Data
  const [transactions,setTransactions]=useState([]);
  const [debts,setDebts]=useState([]);
  const [creditCards,setCreditCards]=useState([]);
  const [savings,setSavings]=useState([]);
  const [budgets,setBudgets]=useState({});
  const [banks,setBanks]=useState(["SBI","HDFC","ICICI","Axis","Kotak"]);
  const [loaded,setLoaded]=useState(false);
  const [lastSaved,setLastSaved]=useState(null);

  // Plan
  const [monthlyIncome,setMonthlyIncome]=useState("");
  const [extraFund,setExtraFund]=useState("");
  const [strategy,setStrategy]=useState("avalanche");
  const [emergencyFund,setEmergencyFund]=useState("");
  const [aiAdvice,setAiAdvice]=useState("");
  const [aiLoading,setAiLoading]=useState(false);

  // Forms
  const [showTxForm,setShowTxForm]=useState(false);
  const [showDebtForm,setShowDebtForm]=useState(false);
  const [showCCForm,setShowCCForm]=useState(false);
  const [showImport,setShowImport]=useState(false);
  const [editDebt,setEditDebt]=useState(null);
  const [editCC,setEditCC]=useState(null);
  const [markPaidId,setMarkPaidId]=useState(null);
  const [txForm,setTxForm]=useState({...EMPTY_TX});
  const [budgetForm,setBudgetForm]=useState({category:"Food",limit:""});
  const [savingsForm,setSavingsForm]=useState({name:"",goal:"",current:""});
  const [debtForm,setDebtForm]=useState({...EMPTY_DEBT});
  const [ccForm,setCcForm]=useState({...EMPTY_CC});
  const [importError,setImportError]=useState("");
  const [importPreview,setImportPreview]=useState([]);

  // Filters
  const [txSearch,setTxSearch]=useState("");
  const [txType,setTxType]=useState("all");
  const [txMode,setTxMode]=useState("all");
  const [txBank,setTxBank]=useState("all");
  const [debtFilter,setDebtFilter]=useState("all");
  const fileRef=useRef();

  // ─── STORAGE ─────────────────────────────────────────────────────────────
  const KEYS={tx:"fin3_tx",debts:"fin3_debts",cc:"fin3_cc",savings:"fin3_savings",budgets:"fin3_budgets",banks:"fin3_banks",plan:"fin3_plan",dark:"fin3_dark"};

  async function saveAll(data){
    try{
      if(data.transactions!==undefined)await window.storage.set(KEYS.tx,JSON.stringify(data.transactions));
      if(data.debts!==undefined)await window.storage.set(KEYS.debts,JSON.stringify(data.debts));
      if(data.creditCards!==undefined)await window.storage.set(KEYS.cc,JSON.stringify(data.creditCards));
      if(data.savings!==undefined)await window.storage.set(KEYS.savings,JSON.stringify(data.savings));
      if(data.budgets!==undefined)await window.storage.set(KEYS.budgets,JSON.stringify(data.budgets));
      if(data.banks!==undefined)await window.storage.set(KEYS.banks,JSON.stringify(data.banks));
      setLastSaved(new Date());
    }catch(e){}
  }

  useEffect(()=>{
    async function load(){
      try{const t=await window.storage.get(KEYS.tx);if(t)setTransactions(JSON.parse(t.value));}catch{}
      try{const d=await window.storage.get(KEYS.debts);if(d)setDebts(JSON.parse(d.value));}catch{}
      try{const c=await window.storage.get(KEYS.cc);if(c)setCreditCards(JSON.parse(c.value));}catch{}
      try{const s=await window.storage.get(KEYS.savings);if(s)setSavings(JSON.parse(s.value));}catch{}
      try{const b=await window.storage.get(KEYS.budgets);if(b)setBudgets(JSON.parse(b.value));}catch{}
      try{const bk=await window.storage.get(KEYS.banks);if(bk)setBanks(JSON.parse(bk.value));}catch{}
      try{const p=await window.storage.get(KEYS.plan);if(p){const v=JSON.parse(p.value);setMonthlyIncome(v.income||"");setExtraFund(v.extra||"");setStrategy(v.strategy||"avalanche");setEmergencyFund(v.emergency||"");setAiAdvice(v.aiAdvice||"");}}catch{}
      try{const dm=await window.storage.get(KEYS.dark);if(dm)setDarkMode(JSON.parse(dm.value));}catch{}
      setLoaded(true);
    }
    load();
  },[]);

  // Auto-save everything on any change
  useEffect(()=>{if(!loaded)return;const t=setTimeout(()=>{saveAll({transactions,debts,creditCards,savings,budgets,banks});window.storage.set(KEYS.plan,JSON.stringify({income:monthlyIncome,extra:extraFund,strategy,emergency:emergencyFund,aiAdvice})).catch(()=>{});window.storage.set(KEYS.dark,JSON.stringify(darkMode)).catch(()=>{});},800);return()=>clearTimeout(t);},[transactions,debts,creditCards,savings,budgets,banks,monthlyIncome,extraFund,strategy,emergencyFund,aiAdvice,darkMode,loaded]);

  // ─── COMPUTED ────────────────────────────────────────────────────────────
  const totalIncome=useMemo(()=>transactions.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0),[transactions]);
  const totalExpense=useMemo(()=>transactions.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0),[transactions]);
  const activeDebts=useMemo(()=>debts.filter(d=>!d.closed),[debts]);
  const totalEMI=useMemo(()=>activeDebts.reduce((s,d)=>s+(parseFloat(d.emi)||0),0),[activeDebts]);
  const totalOutstanding=useMemo(()=>activeDebts.reduce((s,d)=>s+(parseFloat(d.outstanding)||0),0),[activeDebts]);
  const totalCCOutstanding=useMemo(()=>creditCards.reduce((s,c)=>s+(parseFloat(c.outstanding)||0),0),[creditCards]);
  const totalCCMinDue=useMemo(()=>creditCards.reduce((s,c)=>s+Math.max(parseFloat(c.minDue)||0,parseFloat(c.outstanding)||0>0?250:0),0),[creditCards]);
  const effectiveIncome=parseFloat(monthlyIncome)||totalIncome||0;
  const savingsTotal=useMemo(()=>savings.reduce((s,g)=>s+g.current,0),[savings]);
  const emergencyMonths=useMemo(()=>{const ef=parseFloat(emergencyFund)||savingsTotal;const me=totalExpense||effectiveIncome*0.7||1;return ef/me;},[emergencyFund,savingsTotal,totalExpense,effectiveIncome]);
  const cashLeft=effectiveIncome-totalEMI-totalExpense;
  const payoffPlan=useMemo(()=>calcPayoffPlan(activeDebts,parseFloat(extraFund)||0,strategy),[activeDebts,extraFund,strategy]);
  const health=useMemo(()=>calcHealthScore({income:effectiveIncome,emi:totalEMI,expense:totalExpense,outstanding:totalOutstanding,savings:savingsTotal,emergency:emergencyMonths}),[effectiveIncome,totalEMI,totalExpense,totalOutstanding,savingsTotal,emergencyMonths]);
  const upcomingDues=useMemo(()=>activeDebts.filter(d=>d.dueDate).map(d=>({...d,days:daysUntil(d.dueDate),kind:"loan"})).concat(creditCards.filter(c=>c.dueDate).map(c=>({...c,days:daysUntil(c.dueDate),kind:"cc"}))).sort((a,b)=>a.days-b.days),[activeDebts,creditCards]);
  const overdueCount=upcomingDues.filter(d=>d.days<0).length;

  const expenseByMode=useMemo(()=>PAYMENT_MODES.map(m=>({name:m,value:transactions.filter(t=>t.type==="expense"&&t.paymentMode===m).reduce((s,t)=>s+t.amount,0)})).filter(d=>d.value>0),[transactions]);
  const expenseByCategory=useMemo(()=>CATEGORIES.expense.map((cat,i)=>({name:cat,value:transactions.filter(t=>t.type==="expense"&&t.category===cat).reduce((s,t)=>s+t.amount,0),color:CAT_COLORS[i]})).filter(d=>d.value>0),[transactions]);
  const last6Months=useMemo(()=>Array.from({length:6},(_,i)=>{const d=new Date();d.setMonth(d.getMonth()-(5-i));const mo=d.getMonth(),yr=d.getFullYear(),lbl=d.toLocaleDateString("en-IN",{month:"short"});const inc=transactions.filter(t=>{const td=new Date(t.date);return t.type==="income"&&td.getMonth()===mo&&td.getFullYear()===yr;}).reduce((s,t)=>s+t.amount,0);const exp=transactions.filter(t=>{const td=new Date(t.date);return t.type==="expense"&&td.getMonth()===mo&&td.getFullYear()===yr;}).reduce((s,t)=>s+t.amount,0);return{label:lbl,income:inc,expense:exp};}),[transactions]);

  const filteredTx=useMemo(()=>transactions.filter(t=>{
    if(txType!=="all"&&t.type!==txType)return false;
    if(txMode!=="all"&&t.paymentMode!==txMode)return false;
    if(txBank!=="all"&&t.bank!==txBank)return false;
    if(txSearch){const q=txSearch.toLowerCase();if(!t.category?.toLowerCase().includes(q)&&!(t.note||"").toLowerCase().includes(q)&&!String(t.amount).includes(q)&&!(t.paymentMode||"").toLowerCase().includes(q))return false;}
    return true;
  }),[transactions,txType,txMode,txBank,txSearch]);

  // ─── ACTIONS ─────────────────────────────────────────────────────────────
  function addTx(){
    if(!txForm.amount||isNaN(txForm.amount))return;
    setTransactions(p=>[{...txForm,amount:parseFloat(txForm.amount),id:Date.now()},...p]);
    setTxForm({...EMPTY_TX});setShowTxForm(false);
  }
  function deleteTx(id){setTransactions(p=>p.filter(t=>t.id!==id));}
  function addBudget(){if(!budgetForm.limit)return;setBudgets(p=>({...p,[budgetForm.category]:parseFloat(budgetForm.limit)}));setBudgetForm({category:"Food",limit:""});}
  function addGoal(){if(!savingsForm.name||!savingsForm.goal)return;setSavings(p=>[...p,{...savingsForm,goal:parseFloat(savingsForm.goal),current:parseFloat(savingsForm.current)||0,id:Date.now()}]);setSavingsForm({name:"",goal:"",current:""});}
  function updateGoal(id,delta){setSavings(p=>p.map(s=>s.id===id?{...s,current:Math.max(0,s.current+delta)}:s));}
  function saveDebt(){if(!debtForm.name)return;if(editDebt){setDebts(p=>p.map(d=>d.id===editDebt?{...debtForm,id:editDebt,closed:d.closed}:d));setEditDebt(null);}else{setDebts(p=>[...p,{...debtForm,id:Date.now(),closed:false}]);}setDebtForm({...EMPTY_DEBT});setShowDebtForm(false);}
  function saveCC(){if(!ccForm.name)return;if(editCC){setCreditCards(p=>p.map(c=>c.id===editCC?{...ccForm,id:editCC}:c));setEditCC(null);}else{setCreditCards(p=>[...p,{...ccForm,id:Date.now()}]);}setCcForm({...EMPTY_CC});setShowCCForm(false);}
  function toggleDebtClosed(id){setDebts(p=>p.map(d=>d.id===id?{...d,closed:!d.closed}:d));}
  function deleteDebt(id){setDebts(p=>p.filter(d=>d.id!==id));}
  function deleteCC(id){setCreditCards(p=>p.filter(c=>c.id!==id));}
  function recordPayment(id,amount){
    setDebts(p=>p.map(d=>{if(d.id!==id)return d;const n=Math.max(0,(parseFloat(d.outstanding)||0)-amount);return{...d,outstanding:n,closed:n===0};}));
    setTransactions(p=>{const d=debts.find(x=>x.id===id);return[{type:"expense",amount,category:"Loan EMI",paymentMode:"Net Banking",bank:d?.bank||"",note:`Payment: ${d?.name||""}`,date:new Date().toISOString().split("T")[0],id:Date.now()},...p];});
    setMarkPaidId(null);
  }
  function recordCCPayment(id,amount){
    setCreditCards(p=>p.map(c=>{if(c.id!==id)return c;return{...c,outstanding:Math.max(0,(parseFloat(c.outstanding)||0)-amount)};}));
    const cc=creditCards.find(c=>c.id===id);
    setTransactions(p=>[{type:"expense",amount,category:"Credit Card Bill",paymentMode:"Net Banking",bank:cc?.bank||"",note:`CC Payment: ${cc?.name||""}`,date:new Date().toISOString().split("T")[0],id:Date.now()},...p]);
  }

  // ─── CSV IMPORT ──────────────────────────────────────────────────────────
  function handleFileImport(e){
    const file=e.target.files[0];
    if(!file)return;
    setImportError("");setImportPreview([]);
    const reader=new FileReader();
    reader.onload=ev=>{
      try{
        const text=ev.target.result;
        const lines=text.split("\n").filter(l=>l.trim());
        if(lines.length<2){setImportError("File is empty or has no data rows.");return;}
        const headers=lines[0].split(",").map(h=>h.replace(/"/g,"").trim().toLowerCase());
        const rows=lines.slice(1).map(line=>{
          const vals=line.split(",").map(v=>v.replace(/"/g,"").trim());
          const obj={};
          headers.forEach((h,i)=>obj[h]=vals[i]||"");
          return obj;
        });
        // Try to map common CSV formats
        const mapped=rows.map((r,i)=>{
          const date=r.date||r.Date||r["transaction date"]||r.txdate||new Date().toISOString().split("T")[0];
          const amount=Math.abs(parseFloat(r.amount||r.Amount||r.debit||r.credit||r.value||0));
          const note=r.description||r.note||r.Note||r.narration||r.remarks||r.particulars||"";
          const rawType=(r.type||r.Type||"").toLowerCase();
          const debit=parseFloat(r.debit||r.Debit||0);
          const creditAmt=parseFloat(r.credit||r.Credit||0);
          let type=rawType.includes("income")||rawType.includes("credit")||creditAmt>0?"income":"expense";
          if(debit>0&&creditAmt===0)type="expense";
          const category=r.category||r.Category||guessCategory(note);
          const paymentMode=r.paymentmode||r.mode||r.Mode||"UPI";
          const bank=r.bank||r.Bank||"";
          return{id:Date.now()+i,date:formatImportDate(date),type,amount:amount||0,category,paymentMode,bank,note};
        }).filter(r=>r.amount>0);
        setImportPreview(mapped.slice(0,5));
        if(mapped.length===0){setImportError("No valid transactions found. Check your CSV format.");return;}
        setTransactions(p=>[...mapped,...p]);
        setImportError(`✅ Successfully imported ${mapped.length} transactions!`);
      }catch(err){setImportError("Could not parse file. Please use a standard bank CSV format.");}
    };
    reader.readAsText(file);
  }
  function formatImportDate(d){
    if(!d)return new Date().toISOString().split("T")[0];
    const parts=d.split(/[\/\-\.]/);
    if(parts.length===3){
      if(parts[2].length===4)return`${parts[2]}-${parts[1].padStart(2,"0")}-${parts[0].padStart(2,"0")}`;
      if(parts[0].length===4)return`${parts[0]}-${parts[1].padStart(2,"0")}-${parts[2].padStart(2,"0")}`;
    }
    try{return new Date(d).toISOString().split("T")[0];}catch{return new Date().toISOString().split("T")[0];}
  }
  function guessCategory(note){
    const n=(note||"").toLowerCase();
    if(n.includes("zomato")||n.includes("swiggy")||n.includes("restaurant")||n.includes("food"))return"Food";
    if(n.includes("uber")||n.includes("ola")||n.includes("petrol")||n.includes("fuel"))return"Transport";
    if(n.includes("amazon")||n.includes("flipkart")||n.includes("myntra"))return"Shopping";
    if(n.includes("netflix")||n.includes("prime")||n.includes("hotstar")||n.includes("spotify"))return"Entertainment";
    if(n.includes("electricity")||n.includes("water")||n.includes("gas bill")||n.includes("internet"))return"Utilities";
    if(n.includes("salary")||n.includes("payroll"))return"Salary";
    if(n.includes("rent")||n.includes("house"))return"Housing";
    if(n.includes("emi")||n.includes("loan"))return"Loan EMI";
    if(n.includes("insurance")||n.includes("premium"))return"Insurance";
    if(n.includes("hospital")||n.includes("pharmacy")||n.includes("doctor")||n.includes("medical"))return"Medical";
    return"Other";
  }
  function exportTransactions(){downloadCSV(toCSV(transactions.map(t=>({Date:t.date,Type:t.type,Category:t.category,Amount:t.amount,Mode:t.paymentMode||"",Bank:t.bank||"",Note:t.note||""})),["Date","Type","Category","Amount","Mode","Bank","Note"]),"fintrack_transactions.csv");}

  // ─── AI ADVISOR ──────────────────────────────────────────────────────────
  const getAdvice=useCallback(async()=>{
    setAiLoading(true);setAiAdvice("");
    const hasInsurance=false,hasTermLife=false,hasInvestments=false;
    const dti=effectiveIncome>0?(totalEMI/effectiveIncome*100).toFixed(0):0;
    const ccUtil=creditCards.map(c=>({name:c.name,util:((parseFloat(c.outstanding)||0)/(parseFloat(c.limit)||1)*100).toFixed(0)+"%",rate:c.interestRate+"%"}));
    const prompt=`You are a warm, expert personal finance advisor for India. This person is financially stressed with multiple loans. Be specific, compassionate, and actionable.

THEIR FINANCIAL SNAPSHOT:
- Monthly Income: ${fc(effectiveIncome)}
- Total EMIs: ${fc(totalEMI)} (${dti}% of income)
- Monthly Expenses: ${fc(totalExpense)}
- Cash Left After All: ${fc(cashLeft)}
- Total Loan Outstanding: ${fc(totalOutstanding)}
- Credit Card Outstanding: ${fc(totalCCOutstanding)}
- Financial Health Score: ${health.score}/100 (Grade ${health.grade})
- Emergency Fund: ${emergencyMonths.toFixed(1)} months

LOANS: ${activeDebts.map(d=>`${d.name} - ${fc(d.outstanding)} @ ${d.interestRate}% (EMI: ${fc(d.emi)})`).join("; ")||"None"}
CREDIT CARDS: ${creditCards.map(c=>`${c.name}/${c.bank} - Outstanding: ${fc(c.outstanding)}, Limit: ${fc(c.limit)}, Rate: ${c.interestRate}%`).join("; ")||"None"}
STRATEGY: ${strategy} method with ${fc(extraFund)} extra/month
HAS HEALTH INSURANCE: No
HAS TERM LIFE INSURANCE: No  
HAS INVESTMENTS: No

PROVIDE (use emojis, be concise, max 400 words):

## 🚨 Top 3 Urgent Actions (do this week)
Numbered, specific with ₹ amounts

## 💳 Credit Card Advice
Should they use credit cards or not given their situation? Which card to pay first? Specific advice.

## 🏁 Debt-Free Timeline
With and without the extra ₹${fc(extraFund)}/month. Specific months.

## 🛡️ After Loans: Insurance & Investment Plan
Since they have NO insurance or investments — what to prioritize after becoming debt-free:
- Term insurance: how much cover, estimated premium
- Health insurance: recommended cover
- Investment roadmap: step by step (emergency fund → SIP → etc.)

## 💡 Quick Wins to Free Up Cash
2-3 specific things they can do this month

## ❤️ Encouragement
One powerful sentence.`;
    try{
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1200,messages:[{role:"user",content:prompt}]})});
      const data=await res.json();
      if(data.content?.[0])setAiAdvice(data.content[0].text);
      else setAiAdvice("Could not generate advice. Please try again.");
    }catch{setAiAdvice("Connection error. Please check your internet and try again.");}
    setAiLoading(false);
  },[effectiveIncome,totalEMI,totalExpense,cashLeft,totalOutstanding,totalCCOutstanding,health,activeDebts,creditCards,strategy,extraFund,emergencyMonths]);

  // ─── STYLES ──────────────────────────────────────────────────────────────
  const css=`
    @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@600;700;800&display=swap');
    *{box-sizing:border-box;margin:0;padding:0;}
    html,body{overflow-x:hidden;}
    ::-webkit-scrollbar{width:3px;}::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px;}
    input,select,textarea{outline:none;-webkit-appearance:none;}
    .card{background:${C.card};border:1px solid ${C.border};border-radius:14px;padding:16px;}
    .btn{cursor:pointer;border:none;border-radius:10px;font-family:'Syne',sans-serif;font-weight:700;font-size:13px;padding:10px 18px;transition:all 0.15s;display:inline-flex;align-items:center;gap:5px;}
    .btn:active{transform:scale(0.97);}
    .btn-primary{background:${C.accent};color:#fff;}
    .btn-success{background:${C.income};color:#fff;}
    .btn-purple{background:${C.loan};color:#fff;}
    .btn-warning{background:${C.warning};color:#0d0f14;}
    .btn-ai{background:linear-gradient(135deg,#6366f1,#a78bfa);color:#fff;}
    .btn-sm{padding:6px 12px;font-size:11px;border-radius:8px;}
    .btn-danger{background:transparent;color:${C.expense};border:1px solid ${C.expense}30;font-size:11px;padding:4px 10px;cursor:pointer;border-radius:7px;font-family:'Syne',sans-serif;font-weight:700;}
    .btn-ghost{background:transparent;color:${C.muted};border:1px solid ${C.border};font-size:11px;padding:6px 12px;border-radius:8px;cursor:pointer;font-family:'Syne',sans-serif;font-weight:600;}
    .btn-ghost:active{background:${C.border};}
    .input{background:${C.inputBg};border:1px solid ${C.border};border-radius:10px;color:${C.text};padding:10px 13px;font-family:'DM Mono',monospace;font-size:13px;width:100%;}
    .input:focus{border-color:${C.accent};}
    .modal-bg{position:fixed;inset:0;background:rgba(0,0,0,0.85);backdrop-filter:blur(8px);z-index:200;display:flex;align-items:flex-end;justify-content:center;padding:0;}
    @media(min-width:640px){.modal-bg{align-items:center;padding:20px;}}
    .modal-sheet{width:100%;max-width:520px;padding:24px;background:${C.card};border:1px solid ${C.border};border-radius:20px 20px 0 0;max-height:92vh;overflow-y:auto;}
    @media(min-width:640px){.modal-sheet{border-radius:20px;}}
    .tag{display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-family:'Syne',sans-serif;font-weight:700;}
    .pbar{height:6px;background:${C.border};border-radius:3px;overflow:hidden;}
    .pfill{height:100%;border-radius:3px;transition:width 0.5s;}
    .lbl{font-size:9px;color:${C.muted};font-family:'Syne',sans-serif;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px;}
    .stitle{font-family:'Syne',sans-serif;font-weight:800;font-size:14px;color:${C.text};margin-bottom:14px;}
    .row{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid ${C.border}20;}
    .filter-btn{cursor:pointer;padding:5px 12px;border-radius:8px;font-family:'Syne',sans-serif;font-weight:600;font-size:11px;border:1px solid ${C.border};background:transparent;color:${C.muted};}
    .filter-btn.on{border-color:${C.accent};color:${C.accent};background:${C.accent}15;}
    .pulse{animation:pulse 2s infinite;}
    @keyframes pulse{0%,100%{opacity:1;}50%{opacity:0.4;}}
    .grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
    .grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;}
    @media(max-width:640px){.grid4{grid-template-columns:repeat(2,1fr);}.grid2{grid-template-columns:1fr;}}
    .ai-text{white-space:pre-wrap;font-size:13px;line-height:1.9;font-family:'DM Mono',monospace;color:${C.text};}
    .shimmer{background:linear-gradient(90deg,${C.surface} 25%,${C.border} 50%,${C.surface} 75%);background-size:200% 100%;animation:shimmer 1.5s infinite;border-radius:8px;}
    @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
    .nav-mobile{display:none;}
    @media(max-width:768px){.nav-mobile{display:flex;}.nav-desktop{display:none!important;}}
    .bottom-nav{position:fixed;bottom:0;left:0;right:0;background:${C.card};border-top:1px solid ${C.border};display:flex;z-index:100;padding-bottom:env(safe-area-inset-bottom);}
    .bottom-nav-btn{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px 4px;font-family:'Syne',sans-serif;font-weight:600;font-size:9px;color:${C.muted};cursor:pointer;border:none;background:transparent;gap:3px;}
    .bottom-nav-btn.active{color:${C.accent};}
    .fab{position:fixed;bottom:70px;right:18px;width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,${C.accent},${C.loan});border:none;cursor:pointer;font-size:22px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 20px ${C.accent}40;z-index:99;}
    @media(min-width:769px){.fab{display:none;}.bottom-nav{display:none;}}
    .stat-card{background:${C.card};border:1px solid ${C.border};border-radius:14px;padding:14px;position:relative;overflow:hidden;}
    .hero-badge{position:absolute;top:-12px;right:-12px;width:50px;height:50px;border-radius:50%;opacity:0.12;}
  `;

  function DueBadge({days}){
    if(days===null)return null;
    if(days<0)return<span className="tag" style={{background:`${C.expense}18`,color:C.expense}}>Overdue {Math.abs(days)}d</span>;
    if(days===0)return<span className="tag" style={{background:`${C.warning}18`,color:C.warning}}>Today!</span>;
    if(days<=3)return<span className="tag" style={{background:`${C.warning}18`,color:C.warning}}>{days}d left</span>;
    if(days<=7)return<span className="tag" style={{background:`${C.accent}18`,color:C.accent}}>{days}d left</span>;
    return<span className="tag" style={{background:C.surface,color:C.muted}}>{days}d</span>;
  }

  function ScoreRing({score,color,size=110}){
    const r=42,circ=2*Math.PI*r,off=circ-(score/100)*circ;
    return(
      <svg width={size} height={size} viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke={C.border} strokeWidth="9"/>
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={off} transform="rotate(-90 50 50)" style={{transition:"stroke-dashoffset 1s ease"}}/>
        <text x="50" y="46" textAnchor="middle" fill={color} fontSize="21" fontWeight="800" fontFamily="Syne">{score}</text>
        <text x="50" y="59" textAnchor="middle" fill={C.muted} fontSize="9" fontFamily="Syne">/100</text>
      </svg>
    );
  }

  const MOBILE_TABS=[
    {id:"Dashboard",icon:"🏠",label:"Home"},
    {id:"Plan & Health",icon:"🎯",label:"Plan"},
    {id:"Credit Cards",icon:"💳",label:"Cards"},
    {id:"Transactions",icon:"📋",label:"Txns"},
    {id:"Future Goals",icon:"🌱",label:"Goals"},
  ];

  // ─── RENDER ──────────────────────────────────────────────────────────────
  return(
    <div style={{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:"'DM Mono','Courier New',monospace",paddingBottom:"env(safe-area-inset-bottom)"}}>
      <style>{css}</style>

      {/* ── DESKTOP HEADER ── */}
      <div className="nav-desktop" style={{borderBottom:`1px solid ${C.border}`,padding:"10px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,background:C.bg,zIndex:50,gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:32,height:32,background:"linear-gradient(135deg,#38bdf8,#6366f1)",borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:800,color:"#fff"}}>₹</div>
          <span style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:16}}>FinTrack</span>
          {health.score>0&&<span className="tag" style={{background:health.color+"20",color:health.color}}>Health {health.score}/100</span>}
          {overdueCount>0&&<span className="pulse tag" style={{background:`${C.expense}15`,color:C.expense,cursor:"pointer"}} onClick={()=>setTab("Credit Cards")}>⚠ {overdueCount} overdue</span>}
          {lastSaved&&<span style={{fontSize:10,color:C.muted}}>✓ Saved {lastSaved.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}</span>}
        </div>
        <div style={{display:"flex",gap:2,flexWrap:"wrap"}}>
          {TABS.map(t=>(
            <button key={t} className="btn-ghost" onClick={()=>setTab(t)} style={{border:"none",background:tab===t?C.border:"transparent",color:tab===t?C.accent:C.muted,fontSize:11,padding:"6px 10px",borderRadius:8,fontFamily:"'Syne',sans-serif",fontWeight:600}}>
              {t==="Plan & Health"?"🎯 Plan":t==="Credit Cards"?"💳 Cards":t==="Future Goals"?"🌱 Goals":t}
            </button>
          ))}
        </div>
        <div style={{display:"flex",gap:6}}>
          <button className="btn-ghost btn-sm" onClick={()=>setDarkMode(p=>!p)}>{darkMode?"☀️":"🌙"}</button>
          <button className="btn-ghost btn-sm" onClick={()=>setShowImport(true)}>⬆ Import</button>
          <button className="btn-ghost btn-sm" onClick={exportTransactions}>⬇ Export</button>
          <button className="btn btn-primary btn-sm" onClick={()=>setShowTxForm(true)}>+ Add</button>
        </div>
      </div>

      {/* ── MOBILE HEADER ── */}
      <div className="nav-mobile" style={{borderBottom:`1px solid ${C.border}`,padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,background:C.bg,zIndex:50}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:30,height:30,background:"linear-gradient(135deg,#38bdf8,#6366f1)",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800}}>₹</div>
          <span style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:15}}>FinTrack</span>
          {lastSaved&&<span style={{fontSize:9,color:C.muted}}>✓ saved</span>}
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {health.score>0&&<span className="tag" style={{background:health.color+"20",color:health.color}}>{health.score}/100</span>}
          {overdueCount>0&&<span className="pulse tag" style={{background:`${C.expense}15`,color:C.expense}}>⚠{overdueCount}</span>}
          <button className="btn-ghost btn-sm" onClick={()=>setDarkMode(p=>!p)} style={{padding:"4px 8px"}}>{darkMode?"☀️":"🌙"}</button>
        </div>
      </div>

      <div style={{maxWidth:1160,margin:"0 auto",padding:"16px 14px",paddingBottom:90}}>

        {/* ══════════════ DASHBOARD ══════════════ */}
        {tab==="Dashboard"&&(
          <div>
            <div className="grid4" style={{marginBottom:14}}>
              {[
                {label:"Net Balance",value:fc(totalIncome-totalExpense),color:(totalIncome-totalExpense)>=0?C.income:C.expense},
                {label:"Total EMIs",value:fc(totalEMI),color:C.loan,sub:`${effectiveIncome>0?((totalEMI/effectiveIncome)*100).toFixed(0):0}% of income`},
                {label:"CC Outstanding",value:fc(totalCCOutstanding),color:C.credit,sub:`Min due: ${fc(totalCCMinDue)}`},
                {label:"Cash Left",value:fc(cashLeft),color:cashLeft>=0?C.income:C.expense,sub:"after EMI+expenses"},
              ].map(item=>(
                <div key={item.label} className="stat-card">
                  <div className="hero-badge" style={{background:item.color}}/>
                  <div className="lbl">{item.label}</div>
                  <div style={{fontSize:18,fontWeight:600,color:item.color,letterSpacing:"-0.5px",fontFamily:"'Syne',sans-serif"}}>{item.value}</div>
                  {item.sub&&<div style={{fontSize:10,color:C.muted,marginTop:2}}>{item.sub}</div>}
                </div>
              ))}
            </div>

            {/* Stress banner */}
            {health.score<50&&activeDebts.length>0&&(
              <div style={{marginBottom:12,padding:"12px 16px",background:`linear-gradient(135deg,${C.expense}10,${C.loan}08)`,border:`1px solid ${C.expense}25`,borderRadius:12,display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                <div>
                  <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:13,color:C.expense}}>⚡ High debt load detected</div>
                  <div style={{fontSize:11,color:C.muted}}>EMIs are {effectiveIncome>0?((totalEMI/effectiveIncome)*100).toFixed(0):0}% of income. Build your payoff plan.</div>
                </div>
                <button className="btn btn-ai btn-sm" onClick={()=>setTab("Plan & Health")}>🎯 My Plan →</button>
              </div>
            )}

            {/* Upcoming dues */}
            {upcomingDues.filter(d=>d.days<=7).length>0&&(
              <div className="card" style={{marginBottom:12,borderColor:`${C.warning}35`,background:`${C.warning}05`}}>
                <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,marginBottom:8,fontSize:12,color:C.warning}}>⏰ Due this week</div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {upcomingDues.filter(d=>d.days<=7).map(d=>(
                    <div key={d.id} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"7px 11px"}}>
                      <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:12}}>{d.name}</div>
                      <div style={{fontSize:10,color:C.muted}}>{d.kind==="cc"?`Min: ${fc(d.minDue)}`:`EMI: ${fc(d.emi)}`}</div>
                      <div style={{marginTop:3}}><DueBadge days={d.days}/></div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid2" style={{marginBottom:12}}>
              <div className="card">
                <div className="stitle">Income vs Expense</div>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={last6Months} barGap={3}>
                    <XAxis dataKey="label" tick={{fill:C.muted,fontSize:9}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fill:C.muted,fontSize:9}} axisLine={false} tickLine={false} tickFormatter={v=>`₹${v>=1000?(v/1000).toFixed(0)+"k":v}`} width={38}/>
                    <Tooltip contentStyle={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,fontSize:11}} formatter={v=>fc(v)}/>
                    <Bar dataKey="income" fill={C.income} radius={[4,4,0,0]}/>
                    <Bar dataKey="expense" fill={C.expense} radius={[4,4,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="card">
                <div className="stitle">By Payment Mode</div>
                {expenseByMode.length===0?<div style={{color:C.muted,fontSize:12,textAlign:"center",paddingTop:50}}>No data</div>:(
                  <div>
                    <ResponsiveContainer width="100%" height={100}>
                      <PieChart><Pie data={expenseByMode} dataKey="value" cx="50%" cy="50%" innerRadius={28} outerRadius={46} paddingAngle={3}>
                        {expenseByMode.map((_,i)=><Cell key={i} fill={CAT_COLORS[i%CAT_COLORS.length]}/>)}
                      </Pie></PieChart>
                    </ResponsiveContainer>
                    {expenseByMode.slice(0,4).map((d,i)=>(
                      <div key={d.name} style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                        <div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:7,height:7,borderRadius:"50%",background:CAT_COLORS[i]}}/><span style={{fontSize:10,color:C.muted}}>{d.name}</span></div>
                        <span style={{fontSize:10}}>{fc(d.value)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Quick actions */}
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
              <button className="btn btn-primary btn-sm" onClick={()=>setShowTxForm(true)}>+ Transaction</button>
              <button className="btn btn-ghost btn-sm" onClick={()=>setShowImport(true)}>⬆ Import CSV</button>
              <button className="btn btn-ghost btn-sm" onClick={()=>setTab("Plan & Health")}>🎯 Payoff Plan</button>
              <button className="btn btn-ghost btn-sm" onClick={()=>setTab("Credit Cards")}>💳 CC Bills</button>
            </div>

            {/* Recent transactions */}
            <div className="card">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div className="stitle" style={{marginBottom:0}}>Recent Transactions</div>
                <button className="btn-ghost btn-sm" onClick={()=>setTab("Transactions")} style={{border:"none",color:C.accent,background:"transparent",cursor:"pointer",fontFamily:"'Syne',sans-serif",fontWeight:600,fontSize:11}}>See all →</button>
              </div>
              {transactions.slice(0,5).map(t=>(
                <div key={t.id} className="row">
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:36,height:36,borderRadius:10,background:(t.type==="income"?C.income:C.expense)+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,flexShrink:0}}>{t.type==="income"?"↑":"↓"}</div>
                    <div>
                      <div style={{fontSize:12,fontWeight:500}}>{t.category} {t.paymentMode&&<span className="tag" style={{background:C.surface,color:C.muted,fontSize:9}}>{t.paymentMode}</span>}</div>
                      <div style={{fontSize:10,color:C.muted}}>{t.note||fd(t.date)}</div>
                    </div>
                  </div>
                  <span style={{color:t.type==="income"?C.income:C.expense,fontWeight:600,fontSize:13,flexShrink:0}}>{t.type==="income"?"+":"-"}{fc(t.amount)}</span>
                </div>
              ))}
              {transactions.length===0&&<div style={{color:C.muted,textAlign:"center",padding:30,fontSize:12}}>No transactions yet. Add one or import your bank CSV!</div>}
            </div>
          </div>
        )}

        {/* ══════════════ PLAN & HEALTH ══════════════ */}
        {tab==="Plan & Health"&&(
          <div>
            {/* Setup */}
            <div className="card" style={{marginBottom:12}}>
              <div className="stitle">⚙️ Your Numbers</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:10}}>
                <div><div className="lbl">Monthly Income (₹)</div><input className="input" type="number" placeholder="e.g. 50000" value={monthlyIncome} onChange={e=>setMonthlyIncome(e.target.value)}/></div>
                <div><div className="lbl">Extra ₹ to Attack Debt/mo</div><input className="input" type="number" placeholder="e.g. 5000" value={extraFund} onChange={e=>setExtraFund(e.target.value)}/></div>
                <div><div className="lbl">Emergency Fund Saved (₹)</div><input className="input" type="number" placeholder="e.g. 30000" value={emergencyFund} onChange={e=>setEmergencyFund(e.target.value)}/></div>
                <div>
                  <div className="lbl">Strategy</div>
                  <div style={{display:"flex",gap:6,marginTop:4}}>
                    {[["avalanche","⬆ Avalanche"],["snowball","❄ Snowball"]].map(([v,l])=>(
                      <button key={v} onClick={()=>setStrategy(v)} style={{flex:1,padding:"8px 4px",borderRadius:9,border:`1px solid ${strategy===v?C.accent:C.border}`,background:strategy===v?C.accent+"15":"transparent",color:strategy===v?C.accent:C.muted,fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:11,cursor:"pointer"}}>{l}</button>
                    ))}
                  </div>
                  <div style={{fontSize:10,color:C.muted,marginTop:4}}>{strategy==="avalanche"?"Highest interest first":"Smallest balance first"}</div>
                </div>
              </div>
            </div>

            {/* Cash Flow */}
            <div className="card" style={{marginBottom:12}}>
              <div className="stitle">💰 Monthly Cash Flow</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:10}}>
                {[
                  {label:"Income",val:effectiveIncome,color:C.income},
                  {label:"Loan EMIs",val:-totalEMI,color:C.expense},
                  {label:"CC Min Dues",val:-totalCCMinDue,color:C.credit},
                  {label:"Expenses",val:-totalExpense,color:C.warning},
                  {label:"Left Over",val:cashLeft,color:cashLeft>=0?C.income:C.expense},
                ].map(item=>(
                  <div key={item.label} style={{background:C.surface,borderRadius:10,padding:"10px 12px",border:`1px solid ${item.label==="Left Over"?item.color+"40":C.border}`}}>
                    <div className="lbl">{item.label}</div>
                    <div style={{fontSize:15,fontWeight:700,color:item.color,fontFamily:"'Syne',sans-serif"}}>{item.val>=0?"+":""}{fc(Math.abs(item.val))}</div>
                  </div>
                ))}
              </div>
              {cashLeft<0&&<div style={{marginTop:10,padding:"8px 12px",background:`${C.expense}10`,borderRadius:10,fontSize:11,color:C.expense,fontFamily:"'Syne',sans-serif",fontWeight:700}}>🚨 You are spending more than you earn this month. Immediate action needed!</div>}
            </div>

            {/* Health Score */}
            <div className="grid2" style={{marginBottom:12}}>
              <div className="card" style={{display:"flex",flexDirection:"column",alignItems:"center",textAlign:"center"}}>
                <div className="stitle">Financial Health</div>
                <ScoreRing score={health.score} color={health.color}/>
                <div style={{fontSize:18,fontWeight:800,color:health.color,fontFamily:"'Syne',sans-serif",marginTop:8}}>Grade {health.grade}</div>
                <div style={{fontSize:11,color:C.muted,marginTop:4}}>{health.score>=85?"Excellent 🌟":health.score>=70?"Good 👍":health.score>=50?"Needs work ⚠️":"Critical 🚨"}</div>
              </div>
              <div className="card">
                <div className="stitle">Score Breakdown</div>
                {health.items.map(b=>(
                  <div key={b.label} style={{marginBottom:12}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                      <span style={{fontFamily:"'Syne',sans-serif",fontWeight:600,fontSize:11}}>{b.label}</span>
                      <span style={{fontSize:11,color:b.score>=b.max*0.7?C.income:b.score>=b.max*0.4?C.warning:C.expense,fontWeight:700}}>{b.score}/{b.max}</span>
                    </div>
                    <div className="pbar"><div className="pfill" style={{width:`${(b.score/b.max)*100}%`,background:b.score>=b.max*0.7?C.income:b.score>=b.max*0.4?C.warning:C.expense}}/></div>
                    <div style={{fontSize:10,color:C.muted,marginTop:2}}>{b.tip}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Payoff Plan */}
            <div className="card" style={{marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14,flexWrap:"wrap",gap:8}}>
                <div><div className="stitle" style={{marginBottom:2}}>🏁 Loan Payoff Plan</div><div style={{fontSize:11,color:C.muted}}>Attack in this order. Freed EMIs roll into next loan.</div></div>
                {payoffPlan.some(p=>p.interestSaved>0)&&(
                  <div style={{background:`${C.income}10`,border:`1px solid ${C.income}25`,borderRadius:10,padding:"8px 12px",textAlign:"right"}}>
                    <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:12,color:C.income}}>Save {fc(payoffPlan.reduce((s,p)=>s+p.interestSaved,0))}</div>
                    <div style={{fontSize:10,color:C.muted}}>{payoffPlan.reduce((s,p)=>s+p.monthsSaved,0)} months faster</div>
                  </div>
                )}
              </div>
              {activeDebts.length===0?<div style={{textAlign:"center",padding:30,color:C.muted}}>🎉 No active debts! You're debt free.</div>:(
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {payoffPlan.map((d,i)=>{
                    const colors=["#f43f5e","#f59e0b","#38bdf8","#10b981","#a78bfa"];
                    const pc=colors[i%colors.length];
                    const pct=d.totalAmount?Math.min(100,((parseFloat(d.totalAmount)-d.bal)/parseFloat(d.totalAmount))*100):0;
                    return(
                      <div key={d.id} style={{background:C.surface,border:`1px solid ${i===0?pc+"50":C.border}`,borderRadius:12,padding:"14px"}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:6}}>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <div style={{width:24,height:24,borderRadius:"50%",background:pc+"20",color:pc,border:`2px solid ${pc}50`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:11}}>#{d.priority}</div>
                            <div>
                              <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:13}}>{d.name}</div>
                              <div style={{fontSize:10,color:C.muted}}>{d.lender} · {d.interestRate}%</div>
                            </div>
                          </div>
                          <div style={{textAlign:"right"}}><div style={{fontSize:16,fontWeight:700,color:C.expense,fontFamily:"'Syne',sans-serif"}}>{fc(d.bal)}</div></div>
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(100px,1fr))",gap:8,marginBottom:8}}>
                          <div><div className="lbl">EMI</div><div style={{fontSize:12,color:C.text}}>{fc(d.emi)}/mo</div></div>
                          <div><div className="lbl">Extra</div><div style={{fontSize:12,color:C.accent}}>{fc(d.extraApplied)}/mo</div></div>
                          <div><div className="lbl">Normal</div><div style={{fontSize:12,color:C.muted}}>{d.normalMonths?`${d.normalMonths}mo`:"—"}</div></div>
                          <div><div className="lbl">With Extra ⚡</div><div style={{fontSize:12,color:C.income,fontWeight:700}}>{d.boostedMonths?`${d.boostedMonths}mo`:"—"}</div></div>
                          {d.monthsSaved>0&&<div><div className="lbl">Saved</div><div style={{fontSize:12,color:C.income,fontWeight:700}}>🎉 {d.monthsSaved}mo</div></div>}
                        </div>
                        {d.totalAmount>0&&<div><div className="pbar"><div className="pfill" style={{width:`${pct}%`,background:pc}}/></div><div style={{fontSize:10,color:C.muted,marginTop:3}}>{pct.toFixed(0)}% repaid</div></div>}
                        {i===0&&<div style={{marginTop:8,padding:"6px 10px",background:pc+"12",borderRadius:8,fontSize:11,color:pc,fontFamily:"'Syne',sans-serif",fontWeight:700}}>⭐ Focus all extra funds here first</div>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* AI Advisor */}
            <div className="card">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
                <div><div className="stitle" style={{marginBottom:2}}>🤖 AI Financial Advisor</div><div style={{fontSize:11,color:C.muted}}>Personalised advice including insurance & investment planning</div></div>
                <button className="btn btn-ai" onClick={getAdvice} disabled={aiLoading}>{aiLoading?"⏳ Analysing...":"✨ Get Advice"}</button>
              </div>
              {aiLoading&&<div>{[90,75,85,60,70].map((w,i)=><div key={i} className="shimmer" style={{height:14,marginBottom:10,width:w+"%"}}/>)}</div>}
              {!aiLoading&&aiAdvice&&(
                <div>
                  <div style={{borderLeft:`3px solid ${C.loan}`,paddingLeft:14}}><div className="ai-text">{aiAdvice}</div></div>
                  <div style={{fontSize:10,color:C.muted,marginTop:10}}>⚠️ For informational purposes only. Consult a SEBI-registered financial advisor for investment decisions.</div>
                  <button className="btn-ghost btn-sm" style={{marginTop:8}} onClick={getAdvice}>↻ Refresh</button>
                </div>
              )}
              {!aiLoading&&!aiAdvice&&<div style={{color:C.muted,fontSize:12,textAlign:"center",padding:20}}>Fill in your income & loan details above, then click "Get Advice" for a personalised financial plan including insurance and investment roadmap.</div>}
            </div>
          </div>
        )}

        {/* ══════════════ CREDIT CARDS ══════════════ */}
        {tab==="Credit Cards"&&(
          <div>
            <div className="grid4" style={{marginBottom:14}}>
              {[
                {label:"Total Outstanding",val:fc(totalCCOutstanding),color:C.expense},
                {label:"Total Min Due",val:fc(totalCCMinDue),color:C.warning},
                {label:"# Cards",val:creditCards.length,color:C.accent},
                {label:"Highest Util",val:creditCards.length?Math.max(...creditCards.map(c=>((parseFloat(c.outstanding)||0)/(parseFloat(c.limit)||1)*100))).toFixed(0)+"%":"0%",color:C.credit},
              ].map(item=>(
                <div key={item.label} className="stat-card">
                  <div className="lbl">{item.label}</div>
                  <div style={{fontSize:18,fontWeight:700,color:item.color,fontFamily:"'Syne',sans-serif"}}>{item.val}</div>
                </div>
              ))}
            </div>

            {/* Should I use CC? */}
            <div className="card" style={{marginBottom:12,borderColor:`${C.warning}30`,background:`${C.warning}05`}}>
              <div className="stitle">💡 Should You Use Credit Cards?</div>
              {effectiveIncome>0?(()=>{
                const dti=totalEMI/effectiveIncome;
                const ccUtil=totalCCOutstanding>0&&creditCards.length>0;
                if(dti>0.5||ccUtil){
                  return<div style={{fontSize:12,lineHeight:1.8}}>
                    <div style={{color:C.expense,fontFamily:"'Syne',sans-serif",fontWeight:700,marginBottom:6}}>🚫 Recommendation: STOP using credit cards for now</div>
                    <div style={{color:C.muted}}>Your EMIs are {(dti*100).toFixed(0)}% of income{ccUtil?" and you have existing CC outstanding":""}. Using credit cards will increase your debt burden. Switch to UPI/Debit only until loans are under control.</div>
                  </div>;
                }else if(dti>0.3){
                  return<div style={{fontSize:12,lineHeight:1.8}}>
                    <div style={{color:C.warning,fontFamily:"'Syne',sans-serif",fontWeight:700,marginBottom:6}}>⚠️ Use credit cards carefully</div>
                    <div style={{color:C.muted}}>EMIs are {(dti*100).toFixed(0)}% of income. Only use CC for planned purchases you can pay in full before due date. Never carry a balance.</div>
                  </div>;
                }else{
                  return<div style={{fontSize:12,lineHeight:1.8}}>
                    <div style={{color:C.income,fontFamily:"'Syne',sans-serif",fontWeight:700,marginBottom:6}}>✅ Credit cards are okay if used wisely</div>
                    <div style={{color:C.muted}}>Pay the full statement amount every month, not just the minimum. This avoids 36-42% annual interest. Use for rewards/cashback only on budgeted spending.</div>
                  </div>;
                }
              })():<div style={{color:C.muted,fontSize:12}}>Add your monthly income in Plan & Health to get personalised credit card advice.</div>}
            </div>

            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:14}}>Your Credit Cards</div>
              <button className="btn btn-primary btn-sm" onClick={()=>{setCcForm({...EMPTY_CC});setEditCC(null);setShowCCForm(true);}}>+ Add Card</button>
            </div>

            {creditCards.length===0?<div className="card" style={{textAlign:"center",padding:40,color:C.muted}}>No credit cards added yet.</div>:(
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                {creditCards.map(cc=>{
                  const det=calcCCDetails(cc);
                  const statusColor=det.status==="danger"?C.expense:det.status==="warning"?C.warning:C.income;
                  return(
                    <div key={cc.id} className="card" style={{borderColor:det.status==="danger"?`${C.expense}40`:det.status==="warning"?`${C.warning}30`:C.border}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12,flexWrap:"wrap",gap:8}}>
                        <div style={{display:"flex",alignItems:"center",gap:10}}>
                          <div style={{width:40,height:40,borderRadius:10,background:`${C.credit}15`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>💳</div>
                          <div>
                            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:14}}>{cc.name}</div>
                            <div style={{fontSize:11,color:C.muted}}>{cc.bank} · {cc.interestRate}% p.a.</div>
                          </div>
                        </div>
                        <div style={{textAlign:"right"}}>
                          <div style={{fontSize:18,fontWeight:700,color:C.expense,fontFamily:"'Syne',sans-serif"}}>{fc(cc.outstanding)}</div>
                          <div style={{fontSize:10,color:C.muted}}>of {fc(cc.limit)} limit</div>
                        </div>
                      </div>

                      {/* Utilization bar */}
                      <div style={{marginBottom:12}}>
                        <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:C.muted,marginBottom:4}}>
                          <span>Utilization</span>
                          <span style={{color:statusColor,fontWeight:700}}>{det.utilization.toFixed(0)}% {det.status==="danger"?"🔴":det.status==="warning"?"🟡":"🟢"}</span>
                        </div>
                        <div className="pbar"><div className="pfill" style={{width:`${det.utilization}%`,background:statusColor}}/></div>
                        <div style={{fontSize:10,color:C.muted,marginTop:3}}>Keep below 30% for good credit score</div>
                      </div>

                      {/* Bill details */}
                      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:10,marginBottom:12}}>
                        <div style={{background:C.surface,borderRadius:10,padding:"10px"}}>
                          <div className="lbl">Minimum Due</div>
                          <div style={{fontSize:15,fontWeight:700,color:C.warning,fontFamily:"'Syne',sans-serif"}}>{fc(det.minDue)}</div>
                          <div style={{fontSize:10,color:C.muted,marginTop:2}}>Pay this to avoid late fee</div>
                        </div>
                        <div style={{background:`${C.income}10`,border:`1px solid ${C.income}20`,borderRadius:10,padding:"10px"}}>
                          <div className="lbl">Full Payment ✓</div>
                          <div style={{fontSize:15,fontWeight:700,color:C.income,fontFamily:"'Syne',sans-serif"}}>{fc(det.idealPayment)}</div>
                          <div style={{fontSize:10,color:C.muted,marginTop:2}}>Saves {fc(det.fullPaymentSaving)}/mo interest</div>
                        </div>
                        {cc.statementDate&&<div><div className="lbl">Statement Date</div><div style={{fontSize:13,fontWeight:600}}>{cc.statementDate}</div></div>}
                        {cc.dueDate&&<div><div className="lbl">Due Date</div><div style={{fontSize:13,fontWeight:600,color:det.daysLeft!==null&&det.daysLeft<=3?C.expense:C.text}}>{fd(cc.dueDate)}</div>{det.daysLeft!==null&&<DueBadge days={det.daysLeft}/>}</div>}
                      </div>

                      {/* Advice */}
                      <div style={{padding:"8px 12px",background:det.status==="danger"?`${C.expense}10`:C.surface,borderRadius:10,fontSize:11,marginBottom:10,color:det.status==="danger"?C.expense:C.muted,lineHeight:1.6}}>
                        {det.status==="danger"?`🚨 Over 80% utilized! This hurts your credit score. Pay ${fc(det.idealPayment)} in full to reset.`:det.status==="warning"?`⚠️ Utilization is high. Avoid new purchases. Pay ${fc(det.idealPayment)} to reduce to safe zone.`:`✅ Utilization is healthy. Pay ${fc(det.idealPayment)} in full before ${cc.dueDate?fd(cc.dueDate):"due date"} to avoid interest.`}
                      </div>

                      <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
                        <button className="btn btn-success btn-sm" onClick={()=>{const v=prompt(`Pay how much for ${cc.name}? (Outstanding: ₹${cc.outstanding})`);const n=parseFloat(v);if(!isNaN(n)&&n>0)recordCCPayment(cc.id,n);}}>💸 Pay Bill</button>
                        <button className="btn-ghost" onClick={()=>{setCcForm({...cc});setEditCC(cc.id);setShowCCForm(true);}}>Edit</button>
                        <button className="btn btn-danger" onClick={()=>deleteCC(cc.id)}>Delete</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══════════════ TRANSACTIONS ══════════════ */}
        {tab==="Transactions"&&(
          <div>
            <div className="card" style={{marginBottom:12}}>
              <input className="input" placeholder="🔍 Search transactions..." value={txSearch} onChange={e=>setTxSearch(e.target.value)} style={{marginBottom:10}}/>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {[["all","All"],["income","Income"],["expense","Expense"]].map(([v,l])=>(
                  <button key={v} className={`filter-btn ${txType===v?"on":""}`} onClick={()=>setTxType(v)}>{l}</button>
                ))}
                <select className="input" value={txMode} onChange={e=>setTxMode(e.target.value)} style={{width:"auto",fontSize:11,padding:"4px 8px"}}>
                  <option value="all">All Modes</option>
                  {PAYMENT_MODES.map(m=><option key={m}>{m}</option>)}
                </select>
                <select className="input" value={txBank} onChange={e=>setTxBank(e.target.value)} style={{width:"auto",fontSize:11,padding:"4px 8px"}}>
                  <option value="all">All Banks</option>
                  {banks.map(b=><option key={b}>{b}</option>)}
                </select>
                <button className="btn-ghost btn-sm" onClick={()=>{setTxSearch("");setTxType("all");setTxMode("all");setTxBank("all");}}>Clear</button>
                <button className="btn-ghost btn-sm" onClick={()=>setShowImport(true)}>⬆ Import CSV</button>
                <button className="btn-ghost btn-sm" onClick={exportTransactions}>⬇ Export</button>
              </div>
            </div>
            <div className="card">
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
                <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:13}}>{filteredTx.length} transactions</div>
                <div style={{fontSize:11,color:C.muted}}>
                  <span style={{color:C.income}}>+{fc(filteredTx.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0))}</span> / <span style={{color:C.expense}}>-{fc(filteredTx.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0))}</span>
                </div>
              </div>
              {filteredTx.length===0?<div style={{color:C.muted,textAlign:"center",padding:30,fontSize:12}}>No transactions found.</div>:filteredTx.map(t=>(
                <div key={t.id} className="row">
                  <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0}}>
                    <div style={{width:34,height:34,borderRadius:9,background:(t.type==="income"?C.income:C.expense)+"18",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{t.type==="income"?"↑":"↓"}</div>
                    <div style={{minWidth:0}}>
                      <div style={{fontSize:12,fontWeight:500,display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
                        <span>{t.category}</span>
                        {t.paymentMode&&<span className="tag" style={{background:C.surface,color:C.muted,fontSize:9}}>{t.paymentMode}</span>}
                        {t.bank&&<span className="tag" style={{background:C.surface,color:C.muted,fontSize:9}}>{t.bank}</span>}
                      </div>
                      <div style={{fontSize:10,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.note?`${t.note} · `:""}{fd(t.date)}</div>
                    </div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                    <span style={{color:t.type==="income"?C.income:C.expense,fontWeight:600,fontSize:12}}>{t.type==="income"?"+":"-"}{fc(t.amount)}</span>
                    <button className="btn btn-danger" onClick={()=>deleteTx(t.id)}>×</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════ BUDGET ══════════════ */}
        {tab==="Budget"&&(
          <div>
            <div className="card" style={{marginBottom:12}}>
              <div className="stitle">Set Monthly Limit</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <select className="input" style={{flex:"1 1 140px"}} value={budgetForm.category} onChange={e=>setBudgetForm(p=>({...p,category:e.target.value}))}>{CATEGORIES.expense.map(c=><option key={c}>{c}</option>)}</select>
                <input className="input" style={{flex:"1 1 120px"}} placeholder="₹ monthly limit" type="number" value={budgetForm.limit} onChange={e=>setBudgetForm(p=>({...p,limit:e.target.value}))}/>
                <button className="btn btn-primary" onClick={addBudget}>Set</button>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:10}}>
              {CATEGORIES.expense.map((cat,i)=>{
                const limit=budgets[cat]||0,spent=transactions.filter(t=>t.type==="expense"&&t.category===cat).reduce((s,t)=>s+t.amount,0);
                const pct=limit>0?Math.min(100,(spent/limit)*100):0,over=spent>limit&&limit>0;
                return(
                  <div key={cat} className="card">
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                      <div style={{display:"flex",alignItems:"center",gap:7}}><div style={{width:8,height:8,borderRadius:"50%",background:CAT_COLORS[i]}}/><span style={{fontFamily:"'Syne',sans-serif",fontWeight:600,fontSize:12}}>{cat}</span></div>
                      {over&&<span className="tag" style={{background:`${C.expense}15`,color:C.expense}}>Over!</span>}
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:6,fontSize:11,color:C.muted}}><span>{fc(spent)}</span><span>{limit>0?fc(limit):"No limit"}</span></div>
                    <div className="pbar"><div className="pfill" style={{width:`${pct}%`,background:over?C.expense:CAT_COLORS[i]}}/></div>
                    {limit>0&&<div style={{fontSize:10,color:C.muted,marginTop:4}}>{pct.toFixed(0)}% used</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ══════════════ SAVINGS & FUTURE GOALS ══════════════ */}
        {tab==="Future Goals"&&(
          <div>
            {/* Insurance & Investment planning */}
            <div className="card" style={{marginBottom:12,borderColor:`${C.loan}30`,background:`${C.loan}05`}}>
              <div className="stitle">🛡️ After Debt: Insurance & Investment Roadmap</div>
              <div style={{fontSize:12,color:C.muted,lineHeight:1.9}}>
                <div style={{marginBottom:12,padding:"10px 14px",background:C.card,borderRadius:10,border:`1px solid ${C.border}`}}>
                  <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,color:C.expense,marginBottom:4}}>📋 Your Protection Gaps (Fix These First)</div>
                  <div>• <b style={{color:C.expense}}>No Health Insurance</b> — A single hospitalisation without insurance can wipe out all savings. Get this immediately even while paying off loans.</div>
                  <div style={{marginTop:4}}>• <b style={{color:C.expense}}>No Term Life Insurance</b> — If you have dependents, this is critical. Premiums are cheapest in your 20s-30s.</div>
                  <div style={{marginTop:4}}>• <b style={{color:C.muted}}>No Investments</b> — Start SIPs only after emergency fund and insurance are in place.</div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:10}}>
                  {[
                    {step:"Step 1 — NOW",title:"Health Insurance",desc:"Get ₹5-10L individual or floater plan. Cost: ₹8,000-15,000/year. Don't delay — do this even while in debt.",color:C.expense},
                    {step:"Step 2 — NOW",title:"Term Life Insurance",desc:`Cover = 10-15x annual income (~${fc((effectiveIncome*12*12)||5000000)}). Cost: ₹10,000-20,000/year. Lock in while you're young.`,color:C.warning},
                    {step:"Step 3 — After debt",title:"Emergency Fund",desc:"Build 6 months of expenses in a liquid FD or savings account before investing.",color:C.accent},
                    {step:"Step 4 — After debt",title:"Start SIP",desc:"Start with ₹2,000-5,000/month in a Nifty 50 index fund. Increase every year.",color:C.income},
                    {step:"Step 5 — Long term",title:"NPS + PPF",desc:"Add NPS for retirement tax benefits (₹50k extra deduction). PPF for safe long-term growth.",color:C.savings},
                  ].map(item=>(
                    <div key={item.title} style={{background:C.card,border:`1px solid ${item.color}25`,borderRadius:10,padding:"12px"}}>
                      <div style={{fontSize:9,color:item.color,fontFamily:"'Syne',sans-serif",fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>{item.step}</div>
                      <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:12,marginBottom:4}}>{item.title}</div>
                      <div style={{fontSize:11,color:C.muted,lineHeight:1.6}}>{item.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Savings Goals */}
            <div className="card" style={{marginBottom:12}}>
              <div className="stitle">Add Savings Goal</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <input className="input" style={{flex:"2 1 150px"}} placeholder="Goal (e.g. Emergency Fund)" value={savingsForm.name} onChange={e=>setSavingsForm(p=>({...p,name:e.target.value}))}/>
                <input className="input" style={{flex:"1 1 110px"}} placeholder="Target ₹" type="number" value={savingsForm.goal} onChange={e=>setSavingsForm(p=>({...p,goal:e.target.value}))}/>
                <input className="input" style={{flex:"1 1 110px"}} placeholder="Saved so far ₹" type="number" value={savingsForm.current} onChange={e=>setSavingsForm(p=>({...p,current:e.target.value}))}/>
                <button className="btn btn-success" onClick={addGoal}>Add</button>
              </div>
            </div>
            {savings.length===0?<div className="card" style={{textAlign:"center",color:C.muted,padding:40,fontSize:12}}>No goals yet. Suggested: Emergency Fund (6 months expenses), Health Insurance Premium, Down Payment.</div>:(
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(270px,1fr))",gap:12}}>
                {savings.map(s=>{
                  const pct=Math.min(100,(s.current/s.goal)*100);
                  return(
                    <div key={s.id} className="card">
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
                        <div><div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:14}}>{s.name}</div><div style={{fontSize:10,color:C.muted}}>Goal: {fc(s.goal)}</div></div>
                        <div style={{textAlign:"right"}}><div style={{fontSize:18,fontWeight:700,color:C.savings,fontFamily:"'Syne',sans-serif"}}>{pct.toFixed(0)}%</div></div>
                      </div>
                      <div className="pbar" style={{marginBottom:8}}><div className="pfill" style={{width:`${pct}%`,background:`linear-gradient(90deg,${C.savings},${C.accent})`}}/></div>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:10,color:C.muted}}><span style={{color:C.income}}>Saved: {fc(s.current)}</span><span>Left: {fc(Math.max(0,s.goal-s.current))}</span></div>
                      <div style={{display:"flex",gap:7}}>
                        <input id={`g-${s.id}`} className="input" type="number" placeholder="Add ₹" style={{flex:1}}/>
                        <button className="btn btn-success btn-sm" onClick={()=>{const v=parseFloat(document.getElementById(`g-${s.id}`).value);if(!isNaN(v)&&v>0){updateGoal(s.id,v);document.getElementById(`g-${s.id}`).value="";}}}>+</button>
                        <button className="btn btn-danger" onClick={()=>setSavings(p=>p.filter(g=>g.id!==s.id))}>×</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══════════════ INSIGHTS ══════════════ */}
        {tab==="Insights"&&(
          <div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:10,marginBottom:14}}>
              {[
                {label:"Savings Rate",val:`${effectiveIncome>0?((effectiveIncome-totalExpense)/effectiveIncome*100).toFixed(1):0}%`,color:C.income},
                {label:"Avg Monthly Exp",val:fc(last6Months.reduce((s,m)=>s+m.expense,0)/6),color:C.expense},
                {label:"Debt-to-Income",val:`${effectiveIncome>0?(totalEMI/effectiveIncome*100).toFixed(0):0}%`,color:totalEMI/Math.max(effectiveIncome,1)>0.4?C.expense:C.income},
                {label:"Top Mode",val:expenseByMode.sort((a,b)=>b.value-a.value)[0]?.name||"—",color:C.accent},
              ].map(item=>(
                <div key={item.label} className="stat-card" style={{textAlign:"center"}}>
                  <div className="lbl" style={{textAlign:"center"}}>{item.label}</div>
                  <div style={{fontSize:20,fontWeight:700,color:item.color,fontFamily:"'Syne',sans-serif"}}>{item.val}</div>
                </div>
              ))}
            </div>
            <div className="grid2" style={{marginBottom:12}}>
              <div className="card">
                <div className="stitle">Income vs Expense</div>
                <ResponsiveContainer width="100%" height={170}>
                  <LineChart data={last6Months}>
                    <XAxis dataKey="label" tick={{fill:C.muted,fontSize:9}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fill:C.muted,fontSize:9}} axisLine={false} tickLine={false} tickFormatter={v=>`₹${v>=1000?(v/1000).toFixed(0)+"k":v}`} width={38}/>
                    <Tooltip contentStyle={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,fontSize:11}} formatter={v=>fc(v)}/>
                    <Line type="monotone" dataKey="income" stroke={C.income} strokeWidth={2} dot={{fill:C.income,r:3}}/>
                    <Line type="monotone" dataKey="expense" stroke={C.expense} strokeWidth={2} dot={{fill:C.expense,r:3}}/>
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="card">
                <div className="stitle">Spending by Category</div>
                {expenseByCategory.length===0?<div style={{color:C.muted,textAlign:"center",paddingTop:50,fontSize:12}}>No data yet</div>:(
                  <div style={{overflowY:"auto",maxHeight:170}}>
                    {expenseByCategory.sort((a,b)=>b.value-a.value).map((d,i)=>{
                      const max=expenseByCategory[0].value;
                      return(
                        <div key={d.name} style={{marginBottom:8}}>
                          <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                            <div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:7,height:7,borderRadius:"50%",background:d.color}}/><span style={{fontSize:11,fontFamily:"'Syne',sans-serif",fontWeight:600}}>{d.name}</span></div>
                            <span style={{fontSize:11,fontWeight:500}}>{fc(d.value)}</span>
                          </div>
                          <div className="pbar"><div className="pfill" style={{width:`${(d.value/max)*100}%`,background:d.color}}/></div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            <div className="card">
              <div className="stitle">Spending by Payment Mode</div>
              {expenseByMode.length===0?<div style={{color:C.muted,fontSize:12,textAlign:"center",padding:20}}>No expense data yet</div>:(
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10}}>
                  {expenseByMode.sort((a,b)=>b.value-a.value).map((d,i)=>(
                    <div key={d.name} style={{background:C.surface,borderRadius:10,padding:"10px 12px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}><div style={{width:8,height:8,borderRadius:"50%",background:CAT_COLORS[i]}}/><span style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:11}}>{d.name}</span></div>
                      <div style={{fontSize:15,fontWeight:700,color:CAT_COLORS[i],fontFamily:"'Syne',sans-serif"}}>{fc(d.value)}</div>
                      <div style={{fontSize:10,color:C.muted}}>{totalExpense>0?((d.value/totalExpense)*100).toFixed(0):0}% of expenses</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── MOBILE BOTTOM NAV ── */}
      <nav className="bottom-nav">
        {MOBILE_TABS.map(t=>(
          <button key={t.id} className={`bottom-nav-btn ${tab===t.id?"active":""}`} onClick={()=>setTab(t.id)}>
            <span style={{fontSize:18}}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>

      {/* ── MOBILE FAB ── */}
      <button className="fab" onClick={()=>setShowTxForm(true)}>+</button>

      {/* ══ MODALS ══ */}

      {/* Add Transaction */}
      {showTxForm&&(
        <div className="modal-bg" onClick={e=>e.target===e.currentTarget&&setShowTxForm(false)}>
          <div className="modal-sheet">
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:17,marginBottom:16}}>Add Transaction</div>
            <div style={{display:"flex",gap:7,marginBottom:14,background:C.surface,padding:4,borderRadius:12}}>
              {["expense","income"].map(type=>(
                <button key={type} className="btn" onClick={()=>setTxForm(p=>({...p,type,category:CATEGORIES[type][0]}))}
                  style={{flex:1,background:txForm.type===type?(type==="income"?C.income:C.expense):"transparent",color:txForm.type===type?"#fff":C.muted}}>
                  {type==="income"?"↑ Income":"↓ Expense"}
                </button>
              ))}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <div><div className="lbl">Amount (₹)</div><input className="input" type="number" placeholder="0" value={txForm.amount} onChange={e=>setTxForm(p=>({...p,amount:e.target.value}))}/></div>
              <div className="grid2">
                <div><div className="lbl">Category</div><select className="input" value={txForm.category} onChange={e=>setTxForm(p=>({...p,category:e.target.value}))}>{CATEGORIES[txForm.type].map(c=><option key={c}>{c}</option>)}</select></div>
                <div><div className="lbl">Payment Mode</div><select className="input" value={txForm.paymentMode} onChange={e=>setTxForm(p=>({...p,paymentMode:e.target.value}))}>{PAYMENT_MODES.map(m=><option key={m}>{m}</option>)}</select></div>
              </div>
              <div className="grid2">
                <div><div className="lbl">Bank / Account</div><select className="input" value={txForm.bank} onChange={e=>setTxForm(p=>({...p,bank:e.target.value}))}><option value="">Select bank</option>{banks.map(b=><option key={b}>{b}</option>)}</select></div>
                <div><div className="lbl">Date</div><input className="input" type="date" value={txForm.date} onChange={e=>setTxForm(p=>({...p,date:e.target.value}))}/></div>
              </div>
              <div><div className="lbl">Note</div><input className="input" placeholder="What was this for?" value={txForm.note} onChange={e=>setTxForm(p=>({...p,note:e.target.value}))}/></div>
              <div style={{display:"flex",gap:9,marginTop:4}}>
                <button className="btn" onClick={()=>setShowTxForm(false)} style={{flex:1,background:C.border,color:C.muted}}>Cancel</button>
                <button className="btn btn-primary" onClick={addTx} style={{flex:2}}>Add Transaction</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Debt */}
      {showDebtForm&&(
        <div className="modal-bg" onClick={e=>e.target===e.currentTarget&&setShowDebtForm(false)}>
          <div className="modal-sheet">
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:17,marginBottom:16}}>{editDebt?"Edit":"Add"} Loan</div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <div className="grid2">
                <div><div className="lbl">Loan Name *</div><input className="input" placeholder="e.g. Home Loan" value={debtForm.name} onChange={e=>setDebtForm(p=>({...p,name:e.target.value}))}/></div>
                <div><div className="lbl">Bank / Lender</div><input className="input" placeholder="e.g. SBI" value={debtForm.lender} onChange={e=>setDebtForm(p=>({...p,lender:e.target.value}))}/></div>
              </div>
              <div className="grid2">
                <div><div className="lbl">Outstanding (₹) *</div><input className="input" type="number" placeholder="Current balance" value={debtForm.outstanding} onChange={e=>setDebtForm(p=>({...p,outstanding:e.target.value}))}/></div>
                <div><div className="lbl">Total Loan (₹)</div><input className="input" type="number" placeholder="Original amount" value={debtForm.totalAmount} onChange={e=>setDebtForm(p=>({...p,totalAmount:e.target.value}))}/></div>
              </div>
              <div className="grid2">
                <div><div className="lbl">EMI (₹/month)</div><input className="input" type="number" value={debtForm.emi} onChange={e=>setDebtForm(p=>({...p,emi:e.target.value}))}/></div>
                <div><div className="lbl">Interest Rate (%)</div><input className="input" type="number" placeholder="e.g. 12" value={debtForm.interestRate} onChange={e=>setDebtForm(p=>({...p,interestRate:e.target.value}))}/></div>
              </div>
              <div className="grid2">
                <div><div className="lbl">Next Due Date</div><input className="input" type="date" value={debtForm.dueDate} onChange={e=>setDebtForm(p=>({...p,dueDate:e.target.value}))}/></div>
                <div><div className="lbl">Tenure</div><input className="input" placeholder="e.g. 5 years" value={debtForm.tenure} onChange={e=>setDebtForm(p=>({...p,tenure:e.target.value}))}/></div>
              </div>
              <div><div className="lbl">Notes</div><input className="input" placeholder="Any notes" value={debtForm.notes} onChange={e=>setDebtForm(p=>({...p,notes:e.target.value}))}/></div>
              <div style={{display:"flex",gap:9}}>
                <button className="btn" onClick={()=>{setShowDebtForm(false);setEditDebt(null);}} style={{flex:1,background:C.border,color:C.muted}}>Cancel</button>
                <button className="btn btn-purple" onClick={saveDebt} style={{flex:2}}>{editDebt?"Save":"Add Loan"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Credit Card */}
      {showCCForm&&(
        <div className="modal-bg" onClick={e=>e.target===e.currentTarget&&setShowCCForm(false)}>
          <div className="modal-sheet">
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:17,marginBottom:16}}>{editCC?"Edit":"Add"} Credit Card</div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <div className="grid2">
                <div><div className="lbl">Card Name *</div><input className="input" placeholder="e.g. HDFC Millennia" value={ccForm.name} onChange={e=>setCcForm(p=>({...p,name:e.target.value}))}/></div>
                <div><div className="lbl">Bank</div><input className="input" placeholder="e.g. HDFC" value={ccForm.bank} onChange={e=>setCcForm(p=>({...p,bank:e.target.value}))}/></div>
              </div>
              <div className="grid2">
                <div><div className="lbl">Credit Limit (₹)</div><input className="input" type="number" value={ccForm.limit} onChange={e=>setCcForm(p=>({...p,limit:e.target.value}))}/></div>
                <div><div className="lbl">Current Outstanding (₹)</div><input className="input" type="number" value={ccForm.outstanding} onChange={e=>setCcForm(p=>({...p,outstanding:e.target.value}))}/></div>
              </div>
              <div className="grid2">
                <div><div className="lbl">Minimum Due (₹)</div><input className="input" type="number" placeholder="Auto-calculated if blank" value={ccForm.minDue} onChange={e=>setCcForm(p=>({...p,minDue:e.target.value}))}/></div>
                <div><div className="lbl">Interest Rate (% p.a.)</div><input className="input" type="number" placeholder="36" value={ccForm.interestRate} onChange={e=>setCcForm(p=>({...p,interestRate:e.target.value}))}/></div>
              </div>
              <div className="grid2">
                <div><div className="lbl">Statement Date (e.g. 15th)</div><input className="input" placeholder="e.g. 15th of month" value={ccForm.statementDate} onChange={e=>setCcForm(p=>({...p,statementDate:e.target.value}))}/></div>
                <div><div className="lbl">Payment Due Date</div><input className="input" type="date" value={ccForm.dueDate} onChange={e=>setCcForm(p=>({...p,dueDate:e.target.value}))}/></div>
              </div>
              <div><div className="lbl">Notes</div><input className="input" placeholder="Any notes" value={ccForm.notes} onChange={e=>setCcForm(p=>({...p,notes:e.target.value}))}/></div>
              <div style={{display:"flex",gap:9}}>
                <button className="btn" onClick={()=>{setShowCCForm(false);setEditCC(null);}} style={{flex:1,background:C.border,color:C.muted}}>Cancel</button>
                <button className="btn btn-primary" onClick={saveCC} style={{flex:2}}>{editCC?"Save":"Add Card"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import CSV */}
      {showImport&&(
        <div className="modal-bg" onClick={e=>e.target===e.currentTarget&&setShowImport(false)}>
          <div className="modal-sheet">
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:17,marginBottom:6}}>⬆ Import Bank CSV</div>
            <div style={{fontSize:11,color:C.muted,marginBottom:16,lineHeight:1.7}}>
              Download your bank statement as CSV from your bank's net banking / app. We auto-detect the format.
              <br/><b style={{color:C.text}}>Supported:</b> SBI, HDFC, ICICI, Axis, Kotak, Paytm, PhonePe exports & most standard formats.
            </div>
            <div style={{padding:"20px",border:`2px dashed ${C.border}`,borderRadius:12,textAlign:"center",marginBottom:14,cursor:"pointer",background:C.surface}} onClick={()=>fileRef.current?.click()}>
              <div style={{fontSize:28,marginBottom:6}}>📄</div>
              <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:13}}>Click to select CSV file</div>
              <div style={{fontSize:11,color:C.muted}}>or drag and drop here</div>
              <input ref={fileRef} type="file" accept=".csv,.txt" style={{display:"none"}} onChange={handleFileImport}/>
            </div>
            {importError&&(
              <div style={{padding:"10px 14px",borderRadius:10,marginBottom:10,fontSize:12,background:importError.startsWith("✅")?`${C.income}12`:`${C.expense}12`,color:importError.startsWith("✅")?C.income:C.expense,lineHeight:1.6}}>{importError}</div>
            )}
            {importPreview.length>0&&(
              <div>
                <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:12,marginBottom:8}}>Preview (first 5):</div>
                {importPreview.map((t,i)=>(
                  <div key={i} className="row" style={{fontSize:11}}>
                    <span style={{color:C.muted}}>{t.date}</span>
                    <span>{t.category}</span>
                    <span className="tag" style={{background:C.surface,color:C.muted}}>{t.paymentMode}</span>
                    <span style={{color:t.type==="income"?C.income:C.expense,fontWeight:600}}>{t.type==="income"?"+":"-"}{fc(t.amount)}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{marginTop:14,padding:"10px 12px",background:C.surface,borderRadius:10,fontSize:11,color:C.muted,lineHeight:1.7}}>
              <b style={{color:C.text}}>CSV Format:</b> Your file should have columns like Date, Description/Narration, Debit/Credit or Amount, Type. Categories are auto-detected from descriptions.
            </div>
            <button className="btn btn-ghost" onClick={()=>{setShowImport(false);setImportError("");setImportPreview([]);}} style={{width:"100%",marginTop:12,textAlign:"center"}}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
