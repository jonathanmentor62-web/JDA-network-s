// FIXED JDA APP - AUTO HEALS ADMIN ACCOUNT
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "jda-network-2e6f8.firebaseapp.com",
  projectId: "jda-network-2e6f8",
  storageBucket: "jda-network-2e6f8.appspot.com",
  messagingSenderId: "...",
  appId: "..."
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const authView = document.getElementById('authView');
const appView = document.getElementById('appView');
const pendingView = document.getElementById('pendingView');

function showApp() {
  console.log("SHOWING APP");
  authView?.classList.add('hidden');
  pendingView?.classList.add('hidden');
  appView?.classList.remove('hidden');
  appView.style.display = 'flex';
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    authView?.classList.remove('hidden');
    appView?.classList.add('hidden');
    pendingView?.classList.add('hidden');
    return;
  }

  console.log("User logged in:", user.uid, user.email);
  
  try {
    const userRef = doc(db, "users", user.uid);
    let snap = await getDoc(userRef);

    // AUTO-CREATE OR FIX ADMIN DOC
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

    // FORCE SHOW APP FOR APPROVED OR ADMIN
    if (data.status === "approved" || data.role === "admin" || user.email === "jonathanmentor62@gmail.com") {
      showApp();
    } else {
      // pending
      authView?.classList.add('hidden');
      appView?.classList.add('hidden');
      pendingView?.classList.remove('hidden');
    }

  } catch (e) {
    console.error("Error loading profile:", e);
    // Even on error, show app for admin to avoid white screen
    if (user.email === "jonathanmentor62@gmail.com") showApp();
  }
});