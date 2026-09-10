// FINAL JDA NETWORKS - CLEAN - NO UNDEFINED - PROJECT FABDE
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, query, orderBy, where, addDoc, serverTimestamp, onSnapshot, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
const rejectedView = document.getElementById('rejectedView');
const mobileNav = document.getElementById('mobileNav');
const pageContent = document.getElementById('pageContent');
const pageTitle = document.getElementById('pageTitle');
const pageSubtitle = document.getElementById('pageSubtitle');
const meAvatar = document.getElementById('meAvatar');
const adminNav = document.getElementById('adminNav');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');

let currentUserData = null;
let currentPage = 'chats';

function showAuth() {
  authView?.classList.remove('hidden');
  appView?.classList.add('hidden');
  pendingView?.classList.add('hidden');
  rejectedView?.classList.add('hidden');
  mobileNav?.classList.add('hidden');
}
function showPending() {
  authView?.classList.add('hidden');
  appView?.classList.add('hidden');
  pendingView?.classList.remove('hidden');
  rejectedView?.classList.add('hidden');
  mobileNav?.classList.add('hidden');
}
function showRejected() {
  authView?.classList.add('hidden');
  appView?.classList.add('hidden');
  pendingView?.classList.add('hidden');
  rejectedView?.classList.remove('hidden');
  mobileNav?.classList.add('hidden');
}
function showApp() {
  authView?.classList.add('hidden');
  pendingView?.classList.add('hidden');
  rejectedView?.classList.add('hidden');
  appView?.classList.remove('hidden');
  mobileNav?.classList.remove('hidden');
  loadPage(currentPage);
}

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    if (tab.dataset.auth === 'login') {
      loginForm?.classList.remove('hidden');
      registerForm?.classList.add('hidden');
    } else {
      loginForm?.classList.add('hidden');
      registerForm?.classList.remove('hidden');
    }
  });
});

onAuthStateChanged(auth, async (user) => {
  if (!user) { showAuth(); return; }
  try {
    const userRef = doc(db, "users", user.uid);
    let snap = await getDoc(userRef);
    if (!snap.exists() || user.email === "jonathanmentor62@gmail.com") {
      await setDoc(userRef, {
        email: user.email, uid: user.uid, username: "JonathanMentor",
        displayName: "Jonathan Mentor", fullName: "Jonathan Mentor",
        status: "approved", role: "admin", createdAt: serverTimestamp()
      }, { merge: true });
      snap = await getDoc(userRef);
    }
    currentUserData = snap.data();
    if (meAvatar) meAvatar.textContent = (currentUserData.displayName || currentUserData.username || currentUserData.email || "J")[0].toUpperCase();
    if (currentUserData.role === "admin") adminNav?.classList.remove('hidden');
    if (currentUserData.status === "approved" || currentUserData.role === "admin") showApp();
    else if (currentUserData.status === "pending") showPending();
    else if (currentUserData.status === "rejected") showRejected();
    else showPending();
  } catch (e) {
    console.error(e);
    if (user.email === "jonathanmentor62@gmail.com") showApp();
    else showAuth();
  }
});

loginForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail')?.value?.trim();
  const password = document.getElementById('loginPassword')?.value;
  if (!email ||!password) return alert("Enter email and password");
  try { await signInWithEmailAndPassword(auth, email, password); }
  catch (err) { alert("Login failed: " + err.message); }
});

registerForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fullName = document.getElementById('regName')?.value?.trim();
  const phone = document.getElementById('regPhone')?.value?.trim();
  const username = document.getElementById('regUsername')?.value?.trim();
  const email = document.getElementById('regEmail')?.value?.trim();
  const password = document.getElementById('regPassword')?.value;
  if (!email ||!password ||!username) return alert("Fill all required");
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const isAdmin = email === "jonathanmentor62@gmail.com";
    await setDoc(doc(db, "users", cred.user.uid), {
      email, uid: cred.user.uid, username, displayName: fullName || username,
      fullName, phone, status: isAdmin? "approved" : "pending",
      role: isAdmin? "admin" : "member", createdAt: serverTimestamp()
    });
    alert(isAdmin? "Admin created!" : "Registration submitted! Waiting for approval.");
  } catch (err) { alert("Register failed: " + err.message); }
});

