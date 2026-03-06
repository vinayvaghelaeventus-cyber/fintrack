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
const DARK  = {
  income:"#00e5a0", expense:"#ff4d6d", savings:"#7c6af7", 
  bg:"#070810", card:"#0e1019", border:"#1a1d2e", text:"#eef0f8",
  muted:"#4a5068", accent:"#5b8def", warning:"#ffb547", loan:"#b48af7",
  credit:"#ff7a45", surface:"#131622", inputBg:"#0a0c14",
  glass:"rgba(14,16,25,0.85)", glow:"rgba(91,141,239,0.15)"
};
const LIGHT = {
  income:"#00a870", expense:"#e8294a", savings:"#5b4fd4",
  bg:"#f5f7ff", card:"#ffffff", border:"#e8eaf5", text:"#0d0f1e",
  muted:"#8890b0", accent:"#3d6fe8", warning:"#e89a00", loan:"#7c5fd4",
  credit:"#e85a20", surface:"#f0f2fc", inputBg:"#eceffe",
  glass:"rgba(255,255,255,0.9)", glow:"rgba(61,111,232,0.1)"
};

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const PAYMENT_MODES = ["UPI","Credit Card","Debit Card","Cash","Net Banking","Wallet","EMI","Other"];
const CATEGORIES = {
  income:  ["Salary","Freelance","Investment","Gift","Rental","Bonus","Other Income"],
  expense: ["Housing","Food","Transport","Entertainment","Health","Shopping","Utilities","Education","Loan EMI","Credit Card EMI","Credit Card Bill","Insurance","Travel","Medical","Groceries","Other"],
};
const CAT_COLORS = ["#38bdf8","#10b981","#f59e0b","#6366f1","#f43f5e","#a78bfa","#34d399","#fb923c","#e879f9","#22d3ee","#84cc16","#f472b6","#60a5fa","#fbbf24","#6ee7b7","#c084fc"];
const MOBILE_TABS = [
  {id:"Dashboard", icon:"🏠", label:"Home"},
  {id:"Transactions", icon:"📋", label:"Txns"},
  {id:"Finance",   icon:"📊", label:"Finance"},
  {id:"Plan",      icon:"🎯", label:"Plan"},
  {id:"Smart",     icon:"⚡", label:"Tools"},
];
const ALL_TABS = ["Dashboard","Transactions","Finance","Plan","Cards","Budget","Goals","Insights","Smart"];
const EMPTY_TX = {type:"expense",amount:"",category:"Food",paymentMode:"UPI",bank:"",note:"",date:new Date().toISOString().split("T")[0],time:new Date().toTimeString().slice(0,5),_accountId:""};
const EMPTY_DEBT = {name:"",lender:"",outstanding:"",totalAmount:"",emi:"",interestRate:"",dueDate:"",tenure:"",notes:""};
const EMPTY_CC   = {name:"",bank:"",limit:"",outstanding:"",minDue:"",statementDate:"",dueDate:"",interestRate:"36",notes:""};
const EMPTY_CC_EMI = {id:null, cardId:"", description:"", amount:"", monthsLeft:"", _totalMonths:""};
const EMPTY_SAL  = {amount:"",bank:"",creditDay:"1",active:true};
const EMPTY_ACCOUNT = {id:null, name:"", type:"savings", balance:"", bank:"", color:"#5b8def", icon:"🏦"};
const ACCOUNT_TYPES = ["savings","current","cash","wallet","fd","other"];
const ACCOUNT_ICONS = ["🏦","💰","💵","📱","🏧","💼"];
const EMPTY_RECURRING = {id:null, name:"", amount:"", category:"Utilities", type:"expense", dueDay:"1", frequency:"monthly", active:true, notes:""};
const RECURRING_ICONS = {"Netflix":"🎬","Spotify":"🎵","Amazon Prime":"📦","Hotstar":"📺","YouTube":"▶️","Electricity":"💡","Water":"💧","Gas":"🔥","Internet":"🌐","Mobile":"📱","Insurance":"🛡️","Rent":"🏠","Gym":"💪","Other":"📌"};
const RECURRING_SUGGESTIONS = ["Netflix","Spotify","Amazon Prime","Hotstar","YouTube Premium","Electricity","Water Bill","Gas","Internet","Mobile Recharge","Health Insurance","Life Insurance","Rent","Gym","Other"];

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const fc = n => new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(n||0);
const fd = d => { try { return new Date(d).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}); } catch { return "—"; }};
const today = () => new Date().toISOString().split("T")[0];
function daysUntil(ds){ if(!ds)return null; const d=new Date(ds),t=new Date(); t.setHours(0,0,0,0); d.setHours(0,0,0,0); return Math.ceil((d-t)/864e5); }
function toCSV(rows,headers){ return [headers.join(","),...rows.map(r=>headers.map(h=>{ const v=String(r[h]??""); return '"'+v.split('"').join('""')+'"'; }).join(","))].join("\n"); }
function dlCSV(c,f){ const a=document.createElement("a"); a.href="data:text/csv;charset=utf-8,\uFEFF"+encodeURIComponent(c); a.download=f; a.click(); }
function dlXLS(rows, headers, sheetName, filename) {
  const esc = v => String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const hRow = headers.map(h=>`<Cell ss:StyleID="h"><Data ss:Type="String">${esc(h)}</Data></Cell>`).join("");
  const dRows = rows.map(r=>`<Row>${headers.map(h=>{const v=r[h]??"";const isNum=typeof v==="number"||(v!==""&&!isNaN(v)&&h!=="Date"&&h!=="Notes");return `<Cell><Data ss:Type="${isNum?"Number":"String"}">${esc(v)}</Data></Cell>`;}).join("")}</Row>`).join("");
  const xml = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="h"><Font ss:Bold="1"/></Style></Styles><Worksheet ss:Name="${esc(sheetName)}"><Table><Row>${hRow}</Row>${dRows}</Table></Worksheet></Workbook>`;
  const blob = new Blob([xml],{type:"application/vnd.ms-excel;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href=url; a.download=filename; a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

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
const [ccEmis, setCcEmis] = useState([]);
    const [dashPeriod, setDashPeriod] = useState("month");
const [showCCEmiForm, setShowCCEmiForm] = useState(false);
const [ccEmiForm, setCcEmiForm] = useState({...EMPTY_CC_EMI});
  const [fbStatus, setFbStatus] = useState("loading");
  const C = darkMode ? DARK : LIGHT;

  // ── Data ──
  const [transactions, setTransactions] = useState([]);
  const [debts, setDebts]               = useState([]);
  const [creditCards, setCreditCards]   = useState([]);
  const [savings, setSavings]           = useState([]);
  const [budgets, setBudgets]           = useState({});
  const [banks, setBanks]               = useState(["SBI","HDFC","ICICI","Axis","Kotak"]);
  const [salary, setSalary]             = useState({...EMPTY_SAL});
  const [accounts, setAccounts]         = useState([]); // NEW: account register
  const [allocationPct, setAllocationPct] = useState({emi:45,living:30,savings:10,buffer:15}); // NEW
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
  const [showMenu, setShowMenu] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pullY, setPullY] = useState(0);
  const pullStartY = useRef(null);

  // Pull-to-refresh
  useEffect(()=>{
    const onTouchStart = e => { pullStartY.current = e.touches[0].clientY; };
    const onTouchMove = e => {
      if (pullStartY.current===null) return;
      const dy = e.touches[0].clientY - pullStartY.current;
      if (dy>0 && window.scrollY===0) setPullY(Math.min(dy*0.4, 70));
    };
    const onTouchEnd = async () => {
      if (pullY>=60) {
        setRefreshing(true);
        if (user) { try { const data=await loadData(user.uid); if(data){if(data.transactions)setTransactions(data.transactions);if(data.creditCards)setCreditCards(data.creditCards);if(data.ccEmis)setCcEmis(data.ccEmis);if(data.debts)setDebts(data.debts);if(data.savings)setSavings(data.savings);if(data.budgets)setBudgets(data.budgets);} } catch(e){} }
        await new Promise(r=>setTimeout(r,800));
        setRefreshing(false);
      }
      setPullY(0); pullStartY.current=null;
    };
    document.addEventListener('touchstart',onTouchStart,{passive:true});
    document.addEventListener('touchmove',onTouchMove,{passive:true});
    document.addEventListener('touchend',onTouchEnd);
    return()=>{document.removeEventListener('touchstart',onTouchStart);document.removeEventListener('touchmove',onTouchMove);document.removeEventListener('touchend',onTouchEnd);};
  },[pullY,user]);
  const [txForm, setTxForm]   = useState({...EMPTY_TX});
  const [debtForm, setDebtForm] = useState({...EMPTY_DEBT});
  const [ccForm, setCcForm]   = useState({...EMPTY_CC});
  const [budgetForm, setBudgetForm] = useState({category:"Food",limit:""});
  const [savForm, setSavForm] = useState({name:"",goal:"",current:""});
  const [importMsg, setImportMsg] = useState("");
  const [importPreview, setImportPreview] = useState([]);
  const fileRef = useRef();
  // NEW form states
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [accountForm, setAccountForm] = useState({...EMPTY_ACCOUNT});
  const [editAccountId, setEditAccountId] = useState(null);

  // ── Custom Categories ──
  const [customCats, setCustomCats] = useState({income:[], expense:[]});
  const [showCatManager, setShowCatManager] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatType, setNewCatType] = useState("expense");

  // ── Recurring Bills ──
  const [recurringBills, setRecurringBills] = useState([]);
  const [showRecurringForm, setShowRecurringForm] = useState(false);
  const [recurringForm, setRecurringForm] = useState({...EMPTY_RECURRING});
  const [editRecurringId, setEditRecurringId] = useState(null);

  // ── Export Panel ──
  const [showExportPanel, setShowExportPanel] = useState(false);
  const [exportDateFrom, setExportDateFrom] = useState("");
  const [exportDateTo, setExportDateTo] = useState("");


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
            if (data.ccEmis) setCcEmis(data.ccEmis);
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
          if (data.accounts)      setAccounts(data.accounts);
          if (data.allocationPct) setAllocationPct(data.allocationPct);
          if (data.customCats)    setCustomCats(data.customCats);
          if (data.recurringBills) setRecurringBills(data.recurringBills);
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
      if (!user) return;
      setSaving(true);
      const ok = await saveData(user.uid, {
        transactions, debts, creditCards, ccEmis, savings, budgets, banks, salary,
        monthlyIncome, extraFund, strategy, emergencyFund, aiAdvice, darkMode,
        accounts, allocationPct, customCats, recurringBills,
        lastUpdated: new Date().toISOString(),
      });
      setSaving(false);
      if (ok) setLastSaved(new Date());
      else setFbStatus("error");
    }, 1200);
  }, [transactions, debts, creditCards, ccEmis, savings, budgets, banks, salary,
      monthlyIncome, extraFund, strategy, emergencyFund, aiAdvice, darkMode,
      accounts, allocationPct, customCats, recurringBills, loaded]);

  // ─── AUTO-SALARY CREDIT ──────────────────────────────────────────────────
  useEffect(() => {
    if (!loaded || !salary.active || !salary.amount) return;
    const now = new Date();
    const creditDay = parseInt(salary.creditDay) || 1;
    const thisMonthKey = `sal_${now.getFullYear()}_${now.getMonth()}`;
    const alreadyCredited = transactions.some(t => t._salKey === thisMonthKey);
    if (alreadyCredited) return;
    if (now.getDate() >= creditDay) {
      const salAmt = parseFloat(salary.amount);
      const salAccount = accounts.find(a => a.bank && salary.bank && a.bank.toLowerCase().includes(salary.bank.toLowerCase()))
                      || accounts.find(a => a.type === "savings")
                      || accounts[0];
      const salTx = {
        id: Date.now(), type: "income", amount: salAmt,
        category: "Salary", paymentMode: "Net Banking", bank: salary.bank||"",
        note: "Auto: Monthly Salary", date: `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(creditDay).padStart(2,"0")}`,
        _salKey: thisMonthKey, _accountId: salAccount?.id || "",
      };
      setTransactions(p => [salTx, ...p]);
      if (salAccount) {
        setAccounts(p => p.map(a => a.id === salAccount.id ? {...a, balance: (parseFloat(a.balance)||0) + salAmt} : a));
      }
    }
  }, [loaded, salary, transactions]);

  // ─── EMI AUTO ENGINE ─────────────────────────────────────────────────────
  // Auto-deducts EMIs on due date, reduces loan balance, and handles catch-up
  useEffect(() => {
    if (!loaded) return;
    const now = new Date();
    const yr = now.getFullYear(), mo = now.getMonth();
    let txsToAdd = [], debtsToUpdate = {}, ccsToUpdate = {}, ccEmisToUpdate = {};

    // --- Loan EMIs ---
    debts.filter(d => !d.closed && d.dueDate && d.emi && d.autoEMI !== false).forEach(d => {
      const dueDay = new Date(d.dueDate).getDate();
      // Only current month (if today >= dueDay) and last month catch-up
      for (let mOffset = -1; mOffset <= 0; mOffset++) {
        const checkDate = new Date(yr, mo + mOffset, dueDay);
        // ✅ NEVER auto-deduct future or today-not-yet-due dates
        if (checkDate > now) continue;
        // For current month: only deduct if today >= due day
        if (mOffset === 0 && now.getDate() < dueDay) continue;
        const key = `emi_${d.id}_${checkDate.getFullYear()}_${checkDate.getMonth()}`;
        const already = transactions.some(t => t._emiKey === key);
        if (!already && checkDate <= now) {
          const amt = parseFloat(d.emi) || 0;
          txsToAdd.push({
            id: Date.now() + Math.random(), type: "expense", amount: amt,
            category: "Loan EMI", paymentMode: "Net Banking", bank: d.lender || "",
            note: `Auto EMI: ${d.name}`, date: checkDate.toISOString().split("T")[0],
            _emiKey: key, _debtId: d.id,
          });
          // Reduce outstanding
          debtsToUpdate[d.id] = Math.max(0, (debtsToUpdate[d.id] ?? parseFloat(d.outstanding) ?? 0) - amt);
        }
      }
    });

    // --- CC EMIs ---
    ccEmis.filter(e => e.autoEMI !== false && e.monthsLeft > 0).forEach(e => {
      const card = creditCards.find(c => String(c.id) === String(e.cardId));
      const dueDay = card?.dueDate ? new Date(card.dueDate).getDate() : null;
      if (!dueDay) return;
      for (let mOffset = -1; mOffset <= 0; mOffset++) {
        const checkDate = new Date(yr, mo + mOffset, dueDay);
        if (checkDate > now) continue;
        // For current month: only deduct if today >= due day
        if (mOffset === 0 && now.getDate() < dueDay) continue;
        const key = `ccemi_${e.id}_${checkDate.getFullYear()}_${checkDate.getMonth()}`;
        const already = transactions.some(t => t._emiKey === key);
        if (!already && checkDate <= now) {
          const amt = parseFloat(e.amount) || 0;
          txsToAdd.push({
            id: Date.now() + Math.random(), type: "expense", amount: amt,
            category: "Credit Card EMI", paymentMode: "Credit Card",
            bank: card?.name || "", note: `Auto CC EMI: ${e.description || card?.name || ""}`,
            date: checkDate.toISOString().split("T")[0],
            _emiKey: key, _ccEmiId: e.id,
          });
          ccEmisToUpdate[e.id] = Math.max(0, (ccEmisToUpdate[e.id] ?? parseInt(e.monthsLeft) ?? 0) - 1);
        }
      }
    });

    if (txsToAdd.length > 0) {
      setTransactions(p => [...txsToAdd, ...p]);
    }
    if (Object.keys(debtsToUpdate).length > 0) {
      setDebts(p => p.map(d => debtsToUpdate[d.id] !== undefined
        ? { ...d, outstanding: debtsToUpdate[d.id], closed: debtsToUpdate[d.id] === 0 }
        : d
      ));
    }
    if (Object.keys(ccEmisToUpdate).length > 0) {
      setCcEmis(p => p.map(e => ccEmisToUpdate[e.id] !== undefined
        ? { ...e, monthsLeft: ccEmisToUpdate[e.id] }
        : e
      ));
    }
    // Deduct from accounts
    if (txsToAdd.length > 0 && accounts.length > 0) {
      const totalAuto = txsToAdd.reduce((s, t) => s + t.amount, 0);
      const primaryAcc = accounts.find(a => a.type === "savings") || accounts[0];
      if (primaryAcc) {
        setAccounts(p => p.map(a => a.id === primaryAcc.id
          ? { ...a, balance: Math.max(0, (parseFloat(a.balance) || 0) - totalAuto) }
          : a
        ));
      }
    }
  }, [loaded, debts, ccEmis, creditCards, accounts]);

  // ─── RECURRING BILLS AUTO ENGINE ─────────────────────────────────────────
  useEffect(() => {
    if (!loaded || !recurringBills.length) return;
    const now = new Date();
    const yr = now.getFullYear(), mo = now.getMonth();
    const txsToAdd = [];

    recurringBills.filter(b => b.active && b.dueDay && b.amount).forEach(b => {
      const dueDay = parseInt(b.dueDay) || 1;
      // Check current month and last month for catch-up
      for (let mOffset = -1; mOffset <= 0; mOffset++) {
        const checkDate = new Date(yr, mo + mOffset, dueDay);
        const key = `rec_${b.id}_${checkDate.getFullYear()}_${checkDate.getMonth()}`;
        const already = transactions.some(t => t._recKey === key);
        if (!already && checkDate <= now) {
          txsToAdd.push({
            id: Date.now() + Math.random(),
            type: b.type || "expense",
            amount: parseFloat(b.amount),
            category: b.category || "Utilities",
            paymentMode: b.paymentMode || "UPI",
            bank: "",
            note: `Auto: ${b.name}`,
            date: checkDate.toISOString().split("T")[0],
            _recKey: key,
            _recurringId: b.id,
          });
        }
      }
    });

    if (txsToAdd.length > 0) {
      setTransactions(p => [...txsToAdd, ...p]);
    }
  }, [loaded, recurringBills]);

  // ─── COMPUTED ────────────────────────────────────────────────────────────
  const totalIncome    = useMemo(() => transactions.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0), [transactions]);
  const totalExpense   = useMemo(() => transactions.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0), [transactions]);
  const activeDebts    = useMemo(() => debts.filter(d=>!d.closed), [debts]);
  const totalEMI       = useMemo(() => activeDebts.reduce((s,d)=>s+(parseFloat(d.emi)||0),0), [activeDebts]);
  const totalOutstanding = useMemo(() => activeDebts.reduce((s,d)=>s+(parseFloat(d.outstanding)||0),0), [activeDebts]);
  const totalCCOut     = useMemo(() => creditCards.reduce((s,c)=>s+(parseFloat(c.outstanding)||0),0), [creditCards]);
  const totalCCEMI = useMemo(() => ccEmis.reduce((s,e)=>s+(parseFloat(e.amount)||0),0), [ccEmis]);
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


const filterByPeriod = useCallback((txList, period) => {
  const now = new Date(); now.setHours(23,59,59,999);
  return txList.filter(t=>{
    const d = new Date(t.date);
    if(period==="today"){ const s=new Date();s.setHours(0,0,0,0);return d>=s&&d<=now; }
    if(period==="week"){ const s=new Date();s.setDate(s.getDate()-7);s.setHours(0,0,0,0);return d>=s&&d<=now; }
    if(period==="month"){ return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear(); }
    if(period==="lastmonth"){ const lm=new Date(now.getFullYear(),now.getMonth()-1,1);return d.getMonth()===lm.getMonth()&&d.getFullYear()===lm.getFullYear(); }
    if(period==="3months"){ const s=new Date();s.setMonth(s.getMonth()-3);s.setHours(0,0,0,0);return d>=s&&d<=now; }
    return true;
  });
},[]);

    
  const upcomingDues  = useMemo(() => [
    ...activeDebts.filter(d=>d.dueDate).map(d=>({...d,days:daysUntil(d.dueDate),kind:"loan"})),
    ...creditCards.filter(c=>c.dueDate).map(c=>({...c,days:daysUntil(c.dueDate),kind:"cc"})),
  ].sort((a,b)=>a.days-b.days), [activeDebts, creditCards]);

  const overdueCount = upcomingDues.filter(d=>d.days<0).length;

  const expenseByMode = useMemo(() => PAYMENT_MODES.map(m=>({
    name:m, value:transactions.filter(t=>t.type==="expense"&&t.paymentMode===m).reduce((s,t)=>s+t.amount,0)
  })).filter(d=>d.value>0), [transactions]);

  // ─── MERGED CATEGORIES (default + custom) — must be before expenseByCat ──
  const allCategories = useMemo(() => ({
    income:  [...CATEGORIES.income,  ...(customCats.income ||[])],
    expense: [...CATEGORIES.expense, ...(customCats.expense||[])],
  }), [customCats]);

  const expenseByCat = useMemo(() => allCategories.expense.map((cat,i)=>({
    name:cat, value:transactions.filter(t=>t.type==="expense"&&t.category===cat).reduce((s,t)=>s+t.amount,0), color:CAT_COLORS[i]
  })).filter(d=>d.value>0), [transactions, allCategories]);

  const last6Months = useMemo(() => Array.from({length:6},(_,i)=>{
    const d=new Date(); d.setMonth(d.getMonth()-(5-i));
    const mo=d.getMonth(), yr=d.getFullYear(), lbl=d.toLocaleDateString("en-IN",{month:"short"});
    const inc=transactions.filter(t=>{const td=new Date(t.date);return t.type==="income"&&td.getMonth()===mo&&td.getFullYear()===yr;}).reduce((s,t)=>s+t.amount,0);
    const exp=transactions.filter(t=>{const td=new Date(t.date);return t.type==="expense"&&td.getMonth()===mo&&td.getFullYear()===yr;}).reduce((s,t)=>s+t.amount,0);
    return {label:lbl,income:inc,expense:exp};
  }), [transactions]);

  const filteredTx = useMemo(() => transactions
  .filter(t=>{
    if (txType!=="all"&&t.type!==txType) return false;
    if (txMode!=="all"&&t.paymentMode!==txMode) return false;
    if (txBank!=="all"&&t.bank!==txBank) return false;
    if (txSearch) { const q=txSearch.toLowerCase(); if (!t.category?.toLowerCase().includes(q)&&!(t.note||"").toLowerCase().includes(q)&&!String(t.amount).includes(q)) return false; }
    return true;
  })
  .sort((a,b)=>{
    const da = new Date(`${a.date}T${a.time||"00:00"}`);
    const db = new Date(`${b.date}T${b.time||"00:00"}`);
    return db - da;
  })
, [transactions,txType,txMode,txBank,txSearch]);

  // ─── NEW FEATURE COMPUTEDS ────────────────────────────────────────────────
  const thisMonthTx = useMemo(()=>{const n=new Date();return transactions.filter(t=>{const d=new Date(t.date);return d.getMonth()===n.getMonth()&&d.getFullYear()===n.getFullYear();});},[transactions]);
  const lastMonthTx = useMemo(()=>{const n=new Date();n.setMonth(n.getMonth()-1);return transactions.filter(t=>{const d=new Date(t.date);return d.getMonth()===n.getMonth()&&d.getFullYear()===n.getFullYear();});},[transactions]);
  const thisMonthExp = useMemo(()=>thisMonthTx.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0),[thisMonthTx]);
  const lastMonthExp = useMemo(()=>lastMonthTx.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0),[lastMonthTx]);
  const thisMonthInc = useMemo(()=>thisMonthTx.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0),[thisMonthTx]);
  const lastMonthInc = useMemo(()=>lastMonthTx.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0),[lastMonthTx]);
  const catComparison = useMemo(()=>allCategories.expense.map(cat=>({cat,thisMonth:thisMonthTx.filter(t=>t.type==="expense"&&t.category===cat).reduce((s,t)=>s+t.amount,0),lastMonth:lastMonthTx.filter(t=>t.type==="expense"&&t.category===cat).reduce((s,t)=>s+t.amount,0)})).filter(c=>c.thisMonth>0||c.lastMonth>0),[thisMonthTx,lastMonthTx,allCategories]);
  const savingsRateTrend = useMemo(()=>last6Months.map(m=>({label:m.label,rate:m.income>0?Math.max(0,((m.income-m.expense)/m.income)*100):0})),[last6Months]);
  const debtFreeMonths = useMemo(()=>{const owe=totalOutstanding+totalCCOut;const pmt=totalEMI+totalCCEMI+(parseFloat(extraFund)||0);if(owe===0)return 0;if(!pmt)return null;return Math.ceil(owe/pmt);},[totalOutstanding,totalCCOut,totalEMI,totalCCEMI,extraFund]);
  const cashFlowForecast = useMemo(()=>{const now=new Date();const salDay=parseInt(salary.creditDay)||1;const salAmt=parseFloat(salary.amount)||effectiveIncome||0;const dailyExp=Math.max(thisMonthExp,totalExpense,1)/30;let running=Math.max(cashLeft,0);return Array.from({length:30},(_,i)=>{const d=new Date(now);d.setDate(d.getDate()+i+1);if(d.getDate()===salDay&&salAmt>0)running+=salAmt;[...activeDebts,...creditCards].forEach(item=>{if(item.dueDate&&new Date(item.dueDate).getDate()===d.getDate())running-=parseFloat(item.emi||item.minDue||0);});running-=dailyExp;return{day:i+1,label:d.getDate()+"/"+(d.getMonth()+1),balance:Math.round(running)};});},[cashLeft,salary,effectiveIncome,thisMonthExp,totalExpense,activeDebts,creditCards]);
  const spendAlerts = useMemo(()=>allCategories.expense.map(cat=>({cat,spent:thisMonthTx.filter(t=>t.type==="expense"&&t.category===cat).reduce((s,t)=>s+t.amount,0),limit:budgets[cat]||0})).filter(a=>a.limit>0&&(a.spent/a.limit)>=0.8).map(a=>({...a,pct:Math.round((a.spent/a.limit)*100),over:a.spent>a.limit})),[thisMonthTx,budgets,allCategories]);

  // ─── ACCOUNT BALANCE (must be before netWorth) ───────────────────────────
  const totalAccountBalance = useMemo(() =>
    accounts.reduce((s, a) => s + (parseFloat(a.balance) || 0), 0),
  [accounts]);

  // ─── NET WORTH (depends on totalAccountBalance) ──────────────────────────
  const netWorth = useMemo(()=>savingsTotal+totalAccountBalance-totalOutstanding-totalCCOut,[savingsTotal,totalAccountBalance,totalOutstanding,totalCCOut]);

  // ─── 15-DAY STRESS PANEL ─────────────────────────────────────────────────
  const next15Days = useMemo(() => {
    const now = new Date(); now.setHours(0,0,0,0);
    const end = new Date(now); end.setDate(end.getDate() + 15);
    const dues = [];
    [...activeDebts].forEach(d => {
      if (!d.dueDate || !d.emi) return;
      let due = new Date(d.dueDate);
      // normalize to this month's due date
      due = new Date(now.getFullYear(), now.getMonth(), due.getDate());
      if (due < now) due = new Date(now.getFullYear(), now.getMonth()+1, new Date(d.dueDate).getDate());
      if (due <= end) dues.push({ name: d.name, amt: parseFloat(d.emi)||0, date: due, kind: "loan", color: C.loan });
    });
    creditCards.forEach(c => {
      if (!c.dueDate || !c.minDue) return;
      let due = new Date(c.dueDate);
      due = new Date(now.getFullYear(), now.getMonth(), due.getDate());
      if (due < now) due = new Date(now.getFullYear(), now.getMonth()+1, new Date(c.dueDate).getDate());
      if (due <= end) dues.push({ name: c.name, amt: parseFloat(c.minDue)||0, date: due, kind: "cc", color: C.credit });
    });
    ccEmis.forEach(e => {
      const card = creditCards.find(cc => String(cc.id)===String(e.cardId));
      if (!card?.dueDate) return;
      let due = new Date(card.dueDate);
      due = new Date(now.getFullYear(), now.getMonth(), due.getDate());
      if (due < now) due = new Date(now.getFullYear(), now.getMonth()+1, new Date(card.dueDate).getDate());
      if (due <= end) dues.push({ name: e.description||card.name, amt: parseFloat(e.amount)||0, date: due, kind: "ccemi", color: C.warning });
    });
    dues.sort((a,b)=>a.date-b.date);
    const totalDue = dues.reduce((s,d)=>s+d.amt,0);
    const balance = totalAccountBalance || Math.max(cashLeft, 0);
    const ratio = balance > 0 ? totalDue/balance : 1;
    const status = ratio < 0.5 ? "safe" : ratio < 0.85 ? "tight" : "risk";
    return { dues, totalDue, balance, status, ratio };
  }, [activeDebts, creditCards, ccEmis, cashLeft, totalAccountBalance, C]);

  // ─── DEBT ACCELERATION SIMULATOR ─────────────────────────────────────────
  const debtSimulator = useMemo(() => {
    const extra = parseFloat(extraFund) || 0;
    return activeDebts.map(d => {
      const bal = parseFloat(d.outstanding)||0;
      const emi = parseFloat(d.emi)||0;
      const rate = parseFloat(d.interestRate)||0;
      const normal = calcMonths(bal, emi, rate);
      const boosted = extra > 0 ? calcMonths(bal, emi + extra, rate) : normal;
      const monthsSaved = (normal && boosted) ? Math.max(0, normal - boosted) : 0;
      // Interest saved = (normal payments - principal) - (boosted payments - principal)
      const interestNormal = normal ? Math.max(0, emi * normal - bal) : 0;
      const interestBoosted = boosted ? Math.max(0, (emi + extra) * boosted - bal) : 0;
      const interestSaved = Math.max(0, interestNormal - interestBoosted);
      return { ...d, bal, normal, boosted, monthsSaved, interestSaved };
    });
  }, [activeDebts, extraFund]);

  // ─── INCOME ALLOCATION ────────────────────────────────────────────────────
  const incomeAllocation = useMemo(() => {
    const inc = effectiveIncome;
    if (!inc) return null;
    const emiAmt    = inc * (allocationPct.emi    / 100);
    const livingAmt = inc * (allocationPct.living / 100);
    const savingsAmt= inc * (allocationPct.savings/ 100);
    const bufferAmt = inc * (allocationPct.buffer / 100);
    const actualEMI = totalEMI + totalCCEMI;
    const actualExp = totalExpense;
    return {
      buckets: [
        { label:"EMIs",    pct:allocationPct.emi,     amt:emiAmt,    actual:actualEMI,  color:C.expense,  icon:"🔁" },
        { label:"Living",  pct:allocationPct.living,  amt:livingAmt, actual:actualExp,  color:C.warning,  icon:"🏠" },
        { label:"Savings", pct:allocationPct.savings, amt:savingsAmt,actual:savingsTotal,color:C.income,   icon:"💰" },
        { label:"Buffer",  pct:allocationPct.buffer,  amt:bufferAmt, actual:cashLeft>0?Math.min(cashLeft,bufferAmt):0, color:C.accent, icon:"🛡️" },
      ],
      total: emiAmt + livingAmt + savingsAmt + bufferAmt,
    };
  }, [effectiveIncome, allocationPct, totalEMI, totalCCEMI, totalExpense, savingsTotal, cashLeft, C]);

  // ─── ACTIONS ─────────────────────────────────────────────────────────────
  function saveTx() {
    if (!txForm.amount || isNaN(txForm.amount)) return;
    const tx = {...txForm, amount: parseFloat(txForm.amount)};

    const applyToAccount = (accountId, delta) => {
      if (!accountId) return;
      setAccounts(p => p.map(a =>
        String(a.id) === String(accountId)
          ? {...a, balance: (parseFloat(a.balance) || 0) + delta}
          : a
      ));
    };

    if (editTxId) {
      const oldTx = transactions.find(t => t.id === editTxId);
      if (oldTx) {
        if (oldTx.type === "expense" && oldTx.paymentMode === "Credit Card" && oldTx.bank) {
          setCreditCards(p => p.map(c =>
            c.name === oldTx.bank ? {...c, outstanding: Math.max(0,(parseFloat(c.outstanding)||0) - oldTx.amount)} : c
          ));
        }
        if (oldTx._accountId) {
          if (oldTx.type === "income") applyToAccount(oldTx._accountId, -oldTx.amount);
          else if (oldTx.type === "expense" && oldTx.paymentMode !== "Credit Card") applyToAccount(oldTx._accountId, +oldTx.amount);
        }
      }
      setTransactions(p => p.map(t => t.id === editTxId ? {...tx, id: editTxId} : t));
    } else {
      setTransactions(p => [{...tx, id: Date.now()}, ...p]);
    }

    if (tx.type === "expense" && tx.paymentMode === "Credit Card" && tx.bank) {
      setCreditCards(p => p.map(c =>
        c.name === tx.bank ? {...c, outstanding: (parseFloat(c.outstanding)||0) + tx.amount} : c
      ));
    } else if (tx.type === "expense" && tx.category === "Credit Card Bill" && tx.bank) {
      setCreditCards(p => p.map(c =>
        (c.bank === tx.bank || c.name === tx.bank)
          ? {...c, outstanding: Math.max(0,(parseFloat(c.outstanding)||0) - tx.amount)}
          : c
      ));
      if (tx._accountId) applyToAccount(tx._accountId, -tx.amount);
    } else if (tx.type === "expense" && tx._accountId) {
      applyToAccount(tx._accountId, -tx.amount);
    } else if (tx.type === "income" && tx._accountId) {
      applyToAccount(tx._accountId, +tx.amount);
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
  function recordLoanPayment(id, amt, emiKey) {
    setDebts(p=>p.map(d=>{ if(d.id!==id)return d; const n=Math.max(0,(parseFloat(d.outstanding)||0)-amt); return{...d,outstanding:n,closed:n===0}; }));
    const d=debts.find(x=>x.id===id);
    const primaryAcc = accounts.find(a=>a.type==="savings")||accounts[0];
    const tx = {id:Date.now(),type:"expense",amount:amt,category:"Loan EMI",paymentMode:"Net Banking",
      bank:d?.lender||"",note:`Payment: ${d?.name||""}`,date:today(),
      _accountId:primaryAcc?.id||"",
      ...(emiKey?{_emiKey:emiKey}:{}),
    };
    setTransactions(p=>[tx,...p]);
    if (primaryAcc) setAccounts(p=>p.map(a=>a.id===primaryAcc.id?{...a,balance:Math.max(0,(parseFloat(a.balance)||0)-amt)}:a));
  }

function saveCCEmi() {
  if (!ccEmiForm.cardId || !ccEmiForm.amount) return;
  if (ccEmiForm.id) {
    setCcEmis(p=>p.map(e=>e.id===ccEmiForm.id?{...ccEmiForm}:e));
  } else {
    setCcEmis(p=>[...p,{...ccEmiForm, id:Date.now(), _totalMonths: ccEmiForm._totalMonths || ccEmiForm.monthsLeft}]);
  }
  setCcEmiForm({...EMPTY_CC_EMI});
  setShowCCEmiForm(false);
}
function deleteCCEmi(id) { setCcEmis(p=>p.filter(e=>e.id!==id)); }
    
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
    const primaryAcc = accounts.find(a=>a.type==="savings")||accounts[0];
    const tx = {id:Date.now(),type:"expense",amount:amt,category:"Credit Card Bill",
      paymentMode:"Net Banking",bank:cc?.bank||"",note:`CC: ${cc?.name||""}`,date:today(),
      _accountId:primaryAcc?.id||"",
    };
    setTransactions(p=>[tx,...p]);
    if (primaryAcc) setAccounts(p=>p.map(a=>a.id===primaryAcc.id?{...a,balance:Math.max(0,(parseFloat(a.balance)||0)-amt)}:a));
  }

  function addBudget() { if(!budgetForm.limit)return; setBudgets(p=>({...p,[budgetForm.category]:parseFloat(budgetForm.limit)})); setBudgetForm({category:"Food",limit:""}); }
  function addGoal()   { if(!savForm.name||!savForm.goal)return; setSavings(p=>[...p,{...savForm,goal:parseFloat(savForm.goal),current:parseFloat(savForm.current)||0,id:Date.now()}]); setSavForm({name:"",goal:"",current:""}); }
  function updateGoal(id,delta) { setSavings(p=>p.map(s=>s.id===id?{...s,current:Math.max(0,s.current+delta)}:s)); }

  // Account actions
  function saveAccount() {
    if (!accountForm.name) return;
    if (editAccountId) {
      setAccounts(p => p.map(a => a.id===editAccountId ? {...accountForm, id:editAccountId} : a));
    } else {
      setAccounts(p => [...p, {...accountForm, id:Date.now(), balance: parseFloat(accountForm.balance)||0}]);
    }
    setAccountForm({...EMPTY_ACCOUNT}); setShowAccountForm(false); setEditAccountId(null);
  }

  // ─── CUSTOM CATEGORY ACTIONS ─────────────────────────────────────────────
  function addCustomCategory() {
    const name = newCatName.trim();
    if (!name) return;
    const existing = [...CATEGORIES[newCatType], ...(customCats[newCatType]||[])];
    if (existing.some(c => c.toLowerCase()===name.toLowerCase())) return;
    setCustomCats(p => ({...p, [newCatType]: [...(p[newCatType]||[]), name]}));
    setNewCatName("");
  }
  function deleteCustomCategory(type, name) {
    setCustomCats(p => ({...p, [type]: (p[type]||[]).filter(c=>c!==name)}));
  }

  // ─── RECURRING BILL ACTIONS ───────────────────────────────────────────────
  function saveRecurring() {
    if (!recurringForm.name || !recurringForm.amount) return;
    if (editRecurringId) {
      setRecurringBills(p => p.map(b => b.id===editRecurringId ? {...recurringForm, id:editRecurringId} : b));
    } else {
      setRecurringBills(p => [...p, {...recurringForm, id:Date.now()}]);
    }
    setRecurringForm({...EMPTY_RECURRING}); setShowRecurringForm(false); setEditRecurringId(null);
  }
  function deleteRecurring(id) { setRecurringBills(p => p.filter(b=>b.id!==id)); }
  function toggleRecurring(id) { setRecurringBills(p => p.map(b => b.id===id?{...b,active:!b.active}:b)); }

  // ─── ENHANCED EXPORT ─────────────────────────────────────────────────────
  function getFilteredTxForExport() {
    let txs = [...transactions];
    if (exportDateFrom) txs = txs.filter(t => t.date >= exportDateFrom);
    if (exportDateTo)   txs = txs.filter(t => t.date <= exportDateTo);
    return txs.sort((a,b)=>b.date.localeCompare(a.date));
  }
  function exportCSV() {
    const txs = getFilteredTxForExport();
    const rows = txs.map(t=>({Date:t.date,Type:t.type,Category:t.category,Amount:t.amount,Mode:t.paymentMode||"",Bank:t.bank||"",Note:t.note||""}));
    dlCSV(toCSV(rows,["Date","Type","Category","Amount","Mode","Bank","Note"]), `fintrack_${exportDateFrom||"all"}_${exportDateTo||"all"}.csv`);
  }
  function exportXLS() {
    const txs = getFilteredTxForExport();
    const rows = txs.map(t=>({Date:t.date,Type:t.type,Category:t.category,Amount:t.amount,Mode:t.paymentMode||"",Bank:t.bank||"",Note:t.note||""}));
    dlXLS(rows, ["Date","Type","Category","Amount","Mode","Bank","Note"], "Transactions", `fintrack_transactions.xls`);
  }
  function exportSummaryXLS() {
    const byCat = {};
    transactions.forEach(t => {
      if (t.type!=="expense") return;
      if (!byCat[t.category]) byCat[t.category] = 0;
      byCat[t.category] += t.amount;
    });
    const rows = Object.entries(byCat).sort((a,b)=>b[1]-a[1]).map(([cat,amt])=>({Category:cat, "Total Spent":amt, "% of Expenses":totalExpense>0?((amt/totalExpense)*100).toFixed(1)+"%":"0%"}));
    rows.push({Category:"TOTAL", "Total Spent":totalExpense, "% of Expenses":"100%"});
    dlXLS(rows, ["Category","Total Spent","% of Expenses"], "Summary", "fintrack_summary.xls");
  }
  function exportLoansPDF() {
    const lines = [
      "FinTrack — Loan Summary Report",
      `Generated: ${new Date().toLocaleDateString("en-IN")}`,
      "─".repeat(50),
      "",
      ...activeDebts.map(d => [
        `Loan: ${d.name} (${d.lender})`,
        `  Outstanding: ₹${parseFloat(d.outstanding||0).toLocaleString("en-IN")}`,
        `  EMI: ₹${parseFloat(d.emi||0).toLocaleString("en-IN")}/mo  |  Rate: ${d.interestRate}% p.a.`,
        `  Due Date: ${d.dueDate||"—"}`,
        "",
      ].join("\n")),
      "─".repeat(50),
      `TOTAL OUTSTANDING: ₹${totalOutstanding.toLocaleString("en-IN")}`,
      `TOTAL EMI/MONTH:   ₹${totalEMI.toLocaleString("en-IN")}`,
    ].join("\n");
    const blob = new Blob([lines],{type:"text/plain;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download="fintrack_loans.txt"; a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  function exportTransactions() { exportCSV(); }
  function deleteAccount(id) { setAccounts(p => p.filter(a => a.id!==id)); }
  function updateAccountBalance(id, delta) {
    setAccounts(p => p.map(a => a.id===id ? {...a, balance: Math.max(0,(parseFloat(a.balance)||0)+delta)} : a));
  }
  function toggleDebtAutoEMI(id) {
    setDebts(p => p.map(d => d.id===id ? {...d, autoEMI: d.autoEMI===false ? true : false} : d));
  }
  function toggleCCEmiAuto(id) {
    setCcEmis(p => p.map(e => e.id===id ? {...e, autoEMI: e.autoEMI===false ? true : false} : e));
  }

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
CREDIT CARDS: ${creditCards.map(c=>`${c.name}/${c.bank} out:₹${c.outstanding} limit:₹${c.limit} rate:${c.interestRate}%`).join("; ")||"None"}

Provide (use emoji headers, max 350 words):
## 🚨 Top 3 Actions (this week, with ₹ amounts)
## 💳 Credit Card Strategy (use or avoid? pay which first?)
## 🏁 Debt-Free Timeline (with vs without extra ₹${fc(extraFund)})
## 🛡️ Post-Debt Plan (health insurance, term life, investments — India-specific)
## ❤️ One line of encouragement`;
    try {
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1200,messages:[{role:"user",content:prompt}]})});
      const data=await res.json();
      if(data.content?.[0])setAiAdvice(data.content[0].text);
      else setAiAdvice("Could not generate. Try again.");
    }catch{setAiAdvice("Connection error. Try again.");}
    setAiLoading(false);
  },[effectiveIncome,totalEMI,totalCCEMI,totalExpense,cashLeft,totalOutstanding,totalCCOut,health,activeDebts,creditCards,extraFund,recommended]);

  const css=`
    @import url('https://fonts.googleapis.com/css2?family=Cabinet+Grotesk:wght@400;500;700;800;900&family=JetBrains+Mono:wght@400;500&display=swap');

    :root {
      --bg: ${C.bg}; --card: ${C.card}; --border: ${C.border}; --text: ${C.text};
      --muted: ${C.muted}; --accent: ${C.accent}; --surface: ${C.surface};
      --income: ${C.income}; --expense: ${C.expense}; --glow: ${C.glow};
    }

    *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}
    html{overflow-x:hidden;}
    body{overflow-x:hidden;overscroll-behavior:none;background:${C.bg};}

    ::-webkit-scrollbar{width:3px;}
    ::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px;}

    input,select,textarea{
      outline:none;-webkit-appearance:none;
      font-family:'JetBrains Mono',monospace;
      transition: border-color 0.2s, box-shadow 0.2s;
    }

    /* ── Core Cards — more breathing room ── */
    .card {
      background:${C.card};
      border:1.5px solid ${C.border};
      border-radius:20px;
      padding:22px 20px;
      margin-bottom:16px;
      position:relative;overflow:hidden;
    }

    /* ── ALL BUTTONS — clearly visible, never invisible ── */
    .btn{
      cursor:pointer;border:none;border-radius:12px;
      font-family:'Cabinet Grotesk',sans-serif;font-weight:700;font-size:13px;
      padding:12px 22px;letter-spacing:0.1px;
      transition: all 0.18s cubic-bezier(.4,0,.2,1);
      display:inline-flex;align-items:center;gap:6px;justify-content:center;
      position:relative;overflow:hidden;
    }
    .btn:active{transform:scale(0.96);}
    /* Primary — accent fill */
    .btn-p{background:${C.accent};color:#fff;box-shadow:0 4px 16px ${C.accent}45;}
    .btn-p:hover{box-shadow:0 6px 24px ${C.accent}60;filter:brightness(1.08);}
    /* Green */
    .btn-g{background:${C.income};color:${darkMode?"#070810":"#fff"};box-shadow:0 4px 14px ${C.income}35;}
    .btn-g:hover{filter:brightness(1.08);}
    /* Purple */
    .btn-v{background:${C.loan};color:#fff;box-shadow:0 4px 14px ${C.loan}35;}
    /* AI gradient */
    .btn-ai{background:linear-gradient(135deg,#5b4fd4,#9b6af7,#5b8def);color:#fff;box-shadow:0 4px 20px rgba(155,106,247,0.45);}
    .btn-ai:hover{filter:brightness(1.1);}
    /* Small modifier */
    .btn-sm{padding:8px 16px;font-size:11.5px;border-radius:10px;}
    /* Danger — visible red outline */
    .btn-danger{
      background:${C.expense}12;color:${C.expense};
      border:1.5px solid ${C.expense}50;
      font-size:11px;padding:7px 13px;cursor:pointer;border-radius:10px;
      font-family:'Cabinet Grotesk',sans-serif;font-weight:700;transition:all 0.15s;
    }
    .btn-danger:hover{background:${C.expense}22;border-color:${C.expense}80;}
    /* Ghost — always has a visible border */
    .btn-ghost{
      background:transparent;color:${C.text};
      border:1.5px solid ${C.border};
      padding:8px 16px;border-radius:10px;cursor:pointer;
      font-family:'Cabinet Grotesk',sans-serif;font-weight:600;font-size:11.5px;
      transition:all 0.15s;
    }
    .btn-ghost:hover{background:${C.surface};border-color:${C.muted}70;}

    /* ── Inputs — generous padding ── */
    .inp{
      background:${C.inputBg};
      border:1.5px solid ${C.border};
      border-radius:12px;
      color:${C.text};
      padding:12px 16px;
      font-size:13px;
      width:100%;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    .inp:focus{border-color:${C.accent};box-shadow: 0 0 0 3px ${C.accent}18;}
    .inp::placeholder{color:${C.muted};}

    /* ── Modal ── */
    .modal{
      position:fixed;inset:0;
      background:rgba(0,0,0,0.78);
      backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
      z-index:200;display:flex;align-items:flex-end;justify-content:center;
    }
    .sheet{
      width:100%;max-width:560px;
      background:${C.card};
      border:1.5px solid ${C.border};
      border-radius:24px 24px 0 0;
      padding:32px 24px 36px;
      max-height:94vh;overflow-y:auto;
      box-shadow:0 -20px 60px rgba(0,0,0,0.45);
    }
    @media(min-width:640px){.modal{align-items:center;padding:20px;}.sheet{border-radius:24px;}}

    /* ── Tags ── */
    .tag{
      display:inline-flex;align-items:center;
      padding:4px 10px;border-radius:20px;
      font-size:10px;font-family:'Cabinet Grotesk',sans-serif;font-weight:700;
      letter-spacing:0.3px;
    }

    /* ── Progress bars ── */
    .pbar{height:6px;background:${C.border};border-radius:99px;overflow:hidden;margin:4px 0;}
    .pfill{height:100%;border-radius:99px;transition:width 0.6s cubic-bezier(.4,0,.2,1);}

    /* ── Labels ── */
    .lbl{
      font-size:9.5px;color:${C.muted};
      font-family:'Cabinet Grotesk',sans-serif;
      font-weight:700;letter-spacing:1.6px;
      text-transform:uppercase;margin-bottom:6px;
      display:block;
    }

    /* ── Section titles ── */
    .stitle{
      font-family:'Cabinet Grotesk',sans-serif;
      font-weight:800;font-size:15px;margin-bottom:16px;
      letter-spacing:-0.2px;
    }

    /* ── Rows ── */
    .row{
      display:flex;justify-content:space-between;align-items:center;
      padding:13px 0;
      border-bottom:1px solid ${C.border}60;
      transition:background 0.15s;
    }

    /* ── Grids ── */
    .g2{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
    .g4{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;}
    @media(max-width:640px){.g4{grid-template-columns:repeat(2,1fr);}.g2{grid-template-columns:1fr;}}

    /* ── Stat cards ── */
    .scard{
      background:${C.card};border:1.5px solid ${C.border};
      border-radius:16px;padding:18px 16px;
      position:relative;overflow:hidden;
      transition: border-color 0.2s, transform 0.2s;
    }
    .scard:hover{transform:translateY(-1px);border-color:${C.muted}50;}

    /* ── Filter buttons ── */
    .filter-btn{
      cursor:pointer;padding:7px 14px;border-radius:99px;
      font-family:'Cabinet Grotesk',sans-serif;font-weight:600;font-size:11px;
      border:1.5px solid ${C.border};
      background:transparent;color:${C.muted};
      transition:all 0.15s;white-space:nowrap;
    }
    .filter-btn:hover{border-color:${C.muted}80;color:${C.text};}
    .filter-btn.on{border-color:${C.accent};color:${C.accent};background:${C.accent}14;}

    /* ── AI text ── */
    .ai-txt{white-space:pre-wrap;font-size:12.5px;line-height:1.95;font-family:'JetBrains Mono',monospace;}

    /* ── Shimmer ── */
    .shimmer{
      background:linear-gradient(90deg,${C.surface} 25%,${C.border} 50%,${C.surface} 75%);
      background-size:200% 100%;animation:shimmer 1.5s infinite;border-radius:8px;
    }
    @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
    .pulse{animation:pulse 2s infinite;}
    @keyframes pulse{0%,100%{opacity:1;}50%{opacity:0.4;}}

    /* ── Bottom nav — clean minimal ── */
    .bnav{
      position:fixed;bottom:0;left:0;right:0;
      background:${C.glass};
      backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);
      border-top:1.5px solid ${C.border};
      display:flex;z-index:100;
      padding-bottom:env(safe-area-inset-bottom,0px);
    }
    .bn{
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      padding:12px 4px 10px;
      font-family:'Cabinet Grotesk',sans-serif;font-weight:700;font-size:9.5px;
      color:${C.muted};cursor:pointer;border:none;background:transparent;gap:4px;flex:1;
      transition:color 0.15s;letter-spacing:0.4px;
    }
    .bn.act{color:${C.accent};}
    .bn.act span:first-child{filter: drop-shadow(0 0 6px ${C.accent}60);}

    /* ── Due badge ── */
    .due-badge{
      display:inline-flex;align-items:center;gap:3px;
      padding:3px 8px;border-radius:99px;
      font-size:9.5px;font-family:'Cabinet Grotesk',sans-serif;font-weight:700;
    }

    /* ── FAB ── */
    .fab{
      position:fixed;bottom:76px;right:18px;
      width:56px;height:56px;border-radius:16px;
      background:${C.accent};border:none;cursor:pointer;font-size:22px;
      display:flex;align-items:center;justify-content:center;
      box-shadow:0 8px 28px ${C.accent}55;
      z-index:99;color:#fff;font-weight:800;
      transition:transform 0.18s, box-shadow 0.18s;
    }
    .fab:active{transform:scale(0.92);}
    @media(min-width:769px){.fab{display:none;}.bnav{display:none!important;}}
    @media(max-width:768px){.dtabs{display:none!important;}}

    /* ── Sync dot ── */
    .sync-dot{
      width:7px;height:7px;border-radius:50%;
      background:${saving?"#ffb547":fbStatus==="ok"?"#00e5a0":"#ff4d6d"};
      display:inline-block;margin-right:5px;
      box-shadow: 0 0 6px ${saving?"#ffb547":fbStatus==="ok"?"#00e5a0":"#ff4d6d"}80;
    }

    /* ── Hamburger menu ── */
    .hmenu{
      position:fixed;top:0;left:0;width:80%;max-width:300px;height:100vh;
      background:${C.card};border-right:1.5px solid ${C.border};
      z-index:300;padding:0;display:flex;flex-direction:column;
      transform:translateX(-100%);
      transition:transform 0.28s cubic-bezier(.4,0,.2,1);
      box-shadow: 4px 0 40px rgba(0,0,0,0.3);
    }
    .hmenu.open{transform:translateX(0);}
    .hmenu-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:299;backdrop-filter:blur(4px);}
    .hmenu-item{
      display:flex;align-items:center;gap:12px;padding:16px 20px;
      cursor:pointer;border:none;background:transparent;
      color:${C.text};font-family:'Cabinet Grotesk',sans-serif;
      font-weight:600;font-size:13px;width:100%;text-align:left;
      transition:background 0.15s;
    }
    .hmenu-item:hover{background:${C.surface};}
    .hmenu-item.active{color:${C.accent};background:${C.accent}10;}

    /* ── Pull to refresh ── */
    .ptr{display:flex;align-items:center;justify-content:center;overflow:hidden;transition:height 0.2s;background:${C.bg};}
    .ptr-spinner{width:20px;height:20px;border:2px solid ${C.border};border-top-color:${C.accent};border-radius:50%;animation:spin 0.7s linear infinite;}
    @keyframes spin{to{transform:rotate(360deg)}}

    /* ── Desktop tabs ── */
    .dtab-btn{
      cursor:pointer;padding:8px 16px;border-radius:99px;
      font-family:'Cabinet Grotesk',sans-serif;font-weight:700;font-size:12px;
      border:none;background:transparent;color:${C.muted};
      transition:all 0.15s;white-space:nowrap;
    }
    .dtab-btn:hover{color:${C.text};}
    .dtab-btn.act{background:${C.accent}18;color:${C.accent};}

    /* ── Misc ── */
    .num{font-family:'Cabinet Grotesk',sans-serif;font-weight:800;font-variant-numeric:tabular-nums;}
    .div{height:1px;background:${C.border}60;margin:16px 0;}
    .gstat{background:${C.surface};border:1.5px solid ${C.border};border-radius:14px;padding:16px;transition:all 0.2s;}
    .gstat:hover{border-color:${C.muted}40;transform:translateY(-1px);}
    .sheet::-webkit-scrollbar{width:3px;}
    .sheet::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px;}
  `;

  function DueBadge({days, dueDate}){
    if(days===null && !dueDate) return null;
    const dateStr = dueDate ? new Date(dueDate).toLocaleDateString("en-IN",{day:"numeric",month:"short"}) : null;
    if(days!==null && days<0) return <span className="due-badge" style={{background:`${C.expense}18`,color:C.expense}}>⚠️ Overdue {Math.abs(days)}d{dateStr?` (${dateStr})`:""}</span>;
    if(days===0) return <span className="due-badge" style={{background:`${C.warning}18`,color:C.warning}}>⚡ Due Today!</span>;
    if(days!==null && days<=3) return <span className="due-badge" style={{background:`${C.warning}18`,color:C.warning}}>🔔 Due in {days}d{dateStr?` · ${dateStr}`:""}</span>;
    if(days!==null && days<=10) return <span className="due-badge" style={{background:`${C.accent}14`,color:C.accent}}>📅 Due {dateStr||`in ${days}d`}</span>;
    if(dateStr) return <span className="due-badge" style={{background:`${C.border}`,color:C.muted}}>📅 {dateStr}</span>;
    return null;
  }
  function ScoreRing({score,color,size=120}){
    const r=40,circ=2*Math.PI*r,off=circ-(score/100)*circ;
    return<svg width={size} height={size} viewBox="0 0 100 100">
      <circle cx="50" cy="50" r={r} fill="none" stroke={color+"18"} strokeWidth="8"/>
      <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={off} transform="rotate(-90 50 50)"
        style={{transition:"stroke-dashoffset 1.2s cubic-bezier(.4,0,.2,1)",filter:`drop-shadow(0 0 6px ${color}60)`}}/>
      <text x="50" y="44" textAnchor="middle" fill={color} fontSize="22" fontWeight="900" fontFamily="Cabinet Grotesk">{score}</text>
      <text x="50" y="58" textAnchor="middle" fill={color+"80"} fontSize="9" fontFamily="Cabinet Grotesk" letterSpacing="1">/100</text>
    </svg>;
  }

  
  // ─── GOOGLE LOGIN SCREEN ─────────────────────────────────────────────────
