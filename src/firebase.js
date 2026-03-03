import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  deleteDoc
} from 'firebase/firestore';

import {
  getAuth,
  GoogleAuthProvider
} from 'firebase/auth';

import { firebaseConfig } from './firebaseConfig';

// ─── Initialize Firebase ─────────────────────────
const app = initializeApp(firebaseConfig);

const db   = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// ─── Get user-specific document reference ────────
const userDocRef = () => {
  if (!auth.currentUser) return null;
  return doc(db, 'fintrack_users', auth.currentUser.uid);
};

// ─── Load data ────────────────────────────────────
export async function loadData() {
  try {
    if (!auth.currentUser) return null;

    const snap = await getDoc(userDocRef());
    if (snap.exists()) return snap.data();
    return null;
  } catch (e) {
    console.error('Firebase load error:', e);
    return null;
  }
}

// ─── Save data ────────────────────────────────────
export async function saveData(data) {
  try {
    if (!auth.currentUser) return false;

    await setDoc(userDocRef(), data, { merge: true });
    return true;
  } catch (e) {
    console.error('Firebase save error:', e);
    return false;
  }
}

// ─── Real-time sync ──────────────────────────────
export function subscribeToData(callback) {
  if (!auth.currentUser) return;

  return onSnapshot(userDocRef(), (snap) => {
    if (snap.exists()) callback(snap.data());
  });
}


    // If old data exists AND new UID doc doesn't exist → migrate
    if (oldSnap.exists() && !newSnap.exists()) {
      await setDoc(newRef, oldSnap.data());
      console.log("✅ Old data migrated successfully");

      // Optional: delete old document after migration
      // await deleteDoc(oldRef);
    }
  } catch (error) {
    console.error("Migration error:", error);
  }
}

export { db, auth, provider };
