# FinTrack 💰

> A personal finance PWA built for Indian salaried professionals — track income, expenses, loans, credit cards, and savings goals in one place. Works offline, installs on your phone like a native app.

**Live App:** [fintrack.vercel.app](https://fintrack.vercel.app) &nbsp;|&nbsp; **Stack:** React + Vite + Firebase Firestore &nbsp;|&nbsp; **Deployed on:** Vercel

---

## 📱 Screenshots

> Dashboard · Plan · Insights · Smart

---

## ✨ Features

### 🏠 Dashboard
- **Cash in Hand** — actual total balance across all bank accounts shown as the main number
- **Net Balance** — income minus expenses for any selected period (Today / Week / Month / Custom)
- **Net Worth** — assets minus all loans and CC outstanding
- **⚡ Daily Check-In** — "Safe to spend today" calculated as budget remaining ÷ days left in month, with 😊 / 🤔 / 😬 status
- **🔥 No-Spend Streak** — tracks consecutive zero-expense days
- **Salary Countdown** — shows "✅ Salary credited this month" once you add it manually, instead of counting down again
- **🔔 Dues & Reminders** — all upcoming loan EMIs and CC bills with ✅ Paid badge and one-tap Pay button
- **Cash Gap Alert** — warns when upcoming bills exceed available cash before next salary
- **15-Day Stress Banner** — shows what's due in the next 15 days and whether you're safe / tight / at risk
- **Spending Overview** — pie chart of expenses by category for the selected period
- **Budget Overview** — how much of each budget limit has been used
- **All Accounts** — live balance of every bank account

### 📊 Plan Tab
- **📉 Debt Progress Tracker** — per-loan repayment bars, 6-month payment history chart, On Track / Behind Plan badge, total debt reduction this month
- **🏦 Interest Cost Tracker** — exactly how much goes to banks as interest every month and year, with insight on which debt to pay first
- **🎯 Savings Goals** — visual progress meters with estimated months to reach each goal
- **Loan Payoff Plan** — Avalanche (highest interest first) and Snowball (smallest balance first) strategies with months saved comparison
- **Financial Health Score** — scored on 6 parameters: income ratio, EMI load, expenses, debt, savings, emergency fund
- **Monthly Scorecard** — breakdown of all health score components with tips

### 💳 Cards Tab
- Credit card tracker with utilization percentage and status (Safe / Warning / Danger)
- Interest rate, min due, statement date, due date per card
- CC outstanding and payment tracking

### 💸 Transactions Tab
- Add / Edit / Delete income, expense, and **↔ Bank Transfer** transactions
- Transfer type moves money between accounts without affecting income/expense totals
- Filter by date range (Today / This Week / This Month / Custom) and category
- **CSV Import** — supports Indian bank statement formats (HDFC, ICICI, SBI, Axis, Kotak)
- **CSV Export** — full transaction history

### 📅 Budget Tab
- Set monthly spending limits per category
- Live progress bars showing spent vs budgeted
- Overspend alerts

### 📈 Insights Tab
- **🎭 Spending Personality Score** — Disciplined / Foodie / Impulsive / Saver etc. based on spending patterns
- **This Month vs Last Month** — per-category comparison with ↑↓ indicators
- **Weekend vs Weekday Spending** — shows if you spend more on weekends
- **🗓 Expense Calendar** — color-coded month view, tap any day to see transactions
- **📅 Financial Calendar** — full month view with salary day 💰, EMI due dates 🏦, CC bills 💳, and recurring bills ⚡, plus upcoming events list
- **6-Month Savings Rate Trend** — chart of savings % over last 6 months
- **EMI Due Calendar** — mini calendar highlighting EMI due dates
- **30-Day Cash Flow Forecast** — projected balance line chart with danger day detection
- **Debt-Free Countdown** — months remaining at current repayment rate

### 🛠 Smart Tab
- **💰 Salary Setup** — configure salary amount and credit day; used across countdown, cash gap, and smart budget features
- **🔁 Recurring Bills** — add electricity, mobile, Netflix, subscriptions etc. App auto-detects paid/unpaid each month by matching transactions
- **⚡ Next 15 Days Stress Panel** — all dues in the next 15 days with safe / tight / risk status
- **🏦 Account Register** — add and manage bank accounts with balance correction
- **Custom Categories** — add your own expense and income categories
- **Smart Budget Reset** — on salary day, shows suggested budget limits based on 3-month averages

### 🔵 Money Circles Tab
- Track informal borrowing and lending with friends and family
- "Used For / Notes" field to record what borrowed money was spent on
- Return date tracking with overdue alerts
- Cash gap detection across circles

### 🔔 Push Notifications
- EMI reminders 3 days before, 1 day before, on the day, and overdue
- CC bill reminders
- Budget overspend alerts
- Low balance warning
- Salary day nudge
- Recurring bill due reminders

---

## 🏗 Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite |
| Styling | Inline CSS with CSS-in-JS (no Tailwind) |
| Charts | Recharts |
| Auth | Firebase Authentication (Google) |
| Database | Firebase Cloud Firestore |
| Hosting | Vercel (auto-deploy from GitHub) |
| PWA | Custom `sw.js` + `manifest.json` |
| Notifications | Web Notifications API (direct, no SW push) |

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Firebase project with Firestore and Google Auth enabled
- Vercel account (for deployment)

### Installation

```bash
# Clone the repository
git clone https://github.com/vinayvaghelaeventus-cyber/fintrack.git
cd fintrack

# Install dependencies
npm install

# Start development server
npm run dev
```

### Firebase Setup

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable **Authentication → Google**
3. Enable **Firestore Database**
4. Copy your config to `src/firebase.js`:

```js
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app   = initializeApp(firebaseConfig);
export const auth     = getAuth(app);
export const provider = new GoogleAuthProvider();
export const db       = getFirestore(app);

export async function loadData(uid) { /* ... */ }
export async function saveData(uid, data) { /* ... */ }
```

### Firestore Security Rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /fintrack_users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

Or connect your GitHub repo in the [Vercel dashboard](https://vercel.com/dashboard) for auto-deploy on every push to `main`.

---

## 📁 Project Structure

```
fintrack/
├── public/
│   ├── manifest.json        # PWA manifest (icons, shortcuts)
│   ├── sw.js                # Service worker (cache, offline, notifications)
│   └── icons/               # PWA icons (all sizes)
├── src/
│   ├── App.jsx              # Main app (~5,400 lines — all features)
│   ├── firebase.js          # Firebase config, loadData, saveData
│   ├── main.jsx             # React entry point
│   └── index.css            # Base reset styles
├── index.html               # HTML shell with PWA meta tags
├── vite.config.js
└── package.json
```

---

## 💾 Data Model

All data is stored per user under `fintrack_users/{uid}` in Firestore:

```
transactions[]      — income, expense, transfer entries
debts[]             — loans with outstanding, EMI, interest rate, due date
creditCards[]       — CC with limit, outstanding, due date
ccEmis[]            — EMIs running on credit cards
savings[]           — savings goals with current and target amounts
budgets{}           — monthly category limits {category: amount}
banks[]             — bank name list
accounts[]          — bank accounts with balances
moneyCircles[]      — borrow/lend records
recurringBills[]    — monthly recurring bills
salary{}            — salary amount and credit day
customCats{}        — user-defined categories
monthlyIncome       — manual monthly income override
extraFund           — extra monthly amount to attack debt
strategy            — "avalanche" or "snowball"
emergencyFund       — emergency fund target
darkMode            — boolean
```

---

## 🔑 Key Design Decisions

**Manual-first approach** — No auto-engines for salary credit or recurring transactions. Everything is added manually or via Pay buttons. This prevents race conditions and gives full control.

**India-focused** — All amounts in ₹, Indian bank CSV formats supported, salary on the 5th, UPI as default payment mode, Indian date formats throughout.

**Single-file architecture** — All 75 features live in `App.jsx`. This makes deployment simple (just update one file) and avoids module resolution issues in the Vite + Vercel pipeline.

**Offline-first** — Service worker caches the app shell. Firestore handles offline persistence automatically.

---

## 🛡 Known Constraints

- **Single user per device** — designed for personal use, not shared accounts
- **No server-side logic** — everything runs client-side; Firestore is the only backend
- **Notification API** — uses direct `Notification` API (not SW push), so notifications only fire when the app is open or recently visited

---

## 📋 Roadmap

| Feature | Priority |
|---|---|
| CC EMI Tracker rebuild | 🔴 High |
| Bill Split Tracker (shared expenses) | 🟡 Medium |
| CIBIL Score Simulator | 🟡 Medium |
| Investment Tracker (MF, SIP, stocks) | 🟡 Medium |
| Annual Tax Summary (ITR helper) | 🟡 Medium |
| Loan Closure Celebration | 🟢 Low |
| PDF Financial Report export | 🟢 Low |
| Receipt photo attachment | 🟢 Low |

---

## 👤 Author

**Vinay Vaghela** — Sr. Security Engineer, Ahmedabad  
Instagram: [@vinayak_itech](https://instagram.com/vinayak_itech)  
Website: [vinayakitech.com](https://vinayakitech.com)

---

## 📄 License

MIT — use it, fork it, build on it.
