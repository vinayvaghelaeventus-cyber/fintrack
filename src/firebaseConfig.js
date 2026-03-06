// ─── FIREBASE CONFIG ─────────────────────────────────────────────────────────
// Replace these values with your Firebase project config.
// Get them from: Firebase Console → Your Project → Project Settings → Your Apps → Web App
//
// HOW TO GET YOUR CONFIG:
// 1. Go to https://console.firebase.google.com
// 2. Select your project (or create new one)
// 3. Click gear icon ⚙️ → Project Settings
// 4. Scroll to "Your apps" → click Web (</>)
// 5. Register app with name "fintrack" → copy the firebaseConfig object below

export const firebaseConfig = {
  apiKey: "AIzaSyCEtHcDpAWArsmTEa3a94WCeTSNEkosKpI",
  authDomain: "fintrack-f45fd.firebaseapp.com",
  projectId: "fintrack-f45fd",
  storageBucket: "fintrack-f45fd.firebasestorage.app",
  messagingSenderId: "3246771038",
  appId: "1:3246771038:web:bcea78b4dfe7461db21dcf"
};

// ─── APP CONFIG ──────────────────────────────────────────────────────────────
// Your FinTrack user ID — change this to anything unique (e.g. your name)
// This is used as a Firestore document path so only your device reads your data.
// Combined with the PIN lock, this keeps your data private.
export const FINTRACK_USER_ID = "my_fintrack_data";
