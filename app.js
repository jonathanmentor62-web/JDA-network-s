// =========================================================
// jChat — REAL APP CORE
// No admin account.
// Firebase Auth + Firestore + WebRTC
// =========================================================

import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

import {
  collection,
  doc,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";


// =========================================================
// CONFIG
// =========================================================

const METERED_TURN_USERNAME = "3e34f2edd42777aac34b9a4f";
const METERED_TURN_CREDENTIAL = "hSQcaWCgT3jN4xUe";

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },

  {
    urls: [
      "turn:a.relay.metered.ca:80",
      "turn:a.relay.metered.ca:80?transport=tcp",
      "turn:a.relay.metered.ca:443",
      "turn:a.relay.metered.ca:443?transport=tcp"
    ],
    username: METERED_TURN_USERNAME,
    credential: METERED_TURN_CREDENTIAL
  }
];


// =========================================================
// STATE
// =========================================================

let currentUser = null;
let currentProfile = null;

let members = [];
let conversations = [];

let currentConversation = null;
let currentPeer = null;

let unsubscribeMembers = null;
let unsubscribeConversations = null;
let unsubscribeMessages = null;
let unsubscribeIncomingCalls = null;
let unsubscribeCurrentCall = null;

let peerConnection = null;
let localStream = null;
let remoteStream = null;

let currentCall = null;

let pendingRemoteCandidates = [];

let incomingCallId = null;
let incomingCallData = null;


// =========================================================
// HELPERS
// =========================================================

function $(id) {
  return document.getElementById(id);
}

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function initials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (!parts.length) return "?";

  return parts
    .slice(0, 2)
    .map(part => part[0].toUpperCase())
    .join("");
}

function formatTime(timestamp) {
  if (!timestamp) return "";

  const date = timestamp?.toDate
    ? timestamp.toDate()
    : new Date(timestamp);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatDateTime(timestamp) {
  if (!timestamp) return "";

  const date = timestamp?.toDate
    ? timestamp.toDate()
    : new Date(timestamp);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString();
}

function profilePhoto(profile) {
  return profile?.photoURL || "";
}

function showToast(message) {
  if (window.jChatUI?.showToast) {
    window.jChatUI.showToast(message);
    return;
  }

  console.log("[jChat]", message);
}


// =========================================================
// AUTH
// =========================================================

onAuthStateChanged(auth, async user => {
  if (!user) {
    currentUser = null;
    currentProfile = null;

    stopListeners();

    return;
  }

  currentUser = user;

  try {
    await startApp();
  } catch (error) {
    console.error("jChat startup error:", error);
    showToast("Unable to load jChat.");
  }
});


// =========================================================
// START APP
// =========================================================

async function startApp() {
  if (!currentUser) return;

  const userRef = doc(db, "users", currentUser.uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    showToast("Your jChat profile was not found.");
    return;
  }

  currentProfile = {
    uid: currentUser.uid,
    ...userSnap.data()
  };

  applyProfileToUI();

  await setOnlineStatus(true);

  listenMembers();
  listenConversations();
  listenIncomingCalls();

  renderContacts();
  loadCallHistory();
}


// =========================================================
// PROFILE UI
// =========================================================

function applyProfileToUI() {
  const profile = currentProfile;

  if (!profile) return;

  const name = profile.realName || profile.displayName || "jChat User";
  const about =
    profile.about ||
    "Hey there! I am using jChat.";

  const avatar = profilePhoto(profile);

  if ($("profileName")) {
    $("profileName").textContent = name;
  }

  if ($("profileAbout")) {
    $("profileAbout").textContent = about;
  }

  if ($("profileAvatar")) {
    if (avatar) {
      $("profileAvatar").src = avatar;
    } else {
      $("profileAvatar").src =
        `https://ui-avatars.com/api/?name=${encodeURIComponent(
          name
        )}&background=15152b&color=ffffff`;
    }
  }
}


// =========================================================
// ONLINE STATUS
// =========================================================

async function setOnlineStatus(isOnline) {
  if (!currentUser) return;

  try {
    await setDoc(
      doc(db, "users", currentUser.uid),
      {
        isOnline,
        lastSeen: serverTimestamp(),
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );
  } catch (error) {
    console.error("Status update failed:", error);
  }
}

window.addEventListener("beforeunload", () => {
  setOnlineStatus(false);
});

document.addEventListener("visibilitychange", () => {
  if (!currentUser) return;

  setOnlineStatus(!document.hidden);
});


// =========================================================
// MEMBERS
// =========================================================

function listenMembers() {
  if (unsubscribeMembers) {
    unsubscribeMembers();
  }

  const q = query(
    collection(db, "users"),
    orderBy("realName", "asc")
  );

  unsubscribeMembers = onSnapshot(
    q,
    snapshot => {
      members = snapshot.docs.map(item => ({
        uid: item.id,
        ...item.data()
      }));

      renderContacts();
      renderChatList();
    },
    error => {
      console.error("Members listener error:", error);
    }
  );
}


// =========================================================
// CONTACTS
// =========================================================

function renderContacts(search = "") {
  const container = $("contactList");

  if (!container) return;

  const term = search.trim().toLowerCase();

  const contacts = members.filter(member => {
    if (member.uid === currentUser?.uid) return false;

    if (!term) return true;

    return (
      String(member.realName || "")
        .toLowerCase()
        .includes(term) ||
      String(member.about || "")
        .toLowerCase()
        .includes(term)
    );
  });

  if (!contacts.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⌕</div>
        <div>No contacts found</div>
      </div>
    `;
    return;
  }

  container.innerHTML = contacts.map(member => {
    const name = member.realName || "jChat User";
    const photo = profilePhoto(member);

    return `
      <button class="contact-item" data-user-id="${escapeHTML(member.uid)}">
        <div class="avatar-wrap">
          ${
            photo
              ? `<img class="contact-avatar" src="${escapeHTML(photo)}" alt="">`
              : `<div class="contact-avatar avatar-fallback">${escapeHTML(
                  initials(name)
                )}</div>`
          }
          ${
            member.isOnline
              ? `<span class="online-dot"></span>`
              : ""
          }
        </div>

        <div class="contact-info">
          <div