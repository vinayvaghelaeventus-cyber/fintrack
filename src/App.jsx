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
const ALL_TABS = ["Dashboard","Transactions","Finance","Plan","Cards","Budget","Insights","Smart"];
const todayStr = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const EMPTY_TX = {type:"expense",amount:"",category:"Food",paymentMode:"UPI",bank:"",note:"",date:todayStr(),time:new Date().toTimeString().slice(0,5),_accountId:""};
const EMPTY_DEBT = {name:"",lender:"",outstanding:"",totalAmount:"",emi:"",interestRate:"",dueDate:"",emiStartDate:"",tenure:"",notes:""};
const EMPTY_CC   = {name:"",bank:"",limit:"",outstanding:"",minDue:"",statementDate:"",dueDate:"",interestRate:"36",notes:""};
const EMPTY_CC_EMI = {id:null, cardId:"", description:"", amount:"", monthsLeft:"", _totalMonths:""};
const EMPTY_SAL  = {amount:"",bank:"",creditDay:"1",active:true};
const EMPTY_ACCOUNT = {id:null, name:"", type:"savings", balance:"", bank:"", color:"#5b8def", icon:"🏦"};
const ACCOUNT_TYPES = ["savings","current","cash","wallet","fd","other"];
const ACCOUNT_ICONS = ["🏦","💰","💵","📱","🏧","💼"];

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const fc = n => new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(n||0);
const fd = d => { try { return new Date(d).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}); } catch { return "—"; }};
const parseLocal = ds => { if(!ds) return null; const p=String(ds).split("-").map(Number); return new Date(p[0], p[1]-1, p[2]); };
function daysUntil(ds){ if(!ds)return null; const d=parseLocal(ds), t=new Date(); t.setHours(0,0,0,0); d.setHours(0,0,0,0); return Math.ceil((d-t)/864e5); }
function toCSV(rows,headers){ return [headers.join(","),...rows.map(r=>headers.map(h=>{ const v=String(r[h]??""); return '"'+v.split('"').join('""')+'"'; }).join(","))].join("\n"); }
function dlCSV(c,f){ const a=document.createElement("a"); a.href="data:text/csv;charset=utf-8,\uFEFF"+encodeURIComponent(c); a.download=f; a.click(); }

// ─── MATH FUNCTIONS (RETAINED FROM ORIGINAL) ─────────────────────────────────
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

