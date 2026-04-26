import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { getFirestore, collection, addDoc, query, where, getDocs, onSnapshot, orderBy, Timestamp, doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, getDocFromServer } from 'firebase/firestore';

// @ts-ignore
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// @ts-ignore
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const googleProvider = new GoogleAuthProvider();

export { signInWithPopup, signOut, onAuthStateChanged, collection, addDoc, query, where, getDocs, onSnapshot, orderBy, Timestamp, doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, getDocFromServer };
export type { User };
