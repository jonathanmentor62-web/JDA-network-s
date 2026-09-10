// FIXED JDA APP - AUTO HEALS ADMIN ACCOUNT - PROJECT FABDE
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
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
  authView?.classList.remove('hidden');
  appView?.classList.add('hidden');
  pendingView?.classList.add('hidden');
  if (appView) appView.style.display = 'none';
  if (authView) authView.style.display = 'flex';
}

function showApp() {
  console.log("SHOWING APP - JDA OPENED!");
  authView?.classList.add('hidden');
  pendingView?.classList.add('hidden');
  appView?.classList.remove('hidden');
  if (appView) {
    appView.style.display = 'flex';
    appView.style.visibility = 'visible';
    appView.style.opacity = '1';
  }
}

function showPending() {
  authView?.classList.add('hidden');
  appView?.classList.add('hidden');
  pendingView?.classList.remove('hidden');
  if (pendingView) pendingView.style.display = 'flex';
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

    // AUTO-CREATE OR FIX ADMIN DOC - FORCE APPROVED
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
    console.error("Error loading profile:", e);
    if (user.email === "jonathanmentor62@gmail.com") showApp();
    else showAuth();
  }
});

// LOGIN - FIXED
window.login = async (e) => {
  if (e) e.preventDefault();
  const email = document.getElementById('email')?.value;
  const password = document.getElementById('password')?.value;
  try {
    await signInWithEmailAndPassword(auth, email.trim(), password);
  } catch (err) {
    alert(err.message);
  }
};

window.logout = async () => {
  await signOut(auth);
  showAuth();
};

console.log("JDA FABDE FIXED Loaded!");