if (!user) {
  return (
    <div style={{
      minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center",
      background:C.bg, color:C.text,
      fontFamily:"'Cabinet Grotesk','Segoe UI',sans-serif",
      padding:20,
    }}>
      <style>{css}</style>
      {/* Background orbs */}
      <div style={{position:"fixed",inset:0,pointerEvents:"none",overflow:"hidden"}}>
        <div style={{position:"absolute",top:"-20%",left:"-10%",width:500,height:500,borderRadius:"50%",background:`radial-gradient(circle, ${C.accent}18 0%, transparent 70%)`}}/>
        <div style={{position:"absolute",bottom:"-20%",right:"-10%",width:600,height:600,borderRadius:"50%",background:`radial-gradient(circle, ${C.loan}12 0%, transparent 70%)`}}/>
      </div>
      <div style={{
        background:C.card, border:`1px solid ${C.border}`,
        borderRadius:28, padding:"48px 36px", textAlign:"center",
        maxWidth:400, width:"100%",
        boxShadow:`0 40px 80px rgba(0,0,0,${darkMode?0.5:0.12}), 0 0 0 1px ${C.border}`,
        position:"relative", zIndex:1,
      }}>
        <div style={{
          width:64, height:64, borderRadius:20,
          background:`linear-gradient(135deg, ${C.accent}, ${C.loan})`,
          display:"flex", alignItems:"center", justifyContent:"center",
          margin:"0 auto 20px",
          fontSize:28,
          boxShadow:`0 12px 32px ${C.accent}40`,
        }}>₹</div>
        <div style={{
          fontFamily:"'Cabinet Grotesk',sans-serif", fontWeight:900,
          fontSize:28, marginBottom:8, letterSpacing:"-0.5px",
        }}>FinTrack</div>
        <div style={{
          color:C.muted, fontSize:13, marginBottom:32, lineHeight:1.6,
          fontFamily:"'JetBrains Mono',monospace",
        }}>
          Your personal finance command center
        </div>
        <button onClick={handleLogin} style={{
          width:"100%", padding:"14px 20px", borderRadius:14,
          border:`1px solid ${C.border}`,
          background:C.surface, color:C.text,
          fontWeight:700, fontFamily:"'Cabinet Grotesk',sans-serif",
          cursor:"pointer", fontSize:14,
          display:"flex", alignItems:"center", justifyContent:"center", gap:10,
          transition:"all 0.2s",
        }}
        onMouseEnter={e=>e.currentTarget.style.borderColor=C.accent}
        onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}
        >
          <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#4285F4" d="M47.5 24.6c0-1.6-.1-3.1-.4-4.6H24v8.7h13.2c-.6 3-2.3 5.5-4.9 7.2v6h7.9c4.6-4.3 7.3-10.6 7.3-17.3z"/><path fill="#34A853" d="M24 48c6.6 0 12.2-2.2 16.2-5.9l-7.9-6c-2.2 1.5-5 2.3-8.3 2.3-6.4 0-11.8-4.3-13.7-10.1H2.1v6.2C6.1 42.6 14.5 48 24 48z"/><path fill="#FBBC04" d="M10.3 28.3c-.5-1.5-.8-3-.8-4.6s.3-3.1.8-4.6v-6.2H2.1C.7 15.9 0 19.9 0 24s.7 8.1 2.1 11.1l8.2-6.8z"/><path fill="#E94235" d="M24 9.6c3.6 0 6.8 1.2 9.3 3.6l7-7C36.2 2.3 30.6 0 24 0 14.5 0 6.1 5.4 2.1 13.3l8.2 6.2c1.9-5.8 7.3-9.9 13.7-9.9z"/></svg>
          Sign in with Google
        </button>
        <div style={{marginTop:20,fontSize:10,color:C.muted,fontFamily:"'JetBrains Mono',monospace"}}>
          Data encrypted & synced via Firebase
        </div>
      </div>
    </div>
  );
}
  

  // ─── FIREBASE CONFIG WARNING ──────────────────────────────────────────────
  const fbNotConfigured = fbStatus==="error";

  // ─── MAIN UI ─────────────────────────────────────────────────────────────
  const activeTab = MOBILE_TABS.find(t=>t.id===tab||t.label===tab)?.id||tab;

  return(
    <div style={{minHeight:"100vh",minHeight:"100dvh",background:C.bg,color:C.text,fontFamily:"'JetBrains Mono','Courier New',monospace"}}>
      <style>{css}</style>

      {/* ── Desktop Header ── */}
      <div className="dtabs" style={{
        borderBottom:`1px solid ${C.border}`,padding:"0 20px",
        display:"flex",alignItems:"center",justifyContent:"space-between",
        position:"sticky",top:0,
        background:C.glass,backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",
        zIndex:50,gap:8,height:56,
      }}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:34,height:34,background:`linear-gradient(135deg, ${C.accent}, ${C.loan})`,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:900,fontSize:16,boxShadow:`0 4px 12px ${C.accent}35`}}>₹</div>
          <span style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:17,letterSpacing:"-0.3px"}}>FinTrack</span>
          {health.score>0&&<span className="tag" style={{background:health.color+"20",color:health.color,fontSize:10}}>{health.grade} · {health.score}/100</span>}
          {overdueCount>0&&<span className="pulse tag" style={{background:`${C.expense}15`,color:C.expense,cursor:"pointer"}} onClick={()=>setTab("Cards")}>⚠ {overdueCount} overdue</span>}
          <span style={{display:"flex",alignItems:"center"}}><span className="sync-dot"/><span style={{fontSize:10,color:C.muted,fontFamily:"'JetBrains Mono',monospace"}}>{saving?"saving…":lastSaved?`saved ${lastSaved.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}`:""}</span></span>
        </div>
        <div style={{display:"flex",gap:2}}>
          {ALL_TABS.map(t=>(
            <button key={t} className={`dtab-btn ${tab===t?"act":""}`} onClick={()=>setTab(t)}>
              {t==="Plan"?"🎯 Plan":t==="Cards"?"💳 Cards":t==="Goals"?"🌱 Goals":t==="Finance"?"📊 Finance":t==="Smart"?"⚡ Smart":t}
            </button>
          ))}
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <button className="btn-ghost btn-sm" onClick={()=>setDarkMode(p=>!p)} style={{fontSize:14}}>{darkMode?"☀":"🌙"}</button>
          <button className="btn-ghost btn-sm" onClick={()=>setShowSettings(true)}>⚙</button>
          <button className="btn-ghost btn-sm" onClick={()=>setShowImport(true)}>↑ Import</button>
          <button className="btn-ghost btn-sm" onClick={exportTransactions}>↓ Export</button>
          <button className="btn btn-p btn-sm" onClick={()=>{setTxForm({...EMPTY_TX});setEditTxId(null);setShowTxForm(true);}}>+ Add</button>
          <button className="btn-ghost btn-sm" onClick={handleLogout} style={{color:C.expense,borderColor:C.expense+"30"}}>Logout</button>
        </div>
      </div>

      {/* ── Mobile Header ── */}
      <div style={{
        borderBottom:`1px solid ${C.border}`,padding:"12px 16px",
        display:"flex",alignItems:"center",justifyContent:"space-between",
        position:"sticky",top:0,
        background:C.glass,backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",
        zIndex:50,gap:8,
      }}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:32,height:32,background:`linear-gradient(135deg,${C.accent},${C.loan})`,borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:900,fontSize:15,boxShadow:`0 3px 10px ${C.accent}35`}}>₹</div>
          <span style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:16,letterSpacing:"-0.3px"}}>FinTrack</span>
          <span className="sync-dot"/>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          {health.score>0&&<span className="tag" style={{background:health.color+"20",color:health.color,fontSize:10}}>{health.score}</span>}
          {overdueCount>0&&<span className="pulse tag" style={{background:`${C.expense}15`,color:C.expense,fontSize:10}}>⚠{overdueCount}</span>}
          <button className="btn-ghost btn-sm" onClick={()=>setDarkMode(p=>!p)} style={{padding:"5px 9px",fontSize:13}}>{darkMode?"☀":"🌙"}</button>
          <button className="btn-ghost btn-sm" onClick={()=>setShowMenu(true)} style={{padding:"5px 11px",fontSize:15,lineHeight:1}}>☰</button>
        </div>
      </div>
      {fbNotConfigured&&(
        <div style={{background:"#f59e0b15",borderBottom:`1px solid #f59e0b40`,padding:"8px 16px",fontSize:11,color:"#f59e0b",textAlign:"center"}}>
          ⚠️ Firebase not configured — data is NOT being saved to cloud. Open <b>src/firebaseConfig.js</b> and add your Firebase keys.
        </div>
      )}

      {/* Pull-to-refresh indicator */}
      <div className="ptr" style={{height:refreshing?44:pullY>0?pullY:0}}>
        {(refreshing||pullY>10)&&<div className={refreshing?"ptr-spinner":""}  style={{fontSize:refreshing?0:18,opacity:Math.min(pullY/50,1)}}>{refreshing?"":"↓"}</div>}
        {refreshing&&<div className="ptr-spinner"/>}
      </div>

      <div style={{maxWidth:1200,margin:"0 auto",padding:"16px 14px 16px",paddingBottom:100}}>

        {/* ════════ DASHBOARD ════════ */}
        {tab==="Dashboard"&&<>
            {/* Period Filter */}
<div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
  <span style={{fontSize:11,color:C.muted,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,marginRight:2}}>Period:</span>
  {[
    ["today","Today"],["week","This Week"],["month","This Month"],
    ["lastmonth","Last Month"],["3months","Last 3 Months"],["all","All Time"],
  ].map(([v,l])=>(
    <button key={v} className={`filter-btn ${dashPeriod===v?"on":""}`} onClick={()=>setDashPeriod(v)}>{l}</button>
  ))}
</div>

          {/* ══ MONEY OVERVIEW ══ */}
          <div className="card" style={{marginBottom:12,borderColor:`${C.accent}25`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div className="stitle" style={{marginBottom:0}}>💰 My Money</div>
              <button className="btn-ghost btn-sm" onClick={()=>setTab("Smart")} style={{fontSize:11}}>Manage Accounts →</button>
            </div>

            {accounts.length===0
              ? <div style={{textAlign:"center",padding:"12px 0",color:C.muted,fontSize:12}}>
                  No accounts added yet.{" "}
                  <span onClick={()=>setTab("Smart")} style={{color:C.accent,cursor:"pointer",fontWeight:700}}>Add accounts →</span>
                </div>
              : <>
                  {/* Bank + Cash accounts */}
                  <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:10}}>
                    {accounts.map(a=>{
                      const bal = parseFloat(a.balance)||0;
                      const isCash = a.type==="cash";
                      return(
                        <div key={a.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",background:C.surface,borderRadius:12,border:`1px solid ${C.border}`}}>
                          <div style={{display:"flex",alignItems:"center",gap:10}}>
                            <div style={{width:36,height:36,borderRadius:10,background:`${a.color||C.accent}18`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{a.icon||"🏦"}</div>
                            <div>
                              <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:13}}>{a.name}</div>
                              <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:0.5}}>{isCash?"Cash in hand":a.type}{a.bank?` · ${a.bank}`:""}</div>
                            </div>
                          </div>
                          <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:16,color:bal>=0?C.income:C.expense}}>{fc(bal)}</div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Total */}
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",background:`${C.income}10`,borderRadius:12,border:`1px solid ${C.income}25`,marginBottom:2}}>
                    <span style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:13,color:C.income}}>Total Available</span>
                    <span style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:18,color:C.income}}>{fc(totalAccountBalance)}</span>
                  </div>
                </>
            }
          </div>

          {/* ══ CREDIT CARD UTILISATION ══ */}
          {creditCards.length>0&&(
            <div className="card" style={{marginBottom:12}}>
              <div className="stitle" style={{marginBottom:10}}>💳 Credit Cards</div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {creditCards.map(cc=>{
                  const out = parseFloat(cc.outstanding)||0;
                  const lim = parseFloat(cc.limit)||1;
                  const util = Math.min(100,(out/lim)*100);
                  const utilColor = util>=75?C.expense:util>=40?C.warning:C.income;
                  return(
                    <div key={cc.id} style={{padding:"10px 14px",background:C.surface,borderRadius:12,border:`1px solid ${utilColor}25`}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                        <div>
                          <span style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:13}}>{cc.name}</span>
                          <span style={{fontSize:10,color:C.muted,marginLeft:8}}>{cc.bank}</span>
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <span style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:13,color:utilColor}}>{util.toFixed(0)}% used</span>
                          {util>=75&&<span className="tag" style={{background:`${C.expense}15`,color:C.expense,fontSize:9}}>High!</span>}
                        </div>
                      </div>
                      <div className="pbar" style={{marginBottom:4}}><div className="pfill" style={{width:`${util}%`,background:utilColor}}/></div>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:C.muted}}>
                        <span>Used: <span style={{color:utilColor,fontWeight:700}}>{fc(out)}</span></span>
                        <span>Available: <span style={{color:C.income,fontWeight:700}}>{fc(Math.max(0,lim-out))}</span></span>
                        <span>Limit: {fc(lim)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ══ EMI OVERVIEW ══ */}
          {(activeDebts.length>0||ccEmis.length>0)&&(
            <div className="card" style={{marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div className="stitle" style={{marginBottom:0}}>📅 EMIs This Month</div>
                <span style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:14,color:C.loan}}>{fc(totalEMI+totalCCEMI)}</span>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {activeDebts.filter(d=>d.emi).map(d=>{
                  const dueDay = d.dueDate ? new Date(d.dueDate).getDate() : null;
                  const today = new Date().getDate();
                  const isPaid = dueDay && today > dueDay;
                  const isDueToday = dueDay && today === dueDay;
                  const daysLeft = dueDay ? dueDay - today : null;
                  return(
                    <div key={d.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px",background:C.surface,borderRadius:10,border:`1px solid ${isDueToday?C.warning+"50":isPaid?C.income+"25":C.border}`}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{width:8,height:8,borderRadius:"50%",background:isDueToday?C.warning:isPaid?C.income:C.loan,flexShrink:0}}/>
                        <div>
                          <div style={{fontSize:12,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700}}>{d.name}</div>
                          <div style={{fontSize:10,color:C.muted,marginBottom:3}}>{d.lender}</div>
                          {d.dueDate&&<DueBadge days={daysUntil(d.dueDate)} dueDate={d.dueDate}/>}
                        </div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:13,color:C.loan}}>{fc(parseFloat(d.emi)||0)}</div>
                        <div style={{fontSize:9,color:isDueToday?C.warning:isPaid?C.income:C.muted}}>
                          {isDueToday?"⚡ Due today":isPaid?"✅ Paid":daysLeft!==null?`in ${daysLeft}d`:""}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {ccEmis.map(e=>{
                  const card = creditCards.find(c=>String(c.id)===String(e.cardId));
                  const dueDay = card?.dueDate ? new Date(card.dueDate).getDate() : null;
                  const today = new Date().getDate();
                  const isPaid = dueDay && today > dueDay;
                  return(
                    <div key={e.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px",background:C.surface,borderRadius:10,border:`1px solid ${C.border}`}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{width:8,height:8,borderRadius:"50%",background:C.credit,flexShrink:0}}/>
                        <div>
                          <div style={{fontSize:12,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700}}>{e.description||card?.name||"CC EMI"}</div>
                          <div style={{fontSize:10,color:C.muted,marginBottom:3}}>{e.monthsLeft}mo left</div>
                          {card?.dueDate&&<DueBadge days={daysUntil(card.dueDate)} dueDate={card.dueDate}/>}
                        </div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:13,color:C.credit}}>{fc(parseFloat(e.amount)||0)}</div>
                        <div style={{fontSize:9,color:isPaid?C.income:C.muted}}>{isPaid?"✅ Paid":""}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Period Summary Strip */}
          <div className="g4" style={{marginBottom:12}}>
  {(()=>{
    const pt=filterByPeriod(transactions,dashPeriod);
    const pInc=pt.filter(t=>t.type==="income").reduce((s,t)=>s+t.amount,0);
    const pExp=pt.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0);
    const periodLabel=dashPeriod==="today"?"Today":dashPeriod==="week"?"This Week":dashPeriod==="month"?"This Month":dashPeriod==="lastmonth"?"Last Month":dashPeriod==="3months"?"Last 3 Months":"All Time";
    return[
      {label:"Net Balance",    val:fc(pInc-pExp),         color:(pInc-pExp)>=0?C.income:C.expense, sub:periodLabel},
      {label:"Total EMIs",     val:fc(totalEMI+totalCCEMI),color:C.loan, sub:`${effectiveIncome>0?((totalEMI+totalCCEMI)/effectiveIncome*100).toFixed(0):0}% of income`},
      {label:"CC Outstanding", val:fc(totalCCOut),         color:C.credit},
      {label:"Expenses",       val:fc(pExp),               color:C.expense, sub:periodLabel},
    ].map(item=>(
      <div key={item.label} className="scard">
        <div className="lbl">{item.label}</div>
        <div style={{fontSize:17,fontWeight:700,color:item.color,fontFamily:"'Cabinet Grotesk',sans-serif"}}>{item.val}</div>
        {item.sub&&<div style={{fontSize:10,color:C.muted,marginTop:2}}>{item.sub}</div>}
      </div>
    ));
  })()}
</div>

          {/* ── 15-Day Stress Mini Banner ── */}
          {next15Days.dues.length>0&&(
            <div onClick={()=>setTab("Smart")} style={{
              marginBottom:10,padding:"12px 16px",borderRadius:14,cursor:"pointer",
              background: next15Days.status==="safe"?`${C.income}08`:next15Days.status==="tight"?`${C.warning}08`:`${C.expense}10`,
              border:`1px solid ${next15Days.status==="safe"?C.income:next15Days.status==="tight"?C.warning:C.expense}35`,
              display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,
            }}>
              <div>
                <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:13,
                  color:next15Days.status==="safe"?C.income:next15Days.status==="tight"?C.warning:C.expense}}>
                  {next15Days.status==="safe"?"✅":next15Days.status==="tight"?"⚠️":"🚨"} {next15Days.dues.length} due in 15 days
                </div>
                <div style={{fontSize:11,color:C.muted}}>{fc(next15Days.totalDue)} total · Balance {fc(next15Days.balance)}</div>
              </div>
              <span style={{fontSize:11,color:C.muted}}>View →</span>
            </div>
          )}

          {spendAlerts.length>0&&(
            <div className="card" style={{marginBottom:10,borderColor:`${C.expense}35`,background:`${C.expense}06`}}>
              <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:13,color:C.expense,marginBottom:8}}>🚨 Budget Alerts</div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {spendAlerts.map(a=>(
                  <div key={a.cat} style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:4}}>
                    <span style={{fontSize:12,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700}}>{a.cat}</span>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:11,color:C.muted}}>{fc(a.spent)} / {fc(a.limit)}</span>
                      <span className="tag" style={{background:a.over?`${C.expense}20`:`${C.warning}20`,color:a.over?C.expense:C.warning}}>{a.over?"Over!":a.pct+"%"}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {health.score<50&&activeDebts.length>0&&(
            <div style={{marginBottom:10,padding:"11px 14px",background:`linear-gradient(135deg,${C.expense}10,${C.loan}08)`,border:`1px solid ${C.expense}25`,borderRadius:12,display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}>
              <div>
                <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:13,color:C.expense}}>⚡ High debt load</div>
                <div style={{fontSize:11,color:C.muted}}>EMIs are {effectiveIncome>0?((totalEMI/effectiveIncome)*100).toFixed(0):0}% of income</div>
              </div>
              <button className="btn btn-ai btn-sm" onClick={()=>setTab("Plan")}>🎯 My Plan →</button>
            </div>
          )}




          <div className="g2" style={{marginBottom:10}}>
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
            <div className="card">
              <div className="stitle">Top Categories</div>
              {expenseByCat.length===0?<div style={{color:C.muted,textAlign:"center",paddingTop:40,fontSize:12}}>No data</div>:(
                <div style={{overflowY:"auto",maxHeight:160}}>
                  {[...expenseByCat].sort((a,b)=>b.value-a.value).slice(0,5).map((d,i)=>{
                    const max=expenseByCat.reduce((m,x)=>Math.max(m,x.value),0);
                    return(
                      <div key={d.name} style={{marginBottom:7}}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                          <div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:7,height:7,borderRadius:"50%",background:d.color}}/><span style={{fontSize:10,color:C.muted,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:600}}>{d.name}</span></div>
                          <span style={{fontSize:10,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700}}>{fc(d.value)}</span>
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
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div className="stitle" style={{marginBottom:0}}>Recent Transactions</div>
              <button className="btn-ghost btn-sm" onClick={()=>setTab("Transactions")} style={{border:"none",color:C.accent,background:"transparent",cursor:"pointer"}}>All →</button>
            </div>
            {transactions.slice(0,6).map(t=>(
              <div key={t.id} className="row">
                <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0}}>
                  <div style={{width:36,height:36,borderRadius:10,background:(t.type==="income"?C.income:C.expense)+"14",border:`1px solid ${(t.type==="income"?C.income:C.expense)}25`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:15,fontWeight:700,color:t.type==="income"?C.income:C.expense}}>{t.type==="income"?"↑":"↓"}</div>
                  <div style={{minWidth:0}}>
                    <div style={{fontSize:12,display:"flex",gap:5,flexWrap:"wrap",alignItems:"center"}}>
                      <span style={{fontWeight:500}}>{t.category}</span>
                      {t.paymentMode&&<span className="tag" style={{background:C.surface,color:C.muted,fontSize:9}}>{t.paymentMode}</span>}
                    </div>
                    <div style={{fontSize:10,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
  {t.note?`${t.note} · `:""}{fd(t.date)}{t.time?` · ${t.time}`:""}
</div>
                  </div>
                </div>
                <span style={{color:t.type==="income"?C.income:C.expense,fontWeight:700,fontSize:13,flexShrink:0,fontFamily:"'Cabinet Grotesk',sans-serif"}}>{t.type==="income"?"+":"−"}{fc(t.amount)}</span>
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
                    <button key={v} onClick={()=>setStrategy(v)} style={{flex:1,padding:"8px 4px",borderRadius:9,border:`1px solid ${strategy===v?C.accent:C.border}`,background:strategy===v?C.accent+"15":"transparent",color:strategy===v?C.accent:C.muted,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:11,cursor:"pointer"}}>{l}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Recommended strategy */}
          {activeDebts.length>0&&(
            <div style={{marginBottom:12,padding:"12px 16px",background:`${C.income}10`,border:`1px solid ${C.income}25`,borderRadius:12}}>
              <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:13,color:C.income,marginBottom:4}}>🤖 Recommended: {recommended.strategy==="avalanche"?"Avalanche ⬆":"Snowball ❄"}</div>
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
                ...(accounts.length>0?[{label:"Account Balance", val:totalAccountBalance, color:C.accent}]:[]),
              ].map(item=>(
                <div key={item.label} style={{background:C.surface,borderRadius:10,padding:"10px 12px",border:`1px solid ${(item.label==="Left Over"||item.label==="Account Balance")?item.color+"40":C.border}`}}>
                  <div className="lbl">{item.label}</div>
                  <div style={{fontSize:14,fontWeight:700,color:item.color,fontFamily:"'Cabinet Grotesk',sans-serif"}}>{item.val>=0?"+":""}{fc(Math.abs(item.val))}</div>
                </div>
              ))}
            </div>
            {cashLeft<0&&<div style={{marginTop:10,padding:"8px 12px",background:`${C.expense}10`,borderRadius:10,fontSize:11,color:C.expense,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700}}>🚨 Spending exceeds income! Cut expenses immediately.</div>}
          </div>

          {/* Health score */}
          <div className="g2" style={{marginBottom:12}}>
            <div className="card" style={{display:"flex",flexDirection:"column",alignItems:"center",textAlign:"center"}}>
              <div className="stitle">Health Score</div>
              <ScoreRing score={health.score} color={health.color}/>
              <div style={{fontSize:18,fontWeight:800,color:health.color,fontFamily:"'Cabinet Grotesk',sans-serif",marginTop:8}}>Grade {health.grade}</div>
              <div style={{fontSize:11,color:C.muted,marginTop:4}}>{health.score>=85?"Excellent 🌟":health.score>=70?"Good 👍":health.score>=50?"Needs work ⚠️":"Critical 🚨"}</div>
            </div>
            <div className="card">
              <div className="stitle">Breakdown</div>
              {health.items.map(b=>(
                <div key={b.label} style={{marginBottom:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <span style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:600,fontSize:11}}>{b.label}</span>
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
                  <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:12,color:C.income}}>Save {fc(payoffPlan.reduce((s,p)=>s+p.interestSaved,0))}</div>
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
                          <div style={{width:24,height:24,borderRadius:"50%",background:pc+"20",color:pc,border:`2px solid ${pc}50`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:11}}>#{d.priority}</div>
                          <div><div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:13}}>{d.name}</div><div style={{fontSize:10,color:C.muted}}>{d.lender} · {d.interestRate}%</div></div>
                        </div>
                        <div style={{textAlign:"right"}}><div style={{fontSize:16,fontWeight:700,color:C.expense,fontFamily:"'Cabinet Grotesk',sans-serif"}}>{fc(d.bal)}</div></div>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(95px,1fr))",gap:8,marginBottom:8}}>
                        <div><div className="lbl">EMI</div><div style={{fontSize:12}}>{fc(d.emi)}/mo</div></div>
                        <div><div className="lbl">Extra</div><div style={{fontSize:12,color:C.accent}}>{fc(d.extraApplied)}</div></div>
                        <div><div className="lbl">Normal</div><div style={{fontSize:12,color:C.muted}}>{d.normalMonths?`${d.normalMonths}mo`:"—"}</div></div>
                        <div><div className="lbl">With Extra ⚡</div><div style={{fontSize:12,color:C.income,fontWeight:700}}>{d.boostedMonths?`${d.boostedMonths}mo`:"—"}</div></div>
                        {d.monthsSaved>0&&<div><div className="lbl">Saved</div><div style={{fontSize:12,color:C.income,fontWeight:700}}>🎉 {d.monthsSaved}mo</div></div>}
                      </div>
                      {d.totalAmount>0&&<><div className="pbar"><div className="pfill" style={{width:`${pct}%`,background:pc}}/></div><div style={{fontSize:10,color:C.muted,marginTop:3}}>{pct.toFixed(0)}% repaid</div></>}
                      {i===0&&<div style={{marginTop:8,padding:"6px 10px",background:pc+"12",borderRadius:8,fontSize:11,color:pc,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700}}>⭐ Put all extra funds here first</div>}
                      <div style={{display:"flex",gap:6,marginTop:10,flexWrap:"wrap"}}>
                        <button className="btn btn-p btn-sm" onClick={()=>{
                          // Pay Early — records this month's EMI now, before due date
                          const emiAmt = parseFloat(d.emi)||0;
                          if (!emiAmt) return;
                          const now = new Date();
                          const key = `emi_${d.id}_${now.getFullYear()}_${now.getMonth()}`;
                          const alreadyPaid = transactions.some(t=>t._emiKey===key);
                          if (alreadyPaid) { alert(`${d.name} EMI already recorded this month`); return; }
                          recordLoanPayment(d.id, emiAmt, key);
                        }}>⚡ Pay EMI Early</button>
                        <button className="btn btn-g btn-sm" onClick={()=>{const v=prompt(`Extra/custom payment for ${d.name}?\nOutstanding: ${fc(d.bal)}`);const n=parseFloat(v);if(!isNaN(n)&&n>0)recordLoanPayment(d.id,n);}}>💸 Custom Pay</button>
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
              <div key={item.label} className="scard"><div className="lbl">{item.label}</div><div style={{fontSize:17,fontWeight:700,color:item.color,fontFamily:"'Cabinet Grotesk',sans-serif"}}>{item.val}</div></div>
            ))}
          </div>

            {/* ════ CC EMI TRACKER ════ */}
<div className="card" style={{marginTop:16}}>
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
    <div>
      <div className="stitle" style={{marginBottom:2}}>📋 Credit Card EMI Tracker</div>
      <div style={{fontSize:11,color:C.muted}}>All EMIs running across your credit cards</div>
    </div>
    <button className="btn btn-p btn-sm" onClick={()=>{setCcEmiForm({...EMPTY_CC_EMI});setShowCCEmiForm(true);}}>+ Add EMI</button>
  </div>

  {/* Summary row */}
  <div style={{display:"flex",gap:10,marginBottom:12,flexWrap:"wrap"}}>
    <div style={{background:C.surface,borderRadius:10,padding:"10px 14px",border:`1px solid ${C.border}`,flex:1}}>
      <div className="lbl">Total CC EMI/month</div>
      <div style={{fontSize:16,fontWeight:700,color:C.warning,fontFamily:"'Cabinet Grotesk',sans-serif"}}>{fc(totalCCEMI)}</div>
    </div>
    <div style={{background:C.surface,borderRadius:10,padding:"10px 14px",border:`1px solid ${C.border}`,flex:1}}>
      <div className="lbl">Active EMIs</div>
      <div style={{fontSize:16,fontWeight:700,color:C.accent,fontFamily:"'Cabinet Grotesk',sans-serif"}}>{ccEmis.length}</div>
    </div>
    <div style={{background:C.surface,borderRadius:10,padding:"10px 14px",border:`1px solid ${C.border}`,flex:1}}>
      <div className="lbl">Total Remaining</div>
      <div style={{fontSize:16,fontWeight:700,color:C.expense,fontFamily:"'Cabinet Grotesk',sans-serif"}}>
        {fc(ccEmis.reduce((s,e)=>(parseFloat(e.amount)||0)*(parseFloat(e.monthsLeft)||0)+s,0))}
      </div>
    </div>
  </div>

  {ccEmis.length===0
    ? <div style={{textAlign:"center",padding:30,color:C.muted,fontSize:12}}>No CC EMIs added yet. Tap + Add EMI to track them.</div>
    : ccEmis.map(emi=>{
        const card = creditCards.find(c=>String(c.id)===String(emi.cardId));
        const totalLeft = (parseFloat(emi.amount)||0)*(parseFloat(emi.monthsLeft)||0);
        const pct = emi._totalMonths ? Math.min(100,((emi._totalMonths - parseFloat(emi.monthsLeft))/emi._totalMonths)*100) : 0;
        return(
          <div key={emi.id} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"12px",marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:6}}>
              <div>
                <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:13}}>{emi.description||"EMI"}</div>
                <div style={{fontSize:11,color:C.muted,marginTop:2}}>
                  {card?`${card.name} · ${card.bank}`:"Card not found"}
                </div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:15,fontWeight:700,color:C.warning,fontFamily:"'Cabinet Grotesk',sans-serif"}}>{fc(emi.amount)}/mo</div>
                <div style={{fontSize:10,color:C.muted}}>{emi.monthsLeft} months left</div>
              </div>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:C.muted,margin:"10px 0 6px"}}>
              <span>Remaining: <span style={{color:C.expense,fontWeight:700}}>{fc(totalLeft)}</span></span>
            </div>
            <div className="pbar" style={{marginBottom:8}}>
              <div className="pfill" style={{width:`${100-Math.min(100,(parseFloat(emi.monthsLeft)||0)/((emi._totalMonths||parseFloat(emi.monthsLeft)||1))*100)}%`,background:C.warning}}/>
            </div>
            <div style={{display:"flex",gap:6,marginTop:8}}>
              <button className="btn-ghost btn-sm" onClick={()=>{setCcEmiForm({...emi});setShowCCEmiForm(true);}}>Edit</button>
              <button className="btn btn-danger" onClick={()=>deleteCCEmi(emi.id)}>Delete</button>
            </div>
          </div>
        );
      })
  }
