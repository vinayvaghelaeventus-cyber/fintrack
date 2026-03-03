import { auth, provider } from "./firebase";
import {
    signInWithPopup,
    signOut,
    onAuthStateChanged,
} from "firebase/auth";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { loadData, saveData } from "./firebase";

// ─── THEMES ──────────────────────────────────────────────────────────────────
const DARK  = {income:"#10b981",expense:"#f43f5e",savings:"#6366f1",bg:"#0d0f14",card:"#161b26",border:"#232b3e",text:"#e2e8f0",muted:"#64748b",accent:"#38bdf8",warning:"#f59e0b",loan:"#a78bfa",credit:"#fb923c",surface:"#1e2535",inputBg:"#0a0c10"};
const LIGHT = {income:"#059669",expense:"#e11d48",savings:"#4f46e5",bg:"#f0f4f8",card:"#ffffff",border:"#e2e8f0",text:"#0f172a",muted:"#94a3b8",accent:"#0284c7",warning:"#d97706",loan:"#7c3aed",credit:"#ea580c",surface:"#f8fafc",inputBg:"#f1f5f9"};

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const PAYMENT_MODES = ["UPI","Credit Card","Debit Card","Cash","Net Banking","Wallet","EMI","Other"];
const CATEGORIES = {
  income:  ["Salary","Freelance","Investment","Gift","Rental","Bonus","Other Income"],
  expense: ["Housing","Food","Transport","Entertainment","Health","Shopping","Utilities","Education","Loan EMI","Credit Card EMI","Credit Card Bill","Insurance","Travel","Medical","Groceries","Other"],
};
const CAT_COLORS = ["#38bdf8","#10b981","#f59e0b","#6366f1","#f43f5e","#a78bfa","#34d399","#fb923c","#e879f9","#22d3ee","#84cc16","#f472b6","#60a5fa","#fbbf24","#6ee7b7","#c084fc"];
const MOBILE_TABS = [
  {id:"Dashboard",  icon:"🏠", label:"Home"},
  {id:"Plan",       icon:"🎯", label:"Plan"},
  {id:"Cards",      icon:"💳", label:"Cards"},
  {id:"Transactions",       icon:"📋", label:"Txns"},
  {id:"Goals",      icon:"🌱", label:"Goals"},
];
const ALL_TABS = ["Dashboard","Plan","Cards","Transactions","Budget","Goals","Insights"];
const EMPTY_TX   = {type:"expense",amount:"",category:"Food",paymentMode:"UPI",bank:"",note:"",date:new Date().toISOString().split("T")[0]};
const EMPTY_DEBT = {name:"",lender:"",outstanding:"",totalAmount:"",emi:"",interestRate:"",dueDate:"",tenure:"",notes:""};
const EMPTY_CC   = {name:"",bank:"",limit:"",outstanding:"",minDue:"",statementDate:"",dueDate:"",interestRate:"36",hasEMI:false,emiAmount:"",emiMonthsLeft:"",notes:""};
const EMPTY_SAL  = {amount:"",bank:"",creditDay:"1",active:true};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const fc = n => new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(n||0);
const fd = d => { try { return new Date(d).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}); } catch { return "—"; }};
const today = () => new Date().toISOString().split("T")[0];
function daysUntil(ds){ if(!ds)return null; const d=new Date(ds),t=new Date(); t.setHours(0,0,0,0); d.setHours(0,0,0,0); return Math.ceil((d-t)/864e5); }
function toCSV(rows,headers){ return [headers.join(","),...rows.map(r=>headers.map(h=>`"${String(r[h]??"")}"`).join(","))].join("\n"); }
function dlCSV(c,f){ const a=document.createElement("a"); a.href="data:text/csv;charset=utf-8,"+encodeURIComponent(c); a.download=f; a.click(); }

// ─── MATH ────────────────────────────────────────────────────────────────────
function calcMonths(bal, emi, rate) {
  if (!bal||!emi) return null;
  const r = (rate||0)/100/12;
  if (r===0) return Math.ceil(bal/emi);
  let b=parseFloat(bal), m=0;
  while (b>0&&m<600) { b=b*(1+r)-parseFloat(emi); m++; }
  return m>599 ? null : m;
}

function calcPayoffPlan(debts, extra, strategy) {
  if (!debts.length) return [];
  const sorted = strategy==="avalanche"
    ? [...debts].sort((a,b)=>(parseFloat(b.interestRate)||0)-(parseFloat(a.interestRate)||0))
    : [...debts].sort((a,b)=>(parseFloat(a.outstanding)||0)-(parseFloat(b.outstanding)||0));
  let xtra=parseFloat(extra)||0, results=[];
  for (let i=0;i<sorted.length;i++) {
    const d=sorted[i];
    const bal=parseFloat(d.outstanding)||0, emi=parseFloat(d.emi)||0, rate=parseFloat(d.interestRate)||0;
    const norm=calcMonths(bal,emi,rate);
    const boost=calcMonths(bal,emi+xtra,rate);
    const saved=norm&&boost ? Math.max(0,norm-boost) : 0;
    const iSaved=saved>0 ? Math.max(0,(emi*norm-bal)-((emi+xtra)*boost-bal)) : 0;
    results.push({...d,bal,normalMonths:norm,boostedMonths:boost,monthsSaved:saved,interestSaved:iSaved,priority:i+1,extraApplied:xtra});
    xtra+=emi;
  }
  return results;
}

function calcHealthScore({income,emi,expense,outstanding,savings,emergency}) {
  if (!income) return {score:0,grade:"F",color:"#f43f5e",items:[]};
  const dti=emi/income, sr=Math.max(0,(income-expense)/income),
        db=outstanding>0?Math.min(2,outstanding/(income*12)):0, ef=Math.min(1,emergency/6);
  const s1=dti<0.2?30:dti<0.35?20:dti<0.5?10:0;
  const s2=sr>0.2?25:sr>0.1?17:sr>0?8:0;
  const s3=db<0.5?25:db<1?15:db<1.5?8:0;
  const s4=ef>=1?20:ef>=0.5?13:ef>0?6:0;
  const score=s1+s2+s3+s4;
  return {
    score, grade: score>=85?"A":score>=70?"B":score>=50?"C":score>=30?"D":"F",
    color: score>=70?"#10b981":score>=50?"#f59e0b":"#f43f5e",
    items: [
      {label:"Debt-to-Income", score:s1, max:30, tip:`${(dti*100).toFixed(0)}% on EMIs (ideal <20%)`},
      {label:"Savings Rate",   score:s2, max:25, tip:`${(sr*100).toFixed(0)}% saved (ideal >20%)`},
      {label:"Debt Burden",    score:s3, max:25, tip:`${(db*100).toFixed(0)}% of annual income owed`},
      {label:"Emergency Fund", score:s4, max:20, tip:`${emergency.toFixed(1)} months covered (ideal 6)`},
    ]
  };
}

// ─── STRATEGY RECOMMENDER ────────────────────────────────────────────────────
function recommendStrategy(debts, cashLeft) {
  if (!debts.length) return {strategy:"avalanche", reason:""};
  const sorted_av = [...debts].sort((a,b)=>(parseFloat(b.interestRate)||0)-(parseFloat(a.interestRate)||0));
  const sorted_sn = [...debts].sort((a,b)=>(parseFloat(a.outstanding)||0)-(parseFloat(b.outstanding)||0));
  const highestRate = parseFloat(sorted_av[0]?.interestRate)||0;
  const smallestBal = parseFloat(sorted_sn[0]?.outstanding)||0;
  const canCloseSmallest = cashLeft > 0 && smallestBal < cashLeft * 3;
  const creditCards = debts.filter(d=>parseFloat(d.interestRate)>=30);
  if (creditCards.length>0 && highestRate>=30) {
    return {strategy:"avalanche", reason:`You have high-interest debt at ${highestRate}% p.a. Avalanche saves you the most money by killing this first.`};
  }
  if (canCloseSmallest && debts.length>2) {
    return {strategy:"snowball", reason:`Your smallest loan (${fc(smallestBal)}) can be closed soon — snowball gives you quick wins and motivates you to keep going.`};
  }
  if (highestRate > 18) {
    return {strategy:"avalanche", reason:`Interest rates above 18% are costing you heavily. Avalanche eliminates the most expensive debt first.`};
  }
  return {strategy:"avalanche", reason:`Avalanche is the best default — it minimises total interest paid across all your loans.`};
}

function calcCCDetails(cc) {
  const outstanding=parseFloat(cc.outstanding)||0, limit=parseFloat(cc.limit)||1;
  const rate=parseFloat(cc.interestRate)||36;
  const minDue=parseFloat(cc.minDue)||Math.max(250,outstanding*0.05);
  const utilization=(outstanding/limit)*100;
  const interestSavedByFull=outstanding*(rate/100/12);
  const status=utilization>80?"danger":utilization>40?"warning":"good";
  return {outstanding,limit,minDue,utilization,interestSavedByFull,idealPayment:outstanding,status,rate,daysLeft:daysUntil(cc.dueDate)};
}

// ─── MAIN APP ────────────────────────────────────────────────────────────────
export default function App() {
  // ── UI state ──
  const [darkMode, setDarkMode] = useState(true);
  const [tab, setTab] = useState("Dashboard");
  const [user, setUser] = useState(null);
  const [fbStatus, setFbStatus] = useState("loading");
  const C = darkMode ? DARK : LIGHT;

  // ── Data ──
  const [transactions, setTransactions] = useState([]);
  const [debts, setDebts]               = useState([]);
  const [creditCards, setCreditCards]   = useState([]);
  const [savings, setSavings]           = useState([]);
  const [budgets, setBudgets]           = useState({});
  const [banks, setBanks]               = useState(["SBI","HDFC","ICICI","Axis","Kotak"]);
  const [salary, setSalary]             = useState({...EMPTY_SAL}); // auto-salary config
  const [loaded, setLoaded]             = useState(false);
  const [saving, setSaving]             = useState(false);
  const [lastSaved, setLastSaved]       = useState(null);

  // ── Plan ──
  const [monthlyIncome, setMonthlyIncome] = useState("");
  const [extraFund, setExtraFund]         = useState("");
  const [strategy, setStrategy]           = useState("avalanche");
  const [emergencyFund, setEmergencyFund] = useState("");
  const [aiAdvice, setAiAdvice]           = useState("");
  const [aiLoading, setAiLoading]         = useState(false);

  // ── Forms ──
  const [showTxForm, setShowTxForm]     = useState(false);
  const [editTxId, setEditTxId]         = useState(null);
  const [showDebtForm, setShowDebtForm] = useState(false);
  const [editDebtId, setEditDebtId]     = useState(null);
  const [showCCForm, setShowCCForm]     = useState(false);
  const [editCCId, setEditCCId]         = useState(null);
  const [showImport, setShowImport]     = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [txForm, setTxForm]   = useState({...EMPTY_TX});
  const [debtForm, setDebtForm] = useState({...EMPTY_DEBT});
  const [ccForm, setCcForm]   = useState({...EMPTY_CC});
  const [budgetForm, setBudgetForm] = useState({category:"Food",limit:""});
  const [savForm, setSavForm] = useState({name:"",goal:"",current:""});
  const [importMsg, setImportMsg] = useState("");
  const [importPreview, setImportPreview] = useState([]);
  const fileRef = useRef();

  // ── Filters ──
  const [txSearch, setTxSearch] = useState("");
  const [txType, setTxType]     = useState("all");
  const [txMode, setTxMode]     = useState("all");
  const [txBank, setTxBank]     = useState("all");


// ✅ REPLACE with this — clean and simple
useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
        setUser(currentUser);
    });
    return () => unsubscribe();
}, []);



