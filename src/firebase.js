import { initializeApp } from "firebase/app";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
} from "firebase/firestore";

import {
  getAuth,
  GoogleAuthProvider
} from "firebase/auth";

import { firebaseConfig } from "./firebaseConfig";

// Initialize Firebase
const app = initializeApp(firebaseConfig);

const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// Get user-specific document reference
const userDocRef = (uid) => {
  return doc(db, "fintrack_users", uid);
};

// Load data
export async function loadData(uid) {
  try {
    const snap = await getDoc(userDocRef(uid));
    if (snap.exists()) return snap.data();
    return null;
  } catch (e) {
    console.error("Firebase load error:", e);
    return null;
  }
}

// Save data
export async function saveData(uid, data) {
  try {
    await setDoc(userDocRef(uid), data, { merge: true });
    return true;
  } catch (e) {
    console.error("Firebase save error:", e);
    return false;
  }
}

export { db, auth, provider };
