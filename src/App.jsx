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
  bg:"#0d0d14", card:"#13131f", border:"#1e1e30", text:"#eef0f8",
  muted:"#5a5f7a", accent:"#7b4fd4", warning:"#ffb547", loan:"#a78bfa",
  credit:"#ff7a45", surface:"#18182a", inputBg:"#0e0e1c",
  glass:"rgba(13,13,20,0.88)", glow:"rgba(123,79,212,0.18)",
  purple:"#7b4fd4", purpleLight:"#9b6af7", purpleDim:"rgba(123,79,212,0.12)"
};
const LIGHT = {
  income:"#00a870", expense:"#e8294a", savings:"#5b4fd4",
  bg:"#f2f2f8", card:"#ffffff", border:"#e4e4f0", text:"#0d0f1e",
  muted:"#8890b0", accent:"#7b4fd4", warning:"#e89a00", loan:"#7c5fd4",
  credit:"#e85a20", surface:"#f8f8ff", inputBg:"#f0f0fa",
  glass:"rgba(255,255,255,0.92)", glow:"rgba(123,79,212,0.08)",
  purple:"#7b4fd4", purpleLight:"#9b6af7", purpleDim:"rgba(123,79,212,0.10)"
};

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const PAYMENT_MODES = ["UPI","Credit Card","Debit Card","Cash","Net Banking","Wallet","EMI","Other"];
const CATEGORIES = {
  income:  ["Salary","Freelance","Side Income","Investment","Gift","Rental","Bonus","Other Income"],
  expense: ["Housing","Food","Transport","Entertainment","Health","Shopping","Utilities","Education","Loan EMI","Credit Card EMI","Credit Card Bill","Insurance","Travel","Medical","Groceries","Family","Other"],
};
const CAT_COLORS = ["#38bdf8","#10b981","#f59e0b","#6366f1","#f43f5e","#a78bfa","#34d399","#fb923c","#e879f9","#22d3ee","#84cc16","#f472b6","#60a5fa","#fbbf24","#6ee7b7","#c084fc"];
const MOBILE_TABS = [
  {id:"Dashboard",    icon:"🏠", label:"Home"},
  {id:"Transactions", icon:"💸", label:"Money"},
  {id:"Plan",         icon:"📊", label:"Plan"},
  {id:"More",         icon:"⋯",  label:"More"},
];
const ALL_TABS = ["Dashboard","Transactions","Insights","Plan","Cards","Budget","Smart","Circles","More"];
const CIRCLE_PURPOSES = ["Bill Payment","Rent","Medical","Groceries","EMI","Utility Bill","Travel","Emergency","Other"];
const todayStr = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const EMPTY_CIRCLE = {id:null, person:"", amount:"", purpose:"", borrowedDate:todayStr(), returnDate:"", type:"borrowed", status:"pending", notes:""};
const EMPTY_TX = {type:"expense",amount:"",category:"Food",paymentMode:"UPI",bank:"",note:"",date:todayStr(),time:new Date().toTimeString().slice(0,5),_accountId:"",_toAccountId:""};
const EMPTY_DEBT = {name:"",lender:"",outstanding:"",totalAmount:"",emi:"",interestRate:"",dueDate:"",emiStartDate:"",tenure:"",notes:""};
const EMPTY_CC   = {name:"",bank:"",limit:"",outstanding:"",minDue:"",statementDate:"",dueDate:"",interestRate:"36",notes:""};
const EMPTY_CC_EMI = {id:null,cardId:"",description:"",amount:"",monthsLeft:"",_totalMonths:""};
const EMPTY_SAL  = {amount:"",bank:"",creditDay:"1",active:true};
const EMPTY_ACCOUNT = {id:null, name:"", type:"savings", balance:"", bank:"", color:"#5b8def", icon:"🏦"};
const EMPTY_INVESTMENT = {id:null,name:"",type:"MF",amount:"",units:"",nav:"",startDate:"",notes:"",
  isSIP:false,sipAmount:"",sipDay:"",sipStartDate:"",sipAccountId:"",sipActive:true,lastSIPDate:""};
const ACCOUNT_TYPES = ["savings","current","cash","wallet","fd","other"];
const ACCOUNT_ICONS = ["🏦","💰","💵","📱","🏧","💼"];

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const fc = n => new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(n||0);
const fd = d => { try { return new Date(d).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}); } catch { return "—"; }};
const today = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
// parseLocal: always parse "YYYY-MM-DD" as LOCAL date, never UTC — avoids IST timezone shift causing wrong month
const parseLocal = ds => { if(!ds) return null; const p=String(ds).split("-").map(Number); return new Date(p[0], p[1]-1, p[2]); };
function daysUntil(ds){ if(!ds)return null; const d=parseLocal(ds), t=new Date(); t.setHours(0,0,0,0); d.setHours(0,0,0,0); return Math.ceil((d-t)/864e5); }
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
  const [dashPeriod, setDashPeriod] = useState("month");
  const [showPeriodPicker, setShowPeriodPicker] = useState(false);
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  const [fbStatus, setFbStatus] = useState("loading");
  const C = darkMode ? DARK : LIGHT;

  // ── Data ──
  const [transactions, setTransactions] = useState([]);
  const [debts, setDebts]               = useState([]);
  const [creditCards, setCreditCards]   = useState([]);
  const [ccEmis, setCcEmis]             = useState([]);
  const [showCCEmiForm, setShowCCEmiForm] = useState(false);
  const [ccEmiForm, setCcEmiForm]       = useState({...EMPTY_CC_EMI});
  // ── Investments ──
  const [investments, setInvestments]   = useState([]);
  const [showInvForm, setShowInvForm]   = useState(false);
  const [invForm, setInvForm]           = useState({...EMPTY_INVESTMENT});
  const [editInvId, setEditInvId]       = useState(null);
  // ── CIBIL ──
  const [cibilScore, setCibilScore]     = useState("");
  const [savings, setSavings]           = useState([]);
  const [budgets, setBudgets]           = useState({});
  const [banks, setBanks]               = useState(["SBI","HDFC","ICICI","Axis","Kotak"]);
  const [salary, setSalary]             = useState({...EMPTY_SAL});
  // ── Recurring Bills ──
  const [recurringBills, setRecurringBills] = useState([]);
  const [showRecurringForm, setShowRecurringForm] = useState(false);
  const [recurringForm, setRecurringForm] = useState({id:null,name:"",amount:"",dueDay:"1",category:"Utilities",active:true,notes:""});
  const [accounts, setAccounts]         = useState([]);
  const [loaded, setLoaded]             = useState(false);
  const [saving, setSaving]             = useState(false);
  const [lastSaved, setLastSaved]       = useState(null);

  // ── Plan ──
  const [monthlyIncome, setMonthlyIncome] = useState("");
  const [familyCap, setFamilyCap]         = useState(""); // monthly family contribution limit
  const [extraFund, setExtraFund]         = useState("");
  const [strategy, setStrategy]           = useState("avalanche");
  const [emergencyFund, setEmergencyFund] = useState("");

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
  const [notifPermission, setNotifPermission] = useState("default");

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
        if (user) { try { const data=await loadData(user.uid); if(data){
          if(data.transactions)  setTransactions(data.transactions);
          if(data.creditCards)   setCreditCards(data.creditCards);
          if(data.debts)         setDebts(data.debts);
          if(data.savings)       setSavings(data.savings);
          if(data.budgets)       setBudgets(data.budgets);
          if(data.banks)         setBanks(data.banks);
          if(data.salary)        setSalary(data.salary);
          if(data.monthlyIncome) setMonthlyIncome(data.monthlyIncome);
          if(data.extraFund)     setExtraFund(data.extraFund);
          if(data.familyCap)     setFamilyCap(data.familyCap);
          if(data.strategy)      setStrategy(data.strategy);
          if(data.emergencyFund) setEmergencyFund(data.emergencyFund);
          if(data.accounts)      setAccounts(data.accounts);
          if(data.customCats)    setCustomCats(data.customCats);
        }} catch(e){} }
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
  const [importMsg, setImportMsg] = useState("");
  const [importPreview, setImportPreview] = useState([]);
  const fileRef = useRef();
  // NEW form states
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [accountForm, setAccountForm] = useState({...EMPTY_ACCOUNT});
  const [editAccountId, setEditAccountId] = useState(null);

  // ── Money Circles ──
  const [moneyCircles, setMoneyCircles] = useState([]);
  const [showCircleForm, setShowCircleForm] = useState(false);
  const [circleForm, setCircleForm] = useState({...EMPTY_CIRCLE});
  const [editCircleId, setEditCircleId] = useState(null);
  // ── Expense Calendar ──
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calSelectedDay, setCalSelectedDay] = useState(null);
  const [showSmartBudget, setShowSmartBudget] = useState(true);
  const [showMoreDashboard, setShowMoreDashboard] = useState(false);
  const [planExpanded, setPlanExpanded]           = useState({debt:true, interest:false, savings:false, investments:false, cibil:false, timeline:true, sideincome:false});
  // ── PWA ──
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [pageKey, setPageKey] = useState(0);
  const [customCats, setCustomCats] = useState({income:[], expense:[]});
  const [showCatManager, setShowCatManager] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatType, setNewCatType] = useState("expense");

  // ── Export ──
  const [exportDateFrom, setExportDateFrom] = useState("");
  const [exportDateTo, setExportDateTo]     = useState("");

  const [txSearch, setTxSearch]       = useState("");
  const [txType, setTxType]           = useState("all");
  const [txMode, setTxMode]           = useState("all");
  const [txBank, setTxBank]           = useState("all");
  const [txCategory, setTxCategory]   = useState("all");
  const [txDateFrom, setTxDateFrom]   = useState("");
  const [txDateTo, setTxDateTo]       = useState("");


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
          if (data.transactions)  setTransactions(data.transactions.map(t=>({...t, amount: parseFloat(t.amount)||0})));
          if (data.debts)         setDebts(data.debts);
          if (data.creditCards)   setCreditCards(data.creditCards);
          if (data.savings)       setSavings(data.savings.map(g=>({...g, current: parseFloat(g.current)||0, goal: parseFloat(g.goal)||0})));
          if (data.budgets)       setBudgets(data.budgets);
          if (data.banks)         setBanks(data.banks);
          if (data.salary)        setSalary(data.salary);
          if (data.monthlyIncome) setMonthlyIncome(data.monthlyIncome);
          if (data.extraFund)     setExtraFund(data.extraFund);
          if (data.familyCap)     setFamilyCap(data.familyCap);
          if (data.strategy)      setStrategy(data.strategy);
          if (data.emergencyFund) setEmergencyFund(data.emergencyFund);
          if (data.darkMode!==undefined) setDarkMode(data.darkMode);
          if (data.accounts)      setAccounts(data.accounts.map(a=>({...a, balance: parseFloat(a.balance)||0})));
          if (data.customCats)    setCustomCats(data.customCats);
          if (data.moneyCircles)  setMoneyCircles(data.moneyCircles);
          if (data.recurringBills) setRecurringBills(data.recurringBills);
          if (data.ccEmis)        setCcEmis(data.ccEmis);
          if (data.investments)   setInvestments(data.investments);
          if (data.cibilScore)    setCibilScore(data.cibilScore);
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
        transactions, debts, creditCards, ccEmis, savings, budgets, banks,
        monthlyIncome, extraFund, strategy, emergencyFund, darkMode,
        accounts, customCats, moneyCircles, salary, recurringBills,
        ccEmis, investments, cibilScore, familyCap,
        lastUpdated: new Date().toISOString(),
      });
      setSaving(false);
      if (ok) setLastSaved(new Date());
      else setFbStatus("error");
    }, 1200);
  }, [transactions, debts, creditCards, ccEmis, savings, budgets, banks,
      monthlyIncome, extraFund, strategy, emergencyFund, darkMode,
      accounts, customCats, moneyCircles, salary, recurringBills,
      ccEmis, investments, cibilScore, familyCap, loaded]);




  // ─── COMPUTED ────────────────────────────────────────────────────────────
  const totalIncome    = useMemo(() => transactions.filter(t=>t.type==="income").reduce((s,t)=>s+(parseFloat(t.amount)||0),0), [transactions]);
  const totalExpense   = useMemo(() => transactions.filter(t=>t.type==="expense").reduce((s,t)=>s+(parseFloat(t.amount)||0),0), [transactions]);
  const activeDebts    = useMemo(() => debts.filter(d=>!d.closed), [debts]);
  const totalEMI       = useMemo(() => activeDebts.reduce((s,d)=>s+(parseFloat(d.emi)||0),0), [activeDebts]);
  const totalOutstanding = useMemo(() => activeDebts.reduce((s,d)=>s+(parseFloat(d.outstanding)||0),0), [activeDebts]);
  const totalCCOut     = useMemo(() => creditCards.reduce((s,c)=>s+(parseFloat(c.outstanding)||0),0), [creditCards]);
  const totalCCEMI     = useMemo(() => (ccEmis||[]).reduce((s,e)=>s+(parseFloat(e.amount)||0),0), [ccEmis]);
  const effectiveIncome = parseFloat(monthlyIncome) || totalIncome || 0;
  const savingsTotal   = useMemo(() => savings.reduce((s,g)=>s+g.current,0), [savings]);
  const emergencyMonths = useMemo(() => {
    const ef = parseFloat(emergencyFund)||savingsTotal;
    return ef / Math.max(totalExpense||effectiveIncome*0.7, 1);
  }, [emergencyFund, savingsTotal, totalExpense, effectiveIncome]);
  const cashLeft = effectiveIncome - totalEMI - totalCCEMI - totalExpense;

  const recommended   = useMemo(() => recommendStrategy(activeDebts, cashLeft), [activeDebts, cashLeft]);
  const payoffPlan    = useMemo(() => calcPayoffPlan(activeDebts, parseFloat(extraFund)||0, strategy), [activeDebts, extraFund, strategy]);
  const health        = useMemo(() => calcHealthScore({income:effectiveIncome, emi:totalEMI, expense:totalExpense, outstanding:totalOutstanding+totalCCOut, savings:savingsTotal, emergency:emergencyMonths}), [effectiveIncome,totalEMI,totalExpense,totalOutstanding,totalCCOut,savingsTotal,emergencyMonths]);


