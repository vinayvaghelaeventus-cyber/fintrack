# 💰 FinTrack – Personal Finance Tracker

A full-featured personal finance app built with React. Track income, expenses,
loans, credit cards, savings goals, net worth, recurring payments, split bills,
and more.

---

## 🚀 How to Run (Step-by-Step)

### Prerequisites
Make sure you have **Node.js** installed.
- Download from: https://nodejs.org  (choose the "LTS" version)
- After installing, open a terminal and verify: `node -v`

---

### Step 1 — Open the project in VS Code
Open the `fintrack` folder in VS Code.

### Step 2 — Open the Terminal in VS Code
Go to **Terminal → New Terminal** (or press Ctrl + `)

### Step 3 — Install dependencies
In the terminal, run:
```
npm install
```
This downloads all required packages (takes ~1–2 minutes the first time).

### Step 4 — Start the app
```
npm start
```
Your browser will automatically open at **http://localhost:3000** and the app will be live!

---

## 📁 Project Structure

```
fintrack/
├── public/
│   └── index.html          ← HTML shell
├── src/
│   ├── index.js            ← Entry point (sets up localStorage)
│   └── App.jsx             ← Main app (all features)
├── package.json            ← Dependencies & scripts
└── README.md               ← This file
```

---

## 💾 Where is data stored?

When running locally, all your data is saved in your **browser's localStorage**.
It persists between sessions automatically — just like the Claude artifact version.

Each data type is stored under these keys:
| Key                  | Data                        |
|----------------------|-----------------------------|
| `fin_v2_tx`          | All transactions            |
| `fin_v2_budgets`     | Budget limits per category  |
| `fin_v2_savings`     | Savings goals               |
| `fin_v2_debts`       | Loans & credit cards        |
| `fin_v2_assets`      | Net worth entries           |
| `fin_v2_recurring`   | Recurring payments          |
| `fin_v2_splits`      | Split bill records          |
| `fin_v2_dark`        | Theme preference            |

---

## ✨ Features

| Tab            | Features                                                      |
|----------------|---------------------------------------------------------------|
| Dashboard      | Summary cards, charts, due date alerts, recurring payments   |
| Loans & Cards  | Track EMIs, credit cards, due dates, repayment progress      |
| Transactions   | Search, filter, date range, export CSV                       |
| Budget         | Set monthly limits, visual progress bars                     |
| Savings        | Goals with progress tracking                                 |
| Net Worth      | Assets vs liabilities, auto-links loans                      |
| Insights       | Savings rate, debt ratio, category spending analysis         |
| Split Bills    | Group expense splitter, track who paid                       |

---

## 🛠 Common Issues

**"npm is not recognized"** → Node.js is not installed. Download from https://nodejs.org

**"Port 3000 is already in use"** → Type `Y` when asked if you want to use another port, or close the other app using port 3000.

**App shows blank screen** → Open browser console (F12) and check for errors. Make sure you ran `npm install` first.
