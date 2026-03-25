import { auth, provider } from "./firebase";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { useState, useEffect, useMemo, useRef } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { loadData, saveData } from "./firebase";

// ─── THEMES ──────────────────────────────────────────────────────────────────
const DARK = { income:"#00e5a0", expense:"#ff4d6d", savings:"#7c6af7", bg:"#0d0d14", card:"#13131f", border:"#1e1e30", text:"#eef0f8", muted:"#5a5f7a", accent:"#7b4fd4", surface:"#18182a", inputBg:"#0e0e1c", purple:"#7b4fd4", purpleLight:"#9b6af7" };
const LIGHT = { income:"#00a870", expense:"#e8294a", savings:"#5b4fd4", bg:"#f2f2f8", card:"#ffffff", border:"#e4e4f0", text:"#0d0f1e", muted:"#8890b0", accent:"#7b4fd4", surface:"#f8f8ff", inputBg:"#f0f0fa", purple:"#7b4fd4", purpleLight:"#9b6af7" };

const MOBILE_TABS = [
  {id:"Dashboard", icon:"🏠", label:"Home"},
  {id:"Transactions", icon:"📋", label:"Txns"},
  {id:"Plan", icon:"🎯", label:"Plan"}
];

const CATEGORIES = {
  income: ["Salary", "Freelance", "Investment", "Gift", "Other Income"],
  expense: ["Housing", "Food", "Transport", "Health", "Shopping", "Utilities", "Loan EMI", "Other"]
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const fc = n => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);
const fd = d => { try { return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); } catch { return "—"; } };

