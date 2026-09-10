// FIXED JDA APP - 100% WORKING - PROJECT FABDE - IMPORT BUG FIXED
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAPnOHdVISPw_fGBLdMLELSU9f1IWMTC3I",
  authDomain: "jda-network-fabde.firebaseapp.com",
  projectId: "jda-network-fabde",
  storageBucket: "jda-network-fabde.firebasestorage.app",
  messagingSenderId: "383915852673",
  appId: "1:383915852673:web:4b185c0387ed0bbad1de80"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const authView = document.getElementById('authView');
const appView = document.getElementById('appView');
const pendingView = document.getElementById('pendingView');

function showAuth() {
  console.log("Show AUTH");
  if (authView) { authView.classList.remove('hidden'); authView.style.display = 'flex'; }
  if (appView) { appView.classList.add('hidden'); appView.style.display = 'none'; }
  if (pendingView) { pendingView.classList.add('hidden'); pendingView.style.display = 'none'; }
}

function showApp() {
  console.log("SHOWING APP - JDA OPENED!");
  if (authView) { authView.classList.add('hidden'); authView.style.display = 'none'; }
  if (pendingView) { pendingView.classList.add('hidden'); pendingView.style.display = 'none'; }
  if (appView) {
    appView.classList.remove('hidden');
    appView.style.display = 'flex';
    appView.style.visibility = 'visible';
    appView.style.opacity = '1';
  }
}

function showPending() {
  if (authView) { authView.classList.add('hidden'); authView.style.display = 'none'; }
  if (appView) { appView.classList.add('hidden'); appView.style.display = 'none'; }
  if (pendingView) { pendingView.classList.remove('hidden'); pendingView.style.display = 'flex'; }
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    showAuth();
    return;
  }
  console.log("User logged in:", user.uid, user.email);
  try {
    const userRef = doc(db, "users", user.uid);
    let snap = await getDoc(userRef);
    if (!snap.exists() || user.email === "jonathanmentor62@gmail.com") {
      console.log("Creating/fixing admin doc...");
      await setDoc(userRef, {
        email: user.email,
        uid: user.uid,
        username: "JonathanMentor",
        displayName: "Jonathan Mentor",
        status: "approved",
        role: "admin",
        createdAt: serverTimestamp()
      }, { merge: true });
      snap = await getDoc(userRef);
    }
    const data = snap.data();
    console.log("User data:", data);
    if (data.status === "approved" || data.role === "admin" || user.email === "jonathanmentor62@gmail.com") {
      showApp();
    } else {
      showPending();
    }
  } catch (e) {
    console.error("Error:", e);
    if (user.email === "jonathanmentor62@gmail.com") showApp();
    else showAuth();
  }
});

window.login = async (e) => {
  if (e) e.preventDefault();
  const email = document.getElementById('email')?.value?.trim();
  const password = document.getElementById('password')?.value;
  console.log("Attempt login", email);
  if (!email ||!password) return alert("Enter email & password");
  try {
    await signInWithEmailAndPassword(auth, email, password);
    console.log("Login success!");
  } catch (err) {
    console.error(err);
    alert("Login failed: " + err.message);
  }
};

window.signup = async (e) => {
  if (e) e.preventDefault();
  const email = document.getElementById('email')?.value?.trim();
  const password = document.getElementById('password')?.value;
  const username = document.getElementById('username')?.value?.trim() || email.split('@')[0];
  if (!email ||!password) return alert("Enter email & password");
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, "users", cred.user.uid), {
      email: email,
      uid: cred.user.uid,
      username: username,
      displayName: username,
      status: email === "jonathanmentor62@gmail.com"? "approved" : "pending",
      role: email === "jonathanmentor62@gmail.com"? "admin" : "member",
      createdAt: serverTimestamp()
    });
    alert("Account created! Waiting for approval if not admin.");
  } catch (err) {
    alert(err.message);
  }
};

window.logout = async () => {
  await signOut(auth);
  showAuth();
};

// AUTO-BIND FORM - FIXES BUTTON DOING NOTHING
document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('form');
  if (form) {
    form.addEventListener('submit', window.login);
  }
  console.log("JDA FABDE FIXED Loaded - Login bound!");
});