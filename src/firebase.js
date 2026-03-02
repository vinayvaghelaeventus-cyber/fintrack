import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { firebaseConfig, FINTRACK_USER_ID } from './firebaseConfig';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

const userDocRef = () => doc(db, 'fintrack_users', FINTRACK_USER_ID);

// ─── Load all data once ───────────────────────────────────────────────────────
export async function loadData() {
  try {
    const snap = await getDoc(userDocRef());
    if (snap.exists()) return snap.data();
    return null;
  } catch (e) {
    console.error('Firebase load error:', e);
    return null;
  }
}

// ─── Save full data object ────────────────────────────────────────────────────
export async function saveData(data) {
  try {
    await setDoc(userDocRef(), data, { merge: true });
    return true;
  } catch (e) {
    console.error('Firebase save error:', e);
    return false;
  }
}

// ─── Subscribe to real-time changes (optional, for multi-device sync) ─────────
export function subscribeToData(callback) {
  return onSnapshot(userDocRef(), (snap) => {
    if (snap.exists()) callback(snap.data());
  });
}

export { db };
