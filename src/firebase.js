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

// Get document reference for a given key.
// NOTE: App.jsx now passes a stable email-based key (not the Firebase Auth UID,
// which can silently change on re-login).
const userDocRef = (key) => {
  return doc(db, "fintrack_users", key);
};

// Load data
//  - returns the data object if the document exists
//  - returns null ONLY if the document genuinely doesn't exist yet
//  - THROWS on any real error (network, permission, etc.) so the app never
//    mistakes a failed load for "empty account" and auto-saves over real data.
export async function loadData(key) {
  const snap = await getDoc(userDocRef(key));
  if (snap.exists()) return snap.data();
  return null;
}

// Save data
export async function saveData(key, data) {
  try {
    await setDoc(userDocRef(key), data, { merge: true });
    return true;
  } catch (e) {
    console.error("Firebase save error:", e);
    return false;
  }
}

export { db, auth, provider };