// ✅ new
const handleLogin = async () => {
    try {
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error("Login error:", error);
    }
};

  
  const handleLogout = async () => {
  await signOut(auth);
};
  



  // ─── FIREBASE LOAD ───────────────────────────────────────────────────────
useEffect(() => {
  if (!user) return;
    async function load() {
      try {
        const data = await loadData(user.uid);
        if (data) {
          if (data.transactions)  setTransactions(data.transactions);
          if (data.debts)         setDebts(data.debts);
          if (data.creditCards)   setCreditCards(data.creditCards);
          if (data.savings)       setSavings(data.savings);
          if (data.budgets)       setBudgets(data.budgets);
          if (data.banks)         setBanks(data.banks);
          if (data.salary)        setSalary(data.salary);
          if (data.monthlyIncome) setMonthlyIncome(data.monthlyIncome);
          if (data.extraFund)     setExtraFund(data.extraFund);
          if (data.strategy)      setStrategy(data.strategy);
          if (data.emergencyFund) setEmergencyFund(data.emergencyFund);
          if (data.aiAdvice)      setAiAdvice(data.aiAdvice);
          if (data.darkMode!==undefined) setDarkMode(data.darkMode);
        }
        setFbStatus("ok");
      } catch (e) {
        console.error(e);
        setFbStatus("error");
      }
      setLoaded(true);
    }
    load();
}, [user]);

  // ─── AUTO-SAVE TO FIREBASE ───────────────────────────────────────────────
  const saveTimeout = useRef(null);
  useEffect(() => {
    if (!loaded) return;
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(async () => {
      setSaving(true);
      const ok = await saveData(user.uid, {
        transactions, debts, creditCards, savings, budgets, banks, salary,
        monthlyIncome, extraFund, strategy, emergencyFund, aiAdvice, darkMode,
        lastUpdated: new Date().toISOString(),
      });
      setSaving(false);
      if (ok) setLastSaved(new Date());
      else setFbStatus("error");
    }, 1200);
  }, [transactions, debts, creditCards, savings, budgets, banks, salary,
      monthlyIncome, extraFund, strategy, emergencyFund, aiAdvice, darkMode, loaded]);

  // ─── AUTO-SALARY CREDIT ──────────────────────────────────────────────────
  useEffect(() => {
    if (!loaded || !salary.active || !salary.amount) return;
    const now = new Date();
    const creditDay = parseInt(salary.creditDay) || 1;
    const thisMonthKey = `sal_${now.getFullYear()}_${now.getMonth()}`;
    const alreadyCredited = transactions.some(t => t._salKey === thisMonthKey);
    if (alreadyCredited) return;
    if (now.getDate() >= creditDay) {
      const salTx = {
        id: Date.now(), type: "income", amount: parseFloat(salary.amount),
        category: "Salary", paymentMode: "Net Banking", bank: salary.bank||"",
        note: "Auto: Monthly Salary", date: `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(creditDay).padStart(2,"0")}`,
        _salKey: thisMonthKey,
      };
      setTransactions(p => [salTx, ...p]);
    }
  }, [loaded, salary, transactions]);

  // ─── COMPUTED ────────────────────────────────────────────────────────────
  const totalIncome    = useMemo(() => transactions.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0), [transactions]);
  const totalExpense   = useMemo(() => transactions.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0), [transactions]);
  const activeDebts    = useMemo(() => debts.filter(d=>!d.closed), [debts]);
  const totalEMI       = useMemo(() => activeDebts.reduce((s,d)=>s+(parseFloat(d.emi)||0),0), [activeDebts]);
  const totalOutstanding = useMemo(() => activeDebts.reduce((s,d)=>s+(parseFloat(d.outstanding)||0),0), [activeDebts]);
  const totalCCOut     = useMemo(() => creditCards.reduce((s,c)=>s+(parseFloat(c.outstanding)||0),0), [creditCards]);
  const totalCCEMI     = useMemo(() => creditCards.filter(c=>c.hasEMI).reduce((s,c)=>s+(parseFloat(c.emiAmount)||0),0), [creditCards]);
  const effectiveIncome = parseFloat(monthlyIncome) || totalIncome || 0;
  const savingsTotal   = useMemo(() => savings.reduce((s,g)=>s+g.current,0), [savings]);
  const emergencyMonths = useMemo(() => {
    const ef = parseFloat(emergencyFund)||savingsTotal;
    return ef / Math.max(totalExpense||effectiveIncome*0.7, 1);
  }, [emergencyFund, savingsTotal, totalExpense, effectiveIncome]);
  const cashLeft = effectiveIncome - totalEMI - totalCCEMI - totalExpense;

  const recommended   = useMemo(() => recommendStrategy(activeDebts, cashLeft), [activeDebts, cashLeft]);
  const payoffPlan    = useMemo(() => calcPayoffPlan(activeDebts, parseFloat(extraFund)||0, strategy), [activeDebts, extraFund, strategy]);
  const health        = useMemo(() => calcHealthScore({income:effectiveIncome, emi:totalEMI+totalCCEMI, expense:totalExpense, outstanding:totalOutstanding+totalCCOut, savings:savingsTotal, emergency:emergencyMonths}), [effectiveIncome,totalEMI,totalCCEMI,totalExpense,totalOutstanding,totalCCOut,savingsTotal,emergencyMonths]);

  const upcomingDues  = useMemo(() => [
    ...activeDebts.filter(d=>d.dueDate).map(d=>({...d,days:daysUntil(d.dueDate),kind:"loan"})),
    ...creditCards.filter(c=>c.dueDate).map(c=>({...c,days:daysUntil(c.dueDate),kind:"cc"})),
  ].sort((a,b)=>a.days-b.days), [activeDebts, creditCards]);

  const overdueCount = upcomingDues.filter(d=>d.days<0).length;

  const expenseByMode = useMemo(() => PAYMENT_MODES.map(m=>({
    name:m, value:transactions.filter(t=>t.type==="expense"&&t.paymentMode===m).reduce((s,t)=>s+t.amount,0)
  })).filter(d=>d.value>0), [transactions]);

  const expenseByCat = useMemo(() => CATEGORIES.expense.map((cat,i)=>({
    name:cat, value:transactions.filter(t=>t.type==="expense"&&t.category===cat).reduce((s,t)=>s+t.amount,0), color:CAT_COLORS[i]
  })).filter(d=>d.value>0), [transactions]);

  const last6Months = useMemo(() => Array.from({length:6},(_,i)=>{
    const d=new Date(); d.setMonth(d.getMonth()-(5-i));
    const mo=d.getMonth(), yr=d.getFullYear(), lbl=d.toLocaleDateString("en-IN",{month:"short"});
    const inc=transactions.filter(t=>{const td=new Date(t.date);return t.type==="income"&&td.getMonth()===mo&&td.getFullYear()===yr;}).reduce((s,t)=>s+t.amount,0);
    const exp=transactions.filter(t=>{const td=new Date(t.date);return t.type==="expense"&&td.getMonth()===mo&&td.getFullYear()===yr;}).reduce((s,t)=>s+t.amount,0);
    return {label:lbl,income:inc,expense:exp};
  }), [transactions]);

  const filteredTx = useMemo(() => transactions.filter(t=>{
    if (txType!=="all"&&t.type!==txType) return false;
    if (txMode!=="all"&&t.paymentMode!==txMode) return false;
    if (txBank!=="all"&&t.bank!==txBank) return false;
    if (txSearch) { const q=txSearch.toLowerCase(); if (!t.category?.toLowerCase().includes(q)&&!(t.note||"").toLowerCase().includes(q)&&!String(t.amount).includes(q)) return false; }
    return true;
  }), [transactions,txType,txMode,txBank,txSearch]);

  // ─── ACTIONS ─────────────────────────────────────────────────────────────
  function saveTx() {
    if (!txForm.amount||isNaN(txForm.amount)) return;
    const tx = {...txForm, amount:parseFloat(txForm.amount)};
    if (editTxId) {
      setTransactions(p=>p.map(t=>t.id===editTxId?{...tx,id:editTxId}:t));
    } else {
      setTransactions(p=>[{...tx,id:Date.now()},...p]);
    }
    setTxForm({...EMPTY_TX}); setShowTxForm(false); setEditTxId(null);
  }
  function openEditTx(t) { setTxForm({...t}); setEditTxId(t.id); setShowTxForm(true); }
  function deleteTx(id) { setTransactions(p=>p.filter(t=>t.id!==id)); }

  function saveDebt() {
    if (!debtForm.name) return;
    if (editDebtId) { setDebts(p=>p.map(d=>d.id===editDebtId?{...debtForm,id:editDebtId,closed:d.closed}:d)); }
    else { setDebts(p=>[...p,{...debtForm,id:Date.now(),closed:false}]); }
    setDebtForm({...EMPTY_DEBT}); setShowDebtForm(false); setEditDebtId(null);
  }
  function openEditDebt(d) { setDebtForm({...d}); setEditDebtId(d.id); setShowDebtForm(true); }
  function deleteDebt(id)  { setDebts(p=>p.filter(d=>d.id!==id)); }
  function toggleDebtClosed(id) { setDebts(p=>p.map(d=>d.id===id?{...d,closed:!d.closed}:d)); }
  function recordLoanPayment(id, amt) {
    setDebts(p=>p.map(d=>{ if(d.id!==id)return d; const n=Math.max(0,(parseFloat(d.outstanding)||0)-amt); return{...d,outstanding:n,closed:n===0}; }));
    const d=debts.find(x=>x.id===id);
    setTransactions(p=>[{id:Date.now(),type:"expense",amount:amt,category:"Loan EMI",paymentMode:"Net Banking",bank:d?.bank||"",note:`Payment: ${d?.name||""}`,date:today()},...p]);
  }

  function saveCC() {
    if (!ccForm.name) return;
    if (editCCId) { setCreditCards(p=>p.map(c=>c.id===editCCId?{...ccForm,id:editCCId}:c)); }
    else { setCreditCards(p=>[...p,{...ccForm,id:Date.now()}]); }
    setCcForm({...EMPTY_CC}); setShowCCForm(false); setEditCCId(null);
  }
  function openEditCC(c) { setCcForm({...c}); setEditCCId(c.id); setShowCCForm(true); }
  function deleteCC(id)  { setCreditCards(p=>p.filter(c=>c.id!==id)); }
  function recordCCPayment(id, amt) {
    setCreditCards(p=>p.map(c=>{ if(c.id!==id)return c; return{...c,outstanding:Math.max(0,(parseFloat(c.outstanding)||0)-amt)}; }));
    const cc=creditCards.find(c=>c.id===id);
    setTransactions(p=>[{id:Date.now(),type:"expense",amount:amt,category:"Credit Card Bill",paymentMode:"Net Banking",bank:cc?.bank||"",note:`CC: ${cc?.name||""}`,date:today()},...p]);
  }

  function addBudget() { if(!budgetForm.limit)return; setBudgets(p=>({...p,[budgetForm.category]:parseFloat(budgetForm.limit)})); setBudgetForm({category:"Food",limit:""}); }
  function addGoal()   { if(!savForm.name||!savForm.goal)return; setSavings(p=>[...p,{...savForm,goal:parseFloat(savForm.goal),current:parseFloat(savForm.current)||0,id:Date.now()}]); setSavForm({name:"",goal:"",current:""}); }
  function updateGoal(id,delta) { setSavings(p=>p.map(s=>s.id===id?{...s,current:Math.max(0,s.current+delta)}:s)); }

  function exportTransactions() { dlCSV(toCSV(transactions.map(t=>({Date:t.date,Type:t.type,Category:t.category,Amount:t.amount,Mode:t.paymentMode||"",Bank:t.bank||"",Note:t.note||""})),["Date","Type","Category","Amount","Mode","Bank","Note"]),"fintrack_export.csv"); }

  // ─── CSV IMPORT ──────────────────────────────────────────────────────────
  function guessCategory(n) {
    n=(n||"").toLowerCase();
    if(n.includes("zomato")||n.includes("swiggy")||n.includes("food"))return"Food";
    if(n.includes("uber")||n.includes("ola")||n.includes("petrol"))return"Transport";
    if(n.includes("amazon")||n.includes("flipkart"))return"Shopping";
    if(n.includes("netflix")||n.includes("prime"))return"Entertainment";
    if(n.includes("electric")||n.includes("internet")||n.includes("water"))return"Utilities";
    if(n.includes("salary")||n.includes("payroll"))return"Salary";
    if(n.includes("rent")||n.includes("house"))return"Housing";
    if(n.includes("emi")||n.includes("loan"))return"Loan EMI";
    if(n.includes("insurance"))return"Insurance";
    if(n.includes("hospital")||n.includes("pharmacy"))return"Medical";
    return"Other";
  }
  function parseDateStr(d) {
    if(!d)return today();
    const p=d.split(/[\/\-\.]/);
    if(p.length===3){
      if(p[2].length===4)return`${p[2]}-${p[1].padStart(2,"0")}-${p[0].padStart(2,"0")}`;
      if(p[0].length===4)return`${p[0]}-${p[1].padStart(2,"0")}-${p[2].padStart(2,"0")}`;
    }
    try{return new Date(d).toISOString().split("T")[0];}catch{return today();}
  }
  function handleImport(e) {
    const file=e.target.files[0]; if(!file)return;
    setImportMsg(""); setImportPreview([]);
    const reader=new FileReader();
    reader.onload=ev=>{
      try {
        const lines=ev.target.result.split("\n").filter(l=>l.trim());
        if(lines.length<2){setImportMsg("❌ Empty file");return;}
        const hdrs=lines[0].split(",").map(h=>h.replace(/"/g,"").trim().toLowerCase());
        const rows=lines.slice(1).map(line=>{
          const vals=line.split(",").map(v=>v.replace(/"/g,"").trim());
          const o={}; hdrs.forEach((h,i)=>o[h]=vals[i]||""); return o;
        });
        const mapped=rows.map((r,i)=>{
          const note=r.description||r.note||r.narration||r.remarks||r.particulars||"";
          const amt=Math.abs(parseFloat(r.amount||r.debit||r.credit||r.value||0));
          const debit=parseFloat(r.debit||0), credit=parseFloat(r.credit||0);
          let type=(r.type||"").toLowerCase().includes("income")||(credit>0&&debit===0)?"income":"expense";
          return {id:Date.now()+i,date:parseDateStr(r.date||r["transaction date"]||""),type,amount:amt||0,category:guessCategory(note),paymentMode:r.mode||r.paymentmode||"UPI",bank:r.bank||"",note};
        }).filter(r=>r.amount>0);
        if(!mapped.length){setImportMsg("❌ No valid rows found");return;}
        setImportPreview(mapped.slice(0,5));
        setTransactions(p=>[...mapped,...p]);
        setImportMsg(`✅ Imported ${mapped.length} transactions!`);
      } catch(err){setImportMsg("❌ Could not parse file. Check format.");}
    };
    reader.readAsText(file);
  }

  // ─── AI ADVISOR ──────────────────────────────────────────────────────────
  const getAdvice = useCallback(async()=>{
    setAiLoading(true); setAiAdvice("");
    const dti = effectiveIncome>0?(totalEMI/effectiveIncome*100).toFixed(0):0;
    const prompt=`You are a warm expert personal finance advisor for India. Be specific and actionable.

FINANCIAL SNAPSHOT:
- Monthly Income: ${fc(effectiveIncome)}
- Total EMIs (loans): ${fc(totalEMI)} (${dti}% of income)
- CC EMIs: ${fc(totalCCEMI)}
- Monthly Expenses: ${fc(totalExpense)}
- Cash Left: ${fc(cashLeft)}
- Loan Outstanding: ${fc(totalOutstanding)}
- CC Outstanding: ${fc(totalCCOut)}
- Health Score: ${health.score}/100 (Grade ${health.grade})
- Recommended Strategy: ${recommended.strategy} — ${recommended.reason}

LOANS: ${activeDebts.map(d=>`${d.name} ₹${d.outstanding} @ ${d.interestRate}% EMI:${fc(d.emi)}`).join("; ")||"None"}
CREDIT CARDS: ${creditCards.map(c=>`${c.name}/${c.bank} out:₹${c.outstanding} limit:₹${c.limit} rate:${c.interestRate}%${c.hasEMI?" EMI:"+fc(c.emiAmount):""}`).join("; ")||"None"}

Provide (use emoji headers, max 350 words):
## 🚨 Top 3 Actions (this week, with ₹ amounts)
## 💳 Credit Card Strategy (use or avoid? pay which first?)
## 🏁 Debt-Free Timeline (with vs without extra ₹${fc(extraFund)})
## 🛡️ Post-Debt Plan (health insurance, term life, investments — India-specific)
## ❤️ One line of encouragement`;
    try {
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1200,messages:[{role:"user",content:prompt}]})});
      const data=await res.json();
      if(data.content?.[0])setAiAdvice(data.content[0].text);
      else setAiAdvice("Could not generate. Try again.");
    }catch{setAiAdvice("Connection error. Try again.");}
    setAiLoading(false);
  },[effectiveIncome,totalEMI,totalCCEMI,totalExpense,cashLeft,totalOutstanding,totalCCOut,health,activeDebts,creditCards,extraFund,recommended]);

  // ─── STYLES ──────────────────────────────────────────────────────────────
  const css=`
    @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@600;700;800&display=swap');
    *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}
    html{overflow-x:hidden;}body{overflow-x:hidden;overscroll-behavior:none;}
    ::-webkit-scrollbar{width:3px;}::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px;}
    input,select,textarea{outline:none;-webkit-appearance:none;font-family:'DM Mono',monospace;}
    .card{background:${C.card};border:1px solid ${C.border};border-radius:14px;padding:16px;}
    .btn{cursor:pointer;border:none;border-radius:10px;font-family:'Syne',sans-serif;font-weight:700;font-size:13px;padding:10px 18px;transition:all 0.15s;display:inline-flex;align-items:center;gap:5px;justify-content:center;}
    .btn:active{transform:scale(0.96);}
    .btn-p{background:${C.accent};color:#fff;}
    .btn-g{background:${C.income};color:#fff;}
    .btn-v{background:${C.loan};color:#fff;}
    .btn-w{background:${C.warning};color:#0d0f14;}
    .btn-ai{background:linear-gradient(135deg,#6366f1,#a78bfa);color:#fff;}
    .btn-sm{padding:6px 12px;font-size:11px;border-radius:8px;}
    .btn-danger{background:transparent;color:${C.expense};border:1px solid ${C.expense}30;font-size:11px;padding:4px 10px;cursor:pointer;border-radius:7px;font-family:'Syne',sans-serif;font-weight:700;}
    .btn-ghost{background:transparent;color:${C.muted};border:1px solid ${C.border};padding:6px 12px;border-radius:8px;cursor:pointer;font-family:'Syne',sans-serif;font-weight:600;font-size:11px;}
    .btn-ghost:active{background:${C.surface};}
    .inp{background:${C.inputBg};border:1px solid ${C.border};border-radius:10px;color:${C.text};padding:10px 13px;font-size:13px;width:100%;}
    .inp:focus{border-color:${C.accent};}
    .modal{position:fixed;inset:0;background:rgba(0,0,0,0.88);backdrop-filter:blur(10px);z-index:200;display:flex;align-items:flex-end;justify-content:center;}
    .sheet{width:100%;max-width:540px;background:${C.card};border:1px solid ${C.border};border-radius:20px 20px 0 0;padding:24px;max-height:92vh;overflow-y:auto;}
    @media(min-width:640px){.modal{align-items:center;padding:20px;}.sheet{border-radius:20px;}}
    .tag{display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-family:'Syne',sans-serif;font-weight:700;}
    .pbar{height:6px;background:${C.border};border-radius:3px;overflow:hidden;}
    .pfill{height:100%;border-radius:3px;transition:width 0.5s;}
    .lbl{font-size:9px;color:${C.muted};font-family:'Syne',sans-serif;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px;}
    .stitle{font-family:'Syne',sans-serif;font-weight:800;font-size:14px;margin-bottom:12px;}
    .row{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid ${C.border}18;}
    .g2{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
    .g4{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;}
    @media(max-width:640px){.g4{grid-template-columns:repeat(2,1fr);}.g2{grid-template-columns:1fr;}}
    .pulse{animation:pulse 2s infinite;}
    @keyframes pulse{0%,100%{opacity:1;}50%{opacity:0.4;}}
    .filter-btn{cursor:pointer;padding:5px 11px;border-radius:8px;font-family:'Syne',sans-serif;font-weight:600;font-size:11px;border:1px solid ${C.border};background:transparent;color:${C.muted};}
    .filter-btn.on{border-color:${C.accent};color:${C.accent};background:${C.accent}15;}
    .ai-txt{white-space:pre-wrap;font-size:12.5px;line-height:1.9;font-family:'DM Mono',monospace;}
    .shimmer{background:linear-gradient(90deg,${C.surface} 25%,${C.border} 50%,${C.surface} 75%);background-size:200% 100%;animation:shimmer 1.5s infinite;border-radius:8px;}
    @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
    .scard{background:${C.card};border:1px solid ${C.border};border-radius:14px;padding:14px;position:relative;overflow:hidden;}
    .bn{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8px 4px;font-family:'Syne',sans-serif;font-weight:600;font-size:9px;color:${C.muted};cursor:pointer;border:none;background:transparent;gap:2px;flex:1;}
    .bn.act{color:${C.accent};}
    .fab{position:fixed;bottom:72px;right:16px;width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,${C.accent},${C.loan});border:none;cursor:pointer;font-size:24px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 20px ${C.accent}40;z-index:99;color:#fff;font-weight:800;}
    @media(min-width:769px){.fab{display:none;}.bnav{display:none!important;}}
    @media(max-width:768px){.dtabs{display:none!important;}}
    .bnav{position:fixed;bottom:0;left:0;right:0;background:${C.card};border-top:1px solid ${C.border};display:flex;z-index:100;padding-bottom:env(safe-area-inset-bottom,0px);}
    /* PIN screen */
    .pin-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;background:${C.bg};padding:20px;}
    .pin-box{background:${C.card};border:1px solid ${C.border};border-radius:20px;padding:36px 28px;width:100%;max-width:380px;text-align:center;}
    .pin-input{text-align:center;font-size:24px;letter-spacing:8px;font-family:'Syne',sans-serif;font-weight:800;}
    .pin-pad{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:20px;}
    .pin-key{background:${C.surface};border:1px solid ${C.border};border-radius:12px;padding:16px;font-family:'Syne',sans-serif;font-weight:700;font-size:18px;cursor:pointer;color:${C.text};}
    .pin-key:active{background:${C.border};}
    .sync-dot{width:6px;height:6px;border-radius:50%;background:${saving?"#f59e0b":fbStatus==="ok"?"#10b981":"#f43f5e"};display:inline-block;margin-right:4px;}
  `;

  function DueBadge({days}){
    if(days===null)return null;
    if(days<0)return<span className="tag" style={{background:`${C.expense}18`,color:C.expense}}>Overdue {Math.abs(days)}d</span>;
    if(days===0)return<span className="tag" style={{background:`${C.warning}18`,color:C.warning}}>Today!</span>;
    if(days<=3)return<span className="tag" style={{background:`${C.warning}18`,color:C.warning}}>{days}d left</span>;
    if(days<=7)return<span className="tag" style={{background:`${C.accent}18`,color:C.accent}}>{days}d</span>;
    return null;
  }
  function ScoreRing({score,color,size=110}){
    const r=42,circ=2*Math.PI*r,off=circ-(score/100)*circ;
    return<svg width={size} height={size} viewBox="0 0 100 100">
      <circle cx="50" cy="50" r={r} fill="none" stroke={C.border} strokeWidth="9"/>
      <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={off} transform="rotate(-90 50 50)" style={{transition:"stroke-dashoffset 1s"}}/>
      <text x="50" y="46" textAnchor="middle" fill={color} fontSize="21" fontWeight="800" fontFamily="Syne">{score}</text>
      <text x="50" y="59" textAnchor="middle" fill={C.muted} fontSize="9" fontFamily="Syne">/100</text>
    </svg>;
  }

  
  // ─── GOOGLE LOGIN SCREEN ─────────────────────────────────────────────────