const filterByPeriod = useCallback((txList, period) => {
  const now = new Date(); now.setHours(23,59,59,999);
  return txList.filter(t=>{
    const d = parseLocal(t.date);
    if (!d) return false;
    const n = new Date();
    if(period==="today"){ const s=new Date();s.setHours(0,0,0,0);return d>=s&&d<=now; }
    if(period==="week"){ const s=new Date();s.setDate(s.getDate()-7);s.setHours(0,0,0,0);return d>=s&&d<=now; }
    if(period==="month"){ return d.getMonth()===n.getMonth()&&d.getFullYear()===n.getFullYear(); }
    if(period==="lastmonth"){ const lm=new Date(n.getFullYear(),n.getMonth()-1,1);return d.getMonth()===lm.getMonth()&&d.getFullYear()===lm.getFullYear(); }
    if(period==="3months"){ const s=new Date();s.setMonth(s.getMonth()-3);s.setHours(0,0,0,0);return d>=s&&d<=now; }
    if(period==="year"){ return d.getFullYear()===n.getFullYear(); }
    if(period==="custom"){ 
      const from=customDateFrom?parseLocal(customDateFrom):null;
      const to=customDateTo?parseLocal(customDateTo):null;
      if(to) to.setHours(23,59,59,999);
      if(from&&to) return d>=from&&d<=to;
      if(from) return d>=from;
      if(to) return d<=to;
    }
    return true;
  });
},[customDateFrom, customDateTo]);

    
  const upcomingDues  = useMemo(() => [
    ...activeDebts.filter(d=>d.dueDate).map(d=>({...d,days:daysUntil(d.dueDate),kind:"loan"})),
    ...creditCards.filter(c=>c.dueDate).map(c=>({...c,days:daysUntil(c.dueDate),kind:"cc"})),
  ].sort((a,b)=>a.days-b.days), [activeDebts, creditCards]);

  // Track which loans/CCs were paid this month (by name match in transactions)
  const paidThisMonth = useMemo(() => {
    const n = new Date();
    const mo = n.getMonth(), yr = n.getFullYear();
    const loanPaid = new Set();
    const ccPaid = new Set();
    transactions.forEach(t => {
      const d = parseLocal(t.date);
      if (!d || d.getMonth()!==mo || d.getFullYear()!==yr) return;
      if (t.category==="Loan EMI") {
        activeDebts.forEach(debt => {
          // Match by note containing loan name, OR by _emiKey containing debt id
          if ((t.note||"").includes(debt.name) || (t._emiKey||"").includes(String(debt.id))) {
            loanPaid.add(debt.id);
          }
        });
      }
      if (t.category==="Credit Card Bill") {
        creditCards.forEach(cc => {
          // Match by note "CC: CardName" (set by recordCCPayment) OR note includes cc.name
          const noteMatch = (t.note||"").includes(cc.name);
          const recordMatch = (t.note||"") === `CC: ${cc.name}`;
          if (noteMatch || recordMatch) {
            ccPaid.add(cc.id);
          }
        });
      }
    });
    return { loanPaid, ccPaid };
  }, [transactions, activeDebts, creditCards]);

  const overdueCount = upcomingDues.filter(d => {
    if (d.days >= 0) return false;
    if (d.kind==="loan" && paidThisMonth.loanPaid.has(d.id)) return false;
    if (d.kind==="cc"   && paidThisMonth.ccPaid.has(d.id))   return false;
    return true;
  }).length;

  const expenseByMode = useMemo(() => PAYMENT_MODES.map(m=>({
    name:m, value:transactions.filter(t=>t.type==="expense"&&t.paymentMode===m).reduce((s,t)=>s+(parseFloat(t.amount)||0),0)
  })).filter(d=>d.value>0), [transactions]);

  // ─── MERGED CATEGORIES (default + custom) — must be before expenseByCat ──
  const allCategories = useMemo(() => ({
    income:  [...CATEGORIES.income,  ...(customCats.income ||[])],
    expense: [...CATEGORIES.expense, ...(customCats.expense||[])],
  }), [customCats]);

  const expenseByCat = useMemo(() => allCategories.expense.map((cat,i)=>({
    name:cat, value:transactions.filter(t=>t.type==="expense"&&t.category===cat).reduce((s,t)=>s+(parseFloat(t.amount)||0),0), color:CAT_COLORS[i]
  })).filter(d=>d.value>0), [transactions, allCategories]);

  const last6Months = useMemo(() => Array.from({length:6},(_,i)=>{
    const d=new Date(); d.setMonth(d.getMonth()-(5-i));
    const mo=d.getMonth(), yr=d.getFullYear(), lbl=d.toLocaleDateString("en-IN",{month:"short"});
    const pLocal = ds => { if(!ds) return null; const [y,m,dd]=String(ds).split("-").map(Number); return new Date(y,m-1,dd); };
    const inc=transactions.filter(t=>{const td=pLocal(t.date);return td&&t.type==="income"&&td.getMonth()===mo&&td.getFullYear()===yr;}).reduce((s,t)=>s+(parseFloat(t.amount)||0),0);
    const exp=transactions.filter(t=>{const td=pLocal(t.date);return td&&t.type==="expense"&&td.getMonth()===mo&&td.getFullYear()===yr;}).reduce((s,t)=>s+(parseFloat(t.amount)||0),0);
    return {label:lbl,income:inc,expense:exp};
  }), [transactions]);

  const filteredTx = useMemo(() => transactions
  .filter(t=>{
    if (txType!=="all"&&t.type!==txType) return false;
    if (txMode!=="all"&&t.paymentMode!==txMode) return false;
    if (txBank!=="all"&&t.bank!==txBank) return false;
    if (txCategory!=="all"&&t.category!==txCategory) return false;
    if (txDateFrom) { const d=parseLocal(t.date); const from=parseLocal(txDateFrom); if (!d||d<from) return false; }
    if (txDateTo)   { const d=parseLocal(t.date); const to=parseLocal(txDateTo); if (!d||d>to) return false; }
    if (txSearch) { const q=txSearch.toLowerCase(); if (!t.category?.toLowerCase().includes(q)&&!(t.note||"").toLowerCase().includes(q)&&!String(t.amount).includes(q)) return false; }
    return true;
  })
  .sort((a,b)=>{
    const da = new Date(`${a.date}T${a.time||"00:00"}`);
    const db = new Date(`${b.date}T${b.time||"00:00"}`);
    return db - da;
  })
, [transactions,txType,txMode,txBank,txCategory,txDateFrom,txDateTo,txSearch]);

  // ─── NEW FEATURE COMPUTEDS ────────────────────────────────────────────────
  const thisMonthTx = useMemo(()=>{
    const n=new Date();
    const mo=n.getMonth(), yr=n.getFullYear();
    return transactions.filter(t=>{const d=parseLocal(t.date);return d&&d.getMonth()===mo&&d.getFullYear()===yr;});
  },[transactions]);
  const lastMonthTx = useMemo(()=>{
    const n=new Date();
    // Compute last month safely: if Jan (0) → Dec (11) of previous year
    const lastMo = n.getMonth()===0 ? 11 : n.getMonth()-1;
    const lastYr = n.getMonth()===0 ? n.getFullYear()-1 : n.getFullYear();
    return transactions.filter(t=>{const d=parseLocal(t.date);return d&&d.getMonth()===lastMo&&d.getFullYear()===lastYr;});
  },[transactions]);
  const thisMonthExp = useMemo(()=>thisMonthTx.filter(t=>t.type==="expense").reduce((s,t)=>s+(parseFloat(t.amount)||0),0),[thisMonthTx]);
  const lastMonthExp = useMemo(()=>lastMonthTx.filter(t=>t.type==="expense").reduce((s,t)=>s+(parseFloat(t.amount)||0),0),[lastMonthTx]);
  const thisMonthInc = useMemo(()=>thisMonthTx.filter(t=>t.type==="income").reduce((s,t)=>s+(parseFloat(t.amount)||0),0),[thisMonthTx]);
  const lastMonthInc = useMemo(()=>lastMonthTx.filter(t=>t.type==="income").reduce((s,t)=>s+(parseFloat(t.amount)||0),0),[lastMonthTx]);
  const catComparison = useMemo(()=>allCategories.expense.map(cat=>({cat,thisMonth:thisMonthTx.filter(t=>t.type==="expense"&&t.category===cat).reduce((s,t)=>s+(parseFloat(t.amount)||0),0),lastMonth:lastMonthTx.filter(t=>t.type==="expense"&&t.category===cat).reduce((s,t)=>s+(parseFloat(t.amount)||0),0)})).filter(c=>c.thisMonth>0||c.lastMonth>0),[thisMonthTx,lastMonthTx,allCategories]);
  const savingsRateTrend = useMemo(()=>last6Months.map(m=>({label:m.label,rate:m.income>0?Math.max(0,((m.income-m.expense)/m.income)*100):0})),[last6Months]);
  const debtFreeMonths = useMemo(()=>{const owe=totalOutstanding+totalCCOut;const pmt=totalEMI+(parseFloat(extraFund)||0);if(owe===0)return 0;if(!pmt)return null;return Math.ceil(owe/pmt);},[totalOutstanding,totalCCOut,totalEMI,extraFund]);
  const cashFlowForecast = useMemo(()=>{const now=new Date();const salDay=parseInt(salary.creditDay)||1;const salAmt=parseFloat(salary.amount)||effectiveIncome||0;const dailyExp=Math.max(thisMonthExp,totalExpense,1)/30;let running=Math.max(cashLeft,0);return Array.from({length:30},(_,i)=>{const d=new Date(now);d.setDate(d.getDate()+i+1);if(d.getDate()===salDay&&salAmt>0)running+=salAmt;[...activeDebts,...creditCards].forEach(item=>{if(item.dueDate&&new Date(item.dueDate).getDate()===d.getDate())running-=parseFloat(item.emi||item.minDue||0);});running-=dailyExp;return{day:i+1,label:d.getDate()+"/"+(d.getMonth()+1),balance:Math.round(running)};});},[cashLeft,salary,effectiveIncome,thisMonthExp,totalExpense,activeDebts,creditCards]);
  const spendAlerts = useMemo(()=>allCategories.expense.map(cat=>({cat,spent:thisMonthTx.filter(t=>t.type==="expense"&&t.category===cat).reduce((s,t)=>s+(parseFloat(t.amount)||0),0),limit:budgets[cat]||0})).filter(a=>a.limit>0&&(a.spent/a.limit)>=0.8).map(a=>({...a,pct:Math.round((a.spent/a.limit)*100),over:a.spent>a.limit})),[thisMonthTx,budgets,allCategories]);

  // ─── ACCOUNT BALANCE ─────────────────────────────────────────────────────
  const totalAccountBalance = useMemo(() =>
    accounts.reduce((s, a) => s + (parseFloat(a.balance) || 0), 0),
  [accounts]);

  // ─── NET WORTH ────────────────────────────────────────────────────────────
  const netWorth = useMemo(()=>totalAccountBalance+savingsTotal-totalOutstanding-totalCCOut,[totalAccountBalance,savingsTotal,totalOutstanding,totalCCOut]);

  // ─── 15-DAY STRESS PANEL ─────────────────────────────────────────────────
  const next15Days = useMemo(() => {
    const now = new Date(); now.setHours(0,0,0,0);
    const end = new Date(now); end.setDate(end.getDate() + 15);
    const dues = [];
    [...activeDebts].forEach(d => {
      if (!d.dueDate || !d.emi) return;
      let due = new Date(d.dueDate);
      due = new Date(now.getFullYear(), now.getMonth(), due.getDate());
      if (due < now) due = new Date(now.getFullYear(), now.getMonth()+1, new Date(d.dueDate).getDate());
      if (due <= end) dues.push({ name: d.name, amt: parseFloat(d.emi)||0, date: due, kind: "loan", color: C.loan });
    });
    creditCards.forEach(c => {
      if (!c.dueDate || !c.outstanding) return;
      const out = parseFloat(c.outstanding)||0;
      if (out === 0) return;
      let due = new Date(c.dueDate);
      due = new Date(now.getFullYear(), now.getMonth(), due.getDate());
      if (due < now) due = new Date(now.getFullYear(), now.getMonth()+1, new Date(c.dueDate).getDate());
      if (due <= end) dues.push({ name: c.name, amt: out, date: due, kind: "cc", color: C.credit });
    });
    dues.sort((a,b)=>a.date-b.date);
    const totalDue = dues.reduce((s,d)=>s+d.amt,0);
    const balance = totalAccountBalance || Math.max(cashLeft, 0);
    const ratio = balance > 0 ? totalDue/balance : 1;
    const status = ratio < 0.5 ? "safe" : ratio < 0.85 ? "tight" : "risk";
    return { dues, totalDue, balance, status, ratio };
  }, [activeDebts, creditCards, cashLeft, totalAccountBalance, C]);

  // ─── INTEREST COST TRACKER ───────────────────────────────────────────────
  const interestCost = useMemo(() => {
    const loanInterest = activeDebts.map(d => {
      const bal  = parseFloat(d.outstanding)||0;
      const rate = parseFloat(d.interestRate)||0;
      const mo   = bal * (rate/100/12);
      return { name:d.name, lender:d.lender, rate, monthly:mo, outstanding:bal };
    });
    const ccInterest = creditCards.map(c => {
      const bal  = parseFloat(c.outstanding)||0;
      const rate = parseFloat(c.interestRate)||36;
      const mo   = bal * (rate/100/12);
      return { name:c.name, bank:c.bank, rate, monthly:mo, outstanding:bal };
    });
    const totalMonthly = [...loanInterest,...ccInterest].reduce((s,x)=>s+x.monthly,0);
    const totalYearly  = totalMonthly * 12;
    // Most expensive item
    const allItems = [...loanInterest,...ccInterest].sort((a,b)=>b.monthly-a.monthly);
    return { loanInterest, ccInterest, allItems, totalMonthly, totalYearly };
  }, [activeDebts, creditCards]);

  // ─── SAVINGS GOAL PROGRESS ───────────────────────────────────────────────
  const savingsGoalProgress = useMemo(() => {
    return savings.map(g => {
      const goal    = parseFloat(g.goal)||0;
      const current = parseFloat(g.current)||0;
      const pct     = goal > 0 ? Math.min(100,(current/goal)*100) : 0;
      const remaining = Math.max(0, goal - current);
      // How many months to reach goal if saving cashLeft * 0.1 each month (rough)
      const monthlySave = Math.max(cashLeft * 0.1, 1000);
      const monthsLeft  = remaining > 0 ? Math.ceil(remaining / monthlySave) : 0;
      return { ...g, goal, current, pct, remaining, monthsLeft, monthlySave };
    });
  }, [savings, cashLeft]);

  // ─── DAILY BUDGET CHECK-IN ────────────────────────────────────────────────
  const dailyBudget = useMemo(() => {
    const now          = new Date();
    const daysInMonth  = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
    const dayOfMonth   = now.getDate();
    const daysLeft     = daysInMonth - dayOfMonth + 1; // include today
    // Monthly budget remaining = (total budgets) - (spent this month outside EMIs)
    const totalBudgeted = Object.values(budgets).reduce((s,v)=>s+(parseFloat(v)||0),0);
    const nonEmiExpense = thisMonthTx
      .filter(t=>t.type==='expense' && t.category!=='Loan EMI' && t.category!=='Credit Card Bill' && t.category!=='Credit Card EMI')
      .reduce((s,t)=>s+(parseFloat(t.amount)||0),0);
    const budgetRemaining = Math.max(0, (totalBudgeted||cashLeft) - nonEmiExpense);
    const safeToSpend     = daysLeft > 0 ? Math.floor(budgetRemaining / daysLeft) : 0;
    // Status
    const status = safeToSpend > 2000 ? 'comfortable' : safeToSpend > 500 ? 'careful' : 'tight';
    return { safeToSpend, budgetRemaining, daysLeft, dayOfMonth, daysInMonth, status, nonEmiExpense, totalBudgeted };
  }, [budgets, thisMonthTx, cashLeft]);

  // ─── RECURRING BILLS STATUS ──────────────────────────────────────────────
  const recurringStatus = useMemo(() => {
    const now = new Date();
    const todayDate = now.getDate();
    const mo = now.getMonth(), yr = now.getFullYear();
    // Check which recurring bills were paid this month
    return recurringBills.map(bill => {
      const dueDay = parseInt(bill.dueDay)||1;
      const daysUntilDue = dueDay >= todayDate ? dueDay - todayDate : (new Date(yr, mo+1, dueDay) - now) / 864e5;
      const paidThisMonth = transactions.some(t => {
        const d = parseLocal(t.date);
        return d && d.getMonth()===mo && d.getFullYear()===yr
          && t.type==='expense'
          && ((t.note||'').toLowerCase().includes(bill.name.toLowerCase()) || (t.category===bill.category && Math.abs((parseFloat(t.amount)||0)-(parseFloat(bill.amount)||0)) < 50));
      });
      const isOverdue = dueDay < todayDate && !paidThisMonth;
      const daysLeft  = Math.ceil(daysUntilDue);
      return { ...bill, dueDay, paidThisMonth, isOverdue, daysLeft };
    });
  }, [recurringBills, transactions]);

  // ─── FINANCIAL CALENDAR ───────────────────────────────────────────────────
  const financialCalendar = useMemo(() => {
    const now = new Date();
    const yr  = now.getFullYear();
    const mo  = now.getMonth();
    const daysInMonth = new Date(yr, mo+1, 0).getDate();
    const events = {}; // day → array of events
    const addEvent = (day, event) => {
      if (day < 1 || day > daysInMonth) return;
      if (!events[day]) events[day] = [];
      events[day].push(event);
    };
    // Salary
    const salDay = parseInt(salary?.creditDay)||0;
    if (salDay) addEvent(salDay, { type:'salary', label:'💰 Salary', amount:parseFloat(salary?.amount)||0, color:'#00e5a0' });
    // Loan EMIs
    activeDebts.forEach(d => {
      if (!d.dueDate) return;
      addEvent(new Date(d.dueDate).getDate(), { type:'emi', label:`🏦 ${d.name}`, amount:parseFloat(d.emi)||0, color:'#a78bfa' });
    });
    // CC bills
    creditCards.forEach(c => {
      if (!c.dueDate) return;
      addEvent(new Date(c.dueDate).getDate(), { type:'cc', label:`💳 ${c.name}`, amount:parseFloat(c.outstanding)||0, color:'#ff7a45' });
    });
    // Recurring bills
    recurringBills.filter(b=>b.active).forEach(b => {
      addEvent(parseInt(b.dueDay)||1, { type:'recurring', label:`⚡ ${b.name}`, amount:parseFloat(b.amount)||0, color:'#38bdf8' });
    });
    // Transactions this month (actual)
    transactions.forEach(t => {
      const d = parseLocal(t.date);
      if (!d || d.getMonth()!==mo || d.getFullYear()!==yr) return;
      if (t.type==='transfer') return;
      // Only add significant txns (> ₹500) to avoid clutter
      if ((parseFloat(t.amount)||0) < 500) return;
      addEvent(d.getDate(), { type:t.type, label:`${t.type==='income'?'↑':'↓'} ${t.category}`, amount:parseFloat(t.amount)||0, color:t.type==='income'?'#00e5a0':'#ff4d6d', actual:true });
    });
    return { events, daysInMonth, firstDow: new Date(yr,mo,1).getDay(), todayDate: now.getDate(), yr, mo };
  }, [salary, activeDebts, creditCards, recurringBills, transactions]);

  // ─── LOAN-TO-INCOME RATIO ────────────────────────────────────────────────
  const loanToIncome = useMemo(() => {
    const inc = effectiveIncome || 0;
    if (!inc) return null;
    const ratio  = (totalEMI + totalCCEMI) / inc * 100;
    const status = ratio>=60?'critical':ratio>=50?'danger':ratio>=40?'warning':'safe';
    const color  = ratio>=60?'#ff4d6d':ratio>=50?'#ff7a45':ratio>=40?'#f59e0b':'#00e5a0';
    const label  = ratio>=60?'Critical — loan overload':ratio>=50?'Danger — too high':ratio>=40?'Warning — above RBI 40% limit':'Safe ✓';
    return { ratio, status, color, label, totalEMI:totalEMI+totalCCEMI, inc };
  }, [effectiveIncome, totalEMI, totalCCEMI]);

  // ─── FAMILY CAP STATUS ───────────────────────────────────────────────────
  const familyCapStatus = useMemo(() => {
    const cap = parseFloat(familyCap)||0;
    const now = new Date();
    const mo=now.getMonth(), yr=now.getFullYear();
    const spent = transactions
      .filter(t=>{const d=parseLocal(t.date);return d&&d.getMonth()===mo&&d.getFullYear()===yr&&t.type==='expense'&&t.category==='Family';})
      .reduce((s,t)=>s+(parseFloat(t.amount)||0),0);
    const pct=cap>0?Math.min(100,(spent/cap)*100):0;
    return {cap,spent,pct,over:cap>0&&spent>cap,remaining:Math.max(0,cap-spent)};
  }, [familyCap, transactions]);

  // ─── SIDE INCOME TRACKER ─────────────────────────────────────────────────
  const sideIncomeStats = useMemo(() => {
    const sideCats = ['Freelance','Side Income','Bonus','Other Income','Gift','Rental'];
    const now = new Date();
    const monthly = Array.from({length:6},(_,i)=>{
      const d=new Date(now.getFullYear(),now.getMonth()-(5-i),1);
      const mo=d.getMonth(),yr=d.getFullYear();
      const lbl=d.toLocaleDateString('en-IN',{month:'short',year:'2-digit'});
      const amt=transactions.filter(t=>{const td=parseLocal(t.date);return td&&td.getMonth()===mo&&td.getFullYear()===yr&&t.type==='income'&&sideCats.includes(t.category);}).reduce((s,t)=>s+(parseFloat(t.amount)||0),0);
      return {label:lbl,amount:amt};
    });
    const total=monthly.reduce((s,m)=>s+m.amount,0);
    return {monthly,total,avg:total/6,thisMonth:monthly[5].amount,best:Math.max(...monthly.map(m=>m.amount))};
  }, [transactions]);

  // ─── DEBT PAYOFF TIMELINE ────────────────────────────────────────────────
  const debtPayoffTimeline = useMemo(() => {
    if (!activeDebts.length) return null;
    const timelines = activeDebts.map(debt=>{
      const bal=parseFloat(debt.outstanding)||0, emi=parseFloat(debt.emi)||0, rate=parseFloat(debt.interestRate)||0;
      if (!bal||!emi) return null;
      const mr=rate/100/12;
      let rem=bal, months=0;
      while(rem>1&&months<360){const int=rem*mr;rem=Math.max(0,rem-(emi-int));months++;}
      const closeDate=new Date();closeDate.setMonth(closeDate.getMonth()+months);
      return {id:debt.id,name:debt.name,lender:debt.lender||'',outstanding:bal,emi,rate,months,closeDate,monthlyInterest:bal*mr};
    }).filter(Boolean).sort((a,b)=>a.months-b.months);

    // Free EMI snowball projection
    let cumFreed=0;
    const projection = timelines.map((t,i)=>{
      cumFreed += t.emi;
      const closeDate=new Date(); closeDate.setMonth(closeDate.getMonth()+t.months);
      return {order:i+1,name:t.name,lender:t.lender,closesInMonths:t.months,closeDate,freedEmi:t.emi,cumulativeFreed:cumFreed,label:closeDate.toLocaleDateString('en-IN',{month:'short',year:'numeric'})};
    });

    const totalInterestLeft = timelines.reduce((s,t)=>{
      const mr=t.rate/100/12; let bal=t.outstanding,ti=0;
      for(let m=0;m<t.months;m++){const int=bal*mr;ti+=int;bal=Math.max(0,bal-(t.emi-int));}
      return s+ti;
    },0);

    return {timelines,projection,totalInterestLeft};
  }, [activeDebts]);

  // ─── SIP STATUS TRACKER ──────────────────────────────────────────────────

  // Helper: calculate total invested for a SIP from its start date to today
  function getSIPTotalInvested(inv) {
    if (!inv.isSIP || !inv.sipAmount || !inv.sipStartDate) {
      return parseFloat(inv.amount) || 0; // fallback to manual amount for non-SIP
    }
    const sipAmt   = parseFloat(inv.sipAmount) || 0;
    const start    = new Date(inv.sipStartDate);
    const now      = new Date();
    const sipDay   = parseInt(inv.sipDay) || 1;

    // Count how many SIP instalments have been deducted up to today
    let count = 0;
    let d = new Date(start.getFullYear(), start.getMonth(), sipDay);
    // If start date is after the sipDay of that month, first SIP is next month
    if (start.getDate() > sipDay) {
      d = new Date(start.getFullYear(), start.getMonth() + 1, sipDay);
    }
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    while (d <= today) {
      count++;
      d = new Date(d.getFullYear(), d.getMonth() + 1, sipDay);
    }
    return count * sipAmt;
  }
  const sipStatus = useMemo(() => {
    const now = new Date();
    const todayDate = now.getDate();
    const mo = now.getMonth(), yr = now.getFullYear();
    const thisMonthPrefix = `${yr}-${String(mo+1).padStart(2,'0')}`;

    return investments
      .filter(inv => inv.isSIP && inv.sipActive && inv.sipAmount && inv.sipDay)
      .map(inv => {
        const sipDay = parseInt(inv.sipDay) || 1;
        const sipAmt = parseFloat(inv.sipAmount) || 0;
        const lastDate = inv.lastSIPDate || '';

        // Already processed this calendar month?
        const alreadyDone = lastDate.startsWith(thisMonthPrefix);

        // Calculate next SIP date
        let nextSIPDate;
        if (!alreadyDone && sipDay >= todayDate) {
          // SIP day is today or future this month
          nextSIPDate = new Date(yr, mo, sipDay);
        } else if (!alreadyDone && sipDay < todayDate) {
          // SIP day already passed this month and not done → overdue (this month)
          nextSIPDate = new Date(yr, mo, sipDay);
        } else {
          // Already done this month → next SIP is next month
          nextSIPDate = new Date(yr, mo + 1, sipDay);
        }

        // Days difference from today
        const todayMidnight = new Date(yr, mo, todayDate);
        const msPerDay = 864e5;
        const daysUntil = Math.round((nextSIPDate - todayMidnight) / msPerDay);

        const isToday   = daysUntil === 0 && !alreadyDone;
        const isOverdue = daysUntil < 0 && !alreadyDone;
        const isDue     = isToday;
        // Show upcoming reminder 5 days before (only if not already done this month)
        const isUpcoming = daysUntil > 0 && daysUntil <= 5 && !alreadyDone;
        // Days shown to user (always positive, meaningful)
        const daysDisplay = Math.abs(daysUntil);

        const account = accounts.find(a => String(a.id) === String(inv.sipAccountId));

        return {
          ...inv, sipDay, sipAmt,
          alreadyDone, isToday, isOverdue, isDue, isUpcoming,
          daysUntil, daysDisplay, nextSIPDate, account,
        };
      })
      .sort((a, b) => {
        if (a.isOverdue && !b.isOverdue) return -1;
        if (!a.isOverdue && b.isOverdue) return 1;
        if (a.isDue && !b.isDue) return -1;
        if (!a.isDue && b.isDue) return 1;
        return a.daysUntil - b.daysUntil;
      });
  }, [investments, accounts]);

  // ─── INVESTMENT TRACKER ──────────────────────────────────────────────────
  const investmentStats = useMemo(() => {
    const totalInvested = investments.reduce((s,inv) => s + getSIPTotalInvested(inv), 0);
    const currentValue  = investments.reduce((s,inv) => {
      const units  = parseFloat(inv.units) || 0;
      const nav    = parseFloat(inv.nav)   || 0;
      const invested = getSIPTotalInvested(inv);
      return s + (units>0 && nav>0 ? units*nav : invested);
    }, 0);
    const gain    = currentValue - totalInvested;
    const gainPct = totalInvested > 0 ? (gain/totalInvested)*100 : 0;
    const byType  = {};
    investments.forEach(inv => {
      const t       = inv.type || 'Other';
      const invested = getSIPTotalInvested(inv);
      const units   = parseFloat(inv.units)||0, nav=parseFloat(inv.nav)||0;
      if (!byType[t]) byType[t] = {count:0,invested:0,current:0};
      byType[t].count++;
      byType[t].invested += invested;
      byType[t].current  += (units>0&&nav>0 ? units*nav : invested);
    });
    return { totalInvested, currentValue, gain, gainPct, byType, count:investments.length };
  }, [investments]);

  // ─── CIBIL SCORE SIMULATOR ───────────────────────────────────────────────
  const cibilAnalysis = useMemo(() => {
    const score = parseInt(cibilScore)||0;
    if (!score) return null;
    const label = score>=800?'Excellent':score>=750?'Very Good':score>=700?'Good':score>=650?'Fair':'Poor';
    const color = score>=800?'#00e5a0':score>=750?'#38bdf8':score>=700?'#f59e0b':score>=650?'#ff7a45':'#ff4d6d';

    // Calculate utilization across all CCs
    const totalLimit   = creditCards.reduce((s,c)=>s+(parseFloat(c.limit)||0),0);
    const totalOutCC   = creditCards.reduce((s,c)=>s+(parseFloat(c.outstanding)||0),0);
    const utilization  = totalLimit>0 ? (totalOutCC/totalLimit)*100 : 0;

    // Overdues this month
    const now=new Date(), mo=now.getMonth(), yr=now.getFullYear();
    const overdueCC = creditCards.filter(c=>{
      if(!c.dueDate) return false;
      const due=new Date(c.dueDate);
      return due<now && !(transactions.some(t=>{
        const d=parseLocal(t.date);
        return d&&d.getMonth()===mo&&d.getFullYear()===yr&&t.category==='Credit Card Bill'&&(t.note||'').includes(c.name);
      }));
    }).length;

    // Build improvement suggestions
    const suggestions = [];

    if(overdueCC>0)
      suggestions.push({action:`Pay ${overdueCC} overdue CC bill${overdueCC>1?'s':''}`,impact:'+15 to +25 pts',urgency:'high',reason:'Late payments are the #1 CIBIL killer'});

    if(utilization>30)
      suggestions.push({action:`Reduce CC utilization to <30% (now ${utilization.toFixed(0)}%)`,impact:'+10 to +20 pts',urgency:'high',reason:'High utilization signals credit stress'});

    if(utilization>75)
      suggestions.push({action:'Pay down CC outstanding urgently (>75% used)',impact:'+20 to +40 pts',urgency:'critical',reason:'Utilization above 75% severely hurts score'});

    if(ccEmis.length>0)
      suggestions.push({action:'Close CC EMIs when complete',impact:'+5 to +10 pts',urgency:'low',reason:'Fewer active credit lines improves score over time'});

    if(activeDebts.length>3)
      suggestions.push({action:'Reduce number of active loans',impact:'+10 to +15 pts',urgency:'medium',reason:'Too many open accounts lowers score'});

    if(score<750)
      suggestions.push({action:'Pay all EMIs on time for 6+ months',impact:'+30 to +50 pts',urgency:'medium',reason:'Payment history is 35% of your CIBIL score'});

    suggestions.push({action:'Check CIBIL report for errors',impact:'+0 to +100 pts',urgency:'low',reason:'Errors on report are common and easy to fix'});

    // Target score projection
    const maxGain   = suggestions.reduce((s,sg)=>{
      const m=sg.impact.match(/\+(\d+)/g);
      return s+(m?parseInt(m[m.length-1].replace('+','')):0);
    },0);
    const projected = Math.min(900, score+maxGain);
    const monthsTo750 = score<750 ? Math.ceil((750-score)/8) : 0;

    return { score, label, color, utilization, overdueCC, suggestions, projected, monthsTo750 };
  }, [cibilScore, creditCards, ccEmis, activeDebts, transactions]);

  // ─── DEBT PROGRESS TRACKER ───────────────────────────────────────────────
  const debtProgress = useMemo(() => {
    const now = new Date();
    const mo  = now.getMonth();
    const yr  = now.getFullYear();

    // Payments made this month from transactions
    const thisMonthPayments = transactions.filter(t => {
      const d = parseLocal(t.date);
      return d && d.getMonth()===mo && d.getFullYear()===yr &&
        (t.category==='Loan EMI' || t.category==='Credit Card Bill' || t.category==='Credit Card EMI');
    });
    const paidLoansThisMonth = thisMonthPayments
      .filter(t => t.category==='Loan EMI')
      .reduce((s,t)=>s+(parseFloat(t.amount)||0),0);
    const paidCCThisMonth = thisMonthPayments
      .filter(t => t.category==='Credit Card Bill' || t.category==='Credit Card EMI')
      .reduce((s,t)=>s+(parseFloat(t.amount)||0),0);
    const totalPaidThisMonth = paidLoansThisMonth + paidCCThisMonth;

    // Total planned this month
    const plannedThisMonth = totalEMI + totalCCEMI;

    // Estimated debt at start of month = current outstanding + what was paid this month
    const debtNow   = totalOutstanding + totalCCOut;
    const debtStart = debtNow + totalPaidThisMonth;
    const reduction = totalPaidThisMonth; // simplified (principal ≈ payment for now)

    // On-track status
    const onTrack = plannedThisMonth > 0
      ? totalPaidThisMonth >= plannedThisMonth * 0.95
      : null;
    const remaining = Math.max(0, plannedThisMonth - totalPaidThisMonth);

    // 6-month payment history (how much was paid each month)
    const monthlyPayments = Array.from({length:6}, (_,i) => {
      const d  = new Date(now.getFullYear(), now.getMonth()-(5-i), 1);
      const m  = d.getMonth();
      const y  = d.getFullYear();
      const lbl = d.toLocaleDateString('en-IN',{month:'short',year:'2-digit'});
      const paid = transactions
        .filter(t => {
          const td = parseLocal(t.date);
          return td && td.getMonth()===m && td.getFullYear()===y &&
            (t.category==='Loan EMI' || t.category==='Credit Card Bill' || t.category==='Credit Card EMI');
        })
        .reduce((s,t)=>s+(parseFloat(t.amount)||0),0);
      return { label:lbl, paid, planned: plannedThisMonth };
    });

    // Debt timeline — per loan progress bar
    const loanProgress = activeDebts.map(d => {
      const total   = parseFloat(d.totalAmount)||0;
      const current = parseFloat(d.outstanding)||0;
      const paid    = total > 0 ? total - current : 0;
      const pct     = total > 0 ? Math.min(100,(paid/total)*100) : 0;
      return { ...d, total, current, paid, pct };
    });

    // CC progress
    const ccProgress = creditCards.map(c => {
      const limit   = parseFloat(c.limit)||0;
      const current = parseFloat(c.outstanding)||0;
      const util    = limit > 0 ? Math.min(100,(current/limit)*100) : 0;
      return { ...c, current, util };
    });

    return {
      paidLoansThisMonth, paidCCThisMonth, totalPaidThisMonth,
      plannedThisMonth, debtNow, debtStart, reduction,
      onTrack, remaining, monthlyPayments, loanProgress, ccProgress,
    };
  }, [transactions, totalEMI, totalCCEMI, totalOutstanding, totalCCOut, activeDebts, creditCards]);

  // ─── MONEY CIRCLES COMPUTED ──────────────────────────────────────────────
  const circleStats = useMemo(() => {
    const pending = moneyCircles.filter(c=>c.status==="pending");
    const returned = moneyCircles.filter(c=>c.status==="returned");
    const borrowed = pending.filter(c=>c.type==="borrowed");
    const lent     = pending.filter(c=>c.type==="lent");
    const totalOwed    = borrowed.reduce((s,c)=>s+(parseFloat(c.amount)||0),0);
    const totalToGet   = lent.reduce((s,c)=>s+(parseFloat(c.amount)||0),0);
    const overdue = pending.filter(c=>c.returnDate&&daysUntil(c.returnDate)<0);
    const dueThisWeek = pending.filter(c=>c.returnDate&&daysUntil(c.returnDate)>=0&&daysUntil(c.returnDate)<=7);
    return { totalOwed, totalToGet, borrowed, lent, overdue, dueThisWeek, returned, pending };
  }, [moneyCircles]);

  // Cash Gap Detection — uses salary day + upcoming bills
  const cashGap = useMemo(() => {
    const salDay = parseInt(salary?.creditDay)||5;
    const today  = new Date().getDate();
    const daysToSal = salDay >= today ? salDay - today : (30 - today + salDay);
    const billsDue = [...activeDebts, ...creditCards].filter(item=>{
      if (!item.dueDate) return false;
      const d = new Date(item.dueDate).getDate();
      return d >= today && d < (today + daysToSal);
    });
    const totalBillsDue = billsDue.reduce((s,item)=>s+(parseFloat(item.emi||item.minDue)||0),0);
    const currentCash = Math.max(totalAccountBalance, 0);
    const gap = totalBillsDue - currentCash;
    return { daysToSal, totalBillsDue, currentCash, gap, billsDue, hasCashGap: gap > 0 };
  }, [salary, activeDebts, creditCards, totalAccountBalance]);

  // ─── SPENDING PERSONALITY SCORE ──────────────────────────────────────────
  const spendingPersonality = useMemo(() => {
    if (!thisMonthTx.length || totalExpense === 0) return null;
    const expTx = thisMonthTx.filter(t => t.type === "expense");
    if (!expTx.length) return null;
    const total = expTx.reduce((s,t) => s + (parseFloat(t.amount)||0), 0);
    const bycat = {};
    expTx.forEach(t => { bycat[t.category] = (bycat[t.category]||0) + (parseFloat(t.amount)||0); });
    const pct = cat => ((bycat[cat]||0)/total*100);
    const food = pct("Food") + pct("Groceries");
    const shopping = pct("Shopping");
    const transport = pct("Transport");
    const entertainment = pct("Entertainment");
    const housing = pct("Housing") + pct("Utilities");
    const health = pct("Health") + pct("Medical") + pct("Insurance");
    const savRate = effectiveIncome > 0 ? (effectiveIncome - totalExpense) / effectiveIncome * 100 : 0;
    const budgetBreached = spendAlerts.filter(a => a.over).length;
    if (savRate >= 25 && budgetBreached === 0)
      return { emoji:"💪", title:"The Disciplined Saver", desc:"Excellent control — saving 25%+ and no budgets broken. Keep it up!", color:"#00e5a0" };
    if (food >= 35)
      return { emoji:"🍕", title:"The Foodie", desc:"Food & groceries dominate your spending. Worth a home-cooking challenge?", color:"#f59e0b" };
    if (shopping >= 30)
      return { emoji:"🛍", title:"The Impulse Buyer", desc:"Shopping is your biggest category. A 24-hour rule before purchases could help.", color:"#f43f5e" };
    if (entertainment >= 25)
      return { emoji:"🎉", title:"The Social One", desc:"Entertainment is high — you invest in experiences. Balance it with savings.", color:"#a78bfa" };
    if (transport >= 25)
      return { emoji:"🚗", title:"The Commuter", desc:"Transport eats a big chunk. Could carpooling or WFH days reduce this?", color:"#38bdf8" };
    if (housing >= 45)
      return { emoji:"🏠", title:"The Homebody", desc:"Housing & utilities take up most of your budget — very common in metro cities.", color:"#fb923c" };
    if (health >= 20)
      return { emoji:"🛡", title:"The Protector", desc:"You prioritise health & insurance. That's smart long-term thinking.", color:"#34d399" };
    if (budgetBreached >= 3)
      return { emoji:"⚠️", title:"The Over-Spender", desc:"Multiple budgets breached this month. Try the 50-30-20 rule next month.", color:"#f43f5e" };
    return { emoji:"💎", title:"The Balanced Spender", desc:"No single category dominates — you spread spending well. Solid foundation!", color:"#7b4fd4" };
  }, [thisMonthTx, totalExpense, effectiveIncome, spendAlerts]);

  // ─── NO-SPEND STREAK ─────────────────────────────────────────────────────
  const noSpendStreak = useMemo(() => {
    // Build a set of dates with at least one expense
    const spendDates = new Set(
      transactions.filter(t => t.type === "expense").map(t => t.date)
    );
    // Current streak: go backwards from yesterday (today might still have expenses)
    let streak = 0;
    const d = new Date();
    // Check today first
    const todayKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    if (!spendDates.has(todayKey)) streak = 1;
    // Walk backwards
    for (let i = 1; i <= 365; i++) {
      const prev = new Date(d); prev.setDate(d.getDate() - i);
      const key = `${prev.getFullYear()}-${String(prev.getMonth()+1).padStart(2,"0")}-${String(prev.getDate()).padStart(2,"0")}`;
      if (!spendDates.has(key)) { if (i === 1 || streak > 0) streak++; }
      else { if (streak > 0) break; }
    }
    // Best ever streak
    let best = 0, cur = 0;
    const allDates = [];
    for (let i = 364; i >= 0; i--) {
      const prev = new Date(); prev.setDate(prev.getDate() - i);
      const key = `${prev.getFullYear()}-${String(prev.getMonth()+1).padStart(2,"0")}-${String(prev.getDate()).padStart(2,"0")}`;
      allDates.push(key);
    }
    allDates.forEach(key => {
      if (!spendDates.has(key)) { cur++; best = Math.max(best, cur); }
      else cur = 0;
    });
    // Zero spend days this month
    const n = new Date();
    const daysInMonth = new Date(n.getFullYear(), n.getMonth()+1, 0).getDate();
    const daysSoFar = n.getDate();
    let zeroThisMonth = 0;
    for (let i = 1; i <= daysSoFar; i++) {
      const key = `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}-${String(i).padStart(2,"0")}`;
      if (!spendDates.has(key)) zeroThisMonth++;
    }
    return { streak: Math.max(0, streak), best: Math.max(0, best), zeroThisMonth, daysSoFar };
  }, [transactions]);

  // ─── WEEKEND VS WEEKDAY SPENDING ─────────────────────────────────────────
  const weekendVsWeekday = useMemo(() => {
    const last30 = transactions.filter(t => {
      if (t.type !== "expense") return false;
      const d = parseLocal(t.date);
      if (!d) return false;
      const diff = (new Date() - d) / (1000 * 60 * 60 * 24);
      return diff <= 30;
    });
    const weekendTx = last30.filter(t => { const d = parseLocal(t.date); return d && (d.getDay()===0||d.getDay()===6); });
    const weekdayTx = last30.filter(t => { const d = parseLocal(t.date); return d && d.getDay()>=1 && d.getDay()<=5; });
    const weekendTotal = weekendTx.reduce((s,t) => s+(parseFloat(t.amount)||0), 0);
    const weekdayTotal = weekdayTx.reduce((s,t) => s+(parseFloat(t.amount)||0), 0);
    // Count unique days
    const weekendDays = new Set(weekendTx.map(t=>t.date)).size || 1;
    const weekdayDays = new Set(weekdayTx.map(t=>t.date)).size || 1;
    const weekendAvg = weekendTotal / weekendDays;
    const weekdayAvg = weekdayTotal / weekdayDays;
    const ratio = weekdayAvg > 0 ? weekendAvg / weekdayAvg : 0;
    // By day of week
    const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    const byDay = dayNames.map((name, dow) => {
      const dayTx = last30.filter(t => { const d=parseLocal(t.date); return d&&d.getDay()===dow; });
      const total = dayTx.reduce((s,t)=>s+(parseFloat(t.amount)||0),0);
      const days = new Set(dayTx.map(t=>t.date)).size || 1;
      return { name, avg: total/days, total, isWeekend: dow===0||dow===6 };
    });
    const peakDay = [...byDay].sort((a,b)=>b.avg-a.avg)[0];
    // Weekend categories
    const weCats = {};
    weekendTx.forEach(t => { weCats[t.category]=(weCats[t.category]||0)+(parseFloat(t.amount)||0); });
    const topWeekendCats = Object.entries(weCats).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([cat])=>cat);
    return { weekendAvg, weekdayAvg, ratio, byDay, peakDay, topWeekendCats, weekendTotal, weekdayTotal };
  }, [transactions]);

  // ─── SALARY COUNTDOWN ────────────────────────────────────────────────────
  const salaryCountdown = useMemo(() => {
    const salDay = parseInt(salary?.creditDay) || 0;
    const salAmt = parseFloat(salary?.amount) || 0;
    if (!salDay) return null;

    const now = new Date();
    const mo = now.getMonth(), yr = now.getFullYear();

    // Check if salary income was ALREADY added this month via transactions
    const alreadyCredited = transactions.some(t => {
      const d = parseLocal(t.date);
      return d && d.getMonth()===mo && d.getFullYear()===yr
        && t.type==="income"
        && (t.category==="Salary" || (t.note||"").toLowerCase().includes("salary"));
    });

    if (alreadyCredited) {
      return { daysLeft: -1, salDay, salAmt, isToday: false, alreadyCredited: true };
    }

    const todayDate = now.getDate();
    let daysLeft = salDay - todayDate;
    if (daysLeft < 0) {
      // Salary day passed this month but not yet credited — next month
      const daysInMonth = new Date(yr, mo+1, 0).getDate();
      daysLeft = daysInMonth - todayDate + salDay;
    }
    return { daysLeft, salDay, salAmt, isToday: daysLeft === 0, alreadyCredited: false };
  }, [salary, transactions]);

  // ─── SMART BUDGET SUGGESTIONS ────────────────────────────────────────────
  const smartBudgetSuggestions = useMemo(() => {
    // Show on salary day OR the day after salary credited
    if (!salaryCountdown?.isToday && !salaryCountdown?.alreadyCredited) return null;
    // Calculate 3-month category averages
    const suggestions = [];
    allCategories.expense.forEach(cat => {
      const vals = [0,1,2].map(monthsAgo => {
        const n = new Date();
        const mo = n.getMonth() - monthsAgo;
        const yr = n.getFullYear() + (mo < 0 ? -1 : 0);
        const adjMo = ((mo % 12) + 12) % 12;
        return transactions
          .filter(t => { const d=parseLocal(t.date); return d&&t.type==="expense"&&t.category===cat&&d.getMonth()===adjMo&&d.getFullYear()===yr; })
          .reduce((s,t)=>s+(parseFloat(t.amount)||0),0);
      });
      const avg = vals.reduce((s,v)=>s+v,0) / 3;
      if (avg > 100) suggestions.push({ cat, avg: Math.round(avg), suggested: Math.round(avg * 1.1 / 100) * 100 });
    });
    return suggestions.sort((a,b)=>b.avg-a.avg).slice(0,6);
  }, [salaryCountdown, allCategories, transactions]);

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

    // ── TRANSFER: deduct from source, add to destination, no income/expense ──
    if (tx.type === "transfer") {
      if (!tx._accountId || !tx._toAccountId) return; // need both accounts
      if (editTxId) {
        const oldTx = transactions.find(t => t.id === editTxId);
        if (oldTx && oldTx.type === "transfer") {
          applyToAccount(oldTx._accountId,   +oldTx.amount); // reverse old from
          applyToAccount(oldTx._toAccountId, -oldTx.amount); // reverse old to
        }
        setTransactions(p => p.map(t => t.id === editTxId ? {...tx, id: editTxId} : t));
      } else {
        setTransactions(p => [{...tx, id: Date.now()}, ...p]);
      }
      applyToAccount(tx._accountId,   -tx.amount); // deduct from source
      applyToAccount(tx._toAccountId, +tx.amount); // add to destination
      setTxForm({...EMPTY_TX}); setShowTxForm(false); setEditTxId(null);
      return;
    }

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

    
  function openEditTx(t) { setTxForm({...t, _toAccountId: t._toAccountId||""}); setEditTxId(t.id); setShowTxForm(true); }
  function deleteTx(id) {
    const tx = transactions.find(t => t.id === id);
    if (!tx) return;

    if (tx.type === "transfer") {
      // Reverse both sides of the transfer
      setAccounts(p => p.map(a => {
        if (String(a.id) === String(tx._accountId))   return {...a, balance: (parseFloat(a.balance)||0) + tx.amount};
        if (String(a.id) === String(tx._toAccountId)) return {...a, balance: Math.max(0,(parseFloat(a.balance)||0) - tx.amount)};
        return a;
      }));
    } else if (tx.type === "expense") {
      // Reverse account balance deduction
      if (tx._accountId && tx.paymentMode !== "Credit Card") {
        setAccounts(p => p.map(a =>
          String(a.id) === String(tx._accountId)
            ? {...a, balance: (parseFloat(a.balance)||0) + tx.amount}
            : a
        ));
      }
      // Reverse CC outstanding increase (if paid by CC)
      if (tx.paymentMode === "Credit Card" && tx.bank) {
        setCreditCards(p => p.map(c =>
          c.name === tx.bank
            ? {...c, outstanding: Math.max(0, (parseFloat(c.outstanding)||0) - tx.amount)}
            : c
        ));
      }
      // Reverse CC bill payment (restores outstanding)
      if (tx.category === "Credit Card Bill" && tx.bank) {
        setCreditCards(p => p.map(c =>
          (c.bank === tx.bank || c.name === tx.bank)
            ? {...c, outstanding: (parseFloat(c.outstanding)||0) + tx.amount}
            : c
        ));
      }
    } else if (tx.type === "income" && tx._accountId) {
      // Reverse account balance credit
      setAccounts(p => p.map(a =>
        String(a.id) === String(tx._accountId)
          ? {...a, balance: Math.max(0, (parseFloat(a.balance)||0) - tx.amount)}
          : a
      ));
    }

    setTransactions(p => p.filter(t => t.id !== id));
  }

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
    setDebts(p=>p.map(d=>{
      if(d.id!==id) return d;
      const newOutstanding = Math.max(0,(parseFloat(d.outstanding)||0)-amt);
      // Advance dueDate to next month after payment
      let newDueDate = d.dueDate;
      if (d.dueDate) {
        const dd = parseLocal(d.dueDate);
        const now = new Date();
        // If due date is in the past or this month, advance to next month
        if (dd && (dd <= now || (dd.getMonth()===now.getMonth() && dd.getFullYear()===now.getFullYear()))) {
          const nextDue = new Date(dd);
          nextDue.setMonth(nextDue.getMonth() + 1);
          newDueDate = `${nextDue.getFullYear()}-${String(nextDue.getMonth()+1).padStart(2,"0")}-${String(nextDue.getDate()).padStart(2,"0")}`;
        }
      }
      return {...d, outstanding: newOutstanding, closed: newOutstanding===0, dueDate: newDueDate};
    }));
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

  function addBudget() { if(!budgetForm.limit)return; setBudgets(p=>({...p,[budgetForm.category]:parseFloat(budgetForm.limit)})); setBudgetForm({category:"Food",limit:""}); }
  function saveCC() {
    if (!ccForm.name) return;
    if (editCCId) { setCreditCards(p=>p.map(c=>c.id===editCCId?{...ccForm,id:editCCId}:c)); }
    else { setCreditCards(p=>[...p,{...ccForm,id:Date.now()}]); }
    setCcForm({...EMPTY_CC}); setShowCCForm(false); setEditCCId(null);
  }
  function saveCCEmi() {
    if (!ccEmiForm.cardId || !ccEmiForm.amount) return;
    const entry = {...ccEmiForm, _totalMonths: ccEmiForm._totalMonths||ccEmiForm.monthsLeft};
    if (ccEmiForm.id) { setCcEmis(p=>p.map(e=>e.id===ccEmiForm.id?entry:e)); }
    else { setCcEmis(p=>[...p,{...entry,id:Date.now()}]); }
    setCcEmiForm({...EMPTY_CC_EMI}); setShowCCEmiForm(false);
  }
  function deleteCCEmi(id) { setCcEmis(p=>p.filter(e=>e.id!==id)); }
  function saveInvestment() {
    if (!invForm.name) return;
    // SIP investments don't need manual amount — calculated from sipStartDate
    if (!invForm.isSIP && !invForm.amount) return;
    // SIP must have sipAmount and sipStartDate
    if (invForm.isSIP && (!invForm.sipAmount || !invForm.sipStartDate)) return;
    if (editInvId) { setInvestments(p=>p.map(inv=>inv.id===editInvId?{...invForm,id:editInvId}:inv)); }
    else { setInvestments(p=>[...p,{...invForm,id:Date.now()}]); }
    setInvForm({...EMPTY_INVESTMENT}); setShowInvForm(false); setEditInvId(null);
  }
  function deleteInvestment(id) { setInvestments(p=>p.filter(inv=>inv.id!==id)); }

  function processSIP(inv) {
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const sipAmt = parseFloat(inv.sipAmount) || 0;
    if (!sipAmt) return;

    // 1. Record expense transaction
    const tx = {
      ...EMPTY_TX,
      id: Date.now(),
      type: "expense",
      amount: sipAmt,
      category: "Investment",
      paymentMode: inv.account ? "Bank Transfer" : "UPI",
      bank: inv.account?.name || "",
      _accountId: inv.sipAccountId || "",
      note: `SIP: ${inv.name}`,
      date: dateStr,
      time: now.toTimeString().slice(0,5),
    };
    setTransactions(p => [tx, ...p]);

    // 2. Deduct from account
    if (inv.sipAccountId) {
      setAccounts(p => p.map(a =>
        String(a.id) === String(inv.sipAccountId)
          ? {...a, balance: Math.max(0, (parseFloat(a.balance)||0) - sipAmt)}
          : a
      ));
    }

    // 3. Mark this month as done — total invested is auto-calculated from sipStartDate
    setInvestments(p => p.map(i =>
      i.id === inv.id ? {...i, lastSIPDate: dateStr} : i
    ));

    alert(`✅ SIP processed!\n₹${sipAmt.toLocaleString('en-IN')} deducted from ${inv.account?.name || 'account'}\nTotal invested in ${inv.name}: ₹${(getSIPTotalInvested({...inv, lastSIPDate: dateStr})).toLocaleString('en-IN')}`);
  }
  function openEditCC(c) { setCcForm({...c}); setEditCCId(c.id); setShowCCForm(true); }
  function deleteCC(id)  { setCreditCards(p=>p.filter(c=>c.id!==id)); }
  function recordCCPayment(id, amt) {
    setCreditCards(p=>p.map(c=>{
      if(c.id!==id) return c;
      const newOut = Math.max(0,(parseFloat(c.outstanding)||0)-amt);
      // Advance dueDate to next month after payment
      let newDueDate = c.dueDate;
      if (c.dueDate) {
        const dd = parseLocal(c.dueDate);
        const now = new Date();
        if (dd && (dd <= now || (dd.getMonth()===now.getMonth() && dd.getFullYear()===now.getFullYear()))) {
          const nextDue = new Date(dd);
          nextDue.setMonth(nextDue.getMonth() + 1);
          newDueDate = `${nextDue.getFullYear()}-${String(nextDue.getMonth()+1).padStart(2,"0")}-${String(nextDue.getDate()).padStart(2,"0")}`;
        }
      }
      return {...c, outstanding: newOut, dueDate: newDueDate};
    }));
    const cc=creditCards.find(c=>c.id===id);
    const primaryAcc = accounts.find(a=>a.type==="savings")||accounts[0];
    const tx = {id:Date.now(),type:"expense",amount:amt,category:"Credit Card Bill",
      paymentMode:"Net Banking",bank:cc?.bank||"",note:`CC: ${cc?.name||""}`,date:today(),
      _accountId:primaryAcc?.id||"",
    };
    setTransactions(p=>[tx,...p]);
    if (primaryAcc) setAccounts(p=>p.map(a=>a.id===primaryAcc.id?{...a,balance:Math.max(0,(parseFloat(a.balance)||0)-amt)}:a));
  }

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

  // ─── MONEY CIRCLES ACTIONS ───────────────────────────────────────────────
  function saveCircle() {
    if (!circleForm.person.trim() || !circleForm.amount || isNaN(circleForm.amount)) return;
    const entry = {...circleForm, amount: parseFloat(circleForm.amount)};
    if (editCircleId) {
      setMoneyCircles(p => p.map(c => c.id===editCircleId ? {...entry, id:editCircleId} : c));
    } else {
      setMoneyCircles(p => [{...entry, id:Date.now()}, ...p]);
    }
    setCircleForm({...EMPTY_CIRCLE});
    setShowCircleForm(false);
    setEditCircleId(null);
  }
  function markCircleReturned(id) {
    setMoneyCircles(p => p.map(c => c.id===id ? {...c, status:"returned", returnedDate:todayStr()} : c));
  }
  function deleteCircle(id) { setMoneyCircles(p => p.filter(c => c.id!==id)); }
  function openEditCircle(c) {
    setCircleForm({...c, amount:String(c.amount)});
    setEditCircleId(c.id);
    setShowCircleForm(true);
  }
  // ─── RECURRING BILL ACTIONS ───────────────────────────────────────────────
  function saveRecurring() {
    if (!recurringForm.name || !recurringForm.amount) return;
    if (recurringForm.id) {
      setRecurringBills(p => p.map(b => b.id===recurringForm.id ? {...recurringForm} : b));
    } else {
      setRecurringBills(p => [...p, {...recurringForm, id:Date.now()}]);
    }
    setRecurringForm({id:null,name:"",amount:"",dueDay:"1",category:"Utilities",active:true,notes:""});
    setShowRecurringForm(false);
  }
  function deleteRecurring(id) { setRecurringBills(p => p.filter(b=>b.id!==id)); }
  function toggleRecurring(id) { setRecurringBills(p => p.map(b => b.id===id?{...b,active:!b.active}:b)); }
  function openEditCircle(c) {
    setCircleForm({...c, amount:String(c.amount)});
    setEditCircleId(c.id);
    setShowCircleForm(true);
  }


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

  const css=`
    @import url('https://fonts.googleapis.com/css2?family=Cabinet+Grotesk:wght@400;500;700;800;900&family=JetBrains+Mono:wght@400;500&display=swap');

    :root {
      --bg: ${C.bg}; --card: ${C.card}; --border: ${C.border}; --text: ${C.text};
      --muted: ${C.muted}; --accent: ${C.accent}; --surface: ${C.surface};
      --income: ${C.income}; --expense: ${C.expense}; --glow: ${C.glow};
      --purple: ${C.purple}; --purple-light: ${C.purpleLight};
    }

    *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}
    html{overflow-x:hidden;}
    body{overflow-x:hidden;overscroll-behavior:none;background:${C.bg};}

    ::-webkit-scrollbar{width:3px;}
    ::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px;}

    input,select,textarea{
      outline:none;-webkit-appearance:none;
      font-family:'Cabinet Grotesk',sans-serif;
      transition: border-color 0.2s, box-shadow 0.2s;
    }

    /* ── Core Cards ── */
    .card {
      background:${C.card};
      border:1px solid ${C.border};
      border-radius:18px;
      padding:18px 16px;
      margin-bottom:14px;
      position:relative;overflow:hidden;
      box-shadow: 0 2px 12px rgba(0,0,0,${darkMode?"0.18":"0.06"});
    }

    /* ── ALL BUTTONS ── */
    .btn{
      cursor:pointer;border:none;border-radius:99px;
      font-family:'Cabinet Grotesk',sans-serif;font-weight:700;font-size:13px;
      padding:12px 24px;letter-spacing:0.1px;
      transition: all 0.18s cubic-bezier(.4,0,.2,1);
      display:inline-flex;align-items:center;gap:6px;justify-content:center;
      position:relative;overflow:hidden;
    }
    .btn:active{transform:scale(0.96);}
    /* Primary — purple fill */
    .btn-p{background:${C.purple};color:#fff;box-shadow:0 4px 16px ${C.purple}45;}
    .btn-p:hover{box-shadow:0 6px 24px ${C.purple}60;filter:brightness(1.08);}
    /* Green */
    .btn-g{background:${C.income};color:${darkMode?"#0d0d14":"#fff"};box-shadow:0 4px 14px ${C.income}35;}
    .btn-g:hover{filter:brightness(1.08);}
    /* Purple light */
    .btn-v{background:${C.purpleLight};color:#fff;box-shadow:0 4px 14px ${C.purpleLight}35;}
    /* AI gradient */
    .btn-ai{background:linear-gradient(135deg,#5b4fd4,#9b6af7,#7b4fd4);color:#fff;box-shadow:0 4px 20px rgba(123,79,212,0.45);}
    .btn-ai:hover{filter:brightness(1.1);}
    /* Small modifier */
    .btn-sm{padding:7px 16px;font-size:11.5px;border-radius:99px;}
    /* Danger */
    .btn-danger{
      background:${C.expense}12;color:${C.expense};
      border:1.5px solid ${C.expense}50;
      font-size:11px;padding:7px 13px;cursor:pointer;border-radius:99px;
      font-family:'Cabinet Grotesk',sans-serif;font-weight:700;transition:all 0.15s;
    }
    .btn-danger:hover{background:${C.expense}22;border-color:${C.expense}80;}
    /* Ghost */
    .btn-ghost{
      background:transparent;color:${C.text};
      border:1.5px solid ${C.border};
      padding:7px 16px;border-radius:99px;cursor:pointer;
      font-family:'Cabinet Grotesk',sans-serif;font-weight:600;font-size:11.5px;
      transition:all 0.15s;
    }
    .btn-ghost:hover{background:${C.surface};border-color:${C.muted}70;}

    /* ── Inputs ── */
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
    .inp:focus{border-color:${C.purple};box-shadow: 0 0 0 3px ${C.purple}18;}
    .inp::placeholder{color:${C.muted};}

    /* ── Underline Input (for forms like Add Transaction) ── */
    .inp-line{
      background:transparent;border:none;
      border-bottom:1.5px solid ${C.border};
      border-radius:0;color:${C.text};
      padding:10px 4px;font-size:15px;width:100%;
      font-family:'Cabinet Grotesk',sans-serif;font-weight:600;
      transition:border-color 0.2s;
    }
    .inp-line:focus{border-bottom-color:${C.purple};outline:none;}
    .inp-line::placeholder{color:${C.muted};font-weight:400;}

    /* ── Modal ── */
    .modal{
      position:fixed;inset:0;
      background:rgba(0,0,0,0.72);
      backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
      z-index:200;display:flex;align-items:flex-end;justify-content:center;
    }
    .sheet{
      width:100%;max-width:560px;
      background:${C.card};
      border:1px solid ${C.border};
      border-radius:28px 28px 0 0;
      padding:28px 20px 36px;
      max-height:94vh;overflow-y:auto;
      box-shadow:0 -20px 60px rgba(0,0,0,0.4);
    }
    /* Sheet drag handle */
    .sheet::before{
      content:'';display:block;
      width:36px;height:4px;border-radius:2px;
      background:${C.border};
      margin:0 auto 20px;
    }
    @media(min-width:640px){.modal{align-items:center;padding:20px;}.sheet{border-radius:24px;}.sheet::before{display:none;}}

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
      font-weight:700;letter-spacing:1.4px;
      text-transform:uppercase;margin-bottom:6px;
      display:block;
    }

    /* ── Section headers — Fintastics style ── */
    .stitle{
      font-family:'Cabinet Grotesk',sans-serif;
      font-weight:800;font-size:15px;margin-bottom:14px;
      letter-spacing:-0.2px;color:${C.text};
    }
    /* Section header row with View All */
    .sec-hdr{
      display:flex;justify-content:space-between;align-items:center;
      margin-bottom:12px;
    }
    .sec-hdr-title{
      font-family:'Cabinet Grotesk',sans-serif;font-weight:800;font-size:15px;
      display:flex;align-items:center;gap:7px;color:${C.text};
    }
    .sec-hdr-more{
      font-family:'Cabinet Grotesk',sans-serif;font-weight:700;font-size:12px;
      color:${C.purple};cursor:pointer;background:none;border:none;
    }

    /* ── Rows ── */
    .row{
      display:flex;justify-content:space-between;align-items:center;
      padding:12px 0;
      border-bottom:1px solid ${C.border}50;
      transition:background 0.15s;
    }

    /* ── Grids ── */
    .g2{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
    .g4{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;}
    @media(max-width:640px){.g4{grid-template-columns:repeat(2,1fr);}.g2{grid-template-columns:1fr;}}

    /* ── Stat cards ── */
    .scard{
      background:${C.card};border:1px solid ${C.border};
      border-radius:16px;padding:16px 14px;
      position:relative;overflow:hidden;
      box-shadow:0 2px 8px rgba(0,0,0,${darkMode?"0.15":"0.05"});
      transition: border-color 0.2s, transform 0.2s;
    }
    .scard:hover{transform:translateY(-1px);border-color:${C.purple}40;}

    /* ── Filter chips — Fintastics style ── */
    .filter-btn{
      cursor:pointer;padding:7px 16px;border-radius:99px;
      font-family:'Cabinet Grotesk',sans-serif;font-weight:600;font-size:11px;
      border:1.5px solid ${C.border};
      background:transparent;color:${C.muted};
      transition:all 0.15s;white-space:nowrap;
    }
    .filter-btn:hover{border-color:${C.muted}80;color:${C.text};}
    .filter-btn.on{
      border-color:${C.purple};color:#fff;
      background:${C.purple};
    }

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

    /* ── Bottom Nav — Fintastics style ── */
    .bnav{
      position:fixed;bottom:0;left:0;right:0;
      background:${darkMode?"#1a1328":"#ffffff"};
      display:flex;z-index:100;align-items:center;
      padding:0 4px;
      padding-bottom:env(safe-area-inset-bottom,0px);
      box-shadow:0 -1px 0 ${C.border}, 0 -8px 32px rgba(0,0,0,0.08);
      height:60px;
    }
    .bn{
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      padding:8px 4px 6px;
      font-family:'Cabinet Grotesk',sans-serif;font-weight:700;font-size:9px;
      color:${C.muted};cursor:pointer;border:none;
      background:transparent;gap:2px;flex:1;
      transition:color 0.15s, transform 0.15s;letter-spacing:0.3px;
      position:relative;
    }
    .bn.act{color:${C.purple};}
    .bn.act span:first-child{
      transform:scale(1.1);
      filter:drop-shadow(0 2px 6px ${C.purple}60);
    }
    .bn.act::after{
      content:'';position:absolute;bottom:0;left:50%;transform:translateX(-50%);
      width:20px;height:2.5px;border-radius:99px;background:${C.purple};
    }
    /* Centre FAB */
    .bn-fab{
      width:54px;height:54px;border-radius:18px;
      background:${C.purple};border:none;cursor:pointer;
      font-size:26px;color:#fff;font-weight:300;
      display:flex;align-items:center;justify-content:center;
      box-shadow:0 4px 20px ${C.purple}55, 0 2px 8px rgba(0,0,0,0.2);
      flex-shrink:0;
      transition:transform 0.18s, box-shadow 0.18s;
      position:relative;
    }
    .bn-fab:active{transform:scale(0.88);box-shadow:0 2px 8px ${C.purple}30;}
    .bn-fab::before{
      content:'';position:absolute;inset:-1px;border-radius:19px;
      background:linear-gradient(135deg,rgba(255,255,255,0.25),transparent);
      pointer-events:none;
    }

    /* ── FAB (desktop / fallback) ── */
    .fab{
      position:fixed;bottom:80px;right:18px;
      width:56px;height:56px;border-radius:50%;
      background:${C.purple};border:none;cursor:pointer;font-size:24px;
      display:flex;align-items:center;justify-content:center;
      box-shadow:0 8px 28px ${C.purple}55;
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
      background:${C.card};border-right:1px solid ${C.border};
      z-index:300;padding:0;display:flex;flex-direction:column;
      transform:translateX(-100%);
      transition:transform 0.28s cubic-bezier(.4,0,.2,1);
      box-shadow: 4px 0 40px rgba(0,0,0,0.3);
    }
    .hmenu.open{transform:translateX(0);}
    .hmenu-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:299;backdrop-filter:blur(4px);}
    .hmenu-item{
      display:flex;align-items:center;gap:12px;padding:15px 20px;
      cursor:pointer;border:none;background:transparent;
      color:${C.text};font-family:'Cabinet Grotesk',sans-serif;
      font-weight:600;font-size:13px;width:100%;text-align:left;
      transition:background 0.15s;
    }
    .hmenu-item:hover{background:${C.surface};}
    .hmenu-item.active{color:${C.purple};background:${C.purpleDim};}

    /* ── Pull to refresh ── */
    .ptr{display:flex;align-items:center;justify-content:center;overflow:hidden;transition:height 0.2s;background:${C.bg};}
    .ptr-spinner{width:20px;height:20px;border:2px solid ${C.border};border-top-color:${C.purple};border-radius:50%;animation:spin 0.7s linear infinite;}
    @keyframes spin{to{transform:rotate(360deg)}}

    /* ── Desktop tabs ── */
    .dtab-btn{
      cursor:pointer;padding:7px 15px;border-radius:99px;
      font-family:'Cabinet Grotesk',sans-serif;font-weight:700;font-size:12px;
      border:none;background:transparent;color:${C.muted};
      transition:all 0.15s;white-space:nowrap;
    }
    .dtab-btn:hover{color:${C.text};}
    .dtab-btn.act{background:${C.purpleDim};color:${C.purple};}

    /* ── Misc ── */
    .num{font-family:'Cabinet Grotesk',sans-serif;font-weight:800;font-variant-numeric:tabular-nums;}
    .div{height:1px;background:${C.border}60;margin:16px 0;}
    .gstat{background:${C.surface};border:1px solid ${C.border};border-radius:14px;padding:16px;transition:all 0.2s;}
    .gstat:hover{border-color:${C.purple}30;transform:translateY(-1px);}
    .sheet::-webkit-scrollbar{width:3px;}
    .sheet::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px;}

    /* ── Due badge ── */
    .due-badge{
      display:inline-flex;align-items:center;gap:3px;
      padding:3px 8px;border-radius:99px;
      font-size:9.5px;font-family:'Cabinet Grotesk',sans-serif;font-weight:700;
    }

    /* ── Hero card (purple gradient) ── */
    .hero-card{
      background:linear-gradient(135deg,${C.purple} 0%,${C.purpleLight} 100%);
      border-radius:20px;padding:20px 18px 18px;
      margin-bottom:14px;position:relative;overflow:hidden;
      box-shadow:0 8px 32px ${C.purple}45;
    }
    .hero-card::before{
      content:'';position:absolute;top:-30px;right:-30px;
      width:140px;height:140px;border-radius:50%;
      background:rgba(255,255,255,0.07);
    }
    .hero-card::after{
      content:'';position:absolute;bottom:-40px;left:-20px;
      width:120px;height:120px;border-radius:50%;
      background:rgba(255,255,255,0.05);
    }
    /* Tx type segmented tabs */
    .tx-seg{
      display:flex;gap:0;background:${C.surface};
      border-radius:12px;padding:3px;margin-bottom:16px;overflow:hidden;
    }
    .tx-seg-btn{
      flex:1;padding:9px 4px;border:none;border-radius:10px;cursor:pointer;
      font-family:'Cabinet Grotesk',sans-serif;font-weight:700;font-size:12px;
      background:transparent;color:${C.muted};transition:all 0.18s;
    }
    .tx-seg-btn.on{background:${C.purple};color:#fff;box-shadow:0 2px 8px ${C.purple}40;}
    /* ── Period Picker Dropdown ── */
    .period-btn{
      display:inline-flex;align-items:center;gap:6px;
      background:rgba(255,255,255,0.18);border:none;border-radius:99px;
      color:#fff;cursor:pointer;padding:5px 12px 5px 10px;
      font-family:'Cabinet Grotesk',sans-serif;font-weight:700;font-size:11px;
      transition:background 0.15s;
    }
    .period-btn:hover{background:rgba(255,255,255,0.28);}
    .period-dropdown{
      position:absolute;top:calc(100% + 8px);left:0;
      background:${C.card};border:1px solid ${C.border};
      border-radius:16px;padding:8px;
      box-shadow:0 8px 32px rgba(0,0,0,0.25);
      z-index:200;min-width:200px;
    }
    .period-opt{
      display:block;width:100%;padding:10px 14px;
      background:transparent;border:none;border-radius:10px;
      text-align:left;cursor:pointer;
      font-family:'Cabinet Grotesk',sans-serif;font-weight:600;font-size:13px;
      color:${C.text};transition:background 0.12s;
    }
    .period-opt:hover{background:${C.surface};}
    .period-opt.active{background:${C.purpleDim};color:${C.purple};font-weight:700;}

    /* ══ ANDROID-NATIVE FEEL ══ */
    .page-enter{animation:pageSlideIn 0.28s cubic-bezier(0.4,0,0.2,1) forwards;}
    @keyframes pageSlideIn{from{opacity:0;transform:translateY(18px) scale(0.98);}to{opacity:1;transform:translateY(0) scale(1);}}
    .card{animation:cardIn 0.32s cubic-bezier(0.4,0,0.2,1) both;}
    @keyframes cardIn{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}
    .ripple{position:absolute;border-radius:50%;transform:scale(0);animation:ripple-anim 0.55s linear;background:rgba(255,255,255,0.25);pointer-events:none;}
    @keyframes ripple-anim{to{transform:scale(4);opacity:0;}}
    .sheet{animation:sheetUp 0.32s cubic-bezier(0.4,0,0.2,1) forwards;}
    @keyframes sheetUp{from{transform:translateY(100%);opacity:0.6;}to{transform:translateY(0);opacity:1;}}
    .bn-fab:active,.fab:active{transform:scale(0.88)!important;}
    .row:active{background:${C.surface};border-radius:12px;}
    .scard:active{transform:scale(0.97);box-shadow:0 1px 4px rgba(0,0,0,0.15);}
    .ripple-btn{overflow:hidden;position:relative;}
    .install-banner{position:fixed;bottom:70px;left:12px;right:12px;background:linear-gradient(135deg,${C.purple},${C.purpleLight});border-radius:18px;padding:14px 16px;display:flex;align-items:center;gap:12px;z-index:150;box-shadow:0 8px 32px rgba(123,79,212,0.45);animation:bannerUp 0.4s cubic-bezier(0.4,0,0.2,1);}
    @keyframes bannerUp{from{opacity:0;transform:translateY(20px);}to{opacity:1;transform:translateY(0);}}
    .update-banner{position:fixed;top:0;left:0;right:0;background:${C.income};color:${darkMode?"#0d0d14":"#fff"};padding:10px 16px;display:flex;justify-content:space-between;align-items:center;z-index:999;font-family:'Cabinet Grotesk',sans-serif;font-weight:700;font-size:13px;animation:slideDown 0.3s ease;}
    @keyframes slideDown{from{transform:translateY(-100%);}to{transform:translateY(0);}}
    .bnav{padding-bottom:max(env(safe-area-inset-bottom),8px)!important;}
    a,button,[role=button]{touch-action:manipulation;}
    @media(display-mode:standalone){body{padding-top:env(safe-area-inset-top);}.dtabs{display:none!important;}}
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

  // ─── PWA INSTALL PROMPT ──────────────────────────────────────────────────
  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true) {
      setIsInstalled(true);
      return;
    }
    // Listen for install prompt
    const handler = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
      // Show banner after 30 seconds of use (not immediately)
      setTimeout(() => setShowInstallBanner(true), 30000);
    };
    window.addEventListener('beforeinstallprompt', handler);
    // Listen for successful install
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setShowInstallBanner(false);
      setInstallPrompt(null);
    });
    // Listen for SW update
    window.addEventListener('sw-update-available', () => setShowUpdateBanner(true));
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // ─── RIPPLE EFFECT (Android Material ripple on all buttons) ──────────────
  useEffect(() => {
    function addRipple(e) {
      const btn = e.currentTarget;
      const circle = document.createElement('span');
      const diameter = Math.max(btn.clientWidth, btn.clientHeight);
      const radius = diameter / 2;
      const rect = btn.getBoundingClientRect();
      circle.style.cssText = `width:${diameter}px;height:${diameter}px;left:${e.clientX-rect.left-radius}px;top:${e.clientY-rect.top-radius}px;position:absolute;`;
      circle.classList.add('ripple');
      const existing = btn.querySelector('.ripple');
      if (existing) existing.remove();
      btn.appendChild(circle);
      setTimeout(() => circle.remove(), 600);
    }
    // Apply to all nav buttons
    const btns = document.querySelectorAll('.bn, .bn-fab, .btn-p, .btn-g');
    btns.forEach(btn => btn.addEventListener('click', addRipple));
    return () => btns.forEach(btn => btn.removeEventListener('click', addRipple));
  });

  // ─── TAB CHANGE ANIMATION ────────────────────────────────────────────────
  function navigateTo(newTab) {
    setPageKey(k => k + 1);
    setTab(newTab);
  }

  // ─── PWA INSTALL HANDLER ─────────────────────────────────────────────────
  async function handleInstall() {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setShowInstallBanner(false);
    }
    setInstallPrompt(null);
  }

  // ─── NOTIFICATION ENGINE ─────────────────────────────────────────────────
  // Check permission on load
  useEffect(() => {
    if ("Notification" in window) {
      setNotifPermission(Notification.permission);
    }
  }, []);

  // Request permission helper
  async function requestNotifPermission() {
    if (!("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setNotifPermission(result);
    if (result === "granted") {
      sendNotif("✅ FinTrack Notifications On", "You'll get EMI reminders, budget alerts and daily nudges.");
    }
  }

  // Core notification sender — uses direct Notification API, no SW needed
  function sendNotif(title, body, tag = "fintrack") {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    try {
      new Notification(title, {
        body,
        icon: "/icon-192.png",
        tag,
        renotify: true,
      });
    } catch(e) {
      // Some browsers block Notification in certain contexts — silently ignore
    }
  }

  // Smart notification scheduler — fires every time app loads with data
  // Uses localStorage to avoid spamming same notification multiple times per day
  useEffect(() => {
    if (!loaded || notifPermission !== "granted") return;

    const todayKey = new Date().toISOString().slice(0, 10); // "2026-03-27"
    const storageKey = `fintrack_notif_${todayKey}`;
    if (localStorage.getItem(storageKey)) return; // already ran today
    localStorage.setItem(storageKey, "1");

    // Clean up old keys (keep only last 7 days)
    Object.keys(localStorage)
      .filter(k => k.startsWith("fintrack_notif_") && k !== storageKey)
      .forEach(k => localStorage.removeItem(k));

    // 1. EMI Due Reminders
    activeDebts.forEach(d => {
      if (!d.dueDate || !d.emi) return;
      const days = daysUntil(d.dueDate);
      const emiAmt = "₹" + parseFloat(d.emi).toLocaleString("en-IN");
      if (days === 3)        sendNotif("📅 EMI Due in 3 Days",  `${d.name} — ${emiAmt} due on ${parseLocal(d.dueDate).toLocaleDateString("en-IN",{day:"numeric",month:"short"})}`, "emi-3d-"+d.id);
      else if (days === 1)   sendNotif("⚠️ EMI Due Tomorrow!",  `${d.name} — ${emiAmt}. Make sure funds are ready.`, "emi-1d-"+d.id);
      else if (days === 0)   sendNotif("🔴 EMI Due Today!",      `${d.name} — ${emiAmt} is being debited today.`, "emi-0d-"+d.id);
      else if (days !== null && days < 0)
                             sendNotif("🚨 EMI Overdue!",        `${d.name} — ${emiAmt} was due ${Math.abs(days)} days ago!`, "emi-over-"+d.id);
    });

    // 2. Credit Card Due Reminders
    creditCards.forEach(cc => {
      if (!cc.dueDate) return;
      const days = daysUntil(cc.dueDate);
      const out = parseFloat(cc.outstanding) || 0;
      if (out === 0) return;
      const outAmt = "₹" + out.toLocaleString("en-IN");
      if (days === 3)        sendNotif("📅 CC Bill Due in 3 Days", `${cc.name} — ${outAmt} outstanding.`, "cc-3d-"+cc.id);
      else if (days === 1)   sendNotif("⚠️ CC Bill Due Tomorrow!", `${cc.name} — ${outAmt} due. Avoid late fees!`, "cc-1d-"+cc.id);
      else if (days === 0)   sendNotif("🔴 CC Bill Due Today!",    `${cc.name} — Pay ${outAmt} today to avoid interest.`, "cc-0d-"+cc.id);
      else if (days !== null && days < 0)
                             sendNotif("🚨 CC Bill Overdue!",      `${cc.name} — ${outAmt} overdue! Pay now.`, "cc-over-"+cc.id);
    });

    // 3. Budget Overspend Alerts
    spendAlerts.forEach(a => {
      if (a.over)          sendNotif("🚨 Budget Exceeded — " + a.cat, `Spent ₹${a.spent.toLocaleString("en-IN")} vs ₹${a.limit.toLocaleString("en-IN")} limit (${a.pct}%).`, "budget-over-"+a.cat);
      else if (a.pct >= 90) sendNotif("⚠️ Budget Almost Full — " + a.cat, `${a.pct}% used — only ₹${(a.limit-a.spent).toLocaleString("en-IN")} left.`, "budget-90-"+a.cat);
    });

    // 4. Low Balance Warning
    if (cashLeft < totalEMI && totalEMI > 0) {
      sendNotif("⚠️ Low Balance Warning", `Cash left ₹${Math.max(0,cashLeft).toLocaleString("en-IN")} may not cover EMIs ₹${totalEMI.toLocaleString("en-IN")}.`, "low-balance");
    }

    // 5. Money Circles — return reminders
    moneyCircles.filter(c=>c.status==="pending"&&c.returnDate).forEach(c=>{
      const days = daysUntil(c.returnDate);
      const amt = "₹"+parseFloat(c.amount).toLocaleString("en-IN");
      if (c.type==="borrowed") {
        if (days===1)            sendNotif("💸 Return Money Tomorrow", `Pay back ${amt} to ${c.person} tomorrow.`, "cr-1d-"+c.id);
        else if (days===0)       sendNotif("💸 Return Money Today!", `Pay back ${amt} to ${c.person} today.`, "cr-0d-"+c.id);
        else if (days!==null&&days<0) sendNotif("🚨 Overdue Return!", `You owe ${amt} to ${c.person} — ${Math.abs(days)} days overdue.`, "cr-ov-"+c.id);
      } else {
        if (days===0)            sendNotif("💰 Collect Money Today", `${c.person} should return ${amt} today.`, "cg-0d-"+c.id);
        else if (days!==null&&days<0) sendNotif("💰 Money Not Received", `${c.person} hasn't returned ${amt} — ${Math.abs(days)} days overdue.`, "cg-ov-"+c.id);
      }
    });

    // 6. Daily log reminder — fires on first app open each day
    const hour = new Date().getHours();
    if (hour >= 20) { // after 8 PM
      sendNotif("📝 Log Today's Expenses", "Don't forget to add today's spending to FinTrack!", "daily-nudge");
    }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, notifPermission]);

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
          background:`linear-gradient(135deg, ${C.purple}, ${C.purpleLight})`,
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
          <div style={{width:34,height:34,background:`linear-gradient(135deg, ${C.purple}, ${C.purpleLight})`,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:900,fontSize:16,boxShadow:`0 4px 12px ${C.purple}35`}}>₹</div>
          <span style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:17,letterSpacing:"-0.3px"}}>FinTrack</span>
          {health.score>0&&<span className="tag" style={{background:health.color+"20",color:health.color,fontSize:10}}>{health.grade} · {health.score}/100</span>}
          {overdueCount>0&&<span className="pulse tag" style={{background:`${C.expense}15`,color:C.expense,cursor:"pointer"}} onClick={()=>navigateTo("Cards")}>⚠ {overdueCount} overdue</span>}
          <span style={{display:"flex",alignItems:"center"}}><span className="sync-dot"/><span style={{fontSize:10,color:C.muted,fontFamily:"'JetBrains Mono',monospace"}}>{saving?"saving…":lastSaved?`saved ${lastSaved.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}`:""}</span></span>
        </div>
        <div style={{display:"flex",gap:2}}>
          {ALL_TABS.map(t=>(
            <button key={t} className={`dtab-btn ${tab===t?"act":""}`} onClick={()=>navigateTo(t)}>
              {t==="Plan"?"🎯 Plan":t==="Cards"?"💳 Cards":t==="Insights"?"🔍 Insights":t==="Smart"?"⚡ Smart":t==="Budget"?"🎯 Budget":t==="Circles"?"💸 Circles":t}
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

      {/* ── Mobile Header — Fintastics style ── */}
      <div style={{
        padding:"10px 16px 10px",
        display:"flex",alignItems:"center",justifyContent:"space-between",
        position:"sticky",top:0,
        background:C.purple,
        zIndex:50,gap:8,
        boxShadow:`0 2px 16px ${C.purple}60`,
      }}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {/* Logo */}
          <div style={{width:34,height:34,background:"rgba(255,255,255,0.18)",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:900,fontSize:16}}>₹</div>
          <div>
            <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:16,color:"#fff",letterSpacing:"-0.3px",lineHeight:1.1}}>FinTrack</div>
            <div style={{fontSize:9,color:"rgba(255,255,255,0.65)",fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:600}}>
              {new Date().toLocaleDateString("en-IN",{month:"long",year:"numeric"})} &nbsp;
              <span style={{display:"inline-block",width:5,height:5,borderRadius:"50%",background:saving?"#ffb547":fbStatus==="ok"?"#00e5a0":"#ff4d6d",verticalAlign:"middle"}}/>
            </div>
          </div>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          {health.score>0&&<span style={{background:"rgba(255,255,255,0.18)",color:"#fff",padding:"3px 10px",borderRadius:99,fontSize:10,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700}}>{health.grade} {health.score}</span>}
          {overdueCount>0&&<span className="pulse" style={{background:"rgba(255,77,109,0.35)",color:"#fff",padding:"3px 8px",borderRadius:99,fontSize:10,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700}}>⚠ {overdueCount}</span>}
          <button onClick={()=>setDarkMode(p=>!p)} style={{background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",borderRadius:99,width:30,height:30,cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center"}}>{darkMode?"☀":"🌙"}</button>
          <button onClick={()=>setShowMenu(true)} style={{background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",borderRadius:99,width:30,height:30,cursor:"pointer",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center"}}>☰</button>
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

      <div key={pageKey} className="page-enter" style={{maxWidth:1200,margin:"0 auto",padding:"16px 14px 16px",paddingBottom:100}}>

        {/* ════════ DASHBOARD ════════ */}
        {tab==="Dashboard"&&(()=>{
          // ── period label helper ──
          const periodLabel = (()=>{
            const n = new Date();
            if(dashPeriod==="today") return new Date().toLocaleDateString("en-IN",{day:"numeric",month:"short"});
            if(dashPeriod==="week"){ const s=new Date();s.setDate(s.getDate()-7);return `${s.toLocaleDateString("en-IN",{day:"numeric",month:"short"})} – ${n.toLocaleDateString("en-IN",{day:"numeric",month:"short"})}`; }
            if(dashPeriod==="month") return n.toLocaleDateString("en-IN",{month:"long",year:"numeric"});
            if(dashPeriod==="lastmonth"){ const lm=new Date(n.getFullYear(),n.getMonth()-1,1);return lm.toLocaleDateString("en-IN",{month:"long",year:"numeric"}); }
            if(dashPeriod==="3months"){ const s=new Date();s.setMonth(s.getMonth()-3);return `${s.toLocaleDateString("en-IN",{month:"short"})} – ${n.toLocaleDateString("en-IN",{month:"short",year:"numeric"})}`; }
            if(dashPeriod==="year") return `${n.getFullYear()}`;
            if(dashPeriod==="custom"&&customDateFrom&&customDateTo) return `${fd(customDateFrom)} – ${fd(customDateTo)}`;
            return "All Time";
          })();
          const periodOptions = [
            {v:"today",   l:"Today"},
            {v:"week",    l:"This Week"},
            {v:"month",   l:"This Month"},
            {v:"lastmonth",l:"Last Month"},
            {v:"3months", l:"Last 3 Months"},
            {v:"year",    l:"This Year"},
            {v:"all",     l:"All Time"},
            {v:"custom",  l:"Custom Range"},
          ];
          const pt = filterByPeriod(transactions, dashPeriod);
          const pInc = pt.filter(t=>t.type==="income").reduce((s,t)=>s+(parseFloat(t.amount)||0),0);
          const pExp = pt.filter(t=>t.type==="expense").reduce((s,t)=>s+(parseFloat(t.amount)||0),0);
          const pEMI = pt.filter(t=>t._emiKey||t.category==="Loan EMI"||t.category==="Credit Card EMI").reduce((s,t)=>s+(parseFloat(t.amount)||0),0);
          const netBal = pInc - pExp;

          return <>

          {/* ── 1. HERO CARD with period picker ── */}
          <div className="hero-card" style={{marginBottom:14}}>
            {/* Header row: period picker + accounts link */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,position:"relative",zIndex:10}}>
              {/* Period dropdown */}
              <div style={{position:"relative"}}>
                <button className="period-btn" onClick={()=>setShowPeriodPicker(p=>!p)}>
                  📅 {periodLabel} <span style={{fontSize:9,opacity:0.7}}>▼</span>
                </button>
                {showPeriodPicker&&(
                  <>
                    <div style={{position:"fixed",inset:0,zIndex:199}} onClick={()=>setShowPeriodPicker(false)}/>
                    <div className="period-dropdown">
                      {periodOptions.map(o=>(
                        <button key={o.v} className={`period-opt ${dashPeriod===o.v?"active":""}`}
                          onClick={()=>{ if(o.v!=="custom"){setDashPeriod(o.v);setShowPeriodPicker(false);} else setDashPeriod("custom"); }}>
                          {o.l}
                        </button>
                      ))}
                      {dashPeriod==="custom"&&(
                        <div style={{padding:"8px 14px",borderTop:`1px solid ${C.border}`,marginTop:4}}>
                          <div style={{fontSize:10,color:C.muted,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,marginBottom:6}}>DATE RANGE</div>
                          <input type="date" className="inp" style={{marginBottom:6,fontSize:12}} value={customDateFrom} onChange={e=>setCustomDateFrom(e.target.value)} placeholder="From"/>
                          <input type="date" className="inp" style={{marginBottom:8,fontSize:12}} value={customDateTo} onChange={e=>setCustomDateTo(e.target.value)} placeholder="To"/>
                          <button className="btn btn-p btn-sm" style={{width:"100%"}} onClick={()=>setShowPeriodPicker(false)}>Apply</button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
              <button onClick={()=>navigateTo("Smart")} style={{background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",borderRadius:99,padding:"5px 12px",cursor:"pointer",fontSize:11,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700}}>Accounts →</button>
            </div>

            {/* Balance numbers */}
            <div style={{marginBottom:14,position:"relative",zIndex:1}}>
              {/* Main number - cash in hand */}
              <div style={{marginBottom:12}}>
                <div style={{fontSize:10,color:"rgba(255,255,255,0.65)",fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:4,display:"flex",alignItems:"center",gap:6}}>
                  💵 Cash in Hand (Accounts)
                </div>
                <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:32,color:"#fff",letterSpacing:"-0.5px",lineHeight:1}}>{fc(totalAccountBalance)}</div>
                <div style={{fontSize:9,color:"rgba(255,255,255,0.55)",fontFamily:"'Cabinet Grotesk',sans-serif",marginTop:4}}>
                  Actual money across all your bank accounts
                </div>
              </div>
              {/* Secondary stats row */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <div style={{background:"rgba(255,255,255,0.12)",borderRadius:12,padding:"10px 12px"}}>
                  <div style={{fontSize:9,color:"rgba(255,255,255,0.6)",fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,letterSpacing:0.8,textTransform:"uppercase",marginBottom:3}}>{periodLabel} Net</div>
                  <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:16,color:netBal>=0?"#fff":"#ff8fa3"}}>{fc(netBal)}</div>
                  <div style={{fontSize:9,color:"rgba(255,255,255,0.45)",marginTop:2}}>Income − Expenses</div>
                </div>
                <div style={{background:"rgba(255,255,255,0.12)",borderRadius:12,padding:"10px 12px"}}>
                  <div style={{fontSize:9,color:"rgba(255,255,255,0.6)",fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,letterSpacing:0.8,textTransform:"uppercase",marginBottom:3}}>Net Worth</div>
                  <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:16,color:netWorth>=0?"#fff":"#ff8fa3"}}>{fc(netWorth)}</div>
                  <div style={{fontSize:9,color:"rgba(255,255,255,0.45)",marginTop:2}}>Assets − Loans & CCs</div>
                </div>
              </div>
            </div>

            {/* Income / Expense sub-cards */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,position:"relative",zIndex:1}}>
              <div style={{background:"rgba(255,255,255,0.14)",borderRadius:14,padding:"12px 14px"}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                  <div style={{width:22,height:22,borderRadius:99,background:"rgba(0,229,160,0.3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#00e5a0"}}>↑</div>
                  <span style={{fontSize:10,color:"rgba(255,255,255,0.7)",fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700}}>Income</span>
                </div>
                <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:15,color:"#fff"}}>{fc(pInc)}</div>
              </div>
              <div style={{background:"rgba(255,255,255,0.14)",borderRadius:14,padding:"12px 14px"}}>
                <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                  <div style={{width:22,height:22,borderRadius:99,background:"rgba(255,77,109,0.3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#ff4d6d"}}>↓</div>
                  <span style={{fontSize:10,color:"rgba(255,255,255,0.7)",fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700}}>Expenses</span>
                </div>
                <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:15,color:"#fff"}}>{fc(pExp)}</div>
              </div>
            </div>
            {/* Salary Countdown / Credited */}
            {salaryCountdown&&(
              <div style={{marginTop:10,padding:"8px 12px",background:"rgba(255,255,255,0.12)",borderRadius:12,display:"flex",justifyContent:"space-between",alignItems:"center",position:"relative",zIndex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:14}}>{salaryCountdown.alreadyCredited?"✅":"💰"}</span>
                  <span style={{fontSize:11,color:"rgba(255,255,255,0.9)",fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700}}>
                    {salaryCountdown.alreadyCredited
                      ? "Salary credited this month"
                      : salaryCountdown.isToday
                      ? "🎉 Salary Day!"
                      : `Salary in ${salaryCountdown.daysLeft} day${salaryCountdown.daysLeft===1?"":"s"}`
                    }
                  </span>
                </div>
                {salaryCountdown.salAmt>0&&(
                  <span style={{fontSize:12,color:"rgba(255,255,255,0.8)",fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800}}>
                    {fc(salaryCountdown.salAmt)}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* ── DAILY CHECK-IN ── */}
          {(()=>{
            const s = dailyBudget;
            const bgColor = s.status==='comfortable'?C.income:s.status==='careful'?C.warning:C.expense;
            return(
              <div style={{
                marginBottom:14,padding:"14px 16px",borderRadius:16,
                background:`${bgColor}12`,border:`1.5px solid ${bgColor}35`,
                display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12,
              }}>
                <div style={{display:"flex",alignItems:"center",gap:14}}>
                  <div style={{
                    width:52,height:52,borderRadius:14,
                    background:`${bgColor}20`,
                    display:"flex",alignItems:"center",justifyContent:"center",
                    fontSize:26,flexShrink:0,
                  }}>
                    {s.status==='comfortable'?'😊':s.status==='careful'?'🤔':'😬'}
                  </div>
                  <div>
                    <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:22,color:bgColor,lineHeight:1}}>
                      {fc(s.safeToSpend)}
                    </div>
                    <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:12,color:C.text,marginTop:2}}>
                      Safe to spend today
                    </div>
                    <div style={{fontSize:10,color:C.muted,marginTop:1}}>
                      {fc(s.budgetRemaining)} left · {s.daysLeft} day{s.daysLeft!==1?'s':''} remaining this month
                    </div>
                  </div>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:5,alignItems:"flex-end"}}>
                  <div style={{fontSize:11,color:C.muted,display:"flex",gap:4,alignItems:"center"}}>
                    <span>📋</span>
                    <span>Budget used: <span style={{fontWeight:700,color:C.text}}>{s.totalBudgeted>0?`${Math.round((s.nonEmiExpense/s.totalBudgeted)*100)}%`:'—'}</span></span>
                  </div>
                  <div style={{fontSize:11,color:debtProgress?.onTrack!==false?C.income:C.warning,display:"flex",gap:4,alignItems:"center"}}>
                    <span>{debtProgress?.onTrack!==false?'✅':'⚠️'}</span>
                    <span style={{fontWeight:700}}>{debtProgress?.onTrack!==false?'EMIs on track':'EMIs behind'}</span>
                  </div>
                  {(recurringStatus||[]).filter(r=>r.isOverdue).length>0&&(
                    <div style={{fontSize:11,color:C.expense,display:"flex",gap:4,alignItems:"center"}}>
                      <span>🔴</span>
                      <span style={{fontWeight:700}}>{(recurringStatus||[]).filter(r=>r.isOverdue).length} bill{(recurringStatus||[]).filter(r=>r.isOverdue).length>1?'s':''} overdue</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* ── SIP REMINDER ── */}
          {sipStatus.filter(s=>s.isOverdue||s.isDue||s.isUpcoming).length>0&&(
            <div style={{marginBottom:14}}>
              {sipStatus.filter(s=>s.isOverdue||s.isDue||s.isUpcoming).map(sip=>{
                const isUrgent = sip.isOverdue||sip.isDue;
                const col = sip.isOverdue?C.expense:sip.isDue?C.income:C.accent;
                return(
                  <div key={sip.id} style={{
                    padding:"12px 14px",borderRadius:14,marginBottom:8,
                    background:`${col}10`,border:`1.5px solid ${col}35`,
                    display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap",
                  }}>
                    <div style={{display:"flex",alignItems:"center",gap:10,flex:1,minWidth:0}}>
                      <div style={{width:38,height:38,borderRadius:11,background:`${col}20`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>📈</div>
                      <div style={{minWidth:0}}>
                        <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:13,color:C.text}}>{sip.name} SIP</div>
                        <div style={{fontSize:10,color:col,fontWeight:700,marginTop:1}}>
                          {sip.isOverdue
                            ? `⚠️ Overdue — was due ${sip.sipDay}th this month`
                            : sip.isDue
                            ? `🔔 Due today! (${sip.sipDay}th)`
                            : sip.alreadyDone
                            ? `✅ Done this month · Next: ${sip.nextSIPDate?.toLocaleDateString('en-IN',{day:'numeric',month:'short'})}`
                            : `📅 Due in ${sip.daysDisplay} day${sip.daysDisplay!==1?'s':''} (${sip.sipDay}th)`
                          }
                        </div>
                        {sip.account&&<div style={{fontSize:9,color:C.muted,marginTop:1}}>from {sip.account.name} · {fc(parseFloat(sip.account.balance)||0)} available</div>}
                      </div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:15,color:col}}>{fc(sip.sipAmt)}</div>
                        <div style={{fontSize:9,color:C.muted}}>/month</div>
                      </div>
                      {isUrgent&&(
                        <button className="btn btn-p btn-sm" style={{flexShrink:0,background:col,borderColor:col}}
                          onClick={()=>processSIP(sip)}>
                          ✓ Process
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── LOAN-TO-INCOME RATIO ── */}
          {tab==="Dashboard"&&loanToIncome&&(
            <div style={{marginBottom:14,padding:"12px 16px",borderRadius:14,background:`${loanToIncome.color}10`,border:`1.5px solid ${loanToIncome.color}35`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
                <div>
                  <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:11,color:C.muted,marginBottom:4,textTransform:"uppercase",letterSpacing:0.8}}>EMI-to-Income Ratio</div>
                  <div style={{display:"flex",alignItems:"baseline",gap:8}}>
                    <span style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:26,color:loanToIncome.color}}>{loanToIncome.ratio.toFixed(0)}%</span>
                    <span style={{fontSize:11,color:loanToIncome.color,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700}}>{loanToIncome.label}</span>
                  </div>
                  <div style={{fontSize:10,color:C.muted,marginTop:2}}>₹{fc(loanToIncome.totalEMI)}/mo EMIs on ₹{fc(loanToIncome.inc)} income · RBI safe limit: 40%</div>
                </div>
                <div style={{minWidth:100}}>
                  <div style={{height:8,background:C.border,borderRadius:99,overflow:"hidden",marginBottom:4}}>
                    <div style={{height:"100%",width:`${Math.min(100,loanToIncome.ratio)}%`,background:`linear-gradient(90deg,#00e5a0,#f59e0b,#ff4d6d)`,borderRadius:99}}/>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:8,color:C.muted}}>
                    <span>0%</span><span>40%</span><span>100%</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── FAMILY CONTRIBUTION ALERT ── */}
          {familyCapStatus.cap>0&&(
            <div style={{marginBottom:14,padding:"12px 16px",borderRadius:14,background:familyCapStatus.over?`${C.expense}10`:`${C.accent}08`,border:`1.5px solid ${familyCapStatus.over?C.expense:C.accent}35`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,flexWrap:"wrap",gap:4}}>
                <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:12,color:C.text}}>
                  👨‍👩‍👧 Family Contribution {familyCapStatus.over?'⚠️ Over Limit':'This Month'}
                </div>
                <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:13,color:familyCapStatus.over?C.expense:C.text}}>
                  {fc(familyCapStatus.spent)} <span style={{fontSize:10,color:C.muted,fontWeight:400}}>of {fc(familyCapStatus.cap)}</span>
                </div>
              </div>
              <div style={{height:6,background:C.border,borderRadius:99,overflow:"hidden",marginBottom:4}}>
                <div style={{height:"100%",width:`${familyCapStatus.pct}%`,background:familyCapStatus.over?C.expense:C.accent,borderRadius:99}}/>
              </div>
              {familyCapStatus.over
                ? <div style={{fontSize:10,color:C.expense,fontWeight:700}}>Over by {fc(familyCapStatus.spent-familyCapStatus.cap)} this month</div>
                : <div style={{fontSize:10,color:C.muted}}>{fc(familyCapStatus.remaining)} remaining this month</div>
              }
            </div>
          )}

          {/* ── QUICK ACCESS GRID ── */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:14}}>
            {[
              {icon:"📋",label:"Txns",      tab:"Transactions"},
              {icon:"🎯",label:"Budget",    tab:"Budget"},
              {icon:"💳",label:"Cards",     tab:"Cards"},
              {icon:"📊",label:"Plan",      tab:"Plan"},
              {icon:"🔍",label:"Insights",  tab:"Insights"},
              {icon:"⚡",label:"Smart",     tab:"Smart"},
              {icon:"💸",label:"Circles",   tab:"Circles"},
              {icon:"⬆",label:"Import",    action:()=>setShowImport(true)},
              {icon:"⬇",label:"Export",    action:exportTransactions},
            ].map(item=>(
              <button key={item.label}
                onClick={()=>item.action?item.action():navigateTo(item.tab)}
                style={{
                  display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                  gap:4,padding:"10px 4px",borderRadius:14,
                  background:item.tab&&tab===item.tab?C.purpleDim:C.card,
                  border:`1px solid ${item.tab&&tab===item.tab?C.purple+"60":C.border}`,
                  cursor:"pointer",transition:"all 0.15s",
                }}>
                <span style={{fontSize:20}}>{item.icon}</span>
                <span style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:9,color:item.tab&&tab===item.tab?C.purple:C.muted,letterSpacing:0.3}}>{item.label}</span>
              </button>
            ))}
          </div>

          {/* ── 2. THIS MONTH PAYMENT SUMMARY ── */}
          {(totalEMI>0||creditCards.length>0)&&(()=>{
            const totalLoanEMI   = totalEMI;
            const totalCCBill    = totalCCOut;
            const grandTotal     = totalLoanEMI + totalCCBill;
            const paidLoans      = thisMonthTx.filter(t=>t.category==="Loan EMI").reduce((s,t)=>s+(parseFloat(t.amount)||0),0);
            const paidCC         = thisMonthTx.filter(t=>t.category==="Credit Card Bill").reduce((s,t)=>s+(parseFloat(t.amount)||0),0);
            const totalPaid      = paidLoans + paidCC;
            const remaining      = Math.max(0, grandTotal - totalPaid);
            const paidPct        = grandTotal>0 ? Math.min(100,(totalPaid/grandTotal)*100) : 0;
            const nearestDue     = [
              ...activeDebts.filter(d=>d.dueDate).map(d=>({name:d.name, days:daysUntil(d.dueDate), amt:parseFloat(d.emi)||0, kind:"loan"})),
              ...creditCards.filter(c=>c.dueDate&&parseFloat(c.outstanding)>0).map(c=>({name:c.name, days:daysUntil(c.dueDate), amt:parseFloat(c.outstanding)||0, kind:"cc"})),
            ].filter(x=>x.days!==null).sort((a,b)=>a.days-b.days)[0];
            const statusColor = remaining===0?C.income:nearestDue&&nearestDue.days<=3?C.expense:nearestDue&&nearestDue.days<=7?C.warning:C.loan;
            return(
              <div className="card" style={{marginBottom:14,borderColor:`${statusColor}35`}}>
                <div className="sec-hdr">
                  <div className="sec-hdr-title">💳 Loans & CC Bills</div>
                  <button className="sec-hdr-more" onClick={()=>navigateTo("Plan")}>Manage →</button>
                </div>

                {/* Grand total + remaining */}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14,flexWrap:"wrap",gap:8}}>
                  <div>
                    <div style={{fontSize:9,color:C.muted,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>Total to Pay This Month</div>
                    <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:26,color:C.loan,letterSpacing:"-0.5px",lineHeight:1}}>{fc(grandTotal)}</div>
                    <div style={{fontSize:10,color:C.muted,marginTop:3}}>
                      {activeDebts.length} loan{activeDebts.length!==1?"s":""} · {creditCards.length} credit card{creditCards.length!==1?"s":""}
                    </div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    {remaining===0
                      ? <div style={{background:`${C.income}18`,border:`1px solid ${C.income}40`,borderRadius:12,padding:"8px 14px",textAlign:"center"}}>
                          <div style={{fontSize:18}}>🎉</div>
                          <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:12,color:C.income}}>All Paid!</div>
                        </div>
                      : <div style={{background:`${C.loan}10`,border:`1px solid ${C.loan}30`,borderRadius:12,padding:"8px 14px",textAlign:"right"}}>
                          <div style={{fontSize:9,color:C.muted,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:2}}>Still to Pay</div>
                          <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:16,color:statusColor}}>{fc(remaining)}</div>
                        </div>
                    }
                  </div>
                </div>

                {/* Progress bar */}
                {grandTotal>0&&(
                  <div style={{marginBottom:14}}>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:C.muted,marginBottom:5}}>
                      <span>Paid: <span style={{color:C.income,fontWeight:700}}>{fc(totalPaid)}</span></span>
                      <span style={{fontWeight:700,color:paidPct===100?C.income:C.muted}}>{paidPct.toFixed(0)}% done</span>
                    </div>
                    <div className="pbar" style={{height:8}}>
                      <div className="pfill" style={{width:`${paidPct}%`,background:paidPct===100?C.income:C.loan}}/>
                    </div>
                  </div>
                )}

                {/* 2-column summary */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
                  {/* Loan EMIs */}
                  <div style={{background:C.surface,borderRadius:14,padding:"14px 12px",border:`1px solid ${C.loan}30`}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                      <span style={{fontSize:18}}>🏦</span>
                      <div style={{fontSize:10,color:C.muted,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,letterSpacing:0.5,textTransform:"uppercase"}}>Loan EMIs</div>
                    </div>
                    <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:20,color:C.loan,marginBottom:2}}>{fc(totalLoanEMI)}</div>
                    <div style={{fontSize:10,color:C.muted}}>{activeDebts.length} active loan{activeDebts.length!==1?"s":""}</div>
                    <div style={{fontSize:10,color:C.income,marginTop:4,fontWeight:700}}>Paid: {fc(paidLoans)}</div>
                  </div>
                  {/* CC Bills */}
                  <div style={{background:C.surface,borderRadius:14,padding:"14px 12px",border:`1px solid ${C.credit}30`}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                      <span style={{fontSize:18}}>💳</span>
                      <div style={{fontSize:10,color:C.muted,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,letterSpacing:0.5,textTransform:"uppercase"}}>CC Bills</div>
                    </div>
                    <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:20,color:C.credit,marginBottom:2}}>{fc(totalCCBill)}</div>
                    <div style={{fontSize:10,color:C.muted}}>{creditCards.length} card{creditCards.length!==1?"s":""}  outstanding</div>
                    <div style={{fontSize:10,color:C.income,marginTop:4,fontWeight:700}}>Paid: {fc(paidCC)}</div>
                  </div>
                </div>

                {/* Individual loan rows */}
                {activeDebts.length>0&&(
                  <div style={{marginBottom:10}}>
                    <div className="lbl" style={{marginBottom:6}}>LOAN EMIs DUE</div>
                    <div style={{display:"flex",flexDirection:"column",gap:6}}>
                      {activeDebts.slice(0,3).map(d=>{
                        const days=daysUntil(d.dueDate);
                        const isPaid = paidThisMonth.loanPaid.has(d.id);
                        const dc=isPaid?C.income:days!==null&&days<0?C.expense:days!==null&&days<=3?C.warning:C.loan;
                        return(
                          <div key={d.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 12px",background:isPaid?`${C.income}08`:C.surface,borderRadius:10,border:`1px solid ${dc}25`}}>
                            <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
                              <div style={{width:8,height:8,borderRadius:"50%",background:dc,flexShrink:0}}/>
                              <div style={{minWidth:0}}>
                                <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:12}}>{d.name}</div>
                                <div style={{fontSize:10,color:C.muted,display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                                  <span>{d.lender}</span>
                                  {isPaid
                                    ? <span style={{color:C.income,fontWeight:700}}>✅ Paid this month</span>
                                    : days!==null&&<span style={{color:dc,fontWeight:700}}>{days<0?`${Math.abs(days)}d overdue`:days===0?"Due today!":days===1?"Due tomorrow":`Due in ${days}d`}</span>
                                  }
                                </div>
                              </div>
                            </div>
                            <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                              <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:13,color:dc}}>{fc(parseFloat(d.emi)||0)}</div>
                              {!isPaid&&<button className="btn btn-p btn-sm" style={{padding:"5px 10px",fontSize:10}} onClick={()=>{
                                const emiAmt=parseFloat(d.emi)||0;
                                if(!emiAmt) return;
                                const now=new Date();
                                const key=`emi_${d.id}_${now.getFullYear()}_${now.getMonth()}`;
                                const alreadyPaid=transactions.some(t=>t._emiKey===key);
                                if(alreadyPaid){alert(`${d.name} EMI already recorded this month`);return;}
                                recordLoanPayment(d.id,emiAmt,key);
                              }}>Pay</button>}
                            </div>
                          </div>
                        );
                      })}
                      {activeDebts.length>3&&<div style={{fontSize:11,color:C.purple,textAlign:"center",cursor:"pointer",fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,marginTop:4}} onClick={()=>navigateTo("Plan")}>+{activeDebts.length-3} more loans →</div>}
                    </div>
                  </div>
                )}

                {/* CC bill rows — per card */}
                {creditCards.filter(c=>parseFloat(c.outstanding)>0).length>0&&(
                  <div style={{marginBottom:10}}>
                    <div className="lbl" style={{marginBottom:6}}>CREDIT CARD BILLS DUE</div>
                    <div style={{display:"flex",flexDirection:"column",gap:6}}>
                      {creditCards.filter(c=>parseFloat(c.outstanding)>0).slice(0,3).map(cc=>{
                        const days=daysUntil(cc.dueDate);
                        const isPaid = paidThisMonth.ccPaid.has(cc.id);
                        const dc=isPaid?C.income:days!==null&&days<0?C.expense:days!==null&&days<=3?C.warning:C.credit;
                        const out=parseFloat(cc.outstanding)||0;
                        const util=Math.min(100,(out/(parseFloat(cc.limit)||1))*100);
                        return(
                          <div key={cc.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 12px",background:isPaid?`${C.income}08`:C.surface,borderRadius:10,border:`1px solid ${dc}25`}}>
                            <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
                              <div style={{width:8,height:8,borderRadius:"50%",background:dc,flexShrink:0}}/>
                              <div style={{minWidth:0}}>
                                <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:12}}>{cc.name} · {cc.bank}</div>
                                <div style={{fontSize:10,color:C.muted,display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                                  <span>{util.toFixed(0)}% used</span>
                                  {isPaid
                                    ? <span style={{color:C.income,fontWeight:700}}>✅ Paid this month</span>
                                    : days!==null&&<span style={{color:dc,fontWeight:700}}>{days<0?`${Math.abs(days)}d overdue`:days===0?"Due today!":days===1?"Due tomorrow":`Due in ${days}d`}</span>
                                  }
                                </div>
                              </div>
                            </div>
                            <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                              <div style={{textAlign:"right"}}>
                                <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:13,color:dc}}>{fc(out)}</div>
                                <div style={{fontSize:9,color:C.muted}}>full bill</div>
                              </div>
                              {!isPaid&&<button className="btn btn-p btn-sm" style={{padding:"5px 10px",fontSize:10}} onClick={()=>{
                                const v=prompt(`Pay how much for ${cc.name}?\nFull bill: ${fc(out)}`);
                                const n=parseFloat(v);
                                if(!isNaN(n)&&n>0) recordCCPayment(cc.id,n);
                              }}>Pay</button>}
                            </div>
                          </div>
                        );
                      })}
                      {creditCards.filter(c=>parseFloat(c.outstanding)>0).length>3&&
                        <div style={{fontSize:11,color:C.purple,textAlign:"center",cursor:"pointer",fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,marginTop:4}} onClick={()=>navigateTo("Cards")}>+{creditCards.filter(c=>parseFloat(c.outstanding)>0).length-3} more cards →</div>}
                    </div>
                  </div>
                )}

                {/* Nearest due alert */}
                {nearestDue&&remaining>0&&(
                  <div style={{padding:"10px 12px",background:nearestDue.days!==null&&nearestDue.days<=3?`${C.expense}10`:nearestDue.days!==null&&nearestDue.days<=7?`${C.warning}10`:`${C.loan}10`,borderRadius:10,border:`1px solid ${nearestDue.days!==null&&nearestDue.days<=3?C.expense:nearestDue.days!==null&&nearestDue.days<=7?C.warning:C.loan}25`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:12,color:nearestDue.days!==null&&nearestDue.days<=3?C.expense:nearestDue.days!==null&&nearestDue.days<=7?C.warning:C.loan}}>
                        {nearestDue.days!==null&&nearestDue.days<0?"🚨 Overdue":nearestDue.days===0?"🔴 Due Today":nearestDue.days===1?"⚠️ Due Tomorrow":`📅 Next due in ${nearestDue.days} days`}
                      </div>
                      <div style={{fontSize:10,color:C.muted,marginTop:2}}>{nearestDue.name} · {nearestDue.kind==="loan"?"Loan EMI":"CC Bill"}</div>
                    </div>
                    <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:14,color:nearestDue.days!==null&&nearestDue.days<=3?C.expense:nearestDue.days!==null&&nearestDue.days<=7?C.warning:C.loan}}>{fc(nearestDue.amt)}</div>
                  </div>
                )}

                <button className="btn btn-p btn-sm" style={{width:"100%",marginTop:12}} onClick={()=>navigateTo("Plan")}>
                  📊 Manage Loans & Payoff Plan →
                </button>
              </div>
            );
          })()}

                    {/* ── NO-SPEND STREAK ── */}
          {noSpendStreak.streak > 0 || noSpendStreak.zeroThisMonth > 0 ? (
            <div style={{marginBottom:14,padding:"14px 16px",borderRadius:16,background:noSpendStreak.streak>=3?`${C.income}12`:`${C.surface}`,border:`1px solid ${noSpendStreak.streak>=3?C.income+"40":C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <div style={{fontSize:28}}>{noSpendStreak.streak>=7?"🏆":noSpendStreak.streak>=3?"🔥":"🟢"}</div>
                <div>
                  <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:14,color:noSpendStreak.streak>=3?C.income:C.text}}>
                    {noSpendStreak.streak>=1?`${noSpendStreak.streak}-Day No-Spend Streak!`:"No-Spend Tracker"}
                  </div>
                  <div style={{fontSize:11,color:C.muted,marginTop:2}}>
                    🟢 {noSpendStreak.zeroThisMonth} zero-spend days this month · 🏆 Best ever: {noSpendStreak.best} days
                  </div>
                </div>
              </div>
              {noSpendStreak.streak>=3&&<div style={{background:`${C.income}20`,borderRadius:99,padding:"4px 12px",fontSize:11,color:C.income,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700}}>Keep going! 💪</div>}
            </div>
          ) : (
            <div style={{marginBottom:14,padding:"12px 16px",borderRadius:16,background:C.surface,border:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:20}}>🟢</span>
              <div>
                <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:13,color:C.text}}>Start a No-Spend Streak!</div>
                <div style={{fontSize:11,color:C.muted}}>A day with zero expenses = 🔥 streak. Try it today!</div>
              </div>
            </div>
          )}

          {/* ── 2. OVERALL SPENDING OVERVIEW ── */}
          <div className="card" style={{marginBottom:14}}>
            <div className="sec-hdr">
              <div className="sec-hdr-title">📊 Spending Overview</div>
              <button className="sec-hdr-more" onClick={()=>navigateTo("Insights")}>Details →</button>
            </div>
            {/* 4 stat boxes */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
              {[
                {label:"Income",      val:fc(pInc),              color:C.income},
                {label:"Expenses",    val:fc(pExp),              color:C.expense},
                {label:"EMIs",        val:fc(pEMI),              color:C.loan},
                {label:"Net Balance", val:fc(netBal),            color:netBal>=0?C.income:C.expense},
              ].map(item=>(
                <div key={item.label} style={{background:C.surface,borderRadius:14,padding:"12px 14px",border:`1px solid ${C.border}`}}>
                  <div className="lbl">{item.label}</div>
                  <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:16,color:item.color}}>{item.val}</div>
                </div>
              ))}
            </div>
            {/* Top categories mini */}
            {expenseByCat.length>0&&(
              <div>
                <div className="lbl" style={{marginBottom:8}}>Top Spending Categories</div>
                <div style={{display:"flex",flexDirection:"column",gap:7}}>
                  {[...expenseByCat].sort((a,b)=>b.value-a.value).slice(0,4).map((d,i)=>{
                    const max=expenseByCat.reduce((m,x)=>Math.max(m,x.value),0);
                    return(
                      <div key={d.name}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <div style={{width:8,height:8,borderRadius:"50%",background:d.color,flexShrink:0}}/>
                            <span style={{fontSize:11,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:600,color:C.text}}>{d.name}</span>
                          </div>
                          <span style={{fontSize:11,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,color:C.text}}>{fc(d.value)}</span>
                        </div>
                        <div className="pbar"><div className="pfill" style={{width:`${(d.value/max)*100}%`,background:d.color}}/></div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {expenseByCat.length===0&&(
              <div style={{textAlign:"center",padding:"16px 0",color:C.muted,fontSize:12}}>
                💡 No spending data for this period
              </div>
            )}
            {/* Budget alerts inline */}
            {spendAlerts.length>0&&(
              <div style={{marginTop:12,padding:"10px 12px",background:`${C.expense}08`,borderRadius:12,border:`1px solid ${C.expense}25`}}>
                <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:12,color:C.expense,marginBottom:6}}>🚨 Budget Alerts</div>
                {spendAlerts.slice(0,3).map(a=>(
                  <div key={a.cat} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                    <span style={{fontSize:11,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:600}}>{a.cat}</span>
                    <span className="tag" style={{background:a.over?`${C.expense}20`:`${C.warning}20`,color:a.over?C.expense:C.warning}}>{a.over?"Over!":a.pct+"%"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── 3. RECENT TRANSACTIONS ── */}
          <div className="card" style={{marginBottom:14}}>
            <div className="sec-hdr">
              <div className="sec-hdr-title">🧾 Recent Transactions</div>
              <button className="sec-hdr-more" onClick={()=>navigateTo("Transactions")}>View All →</button>
            </div>
            {transactions.length===0
              ? <div style={{textAlign:"center",padding:"24px 0",color:C.muted,fontSize:12}}>
                  <div style={{fontSize:32,marginBottom:8}}>📝</div>
                  No transactions yet.<br/>
                  <span style={{color:C.purple,cursor:"pointer",fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700}} onClick={()=>{setTxForm({...EMPTY_TX});setEditTxId(null);setShowTxForm(true);}}>+ Add your first entry</span>
                </div>
              : transactions.slice(0,6).map(t=>(
                <div key={t.id} className="row">
                  <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0}}>
                    <div style={{width:38,height:38,borderRadius:12,background:(t.type==="income"?C.income:t.type==="transfer"?C.accent:C.expense)+"16",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:15,fontWeight:700,color:t.type==="income"?C.income:t.type==="transfer"?C.accent:C.expense}}>{t.type==="income"?"↑":t.type==="transfer"?"↔":"↓"}</div>
                    <div style={{minWidth:0}}>
                      <div style={{fontSize:13,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,marginBottom:2}}>{t.category}</div>
                      <div style={{fontSize:10,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"flex",gap:6,alignItems:"center"}}>
                        {t.paymentMode&&<span style={{background:C.surface,borderRadius:6,padding:"1px 6px",border:`1px solid ${C.border}`,fontSize:9}}>{t.paymentMode}</span>}
                        <span>{fd(t.date)}</span>
                        {t.note&&<span>· {t.note}</span>}
                      </div>
                    </div>
                  </div>
                  <span style={{color:t.type==="income"?C.income:t.type==="transfer"?C.accent:C.expense,fontWeight:800,fontSize:13,flexShrink:0,fontFamily:"'Cabinet Grotesk',sans-serif"}}>{t.type==="income"?"+":t.type==="transfer"?"↔":"−"}{fc(t.amount)}</span>
                </div>
              ))
            }
          </div>

          {/* ── 4. BUDGET OVERVIEW ── */}
          <div className="card" style={{marginBottom:14}}>
            <div className="sec-hdr">
              <div className="sec-hdr-title">🎯 Budget Overview</div>
              <button className="sec-hdr-more" onClick={()=>navigateTo("Budget")}>Manage →</button>
            </div>
            {Object.keys(budgets).length===0
              ? <div style={{textAlign:"center",padding:"16px 0",color:C.muted,fontSize:12}}>
                  <div style={{fontSize:28,marginBottom:6}}>📊</div>
                  No budgets set.<br/>
                  <span style={{color:C.purple,cursor:"pointer",fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700}} onClick={()=>navigateTo("Budget")}>Set monthly limits →</span>
                </div>
              : <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {allCategories.expense
                    .filter(cat=>budgets[cat])
                    .slice(0,5)
                    .map((cat,i)=>{
                      const limit=budgets[cat]||0;
                      const spent=thisMonthTx.filter(t=>t.type==="expense"&&t.category===cat).reduce((s,t)=>s+(parseFloat(t.amount)||0),0);
                      const pct=limit>0?Math.min(100,(spent/limit)*100):0;
                      const over=spent>limit&&limit>0;
                      const barColor=over?C.expense:pct>80?C.warning:CAT_COLORS[i%CAT_COLORS.length];
                      return(
                        <div key={cat}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                            <div style={{display:"flex",alignItems:"center",gap:7}}>
                              <div style={{width:8,height:8,borderRadius:"50%",background:barColor}}/>
                              <span style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:600,fontSize:12,color:C.text}}>{cat}</span>
                              {over&&<span className="tag" style={{background:`${C.expense}15`,color:C.expense,fontSize:9}}>Over!</span>}
                            </div>
                            <div style={{fontSize:11,color:C.muted,fontFamily:"'Cabinet Grotesk',sans-serif"}}>
                              <span style={{color:barColor,fontWeight:700}}>{fc(spent)}</span> / {fc(limit)}
                            </div>
                          </div>
                          <div className="pbar"><div className="pfill" style={{width:`${pct}%`,background:barColor}}/></div>
                        </div>
                      );
                    })
                  }
                  {Object.keys(budgets).length>5&&(
                    <div style={{textAlign:"center",fontSize:11,color:C.purple,cursor:"pointer",fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700}} onClick={()=>navigateTo("Budget")}>
                      +{Object.keys(budgets).length-5} more budgets →
                    </div>
                  )}
                </div>
            }
          </div>

          {/* ── 5. ALL ACCOUNTS BALANCE ── */}
          <div className="card" style={{marginBottom:14}}>
            <div className="sec-hdr">
              <div className="sec-hdr-title">🏦 All Accounts</div>
              <button className="sec-hdr-more" onClick={()=>navigateTo("Smart")}>Manage →</button>
            </div>
            {accounts.length===0
              ? <div style={{textAlign:"center",padding:"16px 0",color:C.muted,fontSize:12}}>
                  <div style={{fontSize:28,marginBottom:6}}>🏦</div>
                  No accounts added yet.<br/>
                  <span style={{color:C.purple,cursor:"pointer",fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700}} onClick={()=>navigateTo("Smart")}>+ Add account →</span>
                </div>
              : <>
                  <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:10}}>
                    {accounts.map(a=>{
                      const bal=parseFloat(a.balance)||0;
                      return(
                        <div key={a.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 12px",background:C.surface,borderRadius:12,border:`1px solid ${C.border}`}}>
                          <div style={{display:"flex",alignItems:"center",gap:10}}>
                            <div style={{width:38,height:38,borderRadius:11,background:`${a.color||C.purple}18`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{a.icon||"🏦"}</div>
                            <div>
                              <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:13,color:C.text}}>{a.name}</div>
                              <div style={{fontSize:10,color:C.muted,textTransform:"capitalize"}}>{a.type}{a.bank?` · ${a.bank}`:""}</div>
                            </div>
                          </div>
                          <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:15,color:bal>=0?C.income:C.expense}}>{fc(bal)}</div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Total bar */}
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",background:`${C.purple}12`,borderRadius:12,border:`1px solid ${C.purple}25`}}>
                    <span style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:13,color:C.purple}}>Total Balance</span>
                    <span style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:18,color:C.purple}}>{fc(totalAccountBalance)}</span>
                  </div>
                </>
            }
            {/* Credit cards quick view */}
            {creditCards.length>0&&(
              <div style={{marginTop:12,paddingTop:12,borderTop:`1px solid ${C.border}`}}>
                <div className="lbl" style={{marginBottom:8}}>Credit Cards</div>
                {creditCards.map(cc=>{
                  const out=parseFloat(cc.outstanding)||0;
                  const lim=parseFloat(cc.limit)||1;
                  const util=Math.min(100,(out/lim)*100);
                  const uc=util>=75?C.expense:util>=40?C.warning:C.income;
                  return(
                    <div key={cc.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px",background:C.surface,borderRadius:10,border:`1px solid ${uc}25`,marginBottom:6}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontSize:16}}>💳</span>
                        <div>
                          <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:12}}>{cc.name}</div>
                          <div style={{fontSize:10,color:C.muted}}>{util.toFixed(0)}% used</div>
                        </div>
                      </div>
                      <span style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:13,color:uc}}>{fc(out)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── 6. DUES & REMINDERS ── */}
          <div className="card" style={{marginBottom:14}}>
            <div className="sec-hdr">
              <div className="sec-hdr-title">🔔 Dues & Reminders</div>
              <button className="sec-hdr-more" onClick={()=>navigateTo("Cards")}>View All →</button>
            </div>
            {/* Cash Gap Alert */}
            {cashGap.hasCashGap&&(
              <div onClick={()=>navigateTo("Circles")} style={{
                marginBottom:12,padding:"12px 14px",borderRadius:12,cursor:"pointer",
                background:`${C.warning}12`,border:`1px solid ${C.warning}40`,
              }}>
                <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:13,color:C.warning,marginBottom:3}}>
                  ⚠️ Cash Gap Detected!
                </div>
                <div style={{fontSize:11,color:C.muted,lineHeight:1.6}}>
                  Bills of <span style={{color:C.expense,fontWeight:700}}>{fc(cashGap.totalBillsDue)}</span> due before salary in <span style={{color:C.text,fontWeight:700}}>{cashGap.daysToSal} days</span>. You may need <span style={{color:C.warning,fontWeight:700}}>{fc(cashGap.gap)}</span> more. Tap to manage →
                </div>
              </div>
            )}
            {/* Money Circles summary if any pending */}
            {circleStats.totalOwed>0&&(
              <div onClick={()=>navigateTo("Circles")} style={{
                marginBottom:12,padding:"10px 14px",borderRadius:12,cursor:"pointer",
                background:`${C.expense}08`,border:`1px solid ${C.expense}25`,
                display:"flex",justifyContent:"space-between",alignItems:"center",
              }}>
                <div>
                  <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:12,color:C.expense}}>💸 You owe money</div>
                  <div style={{fontSize:11,color:C.muted}}>{circleStats.borrowed.length} person{circleStats.borrowed.length>1?"s":""} · {fc(circleStats.totalOwed)} total</div>
                </div>
                <span style={{fontSize:11,color:C.muted}}>View →</span>
              </div>
            )}
            {circleStats.totalToGet>0&&(
              <div onClick={()=>navigateTo("Circles")} style={{
                marginBottom:12,padding:"10px 14px",borderRadius:12,cursor:"pointer",
                background:`${C.income}08`,border:`1px solid ${C.income}25`,
                display:"flex",justifyContent:"space-between",alignItems:"center",
              }}>
                <div>
                  <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:12,color:C.income}}>💰 You'll receive money</div>
                  <div style={{fontSize:11,color:C.muted}}>{circleStats.lent.length} person{circleStats.lent.length>1?"s":""} · {fc(circleStats.totalToGet)} total</div>
                </div>
                <span style={{fontSize:11,color:C.muted}}>View →</span>
              </div>
            )}
            {/* 15-day stress banner */}
            {next15Days.dues.length>0&&(
              <div style={{
                marginBottom:12,padding:"10px 14px",borderRadius:12,
                background:next15Days.status==="safe"?`${C.income}10`:next15Days.status==="tight"?`${C.warning}10`:`${C.expense}10`,
                border:`1px solid ${next15Days.status==="safe"?C.income:next15Days.status==="tight"?C.warning:C.expense}30`,
                display:"flex",justifyContent:"space-between",alignItems:"center",
              }}>
                <div>
                  <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:12,color:next15Days.status==="safe"?C.income:next15Days.status==="tight"?C.warning:C.expense}}>
                    {next15Days.status==="safe"?"✅ All clear":next15Days.status==="tight"?"⚠️ Tight ahead":"🚨 High risk"} · Next 15 days
                  </div>
                  <div style={{fontSize:10,color:C.muted}}>{fc(next15Days.totalDue)} due · Balance {fc(next15Days.balance)}</div>
                </div>
                <span style={{fontSize:10,color:C.muted}}>View →</span>
              </div>
            )}
            {upcomingDues.length===0
              ? <div style={{textAlign:"center",padding:"16px 0",color:C.muted,fontSize:12}}>
                  <div style={{fontSize:28,marginBottom:6}}>🎉</div>
                  No dues right now!<br/>Add loans or credit cards to track.
                </div>
              : <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {upcomingDues.slice(0,6).map((d,i)=>{
                    const isPaid = d.kind==="loan"
                      ? paidThisMonth.loanPaid.has(d.id)
                      : paidThisMonth.ccPaid.has(d.id);
                    const isOverdue = !isPaid && (d.days??0)<0;
                    const isUrgent  = !isPaid && (d.days??99)<=3 && (d.days??99)>=0;
                    const dueColor  = isPaid ? C.income : isOverdue ? C.expense : isUrgent ? C.warning : C.muted;
                    return(
                      <div key={i} style={{
                        display:"flex",justifyContent:"space-between",alignItems:"center",
                        padding:"10px 12px",
                        background:isPaid?`${C.income}08`:C.surface,
                        borderRadius:12,
                        border:`1px solid ${dueColor}25`,
                        opacity: isPaid ? 0.85 : 1,
                      }}>
                        <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0}}>
                          <div style={{width:36,height:36,borderRadius:10,background:`${dueColor}15`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>
                            {isPaid ? "✅" : d.kind==="loan" ? "🏦" : "💳"}
                          </div>
                          <div style={{minWidth:0}}>
                            <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:12,color:C.text}}>{d.name}</div>
                            {isPaid
                              ? <span style={{fontSize:10,color:C.income,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700}}>✅ Paid this month</span>
                              : <DueBadge days={d.days} dueDate={d.dueDate}/>
                            }
                          </div>
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                          <div style={{textAlign:"right"}}>
                            <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:13,color:isPaid?C.income:d.kind==="loan"?C.loan:C.credit}}>
                              {fc(parseFloat(d.emi||d.minDue||0))}
                            </div>
                            <div style={{fontSize:9,color:C.muted,textTransform:"uppercase",letterSpacing:0.5}}>{d.kind==="loan"?"EMI":"Min Due"}</div>
                          </div>
                          {/* Quick Pay button — only if not paid */}
                          {!isPaid&&(
                            <button className="btn btn-p btn-sm" style={{padding:"5px 10px",fontSize:10,flexShrink:0}}
                              onClick={()=>{
                                if(d.kind==="loan"){
                                  const emiAmt=parseFloat(d.emi)||0;
                                  if(!emiAmt)return;
                                  const now=new Date();
                                  const key=`emi_${d.id}_${now.getFullYear()}_${now.getMonth()}`;
                                  if(transactions.some(t=>t._emiKey===key)){alert(`${d.name} EMI already recorded`);return;}
                                  recordLoanPayment(d.id,emiAmt,key);
                                } else {
                                  const v=prompt(`Pay how much for ${d.name}?\nFull bill: ${fc(parseFloat(d.outstanding||d.minDue)||0)}`);
                                  const n=parseFloat(v);
                                  if(!isNaN(n)&&n>0) recordCCPayment(d.id,n);
                                }
                              }}>Pay</button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {upcomingDues.length>6&&(
                    <div style={{textAlign:"center",fontSize:11,color:C.purple,cursor:"pointer",fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700}} onClick={()=>navigateTo("Cards")}>
                      +{upcomingDues.length-6} more dues →
                    </div>
                  )}
                </div>
            }
          </div>

          </>;
        })()}

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

          {/* ── DEBT PROGRESS TRACKER ── */}
          {(totalOutstanding + totalCCOut) > 0 && (
          <div className="card" style={{marginBottom:12}}>
            {/* Header */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16,flexWrap:"wrap",gap:8}}>
              <div>
                <div className="stitle" style={{marginBottom:2}}>📉 Debt Progress</div>
                <div style={{fontSize:11,color:C.muted}}>How your debt is reducing over time</div>
              </div>
              {debtProgress.onTrack !== null && (
                <div style={{
                  padding:"6px 14px",borderRadius:99,
                  background: debtProgress.onTrack ? `${C.income}18` : `${C.warning}18`,
                  color: debtProgress.onTrack ? C.income : C.warning,
                  fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:12,
                }}>
                  {debtProgress.onTrack ? "✅ On Track" : "⚠️ Behind Plan"}
                </div>
              )}
            </div>

            {/* This month reduction */}
            <div style={{
              padding:"14px 16px",borderRadius:14,marginBottom:14,
              background:`${C.income}08`,border:`1px solid ${C.income}25`,
            }}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                {[
                  {label:"Paid This Month", val:fc(debtProgress.totalPaidThisMonth), color:C.income, icon:"💸"},
                  {label:"Planned EMIs", val:fc(debtProgress.plannedThisMonth), color:C.loan, icon:"📋"},
                  {label:"Still to Pay", val:fc(debtProgress.remaining), color:debtProgress.remaining>0?C.warning:C.income, icon:debtProgress.remaining>0?"⏳":"✅"},
                ].map(item=>(
                  <div key={item.label} style={{textAlign:"center"}}>
                    <div style={{fontSize:18,marginBottom:4}}>{item.icon}</div>
                    <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:15,color:item.color}}>{item.val}</div>
                    <div style={{fontSize:9,color:C.muted,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,letterSpacing:0.5,textTransform:"uppercase",marginTop:2}}>{item.label}</div>
                  </div>
                ))}
              </div>
              {debtProgress.debtStart > 0 && (
                <div style={{marginTop:12,paddingTop:10,borderTop:`1px solid ${C.income}20`,fontSize:11,color:C.muted,textAlign:"center"}}>
                  Debt this month: <span style={{color:C.expense,fontWeight:700}}>{fc(debtProgress.debtStart)}</span>
                  {" → "}
                  <span style={{color:C.income,fontWeight:700}}>{fc(debtProgress.debtNow)}</span>
                  {debtProgress.reduction>0 && <span style={{color:C.income,fontWeight:700}}> (↓ {fc(debtProgress.reduction)})</span>}
                </div>
              )}
            </div>

            {/* 6-month payment chart */}
            <div style={{marginBottom:14}}>
              <div className="lbl" style={{marginBottom:10}}>MONTHLY DEBT PAYMENTS — LAST 6 MONTHS</div>
              <div style={{display:"flex",gap:4,alignItems:"flex-end",height:80}}>
                {debtProgress.monthlyPayments.map((m,i)=>{
                  const maxPaid = Math.max(...debtProgress.monthlyPayments.map(x=>x.paid),1);
                  const barH = m.paid > 0 ? Math.max(6, (m.paid/maxPaid)*64) : 4;
                  const isCurrent = i===5;
                  return(
                    <div key={m.label} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                      <div style={{fontSize:9,color:m.paid>0?C.income:C.muted,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,textAlign:"center"}}>
                        {m.paid>0 ? (m.paid>=1000?`${(m.paid/1000).toFixed(0)}k`:Math.round(m.paid)) : "—"}
                      </div>
                      <div style={{
                        width:"100%",height:barH,
                        borderRadius:6,
                        background:m.paid>0
                          ? isCurrent ? C.income : `${C.income}70`
                          : C.border,
                        transition:"height 0.4s",
                        border:isCurrent?`2px solid ${C.income}`:"none",
                      }}/>
                      <div style={{fontSize:9,color:isCurrent?C.text:C.muted,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:isCurrent?700:400,textAlign:"center"}}>{m.label}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Individual loan progress bars */}
            {debtProgress.loanProgress.length > 0 && (
              <div style={{marginBottom:12}}>
                <div className="lbl" style={{marginBottom:10}}>LOAN REPAYMENT PROGRESS</div>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {debtProgress.loanProgress.map((d,i)=>{
                    const colors=["#f43f5e","#f59e0b","#38bdf8","#10b981","#a78bfa"];
                    const pc = colors[i%colors.length];
                    const hasTotal = d.total > 0;
                    return(
                      <div key={d.id}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5,flexWrap:"wrap",gap:4}}>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <div style={{width:8,height:8,borderRadius:"50%",background:pc,flexShrink:0}}/>
                            <span style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:12,color:C.text}}>{d.name}</span>
                            <span style={{fontSize:10,color:C.muted}}>{d.lender}</span>
                          </div>
                          <div style={{display:"flex",gap:10,fontSize:11,fontFamily:"'Cabinet Grotesk',sans-serif"}}>
                            {hasTotal && <span style={{color:C.income,fontWeight:700}}>Paid {fc(d.paid)}</span>}
                            <span style={{color:C.expense,fontWeight:700}}>Left {fc(d.current)}</span>
                          </div>
                        </div>
                        {hasTotal ? (
                          <>
                            <div className="pbar">
                              <div className="pfill" style={{width:`${d.pct}%`,background:pc}}/>
                            </div>
                            <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:C.muted,marginTop:2,fontFamily:"'Cabinet Grotesk',sans-serif"}}>
                              <span style={{color:C.income,fontWeight:700}}>{d.pct.toFixed(0)}% repaid</span>
                              <span>of {fc(d.total)}</span>
                            </div>
                          </>
                        ) : (
                          <div style={{fontSize:10,color:C.muted,fontStyle:"italic"}}>
                            Set "Original Total ₹" in loan details to see progress bar
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* CC progress */}
            {debtProgress.ccProgress.filter(c=>c.current>0).length > 0 && (
              <div>
                <div className="lbl" style={{marginBottom:10}}>CREDIT CARD OUTSTANDING</div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {debtProgress.ccProgress.filter(c=>c.current>0).map(cc=>{
                    const uc = cc.util>=75?C.expense:cc.util>=40?C.warning:C.income;
                    return(
                      <div key={cc.id}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                          <span style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:12}}>{cc.name} · {cc.bank}</span>
                          <div style={{display:"flex",gap:8,fontSize:11,fontFamily:"'Cabinet Grotesk',sans-serif"}}>
                            <span style={{color:uc,fontWeight:700}}>{fc(cc.current)}</span>
                            <span style={{color:C.muted}}>({cc.util.toFixed(0)}% used)</span>
                          </div>
                        </div>
                        <div className="pbar">
                          <div className="pfill" style={{width:`${cc.util}%`,background:uc}}/>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Total debt summary */}
            <div style={{marginTop:14,paddingTop:12,borderTop:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
              <div>
                <div style={{fontSize:11,color:C.muted,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,marginBottom:2}}>TOTAL DEBT TODAY</div>
                <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:22,color:C.expense}}>{fc(debtProgress.debtNow)}</div>
              </div>
              {debtFreeMonths !== null && debtFreeMonths > 0 && (
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:11,color:C.muted,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,marginBottom:2}}>DEBT-FREE IN</div>
                  <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:18,color:C.loan}}>
                    {Math.floor(debtFreeMonths/12)>0?`${Math.floor(debtFreeMonths/12)}y `:""}{debtFreeMonths%12>0?`${debtFreeMonths%12}m`:""}
                  </div>
                </div>
              )}
            </div>
          </div>
          )}

          {/* ── INTEREST COST TRACKER ── */}
          {interestCost.totalMonthly > 0 && (
          <div className="card" style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}} onClick={()=>setPlanExpanded(p=>({...p,interest:!p.interest}))}>
              <div>
                <div className="stitle" style={{marginBottom:2}}>🏦 Interest Cost</div>
                <div style={{fontSize:11,color:C.muted}}>Money going to banks as interest</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{textAlign:"right"}}>
                  <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:18,color:C.expense}}>{fc(Math.round(interestCost.totalMonthly))}/mo</div>
                </div>
                <span style={{fontSize:18,color:C.muted}}>{planExpanded.interest?"▲":"▼"}</span>
              </div>
            </div>
            {planExpanded.interest&&(<>
            {/* Interest breakdown per loan/CC */}
            <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
              {interestCost.allItems.filter(x=>x.monthly>0).map((item,i)=>{
                const pct = interestCost.totalMonthly>0 ? (item.monthly/interestCost.totalMonthly)*100 : 0;
                const isCC = item.bank !== undefined;
                const isHighRate = item.rate >= 30;
                return(
                  <div key={i}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4,flexWrap:"wrap",gap:4}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontSize:14}}>{isCC?'💳':'🏦'}</span>
                        <div>
                          <span style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:12,color:C.text}}>{item.name}</span>
                          {isHighRate&&<span style={{marginLeft:6,fontSize:9,background:`${C.expense}20`,color:C.expense,padding:"1px 6px",borderRadius:99,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700}}>HIGH {item.rate}%</span>}
                        </div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <span style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:13,color:isHighRate?C.expense:C.warning}}>{fc(Math.round(item.monthly))}/mo</span>
                        <span style={{fontSize:10,color:C.muted,marginLeft:6}}>{item.rate}% p.a.</span>
                      </div>
                    </div>
                    <div className="pbar">
                      <div className="pfill" style={{width:`${pct}%`,background:isHighRate?C.expense:C.warning}}/>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Insight tip */}
            {interestCost.allItems.length > 0 && (
              <div style={{padding:"10px 14px",background:`${C.income}08`,borderRadius:12,border:`1px solid ${C.income}25`,fontSize:11,color:C.muted,lineHeight:1.7}}>
                💡 Paying off <span style={{fontWeight:700,color:C.text}}>{interestCost.allItems[0].name}</span> first saves <span style={{fontWeight:700,color:C.income}}>{fc(Math.round(interestCost.allItems[0].monthly))}/month</span> in interest immediately.
                {interestCost.totalYearly > 50000 && <span> That's <span style={{fontWeight:700,color:C.expense}}>{fc(Math.round(interestCost.totalYearly))}/year</span> going to banks!</span>}
              </div>
            )}
            </>)} {/* end planExpanded.interest */}
          </div>
          )}

          {/* ── SAVINGS GOALS ── */}
          {savings.length > 0 && (
          <div className="card" style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}} onClick={()=>setPlanExpanded(p=>({...p,savings:!p.savings}))}>
              <div>
                <div className="stitle" style={{marginBottom:2}}>🎯 Savings Goals</div>
                <div style={{fontSize:11,color:C.muted}}>{savings.length} goal{savings.length!==1?'s':''} · avg {savingsGoalProgress.length?Math.round(savingsGoalProgress.reduce((s,g)=>s+g.pct,0)/savingsGoalProgress.length):0}% done</div>
              </div>
              <span style={{fontSize:18,color:C.muted}}>{planExpanded.savings?"▲":"▼"}</span>
            </div>
            {planExpanded.savings&&<div style={{marginTop:14,display:"flex",flexDirection:"column",gap:14}}>
              {savingsGoalProgress.map((g,i)=>{
                const colors=['#7b4fd4','#00e5a0','#38bdf8','#f59e0b','#f43f5e'];
                const col = colors[i%colors.length];
                return(
                  <div key={g.id||i}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6,flexWrap:"wrap",gap:4}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{width:10,height:10,borderRadius:3,background:col,flexShrink:0}}/>
                        <span style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:13,color:C.text}}>{g.name}</span>
                      </div>
                      <div style={{display:"flex",gap:8,fontSize:11,fontFamily:"'Cabinet Grotesk',sans-serif"}}>
                        <span style={{color:col,fontWeight:700}}>{fc(g.current)}</span>
                        <span style={{color:C.muted}}>of {fc(g.goal)}</span>
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div style={{position:"relative",marginBottom:5}}>
                      <div style={{height:10,background:C.border,borderRadius:99,overflow:"hidden"}}>
                        <div style={{height:"100%",width:`${g.pct}%`,background:col,borderRadius:99,transition:"width 0.6s"}}/>
                      </div>
                      {g.pct>5&&(
                        <div style={{position:"absolute",left:`${Math.min(g.pct-2,90)}%`,top:0,fontSize:8,color:"#fff",fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,lineHeight:"10px",paddingLeft:4}}>{g.pct.toFixed(0)}%</div>
                      )}
                    </div>
                    {g.remaining > 0 ? (
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:C.muted}}>
                        <span>₹{fc(g.remaining)} remaining</span>
                        <span style={{color:col,fontWeight:700}}>
                          ~{g.monthsLeft} month{g.monthsLeft!==1?'s':''} at {fc(Math.round(g.monthlySave))}/mo
                        </span>
                      </div>
                    ) : (
                      <div style={{fontSize:11,color:C.income,fontWeight:700}}>🎉 Goal reached!</div>
                    )}
                  </div>
                );
              })}
            </div>}
          </div>
          )}

          {/* ── INVESTMENT TRACKER ── */}
          <div className="card" style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}} onClick={()=>setPlanExpanded(p=>({...p,investments:!p.investments}))}>
              <div>
                <div className="stitle" style={{marginBottom:2}}>📈 Investments</div>
                <div style={{fontSize:11,color:C.muted}}>{investments.length} holding{investments.length!==1?'s':''}{investmentStats.totalInvested>0?` · ${fc(Math.round(investmentStats.currentValue))} value`:''}</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <button className="btn btn-p btn-sm" onClick={e=>{e.stopPropagation();setInvForm({...EMPTY_INVESTMENT});setEditInvId(null);setShowInvForm(true);}}>+ Add</button>
                <span style={{fontSize:18,color:C.muted}}>{planExpanded.investments?"▲":"▼"}</span>
              </div>
            </div>
            {planExpanded.investments&&<>
            {/* Summary */}
            {investments.length>0&&(
              <>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:14}}>
                  {[
                    {label:"Total Invested", val:fc(investmentStats.totalInvested), color:C.accent},
                    {label:"Current Value",  val:fc(investmentStats.currentValue),  color:investmentStats.gain>=0?C.income:C.expense},
                    {label:"Gain / Loss",    val:`${investmentStats.gain>=0?"+":""}${fc(Math.round(investmentStats.gain))}`, color:investmentStats.gain>=0?C.income:C.expense},
                  ].map(s=>(
                    <div key={s.label} style={{background:C.surface,borderRadius:10,padding:"10px 12px",border:`1px solid ${C.border}`,textAlign:"center"}}>
                      <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:14,color:s.color}}>{s.val}</div>
                      <div style={{fontSize:9,color:C.muted,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,letterSpacing:0.5,textTransform:"uppercase",marginTop:2}}>{s.label}</div>
                    </div>
                  ))}
                </div>
                {/* Gain % badge */}
                {investmentStats.totalInvested>0&&(
                  <div style={{marginBottom:12,padding:"8px 14px",borderRadius:10,background:investmentStats.gain>=0?`${C.income}10`:`${C.expense}10`,border:`1px solid ${investmentStats.gain>=0?C.income:C.expense}25`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontSize:12,color:C.muted}}>Overall return</span>
                    <span style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:14,color:investmentStats.gain>=0?C.income:C.expense}}>
                      {investmentStats.gain>=0?"+":""}{investmentStats.gainPct.toFixed(1)}%
                    </span>
                  </div>
                )}
                {/* By type breakdown */}
                {Object.entries(investmentStats.byType).length>1&&(
                  <div style={{marginBottom:12}}>
                    <div className="lbl" style={{marginBottom:8}}>BY TYPE</div>
                    <div style={{display:"flex",flexDirection:"column",gap:6}}>
                      {Object.entries(investmentStats.byType).map(([type,data],i)=>{
                        const colors=["#7b4fd4","#00e5a0","#38bdf8","#f59e0b","#f43f5e","#10b981"];
                        const col=colors[i%colors.length];
                        const pct=investmentStats.totalInvested>0?(data.invested/investmentStats.totalInvested*100):0;
                        const g=data.current-data.invested;
                        return(
                          <div key={type}>
                            <div style={{display:"flex",justifyContent:"space-between",marginBottom:3,flexWrap:"wrap",gap:4}}>
                              <div style={{display:"flex",alignItems:"center",gap:6}}>
                                <div style={{width:8,height:8,borderRadius:2,background:col}}/>
                                <span style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:12}}>{type}</span>
                                <span style={{fontSize:10,color:C.muted}}>({data.count})</span>
                              </div>
                              <div style={{display:"flex",gap:8,fontSize:11,fontFamily:"'Cabinet Grotesk',sans-serif"}}>
                                <span style={{color:C.accent,fontWeight:700}}>{fc(data.invested)}</span>
                                {g!==0&&<span style={{color:g>0?C.income:C.expense,fontWeight:700}}>{g>0?"+":""}{fc(Math.round(g))}</span>}
                              </div>
                            </div>
                            <div className="pbar">
                              <div className="pfill" style={{width:`${pct}%`,background:col}}/>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {/* Individual investments */}
                <div className="lbl" style={{marginBottom:8}}>HOLDINGS</div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {investments.map(inv=>{
                    const units=parseFloat(inv.units)||0, nav=parseFloat(inv.nav)||0;
                    const invested = getSIPTotalInvested(inv);
                    const curr = units>0&&nav>0 ? units*nav : invested;
                    const g    = curr-invested;
                    const gPct = invested>0?(g/invested*100):0;
                    return(
                      <div key={inv.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 12px",background:C.surface,borderRadius:12,border:`1px solid ${C.border}`,flexWrap:"wrap",gap:8}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:13,color:C.text}}>{inv.name}</div>
                          <div style={{fontSize:10,color:C.muted,marginTop:2,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                            {inv.type}{units>0?` · ${units} units @ ₹${nav||"?"} NAV`:""}
                            {inv.startDate?` · Since ${new Date(inv.startDate).toLocaleDateString("en-IN",{month:"short",year:"numeric"})}`:""} 
                            {inv.isSIP&&inv.sipActive&&<span style={{background:`${C.income}18`,color:C.income,padding:"1px 7px",borderRadius:99,fontSize:9,fontWeight:700,fontFamily:"'Cabinet Grotesk',sans-serif"}}>🔁 SIP ₹{parseFloat(inv.sipAmount||0).toLocaleString('en-IN')}/{inv.sipDay}th</span>}
                          </div>
                          {inv.isSIP&&inv.sipStartDate&&(
                            <div style={{fontSize:10,color:C.accent,marginTop:3,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700}}>
                              {(()=>{
                                const sipDay=parseInt(inv.sipDay)||1;
                                let count=0,d=new Date(new Date(inv.sipStartDate).getFullYear(),new Date(inv.sipStartDate).getMonth(),sipDay);
                                const today=new Date(); const td=new Date(today.getFullYear(),today.getMonth(),today.getDate());
                                while(d<=td){count++;d=new Date(d.getFullYear(),d.getMonth()+1,sipDay);}
                                return `${count} instalments · auto-calculated`;
                              })()}
                            </div>
                          )}
                        </div>
                        <div style={{textAlign:"right",flexShrink:0}}>
                          <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:14,color:C.accent}}>{fc(curr)}</div>
                          <div style={{fontSize:10,color:C.muted}}>invested: {fc(Math.round(invested))}</div>
                          {g!==0&&<div style={{fontSize:10,color:g>0?C.income:C.expense,fontWeight:700}}>{g>0?"+":""}{fc(Math.round(g))} ({gPct.toFixed(1)}%)</div>}
                        </div>
                        <div style={{display:"flex",gap:4,flexShrink:0}}>
                          <button className="btn-ghost btn-sm" onClick={()=>{setInvForm({...inv});setEditInvId(inv.id);setShowInvForm(true);}}>✏️</button>
                          <button className="btn-ghost btn-sm" style={{color:C.expense}} onClick={()=>deleteInvestment(inv.id)}>🗑</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            {investments.length===0&&(
              <div style={{textAlign:"center",padding:24,color:C.muted,fontSize:12}}>
                <div style={{fontSize:32,marginBottom:8}}>📈</div>
                No investments added yet.<br/>Add your mutual funds, SIPs, stocks, FDs, gold, PPF.
              </div>
            )}
            </>}
          </div>

          {/* ── CIBIL SCORE SIMULATOR ── */}
          <div className="card" style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}} onClick={()=>setPlanExpanded(p=>({...p,cibil:!p.cibil}))}>
              <div>
                <div className="stitle" style={{marginBottom:2}}>🎯 CIBIL Score Simulator</div>
                <div style={{fontSize:11,color:C.muted}}>
                  {cibilAnalysis ? `Score: ${cibilAnalysis.score} · ${cibilAnalysis.label}` : 'Enter your score to get suggestions'}
                </div>
              </div>
              {cibilAnalysis&&<div style={{padding:"4px 12px",borderRadius:99,background:`${cibilAnalysis.color}20`,color:cibilAnalysis.color,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:13,marginRight:8}}>{cibilAnalysis.score}</div>}
              <span style={{fontSize:18,color:C.muted}}>{planExpanded.cibil?"▲":"▼"}</span>
            </div>
            {planExpanded.cibil&&<div style={{marginTop:14}}>
            <div style={{marginBottom:14}}>
              <div className="lbl" style={{marginBottom:6}}>Your Current CIBIL Score</div>
              <div style={{display:"flex",gap:10,alignItems:"center"}}>
                <input className="inp" type="number" placeholder="e.g. 720" min="300" max="900"
                  value={cibilScore} onChange={e=>setCibilScore(e.target.value)}
                  style={{maxWidth:140,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:18}}/>
                {cibilAnalysis&&(
                  <div style={{padding:"6px 16px",borderRadius:99,background:`${cibilAnalysis.color}20`,border:`1px solid ${cibilAnalysis.color}40`}}>
                    <span style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:13,color:cibilAnalysis.color}}>{cibilAnalysis.label}</span>
                  </div>
                )}
              </div>
              {!cibilScore&&<div style={{fontSize:11,color:C.muted,marginTop:4}}>Check your score free at CIBIL.com or via your bank app</div>}
            </div>
            {cibilAnalysis&&(
              <>
                {/* Score arc display */}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 16px",background:`${cibilAnalysis.color}08`,borderRadius:14,border:`1px solid ${cibilAnalysis.color}25`,marginBottom:14,flexWrap:"wrap",gap:10}}>
                  <div>
                    <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:36,color:cibilAnalysis.color,lineHeight:1}}>{cibilAnalysis.score}</div>
                    <div style={{fontSize:10,color:C.muted,marginTop:4}}>Range: 300 – 900</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:11,color:C.muted,marginBottom:4}}>If you follow all suggestions:</div>
                    <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:20,color:C.income}}>~{cibilAnalysis.projected}</div>
                    {cibilAnalysis.monthsTo750>0&&<div style={{fontSize:10,color:C.muted}}>750+ in ~{cibilAnalysis.monthsTo750} months</div>}
                  </div>
                </div>
                {/* Score bar */}
                <div style={{marginBottom:14}}>
                  <div style={{position:"relative",height:10,background:C.border,borderRadius:99,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${Math.min(100,((cibilAnalysis.score-300)/600)*100)}%`,background:`linear-gradient(90deg, #ff4d6d, #f59e0b, #00e5a0)`,borderRadius:99}}/>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:C.muted,marginTop:3,fontFamily:"'Cabinet Grotesk',sans-serif"}}>
                    <span>300 Poor</span><span>550 Fair</span><span>700 Good</span><span>800 Excellent</span>
                  </div>
                </div>
                {/* Suggestions */}
                <div className="lbl" style={{marginBottom:10}}>WHAT WILL IMPROVE YOUR SCORE</div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {cibilAnalysis.suggestions.map((s,i)=>{
                    const urgColor=s.urgency==='critical'?C.expense:s.urgency==='high'?C.warning:s.urgency==='medium'?C.accent:C.muted;
                    return(
                      <div key={i} style={{padding:"10px 14px",borderRadius:12,background:`${urgColor}08`,border:`1px solid ${urgColor}25`}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:6,marginBottom:4}}>
                          <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:12,color:C.text,flex:1}}>{s.action}</div>
                          <span style={{padding:"2px 10px",borderRadius:99,background:`${C.income}15`,color:C.income,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:11,flexShrink:0}}>{s.impact}</span>
                        </div>
                        <div style={{fontSize:10,color:C.muted}}>{s.reason}</div>
                      </div>
                    );
                  })}
                </div>
                {/* Utilization insight */}
                {cibilAnalysis.utilization>0&&(
                  <div style={{marginTop:12,padding:"10px 14px",background:C.surface,borderRadius:12,border:`1px solid ${C.border}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                      <span style={{fontSize:11,color:C.muted,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700}}>CC Utilization</span>
                      <span style={{fontSize:12,fontWeight:700,color:cibilAnalysis.utilization>75?C.expense:cibilAnalysis.utilization>30?C.warning:C.income,fontFamily:"'Cabinet Grotesk',sans-serif"}}>{cibilAnalysis.utilization.toFixed(0)}%</span>
                    </div>
                    <div className="pbar">
                      <div className="pfill" style={{width:`${Math.min(100,cibilAnalysis.utilization)}%`,background:cibilAnalysis.utilization>75?C.expense:cibilAnalysis.utilization>30?C.warning:C.income}}/>
                    </div>
                    <div style={{fontSize:10,color:C.muted,marginTop:4}}>Target: keep below 30% for best score impact</div>
                  </div>
                )}
              </>
            )}
            </div>} {/* end planExpanded.cibil */}
          </div>

          {/* ── DEBT PAYOFF TIMELINE ── */}
          {debtPayoffTimeline&&debtPayoffTimeline.timelines.length>0&&(
          <div className="card" style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14,flexWrap:"wrap",gap:8}}>
              <div>
                <div className="stitle" style={{marginBottom:2}}>🗓 Debt Payoff Timeline</div>
                <div style={{fontSize:11,color:C.muted}}>Exact month each loan closes at current EMI</div>
              </div>
              {debtPayoffTimeline.totalInterestLeft>0&&(
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:10,color:C.muted}}>Interest yet to pay</div>
                  <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:15,color:C.expense}}>{fc(Math.round(debtPayoffTimeline.totalInterestLeft))}</div>
                </div>
              )}
            </div>

            {/* Timeline row per loan */}
            <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:16}}>
              {debtPayoffTimeline.timelines.map((t,i)=>{
                const colors=["#f43f5e","#f59e0b","#38bdf8","#10b981","#a78bfa","#fb923c"];
                const col=colors[i%colors.length];
                const yrs=Math.floor(t.months/12), mos=t.months%12;
                return(
                  <div key={t.id} style={{padding:"12px 14px",background:C.surface,borderRadius:12,border:`1px solid ${col}30`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:6,marginBottom:8}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{width:10,height:10,borderRadius:3,background:col,flexShrink:0}}/>
                        <div>
                          <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:13,color:C.text}}>{t.name}</div>
                          <div style={{fontSize:10,color:C.muted}}>{t.lender} · ₹{fc(t.outstanding)} outstanding</div>
                        </div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:14,color:col}}>
                          {t.label || t.closeDate.toLocaleDateString('en-IN',{month:'short',year:'numeric'})}
                        </div>
                        <div style={{fontSize:10,color:C.muted}}>{yrs>0?`${yrs}y `:''}{mos>0?`${mos}m`:''} left</div>
                      </div>
                    </div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      <div style={{fontSize:10,background:`${col}12`,color:col,padding:"3px 10px",borderRadius:99,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700}}>
                        EMI: {fc(t.emi)}/mo
                      </div>
                      {t.rate>0&&<div style={{fontSize:10,background:`${C.expense}10`,color:C.expense,padding:"3px 10px",borderRadius:99,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700}}>
                        Interest: {fc(Math.round(t.monthlyInterest))}/mo
                      </div>}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Free EMI Projection — snowball */}
            <div style={{borderTop:`1px solid ${C.border}`,paddingTop:14}}>
              <div className="lbl" style={{marginBottom:10}}>🔓 FREE EMI PROJECTION — SNOWBALL EFFECT</div>
              <div style={{fontSize:11,color:C.muted,marginBottom:12,lineHeight:1.7}}>
                As each loan closes, that EMI cash is freed. Here's how much extra money you'll have each month:
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {debtPayoffTimeline.projection.map((p,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",borderRadius:12,background:i===0?`${C.income}08`:C.surface,border:`1px solid ${i===0?C.income:C.border}`}}>
                    <div style={{width:28,height:28,borderRadius:99,background:i===0?`${C.income}20`:`${C.accent}15`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:12,color:i===0?C.income:C.accent,flexShrink:0}}>
                      {p.order}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:12,color:C.text}}>{p.name} closes</div>
                      <div style={{fontSize:10,color:C.muted}}>{p.label} · {p.closesInMonths} months</div>
                    </div>
                    <div style={{textAlign:"right",flexShrink:0}}>
                      <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:14,color:C.income}}>+{fc(p.freedEmi)}/mo</div>
                      <div style={{fontSize:10,color:C.muted}}>Total freed: {fc(p.cumulativeFreed)}/mo</div>
                    </div>
                  </div>
                ))}
              </div>
              {debtPayoffTimeline.projection.length>0&&(
                <div style={{marginTop:12,padding:"12px 14px",background:`${C.income}10`,borderRadius:12,border:`1px solid ${C.income}25`,fontSize:11,color:C.muted,lineHeight:1.8}}>
                  🎉 When all loans close → <span style={{fontWeight:700,color:C.income,fontSize:13}}>{fc(debtPayoffTimeline.projection[debtPayoffTimeline.projection.length-1]?.cumulativeFreed||0)}/month</span> freed up for savings & investments
                </div>
              )}
            </div>
          </div>
          )}

          {/* ── SIDE INCOME TRACKER (Plan) ── */}
          <div className="card" style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",marginBottom:planExpanded.sideincome?12:0}} onClick={()=>setPlanExpanded(p=>({...p,sideincome:!p.sideincome}))}>
              <div>
                <div className="stitle" style={{marginBottom:2}}>💼 Side Income Tracker</div>
                <div style={{fontSize:11,color:C.muted}}>This month: {fc(sideIncomeStats.thisMonth)} · Avg: {fc(Math.round(sideIncomeStats.avg))}/mo</div>
              </div>
              <span style={{fontSize:18,color:C.muted}}>{planExpanded.sideincome?"▲":"▼"}</span>
            </div>
            {planExpanded.sideincome&&<>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:14}}>
              {[
                {label:"This Month",  val:fc(sideIncomeStats.thisMonth), color:sideIncomeStats.thisMonth>0?C.income:C.muted},
                {label:"Monthly Avg", val:fc(Math.round(sideIncomeStats.avg)), color:C.accent},
                {label:"Best Month",  val:fc(sideIncomeStats.best), color:C.loan},
              ].map(s=>(
                <div key={s.label} style={{background:C.surface,borderRadius:10,padding:"10px 12px",border:`1px solid ${C.border}`,textAlign:"center"}}>
                  <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:14,color:s.color}}>{s.val}</div>
                  <div style={{fontSize:9,color:C.muted,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,letterSpacing:0.5,textTransform:"uppercase",marginTop:2}}>{s.label}</div>
                </div>
              ))}
            </div>
            {/* 6-month bar chart */}
            <div style={{display:"flex",gap:4,alignItems:"flex-end",height:72,marginBottom:8}}>
              {sideIncomeStats.monthly.map((m,i)=>{
                const maxAmt=Math.max(...sideIncomeStats.monthly.map(x=>x.amount),1);
                const barH=m.amount>0?Math.max(6,(m.amount/maxAmt)*58):4;
                const isCur=i===5;
                return(
                  <div key={m.label} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                    <div style={{fontSize:9,color:m.amount>0?C.income:C.muted,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,textAlign:"center"}}>
                      {m.amount>0?(m.amount>=1000?`${(m.amount/1000).toFixed(0)}k`:Math.round(m.amount)):'—'}
                    </div>
                    <div style={{width:"100%",height:barH,borderRadius:6,background:m.amount>0?(isCur?C.income:`${C.income}60`):C.border,border:isCur?`2px solid ${C.income}`:"none"}}/>
                    <div style={{fontSize:9,color:isCur?C.text:C.muted,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:isCur?700:400}}>{m.label}</div>
                  </div>
                );
              })}
            </div>
            {sideIncomeStats.avg>0&&(
              <div style={{padding:"10px 14px",background:`${C.income}08`,borderRadius:10,border:`1px solid ${C.income}20`,fontSize:11,color:C.muted,lineHeight:1.7}}>
                💡 Growing side income to <span style={{color:C.income,fontWeight:700}}>₹5,000/month</span> consistently would pay off one extra EMI every year.
              </div>
            )}
            </>} {/* end planExpanded.sideincome */}
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

          {/* Smart Plan Summary */}
          <div className="card">
            <div className="stitle">💡 Your Financial Summary</div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <div style={{padding:"12px 14px",background:C.surface,borderRadius:12,border:`1px solid ${health.color}30`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                  <span style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:13}}>Health Score</span>
                  <span style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:16,color:health.color}}>{health.score}/100 — Grade {health.grade}</span>
                </div>
                {health.items.map(item=>(
                  <div key={item.label} style={{marginBottom:6}}>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:C.muted,marginBottom:2}}>
                      <span>{item.label}</span><span style={{color:item.score===item.max?C.income:item.score>0?C.warning:C.expense}}>{item.tip}</span>
                    </div>
                    <div className="pbar"><div className="pfill" style={{width:`${(item.score/item.max)*100}%`,background:health.color}}/></div>
                  </div>
                ))}
              </div>
              {debtFreeMonths!==null&&debtFreeMonths>0&&(
                <div style={{padding:"12px 14px",background:`${C.loan}10`,borderRadius:12,border:`1px solid ${C.loan}30`}}>
                  <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:13,color:C.loan,marginBottom:3}}>🏁 Debt-Free Timeline</div>
                  <div style={{fontSize:12,color:C.muted}}>
                    At current pace: <span style={{color:C.text,fontWeight:700}}>{Math.floor(debtFreeMonths/12)>0?`${Math.floor(debtFreeMonths/12)}y `:""}{debtFreeMonths%12>0?`${debtFreeMonths%12}m`:""}</span>
                    {parseFloat(extraFund)>0&&(()=>{
                      const withExtra=Math.max(1,Math.ceil((totalOutstanding+totalCCOut)/(totalEMI+(parseFloat(extraFund)||0))));
                      const saved=debtFreeMonths-withExtra;
                      return saved>0?<span style={{color:C.income,fontWeight:700}}> → {saved}m faster with extra {fc(parseFloat(extraFund))}/mo 🎉</span>:null;
                    })()}
                  </div>
                </div>
              )}
              {recommended.reason&&(
                <div style={{padding:"12px 14px",background:`${C.income}08`,borderRadius:12,border:`1px solid ${C.income}25`}}>
                  <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:13,color:C.income,marginBottom:3}}>🤖 Recommended: {recommended.strategy==="avalanche"?"Avalanche ⬆":"Snowball ❄"}</div>
                  <div style={{fontSize:12,color:C.muted,lineHeight:1.6}}>{recommended.reason}</div>
                </div>
              )}
              <div style={{padding:"10px 14px",background:C.surface,borderRadius:12,border:`1px solid ${C.border}`,fontSize:11,color:C.muted,lineHeight:1.7}}>
                💡 <span style={{fontWeight:700,color:C.text}}>Next steps:</span> For personalised investment advice, consult a SEBI-registered financial advisor. For tax planning, speak to a CA.
              </div>
            </div>
          </div>
        </>}

        {/* ════════ CREDIT CARDS ════════ */}
        {tab==="Cards"&&<>
          <div className="g4" style={{marginBottom:12}}>
            {[
              {label:"Total Outstanding", val:fc(totalCCOut),      color:C.expense},
              {label:"Total CC EMIs",     val:fc(totalCCEMI),      color:C.warning},
              {label:"# Cards",           val:creditCards.length,  color:C.accent},
              {label:"Highest Util",      val:creditCards.length?Math.max(...creditCards.map(c=>((parseFloat(c.outstanding)||0)/(parseFloat(c.limit)||1)*100))).toFixed(0)+"%":"0%", color:C.credit},
            ].map(item=>(
              <div key={item.label} className="scard">
                <div className="lbl">{item.label}</div>
                <div style={{fontSize:17,fontWeight:700,color:item.color,fontFamily:"'Cabinet Grotesk',sans-serif"}}>{item.val}</div>
              </div>
            ))}
          </div>

          {/* ── CC EMI TRACKER ── */}
          <div className="card" style={{marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div>
                <div className="stitle" style={{marginBottom:2}}>📋 Credit Card EMI Tracker</div>
                <div style={{fontSize:11,color:C.muted}}>EMIs running on your credit cards</div>
              </div>
              <button className="btn btn-p btn-sm" onClick={()=>{setCcEmiForm({...EMPTY_CC_EMI});setShowCCEmiForm(true);}}>+ Add EMI</button>
            </div>
            {/* Summary strip */}
            {ccEmis.length>0&&(
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:12}}>
                {[
                  {label:"Total/month",   val:fc(totalCCEMI),  color:C.warning},
                  {label:"Active EMIs",   val:ccEmis.length,   color:C.accent},
                  {label:"Total Remaining", val:fc(ccEmis.reduce((s,e)=>(parseFloat(e.amount)||0)*(parseFloat(e.monthsLeft)||0)+s,0)), color:C.expense},
                ].map(s=>(
                  <div key={s.label} style={{background:C.surface,borderRadius:10,padding:"10px 12px",border:`1px solid ${C.border}`,textAlign:"center"}}>
                    <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:15,color:s.color}}>{s.val}</div>
                    <div style={{fontSize:9,color:C.muted,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,letterSpacing:0.5,textTransform:"uppercase",marginTop:2}}>{s.label}</div>
                  </div>
                ))}
              </div>
            )}
            {ccEmis.length===0
              ? <div style={{textAlign:"center",padding:20,color:C.muted,fontSize:12}}>No CC EMIs yet. Add EMIs running on your credit cards (e.g. phone, TV purchase).</div>
              : ccEmis.map(emi=>{
                  const card = creditCards.find(c=>String(c.id)===String(emi.cardId));
                  const totalLeft = (parseFloat(emi.amount)||0)*(parseFloat(emi.monthsLeft)||0);
                  const totalMo   = parseFloat(emi._totalMonths)||parseFloat(emi.monthsLeft)||1;
                  const paidMo    = Math.max(0, totalMo - (parseFloat(emi.monthsLeft)||0));
                  const pct       = Math.min(100,(paidMo/totalMo)*100);
                  return(
                    <div key={emi.id} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"12px",marginBottom:10}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:6}}>
                        <div>
                          <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:13,color:C.text}}>{emi.description||"EMI"}</div>
                          <div style={{fontSize:11,color:C.muted,marginTop:2}}>{card?`${card.name} · ${card.bank}`:"Card not linked"}</div>
                        </div>
                        <div style={{textAlign:"right"}}>
                          <div style={{fontSize:15,fontWeight:700,color:C.warning,fontFamily:"'Cabinet Grotesk',sans-serif"}}>{fc(parseFloat(emi.amount)||0)}/mo</div>
                          <div style={{fontSize:10,color:C.muted}}>{emi.monthsLeft} months left</div>
                        </div>
                      </div>
                      <div style={{margin:"8px 0 4px",display:"flex",justifyContent:"space-between",fontSize:10,color:C.muted}}>
                        <span>Paid: <span style={{color:C.income,fontWeight:700}}>{pct.toFixed(0)}%</span></span>
                        <span>Remaining: <span style={{color:C.expense,fontWeight:700}}>{fc(totalLeft)}</span></span>
                      </div>
                      <div className="pbar">
                        <div className="pfill" style={{width:`${pct}%`,background:C.warning}}/>
                      </div>
                      <div style={{display:"flex",gap:6,marginTop:8}}>
                        <button className="btn-ghost btn-sm" style={{flex:1}} onClick={()=>{setCcEmiForm({...emi});setShowCCEmiForm(true);}}>✏️ Edit</button>
                        <button className="btn-ghost btn-sm" style={{flex:1,color:C.expense}} onClick={()=>deleteCCEmi(emi.id)}>🗑 Delete</button>
                      </div>
                    </div>
                  );
                })
            }
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

            {/* Row 1: Type + Mode + Bank + Category */}
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
              {[["all","All"],["income","Income"],["expense","Expense"]].map(([v,l])=>(
                <button key={v} className={`filter-btn ${txType===v?"on":""}`} onClick={()=>setTxType(v)}>{l}</button>
              ))}
              <select className="inp" value={txMode} onChange={e=>setTxMode(e.target.value)} style={{width:"auto",fontSize:11,padding:"4px 8px"}}>
                <option value="all">All Modes</option>{PAYMENT_MODES.map(m=><option key={m}>{m}</option>)}
              </select>
              <select className="inp" value={txBank} onChange={e=>setTxBank(e.target.value)} style={{width:"auto",fontSize:11,padding:"4px 8px"}}>
                <option value="all">All Banks</option>{banks.map(b=><option key={b}>{b}</option>)}
              </select>
              <select className="inp" value={txCategory} onChange={e=>setTxCategory(e.target.value)} style={{width:"auto",fontSize:11,padding:"4px 8px"}}>
                <option value="all">All Categories</option>
                <optgroup label="Income">{allCategories.income.map(c=><option key={c} value={c}>{c}</option>)}</optgroup>
                <optgroup label="Expense">{allCategories.expense.map(c=><option key={c} value={c}>{c}</option>)}</optgroup>
              </select>
            </div>

            {/* Row 2: Date range filter */}
            <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",padding:"10px 12px",background:C.surface,borderRadius:12,border:`1px solid ${C.border}`,marginBottom:8}}>
              <span style={{fontSize:11,color:C.muted,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,whiteSpace:"nowrap"}}>📅 Date:</span>
              <div style={{display:"flex",alignItems:"center",gap:6,flex:1,flexWrap:"wrap"}}>
                <input type="date" className="inp" value={txDateFrom} onChange={e=>setTxDateFrom(e.target.value)}
                  style={{flex:"1 1 130px",fontSize:11,padding:"6px 10px"}} placeholder="From"/>
                <span style={{fontSize:11,color:C.muted,fontWeight:700}}>→</span>
                <input type="date" className="inp" value={txDateTo} onChange={e=>setTxDateTo(e.target.value)}
                  style={{flex:"1 1 130px",fontSize:11,padding:"6px 10px"}} placeholder="To"/>
              </div>
              {/* Quick date presets */}
              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                {[
                  {l:"Today",   fn:()=>{ const t=today(); setTxDateFrom(t); setTxDateTo(t); }},
                  {l:"This Week",fn:()=>{ const t=new Date(),s=new Date(t);s.setDate(t.getDate()-7); setTxDateFrom(`${s.getFullYear()}-${String(s.getMonth()+1).padStart(2,"0")}-${String(s.getDate()).padStart(2,"0")}`); setTxDateTo(today()); }},
                  {l:"This Month",fn:()=>{ const n=new Date(); setTxDateFrom(`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}-01`); setTxDateTo(today()); }},
                  {l:"Last Month",fn:()=>{ const n=new Date(); const lm=n.getMonth()===0?11:n.getMonth()-1; const ly=n.getMonth()===0?n.getFullYear()-1:n.getFullYear(); const lastDay=new Date(ly,lm+1,0).getDate(); setTxDateFrom(`${ly}-${String(lm+1).padStart(2,"0")}-01`); setTxDateTo(`${ly}-${String(lm+1).padStart(2,"0")}-${String(lastDay).padStart(2,"0")}`); }},
                ].map(p=>(
                  <button key={p.l} className="filter-btn btn-sm" style={{fontSize:10,padding:"4px 10px"}} onClick={p.fn}>{p.l}</button>
                ))}
              </div>
            </div>

            {/* Active filters summary + Clear */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:6}}>
              <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                {txDateFrom&&<span className="tag" style={{background:`${C.purple}18`,color:C.purple,fontSize:10}}>From: {fd(txDateFrom)}</span>}
                {txDateTo&&<span className="tag" style={{background:`${C.purple}18`,color:C.purple,fontSize:10}}>To: {fd(txDateTo)}</span>}
                {txCategory!=="all"&&<span className="tag" style={{background:`${C.accent}18`,color:C.accent,fontSize:10}}>Cat: {txCategory}</span>}
                {txType!=="all"&&<span className="tag" style={{background:`${C.income}18`,color:C.income,fontSize:10}}>{txType}</span>}
                {txMode!=="all"&&<span className="tag" style={{background:`${C.warning}18`,color:C.warning,fontSize:10}}>{txMode}</span>}
                {txBank!=="all"&&<span className="tag" style={{background:`${C.loan}18`,color:C.loan,fontSize:10}}>{txBank}</span>}
              </div>
              <div style={{display:"flex",gap:6}}>
                <button className="btn-ghost btn-sm" onClick={()=>{setTxSearch("");setTxType("all");setTxMode("all");setTxBank("all");setTxCategory("all");setTxDateFrom("");setTxDateTo("");}}>Clear All</button>
                <button className="btn-ghost btn-sm" onClick={()=>setShowImport(true)}>⬆ Import</button>
                <button className="btn-ghost btn-sm" onClick={exportTransactions}>⬇ CSV</button>
              </div>
            </div>
          </div>
          <div className="card">
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
              <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:12}}>{filteredTx.length} transactions</div>
              <div style={{fontSize:11,color:C.muted}}><span style={{color:C.income}}>+{fc(filteredTx.filter(t=>t.type==="income").reduce((s,t)=>s+(parseFloat(t.amount)||0),0))}</span> / <span style={{color:C.expense}}>-{fc(filteredTx.filter(t=>t.type==="expense").reduce((s,t)=>s+(parseFloat(t.amount)||0),0))}</span></div>
            </div>
            {filteredTx.length===0?<div style={{color:C.muted,textAlign:"center",padding:30,fontSize:12}}>No transactions found.</div>:filteredTx.map(t=>(
              <div key={t.id} className="row">
                <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0,flex:1}}>
                  <div style={{width:32,height:32,borderRadius:8,background:(t.type==="income"?C.income:t.type==="transfer"?C.accent:C.expense)+"18",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{t.type==="income"?"↑":t.type==="transfer"?"↔":"↓"}</div>
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
                  <span style={{color:t.type==="income"?C.income:t.type==="transfer"?C.accent:C.expense,fontWeight:600,fontSize:12}}>{t.type==="income"?"+":t.type==="transfer"?"↔":"-"}{fc(t.amount)}</span>
                  <button className="btn-ghost btn-sm" style={{padding:"3px 7px"}} onClick={()=>openEditTx(t)}>✏️</button>
                  <button className="btn btn-danger" onClick={()=>deleteTx(t.id)}>×</button>
                </div>
              </div>
            ))}
          </div>
        </>}

        {/* ════════ BUDGET ════════ */}
        {tab==="Budget"&&<>
          {/* Smart Budget Reset — shows on salary day */}
          {salaryCountdown?.isToday && smartBudgetSuggestions?.length > 0 && showSmartBudget && (
            <div className="card" style={{marginBottom:12,borderColor:`${C.income}50`,background:`${C.income}06`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                <div>
                  <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:15,color:C.income,marginBottom:3}}>🎉 Salary Day! Smart Budget Suggestions</div>
                  <div style={{fontSize:11,color:C.muted}}>Based on your last 3 months average spending (+10% buffer)</div>
                </div>
                <button onClick={()=>setShowSmartBudget(false)} style={{background:"transparent",border:"none",color:C.muted,cursor:"pointer",fontSize:16,padding:"0 4px"}}>×</button>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:12}}>
                {smartBudgetSuggestions.map(s=>(
                  <div key={s.cat} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px",background:C.card,borderRadius:10,border:`1px solid ${C.border}`}}>
                    <div>
                      <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:13}}>{s.cat}</div>
                      <div style={{fontSize:10,color:C.muted}}>3-mo avg: {fc(s.avg)}</div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:14,color:C.accent}}>{fc(s.suggested)}</span>
                      <button className="btn btn-g btn-sm" onClick={()=>setBudgets(p=>({...p,[s.cat]:s.suggested}))}>Apply</button>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{display:"flex",gap:8}}>
                <button className="btn btn-p" style={{flex:1}} onClick={()=>{ smartBudgetSuggestions.forEach(s=>setBudgets(p=>({...p,[s.cat]:s.suggested}))); setShowSmartBudget(false); }}>✅ Apply All Suggestions</button>
                <button className="btn-ghost" style={{flex:1}} onClick={()=>setShowSmartBudget(false)}>Skip</button>
              </div>
            </div>
          )}
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
              const limit=budgets[cat]||0, spent=thisMonthTx.filter(t=>t.type==="expense"&&t.category===cat).reduce((s,t)=>s+(parseFloat(t.amount)||0),0);
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

        {/* ════════ INSIGHTS ════════ */}
        {tab==="Insights"&&<>
          {/* ── FINANCIAL CALENDAR ── */}
          {(()=>{
            const fc_cal = financialCalendar;
            const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
            const DAYS   = ["Su","Mo","Tu","We","Th","Fr","Sa"];
            const blanks = Array(fc_cal.firstDow).fill(null);
            const allDays = [...blanks, ...Array.from({length:fc_cal.daysInMonth},(_,i)=>i+1)];
            return(
              <div className="card" style={{marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <div>
                    <div className="stitle" style={{marginBottom:2}}>📅 Financial Calendar</div>
                    <div style={{fontSize:11,color:C.muted}}>{MONTHS[fc_cal.mo]} {fc_cal.yr}</div>
                  </div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    {[
                      {dot:"#00e5a0",label:"Salary"},
                      {dot:"#a78bfa",label:"EMI"},
                      {dot:"#ff7a45",label:"CC Bill"},
                      {dot:"#38bdf8",label:"Bills"},
                    ].map(l=>(
                      <div key={l.label} style={{display:"flex",alignItems:"center",gap:4}}>
                        <div style={{width:8,height:8,borderRadius:"50%",background:l.dot}}/>
                        <span style={{fontSize:9,color:C.muted,fontFamily:"'Cabinet Grotesk',sans-serif"}}>{l.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Day headers */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:4}}>
                  {DAYS.map(d=>(
                    <div key={d} style={{textAlign:"center",fontSize:9,color:C.muted,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,padding:"2px 0"}}>{d}</div>
                  ))}
                </div>
                {/* Calendar grid */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
                  {allDays.map((day,i)=>{
                    if (!day) return <div key={`b${i}`}/>;
                    const events = fc_cal.events[day]||[];
                    const isToday = day===fc_cal.todayDate;
                    const hasSalary   = events.some(e=>e.type==='salary');
                    const hasEmi      = events.some(e=>e.type==='emi');
                    const hasCC       = events.some(e=>e.type==='cc');
                    const hasRecurring= events.some(e=>e.type==='recurring');
                    const hasIncome   = events.some(e=>e.type==='income'&&e.actual);
                    const hasExpense  = events.some(e=>e.type==='expense'&&e.actual);
                    const totalAmt    = events.filter(e=>!e.actual).reduce((s,e)=>s+e.amount,0);
                    return(
                      <div key={day} style={{
                        borderRadius:8,padding:"4px 2px",
                        minHeight:44,
                        background: isToday?`${C.purple}25`:hasSalary?`#00e5a020`:C.surface,
                        border:`1px solid ${isToday?C.purple:hasSalary?"#00e5a040":C.border}`,
                        cursor: events.length>0?'pointer':'default',
                        position:'relative',
                      }}
                      onClick={()=>events.length>0&&setCalSelectedDay(calSelectedDay===day?null:day)}
                      >
                        <div style={{textAlign:"center",fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:isToday?900:500,fontSize:11,color:isToday?C.purple:C.text,marginBottom:2}}>{day}</div>
                        {/* Event dots */}
                        <div style={{display:"flex",flexWrap:"wrap",gap:1,justifyContent:"center"}}>
                          {hasSalary   && <div style={{width:5,height:5,borderRadius:"50%",background:"#00e5a0"}}/>}
                          {hasEmi      && <div style={{width:5,height:5,borderRadius:"50%",background:"#a78bfa"}}/>}
                          {hasCC       && <div style={{width:5,height:5,borderRadius:"50%",background:"#ff7a45"}}/>}
                          {hasRecurring&& <div style={{width:5,height:5,borderRadius:"50%",background:"#38bdf8"}}/>}
                          {hasIncome   && <div style={{width:5,height:5,borderRadius:"50%",background:"#00e5a0",opacity:0.6}}/>}
                          {hasExpense  && <div style={{width:5,height:5,borderRadius:"50%",background:"#ff4d6d",opacity:0.6}}/>}
                        </div>
                        {/* Amount label if significant */}
                        {totalAmt>0&&(
                          <div style={{textAlign:"center",fontSize:7,color:C.muted,fontFamily:"'Cabinet Grotesk',sans-serif",marginTop:1}}>
                            {totalAmt>=1000?`${(totalAmt/1000).toFixed(0)}k`:Math.round(totalAmt)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {/* Selected day detail */}
                {calSelectedDay&&fc_cal.events[calSelectedDay]&&(
                  <div style={{marginTop:12,padding:"12px",background:C.surface,borderRadius:12,border:`1px solid ${C.border}`}}>
                    <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:13,marginBottom:8,color:C.text}}>
                      {calSelectedDay} {MONTHS[fc_cal.mo]}
                    </div>
                    {fc_cal.events[calSelectedDay].map((ev,i)=>(
                      <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:i<fc_cal.events[calSelectedDay].length-1?`1px solid ${C.border}`:"none"}}>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <div style={{width:8,height:8,borderRadius:"50%",background:ev.color,flexShrink:0}}/>
                          <span style={{fontSize:12,color:C.text,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:600}}>{ev.label}</span>
                          {ev.actual&&<span style={{fontSize:9,color:C.muted,background:C.border,padding:"1px 5px",borderRadius:99}}>actual</span>}
                        </div>
                        <span style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:12,color:ev.color}}>{fc(ev.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── SPENDING PERSONALITY ── */}
          {spendingPersonality&&(
            <div className="card" style={{marginBottom:12,borderColor:`${spendingPersonality.color}40`,background:`${spendingPersonality.color}08`}}>
              <div style={{display:"flex",alignItems:"center",gap:14}}>
                <div style={{fontSize:42,flexShrink:0}}>{spendingPersonality.emoji}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:10,color:spendingPersonality.color,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:3}}>This Month's Personality</div>
                  <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:17,color:C.text,marginBottom:5}}>{spendingPersonality.title}</div>
                  <div style={{fontSize:12,color:C.muted,lineHeight:1.6}}>{spendingPersonality.desc}</div>
                </div>
              </div>
            </div>
          )}
          {!spendingPersonality&&(
            <div className="card" style={{marginBottom:12,textAlign:"center",padding:"20px 16px"}}>
              <div style={{fontSize:32,marginBottom:8}}>🎭</div>
              <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:14,color:C.text,marginBottom:4}}>Spending Personality</div>
              <div style={{fontSize:12,color:C.muted}}>Add this month's transactions to reveal your spending personality!</div>
            </div>
          )}
          {/* Key metrics */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10,marginBottom:12}}>
            {[
              {label:"Savings Rate",  val:`${effectiveIncome>0?((effectiveIncome-totalExpense)/effectiveIncome*100).toFixed(1):0}%`, color:C.income},
              {label:"Avg Mo. Expense",val:fc(last6Months.reduce((s,m)=>s+m.expense,0)/6),                                         color:C.expense},
              {label:"Debt-to-Income", val:`${effectiveIncome>0?(totalEMI/effectiveIncome*100).toFixed(0):0}%`,                     color:totalEMI/Math.max(effectiveIncome,1)>0.4?C.expense:C.income},
              {label:"Top Mode",       val:expenseByMode.sort((a,b)=>b.value-a.value)[0]?.name||"—",                              color:C.purple},
            ].map(item=>(
              <div key={item.label} className="scard" style={{textAlign:"center"}}>
                <div className="lbl" style={{textAlign:"center"}}>{item.label}</div>
                <div style={{fontSize:18,fontWeight:700,color:item.color,fontFamily:"'Cabinet Grotesk',sans-serif"}}>{item.val}</div>
              </div>
            ))}
          </div>

          {/* Monthly Scorecard */}
          <div className="card" style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:6}}>
              <div className="stitle" style={{marginBottom:0}}>📋 Monthly Scorecard</div>
              <span style={{fontSize:11,color:C.muted}}>{new Date().toLocaleDateString("en-IN",{month:"long",year:"numeric"})}</span>
            </div>
            {(()=>{
              const savRate=thisMonthInc>0?((thisMonthInc-thisMonthExp)/thisMonthInc*100):0;
              const dtiOk=effectiveIncome>0&&totalEMI/effectiveIncome<0.4;
              const budgetOk=spendAlerts.filter(a=>a.over).length===0;
              const savOk=savRate>=10;
              const score=[dtiOk,budgetOk,savOk].filter(Boolean).length;
              const vColor=score===3?C.income:score>=2?C.warning:C.expense;
              return(<>
                <div style={{textAlign:"center",padding:"10px 0 12px",borderBottom:`1px solid ${C.border}`,marginBottom:12}}>
                  <div style={{fontSize:18,fontWeight:800,color:vColor,fontFamily:"'Cabinet Grotesk',sans-serif"}}>
                    {score===3?"✅ On Track":score>=2?"⚠️ Needs Attention":"🚨 Action Required"}
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10}}>
                  {[
                    {label:"Income This Month",  val:fc(thisMonthInc),  color:C.income,  ok:thisMonthInc>0},
                    {label:"Spent This Month",   val:fc(thisMonthExp),  color:C.expense, ok:thisMonthExp<(effectiveIncome||Infinity)},
                    {label:"Saved This Month",   val:fc(Math.max(0,thisMonthInc-thisMonthExp)), color:C.savings, ok:savOk},
                    {label:"Savings Rate",       val:savRate.toFixed(1)+"%", color:savOk?C.income:C.expense, ok:savOk},
                    {label:"EMI Burden",         val:effectiveIncome>0?(totalEMI/effectiveIncome*100).toFixed(0)+"%":"—",             color:dtiOk?C.income:C.expense, ok:dtiOk},
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

          {/* Net Worth */}
          <div className="card" style={{marginBottom:12}}>
            <div className="stitle">💎 Net Worth</div>
            <div style={{textAlign:"center",padding:"8px 0 12px"}}>
              <div style={{fontSize:11,color:C.muted,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Assets − Liabilities</div>
              <div style={{fontSize:32,fontWeight:800,color:netWorth>=0?C.income:C.expense,fontFamily:"'Cabinet Grotesk',sans-serif"}}>{fc(netWorth)}</div>
              <div style={{fontSize:11,color:C.muted,marginTop:4}}>{netWorth>=0?"Assets exceed liabilities 👍":"More liabilities — keep paying down debt"}</div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <div style={{background:`${C.income}08`,borderRadius:12,padding:"12px",border:`1px solid ${C.income}25`}}>
                <div className="lbl" style={{color:C.income}}>+ Total Assets</div>
                <div style={{fontSize:16,fontWeight:800,color:C.income,fontFamily:"'Cabinet Grotesk',sans-serif"}}>{fc(totalAccountBalance+savingsTotal)}</div>
                <div style={{fontSize:10,color:C.muted,marginTop:3}}>Accounts {fc(totalAccountBalance)} + Savings {fc(savingsTotal)}</div>
              </div>
              <div style={{background:`${C.expense}08`,borderRadius:12,padding:"12px",border:`1px solid ${C.expense}25`}}>
                <div className="lbl" style={{color:C.expense}}>− Total Liabilities</div>
                <div style={{fontSize:16,fontWeight:800,color:C.expense,fontFamily:"'Cabinet Grotesk',sans-serif"}}>{fc(totalOutstanding+totalCCOut)}</div>
                <div style={{fontSize:10,color:C.muted,marginTop:3}}>Loans {fc(totalOutstanding)} + CC {fc(totalCCOut)}</div>
              </div>
            </div>
          </div>

          {/* Income vs Expense chart */}
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

          {/* This Month vs Last Month */}
          <div className="card" style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:6}}>
              <div className="stitle" style={{marginBottom:0}}>📊 This Month vs Last Month</div>
              <div style={{display:"flex",gap:8,fontSize:10,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700}}>
                <span style={{color:C.purple,background:`${C.purple}15`,padding:"3px 10px",borderRadius:99}}>
                  {new Date().toLocaleDateString("en-IN",{month:"short",year:"numeric"})}
                </span>
                <span style={{color:C.muted,background:C.surface,padding:"3px 10px",borderRadius:99,border:`1px solid ${C.border}`}}>
                  {(()=>{const n=new Date();const lm=n.getMonth()===0?11:n.getMonth()-1;const ly=n.getMonth()===0?n.getFullYear()-1:n.getFullYear();return new Date(ly,lm,1).toLocaleDateString("en-IN",{month:"short",year:"numeric"});})()}
                </span>
              </div>
            </div>

            {/* Income & Expense comparison cards */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
              {[
                {label:"Income",  thisVal:thisMonthInc, lastVal:lastMonthInc, color:C.income},
                {label:"Expenses",thisVal:thisMonthExp,  lastVal:lastMonthExp,  color:C.expense},
              ].map(item=>{
                const diff = item.thisVal - item.lastVal;
                const pct  = item.lastVal>0 ? Math.abs(diff/item.lastVal*100) : null;
                const better = item.label==="Income" ? diff>=0 : diff<=0;
                const hasLastData = item.lastVal > 0;
                return(
                  <div key={item.label} style={{background:C.surface,borderRadius:12,padding:"14px 12px",border:`1px solid ${C.border}`}}>
                    <div className="lbl">{item.label}</div>
                    {/* This month — big number */}
                    <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:16,color:item.color,marginBottom:6}}>{fc(item.thisVal)}</div>
                    {/* Last month row */}
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:4}}>
                      <div style={{fontSize:11,color:C.muted}}>
                        Last: <span style={{fontWeight:700,color:hasLastData?C.text:C.muted}}>{hasLastData?fc(item.lastVal):"No data"}</span>
                      </div>
                      {pct!==null
                        ? <div style={{fontSize:11,fontWeight:700,color:better?C.income:C.expense}}>
                            {diff>=0?"↑":"↓"} {pct.toFixed(1)}%
                          </div>
                        : <div style={{fontSize:10,color:C.muted,fontStyle:"italic"}}>—</div>
                      }
                    </div>
                    {/* Visual bar comparing this vs last */}
                    {hasLastData&&(
                      <div style={{marginTop:8}}>
                        <div style={{display:"flex",gap:2,height:4,borderRadius:99,overflow:"hidden",background:C.border}}>
                          <div style={{flex:Math.min(item.lastVal,item.thisVal)/Math.max(item.thisVal,item.lastVal,1),background:C.muted+"60",borderRadius:99}}/>
                          <div style={{flex:Math.abs(diff)/Math.max(item.thisVal,item.lastVal,1),background:better?C.income:C.expense,borderRadius:99}}/>
                        </div>
                        <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:C.muted,marginTop:3,fontFamily:"'Cabinet Grotesk',sans-serif"}}>
                          <span>Last month</span>
                          <span style={{color:better?C.income:C.expense}}>{better?"+":" "}{diff>=0?"+":""}{fc(diff)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* By Category breakdown */}
            <div style={{fontSize:11,color:C.muted,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,marginBottom:10,display:"flex",alignItems:"center",gap:8}}>
              <span>BY CATEGORY</span>
              <div style={{display:"flex",gap:6,fontSize:9}}>
                <span style={{display:"flex",alignItems:"center",gap:3}}><span style={{width:8,height:8,borderRadius:2,background:C.purple+"80",display:"inline-block"}}/> This month</span>
                <span style={{display:"flex",alignItems:"center",gap:3}}><span style={{width:8,height:8,borderRadius:2,background:C.muted+"50",display:"inline-block"}}/> Last month</span>
              </div>
            </div>
            {catComparison.length===0
              ? <div style={{textAlign:"center",padding:"16px 0",color:C.muted,fontSize:12}}>
                  <div style={{fontSize:24,marginBottom:6}}>📊</div>
                  No expense data yet this month.<br/>Add transactions to see comparison.
                </div>
              : catComparison.sort((a,b)=>(b.thisMonth+b.lastMonth)-(a.thisMonth+a.lastMonth)).slice(0,8).map(c=>{
                  const diff = c.thisMonth - c.lastMonth;
                  const maxVal = Math.max(c.thisMonth, c.lastMonth, 1);
                  return(
                    <div key={c.cat} style={{marginBottom:12}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:5,flexWrap:"wrap",gap:4}}>
                        <span style={{fontSize:12,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:600,color:C.text}}>{c.cat}</span>
                        <div style={{display:"flex",gap:8,fontSize:11,fontFamily:"'Cabinet Grotesk',sans-serif"}}>
                          <span style={{color:C.purple,fontWeight:700}}>{fc(c.thisMonth)}</span>
                          {c.lastMonth>0 && <span style={{color:C.muted}}>vs {fc(c.lastMonth)}</span>}
                          {diff!==0&&c.lastMonth>0&&<span style={{color:diff>0?C.expense:C.income,fontWeight:700}}>{diff>0?"↑":"↓"} {fc(Math.abs(diff))}</span>}
                          {c.lastMonth===0&&<span style={{color:C.muted,fontSize:10,fontStyle:"italic"}}>new</span>}
                        </div>
                      </div>
                      {/* Dual bar: last month (grey) + this month (colored) */}
                      <div style={{display:"flex",flexDirection:"column",gap:3}}>
                        {c.lastMonth>0&&(
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <span style={{fontSize:9,color:C.muted,width:28,textAlign:"right",fontFamily:"'Cabinet Grotesk',sans-serif"}}>Last</span>
                            <div style={{flex:1,height:5,background:C.border,borderRadius:99}}>
                              <div style={{width:`${(c.lastMonth/maxVal)*100}%`,height:"100%",background:C.muted+"60",borderRadius:99}}/>
                            </div>
                          </div>
                        )}
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <span style={{fontSize:9,color:C.purple,width:28,textAlign:"right",fontFamily:"'Cabinet Grotesk',sans-serif"}}>This</span>
                          <div style={{flex:1,height:5,background:C.border,borderRadius:99}}>
                            <div style={{width:`${(c.thisMonth/maxVal)*100}%`,height:"100%",background:diff>0?C.expense:C.income,borderRadius:99}}/>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
            }
          </div>

          {/* ── WEEKEND VS WEEKDAY SPENDING ── */}
          <div className="card" style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:6}}>
              <div className="stitle" style={{marginBottom:0}}>📅 Weekend vs Weekday</div>
              <span style={{fontSize:11,color:C.muted}}>Last 30 days</span>
            </div>
            {weekendVsWeekday.weekendTotal===0&&weekendVsWeekday.weekdayTotal===0
              ? <div style={{textAlign:"center",padding:20,color:C.muted,fontSize:12}}>Add transactions to see weekend vs weekday breakdown.</div>
              : <>
                  {/* Big comparison */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
                    {[
                      {label:"Weekend avg/day",val:weekendVsWeekday.weekendAvg,color:C.expense,icon:"🎉"},
                      {label:"Weekday avg/day",val:weekendVsWeekday.weekdayAvg,color:C.income,icon:"💼"},
                    ].map(item=>(
                      <div key={item.label} style={{background:C.surface,borderRadius:12,padding:"12px 14px",border:`1px solid ${C.border}`}}>
                        <div style={{fontSize:16,marginBottom:4}}>{item.icon}</div>
                        <div className="lbl">{item.label}</div>
                        <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:18,color:item.color}}>{fc(Math.round(item.val))}</div>
                      </div>
                    ))}
                  </div>
                  {/* Ratio insight */}
                  {weekendVsWeekday.ratio>0&&(
                    <div style={{padding:"10px 14px",background:weekendVsWeekday.ratio>2?`${C.expense}10`:`${C.income}10`,borderRadius:12,border:`1px solid ${weekendVsWeekday.ratio>2?C.expense:C.income}25`,marginBottom:12}}>
                      <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:13,color:weekendVsWeekday.ratio>2?C.expense:C.income}}>
                        {weekendVsWeekday.ratio>2
                          ? `⚠️ You spend ${weekendVsWeekday.ratio.toFixed(1)}× more on weekends!`
                          : weekendVsWeekday.ratio>1
                          ? `Weekend spending is ${weekendVsWeekday.ratio.toFixed(1)}× weekdays — fairly typical`
                          : `✅ Your weekday spending is higher — discipline on weekends!`}
                      </div>
                      {weekendVsWeekday.topWeekendCats.length>0&&(
                        <div style={{fontSize:11,color:C.muted,marginTop:4}}>Weekend goes to: {weekendVsWeekday.topWeekendCats.join(", ")}</div>
                      )}
                    </div>
                  )}
                  {/* By day of week bar chart */}
                  <div className="lbl" style={{marginBottom:8}}>AVERAGE SPEND BY DAY</div>
                  <div style={{display:"flex",gap:4,alignItems:"flex-end",height:80}}>
                    {weekendVsWeekday.byDay.map(day=>{
                      const maxAvg = Math.max(...weekendVsWeekday.byDay.map(d=>d.avg), 1);
                      const h = Math.max(4, (day.avg/maxAvg)*68);
                      const isPeak = weekendVsWeekday.peakDay?.name===day.name;
                      return(
                        <div key={day.name} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                          {isPeak&&<div style={{fontSize:8,color:C.expense,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700}}>💸</div>}
                          <div style={{width:"100%",height:h,borderRadius:6,background:day.isWeekend?`${C.expense}80`:C.income+"80",transition:"height 0.4s"}}/>
                          <div style={{fontSize:9,color:day.isWeekend?C.expense:C.muted,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:day.isWeekend?700:400}}>{day.name}</div>
                        </div>
                      );
                    })}
                  </div>
                  {weekendVsWeekday.peakDay&&(
                    <div style={{marginTop:10,fontSize:11,color:C.muted,textAlign:"center"}}>
                      💸 Biggest spend day: <span style={{color:C.expense,fontWeight:700}}>{weekendVsWeekday.peakDay.name}</span> · avg {fc(Math.round(weekendVsWeekday.peakDay.avg))}/day
                    </div>
                  )}
                </>
            }
          </div>

          {/* ── EXPENSE CALENDAR ── */}
          <div className="card" style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
              <div className="stitle" style={{marginBottom:0}}>🗓 Expense Calendar</div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <button onClick={()=>{ let m=calMonth-1,y=calYear; if(m<0){m=11;y--;} setCalMonth(m);setCalYear(y);setCalSelectedDay(null); }} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,width:28,height:28,cursor:"pointer",color:C.text,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>‹</button>
                <span style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:13,color:C.text,minWidth:100,textAlign:"center"}}>
                  {new Date(calYear,calMonth,1).toLocaleDateString("en-IN",{month:"long",year:"numeric"})}
                </span>
                <button onClick={()=>{ let m=calMonth+1,y=calYear; if(m>11){m=0;y++;} setCalMonth(m);setCalYear(y);setCalSelectedDay(null); }} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,width:28,height:28,cursor:"pointer",color:C.text,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>›</button>
              </div>
            </div>
            {(()=>{
              const daysInMo = new Date(calYear,calMonth+1,0).getDate();
              const firstDow = new Date(calYear,calMonth,1).getDay();
              const todayD = new Date();
              const isCurrentMo = calMonth===todayD.getMonth()&&calYear===todayD.getFullYear();
              // Build spend map for this month
              const spendMap = {};
              transactions.filter(t=>{
                const d = parseLocal(t.date);
                return d && t.type==="expense" && d.getMonth()===calMonth && d.getFullYear()===calYear;
              }).forEach(t=>{
                const day = parseLocal(t.date).getDate();
                if(!spendMap[day]) spendMap[day] = {total:0, txs:[]};
                spendMap[day].total += parseFloat(t.amount)||0;
                spendMap[day].txs.push(t);
              });
              // Daily average for color coding
              const spendVals = Object.values(spendMap).map(d=>d.total);
              const avgSpend = spendVals.length ? spendVals.reduce((s,v)=>s+v,0)/spendVals.length : 0;
              const getColor = (total) => {
                if (!total) return { bg:`${C.income}20`, text:C.income };
                if (total < avgSpend * 0.5) return { bg:`${C.income}30`, text:C.income };
                if (total < avgSpend) return { bg:`${C.warning}25`, text:C.warning };
                if (total < avgSpend * 2) return { bg:`${C.expense}25`, text:C.expense };
                return { bg:`${C.expense}50`, text:C.expense };
              };
              const zeroSpendDays = Array.from({length:daysInMo},(_,i)=>i+1).filter(d=>{
                const key = `${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
                const pastOrToday = !isCurrentMo || d <= todayD.getDate();
                return pastOrToday && !spendMap[d];
              });
              // Best streak in this month
              let bestStreak=0, curStreak=0;
              for(let d=1;d<=daysInMo;d++){
                const pastOrToday = !isCurrentMo||d<=todayD.getDate();
                if(pastOrToday&&!spendMap[d]){curStreak++;bestStreak=Math.max(bestStreak,curStreak);}
                else if(pastOrToday){curStreak=0;}
              }
              const highestDay = Object.entries(spendMap).sort((a,b)=>b[1].total-a[1].total)[0];
              const selectedTxs = calSelectedDay ? (spendMap[calSelectedDay]?.txs||[]) : [];
              return(
                <>
                  {/* Day headers */}
                  <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3,marginBottom:6}}>
                    {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d=>(
                      <div key={d} style={{textAlign:"center",fontSize:9,color:C.muted,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,paddingBottom:2}}>{d}</div>
                    ))}
                  </div>
                  {/* Calendar grid */}
                  <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3,marginBottom:12}}>
                    {Array.from({length:firstDow},(_,i)=><div key={"e"+i}/>)}
                    {Array.from({length:daysInMo},(_,i)=>{
                      const day = i+1;
                      const data = spendMap[day];
                      const isToday = isCurrentMo && day===todayD.getDate();
                      const isFuture = isCurrentMo && day>todayD.getDate();
                      const isSelected = calSelectedDay===day;
                      const col = isFuture ? {bg:"transparent",text:C.muted} : getColor(data?.total||0);
                      return(
                        <div key={day} onClick={()=>!isFuture&&setCalSelectedDay(isSelected?null:day)}
                          style={{
                            borderRadius:8,padding:"4px 2px",textAlign:"center",cursor:isFuture?"default":"pointer",
                            background:isSelected?C.purple:col.bg,
                            border:isToday?`2px solid ${C.purple}`:isSelected?`2px solid ${C.purpleLight}`:`1px solid transparent`,
                            opacity:isFuture?0.3:1,
                            transition:"all 0.15s",
                          }}>
                          <div style={{fontSize:11,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:isToday||data?700:400,color:isSelected?"#fff":isToday?C.purple:C.text}}>{day}</div>
                          {data&&!isFuture&&(
                            <div style={{fontSize:8,fontFamily:"'JetBrains Mono',monospace",color:isSelected?"rgba(255,255,255,0.85)":col.text,lineHeight:1,marginTop:1}}>
                              {data.total>=1000?`${(data.total/1000).toFixed(1)}k`:Math.round(data.total)}
                            </div>
                          )}
                          {!data&&!isFuture&&<div style={{fontSize:8,color:isSelected?"rgba(255,255,255,0.7)":C.income,lineHeight:1,marginTop:1}}>🟢</div>}
                        </div>
                      );
                    })}
                  </div>
                  {/* Selected day detail */}
                  {calSelectedDay&&(
                    <div style={{marginBottom:12,padding:"12px 14px",background:C.surface,borderRadius:12,border:`1px solid ${C.purple}30`}}>
                      <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:13,color:C.purple,marginBottom:8}}>
                        {new Date(calYear,calMonth,calSelectedDay).toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"short"})}
                      </div>
                      {selectedTxs.length===0
                        ? <div style={{fontSize:12,color:C.income,display:"flex",alignItems:"center",gap:6}}>🟢 Zero-spend day! Great job.</div>
                        : <>
                            {selectedTxs.map((t,i)=>(
                              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6,fontSize:12}}>
                                <div style={{display:"flex",alignItems:"center",gap:8}}>
                                  <div style={{width:6,height:6,borderRadius:"50%",background:C.expense,flexShrink:0}}/>
                                  <div>
                                    <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:600,color:C.text}}>{t.category}</div>
                                    {t.note&&<div style={{fontSize:10,color:C.muted}}>{t.note}</div>}
                                  </div>
                                </div>
                                <span style={{color:C.expense,fontWeight:700,fontFamily:"'Cabinet Grotesk',sans-serif"}}>{fc(t.amount)}</span>
                              </div>
                            ))}
                            <div style={{borderTop:`1px solid ${C.border}`,paddingTop:6,marginTop:4,display:"flex",justifyContent:"space-between",fontSize:12,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700}}>
                              <span>Total</span><span style={{color:C.expense}}>{fc(spendMap[calSelectedDay]?.total||0)}</span>
                            </div>
                          </>
                      }
                    </div>
                  )}
                  {/* Summary strip */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                    {[
                      {icon:"🟢",label:"Zero-spend days",val:zeroSpendDays.length},
                      {icon:"🔥",label:"Best streak",val:`${bestStreak}d`},
                      {icon:"🔴",label:"Biggest day",val:highestDay?`${highestDay[0]}${["st","nd","rd"][highestDay[0]-1]||"th"}`:"-"},
                    ].map(item=>(
                      <div key={item.label} style={{background:C.surface,borderRadius:10,padding:"10px 8px",textAlign:"center",border:`1px solid ${C.border}`}}>
                        <div style={{fontSize:16,marginBottom:3}}>{item.icon}</div>
                        <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:14,color:C.text}}>{item.val}</div>
                        <div style={{fontSize:9,color:C.muted,fontFamily:"'Cabinet Grotesk',sans-serif",marginTop:2}}>{item.label}</div>
                      </div>
                    ))}
                  </div>
                  {/* Legend */}
                  <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:10,justifyContent:"center"}}>
                    {[
                      {color:C.income,label:"Zero spend"},
                      {color:C.warning,label:"Low"},
                      {color:C.expense+"80",label:"Moderate"},
                      {color:C.expense,label:"High"},
                    ].map(l=>(
                      <div key={l.label} style={{display:"flex",alignItems:"center",gap:4,fontSize:9,color:C.muted,fontFamily:"'Cabinet Grotesk',sans-serif"}}>
                        <div style={{width:10,height:10,borderRadius:3,background:l.color}}/>
                        {l.label}
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
          </div>

          {/* Savings Rate Trend */}
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
          </div>

          {/* Debt-Free Countdown */}
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
                const withExtra=extra>0?Math.max(1,Math.ceil((totalOutstanding+totalCCOut)/(totalEMI+extra))):null;
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
                        <div style={{fontSize:14,fontWeight:700,color:C.loan,fontFamily:"'Cabinet Grotesk',sans-serif"}}>{fc(totalEMI)}</div>
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

          {/* EMI Due Calendar */}
          <div className="card" style={{marginBottom:12}}>
            <div className="stitle">📅 EMI Due Calendar</div>
            {(()=>{
              const now=new Date(),daysInMonth=new Date(now.getFullYear(),now.getMonth()+1,0).getDate(),firstDow=new Date(now.getFullYear(),now.getMonth(),1).getDay();
              const dueDays={};
              [...activeDebts,...creditCards].forEach(item=>{if(item.dueDate){const d=new Date(item.dueDate).getDate();if(!dueDays[d])dueDays[d]=[];dueDays[d].push({name:item.name,amt:parseFloat(item.emi||item.minDue||0)});}});
              const todayNum=now.getDate();
              return(<><div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3,marginBottom:10}}>{["Su","Mo","Tu","We","Th","Fr","Sa"].map(d=><div key={d} style={{textAlign:"center",fontSize:9,color:C.muted,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,paddingBottom:4}}>{d}</div>)}{Array.from({length:firstDow},(_,i)=><div key={"e"+i}/>)}{Array.from({length:daysInMonth},(_,i)=>{const day=i+1,dues=dueDays[day]||[],isToday=day===todayNum,isPast=day<todayNum;return(<div key={day} style={{textAlign:"center",padding:"5px 2px",borderRadius:7,fontSize:10,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:dues.length?700:400,background:dues.length?`${C.warning}20`:isToday?`${C.purple}20`:"transparent",border:isToday?`1px solid ${C.purple}`:dues.length?`1px solid ${C.warning}40`:`1px solid transparent`,color:dues.length?C.warning:isPast?C.muted:C.text,position:"relative"}}>{day}{dues.length>0&&<div style={{position:"absolute",top:1,right:2,width:4,height:4,borderRadius:"50%",background:C.expense}}/>}</div>);})}</div>{Object.keys(dueDays).length===0?<div style={{fontSize:12,color:C.muted,textAlign:"center",padding:10}}>No due dates set.</div>:<div style={{borderTop:`1px solid ${C.border}`,paddingTop:10}}>{Object.entries(dueDays).sort((a,b)=>+a[0]-+b[0]).map(([day,items])=>(<div key={day} style={{display:"flex",gap:10,marginBottom:8,alignItems:"flex-start"}}><div style={{width:28,height:28,borderRadius:8,background:`${C.warning}15`,color:C.warning,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:11,flexShrink:0}}>{day}</div><div style={{flex:1}}>{items.map((item,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:2}}><span>{item.name}</span><span style={{color:C.warning,fontWeight:700}}>{fc(item.amt)}</span></div>)}</div></div>))}<div style={{borderTop:`1px solid ${C.border}`,paddingTop:8,display:"flex",justifyContent:"space-between",fontSize:12,fontWeight:700}}><span style={{fontFamily:"'Cabinet Grotesk',sans-serif"}}>Total Due</span><span style={{color:C.warning}}>{fc(Object.values(dueDays).flat().reduce((s,d)=>s+d.amt,0))}</span></div></div>}</>);
            })()}
          </div>

          {/* 30-Day Cash Flow Forecast */}
          <div className="card" style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div className="stitle" style={{marginBottom:0}}>💰 30-Day Cash Flow</div>
              <span style={{fontSize:11,color:C.muted}}>projected balance</span>
            </div>
            {effectiveIncome===0?<div style={{fontSize:12,color:C.muted,textAlign:"center",padding:16}}>Set monthly income in Plan tab.</div>:(()=>{const minBal=Math.min(...cashFlowForecast.map(d=>d.balance));const endBal=cashFlowForecast[cashFlowForecast.length-1]?.balance||0;const dangerDays=cashFlowForecast.filter(d=>d.balance<0);return(<>{dangerDays.length>0&&<div style={{padding:"8px 12px",background:`${C.expense}10`,border:`1px solid ${C.expense}25`,borderRadius:10,fontSize:11,color:C.expense,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,marginBottom:10}}>🚨 Balance may go negative starting day {dangerDays[0].day}</div>}<ResponsiveContainer width="100%" height={140}><LineChart data={cashFlowForecast.filter((_,i)=>i%2===0)}><XAxis dataKey="label" tick={{fill:C.muted,fontSize:9}} axisLine={false} tickLine={false}/><YAxis tick={{fill:C.muted,fontSize:9}} axisLine={false} tickLine={false} tickFormatter={v=>`₹${Math.abs(v)>=1000?(v/1000).toFixed(0)+"k":v}`} width={42}/><Tooltip contentStyle={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,fontSize:11}} formatter={v=>[fc(v),"Balance"]}/><Line type="monotone" dataKey="balance" stroke={minBal<0?C.expense:C.income} strokeWidth={2} dot={false}/></LineChart></ResponsiveContainer><div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginTop:10}}>{[{label:"Now",val:cashLeft,color:cashLeft>=0?C.income:C.expense},{label:"Min (30d)",val:minBal,color:minBal>=0?C.income:C.expense},{label:"Day 30",val:endBal,color:endBal>=0?C.income:C.expense}].map(item=>(<div key={item.label} style={{background:C.surface,borderRadius:10,padding:"9px",textAlign:"center",border:`1px solid ${C.border}`}}><div className="lbl">{item.label}</div><div style={{fontSize:12,fontWeight:700,color:item.color,fontFamily:"'Cabinet Grotesk',sans-serif"}}>{fc(item.val)}</div></div>))}</div></>);})()}
          </div>
          {/* ── FINANCIAL CALENDAR ── */}
          <div className="card" style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div>
                <div className="stitle" style={{marginBottom:2}}>📅 Financial Calendar</div>
                <div style={{fontSize:11,color:C.muted}}>
                  {new Date(financialCalendar.yr, financialCalendar.mo, 1)
                    .toLocaleDateString("en-IN",{month:"long",year:"numeric"})}
                </div>
              </div>
              {/* Legend */}
              <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"flex-end"}}>
                {[
                  {color:"#00e5a0",label:"Salary"},
                  {color:"#a78bfa",label:"EMI"},
                  {color:"#ff7a45",label:"CC"},
                  {color:"#38bdf8",label:"Bill"},
                ].map(l=>(
                  <div key={l.label} style={{display:"flex",alignItems:"center",gap:3,fontSize:9,color:C.muted}}>
                    <div style={{width:8,height:8,borderRadius:2,background:l.color,flexShrink:0}}/>
                    {l.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Day grid */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3,marginBottom:12}}>
              {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d=>(
                <div key={d} style={{textAlign:"center",fontSize:9,color:C.muted,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,paddingBottom:4}}>{d}</div>
              ))}
              {Array.from({length:financialCalendar.firstDow},(_,i)=><div key={"e"+i}/>)}
              {Array.from({length:financialCalendar.daysInMonth},(_,i)=>{
                const day = i+1;
                const evts = financialCalendar.events[day]||[];
                const isToday = day===financialCalendar.todayDate;
                const isPast  = day<financialCalendar.todayDate;
                // Pick dot color by priority: salary > emi > cc > recurring > actual expense
                const dotColor = evts.find(e=>e.type==='salary')?.color
                  || evts.find(e=>e.type==='emi')?.color
                  || evts.find(e=>e.type==='cc')?.color
                  || evts.find(e=>e.type==='recurring')?.color
                  || evts.find(e=>e.type==='expense')?.color
                  || null;
                return(
                  <div key={day} style={{
                    textAlign:"center",padding:"5px 2px",borderRadius:8,
                    fontSize:10,fontFamily:"'Cabinet Grotesk',sans-serif",
                    fontWeight:isToday?900:evts.length?700:400,
                    background:isToday?`${C.purple}25`:evts.length?`${dotColor}15`:"transparent",
                    border:isToday?`1.5px solid ${C.purple}`:`1px solid transparent`,
                    color:isToday?C.purple:isPast?C.muted:C.text,
                    position:"relative",cursor:evts.length?"pointer":"default",
                    minHeight:28,
                  }}>
                    {day}
                    {dotColor&&(
                      <div style={{position:"absolute",bottom:2,left:"50%",transform:"translateX(-50%)",width:4,height:4,borderRadius:"50%",background:dotColor}}/>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Event list — only show future + today */}
            <div style={{borderTop:`1px solid ${C.border}`,paddingTop:12}}>
              <div className="lbl" style={{marginBottom:8}}>UPCOMING THIS MONTH</div>
              {(()=>{
                const upcoming = Object.entries(financialCalendar.events)
                  .filter(([day])=>parseInt(day)>=financialCalendar.todayDate)
                  .sort((a,b)=>parseInt(a[0])-parseInt(b[0]))
                  .flatMap(([day,evts])=>
                    evts.filter(e=>!e.actual).map(e=>({...e, day:parseInt(day)}))
                  )
                  .slice(0,8);
                if (!upcoming.length) return(
                  <div style={{textAlign:"center",padding:"12px 0",color:C.muted,fontSize:12}}>
                    No upcoming events — all done for this month! 🎉
                  </div>
                );
                return(
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    {upcoming.map((e,i)=>{
                      const daysAway = e.day - financialCalendar.todayDate;
                      return(
                        <div key={i} style={{
                          display:"flex",alignItems:"center",gap:10,
                          padding:"8px 10px",borderRadius:10,
                          background:`${e.color}10`,border:`1px solid ${e.color}25`,
                        }}>
                          <div style={{
                            width:32,height:32,borderRadius:8,
                            background:`${e.color}20`,
                            display:"flex",alignItems:"center",justifyContent:"center",
                            fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,
                            fontSize:11,color:e.color,flexShrink:0,
                          }}>
                            {e.day}
                          </div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:12,color:C.text}}>{e.label}</div>
                            <div style={{fontSize:10,color:C.muted,marginTop:1}}>
                              {daysAway===0?"Today":daysAway===1?"Tomorrow":`In ${daysAway} days`}
                            </div>
                          </div>
                          {e.amount>0&&(
                            <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:13,color:e.type==='salary'?C.income:C.expense,flexShrink:0}}>
                              {e.type==='salary'?"+":"-"}{fc(e.amount)}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>

        </>}

        {/* ════════ SMART ════════ */}
        {tab==="Smart"&&<>

          {/* ── SALARY SETUP ── */}
          <div className="card" style={{marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
              <div>
                <div className="stitle" style={{marginBottom:2}}>💰 Salary Setup</div>
                <div style={{fontSize:11,color:C.muted}}>Used for countdown, cash gap & budget suggestions</div>
              </div>
              {salaryCountdown?.alreadyCredited&&(
                <span style={{background:`${C.income}18`,color:C.income,padding:"4px 12px",borderRadius:99,fontSize:11,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700}}>✅ Credited this month</span>
              )}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
              <div>
                <div className="lbl">Monthly Salary ₹</div>
                <input className="inp" type="number" placeholder="e.g. 45000"
                  value={salary.amount}
                  onChange={e=>setSalary(p=>({...p,amount:e.target.value}))}/>
              </div>
              <div>
                <div className="lbl">Credit Day (date of month)</div>
                <input className="inp" type="number" min="1" max="31" placeholder="e.g. 5"
                  value={salary.creditDay}
                  onChange={e=>setSalary(p=>({...p,creditDay:e.target.value}))}/>
                <div style={{fontSize:10,color:C.muted,marginTop:4}}>
                  {salary.creditDay ? `Your salary credits on ${salary.creditDay}${["st","nd","rd"][parseInt(salary.creditDay)-1]||"th"} of every month` : "Which date does salary arrive?"}
                </div>
              </div>
            </div>
            <div>
              <div className="lbl">Bank / Employer (optional)</div>
              <input className="inp" placeholder="e.g. HDFC / Company Name"
                value={salary.bank}
                onChange={e=>setSalary(p=>({...p,bank:e.target.value}))}/>
            </div>
            {salaryCountdown&&!salaryCountdown.alreadyCredited&&(
              <div style={{marginTop:12,padding:"10px 14px",background:`${C.purple}10`,borderRadius:12,border:`1px solid ${C.purple}25`,fontSize:12,color:C.muted}}>
                💡 Next salary: <span style={{color:C.text,fontWeight:700}}>
                  {salaryCountdown.isToday ? "Today!" : `in ${salaryCountdown.daysLeft} days`}
                </span>
                {" · "}<span style={{fontSize:11}}>Add it as an <span style={{color:C.income,fontWeight:700,cursor:"pointer"}} onClick={()=>{setTxForm({...EMPTY_TX,type:"income",category:"Salary",amount:salary.amount||"",bank:salary.bank||""});setShowTxForm(true);}}>Income transaction</span> when credited.</span>
              </div>
            )}
          </div>
          {/* ── RECURRING BILLS ── */}
          <div className="card" style={{marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div>
                <div className="stitle" style={{marginBottom:2}}>🔁 Recurring Bills</div>
                <div style={{fontSize:11,color:C.muted}}>Monthly bills — track & never miss a payment</div>
              </div>
              <button className="btn btn-p btn-sm" onClick={()=>{setRecurringForm({id:null,name:"",amount:"",dueDay:"1",category:"Utilities",active:true,notes:""});setShowRecurringForm(true);}}>+ Add Bill</button>
            </div>
            {/* Summary strip */}
            {recurringBills.length>0&&(()=>{
              const active = recurringStatus.filter(b=>b.active);
              const paid   = active.filter(b=>b.paidThisMonth);
              const overdue= active.filter(b=>b.isOverdue);
              const upcoming=active.filter(b=>!b.paidThisMonth&&!b.isOverdue&&b.daysLeft<=5);
              const totalMo= active.reduce((s,b)=>s+(parseFloat(b.amount)||0),0);
              return(
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:14}}>
                  {[
                    {label:"Total/month",  val:fc(totalMo),           color:C.accent},
                    {label:"Paid",         val:`${paid.length}/${active.length}`, color:C.income},
                    {label:"Overdue",      val:overdue.length,         color:overdue.length>0?C.expense:C.muted},
                  ].map(s=>(
                    <div key={s.label} style={{background:C.surface,borderRadius:10,padding:"10px 12px",border:`1px solid ${C.border}`,textAlign:"center"}}>
                      <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:16,color:s.color}}>{s.val}</div>
                      <div style={{fontSize:9,color:C.muted,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,letterSpacing:0.5,textTransform:"uppercase",marginTop:2}}>{s.label}</div>
                    </div>
                  ))}
                </div>
              );
            })()}
            {recurringBills.length===0
              ? <div style={{textAlign:"center",padding:20,color:C.muted,fontSize:12}}>No recurring bills yet. Add your electricity, mobile, Netflix, etc.</div>
              : <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {recurringStatus.map((bill)=>{
                    const statusColor = bill.paidThisMonth?C.income:bill.isOverdue?C.expense:bill.daysLeft<=3?C.warning:C.muted;
                    return(
                      <div key={bill.id} style={{
                        display:"flex",alignItems:"center",gap:10,
                        padding:"10px 12px",borderRadius:12,
                        background:bill.paidThisMonth?`${C.income}08`:bill.isOverdue?`${C.expense}08`:C.surface,
                        border:`1px solid ${statusColor}30`,
                        opacity:bill.active?1:0.5,
                      }}>
                        <div style={{width:36,height:36,borderRadius:10,background:`${statusColor}15`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>
                          {bill.paidThisMonth?"✅":bill.isOverdue?"🔴":bill.daysLeft<=3?"⏳":"📄"}
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:13,color:C.text}}>{bill.name}</div>
                          <div style={{fontSize:10,color:statusColor,fontWeight:600,marginTop:1}}>
                            {bill.paidThisMonth?"✅ Paid this month"
                              :bill.isOverdue?`🔴 Overdue — was due ${bill.dueDay}th`
                              :bill.daysLeft===0?"Due today!"
                              :bill.daysLeft===1?"Due tomorrow"
                              :`Due in ${bill.daysLeft} days (${bill.dueDay}th)`}
                          </div>
                          {bill.notes&&<div style={{fontSize:10,color:C.muted,marginTop:1}}>{bill.notes}</div>}
                        </div>
                        <div style={{textAlign:"right",flexShrink:0}}>
                          <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:14,color:statusColor}}>{fc(parseFloat(bill.amount)||0)}</div>
                          <div style={{fontSize:9,color:C.muted,marginTop:2,textTransform:"uppercase",letterSpacing:0.5}}>{bill.category}</div>
                        </div>
                        <div style={{display:"flex",flexDirection:"column",gap:4,flexShrink:0}}>
                          <button className="btn-ghost" style={{padding:"3px 8px",fontSize:10}} onClick={()=>{setRecurringForm({...bill,id:bill.id});setShowRecurringForm(true);}}>✏️</button>
                          <button className="btn-ghost" style={{padding:"3px 8px",fontSize:10}} onClick={()=>toggleRecurring(bill.id)}>{bill.active?"⏸":"▶"}</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
            }
          </div>

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

          {/* ── FAMILY CONTRIBUTION CAP ── */}
          <div className="card" style={{marginBottom:14}}>
            <div style={{marginBottom:12}}>
              <div className="stitle" style={{marginBottom:2}}>👨‍👩‍👧 Family Contribution Cap</div>
              <div style={{fontSize:11,color:C.muted}}>Set a monthly limit to track and control family spending</div>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"flex-end",flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:140}}>
                <div className="lbl">Monthly Limit ₹</div>
                <input className="inp" type="number" placeholder="e.g. 20000"
                  value={familyCap} onChange={e=>setFamilyCap(e.target.value)}/>
              </div>
              {familyCapStatus.cap>0&&(
                <div style={{flex:1,minWidth:140,padding:"10px 14px",background:familyCapStatus.over?`${C.expense}10`:`${C.income}08`,borderRadius:12,border:`1px solid ${familyCapStatus.over?C.expense:C.income}25`}}>
                  <div style={{fontSize:11,color:C.muted,marginBottom:2}}>This month</div>
                  <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:16,color:familyCapStatus.over?C.expense:C.income}}>{fc(familyCapStatus.spent)}</div>
                  <div style={{fontSize:10,color:C.muted}}>{familyCapStatus.over?`Over by ${fc(familyCapStatus.spent-familyCapStatus.cap)}`:`${fc(familyCapStatus.remaining)} remaining`}</div>
                </div>
              )}
            </div>
            <div style={{fontSize:10,color:C.muted,marginTop:8,lineHeight:1.6}}>
              💡 Add family expenses with category <span style={{fontWeight:700,color:C.text}}>"Family"</span> to track against this limit.
            </div>
          </div>
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
                        <div style={{fontSize:9,color:C.muted,marginTop:4,textAlign:"center",lineHeight:1.4}}>Balance correction only</div>
                        <div style={{display:"flex",gap:4,marginTop:4}}>
                          <button className="btn-ghost" style={{flex:1,padding:"4px",fontSize:11}} onClick={()=>{const v=prompt("Correction amount to ADD:\n(Use this only to fix opening balance,\nnot for regular income)");const n=parseFloat(v);if(!isNaN(n)&&n>0)updateAccountBalance(a.id,n);}}>+ Correct</button>
                          <button className="btn-ghost" style={{flex:1,padding:"4px",fontSize:11}} onClick={()=>{const v=prompt("Correction amount to DEDUCT:\n(Use this only to fix opening balance,\nnot for regular expenses)");const n=parseFloat(v);if(!isNaN(n)&&n>0)updateAccountBalance(a.id,-n);}}>− Correct</button>
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

        {tab==="Circles"&&<>

          {/* Cash Gap Warning Banner */}
          {cashGap.hasCashGap&&(
            <div className="card" style={{marginBottom:14,borderColor:`${C.warning}50`,background:`${C.warning}08`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10,flexWrap:"wrap",gap:8}}>
                <div>
                  <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:15,color:C.warning,marginBottom:3}}>⚠️ Cash Gap Detected!</div>
                  <div style={{fontSize:12,color:C.muted,lineHeight:1.7}}>Your salary arrives in <span style={{color:C.text,fontWeight:700}}>{cashGap.daysToSal} days</span>. Bills of <span style={{color:C.expense,fontWeight:700}}>{fc(cashGap.totalBillsDue)}</span> are due before then.</div>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:10}}>
                {[
                  {label:"Bills Due",    val:fc(cashGap.totalBillsDue), color:C.expense},
                  {label:"Cash in Hand", val:fc(cashGap.currentCash),   color:C.income},
                  {label:"Gap Amount",   val:fc(cashGap.gap),           color:C.warning},
                ].map(item=>(
                  <div key={item.label} style={{background:C.card,borderRadius:10,padding:"10px 12px",textAlign:"center",border:`1px solid ${C.border}`}}>
                    <div className="lbl">{item.label}</div>
                    <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:14,color:item.color}}>{item.val}</div>
                  </div>
                ))}
              </div>
              {cashGap.billsDue.length>0&&(
                <div style={{fontSize:11,color:C.muted,borderTop:`1px solid ${C.border}`,paddingTop:8}}>
                  <span style={{fontWeight:700,color:C.text}}>Bills due before salary: </span>
                  {cashGap.billsDue.map(b=>`${b.name||b.bank} ${fc(parseFloat(b.emi||b.minDue)||0)}`).join(" · ")}
                </div>
              )}
              <button className="btn btn-p btn-sm" style={{marginTop:10,width:"100%"}}
                onClick={()=>{setCircleForm({...EMPTY_CIRCLE,purpose:"Bill Payment",amount:String(Math.ceil(cashGap.gap))});setShowCircleForm(true);}}>
                💸 Record a Borrow for this Gap
              </button>
            </div>
          )}

          {/* Summary Stats */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
            <div style={{background:`${C.expense}10`,borderRadius:16,padding:"16px 14px",border:`1px solid ${C.expense}25`}}>
              <div className="lbl" style={{color:C.expense}}>You Owe</div>
              <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:22,color:C.expense}}>{fc(circleStats.totalOwed)}</div>
              <div style={{fontSize:11,color:C.muted,marginTop:3}}>{circleStats.borrowed.length} pending</div>
            </div>
            <div style={{background:`${C.income}10`,borderRadius:16,padding:"16px 14px",border:`1px solid ${C.income}25`}}>
              <div className="lbl" style={{color:C.income}}>You'll Get</div>
              <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:22,color:C.income}}>{fc(circleStats.totalToGet)}</div>
              <div style={{fontSize:11,color:C.muted,marginTop:3}}>{circleStats.lent.length} pending</div>
            </div>
          </div>

          {/* Overdue Alert */}
          {circleStats.overdue.length>0&&(
            <div style={{marginBottom:14,padding:"12px 14px",background:`${C.expense}10`,borderRadius:12,border:`1px solid ${C.expense}40`}}>
              <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:13,color:C.expense,marginBottom:6}}>🚨 Overdue — {circleStats.overdue.length} entry{circleStats.overdue.length>1?"s":""}</div>
              {circleStats.overdue.map(c=>(
                <div key={c.id} style={{fontSize:12,color:C.muted,marginBottom:3}}>
                  {c.type==="borrowed"?"You owe":"Receive from"} <span style={{color:C.text,fontWeight:700}}>{c.person}</span> — {fc(c.amount)} · {Math.abs(daysUntil(c.returnDate))}d overdue
                </div>
              ))}
            </div>
          )}

          {/* Due This Week */}
          {circleStats.dueThisWeek.length>0&&(
            <div style={{marginBottom:14,padding:"12px 14px",background:`${C.warning}10`,borderRadius:12,border:`1px solid ${C.warning}30`}}>
              <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:13,color:C.warning,marginBottom:6}}>⏰ Due this week</div>
              {circleStats.dueThisWeek.map(c=>(
                <div key={c.id} style={{fontSize:12,color:C.muted,marginBottom:3}}>
                  {c.type==="borrowed"?"Pay back":"Collect from"} <span style={{color:C.text,fontWeight:700}}>{c.person}</span> — {fc(c.amount)} · in {daysUntil(c.returnDate)}d
                </div>
              ))}
            </div>
          )}

          {/* Pending Circles */}
          <div className="card" style={{marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div className="sec-hdr-title">💸 Active Circles</div>
              <button className="btn btn-p btn-sm" onClick={()=>{setCircleForm({...EMPTY_CIRCLE});setEditCircleId(null);setShowCircleForm(true);}}>+ Add</button>
            </div>
            {circleStats.pending.length===0
              ? <div style={{textAlign:"center",padding:"24px 0",color:C.muted,fontSize:12}}>
                  <div style={{fontSize:36,marginBottom:8}}>🤝</div>
                  No active borrows or lends.<br/>
                  <span style={{color:C.purple,cursor:"pointer",fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700}}
                    onClick={()=>{setCircleForm({...EMPTY_CIRCLE});setShowCircleForm(true);}}>
                    + Record one now
                  </span>
                </div>
              : <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {circleStats.pending.map(c=>{
                    const days = c.returnDate ? daysUntil(c.returnDate) : null;
                    const isOverdue = days!==null && days<0;
                    const isBorrowed = c.type==="borrowed";
                    const accentColor = isBorrowed ? C.expense : C.income;
                    return(
                      <div key={c.id} style={{background:C.surface,borderRadius:14,padding:"14px",border:`1px solid ${isOverdue?C.expense+"50":accentColor+"25"}`}}>
                        {/* Header */}
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                          <div style={{display:"flex",alignItems:"center",gap:10}}>
                            <div style={{width:40,height:40,borderRadius:12,background:`${accentColor}18`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>
                              {isBorrowed?"💸":"💰"}
                            </div>
                            <div>
                              <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:14,color:C.text}}>{c.person}</div>
                              <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:0.5}}>
                                {isBorrowed?"You borrowed":"You lent"} · {c.purpose||"—"}
                              </div>
                            </div>
                          </div>
                          <div style={{textAlign:"right"}}>
                            <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:17,color:accentColor}}>{fc(c.amount)}</div>
                            {days!==null&&(
                              <div style={{fontSize:10,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,
                                color:isOverdue?C.expense:days<=3?C.warning:C.muted}}>
                                {isOverdue?`🚨 ${Math.abs(days)}d overdue`:days===0?"Due today!":days===1?"Due tomorrow":`in ${days}d`}
                              </div>
                            )}
                          </div>
                        </div>
                        {/* Dates */}
                        <div style={{display:"flex",gap:16,fontSize:10,color:C.muted,marginBottom:10}}>
                          <span>📅 Borrowed: {fd(c.borrowedDate)}</span>
                          {c.returnDate&&<span>🔁 Return by: {fd(c.returnDate)}</span>}
                        </div>
                        {c.notes&&<div style={{fontSize:11,color:C.muted,fontStyle:"italic",marginBottom:10,padding:"6px 10px",background:C.card,borderRadius:8}}>"{c.notes}"</div>}
                        {/* Actions */}
                        <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
                          <button className="btn btn-g btn-sm" onClick={()=>markCircleReturned(c.id)}>
                            ✅ {isBorrowed?"Returned":"Received"}
                          </button>
                          <button className="btn-ghost btn-sm" onClick={()=>openEditCircle(c)}>Edit</button>
                          <button className="btn btn-danger" onClick={()=>deleteCircle(c.id)}>Delete</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
            }
          </div>

          {/* History */}
          {circleStats.returned.length>0&&(
            <div className="card" style={{marginBottom:14}}>
              <div className="sec-hdr">
                <div className="sec-hdr-title">✅ History</div>
                <span style={{fontSize:11,color:C.muted,fontFamily:"'Cabinet Grotesk',sans-serif"}}>{circleStats.returned.length} settled</span>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {[...circleStats.returned].reverse().slice(0,10).map(c=>(
                  <div key={c.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 12px",background:C.surface,borderRadius:12,border:`1px solid ${C.border}`,opacity:0.8}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <div style={{width:32,height:32,borderRadius:10,background:`${C.income}15`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>
                        {c.type==="borrowed"?"💸":"💰"}
                      </div>
                      <div>
                        <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:12,color:C.text}}>{c.person}</div>
                        <div style={{fontSize:10,color:C.muted}}>{c.type==="borrowed"?"Borrowed & returned":"Lent & received"} · {c.purpose||"—"}</div>
                      </div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:13,color:C.income}}>{fc(c.amount)}</div>
                      {c.returnedDate&&<div style={{fontSize:10,color:C.muted}}>{fd(c.returnedDate)}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Buffer Fund Tip */}
          <div style={{padding:"14px 16px",borderRadius:14,background:`${C.purple}10`,border:`1px solid ${C.purple}25`,marginBottom:14}}>
            <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:13,color:C.purple,marginBottom:6}}>💡 Stop the Borrow Cycle</div>
            {(()=>{
              const avgMonthlyBills = totalEMI || 0;
              const bufferNeeded = avgMonthlyBills + (totalExpense/6 || 5000);
              const salDay = parseInt(salary?.creditDay)||5;
              return(
                <div style={{fontSize:12,color:C.muted,lineHeight:1.8}}>
                  Build a <span style={{color:C.purple,fontWeight:700}}>Bill Buffer</span> of {fc(Math.ceil(bufferNeeded/1000)*1000)} to cover bills before your salary on <span style={{fontWeight:700,color:C.text}}>{salDay}{salDay===1?"st":salDay===2?"nd":salDay===3?"rd":"th"} of every month</span>.<br/>
                  Set aside <span style={{color:C.income,fontWeight:700}}>{fc(Math.ceil(bufferNeeded/4/100)*100)}/week</span> and in 4 weeks you'll never need to borrow again. 🎉
                </div>
              );
            })()}
          </div>

        </>}

        {/* ════════ MORE ════════ */}
        {tab==="More"&&<>
          {/* ── MORE MENU GRID ── */}
          <div style={{marginBottom:16}}>
            <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:20,color:C.text,marginBottom:4}}>More</div>
            <div style={{fontSize:12,color:C.muted}}>All features in one place</div>
          </div>

          {/* Section grid */}
          {[
            {icon:"💳",label:"Credit Cards",   sub:"Cards, CC EMIs, utilization",  tab:"Cards"},
            {icon:"🎯",label:"Budget",          sub:"Monthly limits & tracking",    tab:"Budget"},
            {icon:"⚙️",label:"Smart Settings",  sub:"Salary, recurring bills, accounts", tab:"Smart"},
            {icon:"🔵",label:"Money Circles",   sub:"Borrow & lend tracking",       tab:"Circles"},
            {icon:"💸",label:"Transactions",    sub:"All income & expenses",        tab:"Transactions"},
            {icon:"📈",label:"Insights",        sub:"Charts, calendar, trends",     tab:"Insights"},
            {icon:"📊",label:"Plan",            sub:"Debt, goals, investments",     tab:"Plan"},
          ].map(item=>(
            <div key={item.tab} className="card" style={{marginBottom:10,cursor:"pointer",padding:"14px 16px"}}
              onClick={()=>navigateTo(item.tab)}>
              <div style={{display:"flex",alignItems:"center",gap:14}}>
                <div style={{width:44,height:44,borderRadius:13,background:`${C.purple}15`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>{item.icon}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:15,color:C.text,marginBottom:2}}>{item.label}</div>
                  <div style={{fontSize:11,color:C.muted}}>{item.sub}</div>
                </div>
                <div style={{fontSize:18,color:C.muted,flexShrink:0}}>›</div>
              </div>
            </div>
          ))}

          {/* Quick stats strip */}
          <div style={{marginTop:4,padding:"14px 16px",background:C.surface,borderRadius:16,border:`1px solid ${C.border}`}}>
            <div className="lbl" style={{marginBottom:10}}>AT A GLANCE</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10}}>
              {[
                {label:"Active Loans",    val:activeDebts.length,                  icon:"🏦"},
                {label:"Credit Cards",    val:creditCards.length,                  icon:"💳"},
                {label:"Savings Goals",   val:savings.length,                      icon:"🎯"},
                {label:"Investments",     val:investments.length,                  icon:"📈"},
                {label:"Recurring Bills", val:recurringBills.filter(b=>b.active).length, icon:"🔁"},
                {label:"Money Circles",   val:moneyCircles.filter(c=>!c.returned).length, icon:"🔵"},
              ].map(s=>(
                <div key={s.label} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",background:C.card,borderRadius:10,border:`1px solid ${C.border}`}}>
                  <span style={{fontSize:18}}>{s.icon}</span>
                  <div>
                    <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:16,color:C.text,lineHeight:1}}>{s.val}</div>
                    <div style={{fontSize:10,color:C.muted,marginTop:1}}>{s.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>}

        {/* ── Circle Form Modal ── */}
        {showCircleForm&&(
          <div className="modal" onClick={e=>e.target===e.currentTarget&&(setShowCircleForm(false),setEditCircleId(null))}>
            <div className="sheet">
              {/* Purple header */}
              <div style={{background:`linear-gradient(135deg,${C.purple},${C.purpleLight})`,borderRadius:16,padding:"14px 16px",marginBottom:20,textAlign:"center"}}>
                <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:17,color:"#fff"}}>
                  {editCircleId?"Edit Entry":"💸 Record Borrow / Lend"}
                </div>
              </div>

              {/* Type toggle */}
              <div className="tx-seg" style={{marginBottom:16}}>
                {[["borrowed","💸 I Borrowed"],["lent","💰 I Lent"]].map(([v,l])=>(
                  <button key={v} className={`tx-seg-btn ${circleForm.type===v?"on":""}`}
                    onClick={()=>setCircleForm(p=>({...p,type:v}))}>
                    {l}
                  </button>
                ))}
              </div>

              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <div>
                  <div className="lbl">{circleForm.type==="borrowed"?"Borrowed from *":"Lent to *"}</div>
                  <input className="inp" placeholder="Person's name e.g. Rakesh bhai"
                    value={circleForm.person} onChange={e=>setCircleForm(p=>({...p,person:e.target.value}))}/>
                </div>
                <div>
                  <div className="lbl">Amount ₹ *</div>
                  <input className="inp" type="number" placeholder="e.g. 8000"
                    value={circleForm.amount} onChange={e=>setCircleForm(p=>({...p,amount:e.target.value}))}/>
                </div>
                <div>
                  <div className="lbl">Purpose</div>
                  <select className="inp" value={circleForm.purpose} onChange={e=>setCircleForm(p=>({...p,purpose:e.target.value}))}>
                    <option value="">Select purpose</option>
                    {CIRCLE_PURPOSES.map(p=><option key={p}>{p}</option>)}
                  </select>
                </div>
                <div className="g2">
                  <div>
                    <div className="lbl">Date {circleForm.type==="borrowed"?"Borrowed":"Lent"}</div>
                    <input className="inp" type="date" value={circleForm.borrowedDate}
                      onChange={e=>setCircleForm(p=>({...p,borrowedDate:e.target.value}))}/>
                  </div>
                  <div>
                    <div className="lbl">Return By Date</div>
                    <input className="inp" type="date" value={circleForm.returnDate}
                      onChange={e=>setCircleForm(p=>({...p,returnDate:e.target.value}))}/>
                  </div>
                </div>
                <div>
                  <div className="lbl">Used For / Notes</div>
                  <input className="inp" placeholder="e.g. Paid electricity bill ₹3,200 · Groceries ₹800"
                    value={circleForm.notes} onChange={e=>setCircleForm(p=>({...p,notes:e.target.value}))}/>
                </div>
                <div style={{display:"flex",gap:10,marginTop:4}}>
                  <button className="btn btn-ghost" onClick={()=>{setShowCircleForm(false);setEditCircleId(null);}} style={{flex:1,borderRadius:99}}>Cancel</button>
                  <button className="btn btn-p" onClick={saveCircle} style={{flex:2}}>
                    {editCircleId?"Save Changes":"Save"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Install PWA Banner ── */}
      {showInstallBanner&&!isInstalled&&(
        <div className="install-banner">
          <div style={{width:40,height:40,borderRadius:12,background:"rgba(255,255,255,0.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>₹</div>
          <div style={{flex:1}}>
            <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:13,color:"#fff",marginBottom:2}}>Install FinTrack App</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.75)"}}>Add to home screen for native app feel</div>
          </div>
          <button onClick={handleInstall} style={{background:"#fff",color:"#7b4fd4",border:"none",borderRadius:99,padding:"8px 14px",fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:12,cursor:"pointer",flexShrink:0}}>Install</button>
          <button onClick={()=>setShowInstallBanner(false)} style={{background:"transparent",border:"none",color:"rgba(255,255,255,0.7)",cursor:"pointer",fontSize:18,padding:"0 4px",flexShrink:0}}>×</button>
        </div>
      )}

      {/* ── Update Available Banner ── */}
      {showUpdateBanner&&(
        <div className="update-banner">
          <span>🆕 New version available!</span>
          <button onClick={()=>{window.location.reload();}} style={{background:"rgba(0,0,0,0.15)",border:"none",borderRadius:99,padding:"5px 14px",color:"inherit",fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:12,cursor:"pointer"}}>Reload</button>
        </div>
      )}

      {/* ── Mobile Bottom Nav — Fintastics style ── */}
      <nav className="bnav">
        {MOBILE_TABS.slice(0,2).map(t=>(
          <button key={t.id} className={`bn ${tab===t.id?"act":""}`} onClick={()=>navigateTo(t.id)}>
            <span style={{fontSize:20}}>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
        {/* Centre FAB — perfectly centered between 2 left and 2 right */}
        <div style={{flex:"0 0 72px",display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
          <button className="bn-fab" onClick={()=>{setTxForm({...EMPTY_TX});setEditTxId(null);setShowTxForm(true);}}>
            <span style={{fontSize:26,lineHeight:1,color:"inherit",fontWeight:900}}>+</span>
          </button>
        </div>
        {MOBILE_TABS.slice(2).map(t=>(
          <button key={t.id} className={`bn ${tab===t.id?"act":""}`} onClick={()=>navigateTo(t.id)}>
            <span style={{fontSize:20}}>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      {/* ── Hamburger Menu (mobile only) ── */}
      {showMenu&&<div className="hmenu-overlay" onClick={()=>setShowMenu(false)}/>}
      <div className={`hmenu ${showMenu?"open":""}`}>
        <div style={{padding:"20px 20px 12px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:28,height:28,background:`linear-gradient(135deg,${C.purple},${C.purpleLight})`,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:13}}>₹</div>
            <span style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:15}}>FinTrack</span>
          </div>
          <button onClick={()=>setShowMenu(false)} style={{background:"transparent",border:"none",color:C.muted,fontSize:20,cursor:"pointer",padding:"2px 6px"}}>×</button>
        </div>
        <div style={{padding:"8px 0",flex:1,overflowY:"auto"}}>
          <div style={{padding:"6px 20px 4px",fontSize:9,color:C.muted,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,letterSpacing:1.5,textTransform:"uppercase"}}>Navigation</div>
          {ALL_TABS.map(t=>{
            const icons={"Dashboard":"🏠","Plan":"🎯","Cards":"💳","Transactions":"📋","Budget":"🎯","Insights":"🔍","Smart":"⚡","Circles":"💸"};
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
            {/* Purple header */}
            <div style={{background:`linear-gradient(135deg,${C.purple},${C.purpleLight})`,borderRadius:16,padding:"14px 16px",marginBottom:20,textAlign:"center"}}>
              <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:900,fontSize:17,color:"#fff",marginBottom:2}}>{editTxId?"Edit Transaction":"Add Transaction"}</div>
              <div style={{fontSize:10,color:"rgba(255,255,255,0.7)",fontFamily:"'Cabinet Grotesk',sans-serif"}}>{new Date().toLocaleDateString("en-IN",{weekday:"short",day:"numeric",month:"short",year:"numeric"})}</div>
            </div>

            {/* Expense / Income / Transfer segmented tabs */}
            <div className="tx-seg" style={{marginBottom:18}}>
              {[["expense","↓ Expense"],["income","↑ Income"],["transfer","↔ Transfer"]].map(([type,label])=>(
                <button key={type} className={`tx-seg-btn ${txForm.type===type?"on":""}`}
                  onClick={()=>setTxForm(p=>({...p,type,category:type==="transfer"?"Transfer":allCategories[type]?.[0]||""}))}>
                  {label}
                </button>
              ))}
            </div>

            {/* Transfer UI — simple two-account selector */}
            {txForm.type==="transfer"?(
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                <div style={{padding:"12px 14px",background:`${C.accent}10`,borderRadius:12,border:`1px solid ${C.accent}25`,fontSize:11,color:C.muted,lineHeight:1.7}}>
                  ↔ <span style={{fontWeight:700,color:C.text}}>Bank Transfer</span> — moves money between your accounts. Does <b>not</b> count as income or expense.
                </div>
                <div>
                  <div className="lbl">Amount ₹ *</div>
                  <input className="inp-line" type="number" placeholder="0.00"
                    value={txForm.amount} onChange={e=>setTxForm(p=>({...p,amount:e.target.value}))}
                    style={{fontSize:22,fontWeight:800,color:C.accent,flex:1,width:"100%"}}/>
                </div>
                <div className="g2">
                  <div>
                    <div className="lbl">From Account *</div>
                    <select className="inp" value={txForm._accountId} onChange={e=>setTxForm(p=>({...p,_accountId:e.target.value}))}>
                      <option value="">Select account</option>
                      {accounts.map(a=><option key={a.id} value={a.id}>{a.icon||"🏦"} {a.name} · {fc(parseFloat(a.balance)||0)}</option>)}
                    </select>
                  </div>
                  <div>
                    <div className="lbl">To Account *</div>
                    <select className="inp" value={txForm._toAccountId} onChange={e=>setTxForm(p=>({...p,_toAccountId:e.target.value}))}>
                      <option value="">Select account</option>
                      {accounts.filter(a=>String(a.id)!==String(txForm._accountId)).map(a=><option key={a.id} value={a.id}>{a.icon||"🏦"} {a.name} · {fc(parseFloat(a.balance)||0)}</option>)}
                    </select>
                  </div>
                </div>
                <div className="g2">
                  <div><div className="lbl">Date</div><input className="inp" type="date" value={txForm.date} onChange={e=>setTxForm(p=>({...p,date:e.target.value}))}/></div>
                  <div><div className="lbl">Note (optional)</div><input className="inp" placeholder="e.g. Moving to savings" value={txForm.note} onChange={e=>setTxForm(p=>({...p,note:e.target.value}))}/></div>
                </div>
                {txForm._accountId&&txForm._toAccountId&&txForm.amount&&(
                  <div style={{padding:"10px 14px",background:`${C.income}10`,borderRadius:12,border:`1px solid ${C.income}25`,fontSize:12,color:C.muted}}>
                    ↔ Moving <span style={{color:C.accent,fontWeight:700}}>{fc(parseFloat(txForm.amount)||0)}</span> from <span style={{fontWeight:700,color:C.text}}>{accounts.find(a=>String(a.id)===String(txForm._accountId))?.name}</span> → <span style={{fontWeight:700,color:C.text}}>{accounts.find(a=>String(a.id)===String(txForm._toAccountId))?.name}</span>
                  </div>
                )}
                <div style={{display:"flex",gap:10,marginTop:4}}>
                  <button className="btn btn-ghost" onClick={()=>{setShowTxForm(false);setEditTxId(null);}} style={{flex:1,borderRadius:99}}>Cancel</button>
                  <button className="btn btn-p" onClick={saveTx} style={{flex:2}}
                    disabled={!txForm._accountId||!txForm._toAccountId||!txForm.amount}>
                    {editTxId?"Save Transfer":"Transfer"}
                  </button>
                </div>
              </div>
            ):(

            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              {/* Amount — large underline field */}
              <div>
                <div className="lbl">Enter your Amount *</div>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:18,color:txForm.type==="income"?C.income:C.expense}}>
                    {txForm.type==="income"?"↑":"↓"}
                  </span>
                  <input className="inp-line" type="number" placeholder="0.00"
                    value={txForm.amount} onChange={e=>setTxForm(p=>({...p,amount:e.target.value}))}
                    style={{fontSize:22,fontWeight:800,color:txForm.type==="income"?C.income:C.expense,flex:1}}/>
                  <span style={{fontSize:11,color:C.muted,fontFamily:"'Cabinet Grotesk',sans-serif",whiteSpace:"nowrap"}}>
                    {new Date().toLocaleDateString("en-IN",{day:"2-digit",month:"short"})}
                  </span>
                </div>
              </div>

              {/* Category */}
              <div>
                <div className="lbl">Name your category *</div>
                <div style={{display:"flex",alignItems:"center",gap:8,borderBottom:`1.5px solid ${C.border}`,paddingBottom:10}}>
                  <span style={{fontSize:16}}>🏷</span>
                  <select style={{background:"transparent",border:"none",color:C.text,flex:1,fontSize:14,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:600,outline:"none",cursor:"pointer"}}
                    value={txForm.category} onChange={e=>setTxForm(p=>({...p,category:e.target.value}))}>
                    {allCategories[txForm.type].map(c=><option key={c}>{c}</option>)}
                  </select>
                  <span style={{color:C.purple,fontSize:18,fontWeight:300}}>+</span>
                </div>
              </div>

              {/* Payment Mode */}
              <div>
                <div className="lbl">Payment Mode *</div>
                <div style={{display:"flex",alignItems:"center",gap:8,borderBottom:`1.5px solid ${C.border}`,paddingBottom:10}}>
                  <span style={{fontSize:16}}>🏦</span>
                  <select style={{background:"transparent",border:"none",color:C.text,flex:1,fontSize:14,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:600,outline:"none",cursor:"pointer"}}
                    value={txForm.paymentMode} onChange={e=>setTxForm(p=>({...p,paymentMode:e.target.value,bank:""}))}>
                    {PAYMENT_MODES.map(m=><option key={m}>{m}</option>)}
                  </select>
                  <span style={{color:C.purple,fontSize:18,fontWeight:300}}>+</span>
                </div>
              </div>

              {/* Account / Card selector */}
              <div className="g2">
                <div>
                  <div className="lbl">{txForm.paymentMode==="Credit Card"?"Credit Card Used":txForm.type==="income"?"Deposit To":"Paid From"}</div>
                  {txForm.paymentMode==="Credit Card"
                    ? <select className="inp" value={txForm.bank} onChange={e=>setTxForm(p=>({...p,bank:e.target.value,_accountId:""}))}>
                        <option value="">Select card</option>
                        {creditCards.map(c=><option key={c.id} value={c.name}>{c.name} · {c.bank}</option>)}
                      </select>
                    : <select className="inp" value={txForm._accountId} onChange={e=>setTxForm(p=>({...p,_accountId:e.target.value}))}>
                        <option value="">No account</option>
                        {accounts.map(a=><option key={a.id} value={a.id}>{a.icon||"🏦"} {a.name}</option>)}
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
                    🕐 Now
                  </button>
                </div>
              </div>

              <div><div className="lbl">Note</div><input className="inp" placeholder="What was this for?" value={txForm.note} onChange={e=>setTxForm(p=>({...p,note:e.target.value}))}/></div>

              {/* Buttons */}
              <div style={{display:"flex",gap:10,marginTop:4}}>
                <button className="btn btn-ghost" onClick={()=>{setShowTxForm(false);setEditTxId(null);}} style={{flex:1,borderRadius:99}}>Cancel</button>
                <button className="btn btn-p" onClick={saveTx} style={{flex:2}}>{editTxId?"Save Changes":"Save"}</button>
              </div>
            </div>
            )}
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
                <div>
                  <div className="lbl">Next Due Date *</div>
                  <input className="inp" type="date" value={debtForm.dueDate} onChange={e=>setDebtForm(p=>({...p,dueDate:e.target.value}))}/>
                  <div style={{fontSize:10,color:C.muted,marginTop:4}}>The date your next EMI is due (e.g. 5th April)</div>
                </div>
                <div>
                  <div className="lbl">First Auto-Deduction Date</div>
                  <input className="inp" type="date" value={debtForm.emiStartDate} onChange={e=>setDebtForm(p=>({...p,emiStartDate:e.target.value}))}/>
                  <div style={{fontSize:10,marginTop:4,color:debtForm.emiStartDate?C.accent:C.muted}}>
                    {debtForm.emiStartDate
                      ? `✅ App starts tracking from ${parseLocal(debtForm.emiStartDate)?.toLocaleDateString("en-IN",{month:"short",year:"numeric"})}`
                      : "Old loan? Leave blank — app tracks from this month only. New loan starting later? Set the first EMI date."}
                  </div>
                </div>
              </div>
              <div>
                <div className="lbl">Tenure</div>
                <input className="inp" placeholder="e.g. 5 years or 60 months" value={debtForm.tenure} onChange={e=>setDebtForm(p=>({...p,tenure:e.target.value}))}/>
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

      {/* Recurring Bill Form */}
      {showRecurringForm&&(
        <div className="modal" onClick={e=>e.target===e.currentTarget&&(setShowRecurringForm(false))}>
          <div className="sheet">
            <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:17,marginBottom:14}}>
              {recurringForm.id?"Edit":"Add"} Recurring Bill
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <div className="g2">
                <div>
                  <div className="lbl">Bill Name *</div>
                  <input className="inp" placeholder="e.g. Electricity, Netflix" value={recurringForm.name}
                    onChange={e=>setRecurringForm(p=>({...p,name:e.target.value}))}/>
                </div>
                <div>
                  <div className="lbl">Amount ₹ *</div>
                  <input className="inp" type="number" placeholder="e.g. 1200" value={recurringForm.amount}
                    onChange={e=>setRecurringForm(p=>({...p,amount:e.target.value}))}/>
                </div>
              </div>
              <div className="g2">
                <div>
                  <div className="lbl">Due Day (date of month)</div>
                  <input className="inp" type="number" min="1" max="31" placeholder="e.g. 10" value={recurringForm.dueDay}
                    onChange={e=>setRecurringForm(p=>({...p,dueDay:e.target.value}))}/>
                </div>
                <div>
                  <div className="lbl">Category</div>
                  <select className="inp" value={recurringForm.category} onChange={e=>setRecurringForm(p=>({...p,category:e.target.value}))}>
                    {["Utilities","Subscriptions","Insurance","Mobile","Internet","Rent","EMI","Other"].map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <div className="lbl">Notes (optional)</div>
                <input className="inp" placeholder="e.g. BESCOM electricity, paid via UPI" value={recurringForm.notes}
                  onChange={e=>setRecurringForm(p=>({...p,notes:e.target.value}))}/>
              </div>
              <div style={{display:"flex",gap:9,marginTop:4}}>
                <button className="btn" onClick={()=>setShowRecurringForm(false)} style={{flex:1,background:C.border,color:C.muted}}>Cancel</button>
                <button className="btn btn-p" onClick={saveRecurring} style={{flex:2}}>{recurringForm.id?"Save Changes":"Add Bill"}</button>
              </div>
              {recurringForm.id&&(
                <button className="btn" onClick={()=>{deleteRecurring(recurringForm.id);setShowRecurringForm(false);}} style={{width:"100%",background:`${C.expense}15`,color:C.expense,border:`1px solid ${C.expense}30`}}>Delete Bill</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Recurring Bill Form Modal ── */}
      {showRecurringForm&&(
        <div className="modal" onClick={e=>e.target===e.currentTarget&&(setShowRecurringForm(false))}>
          <div className="sheet">
            <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:17,marginBottom:14}}>
              {recurringForm.id?"Edit":"Add"} Recurring Bill
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <div className="g2">
                <div>
                  <div className="lbl">Bill Name *</div>
                  <input className="inp" placeholder="e.g. Electricity, Netflix" value={recurringForm.name}
                    onChange={e=>setRecurringForm(p=>({...p,name:e.target.value}))}/>
                </div>
                <div>
                  <div className="lbl">Amount ₹ *</div>
                  <input className="inp" type="number" placeholder="e.g. 1200" value={recurringForm.amount}
                    onChange={e=>setRecurringForm(p=>({...p,amount:e.target.value}))}/>
                </div>
              </div>
              <div className="g2">
                <div>
                  <div className="lbl">Due Day (date of month)</div>
                  <input className="inp" type="number" min="1" max="31" placeholder="e.g. 10"
                    value={recurringForm.dueDay}
                    onChange={e=>setRecurringForm(p=>({...p,dueDay:e.target.value}))}/>
                </div>
                <div>
                  <div className="lbl">Category</div>
                  <select className="inp" value={recurringForm.category}
                    onChange={e=>setRecurringForm(p=>({...p,category:e.target.value}))}>
                    {["Utilities","Subscriptions","Rent","Insurance","EMI","Other"].map(c=>(
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <div className="lbl">Notes (optional)</div>
                <input className="inp" placeholder="e.g. Paid via HDFC autopay"
                  value={recurringForm.notes}
                  onChange={e=>setRecurringForm(p=>({...p,notes:e.target.value}))}/>
              </div>
              <div style={{display:"flex",gap:9,marginTop:4}}>
                <button className="btn btn-ghost" onClick={()=>setShowRecurringForm(false)} style={{flex:1}}>Cancel</button>
                <button className="btn btn-p" onClick={saveRecurring} style={{flex:2}}>
                  {recurringForm.id?"Save Changes":"Add Bill"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CC EMI Form ── */}
      {showCCEmiForm&&(
        <div className="modal" onClick={e=>e.target===e.currentTarget&&(setShowCCEmiForm(false),setCcEmiForm({...EMPTY_CC_EMI}))}>
          <div className="sheet">
            <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:17,marginBottom:14}}>{ccEmiForm.id?"Edit":"Add"} CC EMI</div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <div>
                <div className="lbl">Credit Card *</div>
                <select className="inp" value={ccEmiForm.cardId} onChange={e=>setCcEmiForm(p=>({...p,cardId:e.target.value}))}>
                  <option value="">-- Select Card --</option>
                  {creditCards.map(c=><option key={c.id} value={String(c.id)}>{c.name} · {c.bank}</option>)}
                </select>
                {creditCards.length===0&&<div style={{fontSize:11,color:C.expense,marginTop:4}}>Add a credit card first.</div>}
              </div>
              <div>
                <div className="lbl">What did you buy?</div>
                <input className="inp" placeholder="e.g. iPhone 15, Samsung TV" value={ccEmiForm.description}
                  onChange={e=>setCcEmiForm(p=>({...p,description:e.target.value}))}/>
              </div>
              <div className="g2">
                <div>
                  <div className="lbl">EMI ₹/month *</div>
                  <input className="inp" type="number" placeholder="e.g. 3000" value={ccEmiForm.amount}
                    onChange={e=>setCcEmiForm(p=>({...p,amount:e.target.value}))}/>
                </div>
                <div>
                  <div className="lbl">Months Remaining *</div>
                  <input className="inp" type="number" placeholder="e.g. 12" value={ccEmiForm.monthsLeft}
                    onChange={e=>setCcEmiForm(p=>({...p,monthsLeft:e.target.value,_totalMonths:p._totalMonths||e.target.value}))}/>
                </div>
              </div>
              {ccEmiForm.amount&&ccEmiForm.monthsLeft&&(
                <div style={{padding:"10px 14px",background:`${C.warning}12`,border:`1px solid ${C.warning}25`,borderRadius:10,display:"flex",justifyContent:"space-between"}}>
                  <span style={{fontSize:11,color:C.muted}}>Total remaining</span>
                  <span style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,color:C.warning}}>{fc((parseFloat(ccEmiForm.amount)||0)*(parseFloat(ccEmiForm.monthsLeft)||0))}</span>
                </div>
              )}
              <div style={{display:"flex",gap:9,marginTop:4}}>
                <button className="btn btn-ghost" onClick={()=>{setShowCCEmiForm(false);setCcEmiForm({...EMPTY_CC_EMI});}} style={{flex:1}}>Cancel</button>
                <button className="btn btn-p" onClick={saveCCEmi} style={{flex:2}}>{ccEmiForm.id?"Save":"Add EMI"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Investment Form ── */}
      {showInvForm&&(
        <div className="modal" onClick={e=>e.target===e.currentTarget&&(setShowInvForm(false),setInvForm({...EMPTY_INVESTMENT}),setEditInvId(null))}>
          <div className="sheet">
            <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:17,marginBottom:14}}>{editInvId?"Edit":"Add"} Investment</div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <div>
                <div className="lbl">Fund / Investment Name *</div>
                <input className="inp" placeholder="e.g. HDFC Midcap Fund, SBI Gold ETF" value={invForm.name}
                  onChange={e=>setInvForm(p=>({...p,name:e.target.value}))}/>
              </div>
              <div className="g2">
                <div>
                  <div className="lbl">Type</div>
                  <select className="inp" value={invForm.type} onChange={e=>setInvForm(p=>({...p,type:e.target.value}))}>
                    {["MF","SIP","Stocks","FD","RD","PPF","NPS","Gold","Crypto","Other"].map(t=>(
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="lbl">Start Date</div>
                  <input className="inp" type="date" value={invForm.startDate}
                    onChange={e=>setInvForm(p=>({...p,startDate:e.target.value}))}/>
                </div>
              </div>

              {/* Amount — only for non-SIP investments */}
              {!invForm.isSIP&&(
                <div>
                  <div className="lbl">Amount Invested ₹ *</div>
                  <input className="inp" type="number" placeholder="e.g. 50000" value={invForm.amount}
                    onChange={e=>setInvForm(p=>({...p,amount:e.target.value}))}/>
                  <div style={{fontSize:10,color:C.muted,marginTop:3}}>Total amount invested so far</div>
                </div>
              )}
              <div className="g2">
                <div>
                  <div className="lbl">Units (for MF/Stocks)</div>
                  <input className="inp" type="number" placeholder="e.g. 123.456" value={invForm.units}
                    onChange={e=>setInvForm(p=>({...p,units:e.target.value}))}/>
                </div>
                <div>
                  <div className="lbl">Current NAV / Price ₹</div>
                  <input className="inp" type="number" placeholder="e.g. 48.23" value={invForm.nav}
                    onChange={e=>setInvForm(p=>({...p,nav:e.target.value}))}/>
                </div>
              </div>
              {invForm.units&&invForm.nav&&(invForm.amount||invForm.isSIP)&&(
                <div style={{padding:"10px 14px",background:`${C.income}10`,borderRadius:10,border:`1px solid ${C.income}25`,display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
                  <span style={{fontSize:11,color:C.muted}}>Current Value</span>
                  <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:13}}>
                    <span style={{color:C.accent}}>{fc((parseFloat(invForm.units)||0)*(parseFloat(invForm.nav)||0))}</span>
                    {" · "}
                    <span style={{color:(parseFloat(invForm.units)||0)*(parseFloat(invForm.nav)||0)>=getSIPTotalInvested(invForm)?C.income:C.expense}}>
                      {(parseFloat(invForm.units)||0)*(parseFloat(invForm.nav)||0)>=getSIPTotalInvested(invForm)?"+":""}{fc(Math.round(((parseFloat(invForm.units)||0)*(parseFloat(invForm.nav)||0))-getSIPTotalInvested(invForm)))} gain
                    </span>
                  </div>
                </div>
              )}
              <div>
                <div className="lbl">Notes</div>
                <input className="inp" placeholder="e.g. Monthly SIP ₹5000" value={invForm.notes}
                  onChange={e=>setInvForm(p=>({...p,notes:e.target.value}))}/>
              </div>

              {/* ── SIP Setup ── */}
              <div style={{background:C.surface,borderRadius:12,padding:"12px 14px",border:`1px solid ${C.border}`}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:invForm.isSIP?12:0}}>
                  <div>
                    <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:13,color:C.text}}>🔁 Set up as SIP</div>
                    <div style={{fontSize:10,color:C.muted,marginTop:2}}>Auto-remind & one-tap process monthly</div>
                  </div>
                  <div style={{
                    width:44,height:24,borderRadius:99,
                    background:invForm.isSIP?C.income:C.border,
                    cursor:"pointer",position:"relative",transition:"background 0.2s",
                    flexShrink:0,
                  }} onClick={()=>setInvForm(p=>({...p,isSIP:!p.isSIP}))}>
                    <div style={{
                      position:"absolute",top:3,left:invForm.isSIP?22:3,
                      width:18,height:18,borderRadius:"50%",background:"#fff",
                      transition:"left 0.2s",boxShadow:"0 1px 4px rgba(0,0,0,0.2)"
                    }}/>
                  </div>
                </div>
                {invForm.isSIP&&(
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    <div className="g2">
                      <div>
                        <div className="lbl">SIP Amount ₹/month *</div>
                        <input className="inp" type="number" placeholder="e.g. 5000"
                          value={invForm.sipAmount}
                          onChange={e=>setInvForm(p=>({...p,sipAmount:e.target.value}))}/>
                      </div>
                      <div>
                        <div className="lbl">Deduction Date</div>
                        <input className="inp" type="number" min="1" max="31" placeholder="e.g. 5"
                          value={invForm.sipDay}
                          onChange={e=>setInvForm(p=>({...p,sipDay:e.target.value}))}/>
                        <div style={{fontSize:10,color:C.muted,marginTop:3}}>
                          {invForm.sipDay?`Every ${invForm.sipDay}${['st','nd','rd'][invForm.sipDay-1]||'th'} of month`:'Which date?'}
                        </div>
                      </div>
                    </div>
                    <div>
                      <div className="lbl">SIP Start Month *</div>
                      <input className="inp" type="month"
                        value={invForm.sipStartDate ? invForm.sipStartDate.slice(0,7) : ''}
                        onChange={e=>setInvForm(p=>({...p,sipStartDate:e.target.value+'-01'}))}/>
                      <div style={{fontSize:10,color:C.muted,marginTop:3}}>
                        {invForm.sipStartDate&&invForm.sipAmount?(()=>{
                          const start = new Date(invForm.sipStartDate);
                          const now   = new Date();
                          const sipDay = parseInt(invForm.sipDay)||1;
                          let count=0, d=new Date(start.getFullYear(),start.getMonth(),sipDay);
                          if(start.getDate()>sipDay) d=new Date(start.getFullYear(),start.getMonth()+1,sipDay);
                          const today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
                          while(d<=today){count++;d=new Date(d.getFullYear(),d.getMonth()+1,sipDay);}
                          const total=(count*(parseFloat(invForm.sipAmount)||0));
                          return `${count} instalments completed → ₹${total.toLocaleString('en-IN')} total invested`;
                        })():'Enter start date to auto-calculate total'}
                      </div>
                    </div>
                    <div>
                      <div className="lbl">Deduct From Account</div>
                      <select className="inp" value={invForm.sipAccountId}
                        onChange={e=>setInvForm(p=>({...p,sipAccountId:e.target.value}))}>
                        <option value="">Select account</option>
                        {accounts.map(a=><option key={a.id} value={String(a.id)}>{a.icon||"🏦"} {a.name} · {fc(parseFloat(a.balance)||0)}</option>)}
                      </select>
                    </div>
                    {invForm.sipAmount&&invForm.sipDay&&invForm.sipStartDate&&(
                      <div style={{padding:"10px 14px",background:`${C.income}10`,borderRadius:10,border:`1px solid ${C.income}25`,fontSize:11,color:C.muted,lineHeight:1.8}}>
                        ✅ App will <strong>auto-calculate</strong> your total invested from the start date.<br/>
                        📅 Reminder on <strong>{invForm.sipDay}th</strong> every month to process ₹{parseFloat(invForm.sipAmount||0).toLocaleString('en-IN')} with one tap.
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div style={{display:"flex",gap:9,marginTop:4}}>
                <button className="btn btn-ghost" onClick={()=>{setShowInvForm(false);setInvForm({...EMPTY_INVESTMENT});setEditInvId(null);}} style={{flex:1}}>Cancel</button>
                <button className="btn btn-p" onClick={saveInvestment} style={{flex:2}}>{editInvId?"Save":"Add Investment"}</button>
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


      {/* Settings */}
      {showSettings&&<SettingsModal C={C} banks={banks} setBanks={setBanks} onClose={() => setShowSettings(false)} notifPermission={notifPermission} onEnableNotif={requestNotifPermission} />}

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
function SettingsModal({ C, banks, setBanks, onClose, notifPermission, onEnableNotif }) {
  const [newBank, setNewBank] = useState("");

  return(
    <div className="modal" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="sheet">
        <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:800,fontSize:17,marginBottom:18}}>⚙️ Settings</div>

        <div style={{marginBottom:20,padding:"14px 16px",borderRadius:14,border:`1.5px solid ${notifPermission==="granted"?C.income:C.border}`,background:notifPermission==="granted"?`${C.income}08`:"transparent"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <div style={{fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700,fontSize:13,color:notifPermission==="granted"?C.income:C.text}}>🔔 Notifications</div>
            {notifPermission==="granted"
              ? <span style={{fontSize:11,color:C.income,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700}}>✅ Enabled</span>
              : notifPermission==="denied"
              ? <span style={{fontSize:11,color:C.expense,fontFamily:"'Cabinet Grotesk',sans-serif",fontWeight:700}}>❌ Blocked in browser</span>
              : <button onClick={onEnableNotif} className="btn btn-g btn-sm">Enable Notifications</button>
            }
          </div>
          {notifPermission==="granted" && (
            <div style={{fontSize:11,color:C.muted,lineHeight:1.7}}>
              You will get alerts for:<br/>
              • EMI due in 3 days, 1 day, today &amp; overdue<br/>
              • Credit card bill due reminders<br/>
              • Budget overspend warnings<br/>
              • Low balance warning before EMI dates<br/>
              • Daily expense reminder (after 8 PM)
            </div>
          )}
          {notifPermission==="denied" && (
            <div style={{fontSize:11,color:C.muted,marginTop:4}}>
              Go to browser Settings → Site Settings → Notifications → allow for this site. Then refresh the app.
            </div>
          )}
          {notifPermission==="default" && (
            <div style={{fontSize:11,color:C.muted,marginTop:4}}>
              Tap Enable to get EMI reminders, budget alerts and daily nudges directly in your browser.
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