export default function App() {
  const [darkMode, setDarkMode] = useState(true);
  const [tab, setTab] = useState("Dashboard");
  const [user, setUser] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [debts, setDebts] = useState([]);
  const [monthlyIncome, setMonthlyIncome] = useState("");
  const [extraFund, setExtraFund] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showTxForm, setShowTxForm] = useState(false);
  const [txForm, setTxForm] = useState({ type: "expense", amount: "", category: "Food", _accountId: "", date: new Date().toISOString().split('T')[0] });

  const C = darkMode ? DARK : LIGHT;

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => setUser(u));
  }, []);

  useEffect(() => {
    if (!user) return;
    loadData(user.uid).then(data => {
      if (data) {
        setTransactions(data.transactions || []);
        setAccounts(data.accounts || []);
        setDebts(data.debts || []);
        setMonthlyIncome(data.monthlyIncome || "");
        setExtraFund(data.extraFund || "");
      }
      setLoaded(true);
    });
  }, [user]);

  useEffect(() => {
    if (!loaded || !user) return;
    const t = setTimeout(async () => {
      setSaving(true);
      await saveData(user.uid, { transactions, accounts, debts, monthlyIncome, extraFund, darkMode });
      setSaving(false);
    }, 1500);
    return () => clearTimeout(t);
  }, [transactions, accounts, debts, monthlyIncome, extraFund, loaded, user, darkMode]);

  const totalAccountBalance = useMemo(() => accounts.reduce((s, a) => s + (parseFloat(a.balance) || 0), 0), [accounts]);
  const totalExpense = useMemo(() => transactions.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0), [transactions]);
  const cashLeft = (parseFloat(monthlyIncome) || 0) - totalExpense;

  const saveTx = () => {
    if (!txForm.amount || !txForm._accountId) return alert("Please fill all fields");
    const amt = parseFloat(txForm.amount);
    const newTx = { ...txForm, amount: amt, id: Date.now() };

    setAccounts(prev => prev.map(a => {
      if (String(a.id) === String(txForm._accountId)) {
        return { ...a, balance: a.balance + (txForm.type === "income" ? amt : -amt) };
      }
      return a;
    }));

    setTransactions([newTx, ...transactions]);
    setShowTxForm(false);
    setTxForm({ type: "expense", amount: "", category: "Food", _accountId: "", date: new Date().toISOString().split('T')[0] });
  };

  const css = `
    body { background: ${C.bg}; color: ${C.text}; font-family: sans-serif; margin: 0; padding-bottom: 80px; }
    .card { background: ${C.card}; border: 1px solid ${C.border}; border-radius: 18px; padding: 18px; margin-bottom: 14px; }
    .btn { cursor: pointer; border: none; border-radius: 99px; font-weight: 700; padding: 12px 24px; transition: 0.2s; }
    .btn-p { background: ${C.purple}; color: white; }
    .inp { background: ${C.inputBg}; border: 1.5px solid ${C.border}; border-radius: 12px; color: ${C.text}; padding: 12px; width: 100%; box-sizing: border-box; margin-top: 5px; }
    .hero { background: linear-gradient(135deg, ${C.purple}, ${C.purpleLight}); color: white; padding: 30px 20px; border-radius: 0 0 25px 25px; margin-bottom: 20px; text-align: center; }
    .bnav { position: fixed; bottom: 0; left: 0; right: 0; background: ${C.purple}; display: flex; padding: 12px; justify-content: space-around; z-index: 100; }
    .bn { background: none; border: none; color: rgba(255,255,255,0.5); font-size: 10px; font-weight: 700; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 4px; }
    .bn.act { color: white; }
  `;

  if (!user) return (
    <div style={{ background: DARK.bg, color: DARK.text, height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
      <style>{css}</style>
      <div className="card">
        <h1 style={{ fontSize: 40, color: DARK.purple }}>FinTrack</h1>
        <p>Login to secure your data</p>
        <button className="btn btn-p" onClick={() => signInWithPopup(auth, provider)}>Sign in with Google</button>
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 500, margin: '0 auto' }}>
      <style>{css}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '15px' }}>
          <span style={{ fontSize: 11, color: saving ? C.accent : C.income }}>{saving ? "● SAVING..." : "● PROTECTED"}</span>
          <button onClick={() => signOut(auth)} style={{ background: 'none', border: 'none', color: C.expense, fontWeight: 700 }}>LOGOUT</button>
      </div>

      {tab === "Dashboard" && <>
        <div className="hero">
          <small style={{ opacity: 0.8 }}>TOTAL CASH BALANCE</small>
          <h1 style={{ fontSize: 42, margin: '10px 0' }}>{fc(totalAccountBalance)}</h1>
          <button className="btn" style={{ background: 'white', color: C.purple, marginTop: 15 }} onClick={() => setShowTxForm(true)}>+ ADD ENTRY</button>
        </div>
        <div style={{ padding: '0 15px' }}>
          <div className="card">
            <h3>Accounts</h3>
            {accounts.map(a => (
              <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${C.border}` }}>
                <span>{a.name}</span><strong>{fc(a.balance)}</strong>
              </div>
            ))}
            <button className="btn" style={{ width: '100%', marginTop: 10, background: C.surface, color: C.text, fontSize: 11 }} onClick={() => {
              const n = prompt("Bank Name:");
              const b = prompt("Balance:");
              if (n && b) setAccounts([...accounts, { id: Date.now(), name: n, balance: parseFloat(b) }]);
            }}>+ Add Bank Account</button>
          </div>
        </div>
      </>}

      {tab === "Transactions" && (
        <div style={{ padding: 15 }}>
          <h3>History</h3>
          {transactions.map(t => (
            <div key={t.id} className="card" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{t.category}<br/><small style={{ color: C.muted }}>{fd(t.date)}</small></span>
              <span style={{ color: t.type === 'income' ? C.income : C.expense, fontWeight: 900 }}>{t.type === 'income' ? '+' : '-'}{fc(t.amount)}</span>
            </div>
          ))}
        </div>
      )}

      {showTxForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div className="card" style={{ width: '100%', maxWidth: 400 }}>
            <h2>New Entry</h2>
            <select className="inp" value={txForm.type} onChange={e => setTxForm({ ...txForm, type: e.target.value })}>
              <option value="expense">Expense (-)</option>
              <option value="income">Income (+)</option>
            </select>
            <input className="inp" type="number" placeholder="Amount ₹" value={txForm.amount} onChange={e => setTxForm({ ...txForm, amount: e.target.value })} />
            <select className="inp" value={txForm._accountId} onChange={e => setTxForm({ ...txForm, _accountId: e.target.value })}>
              <option value="">-- Select Account --</option>
              {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button className="btn btn-p" style={{ flex: 1 }} onClick={saveTx}>Save</button>
              <button className="btn" style={{ flex: 1, background: C.border, color: 'white' }} onClick={() => setShowTxForm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <nav className="bnav">
        {MOBILE_TABS.map(t => (
          <button key={t.id} className={`bn ${tab === t.id ? 'act' : ''}`} onClick={() => setTab(t.id)}>
            <span style={{ fontSize: 20 }}>{t.icon}</span>{t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
