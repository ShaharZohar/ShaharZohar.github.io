// ============================================================
// firebase.js — shared Firebase init + helpers
// Replace the firebaseConfig values with your own from the
// Firebase console: Project Settings → Your apps → Config
// ============================================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  query,
  where,
  orderBy,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import {
  initializeAppCheck,
  ReCaptchaV3Provider
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-check.js';

// ── YOUR FIREBASE CONFIG ─────────────────────────────────────
// ✅ Safe to commit — these keys are public by design.
// Protection comes from App Check (reCAPTCHA) + Firestore rules,
// not from keeping these values secret.
export const firebaseConfig = {
  apiKey: "AIzaSyCqolyvELLKetqdZnzCBB43PvSLpE5xwMA",
  authDomain: "sz-dev-portfolio.firebaseapp.com",
  projectId: "sz-dev-portfolio",
  storageBucket: "sz-dev-portfolio.firebasestorage.app",
  messagingSenderId: "327536766293",
  appId: "1:327536766293:web:364c73ef5fee3d8a3f53dc"
};

// ── RECAPTCHA SITE KEY ────────────────────────────────────────
const RECAPTCHA_SITE_KEY = "6LddOIUsAAAAAI-KBW47Ty8OOfw_nO_Wa5NCa0yS";

// ── INIT ─────────────────────────────────────────────────────
const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

// ── APP CHECK ────────────────────────────────────────────────
// AppCheck disabled — reCAPTCHA key needs to be fixed first.
// Re-enable once the correct v3 key is registered in Firebase Console.
//
// if (RECAPTCHA_SITE_KEY !== "YOUR_RECAPTCHA_V3_SITE_KEY") {
//   initializeAppCheck(app, {
//     provider: new ReCaptchaV3Provider(RECAPTCHA_SITE_KEY),
//     isTokenAutoRefreshEnabled: true
//   });
// }

// ── AUTH HELPERS ─────────────────────────────────────────────
export const login  = (email, pw) => signInWithEmailAndPassword(auth, email, pw);
export const logout = ()          => signOut(auth);
export const onAuth = (cb)        => onAuthStateChanged(auth, cb);

// ── ARTICLES ─────────────────────────────────────────────────
const ARTICLES = 'articles';

export async function getPublishedArticles() {
  // Fetch all articles and filter client-side to avoid needing a composite Firestore index
  const snap = await getDocs(collection(db, ARTICLES));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(a => a.published === true)
    .sort((a, b) => {
      const da = a.date?.toDate ? a.date.toDate() : new Date(a.date || 0);
      const db_ = b.date?.toDate ? b.date.toDate() : new Date(b.date || 0);
      return db_ - da;
    });
}

export async function getAllArticles() {
  const q = query(collection(db, ARTICLES), orderBy('date', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getArticleBySlug(slug) {
  const q = query(collection(db, ARTICLES), where('slug', '==', slug));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

export async function createArticle(data) {
  return addDoc(collection(db, ARTICLES), {
    ...data,
    date: serverTimestamp(),
    createdAt: serverTimestamp()
  });
}

export async function updateArticle(id, data) {
  return updateDoc(doc(db, ARTICLES, id), {
    ...data,
    updatedAt: serverTimestamp()
  });
}

export async function deleteArticle(id) {
  return deleteDoc(doc(db, ARTICLES, id));
}

// ── REPOS CONFIG ─────────────────────────────────────────────
const REPOS_CFG = 'repos_config';

export async function getReposConfig() {
  const snap = await getDocs(collection(db, REPOS_CFG));
  const hidden = new Set();
  const pinned = new Set();
  snap.docs.forEach(d => {
    const data = d.data();
    if (data.hidden) hidden.add(d.id);
    if (data.pinned) pinned.add(d.id);
  });
  return { hidden, pinned };
}

export async function setRepoConfig(repoName, cfg) {
  return setDoc(doc(db, REPOS_CFG, repoName), cfg, { merge: true });
}

// ── GITHUB ───────────────────────────────────────────────────
const GH_USER = 'ShaharZohar';
let _reposCache = null;
let _cacheTime  = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 min

export async function fetchGitHubRepos(forceRefresh = false) {
  if (!forceRefresh && _reposCache && Date.now() - _cacheTime < CACHE_TTL) {
    return _reposCache;
  }
  const res = await fetch(
    `https://api.github.com/users/${GH_USER}/repos?sort=updated&direction=desc&per_page=100`,
    { headers: { 'Accept': 'application/vnd.github+json' } }
  );
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const repos = await res.json();
  _reposCache = repos.filter(r => !r.fork && !r.archived);
  _cacheTime  = Date.now();
  return _reposCache;
}

// ── UTILS ────────────────────────────────────────────────────
export function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

export function formatDate(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function timeAgo(ts) {
  if (!ts) return '';
  const d  = ts.toDate ? ts.toDate() : new Date(ts);
  const s  = (Date.now() - d) / 1000;
  if (s < 3600)   return Math.floor(s / 60) + 'm ago';
  if (s < 86400)  return Math.floor(s / 3600) + 'h ago';
  if (s < 604800) return Math.floor(s / 86400) + 'd ago';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