document.getElementById('logoutBtn')?.addEventListener('click', async () => { await signOut(auth); });
document.getElementById('pendingLogout')?.addEventListener('click', async () => { await signOut(auth); });
document.getElementById('rejectedLogout')?.addEventListener('click', async () => { await signOut(auth); });

function setActiveNav(page) {
  document.querySelectorAll('.nav-item').forEach(b => { b.classList.toggle('active', b.dataset.page === page); });
}
document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
  btn.addEventListener('click', () => {
    currentPage = btn.dataset.page;
    setActiveNav(currentPage);
    loadPage(currentPage);
  });
});

async function loadPage(page) {
  if (!pageContent) return;
  if (pageTitle) pageTitle.textContent = page.charAt(0).toUpperCase() + page.slice(1);

  if (page === 'chats') {
    if (pageSubtitle) pageSubtitle.textContent = 'Your conversations';
    pageContent.innerHTML = '<p style="padding:20px;color:#666">Loading chats...</p>';
    try {
      const usersSnap = await getDocs(query(collection(db, "users"), where("status", "==", "approved")));
      let html = '<div style="display:flex;flex-direction:column;gap:5px;padding:10px">';
      let count = 0;
      usersSnap.forEach(d => {
        const u = d.data();
        if (!u.email) return; // SKIP broken docs
        if (u.uid === auth.currentUser?.uid) return;
        count++;
        const name = u.displayName || u.fullName || u.username || u.email.split('@')[0];
        const email = u.email;
        const uname = u.username || email.split('@')[0];
        html += `<div class="chat-item" data-uid="${u.uid}" data-name="${name}" style="background:white;padding:15px;border-radius:12px;display:flex;align-items:center;gap:12px;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,0.08)">
          <div style="width:45px;height:45px;background:#168f61;color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:18px">${name[0].toUpperCase()}</div>
          <div style="flex:1"><b>${name}</b><br><small style="color:#666">${email} • @${uname}</small></div><span style="color:#168f61">💬</span>
        </div>`;
      });
      html += '</div>';
      if (count === 0) html = '<div style="padding:30px;text-align:center"><h3>No other approved users</h3><p>Go to Network to see all members</p></div>';
      pageContent.innerHTML = html;
      pageContent.querySelectorAll('.chat-item').forEach(el => {
        el.addEventListener('click', () => openChat(el.dataset.uid, el.dataset.name));
      });
    } catch (e) { pageContent.innerHTML = `<p style="color:red;padding:20px">Error: ${e.message}</p>`; }
  }
  else if (page === 'network') {
    if (pageSubtitle) pageSubtitle.textContent = 'All members';
    pageContent.innerHTML = '<p style="padding:20px">Loading network...</p>';
    try {
      const snap = await getDocs(collection(db, "users"));
      let html = '<div style="padding:10px;display:grid;gap:10px">';
      let validCount = 0;
      snap.forEach(d => {
        const u = d.data();
        if (!u.email) return; // SKIP broken undefined docs - THIS FIXES YOUR BUG
        validCount++;
        const name = u.displayName || u.fullName || u.username || u.email.split('@')[0];
        const username = u.username || u.email.split('@')[0];
        const status = u.status || 'pending';
        const color = status==='approved'?'green': status==='pending'?'orange':'red';
        html += `<div style="background:white;padding:15px;border-radius:12px;display:flex;justify-content:space-between;align-items:center">
          <div><b>${name}</b> <small style="color:${color}">(${status})</small><br><small style="color:#666">@${username} • ${u.email}</small></div>
          ${auth.currentUser?.uid!== u.uid && currentUserData?.role==='admin' && status!=='approved'? `<button onclick="deleteUserDoc('${d.id}')" style="background:#ff4444;color:white;border:none;padding:5px 10px;border-radius:5px">Delete</button>` : ''}
        </div>`;
      });
      html += '</div>';
      if (validCount===0) html = '<p style="padding:20px">No users yet</p>';
      else html = `<div style="padding:10px"><small style="color:#666">Found ${validCount} valid users (broken docs hidden)</small></div>` + html;
      pageContent.innerHTML = html;
    } catch(e) { pageContent.innerHTML = e.message; }
  }
  else if (page === 'admin') {
    if (pageSubtitle) pageSubtitle.textContent = 'Approve users';
    pageContent.innerHTML = '<p style="padding:20px">Loading pending...</p>';
    try {
      const snap = await getDocs(query(collection(db, "users"), where("status", "==", "pending")));
      let validPending = [];
      snap.forEach(d => { if (d.data().email) validPending.push(d); });
      if (validPending.length===0) { pageContent.innerHTML = '<p style="padding:20px">No pending users 🎉</p>'; return; }
      let html = '<div style="padding:10px;display:flex;flex-direction:column;gap:10px">';
      validPending.forEach(d => {
        const u = d.data();
        const name = u.displayName || u.fullName || u.username || u.email;
        html += `<div style="background:white;padding:15px;border-radius:12px"><b>${name}</b> (${u.username||''})<br><small>${u.email} | ${u.phone||''}</small><br><div style="margin-top:10px;display:flex;gap:10px"><button class="primary" onclick="approveUser('${d.id}')" style="padding:8px 15px;background:#168f61;color:white;border:none;border-radius:6px;cursor:pointer">Approve</button><button onclick="rejectUser('${d.id}')" style="padding:8px 15px;background:#ff4444;color:white;border:none;border-radius:6px;cursor:pointer">Reject</button><button onclick="deleteUserDoc('${d.id}')" style="padding:8px 10px;background:#666;color:white;border:none;border-radius:6px">Delete</button></div></div>`;
      });
      html += '</div>';
      pageContent.innerHTML = html;
    } catch(e) { pageContent.innerHTML = e.message; }
  }
  else {
    pageContent.innerHTML = `<div style="padding:40px;text-align:center"><h3>${page}</h3><p style="color:#666">Coming soon in JDA Networks</p></div>`;
  }
}