if (!user) {
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: C.bg,
      color: C.text,
      fontFamily: "'DM Mono','Courier New',monospace"
    }}>
      <style>{css}</style>
      <div style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 20,
        padding: "40px 30px",
        textAlign: "center",
        maxWidth: 380,
        width: "100%"
      }}>
        <div style={{fontSize: 40, marginBottom: 12}}>💰</div>
        <div style={{
          fontFamily: "'Syne',sans-serif",
          fontWeight: 800,
          fontSize: 22,
          marginBottom: 10
        }}>
          FinTrack
        </div>
        <div style={{color: C.muted, fontSize: 12, marginBottom: 24}}>
          Sign in with Google to access your personal finance dashboard
        </div>

        <button
          onClick={handleLogin}
          style={{
            width: "100%",
            padding: "12px 18px",
            borderRadius: 10,
            border: "none",
            background: "#4285F4",
            color: "#fff",
            fontWeight: 700,
            fontFamily: "'Syne',sans-serif",
            cursor: "pointer"
          }}
        >
          Sign in with Google
        </button>
      </div>
    </div>
  );
}
  

  // ─── FIREBASE CONFIG WARNING ──────────────────────────────────────────────
  const fbNotConfigured = fbStatus==="error";

  // ─── MAIN UI ─────────────────────────────────────────────────────────────
  const activeTab = MOBILE_TABS.find(t=>t.id===tab||t.label===tab)?.id||tab;

  return(
    <div style={{minHeight:"100vh",minHeight:"100dvh",background:C.bg,color:C.text,fontFamily:"'DM Mono','Courier New',monospace"}}>
      <style>{css}</style>

      {/* ── Desktop Header ── */}
<div style={{ borderBottom: `1px solid ${C.border}`, padding: "11px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: C.bg, zIndex: 50, gap: 8 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 30, height: 30, background: "linear-gradient(135deg,#38bdf8,#6366f1)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 14 }}>₹</div>
        <span style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 15 }}>FinTrack</span>
        <span><span className="sync-dot" /></span></div>
    </div>
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        {health.score > 0 && <span className="tag" style={{ background: health.color + "20", color: health.color }}>{health.score}/100</span>}
        {overdueCount > 0 && <span className="pulse tag" style={{ background: `${C.expense}15`, color: C.expense }}>⚠{overdueCount}</span>}
        <button className="btn-ghost btn-sm" onClick={() => setDarkMode(p => !p)} style={{ padding: "4px 8px" }}>{darkMode ? "☀️" : "🌙"}</button>
        <button className="btn-ghost btn-sm" onClick={() => setShowSettings(true)} style={{ padding: "4px 8px" }}>⚙️</button>
        <button className="btn-ghost btn-sm" onClick={handleLogout} style={{ padding: "4px 8px" }}>🚪</button>
    </div>
</div>
        <div style={{display:"flex",gap:2}}>
          {ALL_TABS.map(t=>(
            <button key={t} className="btn-ghost" onClick={()=>setTab(t)} style={{background:tab===t?C.border:"transparent",color:tab===t?C.accent:C.muted,border:"none",fontSize:11,padding:"6px 10px",borderRadius:8}}>
              {t==="Plan"?"🎯 Plan":t==="Cards"?"💳 Cards":t==="Goals"?"🌱 Goals":t}
            </button>
          ))}
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <button className="btn-ghost btn-sm" onClick={()=>setDarkMode(p=>!p)}>{darkMode?"☀️":"🌙"}</button>
          <button className="btn-ghost btn-sm" onClick={()=>setShowSettings(true)}>⚙️</button>
          <button className="btn-ghost btn-sm" onClick={()=>setShowImport(true)}>⬆ Import</button>
          <button className="btn-ghost btn-sm" onClick={exportTransactions}>⬇ Export</button>
          <button className="btn btn-p btn-sm" onClick={()=>{setTxForm({...EMPTY_TX});setEditTxId(null);setShowTxForm(true);}}>+ Add</button>
          <button className="btn-ghost btn-sm" onClick={handleLogout}> Logout </button>
        </div>
      </div>

      {/* ── Mobile Header ── */}

      <div style={{borderBottom:`1px solid ${C.border}`,padding:"11px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,background:C.bg,zIndex:50,gap:8}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:30,height:30,background:"linear-gradient(135deg,#38bdf8,#6366f1)",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:14}}>₹</div>
          <span style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:15}}>FinTrack</span>
          <span><span className="sync-dot"/></span>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          {health.score>0&&<span className="tag" style={{background:health.color+"20",color:health.color}}>{health.score}/100</span>}
          {overdueCount>0&&<span className="pulse tag" style={{background:`${C.expense}15`,color:C.expense}}>⚠{overdueCount}</span>}
          <button className="btn-ghost btn-sm" onClick={()=>setDarkMode(p=>!p)} style={{padding:"4px 8px"}}>{darkMode?"☀️":"🌙"}</button>
          <button className="btn-ghost btn-sm" onClick={()=>setShowSettings(true)} style={{padding:"4px 8px"}}>⚙️</button>
        </div>
      </div>

      {fbNotConfigured&&(
        <div style={{background:"#f59e0b15",borderBottom:`1px solid #f59e0b40`,padding:"8px 16px",fontSize:11,color:"#f59e0b",textAlign:"center"}}>
          ⚠️ Firebase not configured — data is NOT being saved to cloud. Open <b>src/firebaseConfig.js</b> and add your Firebase keys.
        </div>
      )}

      <div style={{maxWidth:1160,margin:"0 auto",padding:"14px 12px",paddingBottom:90}}>

        {/* ════════ DASHBOARD ════════ */}
        {tab==="Dashboard"&&<>
          <div className="g4" style={{marginBottom:12}}>
            {[
              {label:"Net Balance",   val:fc(totalIncome-totalExpense), color:(totalIncome-totalExpense)>=0?C.income:C.expense},
              {label:"Total EMIs",    val:fc(totalEMI+totalCCEMI),     color:C.loan, sub:`${effectiveIncome>0?((totalEMI+totalCCEMI)/effectiveIncome*100).toFixed(0):0}% of income`},
              {label:"CC Outstanding",val:fc(totalCCOut),              color:C.credit},
              {label:"Cash Left",     val:fc(cashLeft),                color:cashLeft>=0?C.income:C.expense, sub:"after all EMI+expenses"},
            ].map(item=>(
              <div key={item.label} className="scard">
                <div className="lbl">{item.label}</div>
                <div style={{fontSize:17,fontWeight:700,color:item.color,fontFamily:"'Syne',sans-serif"}}>{item.val}</div>
                {item.sub&&<div style={{fontSize:10,color:C.muted,marginTop:2}}>{item.sub}</div>}
              </div>
            ))}
          </div>

          {health.score<50&&activeDebts.length>0&&(
            <div style={{marginBottom:10,padding:"11px 14px",background:`linear-gradient(135deg,${C.expense}10,${C.loan}08)`,border:`1px solid ${C.expense}25`,borderRadius:12,display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}>
              <div>
                <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:13,color:C.expense}}>⚡ High debt load</div>
                <div style={{fontSize:11,color:C.muted}}>EMIs are {effectiveIncome>0?((totalEMI/effectiveIncome)*100).toFixed(0):0}% of income</div>
              </div>
              <button className="btn btn-ai btn-sm" onClick={()=>setTab("Plan")}>🎯 My Plan →</button>
            </div>
          )}

          {upcomingDues.filter(d=>d.days!==null&&d.days<=7).length>0&&(
            <div className="card" style={{marginBottom:10,borderColor:`${C.warning}35`}}>
              <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:12,color:C.warning,marginBottom:8}}>⏰ Due this week</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {upcomingDues.filter(d=>d.days!==null&&d.days<=7).map(d=>(
                  <div key={d.id} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"7px 11px"}}>
                    <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:12}}>{d.name}</div>
                    <div style={{fontSize:10,color:C.muted}}>{d.kind==="cc"?`Min: ${fc(d.minDue)}`:`EMI: ${fc(d.emi)}`}</div>
                    <DueBadge days={d.days}/>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="g2" style={{marginBottom:10}}>
            <div className="card">
              <div className="stitle">6-Month Trend</div>
              <ResponsiveContainer width="100%" height={155}>
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
                <>
                  <ResponsiveContainer width="100%" height={90}>
                    <PieChart><Pie data={expenseByMode} dataKey="value" cx="50%" cy="50%" innerRadius={25} outerRadius={42} paddingAngle={3}>
                      {expenseByMode.map((_,i)=><Cell key={i} fill={CAT_COLORS[i%CAT_COLORS.length]}/>)}
                    </Pie></PieChart>
                  </ResponsiveContainer>
                  {expenseByMode.slice(0,4).map((d,i)=>(
                    <div key={d.name} style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                      <div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:7,height:7,borderRadius:"50%",background:CAT_COLORS[i]}}/><span style={{fontSize:10,color:C.muted}}>{d.name}</span></div>
                      <span style={{fontSize:10}}>{fc(d.value)}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          <div className="card">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div className="stitle" style={{marginBottom:0}}>Recent Transactions</div>
              <button className="btn-ghost btn-sm" onClick={()=>setTab("Transactions")} style={{border:"none",color:C.accent,background:"transparent",cursor:"pointer"}}>All →</button>
            </div>
            {transactions.slice(0,6).map(t=>(
              <div key={t.id} className="row">
                <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0}}>
                  <div style={{width:34,height:34,borderRadius:9,background:(t.type==="income"?C.income:C.expense)+"18",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:14}}>{t.type==="income"?"↑":"↓"}</div>
                  <div style={{minWidth:0}}>
                    <div style={{fontSize:12,display:"flex",gap:5,flexWrap:"wrap",alignItems:"center"}}>
                      <span style={{fontWeight:500}}>{t.category}</span>
                      {t.paymentMode&&<span className="tag" style={{background:C.surface,color:C.muted,fontSize:9}}>{t.paymentMode}</span>}
                    </div>
                    <div style={{fontSize:10,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.note||fd(t.date)}</div>
                  </div>
                </div>
                <span style={{color:t.type==="income"?C.income:C.expense,fontWeight:600,fontSize:13,flexShrink:0}}>{t.type==="income"?"+":"-"}{fc(t.amount)}</span>
              </div>
            ))}
            {transactions.length===0&&<div style={{color:C.muted,textAlign:"center",padding:30,fontSize:12}}>No transactions yet. Tap + to add one!</div>}
          </div>
        </>}

        {/* ════════ PLAN ════════ */}
        {tab==="Plan"&&<>
          {/* Numbers setup */}
          <div className="card" style={{marginBottom:12}}>
            <div className="stitle">⚙️ Your Numbers</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))",gap:10}}>
              <div><div className="lbl">Monthly Income ₹</div><input className="inp" type="number" placeholder="e.g. 50000" value={monthlyIncome} onChange={e=>setMonthlyIncome(e.target.value)}/>{totalIncome>0&&<div style={{fontSize:10,color:C.muted,marginTop:3}}>From txns: {fc(totalIncome)}</div>}</div>
              <div><div className="lbl">Extra ₹ to Attack Debt/mo</div><input className="inp" type="number" placeholder="e.g. 5000" value={extraFund} onChange={e=>setExtraFund(e.target.value)}/></div>
              <div><div className="lbl">Emergency Fund ₹</div><input className="inp" type="number" placeholder="e.g. 30000" value={emergencyFund} onChange={e=>setEmergencyFund(e.target.value)}/></div>
              <div>
                <div className="lbl">Strategy</div>
                <div style={{display:"flex",gap:6,marginTop:4}}>
                  {[["avalanche","⬆ Avalanche"],["snowball","❄ Snowball"]].map(([v,l])=>(
                    <button key={v} onClick={()=>setStrategy(v)} style={{flex:1,padding:"8px 4px",borderRadius:9,border:`1px solid ${strategy===v?C.accent:C.border}`,background:strategy===v?C.accent+"15":"transparent",color:strategy===v?C.accent:C.muted,fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:11,cursor:"pointer"}}>{l}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Recommended strategy */}
          {activeDebts.length>0&&(
            <div style={{marginBottom:12,padding:"12px 16px",background:`${C.income}10`,border:`1px solid ${C.income}25`,borderRadius:12}}>
              <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:13,color:C.income,marginBottom:4}}>🤖 Recommended: {recommended.strategy==="avalanche"?"Avalanche ⬆":"Snowball ❄"}</div>
              <div style={{fontSize:12,color:C.muted,lineHeight:1.7}}>{recommended.reason}</div>
              {strategy!==recommended.strategy&&<button className="btn btn-g btn-sm" style={{marginTop:8}} onClick={()=>setStrategy(recommended.strategy)}>Switch to {recommended.strategy}</button>}
            </div>
          )}

          {/* Cash flow */}
          <div className="card" style={{marginBottom:12}}>
            <div className="stitle">💰 Monthly Cash Flow</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10}}>
              {[
                {label:"Income",      val:effectiveIncome,       color:C.income},
                {label:"Loan EMIs",   val:-totalEMI,             color:C.expense},
                {label:"CC EMIs",     val:-totalCCEMI,           color:C.credit},
                {label:"Expenses",    val:-totalExpense,         color:C.warning},
                {label:"Left Over",   val:cashLeft,              color:cashLeft>=0?C.income:C.expense},
              ].map(item=>(
                <div key={item.label} style={{background:C.surface,borderRadius:10,padding:"10px 12px",border:`1px solid ${item.label==="Left Over"?item.color+"40":C.border}`}}>
                  <div className="lbl">{item.label}</div>
                  <div style={{fontSize:14,fontWeight:700,color:item.color,fontFamily:"'Syne',sans-serif"}}>{item.val>=0?"+":""}{fc(Math.abs(item.val))}</div>
                </div>
              ))}
            </div>
            {cashLeft<0&&<div style={{marginTop:10,padding:"8px 12px",background:`${C.expense}10`,borderRadius:10,fontSize:11,color:C.expense,fontFamily:"'Syne',sans-serif",fontWeight:700}}>🚨 Spending exceeds income! Cut expenses immediately.</div>}
          </div>

          {/* Health score */}
          <div className="g2" style={{marginBottom:12}}>
            <div className="card" style={{display:"flex",flexDirection:"column",alignItems:"center",textAlign:"center"}}>
              <div className="stitle">Health Score</div>
              <ScoreRing score={health.score} color={health.color}/>
              <div style={{fontSize:18,fontWeight:800,color:health.color,fontFamily:"'Syne',sans-serif",marginTop:8}}>Grade {health.grade}</div>
              <div style={{fontSize:11,color:C.muted,marginTop:4}}>{health.score>=85?"Excellent 🌟":health.score>=70?"Good 👍":health.score>=50?"Needs work ⚠️":"Critical 🚨"}</div>
            </div>
            <div className="card">
              <div className="stitle">Breakdown</div>
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

          {/* Payoff plan */}
          <div className="card" style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12,flexWrap:"wrap",gap:8}}>
              <div><div className="stitle" style={{marginBottom:2}}>🏁 Loan Payoff Plan</div><div style={{fontSize:11,color:C.muted}}>Freed EMIs snowball into the next loan automatically.</div></div>
              {payoffPlan.some(p=>p.interestSaved>0)&&(
                <div style={{background:`${C.income}10`,border:`1px solid ${C.income}25`,borderRadius:10,padding:"8px 12px",textAlign:"right"}}>
                  <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:12,color:C.income}}>Save {fc(payoffPlan.reduce((s,p)=>s+p.interestSaved,0))}</div>
                  <div style={{fontSize:10,color:C.muted}}>{payoffPlan.reduce((s,p)=>s+p.monthsSaved,0)} months faster</div>
                </div>
              )}
            </div>
            {activeDebts.length===0?<div style={{textAlign:"center",padding:30,color:C.muted}}>🎉 No active debts!</div>:(
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {payoffPlan.map((d,i)=>{
                  const colors=["#f43f5e","#f59e0b","#38bdf8","#10b981","#a78bfa"];
                  const pc=colors[i%colors.length];
                  const pct=d.totalAmount?Math.min(100,((parseFloat(d.totalAmount)-d.bal)/parseFloat(d.totalAmount))*100):0;
                  return(
                    <div key={d.id} style={{background:C.surface,border:`1px solid ${i===0?pc+"50":C.border}`,borderRadius:12,padding:"13px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:6}}>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <div style={{width:24,height:24,borderRadius:"50%",background:pc+"20",color:pc,border:`2px solid ${pc}50`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:11}}>#{d.priority}</div>
                          <div><div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:13}}>{d.name}</div><div style={{fontSize:10,color:C.muted}}>{d.lender} · {d.interestRate}%</div></div>
                        </div>
                        <div style={{textAlign:"right"}}><div style={{fontSize:16,fontWeight:700,color:C.expense,fontFamily:"'Syne',sans-serif"}}>{fc(d.bal)}</div></div>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(95px,1fr))",gap:8,marginBottom:8}}>
                        <div><div className="lbl">EMI</div><div style={{fontSize:12}}>{fc(d.emi)}/mo</div></div>
                        <div><div className="lbl">Extra</div><div style={{fontSize:12,color:C.accent}}>{fc(d.extraApplied)}</div></div>
                        <div><div className="lbl">Normal</div><div style={{fontSize:12,color:C.muted}}>{d.normalMonths?`${d.normalMonths}mo`:"—"}</div></div>
                        <div><div className="lbl">With Extra ⚡</div><div style={{fontSize:12,color:C.income,fontWeight:700}}>{d.boostedMonths?`${d.boostedMonths}mo`:"—"}</div></div>
                        {d.monthsSaved>0&&<div><div className="lbl">Saved</div><div style={{fontSize:12,color:C.income,fontWeight:700}}>🎉 {d.monthsSaved}mo</div></div>}
                      </div>
                      {d.totalAmount>0&&<><div className="pbar"><div className="pfill" style={{width:`${pct}%`,background:pc}}/></div><div style={{fontSize:10,color:C.muted,marginTop:3}}>{pct.toFixed(0)}% repaid</div></>}
                      {i===0&&<div style={{marginTop:8,padding:"6px 10px",background:pc+"12",borderRadius:8,fontSize:11,color:pc,fontFamily:"'Syne',sans-serif",fontWeight:700}}>⭐ Put all extra funds here first</div>}
                      <div style={{display:"flex",gap:6,marginTop:10,flexWrap:"wrap"}}>
                        <button className="btn btn-g btn-sm" onClick={()=>{const v=prompt(`Record payment for ${d.name}?\nOutstanding: ${fc(d.bal)}`);const n=parseFloat(v);if(!isNaN(n)&&n>0)recordLoanPayment(d.id,n);}}>💸 Pay</button>
                        <button className="btn-ghost btn-sm" onClick={()=>openEditDebt(d)}>Edit</button>
                        <button className="btn btn-danger" onClick={()=>toggleDebtClosed(d.id)}>Mark Closed</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <button className="btn btn-v btn-sm" style={{marginTop:12}} onClick={()=>{setDebtForm({...EMPTY_DEBT});setEditDebtId(null);setShowDebtForm(true);}}>+ Add Loan</button>
          </div>

          {/* AI Advisor */}
          <div className="card">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
              <div><div className="stitle" style={{marginBottom:2}}>🤖 AI Financial Advisor</div><div style={{fontSize:11,color:C.muted}}>Personalised advice + insurance & investment plan</div></div>
              <button className="btn btn-ai btn-sm" onClick={getAdvice} disabled={aiLoading}>{aiLoading?"⏳ Analysing...":"✨ Get Advice"}</button>
            </div>
            {aiLoading&&<div>{[90,75,85,60,70].map((w,i)=><div key={i} className="shimmer" style={{height:14,marginBottom:10,width:w+"%"}}/>)}</div>}
            {!aiLoading&&aiAdvice&&<div style={{borderLeft:`3px solid ${C.loan}`,paddingLeft:14}}><div className="ai-txt">{aiAdvice}</div><div style={{fontSize:10,color:C.muted,marginTop:10}}>⚠️ For planning only. Consult a SEBI-registered advisor for investments.</div><button className="btn-ghost btn-sm" style={{marginTop:8}} onClick={getAdvice}>↻ Refresh</button></div>}
            {!aiLoading&&!aiAdvice&&<div style={{color:C.muted,fontSize:12,textAlign:"center",padding:20}}>Fill in your numbers above, then tap "Get Advice".</div>}
          </div>
        </>}

        {/* ════════ CREDIT CARDS ════════ */}
        {tab==="Cards"&&<>
          <div className="g4" style={{marginBottom:12}}>
            {[
              {label:"Total Outstanding", val:fc(totalCCOut),   color:C.expense},
              {label:"Total CC EMIs",     val:fc(totalCCEMI),   color:C.warning},
              {label:"# Cards",           val:creditCards.length,color:C.accent},
              {label:"Highest Util",      val:creditCards.length?Math.max(...creditCards.map(c=>((parseFloat(c.outstanding)||0)/(parseFloat(c.limit)||1)*100))).toFixed(0)+"%":"0%",color:C.credit},
            ].map(item=>(
              <div key={item.label} className="scard"><div className="lbl">{item.label}</div><div style={{fontSize:17,fontWeight:700,color:item.color,fontFamily:"'Syne',sans-serif"}}>{item.val}</div></div>
            ))}
          </div>

          {/* CC usage advice */}
          <div className="card" style={{marginBottom:12,borderColor:`${C.warning}30`}}>
            <div className="stitle">💡 Should You Use Credit Cards?</div>
            {effectiveIncome>0?(()=>{
              const dti=(totalEMI+totalCCEMI)/effectiveIncome;
              if(dti>0.5||totalCCOut>0){
                return<div style={{fontSize:12,lineHeight:1.8}}><div style={{color:C.expense,fontFamily:"'Syne',sans-serif",fontWeight:700,marginBottom:4}}>🚫 STOP using credit cards for new purchases</div><div style={{color:C.muted}}>EMIs are {(dti*100).toFixed(0)}% of income and you have ₹{totalCCOut.toLocaleString("en-IN")} outstanding. Switch to UPI/Debit only until debt clears.</div></div>;
              }else if(dti>0.3){
                return<div style={{fontSize:12,lineHeight:1.8}}><div style={{color:C.warning,fontFamily:"'Syne',sans-serif",fontWeight:700,marginBottom:4}}>⚠️ Use with caution</div><div style={{color:C.muted}}>Only for planned expenses you can pay in FULL before due date. Never carry a balance — 36% interest destroys finances.</div></div>;
              }
              return<div style={{fontSize:12,lineHeight:1.8}}><div style={{color:C.income,fontFamily:"'Syne',sans-serif",fontWeight:700,marginBottom:4}}>✅ Okay if used wisely</div><div style={{color:C.muted}}>Pay full statement amount monthly. Use for rewards/cashback only on already-budgeted spending.</div></div>;
            })():<div style={{fontSize:12,color:C.muted}}>Add monthly income in Plan tab for personalised advice.</div>}
          </div>

          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:14}}>Your Cards</div>
            <button className="btn btn-p btn-sm" onClick={()=>{setCcForm({...EMPTY_CC});setEditCCId(null);setShowCCForm(true);}}>+ Add Card</button>
          </div>

          {creditCards.length===0?<div className="card" style={{textAlign:"center",padding:40,color:C.muted}}>No credit cards added yet.</div>:(
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {creditCards.map(cc=>{
                const det=calcCCDetails(cc);
                const sc=det.status==="danger"?C.expense:det.status==="warning"?C.warning:C.income;
                return(
                  <div key={cc.id} className="card" style={{borderColor:det.status==="danger"?`${C.expense}40`:det.status==="warning"?`${C.warning}30`:C.border}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10,flexWrap:"wrap",gap:8}}>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <div style={{width:38,height:38,borderRadius:10,background:`${C.credit}15`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>💳</div>
                        <div><div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:14}}>{cc.name}</div><div style={{fontSize:11,color:C.muted}}>{cc.bank} · {cc.interestRate}% p.a.</div></div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:17,fontWeight:700,color:C.expense,fontFamily:"'Syne',sans-serif"}}>{fc(cc.outstanding)}</div>
                        <div style={{fontSize:10,color:C.muted}}>of {fc(cc.limit)} limit</div>
                      </div>
                    </div>
                    <div style={{marginBottom:10}}>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:C.muted,marginBottom:4}}><span>Utilization</span><span style={{color:sc,fontWeight:700}}>{det.utilization.toFixed(0)}% {det.status==="danger"?"🔴":det.status==="warning"?"🟡":"🟢"}</span></div>
                      <div className="pbar"><div className="pfill" style={{width:`${Math.min(det.utilization,100)}%`,background:sc}}/></div>
                      <div style={{fontSize:10,color:C.muted,marginTop:3}}>Keep below 30% for good credit score</div>
                    </div>
                    {cc.hasEMI&&(
                      <div style={{marginBottom:10,padding:"8px 12px",background:`${C.warning}10`,border:`1px solid ${C.warning}20`,borderRadius:10}}>
                        <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:11,color:C.warning}}>💳 CC EMI Running</div>
                        <div style={{fontSize:12,marginTop:2}}>{fc(cc.emiAmount)}/mo · {cc.emiMonthsLeft} months left</div>
                      </div>
                    )}
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:10,marginBottom:10}}>
                      <div style={{background:C.surface,borderRadius:10,padding:"9px"}}>
                        <div className="lbl">Min Due</div>
                        <div style={{fontSize:14,fontWeight:700,color:C.warning,fontFamily:"'Syne',sans-serif"}}>{fc(det.minDue)}</div>
                        <div style={{fontSize:10,color:C.muted}}>to avoid late fee</div>
                      </div>
                      <div style={{background:`${C.income}10`,border:`1px solid ${C.income}20`,borderRadius:10,padding:"9px"}}>
                        <div className="lbl">Full Payment ✓</div>
                        <div style={{fontSize:14,fontWeight:700,color:C.income,fontFamily:"'Syne',sans-serif"}}>{fc(det.idealPayment)}</div>
                        <div style={{fontSize:10,color:C.muted}}>saves {fc(det.interestSavedByFull)}/mo interest</div>
                      </div>
                      {cc.dueDate&&<div><div className="lbl">Due Date</div><div style={{fontSize:13,fontWeight:600}}>{fd(cc.dueDate)}</div><DueBadge days={det.daysLeft}/></div>}
                      {cc.statementDate&&<div><div className="lbl">Statement</div><div style={{fontSize:13}}>{cc.statementDate}</div></div>}
                    </div>
                    <div style={{padding:"8px 12px",background:det.status==="danger"?`${C.expense}10`:C.surface,borderRadius:10,fontSize:11,marginBottom:10,color:det.status==="danger"?C.expense:C.muted,lineHeight:1.6}}>
                      {det.status==="danger"?`🚨 Over 80% utilized! Pay full amount ${fc(det.idealPayment)} to protect credit score.`:det.status==="warning"?`⚠️ High utilization. Avoid new purchases.`:`✅ Healthy. Pay ${fc(det.idealPayment)} in full before due date.`}
                    </div>
                    <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
                      <button className="btn btn-g btn-sm" onClick={()=>{const v=prompt(`Pay how much for ${cc.name}?\nOutstanding: ${fc(cc.outstanding)}`);const n=parseFloat(v);if(!isNaN(n)&&n>0)recordCCPayment(cc.id,n);}}>💸 Pay Bill</button>
                      <button className="btn-ghost btn-sm" onClick={()=>openEditCC(cc)}>Edit</button>
                      <button className="btn btn-danger" onClick={()=>deleteCC(cc.id)}>Delete</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>}

        {/* ════════ TRANSACTIONS ════════ */}
        {tab==="Transactions"&&<>
          <div className="card" style={{marginBottom:10}}>
            <input className="inp" placeholder="🔍 Search..." value={txSearch} onChange={e=>setTxSearch(e.target.value)} style={{marginBottom:10}}/>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {[["all","All"],["income","Income"],["expense","Expense"]].map(([v,l])=>(
                <button key={v} className={`filter-btn ${txType===v?"on":""}`} onClick={()=>setTxType(v)}>{l}</button>
              ))}
              <select className="inp" value={txMode} onChange={e=>setTxMode(e.target.value)} style={{width:"auto",fontSize:11,padding:"4px 8px"}}>
                <option value="all">All Modes</option>{PAYMENT_MODES.map(m=><option key={m}>{m}</option>)}
              </select>
              <select className="inp" value={txBank} onChange={e=>setTxBank(e.target.value)} style={{width:"auto",fontSize:11,padding:"4px 8px"}}>
                <option value="all">All Banks</option>{banks.map(b=><option key={b}>{b}</option>)}
              </select>
              <button className="btn-ghost btn-sm" onClick={()=>{setTxSearch("");setTxType("all");setTxMode("all");setTxBank("all");}}>Clear</button>
              <button className="btn-ghost btn-sm" onClick={()=>setShowImport(true)}>⬆ Import</button>
              <button className="btn-ghost btn-sm" onClick={exportTransactions}>⬇ CSV</button>
            </div>
          </div>
          <div className="card">
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
              <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:12}}>{filteredTx.length} transactions</div>
              <div style={{fontSize:11,color:C.muted}}><span style={{color:C.income}}>+{fc(filteredTx.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0))}</span> / <span style={{color:C.expense}}>-{fc(filteredTx.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0))}</span></div>
            </div>
            {filteredTx.length===0?<div style={{color:C.muted,textAlign:"center",padding:30,fontSize:12}}>No transactions found.</div>:filteredTx.map(t=>(
              <div key={t.id} className="row">
                <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0,flex:1}}>
                  <div style={{width:32,height:32,borderRadius:8,background:(t.type==="income"?C.income:C.expense)+"18",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{t.type==="income"?"↑":"↓"}</div>
                  <div style={{minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:500,display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
                      <span>{t.category}</span>
                      {t.paymentMode&&<span className="tag" style={{background:C.surface,color:C.muted,fontSize:9}}>{t.paymentMode}</span>}
                      {t.bank&&<span className="tag" style={{background:C.surface,color:C.muted,fontSize:9}}>{t.bank}</span>}
                    </div>
                    <div style={{fontSize:10,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.note?`${t.note} · `:""}{fd(t.date)}</div>
                  </div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                  <span style={{color:t.type==="income"?C.income:C.expense,fontWeight:600,fontSize:12}}>{t.type==="income"?"+":"-"}{fc(t.amount)}</span>
                  <button className="btn-ghost btn-sm" style={{padding:"3px 7px"}} onClick={()=>openEditTx(t)}>✏️</button>
                  <button className="btn btn-danger" onClick={()=>deleteTx(t.id)}>×</button>
                </div>
              </div>
            ))}
          </div>
        </>}

        {/* ════════ BUDGET ════════ */}
        {tab==="Budget"&&<>
          <div className="card" style={{marginBottom:12}}>
            <div className="stitle">Set Monthly Limit</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <select className="inp" style={{flex:"1 1 140px"}} value={budgetForm.category} onChange={e=>setBudgetForm(p=>({...p,category:e.target.value}))}>{CATEGORIES.expense.map(c=><option key={c}>{c}</option>)}</select>
              <input className="inp" style={{flex:"1 1 120px"}} placeholder="₹ limit" type="number" value={budgetForm.limit} onChange={e=>setBudgetForm(p=>({...p,limit:e.target.value}))}/>
              <button className="btn btn-p" onClick={addBudget}>Set</button>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(230px,1fr))",gap:10}}>
            {CATEGORIES.expense.map((cat,i)=>{
              const limit=budgets[cat]||0, spent=transactions.filter(t=>t.type==="expense"&&t.category===cat).reduce((s,t)=>s+t.amount,0);
              const pct=limit>0?Math.min(100,(spent/limit)*100):0, over=spent>limit&&limit>0;
              return(
                <div key={cat} className="card">
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:8,height:8,borderRadius:"50%",background:CAT_COLORS[i]}}/><span style={{fontFamily:"'Syne',sans-serif",fontWeight:600,fontSize:12}}>{cat}</span></div>
                    {over&&<span className="tag" style={{background:`${C.expense}15`,color:C.expense}}>Over!</span>}
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:C.muted,marginBottom:6}}><span>{fc(spent)}</span><span>{limit>0?fc(limit):"No limit"}</span></div>
                  <div className="pbar"><div className="pfill" style={{width:`${pct}%`,background:over?C.expense:CAT_COLORS[i]}}/></div>
                  {limit>0&&<div style={{fontSize:10,color:C.muted,marginTop:4}}>{pct.toFixed(0)}% used</div>}
                </div>
              );
            })}
          </div>
        </>}

        {/* ════════ GOALS ════════ */}
        {tab==="Goals"&&<>
          <div className="card" style={{marginBottom:12,borderColor:`${C.loan}25`,background:`${C.loan}04`}}>
            <div className="stitle">🛡️ After Debt: Your Roadmap</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(210px,1fr))",gap:10}}>
              {[
                {step:"Step 1 — NOW",       title:"Health Insurance",   desc:"Get ₹5-10L cover immediately even while in debt. ~₹8-15k/year.",     color:C.expense},
                {step:"Step 2 — NOW",       title:"Term Life Insurance",desc:`10-15x income = ${fc((effectiveIncome*12*12)||5000000)} cover. ~₹10-20k/year.`, color:C.warning},
                {step:"Step 3 — After debt",title:"6-Month Emergency Fund",desc:`Build ${fc((totalExpense||effectiveIncome*0.7)*6)} in liquid FD/savings.`, color:C.accent},
                {step:"Step 4 — After debt",title:"Start SIP",          desc:"₹2-5k/month in Nifty 50 index fund. Increase yearly.",                color:C.income},
                {step:"Step 5 — Long term", title:"NPS + PPF",          desc:"NPS for ₹50k extra tax deduction. PPF for safe 7%+ growth.",          color:C.savings},
              ].map(item=>(
                <div key={item.title} style={{background:C.card,border:`1px solid ${item.color}25`,borderRadius:10,padding:"12px"}}>
                  <div style={{fontSize:9,color:item.color,fontFamily:"'Syne',sans-serif",fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>{item.step}</div>
                  <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:12,marginBottom:4}}>{item.title}</div>
                  <div style={{fontSize:11,color:C.muted,lineHeight:1.6}}>{item.desc}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="card" style={{marginBottom:12}}>
            <div className="stitle">Add Savings Goal</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <input className="inp" style={{flex:"2 1 140px"}} placeholder="Goal name" value={savForm.name} onChange={e=>setSavForm(p=>({...p,name:e.target.value}))}/>
              <input className="inp" style={{flex:"1 1 100px"}} placeholder="Target ₹" type="number" value={savForm.goal} onChange={e=>setSavForm(p=>({...p,goal:e.target.value}))}/>
              <input className="inp" style={{flex:"1 1 100px"}} placeholder="Saved ₹" type="number" value={savForm.current} onChange={e=>setSavForm(p=>({...p,current:e.target.value}))}/>
              <button className="btn btn-g" onClick={addGoal}>Add</button>
            </div>
          </div>
          {savings.length===0?<div className="card" style={{textAlign:"center",color:C.muted,padding:40,fontSize:12}}>No goals yet. Suggested: Emergency Fund, Health Insurance Premium.</div>:(
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:12}}>
              {savings.map(s=>{
                const pct=Math.min(100,(s.current/s.goal)*100);
                return(
                  <div key={s.id} className="card">
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
                      <div><div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:14}}>{s.name}</div><div style={{fontSize:10,color:C.muted}}>Goal: {fc(s.goal)}</div></div>
                      <div style={{fontSize:18,fontWeight:700,color:C.savings,fontFamily:"'Syne',sans-serif"}}>{pct.toFixed(0)}%</div>
                    </div>
                    <div className="pbar" style={{marginBottom:8}}><div className="pfill" style={{width:`${pct}%`,background:`linear-gradient(90deg,${C.savings},${C.accent})`}}/></div>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:10,color:C.muted}}><span style={{color:C.income}}>{fc(s.current)} saved</span><span>{fc(Math.max(0,s.goal-s.current))} left</span></div>
                    <div style={{display:"flex",gap:6}}>
                      <input id={`g-${s.id}`} className="inp" type="number" placeholder="Add ₹" style={{flex:1}}/>
                      <button className="btn btn-g btn-sm" onClick={()=>{const v=parseFloat(document.getElementById(`g-${s.id}`).value);if(!isNaN(v)&&v>0){updateGoal(s.id,v);document.getElementById(`g-${s.id}`).value="";}}}>+</button>
                      <button className="btn btn-danger" onClick={()=>setSavings(p=>p.filter(g=>g.id!==s.id))}>×</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>}

        {/* ════════ INSIGHTS ════════ */}
        {tab==="Insights"&&<>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10,marginBottom:12}}>
            {[
              {label:"Savings Rate",  val:`${effectiveIncome>0?((effectiveIncome-totalExpense)/effectiveIncome*100).toFixed(1):0}%`, color:C.income},
              {label:"Avg Mo. Expense",val:fc(last6Months.reduce((s,m)=>s+m.expense,0)/6),                                         color:C.expense},
              {label:"Debt-to-Income", val:`${effectiveIncome>0?((totalEMI+totalCCEMI)/effectiveIncome*100).toFixed(0):0}%`,        color:(totalEMI+totalCCEMI)/Math.max(effectiveIncome,1)>0.4?C.expense:C.income},
              {label:"Top Mode",       val:expenseByMode.sort((a,b)=>b.value-a.value)[0]?.name||"—",                              color:C.accent},
            ].map(item=>(
              <div key={item.label} className="scard" style={{textAlign:"center"}}>
                <div className="lbl" style={{textAlign:"center"}}>{item.label}</div>
                <div style={{fontSize:18,fontWeight:700,color:item.color,fontFamily:"'Syne',sans-serif"}}>{item.val}</div>
              </div>
            ))}
          </div>
          <div className="g2" style={{marginBottom:12}}>
            <div className="card">
              <div className="stitle">Income vs Expense</div>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={last6Months}>
                  <XAxis dataKey="label" tick={{fill:C.muted,fontSize:9}} axisLine={false} tickLine={false}/>
                  <YAxis tick={{fill:C.muted,fontSize:9}} axisLine={false} tickLine={false} tickFormatter={v=>`₹${v>=1000?(v/1000).toFixed(0)+"k":v}`} width={36}/>
                  <Tooltip contentStyle={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,fontSize:11}} formatter={v=>fc(v)}/>
                  <Line type="monotone" dataKey="income" stroke={C.income} strokeWidth={2} dot={{fill:C.income,r:3}}/>
                  <Line type="monotone" dataKey="expense" stroke={C.expense} strokeWidth={2} dot={{fill:C.expense,r:3}}/>
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="card">
              <div className="stitle">By Category</div>
              {expenseByCat.length===0?<div style={{color:C.muted,textAlign:"center",paddingTop:50,fontSize:12}}>No data</div>:(
                <div style={{overflowY:"auto",maxHeight:160}}>
                  {expenseByCat.sort((a,b)=>b.value-a.value).map((d,i)=>{
                    const max=expenseByCat[0].value;
                    return(
                      <div key={d.name} style={{marginBottom:8}}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                          <div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:7,height:7,borderRadius:"50%",background:d.color}}/><span style={{fontSize:11,fontFamily:"'Syne',sans-serif",fontWeight:600}}>{d.name}</span></div>
                          <span style={{fontSize:11}}>{fc(d.value)}</span>
                        </div>
                        <div className="pbar"><div className="pfill" style={{width:`${(d.value/max)*100}%`,background:d.color}}/></div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>}
      </div>

      {/* ── Mobile Bottom Nav ── */}
      <nav className="bnav">
        {MOBILE_TABS.map(t=>(
          <button key={t.id} className={`bn ${tab===t.id?"act":""}`} onClick={()=>setTab(t.id)}>
            <span style={{fontSize:18}}>{t.icon}</span>{t.label}
          </button>
        ))}
      </nav>
      <button className="fab" onClick={()=>{setTxForm({...EMPTY_TX});setEditTxId(null);setShowTxForm(true);}}>+</button>

      {/* ══════ MODALS ══════ */}

      {/* Add/Edit Transaction */}
      {showTxForm&&(
        <div className="modal" onClick={e=>e.target===e.currentTarget&&(setShowTxForm(false),setEditTxId(null))}>
          <div className="sheet">
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:17,marginBottom:14}}>{editTxId?"Edit":"Add"} Transaction</div>
            <div style={{display:"flex",gap:6,marginBottom:14,background:C.surface,padding:4,borderRadius:12}}>
              {["expense","income"].map(type=>(
                <button key={type} className="btn" onClick={()=>setTxForm(p=>({...p,type,category:CATEGORIES[type][0]}))} style={{flex:1,background:txForm.type===type?(type==="income"?C.income:C.expense):"transparent",color:txForm.type===type?"#fff":C.muted}}>
                  {type==="income"?"↑ Income":"↓ Expense"}
                </button>
              ))}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <div><div className="lbl">Amount ₹</div><input className="inp" type="number" placeholder="0" value={txForm.amount} onChange={e=>setTxForm(p=>({...p,amount:e.target.value}))}/></div>
              <div className="g2">
                <div><div className="lbl">Category</div><select className="inp" value={txForm.category} onChange={e=>setTxForm(p=>({...p,category:e.target.value}))}>{CATEGORIES[txForm.type].map(c=><option key={c}>{c}</option>)}</select></div>
                <div><div className="lbl">Payment Mode</div><select className="inp" value={txForm.paymentMode} onChange={e=>setTxForm(p=>({...p,paymentMode:e.target.value}))}>{PAYMENT_MODES.map(m=><option key={m}>{m}</option>)}</select></div>
              </div>
              <div className="g2">
                <div><div className="lbl">Bank / Account</div><select className="inp" value={txForm.bank} onChange={e=>setTxForm(p=>({...p,bank:e.target.value}))}><option value="">Select</option>{banks.map(b=><option key={b}>{b}</option>)}</select></div>
                <div><div className="lbl">Date</div><input className="inp" type="date" value={txForm.date} onChange={e=>setTxForm(p=>({...p,date:e.target.value}))}/></div>
              </div>
              <div><div className="lbl">Note</div><input className="inp" placeholder="What was this for?" value={txForm.note} onChange={e=>setTxForm(p=>({...p,note:e.target.value}))}/></div>
              <div style={{display:"flex",gap:9,marginTop:4}}>
                <button className="btn" onClick={()=>{setShowTxForm(false);setEditTxId(null);}} style={{flex:1,background:C.border,color:C.muted}}>Cancel</button>
                <button className="btn btn-p" onClick={saveTx} style={{flex:2}}>{editTxId?"Save Changes":"Add Transaction"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Loan */}
      {showDebtForm&&(
        <div className="modal" onClick={e=>e.target===e.currentTarget&&(setShowDebtForm(false),setEditDebtId(null))}>
          <div className="sheet">
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:17,marginBottom:14}}>{editDebtId?"Edit":"Add"} Loan</div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <div className="g2">
                <div><div className="lbl">Loan Name *</div><input className="inp" placeholder="e.g. Home Loan" value={debtForm.name} onChange={e=>setDebtForm(p=>({...p,name:e.target.value}))}/></div>
                <div><div className="lbl">Bank / Lender</div><input className="inp" placeholder="e.g. SBI" value={debtForm.lender} onChange={e=>setDebtForm(p=>({...p,lender:e.target.value}))}/></div>
              </div>
              <div className="g2">
                <div><div className="lbl">Outstanding ₹ *</div><input className="inp" type="number" value={debtForm.outstanding} onChange={e=>setDebtForm(p=>({...p,outstanding:e.target.value}))}/></div>
                <div><div className="lbl">Original Total ₹</div><input className="inp" type="number" value={debtForm.totalAmount} onChange={e=>setDebtForm(p=>({...p,totalAmount:e.target.value}))}/></div>
              </div>
              <div className="g2">
                <div><div className="lbl">EMI ₹/month</div><input className="inp" type="number" value={debtForm.emi} onChange={e=>setDebtForm(p=>({...p,emi:e.target.value}))}/></div>
                <div><div className="lbl">Interest Rate %</div><input className="inp" type="number" placeholder="e.g. 12" value={debtForm.interestRate} onChange={e=>setDebtForm(p=>({...p,interestRate:e.target.value}))}/></div>
              </div>
              <div className="g2">
                <div><div className="lbl">Next Due Date</div><input className="inp" type="date" value={debtForm.dueDate} onChange={e=>setDebtForm(p=>({...p,dueDate:e.target.value}))}/></div>
                <div><div className="lbl">Tenure</div><input className="inp" placeholder="e.g. 5 years" value={debtForm.tenure} onChange={e=>setDebtForm(p=>({...p,tenure:e.target.value}))}/></div>
              </div>
              <div><div className="lbl">Notes</div><input className="inp" placeholder="Any notes" value={debtForm.notes} onChange={e=>setDebtForm(p=>({...p,notes:e.target.value}))}/></div>
              <div style={{display:"flex",gap:9}}>
                <button className="btn" onClick={()=>{setShowDebtForm(false);setEditDebtId(null);}} style={{flex:1,background:C.border,color:C.muted}}>Cancel</button>
                <button className="btn btn-v" onClick={saveDebt} style={{flex:2}}>{editDebtId?"Save":"Add Loan"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Credit Card */}
      {showCCForm&&(
        <div className="modal" onClick={e=>e.target===e.currentTarget&&(setShowCCForm(false),setEditCCId(null))}>
          <div className="sheet">
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:17,marginBottom:14}}>{editCCId?"Edit":"Add"} Credit Card</div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <div className="g2">
                <div><div className="lbl">Card Name *</div><input className="inp" placeholder="e.g. HDFC Millennia" value={ccForm.name} onChange={e=>setCcForm(p=>({...p,name:e.target.value}))}/></div>
                <div><div className="lbl">Bank</div><input className="inp" placeholder="e.g. HDFC" value={ccForm.bank} onChange={e=>setCcForm(p=>({...p,bank:e.target.value}))}/></div>
              </div>
              <div className="g2">
                <div><div className="lbl">Credit Limit ₹</div><input className="inp" type="number" value={ccForm.limit} onChange={e=>setCcForm(p=>({...p,limit:e.target.value}))}/></div>
                <div><div className="lbl">Current Outstanding ₹</div><input className="inp" type="number" value={ccForm.outstanding} onChange={e=>setCcForm(p=>({...p,outstanding:e.target.value}))}/></div>
              </div>
              <div className="g2">
                <div><div className="lbl">Min Due ₹</div><input className="inp" type="number" placeholder="Auto if blank" value={ccForm.minDue} onChange={e=>setCcForm(p=>({...p,minDue:e.target.value}))}/></div>
                <div><div className="lbl">Interest Rate % p.a.</div><input className="inp" type="number" placeholder="36" value={ccForm.interestRate} onChange={e=>setCcForm(p=>({...p,interestRate:e.target.value}))}/></div>
              </div>
              <div className="g2">
                <div><div className="lbl">Statement Date</div><input className="inp" placeholder="e.g. 15th" value={ccForm.statementDate} onChange={e=>setCcForm(p=>({...p,statementDate:e.target.value}))}/></div>
                <div><div className="lbl">Payment Due Date</div><input className="inp" type="date" value={ccForm.dueDate} onChange={e=>setCcForm(p=>({...p,dueDate:e.target.value}))}/></div>
              </div>
              {/* CC EMI Section */}
              <div style={{background:C.surface,borderRadius:12,padding:"12px",border:`1px solid ${C.border}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:12}}>💳 Has CC EMI?</div>
                  <button onClick={()=>setCcForm(p=>({...p,hasEMI:!p.hasEMI}))} style={{padding:"4px 12px",borderRadius:20,border:`1px solid ${ccForm.hasEMI?C.income:C.border}`,background:ccForm.hasEMI?`${C.income}15`:"transparent",color:ccForm.hasEMI?C.income:C.muted,cursor:"pointer",fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:11}}>
                    {ccForm.hasEMI?"Yes ✓":"No"}
                  </button>
                </div>
                {ccForm.hasEMI&&(
                  <div className="g2">
                    <div><div className="lbl">EMI Amount ₹/month</div><input className="inp" type="number" placeholder="e.g. 3000" value={ccForm.emiAmount} onChange={e=>setCcForm(p=>({...p,emiAmount:e.target.value}))}/></div>
                    <div><div className="lbl">Months Remaining</div><input className="inp" type="number" placeholder="e.g. 12" value={ccForm.emiMonthsLeft} onChange={e=>setCcForm(p=>({...p,emiMonthsLeft:e.target.value}))}/></div>
                  </div>
                )}
              </div>
              <div><div className="lbl">Notes</div><input className="inp" placeholder="Any notes" value={ccForm.notes} onChange={e=>setCcForm(p=>({...p,notes:e.target.value}))}/></div>
              <div style={{display:"flex",gap:9}}>
                <button className="btn" onClick={()=>{setShowCCForm(false);setEditCCId(null);}} style={{flex:1,background:C.border,color:C.muted}}>Cancel</button>
                <button className="btn btn-p" onClick={saveCC} style={{flex:2}}>{editCCId?"Save":"Add Card"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import CSV */}
      {showImport&&(
        <div className="modal" onClick={e=>e.target===e.currentTarget&&setShowImport(false)}>
          <div className="sheet">
            <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:17,marginBottom:8}}>⬆ Import Bank CSV</div>
            <div style={{fontSize:11,color:C.muted,marginBottom:14,lineHeight:1.7}}>Export your bank statement from net banking/app as CSV. We auto-detect the format — SBI, HDFC, ICICI, Axis, Kotak, Paytm, PhonePe all work.</div>
            <div style={{padding:"20px",border:`2px dashed ${C.border}`,borderRadius:12,textAlign:"center",marginBottom:12,cursor:"pointer",background:C.surface}} onClick={()=>fileRef.current?.click()}>
              <div style={{fontSize:28,marginBottom:6}}>📄</div>
              <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:13}}>Tap to select CSV</div>
              <div style={{fontSize:11,color:C.muted}}>Supports most Indian bank formats</div>
              <input ref={fileRef} type="file" accept=".csv,.txt" style={{display:"none"}} onChange={handleImport}/>
            </div>
            {importMsg&&<div style={{padding:"10px 14px",borderRadius:10,marginBottom:10,fontSize:12,background:importMsg.startsWith("✅")?`${C.income}12`:`${C.expense}12`,color:importMsg.startsWith("✅")?C.income:C.expense}}>{importMsg}</div>}
            {importPreview.length>0&&importPreview.map((t,i)=>(
              <div key={i} className="row" style={{fontSize:11}}>
                <span style={{color:C.muted}}>{t.date}</span><span>{t.category}</span>
                <span style={{color:t.type==="income"?C.income:C.expense,fontWeight:600}}>{t.type==="income"?"+":"-"}{fc(t.amount)}</span>
              </div>
            ))}
            <button className="btn-ghost" onClick={()=>{setShowImport(false);setImportMsg("");setImportPreview([]);}} style={{width:"100%",marginTop:12,textAlign:"center"}}>Close</button>
          </div>
        </div>
      )}

      {/* Settings */}
      {showSettings&&<SettingsModal C={C} salary={salary} setSalary={setSalary} banks={banks} 
    setBanks={setBanks} onClose={() => setShowSettings(false)} />}
    </div>
  );
}

// ─── SETTINGS MODAL ──────────────────────────────────────────────────────────
function SettingsModal({ C, salary, setSalary, banks, setBanks, onClose }) {
  const [newBank, setNewBank] = useState("");

  return(
    <div className="modal" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="sheet">
        <div style={{fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:17,marginBottom:18}}>⚙️ Settings</div>

        {/* Auto Salary */}
        <div style={{marginBottom:20}}>
          <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:13,marginBottom:10,color:C.accent}}>💰 Auto Monthly Salary</div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:12,color:C.muted}}>Auto-add salary every month</div>
            <button onClick={()=>setSalary(p=>({...p,active:!p.active}))} style={{padding:"5px 14px",borderRadius:20,border:`1px solid ${salary.active?C.income:C.border}`,background:salary.active?`${C.income}15`:"transparent",color:salary.active?C.income:C.muted,cursor:"pointer",fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:11}}>
              {salary.active?"ON ✓":"OFF"}
            </button>
          </div>
          {salary.active&&(
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              <div><div className="lbl">Monthly Salary ₹</div><input className="inp" type="number" placeholder="e.g. 50000" value={salary.amount} onChange={e=>setSalary(p=>({...p,amount:e.target.value}))}/></div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <div><div className="lbl">Credit Day (date of month)</div><input className="inp" type="number" min="1" max="31" placeholder="1" value={salary.creditDay} onChange={e=>setSalary(p=>({...p,creditDay:e.target.value}))}/></div>
                <div><div className="lbl">Bank Account</div><select className="inp" value={salary.bank} onChange={e=>setSalary(p=>({...p,bank:e.target.value}))}><option value="">Select bank</option>{banks.map(b=><option key={b}>{b}</option>)}</select></div>
              </div>
              <div style={{fontSize:11,color:C.muted,padding:"8px 12px",background:`${C.income}10`,borderRadius:8}}>Salary of ₹{parseInt(salary.amount||0).toLocaleString("en-IN")} will be auto-added on day {salary.creditDay} of each month.</div>
            </div>
          )}
        </div>

        {/* Banks */}
        <div style={{marginBottom:20}}>
          <div style={{fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:13,marginBottom:10,color:C.accent}}>🏦 My Banks</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
            {banks.map(b=>(
              <div key={b} style={{display:"flex",alignItems:"center",gap:4,background:C.surface,borderRadius:8,padding:"4px 10px",border:`1px solid ${C.border}`}}>
                <span style={{fontSize:12}}>{b}</span>
                <button onClick={()=>setBanks(p=>p.filter(x=>x!==b))} style={{background:"transparent",border:"none",color:C.muted,cursor:"pointer",fontSize:12}}>×</button>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:8}}>
            <input className="inp" placeholder="Add bank name" value={newBank} onChange={e=>setNewBank(e.target.value)} style={{flex:1}}/>
            <button className="btn btn-p btn-sm" onClick={()=>{if(newBank.trim()&&!banks.includes(newBank.trim())){setBanks(p=>[...p,newBank.trim()]);setNewBank("");}}}>Add</button>
          </div>
        </div>


        {/* Lock */}
        <button className="btn-ghost" onClick={onClose} style={{width:"100%",textAlign:"center"}}>Close</button>
      </div>
    </div>
  );
}