</div>
            
          {/* CC usage advice */}
          <div className="card" style={{marginBottom:12,borderColor:`${C.warning}30`}}>
            <div className="stitle">💡 Should You Use Credit Cards?</div>
            {effectiveIncome>0?(()=>{
              const dti=(totalEMI+totalCCEMI)/effectiveIncome;
              if(dti>0.5||totalCCOut>0){
                return<div style={{fontSize:12,lineHeight:1.8}}><div style={{color:C.expense,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,marginBottom:4}}>🚫 STOP using credit cards for new purchases</div><div style={{color:C.muted}}>EMIs are {(dti*100).toFixed(0)}% of income and you have ₹{totalCCOut.toLocaleString("en-IN")} outstanding. Switch to UPI/Debit only until debt clears.</div></div>;
              }else if(dti>0.3){
                return<div style={{fontSize:12,lineHeight:1.8}}><div style={{color:C.warning,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,marginBottom:4}}>⚠️ Use with caution</div><div style={{color:C.muted}}>Only for planned expenses you can pay in FULL before due date. Never carry a balance — 36% interest destroys finances.</div></div>;
              }
              return<div style={{fontSize:12,lineHeight:1.8}}><div style={{color:C.income,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,marginBottom:4}}>✅ Okay if used wisely</div><div style={{color:C.muted}}>Pay full statement amount monthly. Use for rewards/cashback only on already-budgeted spending.</div></div>;
            })():<div style={{fontSize:12,color:C.muted}}>Add monthly income in Plan tab for personalised advice.</div>}
          </div>

          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:14}}>Your Cards</div>
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
                        <div><div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:14}}>{cc.name}</div><div style={{fontSize:11,color:C.muted}}>{cc.bank} · {cc.interestRate}% p.a.</div></div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:17,fontWeight:700,color:C.expense,fontFamily:"'Cabinet Grotesk',sans-serif"}}>{fc(cc.outstanding)}</div>
                        <div style={{fontSize:10,color:C.muted}}>of {fc(cc.limit)} limit</div>
                      </div>
                    </div>
                    <div style={{marginBottom:10}}>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:C.muted,marginBottom:4}}><span>Utilization</span><span style={{color:sc,fontWeight:700}}>{det.utilization.toFixed(0)}% {det.status==="danger"?"🔴":det.status==="warning"?"🟡":"🟢"}</span></div>
                      <div className="pbar"><div className="pfill" style={{width:`${Math.min(det.utilization,100)}%`,background:sc}}/></div>
                      <div style={{fontSize:10,color:C.muted,marginTop:3}}>Keep below 30% for good credit score</div>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:10,marginBottom:10}}>
                      <div style={{background:C.surface,borderRadius:10,padding:"9px"}}>
                        <div className="lbl">Min Due</div>
                        <div style={{fontSize:14,fontWeight:700,color:C.warning,fontFamily:"'Cabinet Grotesk',sans-serif"}}>{fc(det.minDue)}</div>
                        <div style={{fontSize:10,color:C.muted}}>to avoid late fee</div>
                      </div>
                      <div style={{background:`${C.income}10`,border:`1px solid ${C.income}20`,borderRadius:10,padding:"9px"}}>
                        <div className="lbl">Full Payment ✓</div>
                        <div style={{fontSize:14,fontWeight:700,color:C.income,fontFamily:"'Cabinet Grotesk',sans-serif"}}>{fc(det.idealPayment)}</div>
                        <div style={{fontSize:10,color:C.muted}}>saves {fc(det.interestSavedByFull)}/mo interest</div>
                      </div>
                      {cc.dueDate&&<div><div className="lbl">Due Date</div><div style={{fontSize:13,fontWeight:600}}>{fd(cc.dueDate)}</div><DueBadge days={det.daysLeft} dueDate={cc.dueDate}/></div>}
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
              <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:12}}>{filteredTx.length} transactions</div>
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
                    <div style={{fontSize:10,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
  {t.note?`${t.note} · `:""}{fd(t.date)}{t.time?` · ${t.time}`:""}
</div>
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
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:6}}>
              <div className="stitle" style={{marginBottom:0}}>Set Monthly Limits</div>
              <span style={{fontSize:11,color:C.muted}}>Tracking: {new Date().toLocaleDateString("en-IN",{month:"long",year:"numeric"})}</span>
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <select className="inp" style={{flex:"1 1 140px"}} value={budgetForm.category} onChange={e=>setBudgetForm(p=>({...p,category:e.target.value}))}>{allCategories.expense.map(c=><option key={c}>{c}</option>)}</select>
              <input className="inp" style={{flex:"1 1 120px"}} placeholder="₹ limit" type="number" value={budgetForm.limit} onChange={e=>setBudgetForm(p=>({...p,limit:e.target.value}))}/>
              <button className="btn btn-p" onClick={addBudget}>Set</button>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(230px,1fr))",gap:10}}>
            {allCategories.expense.map((cat,i)=>{
              const limit=budgets[cat]||0, spent=thisMonthTx.filter(t=>t.type==="expense"&&t.category===cat).reduce((s,t)=>s+t.amount,0);
              const pct=limit>0?Math.min(100,(spent/limit)*100):0, over=spent>limit&&limit>0;
              return(
                <div key={cat} className="card">
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:8,height:8,borderRadius:"50%",background:CAT_COLORS[i]}}/><span style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:600,fontSize:12}}>{cat}</span></div>
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
                  <div style={{fontSize:9,color:item.color,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>{item.step}</div>
                  <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:12,marginBottom:4}}>{item.title}</div>
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
                      <div><div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:14}}>{s.name}</div><div style={{fontSize:10,color:C.muted}}>Goal: {fc(s.goal)}</div></div>
                      <div style={{fontSize:18,fontWeight:700,color:C.savings,fontFamily:"'Cabinet Grotesk',sans-serif"}}>{pct.toFixed(0)}%</div>
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
                <div style={{fontSize:18,fontWeight:700,color:item.color,fontFamily:"'Cabinet Grotesk',sans-serif"}}>{item.val}</div>
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
                          <div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:7,height:7,borderRadius:"50%",background:d.color}}/><span style={{fontSize:11,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:600}}>{d.name}</span></div>
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

        {/* ════════ SMART ════════ */}
        {tab==="Smart"&&<>

          {/* ── 15-Day Stress Panel ── */}
          <div className="card" style={{marginBottom:14, borderColor: next15Days.status==="risk"?`${C.expense}50`:next15Days.status==="tight"?`${C.warning}40`:C.border}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
              <div>
                <div className="stitle" style={{marginBottom:2}}>⚡ Next 15 Days — Stress Panel</div>
                <div style={{fontSize:11,color:C.muted}}>What's due before {new Date(Date.now()+15*864e5).toLocaleDateString("en-IN",{day:"numeric",month:"short"})}</div>
              </div>
              <div style={{
                padding:"8px 18px", borderRadius:99,
                background: next15Days.status==="safe"?`${C.income}18`:next15Days.status==="tight"?`${C.warning}18`:`${C.expense}18`,
                color: next15Days.status==="safe"?C.income:next15Days.status==="tight"?C.warning:C.expense,
                fontFamily:"'Cabinet Grotesk',sans-serif", fontWeight:800, fontSize:13,
              }}>
                {next15Days.status==="safe"?"✅ Safe":next15Days.status==="tight"?"⚠️ Tight":"🚨 Risk"}
              </div>
            </div>

            {next15Days.dues.length===0
              ? <div style={{textAlign:"center",padding:24,color:C.muted,fontSize:12}}>No dues in the next 15 days 🎉</div>
              : <>
                  <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:14}}>
                    {next15Days.dues.map((d,i) => (
                      <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",background:C.surface,borderRadius:12,border:`1px solid ${d.color}25`}}>
                        <div style={{display:"flex",alignItems:"center",gap:10}}>
                          <div style={{width:8,height:8,borderRadius:"50%",background:d.color,boxShadow:`0 0 6px ${d.color}80`,flexShrink:0}}/>
                          <div>
                            <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:13}}>{d.name}</div>
                            <div style={{fontSize:10,color:C.muted}}>{d.date.toLocaleDateString("en-IN",{weekday:"short",day:"numeric",month:"short"})} · {d.kind==="loan"?"Loan EMI":d.kind==="cc"?"CC Bill":"CC EMI"}</div>
                          </div>
                        </div>
                        <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:14,color:d.color}}>{fc(d.amt)}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{borderTop:`1px solid ${C.border}`,paddingTop:12,display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                    {[
                      {label:"Total Due",  val:fc(next15Days.totalDue),  color:C.expense},
                      {label:"Balance",    val:fc(next15Days.balance),   color:C.income},
                      {label:"After Dues", val:fc(next15Days.balance - next15Days.totalDue), color:(next15Days.balance-next15Days.totalDue)>=0?C.income:C.expense},
                    ].map(item=>(
                      <div key={item.label} style={{background:C.surface,borderRadius:12,padding:"10px 12px",textAlign:"center"}}>
                        <div className="lbl">{item.label}</div>
                        <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:14,color:item.color}}>{item.val}</div>
                      </div>
                    ))}
                  </div>
                </>
            }
          </div>

          {/* ── Account Register ── */}
          <div className="card" style={{marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div>
                <div className="stitle" style={{marginBottom:2}}>🏦 Account Register</div>
                <div style={{fontSize:11,color:C.muted}}>Your actual money across all accounts</div>
              </div>
              <button className="btn btn-p btn-sm" onClick={()=>{setAccountForm({...EMPTY_ACCOUNT});setEditAccountId(null);setShowAccountForm(true);}}>+ Add Account</button>
            </div>

            {accounts.length===0
              ? <div style={{textAlign:"center",padding:28,color:C.muted,fontSize:12,lineHeight:1.8}}>
                  No accounts yet.<br/>Add your SBI savings balance, cash, etc.<br/>
                  <span style={{color:C.accent}}>This makes your forecast real, not theoretical.</span>
                </div>
              : <>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:14}}>
                    {accounts.map(a=>(
                      <div key={a.id} style={{background:C.surface,borderRadius:14,padding:"14px",border:`1px solid ${a.color}30`,position:"relative"}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                          <div style={{fontSize:22}}>{a.icon}</div>
                          <div style={{display:"flex",gap:4}}>
                            <button className="btn-ghost" style={{padding:"2px 7px",fontSize:10}} onClick={()=>{setAccountForm({...a});setEditAccountId(a.id);setShowAccountForm(true);}}>Edit</button>
                            <button className="btn-danger" style={{padding:"2px 7px",fontSize:10}} onClick={()=>deleteAccount(a.id)}>✕</button>
                          </div>
                        </div>
                        <div className="lbl">{a.name}</div>
                        <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:18,color:a.color}}>{fc(parseFloat(a.balance)||0)}</div>
                        <div style={{fontSize:10,color:C.muted,marginTop:2,textTransform:"capitalize"}}>{a.type} · {a.bank}</div>
                        <div style={{display:"flex",gap:4,marginTop:8}}>
                          <button className="btn-ghost" style={{flex:1,padding:"4px",fontSize:11}} onClick={()=>{const v=prompt("Add amount:");const n=parseFloat(v);if(!isNaN(n))updateAccountBalance(a.id,n);}}>+ Add</button>
                          <button className="btn-ghost" style={{flex:1,padding:"4px",fontSize:11}} onClick={()=>{const v=prompt("Deduct amount:");const n=parseFloat(v);if(!isNaN(n))updateAccountBalance(a.id,-n);}}>− Deduct</button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{borderTop:`1px solid ${C.border}`,paddingTop:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:13}}>Total Balance</span>
                    <span style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:20,color:C.income}}>{fc(totalAccountBalance)}</span>
                  </div>
                </>
            }
          </div>

          {/* ── EMI Auto Engine Status ── */}
          <div className="card" style={{marginBottom:14}}>
            <div className="stitle">🤖 EMI Auto Engine</div>
            <div style={{fontSize:12,color:C.muted,marginBottom:14,lineHeight:1.7}}>
              When enabled, EMIs auto-deduct on due date, loan balances reduce automatically, and transactions are created. Toggle per loan below.
            </div>
            {activeDebts.length===0 && ccEmis.length===0
              ? <div style={{textAlign:"center",padding:20,color:C.muted,fontSize:12}}>Add loans and CC EMIs to enable automation.</div>
              : <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {activeDebts.map(d=>(
                    <div key={d.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",background:C.surface,borderRadius:12}}>
                      <div>
                        <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:13}}>{d.name}</div>
                        <div style={{fontSize:10,color:C.muted}}>{fc(d.emi)}/mo · Due day {d.dueDate?new Date(d.dueDate).getDate():"—"}</div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontSize:11,color:d.autoEMI===false?C.muted:C.income,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700}}>
                          {d.autoEMI===false?"Manual":"Auto ✓"}
                        </span>
                        <div onClick={()=>toggleDebtAutoEMI(d.id)} style={{
                          width:42,height:24,borderRadius:99,cursor:"pointer",
                          background:d.autoEMI===false?C.border:C.income,
                          position:"relative",transition:"background 0.2s",flexShrink:0,
                        }}>
                          <div style={{position:"absolute",top:3,left:d.autoEMI===false?3:21,width:18,height:18,borderRadius:"50%",background:"#fff",transition:"left 0.2s",boxShadow:"0 1px 4px rgba(0,0,0,0.2)"}}/>
                        </div>
                      </div>
                    </div>
                  ))}
                  {ccEmis.map(e=>{
                    const card = creditCards.find(c=>String(c.id)===String(e.cardId));
                    return(
                      <div key={e.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",background:C.surface,borderRadius:12}}>
                        <div>
                          <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:13}}>{e.description||"CC EMI"}</div>
                          <div style={{fontSize:10,color:C.muted}}>{fc(e.amount)}/mo · {card?.name||"Unknown card"} · {e.monthsLeft}mo left</div>
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <span style={{fontSize:11,color:e.autoEMI===false?C.muted:C.income,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700}}>
                            {e.autoEMI===false?"Manual":"Auto ✓"}
                          </span>
                          <div onClick={()=>toggleCCEmiAuto(e.id)} style={{
                            width:42,height:24,borderRadius:99,cursor:"pointer",
                            background:e.autoEMI===false?C.border:C.income,
                            position:"relative",transition:"background 0.2s",flexShrink:0,
                          }}>
                            <div style={{position:"absolute",top:3,left:e.autoEMI===false?3:21,width:18,height:18,borderRadius:"50%",background:"#fff",transition:"left 0.2s",boxShadow:"0 1px 4px rgba(0,0,0,0.2)"}}/>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
            }
          </div>

          {/* ── Debt Acceleration Simulator ── */}
          <div className="card" style={{marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14,flexWrap:"wrap",gap:8}}>
              <div>
                <div className="stitle" style={{marginBottom:2}}>🚀 Debt Acceleration Simulator</div>
                <div style={{fontSize:11,color:C.muted}}>Extra payment synced with Plan tab → one number, used everywhere</div>
              </div>
              {extraFund&&<span className="tag" style={{background:`${C.income}15`,color:C.income,fontSize:11}}>+{fc(parseFloat(extraFund)||0)}/mo</span>}
            </div>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,padding:"10px 14px",background:C.surface,borderRadius:12,border:`1px solid ${C.border}`}}>
              <div style={{flex:1}}>
                <div className="lbl">Extra monthly payment ₹</div>
                <input className="inp" type="number" placeholder="e.g. 2000" value={extraFund}
                  onChange={e=>setExtraFund(e.target.value)}
                  style={{background:"transparent",border:"none",padding:"4px 0",fontSize:16,fontWeight:700,fontFamily:"'Cabinet Grotesk',sans-serif"}}/>
              </div>
              <button className="btn-ghost btn-sm" onClick={()=>setTab("Plan")} style={{fontSize:11,whiteSpace:"nowrap"}}>Edit in Plan →</button>
            </div>
            {debtSimulator.length===0
              ? <div style={{textAlign:"center",padding:20,color:C.muted,fontSize:12}}>Add loans in the Plan tab first.</div>
              : <>
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    {debtSimulator.map(d=>(
                      <div key={d.id} style={{background:C.surface,borderRadius:14,padding:"14px 16px",border:`1px solid ${C.border}`}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10,flexWrap:"wrap",gap:6}}>
                          <div>
                            <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:14}}>{d.name}</div>
                            <div style={{fontSize:11,color:C.muted,marginBottom:4}}>{d.lender} · {d.interestRate}% p.a. · Outstanding {fc(d.bal)}</div>
                            {d.dueDate&&<DueBadge days={daysUntil(d.dueDate)} dueDate={d.dueDate}/>}
                          </div>
                          {d.monthsSaved>0&&(
                            <div style={{background:`${C.income}15`,borderRadius:10,padding:"6px 12px",border:`1px solid ${C.income}30`}}>
                              <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:13,color:C.income}}>🎉 {d.monthsSaved}mo faster</div>
                              <div style={{fontSize:10,color:C.muted}}>saves {fc(d.interestSaved)}</div>
                            </div>
                          )}
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                          <div style={{background:C.card,borderRadius:10,padding:"9px 12px",border:`1px solid ${C.border}`}}>
                            <div className="lbl">Normal</div>
                            <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:14,color:C.muted}}>{d.normal?d.normal+"mo":"—"}</div>
                            <div style={{fontSize:10,color:C.muted}}>EMI {fc(d.emi)}</div>
                          </div>
                          <div style={{background:`${C.accent}10`,borderRadius:10,padding:"9px 12px",border:`1px solid ${C.accent}30`}}>
                            <div className="lbl">With +{fc(parseFloat(extraFund)||0)}</div>
                            <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:14,color:C.accent}}>{d.boosted?d.boosted+"mo":"—"}</div>
                            <div style={{fontSize:10,color:C.muted}}>EMI {fc((parseFloat(d.emi)||0)+(parseFloat(extraFund)||0))}</div>
                          </div>
                          <div style={{background:`${C.income}10`,borderRadius:10,padding:"9px 12px",border:`1px solid ${C.income}30`}}>
                            <div className="lbl">Interest Saved</div>
                            <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:14,color:C.income}}>{fc(d.interestSaved)}</div>
                            <div style={{fontSize:10,color:C.muted}}>{d.monthsSaved>0?`${d.monthsSaved}mo earlier`:"no change"}</div>
                          </div>
                        </div>
                        {parseFloat(extraFund)>0&&d.monthsSaved>0&&(
                          <div style={{marginTop:10,padding:"8px 12px",background:`${C.income}08`,borderRadius:10,fontSize:11,color:C.income,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700}}>
                            💡 Pay ₹{(parseFloat(extraFund)||0).toLocaleString("en-IN")} extra monthly → free {d.monthsSaved} months earlier → save {fc(d.interestSaved)} in interest
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {debtSimulator.some(d=>d.monthsSaved>0)&&(
                    <div style={{marginTop:12,padding:"12px 16px",background:`linear-gradient(135deg,${C.income}12,${C.accent}08)`,borderRadius:14,border:`1px solid ${C.income}25`}}>
                      <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:14,color:C.income,marginBottom:4}}>
                        Total Savings with ₹{(parseFloat(extraFund)||0).toLocaleString("en-IN")}/mo extra
                      </div>
                      <div style={{display:"flex",gap:20,flexWrap:"wrap"}}>
                        <div><div className="lbl">Months Saved</div><div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:18,color:C.income}}>{debtSimulator.reduce((s,d)=>s+d.monthsSaved,0)}</div></div>
                        <div><div className="lbl">Interest Saved</div><div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:18,color:C.income}}>{fc(debtSimulator.reduce((s,d)=>s+d.interestSaved,0))}</div></div>
                      </div>
                    </div>
                  )}
                </>
            }
          </div>

          {/* ── Income Allocation System ── */}
          {effectiveIncome>0&&(
            <div className="card" style={{marginBottom:14}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                <div>
                  <div className="stitle" style={{marginBottom:2}}>📊 Income Allocation</div>
                  <div style={{fontSize:11,color:C.muted}}>How your ₹{effectiveIncome.toLocaleString("en-IN")} should be split</div>
                </div>
              </div>
              {incomeAllocation&&(
                <>
                  <div style={{display:"flex",height:12,borderRadius:99,overflow:"hidden",marginBottom:16,gap:2}}>
                    {incomeAllocation.buckets.map(b=>(
                      <div key={b.label} style={{flex:b.pct,background:b.color,transition:"flex 0.5s",minWidth:b.pct>0?4:0}}/>
                    ))}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(145px,1fr))",gap:10,marginBottom:14}}>
                    {incomeAllocation.buckets.map(b=>(
                      <div key={b.label} style={{background:C.surface,borderRadius:12,padding:"12px 14px",border:`1px solid ${b.color}25`}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                          <span style={{fontSize:18}}>{b.icon}</span>
                          <span style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:12,color:b.color}}>{b.pct}%</span>
                        </div>
                        <div className="lbl">{b.label}</div>
                        <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:15,color:b.color,marginBottom:4}}>{fc(b.amt)}</div>
                        <div style={{fontSize:10,color:C.muted}}>Actual: {fc(b.actual)}</div>
                        <div className="pbar" style={{marginTop:6}}>
                          <div className="pfill" style={{width:`${Math.min(100,(b.actual/Math.max(b.amt,1))*100)}%`,background:b.color}}/>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{fontSize:11,color:C.muted,marginBottom:10,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700}}>ADJUST ALLOCATION %</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    {[
                      {key:"emi",label:"EMIs %"},
                      {key:"living",label:"Living %"},
                      {key:"savings",label:"Savings %"},
                      {key:"buffer",label:"Buffer %"},
                    ].map(item=>(
                      <div key={item.key}>
                        <div className="lbl">{item.label}</div>
                        <input className="inp" type="number" min="0" max="100"
                          value={allocationPct[item.key]}
                          onChange={e=>setAllocationPct(p=>({...p,[item.key]:Math.min(100,parseInt(e.target.value)||0)}))}
                        />
                      </div>
                    ))}
                  </div>
                  {Object.values(allocationPct).reduce((s,v)=>s+v,0)!==100&&(
                    <div style={{marginTop:8,fontSize:11,color:C.warning,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700}}>
                      ⚠️ Percentages add up to {Object.values(allocationPct).reduce((s,v)=>s+v,0)}% — should be 100%
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Custom Categories ── */}
          <div className="card" style={{marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div>
                <div className="stitle" style={{marginBottom:2}}>🏷️ Custom Categories</div>
                <div style={{fontSize:11,color:C.muted}}>Add your own income & expense categories</div>
              </div>
              <button className="btn btn-p btn-sm" onClick={()=>setShowCatManager(true)}>Manage</button>
            </div>
            <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:140}}>
                <div className="lbl" style={{marginBottom:6}}>INCOME ({allCategories.income.length})</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                  {allCategories.income.map((c,i)=>(
                    <div key={c} style={{display:"flex",alignItems:"center",gap:4,padding:"4px 10px",borderRadius:99,background:customCats.income?.includes(c)?`${C.income}18`:C.surface,border:`1px solid ${customCats.income?.includes(c)?C.income+"40":C.border}`,fontSize:11,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:600}}>
                      <span>{c}</span>
                      {customCats.income?.includes(c)&&<span onClick={()=>deleteCustomCategory("income",c)} style={{cursor:"pointer",color:C.muted,marginLeft:2,fontSize:10}}>✕</span>}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{flex:1,minWidth:140}}>
                <div className="lbl" style={{marginBottom:6}}>EXPENSE ({allCategories.expense.length})</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                  {allCategories.expense.map((c,i)=>(
                    <div key={c} style={{display:"flex",alignItems:"center",gap:4,padding:"4px 10px",borderRadius:99,background:customCats.expense?.includes(c)?`${C.accent}18`:C.surface,border:`1px solid ${customCats.expense?.includes(c)?C.accent+"40":C.border}`,fontSize:11,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:600}}>
                      <span>{c}</span>
                      {customCats.expense?.includes(c)&&<span onClick={()=>deleteCustomCategory("expense",c)} style={{cursor:"pointer",color:C.muted,marginLeft:2,fontSize:10}}>✕</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── Recurring Bills ── */}
          <div className="card" style={{marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div>
                <div className="stitle" style={{marginBottom:2}}>🔄 Recurring Bills</div>
                <div style={{fontSize:11,color:C.muted}}>Netflix, electricity, insurance — auto-tracked every month</div>
              </div>
              <button className="btn btn-p btn-sm" onClick={()=>{setRecurringForm({...EMPTY_RECURRING});setEditRecurringId(null);setShowRecurringForm(true);}}>+ Add Bill</button>
            </div>
            {recurringBills.length===0
              ? <div style={{textAlign:"center",padding:"20px 0",color:C.muted,fontSize:12,lineHeight:1.8}}>
                  No recurring bills yet.<br/>
                  <span style={{color:C.accent}}>Add Netflix, electricity, gym etc. — they'll auto-deduct monthly.</span>
                </div>
              : <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {recurringBills.map(b=>{
                    const icon = RECURRING_ICONS[b.name] || "📌";
                    const daysLeft = b.dueDay ? (() => {
                      const now = new Date(); const due = new Date(now.getFullYear(), now.getMonth(), parseInt(b.dueDay));
                      if (due < now) due.setMonth(due.getMonth()+1);
                      return Math.ceil((due-now)/864e5);
                    })() : null;
                    return(
                      <div key={b.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 14px",background:C.surface,borderRadius:12,border:`1px solid ${b.active?C.border:C.border+"50"}`,opacity:b.active?1:0.55}}>
                        <div style={{display:"flex",alignItems:"center",gap:10}}>
                          <div style={{width:38,height:38,borderRadius:10,background:`${C.accent}14`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{icon}</div>
                          <div>
                            <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:13}}>{b.name}</div>
                            <div style={{fontSize:10,color:C.muted}}>{b.category} · Due {b.dueDay}{["st","nd","rd"][b.dueDay-1]||"th"} every month{daysLeft!==null?` · `+( daysLeft===0?"due today":daysLeft===1?"tomorrow":`${daysLeft}d left`):""}</div>
                          </div>
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:10}}>
                          <div style={{textAlign:"right"}}>
                            <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:14,color:b.type==="income"?C.income:C.expense}}>{b.type==="income"?"+":"-"}{fc(parseFloat(b.amount)||0)}</div>
                            <div style={{fontSize:9,color:C.muted,textTransform:"uppercase",letterSpacing:0.5}}>monthly</div>
                          </div>
                          <div style={{display:"flex",gap:4}}>
                            <div onClick={()=>toggleRecurring(b.id)} style={{width:36,height:20,borderRadius:99,cursor:"pointer",background:b.active?C.income:C.border,position:"relative",transition:"background 0.2s",flexShrink:0}}>
                              <div style={{position:"absolute",top:2,left:b.active?18:2,width:16,height:16,borderRadius:"50%",background:"#fff",transition:"left 0.2s",boxShadow:"0 1px 3px rgba(0,0,0,0.2)"}}/>
                            </div>
                            <button className="btn-ghost" style={{padding:"3px 8px",fontSize:10}} onClick={()=>{setRecurringForm({...b,amount:String(b.amount),dueDay:String(b.dueDay)});setEditRecurringId(b.id);setShowRecurringForm(true);}}>Edit</button>
                            <button className="btn-danger" style={{padding:"3px 8px",fontSize:10}} onClick={()=>deleteRecurring(b.id)}>✕</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div style={{marginTop:4,padding:"10px 14px",background:C.surface,borderRadius:12,border:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontSize:12,color:C.muted,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:600}}>Total recurring/month</span>
                    <span style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:14,color:C.expense}}>
                      {fc(recurringBills.filter(b=>b.active&&b.type!=="income").reduce((s,b)=>s+(parseFloat(b.amount)||0),0))}
                    </span>
                  </div>
                </div>
            }
          </div>

          {/* ── Export & Reports ── */}
          <div className="card" style={{marginBottom:14}}>
            <div className="stitle" style={{marginBottom:14}}>📤 Export & Reports</div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {/* Date range filter */}
              <div style={{padding:"12px 14px",background:C.surface,borderRadius:12,border:`1px solid ${C.border}`}}>
                <div className="lbl" style={{marginBottom:8}}>FILTER BY DATE RANGE (optional)</div>
                <div className="g2">
                  <div><div className="lbl">From</div><input className="inp" type="date" value={exportDateFrom} onChange={e=>setExportDateFrom(e.target.value)}/></div>
                  <div><div className="lbl">To</div><input className="inp" type="date" value={exportDateTo} onChange={e=>setExportDateTo(e.target.value)}/></div>
                </div>
                {(exportDateFrom||exportDateTo)&&(
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:8}}>
                    <div style={{fontSize:11,color:C.accent,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700}}>
                      {getFilteredTxForExport().length} transactions selected
                    </div>
                    <button className="btn-ghost btn-sm" onClick={()=>{setExportDateFrom("");setExportDateTo("");}}>Clear</button>
                  </div>
                )}
              </div>
              {/* Export buttons */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                {[
                  {icon:"📊",label:"Excel (.xls)",sub:"Transactions spreadsheet",fn:exportXLS,color:C.income},
                  {icon:"📋",label:"CSV",sub:"Universal format",fn:exportCSV,color:C.accent},
                  {icon:"📈",label:"Summary XLS",sub:"Category totals",fn:exportSummaryXLS,color:C.warning},
                  {icon:"📄",label:"Loan Report",sub:"All loan details (.txt)",fn:exportLoansPDF,color:C.loan},
                ].map(item=>(
                  <button key={item.label} onClick={item.fn} style={{
                    padding:"14px 12px",borderRadius:14,border:`1px solid ${item.color}30`,
                    background:`${item.color}08`,cursor:"pointer",textAlign:"left",
                    transition:"all 0.2s",
                  }}
                  onMouseEnter={e=>e.currentTarget.style.background=`${item.color}15`}
                  onMouseLeave={e=>e.currentTarget.style.background=`${item.color}08`}>
                    <div style={{fontSize:22,marginBottom:6}}>{item.icon}</div>
                    <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:13,color:item.color}}>{item.label}</div>
                    <div style={{fontSize:10,color:C.muted,marginTop:2}}>{item.sub}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

        </>}

        {/* ════════ CA ADVISOR ════════ */}
        {tab==="Finance"&&<>
          {/* 1. Monthly Scorecard */}
          <div className="card" style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:6}}>
              <div className="stitle" style={{marginBottom:0}}>📋 Monthly Scorecard</div>
              <span style={{fontSize:11,color:C.muted}}>{new Date().toLocaleDateString("en-IN",{month:"long",year:"numeric"})}</span>
            </div>
            {(()=>{
              const savRate=thisMonthInc>0?((thisMonthInc-thisMonthExp)/thisMonthInc*100):0;
              const dtiOk=effectiveIncome>0&&(totalEMI+totalCCEMI)/effectiveIncome<0.4;
              const budgetOk=spendAlerts.filter(a=>a.over).length===0;
              const savOk=savRate>=10;
              const score=[dtiOk,budgetOk,savOk].filter(Boolean).length;
              const vColor=score===3?C.income:score>=2?C.warning:C.expense;
              return(<>
                <div style={{textAlign:"center",padding:"10px 0 12px",borderBottom:`1px solid ${C.border}`,marginBottom:12}}>
                  <div style={{fontSize:20,fontWeight:800,color:vColor,fontFamily:"'Cabinet Grotesk',sans-serif"}}>
                    {score===3?"✅ On Track":score>=2?"⚠️ Needs Attention":"🚨 Action Required"}
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10}}>
                  {[
                    {label:"Income This Month",  val:fc(thisMonthInc),  color:C.income,  ok:thisMonthInc>0},
                    {label:"Spent This Month",   val:fc(thisMonthExp),  color:C.expense, ok:thisMonthExp<(effectiveIncome||Infinity)},
                    {label:"Saved This Month",   val:fc(Math.max(0,thisMonthInc-thisMonthExp)), color:C.savings, ok:savOk},
                    {label:"Savings Rate",       val:savRate.toFixed(1)+"%", color:savOk?C.income:C.expense, ok:savOk},
                    {label:"EMI Burden",         val:effectiveIncome>0?((totalEMI+totalCCEMI)/effectiveIncome*100).toFixed(0)+"%":"—", color:dtiOk?C.income:C.expense, ok:dtiOk},
                    {label:"Budget Status",      val:spendAlerts.filter(a=>a.over).length===0?"Clear":spendAlerts.filter(a=>a.over).length+" over", color:budgetOk?C.income:C.expense, ok:budgetOk},
                  ].map(item=>(
                    <div key={item.label} style={{background:C.surface,borderRadius:10,padding:"10px 12px",border:`1px solid ${item.ok?item.color+"30":C.border}`}}>
                      <div className="lbl">{item.label}</div>
                      <div style={{fontSize:14,fontWeight:700,color:item.color,fontFamily:"'Cabinet Grotesk',sans-serif"}}>{item.val}</div>
                      <div style={{fontSize:10,marginTop:2,color:item.ok?C.income:C.expense}}>{item.ok?"✓ Good":"✗ Review"}</div>
                    </div>
                  ))}
                </div>
              </>);
            })()}
          </div>

          {/* 2. Net Worth */}
          <div className="card" style={{marginBottom:12}}>
            <div className="stitle">💎 Net Worth</div>
            <div style={{textAlign:"center",padding:"8px 0 12px"}}>
              <div style={{fontSize:11,color:C.muted,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Total Net Worth</div>
              <div style={{fontSize:32,fontWeight:800,color:netWorth>=0?C.income:C.expense,fontFamily:"'Cabinet Grotesk',sans-serif"}}>{fc(netWorth)}</div>
              <div style={{fontSize:11,color:C.muted,marginTop:4}}>{netWorth>=0?"Assets exceed liabilities 👍":"More liabilities — keep paying down debt"}</div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
              {[
                {label:"Savings/Goals",val:savingsTotal,    color:C.income, sign:"+"},
                {label:"Loan Debt",    val:totalOutstanding,color:C.expense,sign:"−"},
                {label:"CC Debt",      val:totalCCOut,      color:C.credit, sign:"−"},
              ].map(item=>(
                <div key={item.label} style={{background:C.surface,borderRadius:10,padding:"10px",textAlign:"center",border:`1px solid ${C.border}`}}>
                  <div className="lbl">{item.label}</div>
                  <div style={{fontSize:12,fontWeight:700,color:item.color,fontFamily:"'Cabinet Grotesk',sans-serif"}}>{item.sign}{fc(item.val)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 3. Debt-Free Countdown */}
          <div className="card" style={{marginBottom:12,borderColor:`${C.loan}30`}}>
            <div className="stitle">🏁 Debt-Free Countdown</div>
            {debtFreeMonths===0
              ?<div style={{textAlign:"center",padding:20,fontSize:16,color:C.income,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800}}>🎉 You're Debt Free!</div>
              :debtFreeMonths===null
              ?<div style={{fontSize:12,color:C.muted,textAlign:"center",padding:16}}>Add EMI amounts to your loans to see countdown.</div>
              :(()=>{
                const yrs=Math.floor(debtFreeMonths/12),mos=debtFreeMonths%12;
                const dfDate=new Date();dfDate.setMonth(dfDate.getMonth()+debtFreeMonths);
                const extra=parseFloat(extraFund)||0;
                const withExtra=extra>0?Math.max(1,Math.ceil((totalOutstanding+totalCCOut)/(totalEMI+totalCCEMI+extra))):null;
                return(
                  <div style={{textAlign:"center"}}>
                    <div style={{fontSize:36,fontWeight:800,color:C.loan,fontFamily:"'Cabinet Grotesk',sans-serif",marginBottom:4}}>{yrs>0?`${yrs}y `:""}{mos>0?`${mos}m`:"< 1m"}</div>
                    <div style={{fontSize:12,color:C.muted,marginBottom:14}}>Debt-free by <span style={{color:C.text,fontWeight:700}}>{dfDate.toLocaleDateString("en-IN",{month:"long",year:"numeric"})}</span></div>
                    <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
                      <div style={{background:C.surface,borderRadius:10,padding:"10px 14px",border:`1px solid ${C.border}`}}>
                        <div className="lbl">Total Owed</div>
                        <div style={{fontSize:14,fontWeight:700,color:C.expense,fontFamily:"'Cabinet Grotesk',sans-serif"}}>{fc(totalOutstanding+totalCCOut)}</div>
                      </div>
                      <div style={{background:C.surface,borderRadius:10,padding:"10px 14px",border:`1px solid ${C.border}`}}>
                        <div className="lbl">Monthly Payment</div>
                        <div style={{fontSize:14,fontWeight:700,color:C.loan,fontFamily:"'Cabinet Grotesk',sans-serif"}}>{fc(totalEMI+totalCCEMI)}</div>
                      </div>
                      {withExtra&&withExtra<debtFreeMonths&&<div style={{background:`${C.income}10`,borderRadius:10,padding:"10px 14px",border:`1px solid ${C.income}30`}}>
                        <div className="lbl">With Extra {fc(extra)}</div>
                        <div style={{fontSize:14,fontWeight:700,color:C.income,fontFamily:"'Cabinet Grotesk',sans-serif"}}>{debtFreeMonths-withExtra}m faster</div>
                      </div>}
                    </div>
                  </div>
                );
              })()
            }
          </div>

          {/* 4. Spend Alerts */}
          <div className="card" style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div className="stitle" style={{marginBottom:0}}>🔔 Spend Alerts</div>
              <span style={{fontSize:11,color:C.muted}}>this month vs limits</span>
            </div>
            {Object.keys(budgets).length===0
              ?<div style={{fontSize:12,color:C.muted,textAlign:"center",padding:20}}>No budgets set. Go to <button onClick={()=>setTab("Budget")} style={{background:"none",border:"none",color:C.accent,cursor:"pointer",fontWeight:700,fontSize:12}}>Budget tab</button>.</div>
              :spendAlerts.length===0
              ?<div style={{fontSize:12,color:C.income,textAlign:"center",padding:20,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700}}>✅ All categories within budget!</div>
              :spendAlerts.map(a=>(
                <div key={a.cat} style={{marginBottom:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:5,flexWrap:"wrap",gap:4}}>
                    <span style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:12}}>{a.cat}</span>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      <span style={{fontSize:11,color:C.muted}}>{fc(a.spent)} / {fc(a.limit)}</span>
                      <span className="tag" style={{background:a.over?`${C.expense}20`:`${C.warning}20`,color:a.over?C.expense:C.warning}}>{a.over?"🚨 Over!":"⚠️ "+a.pct+"%"}</span>
                    </div>
                  </div>
                  <div className="pbar"><div className="pfill" style={{width:`${Math.min(a.pct,100)}%`,background:a.over?C.expense:C.warning}}/></div>
                  {a.over&&<div style={{fontSize:10,color:C.expense,marginTop:3}}>Over by {fc(a.spent-a.limit)}</div>}
                </div>
              ))
            }
          </div>

          {/* 5. This Month vs Last Month */}
          <div className="card" style={{marginBottom:12}}>
            <div className="stitle">📊 This Month vs Last Month</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
              {[
                {label:"Income",  thisVal:thisMonthInc,lastVal:lastMonthInc,color:C.income},
                {label:"Expenses",thisVal:thisMonthExp,lastVal:lastMonthExp,color:C.expense},
              ].map(item=>{
                const diff=item.thisVal-item.lastVal;
                const pct=item.lastVal>0?Math.abs(diff/item.lastVal*100):0;
                const better=item.label==="Income"?diff>=0:diff<=0;
                return(
                  <div key={item.label} style={{background:C.surface,borderRadius:12,padding:"12px",border:`1px solid ${C.border}`}}>
                    <div className="lbl">{item.label}</div>
                    <div style={{fontSize:15,fontWeight:700,color:item.color,fontFamily:"'Cabinet Grotesk',sans-serif"}}>{fc(item.thisVal)}</div>
                    <div style={{fontSize:10,color:C.muted,marginTop:2}}>Last: {fc(item.lastVal)}</div>
                    {item.lastVal>0&&<div style={{fontSize:11,fontWeight:700,color:better?C.income:C.expense,marginTop:4}}>{diff>=0?"↑":"↓"} {pct.toFixed(1)}% {better?"better":"worse"}</div>}
                  </div>
                );
              })}
            </div>
            <div style={{fontSize:11,color:C.muted,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,marginBottom:8}}>BY CATEGORY</div>
            {catComparison.length===0?<div style={{fontSize:12,color:C.muted,textAlign:"center",padding:10}}>No data yet.</div>
              :catComparison.sort((a,b)=>(b.thisMonth+b.lastMonth)-(a.thisMonth+a.lastMonth)).slice(0,8).map(c=>{
                const diff=c.thisMonth-c.lastMonth;const maxVal=Math.max(c.thisMonth,c.lastMonth,1);
                return(
                  <div key={c.cat} style={{marginBottom:10}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4,flexWrap:"wrap",gap:4}}>
                      <span style={{fontSize:11,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:600}}>{c.cat}</span>
                      <div style={{display:"flex",gap:8,fontSize:10}}>
                        <span style={{color:C.accent}}>This: {fc(c.thisMonth)}</span>
                        <span style={{color:C.muted}}>Last: {fc(c.lastMonth)}</span>
                        {diff!==0&&<span style={{color:diff>0?C.expense:C.income,fontWeight:700}}>{diff>0?"↑":"↓"}{fc(Math.abs(diff))}</span>}
                      </div>
                    </div>
                    <div style={{display:"flex",gap:3,height:6}}>
                      <div style={{flex:c.lastMonth/maxVal,background:C.muted+"50",borderRadius:3,minWidth:c.lastMonth>0?2:0}}/>
                      <div style={{flex:c.thisMonth/maxVal,background:diff>0?C.expense:C.income,borderRadius:3,minWidth:c.thisMonth>0?2:0}}/>
                    </div>
                  </div>
                );
              })
            }
          </div>

          {/* 6. Savings Rate Trend */}
          <div className="card" style={{marginBottom:12}}>
            <div className="stitle">📈 Savings Rate Trend</div>
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={savingsRateTrend}>
                <XAxis dataKey="label" tick={{fill:C.muted,fontSize:9}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fill:C.muted,fontSize:9}} axisLine={false} tickLine={false} tickFormatter={v=>v.toFixed(0)+"%"} width={32}/>
                <Tooltip contentStyle={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,fontSize:11}} formatter={v=>[v.toFixed(1)+"%","Savings Rate"]}/>
                <Line type="monotone" dataKey="rate" stroke={C.income} strokeWidth={2.5} dot={{fill:C.income,r:4}}/>
              </LineChart>
            </ResponsiveContainer>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:8}}>
              {savingsRateTrend.map(m=>(
                <div key={m.label} style={{background:C.surface,borderRadius:8,padding:"6px 10px",border:`1px solid ${m.rate>=20?C.income:m.rate>=10?C.warning:C.expense}30`,flex:1,minWidth:50,textAlign:"center"}}>
                  <div style={{fontSize:9,color:C.muted,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700}}>{m.label}</div>
                  <div style={{fontSize:12,fontWeight:700,color:m.rate>=20?C.income:m.rate>=10?C.warning:C.expense,fontFamily:"'Cabinet Grotesk',sans-serif"}}>{m.rate.toFixed(0)}%</div>
                </div>
              ))}
            </div>
            <div style={{marginTop:8,fontSize:11,color:C.muted}}><span style={{color:C.income,fontWeight:700}}>20%+</span> healthy · <span style={{color:C.warning,fontWeight:700}}>10–20%</span> okay · <span style={{color:C.expense,fontWeight:700}}>&lt;10%</span> low</div>
          </div>

          {/* 7. EMI Calendar */}
          <div className="card" style={{marginBottom:12}}>
            <div className="stitle">📅 EMI Due Calendar — {new Date().toLocaleDateString("en-IN",{month:"long",year:"numeric"})}</div>
            {(()=>{
              const now=new Date(),daysInMonth=new Date(now.getFullYear(),now.getMonth()+1,0).getDate(),firstDow=new Date(now.getFullYear(),now.getMonth(),1).getDay();
              const dueDays={};
              [...activeDebts,...creditCards].forEach(item=>{if(item.dueDate){const d=new Date(item.dueDate).getDate();if(!dueDays[d])dueDays[d]=[];dueDays[d].push({name:item.name,amt:parseFloat(item.emi||item.minDue||0)});}});
              ccEmis.forEach(emi=>{const card=creditCards.find(c=>String(c.id)===String(emi.cardId));if(card?.dueDate){const d=new Date(card.dueDate).getDate();if(!dueDays[d])dueDays[d]=[];dueDays[d].push({name:emi.description||card.name,amt:parseFloat(emi.amount||0)});}});
              const todayNum=now.getDate();
              return(<>
                <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3,marginBottom:10}}>
                  {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d=><div key={d} style={{textAlign:"center",fontSize:9,color:C.muted,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,paddingBottom:4}}>{d}</div>)}
                  {Array.from({length:firstDow},(_,i)=><div key={"e"+i}/>)}
                  {Array.from({length:daysInMonth},(_,i)=>{
                    const day=i+1,dues=dueDays[day]||[],isToday=day===todayNum,isPast=day<todayNum;
                    return(<div key={day} style={{textAlign:"center",padding:"5px 2px",borderRadius:7,fontSize:10,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:dues.length?700:400,
                      background:dues.length?`${C.warning}20`:isToday?`${C.accent}20`:"transparent",
                      border:isToday?`1px solid ${C.accent}`:dues.length?`1px solid ${C.warning}40`:`1px solid transparent`,
                      color:dues.length?C.warning:isPast?C.muted:C.text,position:"relative"}}>
                      {day}{dues.length>0&&<div style={{position:"absolute",top:1,right:2,width:4,height:4,borderRadius:"50%",background:C.expense}}/>}
                    </div>);
                  })}
                </div>
                {Object.keys(dueDays).length===0?<div style={{fontSize:12,color:C.muted,textAlign:"center",padding:10}}>No due dates set on loans or cards.</div>
                  :<div style={{borderTop:`1px solid ${C.border}`,paddingTop:10}}>
                    <div style={{fontSize:11,color:C.muted,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,marginBottom:8}}>DUE THIS MONTH</div>
                    {Object.entries(dueDays).sort((a,b)=>+a[0]-+b[0]).map(([day,items])=>(
                      <div key={day} style={{display:"flex",gap:10,marginBottom:8,alignItems:"flex-start"}}>
                        <div style={{width:28,height:28,borderRadius:8,background:`${C.warning}15`,color:C.warning,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:11,flexShrink:0}}>{day}</div>
                        <div style={{flex:1}}>{items.map((item,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:2}}><span>{item.name}</span><span style={{color:C.warning,fontWeight:700}}>{fc(item.amt)}</span></div>)}</div>
                      </div>
                    ))}
                    <div style={{borderTop:`1px solid ${C.border}`,paddingTop:8,display:"flex",justifyContent:"space-between",fontSize:12,fontWeight:700}}>
                      <span style={{fontFamily:"'Cabinet Grotesk',sans-serif"}}>Total Due</span>
                      <span style={{color:C.warning}}>{fc(Object.values(dueDays).flat().reduce((s,d)=>s+d.amt,0))}</span>
                    </div>
                  </div>
                }
              </>);
            })()}
          </div>

          {/* 8. Cash Flow Forecast */}
          <div className="card" style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div className="stitle" style={{marginBottom:0}}>💰 30-Day Cash Flow</div>
              <span style={{fontSize:11,color:C.muted}}>projected balance</span>
            </div>
            {effectiveIncome===0
              ?<div style={{fontSize:12,color:C.muted,textAlign:"center",padding:16}}>Set monthly income in <button onClick={()=>setTab("Plan")} style={{background:"none",border:"none",color:C.accent,cursor:"pointer",fontWeight:700,fontSize:12}}>Plan tab</button>.</div>
              :(()=>{
                const minBal=Math.min(...cashFlowForecast.map(d=>d.balance));
                const endBal=cashFlowForecast[cashFlowForecast.length-1]?.balance||0;
                const dangerDays=cashFlowForecast.filter(d=>d.balance<0);
                return(<>
                  {dangerDays.length>0&&<div style={{padding:"8px 12px",background:`${C.expense}10`,border:`1px solid ${C.expense}25`,borderRadius:10,fontSize:11,color:C.expense,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,marginBottom:10}}>🚨 Balance may go negative starting day {dangerDays[0].day}</div>}
                  <ResponsiveContainer width="100%" height={140}>
                    <LineChart data={cashFlowForecast.filter((_,i)=>i%2===0)}>
                      <XAxis dataKey="label" tick={{fill:C.muted,fontSize:9}} axisLine={false} tickLine={false}/>
                      <YAxis tick={{fill:C.muted,fontSize:9}} axisLine={false} tickLine={false} tickFormatter={v=>`₹${Math.abs(v)>=1000?(v/1000).toFixed(0)+"k":v}`} width={42}/>
                      <Tooltip contentStyle={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,fontSize:11}} formatter={v=>[fc(v),"Balance"]}/>
                      <Line type="monotone" dataKey="balance" stroke={minBal<0?C.expense:C.income} strokeWidth={2} dot={false}/>
                    </LineChart>
                  </ResponsiveContainer>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginTop:10}}>
                    {[{label:"Now",val:cashLeft,color:cashLeft>=0?C.income:C.expense},{label:"Min (30d)",val:minBal,color:minBal>=0?C.income:C.expense},{label:"Day 30",val:endBal,color:endBal>=0?C.income:C.expense}].map(item=>(
                      <div key={item.label} style={{background:C.surface,borderRadius:10,padding:"9px",textAlign:"center",border:`1px solid ${C.border}`}}>
                        <div className="lbl">{item.label}</div>
                        <div style={{fontSize:12,fontWeight:700,color:item.color,fontFamily:"'Cabinet Grotesk',sans-serif"}}>{fc(item.val)}</div>
                      </div>
                    ))}
                  </div>
                </>);
              })()
            }
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

      {/* ── Hamburger Menu (mobile only) ── */}
      {showMenu&&<div className="hmenu-overlay" onClick={()=>setShowMenu(false)}/>}
      <div className={`hmenu ${showMenu?"open":""}`}>
        <div style={{padding:"20px 20px 12px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:28,height:28,background:"linear-gradient(135deg,#38bdf8,#6366f1)",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:13}}>₹</div>
            <span style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:15}}>FinTrack</span>
          </div>
          <button onClick={()=>setShowMenu(false)} style={{background:"transparent",border:"none",color:C.muted,fontSize:20,cursor:"pointer",padding:"2px 6px"}}>×</button>
        </div>
        <div style={{padding:"8px 0",flex:1,overflowY:"auto"}}>
          <div style={{padding:"6px 20px 4px",fontSize:9,color:C.muted,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,letterSpacing:1.5,textTransform:"uppercase"}}>Navigation</div>
          {ALL_TABS.map(t=>{
            const icons={"Dashboard":"🏠","Plan":"🎯","Cards":"💳","Transactions":"📋","Budget":"📊","Goals":"🌱","Insights":"🔍","Finance":"💹"};
            return(
              <button key={t} className={`hmenu-item ${tab===t?"active":""}`} onClick={()=>{setTab(t);setShowMenu(false);}}>
                <span style={{fontSize:16}}>{icons[t]||"•"}</span>{t}
              </button>
            );
          })}
          <div style={{height:1,background:C.border,margin:"8px 16px"}}/>
          <div style={{padding:"6px 20px 4px",fontSize:9,color:C.muted,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,letterSpacing:1.5,textTransform:"uppercase"}}>Actions</div>
          <button className="hmenu-item" onClick={()=>{setShowImport(true);setShowMenu(false);}}>
            <span style={{fontSize:16}}>⬆️</span>Import CSV
          </button>
          <button className="hmenu-item" onClick={()=>{exportTransactions();setShowMenu(false);}}>
            <span style={{fontSize:16}}>⬇️</span>Export CSV
          </button>
          <button className="hmenu-item" onClick={()=>{setShowSettings(true);setShowMenu(false);}}>
            <span style={{fontSize:16}}>⚙️</span>Settings
          </button>
          <div style={{height:1,background:C.border,margin:"8px 16px"}}/>
          <button className="hmenu-item" onClick={()=>{handleLogout();setShowMenu(false);}} style={{color:C.expense}}>
            <span style={{fontSize:16}}>🚪</span>Logout
          </button>
        </div>
        <div style={{padding:"12px 20px",borderTop:`1px solid ${C.border}`,fontSize:10,color:C.muted}}>
          <span className="sync-dot"/>{saving?"Saving…":lastSaved?`Saved ${lastSaved.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}`:"Not saved yet"}
        </div>
      </div>

      {/* ══════ MODALS ══════ */}

      {/* Add/Edit Transaction */}
      {showTxForm&&(
        <div className="modal" onClick={e=>e.target===e.currentTarget&&(setShowTxForm(false),setEditTxId(null))}>
          <div className="sheet">
            <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:17,marginBottom:14}}>{editTxId?"Edit":"Add"} Transaction</div>
            <div style={{display:"flex",gap:6,marginBottom:14,background:C.surface,padding:4,borderRadius:12}}>
              {["expense","income"].map(type=>(
                <button key={type} className="btn" onClick={()=>setTxForm(p=>({...p,type,category:allCategories[type][0]}))} style={{flex:1,background:txForm.type===type?(type==="income"?C.income:C.expense):"transparent",color:txForm.type===type?"#fff":C.muted}}>
                  {type==="income"?"↑ Income":"↓ Expense"}
                </button>
              ))}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <div><div className="lbl">Amount ₹</div><input className="inp" type="number" placeholder="0" value={txForm.amount} onChange={e=>setTxForm(p=>({...p,amount:e.target.value}))}/></div>
              <div className="g2">
                <div><div className="lbl">Category</div><select className="inp" value={txForm.category} onChange={e=>setTxForm(p=>({...p,category:e.target.value}))}>{allCategories[txForm.type].map(c=><option key={c}>{c}</option>)}</select></div>
                <div><div className="lbl">Payment Mode</div><select className="inp" value={txForm.paymentMode} onChange={e=>setTxForm(p=>({...p,paymentMode:e.target.value,bank:""}))}>{PAYMENT_MODES.map(m=><option key={m}>{m}</option>)}</select></div>
              </div>
              {/* Account selector — smart based on payment mode */}
              <div className="g2">
                <div>
                  <div className="lbl">
                    {txForm.paymentMode==="Credit Card"?"Credit Card Used":txForm.type==="income"?"Deposit To Account":"Paid From Account"}
                  </div>
                  {txForm.paymentMode==="Credit Card"
                    ? <select className="inp" value={txForm.bank} onChange={e=>setTxForm(p=>({...p,bank:e.target.value,_accountId:""}))}>
                        <option value="">Select card</option>
                        {creditCards.map(c=><option key={c.id} value={c.name}>{c.name} · {c.bank}</option>)}
                      </select>
                    : <select className="inp" value={txForm._accountId} onChange={e=>setTxForm(p=>({...p,_accountId:e.target.value}))}>
                        <option value="">No account (manual)</option>
                        {accounts.map(a=><option key={a.id} value={a.id}>{a.icon||"🏦"} {a.name} — {fc(parseFloat(a.balance)||0)}</option>)}
                      </select>
                  }
                </div>
                <div><div className="lbl">Date</div><input className="inp" type="date" value={txForm.date} onChange={e=>setTxForm(p=>({...p,date:e.target.value}))}/></div>
</div>

<div className="g2">
  <div>
    <div className="lbl">Time</div>
    <input className="inp" type="time" value={txForm.time||""} onChange={e=>setTxForm(p=>({...p,time:e.target.value}))}/>
  </div>
  <div style={{display:"flex",alignItems:"flex-end"}}>
    <button className="btn-ghost btn-sm" style={{width:"100%",padding:"10px"}}
      onClick={()=>setTxForm(p=>({...p,time:new Date().toTimeString().slice(0,5)}))}>
      🕐 Set Now
    </button>
  </div>
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
            <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:17,marginBottom:14}}>{editDebtId?"Edit":"Add"} Loan</div>
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
            <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:17,marginBottom:14}}>{editCCId?"Edit":"Add"} Credit Card</div>
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
            <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:17,marginBottom:8}}>⬆ Import Bank CSV</div>
            <div style={{fontSize:11,color:C.muted,marginBottom:14,lineHeight:1.7}}>Export your bank statement from net banking/app as CSV. We auto-detect the format — SBI, HDFC, ICICI, Axis, Kotak, Paytm, PhonePe all work.</div>
            <div style={{padding:"20px",border:`2px dashed ${C.border}`,borderRadius:12,textAlign:"center",marginBottom:12,cursor:"pointer",background:C.surface}} onClick={()=>fileRef.current?.click()}>
              <div style={{fontSize:28,marginBottom:6}}>📄</div>
              <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:13}}>Tap to select CSV</div>
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

      {/* CC EMI Form — standalone */}
      {showCCEmiForm&&(
        <div className="modal" onClick={e=>e.target===e.currentTarget&&(setShowCCEmiForm(false),setCcEmiForm({...EMPTY_CC_EMI}))}>
          <div className="sheet">
            <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:17,marginBottom:14}}>
              {ccEmiForm.id?"Edit":"Add"} CC EMI
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <div>
                <div className="lbl">Select Credit Card *</div>
                <select className="inp" value={ccEmiForm.cardId} onChange={e=>setCcEmiForm(p=>({...p,cardId:e.target.value}))}>
                  <option value="">-- Select Card --</option>
                  {creditCards.map(c=><option key={c.id} value={String(c.id)}>{c.name} · {c.bank}</option>)}
                </select>
                {creditCards.length===0&&<div style={{fontSize:11,color:C.expense,marginTop:4}}>⚠️ Add a credit card first.</div>}
              </div>
              <div>
                <div className="lbl">What did you buy?</div>
                <input className="inp" placeholder="e.g. iPhone 15, Samsung TV" value={ccEmiForm.description}
                  onChange={e=>setCcEmiForm(p=>({...p,description:e.target.value}))}/>
              </div>
              <div className="g2">
                <div>
                  <div className="lbl">EMI ₹/month</div>
                  <input className="inp" type="number" placeholder="e.g. 3000" value={ccEmiForm.amount}
                    onChange={e=>setCcEmiForm(p=>({...p,amount:e.target.value}))}/>
                </div>
                <div>
                  <div className="lbl">Months Remaining</div>
                  <input className="inp" type="number" placeholder="e.g. 12" value={ccEmiForm.monthsLeft}
                    onChange={e=>setCcEmiForm(p=>({...p,monthsLeft:e.target.value,_totalMonths:p._totalMonths||e.target.value}))}/>
                </div>
              </div>
              {ccEmiForm.amount&&ccEmiForm.monthsLeft&&(
                <div style={{padding:"10px 14px",background:`${C.warning}12`,border:`1px solid ${C.warning}25`,borderRadius:10}}>
                  <div style={{fontSize:11,color:C.muted,marginBottom:2}}>Total remaining</div>
                  <div style={{fontSize:16,fontWeight:700,color:C.warning,fontFamily:"'Cabinet Grotesk',sans-serif"}}>
                    {fc((parseFloat(ccEmiForm.amount)||0)*(parseFloat(ccEmiForm.monthsLeft)||0))}
                  </div>
                </div>
              )}
              <div style={{display:"flex",gap:9,marginTop:4}}>
                <button className="btn" onClick={()=>{setShowCCEmiForm(false);setCcEmiForm({...EMPTY_CC_EMI});}} style={{flex:1,background:C.border,color:C.muted}}>Cancel</button>
                <button className="btn btn-p" onClick={saveCCEmi} style={{flex:2}}>{ccEmiForm.id?"Save Changes":"Add EMI"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings */}
      {showSettings&&<SettingsModal C={C} salary={salary} setSalary={setSalary} banks={banks} 
    setBanks={setBanks} onClose={() => setShowSettings(false)} />}

      {/* ── Category Manager Modal ── */}
      {showCatManager&&(
        <div className="modal" onClick={e=>e.target===e.currentTarget&&setShowCatManager(false)}>
          <div className="sheet">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
              <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:18}}>🏷️ Manage Categories</div>
              <button className="btn-ghost btn-sm" onClick={()=>setShowCatManager(false)}>✕</button>
            </div>
            {/* Add new */}
            <div style={{padding:"14px",background:C.surface,borderRadius:14,marginBottom:16}}>
              <div className="lbl" style={{marginBottom:8}}>ADD NEW CATEGORY</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <select className="inp" style={{flex:"0 0 110px"}} value={newCatType} onChange={e=>setNewCatType(e.target.value)}>
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
                <input className="inp" style={{flex:1,minWidth:120}} placeholder="Category name" value={newCatName} onChange={e=>setNewCatName(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&addCustomCategory()}/>
                <button className="btn btn-p" onClick={addCustomCategory}>Add</button>
              </div>
            </div>
            {/* Custom cats list */}
            {["expense","income"].map(type=>(
              <div key={type} style={{marginBottom:16}}>
                <div className="lbl" style={{marginBottom:8}}>{type.toUpperCase()} — CUSTOM ONLY</div>
                {(customCats[type]||[]).length===0
                  ? <div style={{fontSize:11,color:C.muted,padding:"8px 0"}}>No custom {type} categories yet.</div>
                  : <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                      {(customCats[type]||[]).map(c=>(
                        <div key={c} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 12px",borderRadius:99,background:`${type==="income"?C.income:C.accent}15`,border:`1px solid ${type==="income"?C.income:C.accent}40`,fontSize:12,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700}}>
                          {c}
                          <span onClick={()=>deleteCustomCategory(type,c)} style={{cursor:"pointer",color:C.muted,fontSize:11,lineHeight:1}}>✕</span>
                        </div>
                      ))}
                    </div>
                }
              </div>
            ))}
            <div style={{borderTop:`1px solid ${C.border}`,paddingTop:12,marginTop:4}}>
              <div className="lbl" style={{marginBottom:6}}>DEFAULT CATEGORIES (cannot be deleted)</div>
              <div style={{fontSize:11,color:C.muted,lineHeight:1.8}}>
                {CATEGORIES.expense.join(" · ")}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Recurring Bill Form Modal ── */}
      {showRecurringForm&&(
        <div className="modal" onClick={e=>e.target===e.currentTarget&&setShowRecurringForm(false)}>
          <div className="sheet">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
              <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:18}}>{editRecurringId?"Edit Recurring Bill":"Add Recurring Bill"}</div>
              <button className="btn-ghost btn-sm" onClick={()=>setShowRecurringForm(false)}>✕</button>
            </div>
            {/* Quick-pick suggestions */}
            {!editRecurringId&&(
              <div style={{marginBottom:14}}>
                <div className="lbl" style={{marginBottom:8}}>QUICK ADD</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {RECURRING_SUGGESTIONS.map(s=>(
                    <button key={s} className="btn-ghost btn-sm" style={{fontSize:11}}
                      onClick={()=>setRecurringForm(p=>({...p,name:s}))}>
                      {RECURRING_ICONS[s]||"📌"} {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <div><div className="lbl">Bill Name</div>
                <input className="inp" placeholder="e.g. Netflix, Electricity" value={recurringForm.name} onChange={e=>setRecurringForm(p=>({...p,name:e.target.value}))}/>
              </div>
              <div className="g2">
                <div><div className="lbl">Amount ₹</div>
                  <input className="inp" type="number" placeholder="e.g. 499" value={recurringForm.amount} onChange={e=>setRecurringForm(p=>({...p,amount:e.target.value}))}/>
                </div>
                <div><div className="lbl">Due Day</div>
                  <input className="inp" type="number" min="1" max="31" placeholder="e.g. 5" value={recurringForm.dueDay} onChange={e=>setRecurringForm(p=>({...p,dueDay:e.target.value}))}/>
                </div>
              </div>
              <div className="g2">
                <div><div className="lbl">Type</div>
                  <select className="inp" value={recurringForm.type} onChange={e=>setRecurringForm(p=>({...p,type:e.target.value}))}>
                    <option value="expense">Expense</option>
                    <option value="income">Income</option>
                  </select>
                </div>
                <div><div className="lbl">Category</div>
                  <select className="inp" value={recurringForm.category} onChange={e=>setRecurringForm(p=>({...p,category:e.target.value}))}>
                    {allCategories[recurringForm.type].map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div><div className="lbl">Notes (optional)</div>
                <input className="inp" placeholder="e.g. Family plan, auto-pay" value={recurringForm.notes} onChange={e=>setRecurringForm(p=>({...p,notes:e.target.value}))}/>
              </div>
              <div style={{display:"flex",gap:10,marginTop:4}}>
                <button className="btn btn-p" style={{flex:1}} onClick={saveRecurring}>
                  {editRecurringId?"Update Bill":"Add Bill"}
                </button>
                <button className="btn-ghost" style={{flex:1}} onClick={()=>setShowRecurringForm(false)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Account Form Modal ── */}
      {showAccountForm&&(
        <div className="modal" onClick={e=>e.target===e.currentTarget&&setShowAccountForm(false)}>
          <div className="sheet">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
              <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:18}}>{editAccountId?"Edit Account":"Add Account"}</div>
              <button className="btn-ghost btn-sm" onClick={()=>setShowAccountForm(false)}>✕</button>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <div><div className="lbl">Account Name</div>
                <input className="inp" placeholder="e.g. SBI Savings" value={accountForm.name} onChange={e=>setAccountForm(p=>({...p,name:e.target.value}))}/>
              </div>
              <div className="g2">
                <div><div className="lbl">Account Type</div>
                  <select className="inp" value={accountForm.type} onChange={e=>setAccountForm(p=>({...p,type:e.target.value}))}>
                    {ACCOUNT_TYPES.map(t=><option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
                  </select>
                </div>
                <div><div className="lbl">Bank / Provider</div>
                  <input className="inp" placeholder="e.g. SBI" value={accountForm.bank} onChange={e=>setAccountForm(p=>({...p,bank:e.target.value}))}/>
                </div>
              </div>
              <div><div className="lbl">Current Balance ₹</div>
                <input className="inp" type="number" placeholder="e.g. 15000" value={accountForm.balance} onChange={e=>setAccountForm(p=>({...p,balance:e.target.value}))}/>
              </div>
              <div className="g2">
                <div><div className="lbl">Icon</div>
                  <select className="inp" value={accountForm.icon} onChange={e=>setAccountForm(p=>({...p,icon:e.target.value}))}>
                    {ACCOUNT_ICONS.map(ic=><option key={ic} value={ic}>{ic}</option>)}
                  </select>
                </div>
                <div><div className="lbl">Color</div>
                  <input type="color" value={accountForm.color} onChange={e=>setAccountForm(p=>({...p,color:e.target.value}))}
                    style={{width:"100%",height:42,borderRadius:12,border:`1px solid ${C.border}`,background:C.inputBg,cursor:"pointer",padding:4}}/>
                </div>
              </div>
              <div style={{display:"flex",gap:10,marginTop:4}}>
                <button className="btn btn-p" style={{flex:1}} onClick={saveAccount}>
                  {editAccountId?"Update Account":"Add Account"}
                </button>
                <button className="btn-ghost" style={{flex:1}} onClick={()=>setShowAccountForm(false)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SETTINGS MODAL ──────────────────────────────────────────────────────────
function SettingsModal({ C, salary, setSalary, banks, setBanks, onClose }) {
  const [newBank, setNewBank] = useState("");

  return(
    <div className="modal" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="sheet">
        <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:17,marginBottom:18}}>⚙️ Settings</div>

        {/* Auto Salary */}
        <div style={{marginBottom:20}}>
          <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:13,marginBottom:10,color:C.accent}}>💰 Auto Monthly Salary</div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:12,color:C.muted}}>Auto-add salary every month</div>
            <button onClick={()=>setSalary(p=>({...p,active:!p.active}))} style={{padding:"5px 14px",borderRadius:20,border:`1px solid ${salary.active?C.income:C.border}`,background:salary.active?`${C.income}15`:"transparent",color:salary.active?C.income:C.muted,cursor:"pointer",fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:11}}>
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
          <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:13,marginBottom:10,color:C.accent}}>🏦 My Banks</div>
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