window.approveUser = async (uid) => { await updateDoc(doc(db, "users", uid), { status: "approved" }); alert("Approved!"); loadPage('admin'); };
window.rejectUser = async (uid) => { await updateDoc(doc(db, "users", uid), { status: "rejected" }); alert("Rejected"); loadPage('admin'); };
window.deleteUserDoc = async (uid) => { if(confirm("Delete this user doc permanently?")){ await deleteDoc(doc(db,"users",uid)); alert("Deleted"); loadPage(currentPage); } };

const chatModal = document.getElementById('chatModal');
const closeChatBtn = document.getElementById('closeChat');
const chatNameEl = document.getElementById('chatName');
const messagesEl = document.getElementById('messages');
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');
let currentChatId = null;
let currentChatPartner = null;

window.openChat = async (partnerUid, partnerName) => {
  currentChatPartner = partnerUid;
  const myUid = auth.currentUser.uid;
  currentChatId = [myUid, partnerUid].sort().join('_');
  if (chatNameEl) chatNameEl.textContent = partnerName;
  chatModal?.classList.remove('hidden');
  if (messagesEl) messagesEl.innerHTML = '<p style="padding:20px;color:#666">Loading messages...</p>';
  const q = query(collection(db, "chats", currentChatId, "messages"), orderBy("createdAt", "asc"));
  onSnapshot(q, (snap) => {
    if (!messagesEl) return;
    messagesEl.innerHTML = '';
    if (snap.empty) { messagesEl.innerHTML = '<p style="padding:20px;color:#999;text-align:center">No messages yet. Say hi!</p>'; return; }
    snap.forEach(d => {
      const m = d.data();
      const isMe = m.senderId === myUid;
      const div = document.createElement('div');
      div.style.cssText = `margin:8px;padding:10px 14px;border-radius:15px;max-width:75%;${isMe?'background:#168f61;color:white;margin-left:auto':'background:white;box-shadow:0 1px 2px rgba(0,0,0,0.1)'}`;
      div.textContent = m.text;
      messagesEl.appendChild(div);
    });
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });
};

closeChatBtn?.addEventListener('click', () => chatModal?.classList.add('hidden'));
messageForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = messageInput?.value?.trim();
  if (!text ||!currentChatId) return;
  messageInput.value = '';
  try {
    await setDoc(doc(db, "chats", currentChatId), { participants: [auth.currentUser.uid, currentChatPartner], lastMessage: text, lastMessageAt: serverTimestamp() }, { merge: true });
    await addDoc(collection(db, "chats", currentChatId, "messages"), { text, senderId: auth.currentUser.uid, createdAt: serverTimestamp() });
  } catch (err) { alert(err.message); }
});

console.log("JDA Networks CLEAN FABDE Loaded - undefined fixed!");