// ─── MAIN APP ────────────────────────────────────────────────────────────────
export default function App() {
  // ── UI state ──
  const [darkMode, setDarkMode] = useState(true);
  const [tab, setTab] = useState("Dashboard");
  const [user, setUser] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const C = darkMode ? DARK : LIGHT;

  // ── Financial Data ──
  const [transactions, setTransactions] = useState([]);
  const [debts, setDebts] = useState([]);
  const [creditCards, setCreditCards] = useState([]);
  const [ccEmis, setCcEmis] = useState([]);
  const [savings, setSavings] = useState([]);
  const [budgets, setBudgets] = useState({});
  const [accounts, setAccounts] = useState([]);
  const [monthlyIncome, setMonthlyIncome] = useState("");
  const [extraFund, setExtraFund] = useState("");
  const [strategy, setStrategy] = useState("avalanche");
  const [emergencyFund, setEmergencyFund] = useState("");
  const [customCats, setCustomCats] = useState({income:[], expense:[]});

  // ── Form States ──
  const [showTxForm, setShowTxForm] = useState(false);
  const [txForm, setTxForm] = useState({...EMPTY_TX});
  const [editTxId, setEditTxId] = useState(null);

  // ── AUTH ──
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => setUser(currentUser));
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => { try { await signInWithPopup(auth, provider); } catch (e) { console.error(e); } };
  const handleLogout = async () => { await signOut(auth); };

  // ── FIREBASE LOADING (RETAINED LOGIC) ──
  useEffect(() => {
    if (!user) return;
    async function load() {
      const data = await loadData(user.uid);
      if (data) {
        if(data.transactions) setTransactions(data.transactions);
        if(data.debts) setDebts(data.debts);
        if(data.creditCards) setCreditCards(data.creditCards);
        if(data.ccEmis) setCcEmis(data.ccEmis);
        if(data.budgets) setBudgets(data.budgets);
        if(data.accounts) setAccounts(data.accounts);
        if(data.monthlyIncome) setMonthlyIncome(data.monthlyIncome);
        if(data.extraFund) setExtraFund(data.extraFund);
        if(data.strategy) setStrategy(data.strategy);
        if(data.customCats) setCustomCats(data.customCats);
        if(data.darkMode !== undefined) setDarkMode(data.darkMode);
      }
      setLoaded(true);
    }
    load();
  }, [user]);

  // ── AUTO-SAVE LOGIC ──
  const saveTimeout = useRef(null);
  useEffect(() => {
    if (!loaded || !user) return;
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(async () => {
      setSaving(true);
      await saveData(user.uid, {
        transactions, debts, creditCards, ccEmis, budgets, accounts,
        monthlyIncome, extraFund, strategy, customCats, darkMode,
        lastUpdated: new Date().toISOString(),
      });
      setLastSaved(new Date());
      setSaving(false);
    }, 1500);
  }, [transactions, debts, creditCards, ccEmis, budgets, accounts, monthlyIncome, extraFund, strategy, customCats, loaded, user, darkMode]);

  // ── COMPUTED STATS ──
  const totalAccountBalance = useMemo(() => accounts.reduce((s, a) => s + (parseFloat(a.balance) || 0), 0), [accounts]);
  const activeDebts = useMemo(() => debts.filter(d=>!d.closed), [debts]);
  const totalEMI = useMemo(() => activeDebts.reduce((s,d)=>s+(parseFloat(d.emi)||0),0), [activeDebts]);
  const totalCCOut = useMemo(() => creditCards.reduce((s,c)=>s+(parseFloat(c.outstanding)||0),0), [creditCards]);
  const totalCCEMI = useMemo(() => ccEmis.reduce((s,e)=>s+(parseFloat(e.amount)||0),0), [ccEmis]);
  const totalExpense = useMemo(() => transactions.filter(t=>t.type==="expense").reduce((s,t)=>s+t.amount,0), [transactions]);
  const cashLeft = (parseFloat(monthlyIncome) || 0) - totalEMI - totalCCEMI - totalExpense;

  const health = useMemo(() => calcHealthScore({
    income: parseFloat(monthlyIncome) || 0,
    emi: totalEMI + totalCCEMI,
    expense: totalExpense,
    outstanding: activeDebts.reduce((s,d)=>s+parseFloat(d.outstanding||0),0) + totalCCOut,
    savings: totalAccountBalance,
    emergency: totalAccountBalance / Math.max(totalExpense || 1, 1)
  }), [monthlyIncome, totalEMI, totalCCEMI, totalExpense, activeDebts, totalCCOut, totalAccountBalance]);

  // ── ACTION: SAVE TRANSACTION WITH AUTO-DEDUCT ──
  const saveTx = () => {
    if (!txForm.amount) return;
    const amt = parseFloat(txForm.amount);
    const newTx = { ...txForm, amount: amt, id: editTxId || Date.now() };

    // Update bank balance only for new transactions
    if (!editTxId && txForm._accountId) {
        setAccounts(prev => prev.map(a => {
            if (String(a.id) === String(txForm._accountId)) {
                return { ...a, balance: a.balance + (txForm.type === "income" ? amt : -amt) };
            }
            return a;
        }));
    }

    if (editTxId) {
        setTransactions(prev => prev.map(t => t.id === editTxId ? newTx : t));
    } else {
        setTransactions([newTx, ...transactions]);
    }
    setShowTxForm(false); setTxForm({...EMPTY_TX}); setEditTxId(null);
  };

  // ── CSS STYLES (ORIGINAL STYLE) ──
  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Cabinet+Grotesk:wght@400;700;900&display=swap');
    body { background: ${C.bg}; color: ${C.text}; font-family: 'Cabinet Grotesk', sans-serif; margin: 0; padding-bottom: 80px; overflow-x: hidden; }
    .card { background: ${C.card}; border: 1px solid ${C.border}; border-radius: 18px; padding: 18px; margin-bottom: 14px; position: relative; }
    .btn { cursor: pointer; border: none; border-radius: 99px; font-weight: 700; padding: 10px 20px; transition: 0.2s; display: inline-flex; align-items: center; gap: 8px; }
    .btn-p { background: ${C.purple}; color: white; box-shadow: 0 4px 12px ${C.purple}40; }
    .inp { background: ${C.inputBg}; border: 1.5px solid ${C.border}; border-radius: 12px; color: ${C.text}; padding: 12px; width: 100%; box-sizing: border-box; font-family: inherit; }
    .bnav { position: fixed; bottom: 0; left: 0; right: 0; background: ${C.purple}; display: flex; padding: 12px; justify-content: space-around; z-index: 100; box-shadow: 0 -4px 20px rgba(0,0,0,0.3); }
    .bn { background: none; border: none; color: rgba(255,255,255,0.5); font-size: 10px; font-weight: 700; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 4px; }
    .bn.act { color: white; }
    .hero { background: linear-gradient(135deg, ${C.purple}, ${C.purpleLight}); color: white; padding: 30px 20px; border-radius: 0 0 25px 25px; margin-bottom: 20px; text-align: center; }
  `;

  if (!user) return (
    <div style={{ background: DARK.bg, color: DARK.text, height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{css}</style>
      <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 50, marginBottom: 10 }}>₹</div>
          <h1 style={{ margin: 0, letterSpacing: -1 }}>FinTrack</h1>
          <p style={{ color: DARK.muted, marginBottom: 30 }}>Secure financial command center</p>
          <button className="btn btn-p" onClick={handleLogin}>Sign in with Google</button>
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 500, margin: '0 auto' }}>
      <style>{css}</style>
      
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '15px 20px', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: saving ? THEME.warning : THEME.income }}></div>
            <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.7 }}>{saving ? "SYNCING..." : "PROTECTED"}</span>
          </div>
          <button onClick={handleLogout} style={{ background: 'none', border: 'none', color: C.expense, fontWeight: 700, fontSize: 12 }}>LOGOUT</button>
      </div>

      {tab === "Dashboard" && <>
        <div className="hero">
            <small style={{ opacity: 0.8, letterSpacing: 1 }}>CASH ON HAND</small>
            <h1 style={{ fontSize: 42, margin: '10px 0' }}>{fc(totalAccountBalance)}</h1>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 15, marginTop: 10 }}>
                <span className="tag" style={{ background: 'rgba(255,255,255,0.15)' }}>Health: {health.grade}</span>
                <span className="tag" style={{ background: 'rgba(255,255,255,0.15)' }}>{activeDebts.length} Loans</span>
            </div>
        </div>

        <div style={{ padding: '0 15px' }}>
            <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 15 }}>
                    <h3 style={{ margin: 0 }}>Accounts</h3>
                    <button onClick={() => {
                        const n = prompt("Bank Name:");
                        const b = prompt("Initial Balance:");
                        if(n && b) setAccounts([...accounts, { id: Date.now(), name: n, balance: parseFloat(b), icon: "🏦" }]);
                    }} style={{ background: 'none', border: 'none', color: C.purple, fontWeight: 800 }}>+ ADD</button>
                </div>
                {accounts.map(a => (
                    <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: `1px solid ${C.border}50` }}>
                        <span>{a.name}</span>
                        <span style={{ fontWeight: 900 }}>{fc(a.balance)}</span>
                    </div>
                ))}
            </div>

            <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h3 style={{ margin: 0 }}>Quick Add</h3>
                    <small style={{ color: C.muted }}>Last sync: {lastSaved ? lastSaved.toLocaleTimeString() : 'Never'}</small>
                </div>
                <button className="btn btn-p" onClick={() => setShowTxForm(true)} style={{ padding: '12px 25px' }}>+ ENTRY</button>
            </div>
        </div>
      </>}

      {tab === "Transactions" && (
          <div style={{ padding: 15 }}>
              <h2 style={{ letterSpacing: -1 }}>Transaction History</h2>
              {transactions.map(t => (
                  <div key={t.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                          <div style={{ fontWeight: 700 }}>{t.category}</div>
                          <small style={{ color: C.muted }}>{fd(t.date)}</small>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                          <div style={{ color: t.type === 'income' ? C.income : C.expense, fontWeight: 900 }}>
                              {t.type === 'income' ? '+' : '-'}{fc(t.amount)}
                          </div>
                      </div>
                  </div>
              ))}
          </div>
      )}

      {tab === "Plan" && (
          <div style={{ padding: 15 }}>
              <div className="card">
                  <h3>Repayment Settings</h3>
                  <label style={{ fontSize: 11 }}>MONTHLY HOUSEHOLD INCOME</label>
                  <input className="inp" style={{ marginBottom: 15 }} type="number" value={monthlyIncome} onChange={e => setMonthlyIncome(e.target.value)} />
                  <label style={{ fontSize: 11 }}>EXTRA DEBT PAYMENT</label>
                  <input className="inp" type="number" value={extraFund} onChange={e => setExtraFund(e.target.value)} />
              </div>
              
              <h3>Active Loans (₹10L Target)</h3>
              {activeDebts.map(d => (
                  <div key={d.id} className="card" style={{ borderLeft: `4px solid ${C.loan}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <strong>{d.name}</strong>
                          <span style={{ fontWeight: 900, color: C.expense }}>{fc(d.outstanding)}</span>
                      </div>
                      <small style={{ color: C.muted }}>{d.lender} · EMI: {fc(d.emi)}</small>
                  </div>
              ))}
              <button className="btn btn-p" style={{ width: '100%', justifyContent: 'center' }} onClick={() => {
                  const n = prompt("Loan Name:");
                  const o = prompt("Outstanding Amt:");
                  const e = prompt("Monthly EMI:");
                  if(n && o) setDebts([...debts, { id: Date.now(), name: n, outstanding: o, emi: e, closed: false }]);
              }}>+ ADD LOAN</button>
          </div>
      )}

      {/* Transaction Entry Modal */}
      {showTxForm && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
              <div className="card" style={{ width: '100%', maxWidth: 400 }}>
                  <h2 style={{ marginTop: 0 }}>Add Entry</h2>
                  <div style={{ display: 'flex', gap: 10, marginBottom: 15 }}>
                      <button onClick={() => setTxForm({...txForm, type: 'expense'})} style={{ flex: 1, padding: 10, borderRadius: 8, background: txForm.type === 'expense' ? C.expense : C.surface, color: 'white', border: 'none' }}>Expense</button>
                      <button onClick={() => setTxForm({...txForm, type: 'income'})} style={{ flex: 1, padding: 10, borderRadius: 8, background: txForm.type === 'income' ? C.income : C.surface, color: 'white', border: 'none' }}>Income</button>
                  </div>
                  
                  <input className="inp" style={{ fontSize: 24, fontWeight: 900, textAlign: 'center', marginBottom: 15 }} type="number" placeholder="₹ 0" value={txForm.amount} onChange={e => setTxForm({...txForm, amount: e.target.value})} />
                  
                  <label style={{ fontSize: 11, color: C.muted }}>CATEGORY</label>
                  <select className="inp" style={{ marginBottom: 15 }} value={txForm.category} onChange={e => setTxForm({...txForm, category: e.target.value})}>
                      {allCategories[txForm.type].map(c => <option key={c}>{c}</option>)}
                  </select>

                  <label style={{ fontSize: 11, color: C.muted }}>PAID VIA ACCOUNT</label>
                  <select className="inp" value={txForm._accountId} onChange={e => setTxForm({...txForm, _accountId: e.target.value})}>
                      <option value="">-- Select Bank/Cash --</option>
                      {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>

                  <div style={{ display: 'flex', gap: 10, marginTop: 25 }}>
                      <button className="btn btn-p" style={{ flex: 2, justifyContent: 'center' }} onClick={saveTx}>SAVE TRANSACTION</button>
                      <button className="btn" style={{ flex: 1, background: C.border, color: 'white', justifyContent: 'center' }} onClick={() => setShowTxForm(false)}>CANCEL</button>
                  </div>
              </div>
          </div>
      )}

      {/* Persistent Bottom Navigation */}
      <nav className="bnav">
          {MOBILE_TABS.map(t => (
              <button key={t.id} className={`bn ${tab === t.id ? 'act' : ''}`} onClick={() => setTab(t.id)}>
                  <span style={{ fontSize: 22 }}>{t.icon}</span>
                  {t.label}
              </button>
          ))}
      </nav>
    </div>
  );
}
