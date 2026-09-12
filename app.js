/* =========================================================
   JDA NETWORKS — COMPLETE app.js
   WhatsApp-style school messenger
   Firebase Auth + Firestore
   Real WebRTC audio/video calls
   Metered TURN support
   NO AI
   ========================================================= */

import {
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  limit
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

import { auth, db } from "./firebase.js";

/* =========================================================
   CONFIGURATION
   ========================================================= */

const ADMIN_EMAIL = "jonathanmentor62@gmail.com";

/*
  IMPORTANT:
  Replace these two placeholders with a FRESH Metered TURN
  username and credential after rotating the exposed credential.
*/
const METERED_TURN_USERNAME = "YOUR_FRESH_METERED_USERNAME";
const METERED_TURN_CREDENTIAL = "YOUR_FRESH_METERED_CREDENTIAL";

const RTC_CONFIG = {
  iceServers: [
    {
      urls: "stun:stun.relay.metered.ca:80"
    },
    {
      urls: "turn:global.relay.metered.ca:80",
      username: METERED_TURN_USERNAME,
      credential: METERED_TURN_CREDENTIAL
    },
    {
      urls: "turn:global.relay.metered.ca:80?transport=tcp",
      username: METERED_TURN_USERNAME,
      credential: METERED_TURN_CREDENTIAL
    },
    {
      urls: "turn:global.relay.metered.ca:443",
      username: METERED_TURN_USERNAME,
      credential: METERED_TURN_CREDENTIAL
    },
    {
      urls: "turns:global.relay.metered.ca:443?transport=tcp",
      username: METERED_TURN_USERNAME,
      credential: METERED_TURN_CREDENTIAL
    }
  ]
};

/* =========================================================
   STATE
   ========================================================= */

let currentUser = null;
let currentProfile = null;

let members = [];
let conversations = [];

let currentChatUser = null;
let currentConversationId = null;

let unsubscribeMembers = null;
let unsubscribeConversations = null;
let unsubscribeMessages = null;
let unsubscribeIncomingCalls = null;
let unsubscribeCurrentCall = null;
let unsubscribeCandidates = null;

let rtcPeer = null;
let localStream = null;
let remoteStream = null;

let currentCallId = null;
let currentCallType = null;
let currentCallRole = null;

let isMuted = false;
let cameraEnabled = true;

let currentSection = "chats";

/* =========================================================
   HELPERS
   ========================================================= */

const $ = (id) => document.getElementById(id);

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safePhoto(photo) {
  return photo || "";
}

function initials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (!parts.length) return "J";

  return parts
    .slice(0, 2)
    .map(x => x[0].toUpperCase())
    .join("");
}

function formatTime(timestamp) {
  if (!timestamp) return "";

  try {
    const date = timestamp.toDate
      ? timestamp.toDate()
      : new Date(timestamp);

    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return "";
  }
}

function formatLastSeen(timestamp) {
  if (!timestamp) return "offline";

  try {
    const date = timestamp.toDate
      ? timestamp.toDate()
      : new Date(timestamp);

    return `last seen ${date.toLocaleString()}`;
  } catch {
    return "offline";
  }
}

function showToast(message) {
  let toast = $("jdaToast");

  if (!toast) {
    toast = document.createElement("div");
    toast.id = "jdaToast";
    toast.style.cssText = `
      position:fixed;
      left:50%;
      bottom:90px;
      transform:translateX(-50%);
      z-index:99999;
      background:rgba(10,15,35,.95);
      color:#fff;
      border:1px solid rgba(105,130,255,.45);
      box-shadow:0 10px 35px rgba(0,0,0,.4);
      padding:12px 17px;
      border-radius:14px;
      font-size:14px;
      max-width:85%;
      text-align:center;
      backdrop-filter:blur(14px);
    `;
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.style.display = "block";

  clearTimeout(toast._timer);

  toast._timer = setTimeout(() => {
    toast.style.display = "none";
  }, 3000);
}

function userIsAdmin() {
  return (
    currentUser?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase()
  );
}

function isApproved() {
  return (
    currentProfile &&
    (
      currentProfile.approved === true ||
      currentProfile.status === "approved"
    )
  );
}

function getUserName(uid) {
  const user = members.find(x => x.uid === uid);

  return user?.realName || "JDA Member";
}

/* =========================================================
   NEON DESIGN
   ========================================================= */

function installNeonStyles() {
  if ($("jdaInjectedStyles")) return;

  const style = document.createElement("style");
  style.id = "jdaInjectedStyles";

  style.textContent = `
    :root {
      --jda-blue:#4b6cff;
      --jda-purple:#9b5cff;
      --jda-cyan:#20d9ff;
      --jda-pink:#ff4fd8;
      --jda-bg:#070b19;
      --jda-panel:#0d1326;
      --jda-panel2:#111a34;
      --jda-text:#f5f7ff;
      --jda-muted:#9ca8c7;
    }

    body {
      background:
        radial-gradient(circle at 15% 10%, rgba(75,108,255,.22), transparent 28%),
        radial-gradient(circle at 85% 20%, rgba(155,92,255,.20), transparent 28%),
        radial-gradient(circle at 50% 100%, rgba(32,217,255,.10), transparent 32%),
        #070b19 !important;
      color:var(--jda-text);
    }

    .jda-neon-avatar {
      width:48px;
      height:48px;
      border-radius:50%;
      overflow:hidden;
      display:flex;
      align-items:center;
      justify-content:center;
      background:
        linear-gradient(135deg,#4b6cff,#9b5cff,#20d9ff);
      box-shadow:
        0 0 14px rgba(75,108,255,.45),
        0 0 25px rgba(155,92,255,.18);
      color:white;
      font-weight:800;
      flex:none;
    }

    .jda-neon-avatar img {
      width:100%;
      height:100%;
      object-fit:cover;
    }

    .jda-online-dot {
      width:10px;
      height:10px;
      border-radius:50%;
      background:#39ff88;
      box-shadow:0 0 10px #39ff88;
      display:inline-block;
      margin-left:6px;
    }

    .jda-offline-dot {
      width:10px;
      height:10px;
      border-radius:50%;
      background:#69718a;
      display:inline-block;
      margin-left:6px;
    }

    .jda-call-overlay {
      position:fixed;
      inset:0;
      z-index:100000;
      display:none;
      flex-direction:column;
      background:
        radial-gradient(circle at 50% 20%, rgba(85,105,255,.30), transparent 35%),
        rgba(3,7,18,.96);
      backdrop-filter:blur(20px);
    }

    .jda-call-top {
      padding:25px 18px 10px;
      text-align:center;
    }

    .jda-call-title {
      font-size:20px;
      font-weight:800;
    }

    .jda-call-status {
      color:#aeb8d3;
      margin-top:5px;
      font-size:14px;
    }

    .jda-video-area {
      flex:1;
      position:relative;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:15px;
    }

    #jdaRemoteVideo {
      width:100%;
      height:100%;
      max-height:75vh;
      object-fit:cover;
      border-radius:22px;
      background:#02040b;
      box-shadow:
        0 0 30px rgba(75,108,255,.20);
    }

    #jdaLocalVideo {
      position:absolute;
      right:25px;
      bottom:25px;
      width:115px;
      height:165px;
      object-fit:cover;
      border-radius:17px;
      background:#02040b;
      border:2px solid rgba(255,255,255,.18);
      box-shadow:0 8px 25px rgba(0,0,0,.5);
    }

    .jda-audio-avatar {
      width:125px;
      height:125px;
      border-radius:50%;
      display:flex;
      align-items:center;
      justify-content:center;
      font-size:40px;
      font-weight:900;
      color:#fff;
      background:linear-gradient(135deg,#4b6cff,#9b5cff,#20d9ff);
      box-shadow:
        0 0 25px rgba(75,108,255,.55),
        0 0 70px rgba(155,92,255,.20);
    }

    .jda-call-buttons {
      display:flex;
      justify-content:center;
      gap:14px;
      padding:20px;
      padding-bottom:30px;
    }

    .jda-call-btn {
      width:54px;
      height:54px;
      border:none;
      border-radius:50%;
      color:#fff;
      background:#1b2440;
      font-size:20px;
      cursor:pointer;
    }

    .jda-call-btn:hover {
      background:#28345c;
    }

    .jda-call-end {
      background:#ff315b !important;
      box-shadow:0 0 18px rgba(255,49,91,.35);
    }

    .jda-incoming {
      position:fixed;
      left:14px;
      right:14px;
      top:18px;
      z-index:100001;
      display:none;
      padding:16px;
      border-radius:20px;
      background:rgba(13,19,38,.97);
      border:1px solid rgba(95,117,255,.45);
      box-shadow:0 15px 50px rgba(0,0,0,.5);
      backdrop-filter:blur(20px);
    }

    .jda-incoming-row {
      display:flex;
      align-items:center;
      gap:12px;
    }

    .jda-incoming-actions {
      display:flex;
      gap:9px;
      margin-top:14px;
    }

    .jda-incoming-actions button {
      flex:1;
      border:none;
      border-radius:13px;
      padding:12px;
      font-weight:800;
      cursor:pointer;
    }

    .jda-accept {
      background:#31df7b;
      color:#07150d;
    }

    .jda-reject {
      background:#ff315b;
      color:#fff;
    }

    .jda-class-card {
      border-radius:20px;
      padding:18px;
      margin:10px 0;
      background:
        linear-gradient(135deg,rgba(75,108,255,.18),rgba(155,92,255,.10)),
        rgba(14,20,40,.85);
      border:1px solid rgba(104,125,255,.22);
      cursor:pointer;
      box-shadow:0 10px 35px rgba(0,0,0,.12);
    }

    .jda-class-card:hover {
      border-color:rgba(104,125,255,.5);
      transform:translateY(-1px);
    }

    .jda-member-row {
      display:flex;
      align-items:center;
      gap:12px;
      padding:13px 7px;
      border-bottom:1px solid rgba(255,255,255,.06);
      cursor:pointer;
    }

    .jda-member-info {
      flex:1;
      min-width:0;
    }

    .jda-member-name {
      font-weight:750;
      white-space:nowrap;
      overflow:hidden;
      text-overflow:ellipsis;
    }

    .jda-member-meta {
      color:var(--jda-muted);
      font-size:12px;
      margin-top:3px;
    }

    .jda-chat-message {
      max-width:78%;
      padding:9px 11px;
      border-radius:15px;
      margin:5px 0;
      word-break:break-word;
    }

    .jda-message-me {
      margin-left:auto;
      background:linear-gradient(135deg,#4b6cff,#6954df);
      border-bottom-right-radius:5px;
    }

    .jda-message-them {
      margin-right:auto;
      background:#17203a;
      border-bottom-left-radius:5px;
    }

    .jda-message-time {
      display:block;
      margin-top:3px;
      text-align:right;
      font-size:10px;
      opacity:.7;
    }

    .jda-call-mini {
      border:1px solid rgba(99,122,255,.25);
      border-radius:15px;
      padding:11px;
      margin-top:5px;
      background:rgba(75,108,255,.10);
    }

    .jda-empty {
      padding:35px 20px;
      text-align:center;
      color:#98a4c2;
    }

    .jda-search-box {
      width:100%;
      box-sizing:border-box;
      padding:13px 15px;
      border-radius:15px;
      border:1px solid rgba(100,120,255,.20);
      background:#0e162d;
      color:#fff;
      outline:none;
      margin-bottom:10px;
    }

    .jda-search-box:focus {
      border-color:#667fff;
      box-shadow:0 0 20px rgba(75,108,255,.14);
    }

    .jda-profile-panel {
      padding:20px;
    }

    .jda-profile-big {
      width:100px;
      height:100px;
      margin:0 auto 12px;
      border-radius:50%;
      overflow:hidden;
      background:linear-gradient(135deg,#4b6cff,#9b5cff);
      display:flex;
      align-items:center;
      justify-content:center;
      font-size:30px;
      font-weight:900;
    }

    .jda-profile-big img {
      width:100%;
      height:100%;
      object-fit:cover;
    }

    .jda-admin-badge {
      display:inline-block;
      padding:4px 8px;
      border-radius:999px;
      background:rgba(75,108,255,.16);
      border:1px solid rgba(75,108,255,.3);
      font-size:11px;
      color:#b9c5ff;
    }

    .jda-pulse {
      animation:jdaPulse 1.8s infinite;
    }

    @keyframes jdaPulse {
      0%,100% {
        box-shadow:0 0 0 0 rgba(75,108,255,.20);
      }
      50% {
        box-shadow:0 0 0 13px rgba(75,108,255,0);
      }
    }
  `;

  document.head.appendChild(style);
}

/* =========================================================
   AUTH GATE
   ========================================================= */

function ensureAppStructure() {
  installNeonStyles();

  if (!$("jdaCallOverlay")) {
    const overlay = document.createElement("div");
    overlay.id = "jdaCallOverlay";
    overlay.className = "jda-call-overlay";

    overlay.innerHTML = `
      <div class="jda-call-top">
        <div id="jdaCallTitle" class="jda-call-title">
          JDA Networks Call
        </div>

        <div id="jdaCallStatus" class="jda-call-status">
          Connecting...
        </div>
      </div>

      <div class="jda-video-area">
        <div id="jdaAudioAvatar" class="jda-audio-avatar">
          J
        </div>

        <video
          id="jdaRemoteVideo"
          autoplay
          playsinline
        ></video>

        <video
          id="jdaLocalVideo"
          autoplay
          muted
          playsinline
        ></video>
      </div>

      <div class="jda-call-buttons">
        <button id="jdaMuteBtn" class="jda-call-btn">
          🎙
        </button>

        <button id="jdaCameraBtn" class="jda-call-btn">
          📷
        </button>

        <button id="jdaEndBtn" class="jda-call-btn jda-call-end">
          ☎
        </button>
      </div>
    `;

    document.body.appendChild(overlay);

    $("jdaMuteBtn").onclick = toggleMute;
    $("jdaCameraBtn").onclick = toggleCamera;
    $("jdaEndBtn").onclick = () => endCall();
  }

  if (!$("jdaIncomingCall")) {
    const incoming = document.createElement("div");

    incoming.id = "jdaIncomingCall";
    incoming.className = "jda-incoming";

    incoming.innerHTML = `
      <div class="jda-incoming-row">
        <div id="jdaIncomingAvatar" class="jda-neon-avatar">
          J
        </div>

        <div style="flex:1">
          <div id="jdaIncomingName" style="font-weight:800">
            Incoming call
          </div>

          <div id="jdaIncomingType" style="font-size:13px;color:#9ca8c7">
            Incoming call...
          </div>
        </div>
      </div>

      <div class="jda-incoming-actions">
        <button id="jdaRejectIncoming" class="jda-reject">
          Reject
        </button>

        <button id="jdaAcceptIncoming" class="jda-accept">
          Accept
        </button>
      </div>
    `;

    document.body.appendChild(incoming);

    $("jdaRejectIncoming").onclick = rejectIncomingCall;
    $("jdaAcceptIncoming").onclick = acceptIncomingCall;
  }
}

/* =========================================================
   PROFILE / ONLINE
   ========================================================= */

async function setOnline() {
  if (!currentUser) return;

  try {
    await updateDoc(
      doc(db, "users", currentUser.uid),
      {
        isOnline: true,
        lastSeen: serverTimestamp()
      }
    );
  } catch (error) {
    console.warn("Could not set online:", error);
  }
}

async function setOffline() {
  if (!currentUser) return;

  try {
    await updateDoc(
      doc(db, "users", currentUser.uid),
      {
        isOnline: false,
        lastSeen: serverTimestamp()
      }
    );
  } catch (error) {
    console.warn("Could not set offline:", error);
  }
}

window.addEventListener("beforeunload", () => {
  setOffline();
});

document.addEventListener("visibilitychange", () => {
  if (!currentUser) return;

  if (document.visibilityState === "visible") {
    setOnline();
  } else {
    setOffline();
  }
});

async function loadCurrentProfile() {
  if (!currentUser) return null;

  const snap = await getDoc(
    doc(db, "users", currentUser.uid)
  );

  if (!snap.exists()) {
    return null;
  }

  return {
    id: snap.id,
    ...snap.data()
  };
}

/* =========================================================
   MEMBERS
   ========================================================= */

function listenToMembers() {
  if (unsubscribeMembers) {
    unsubscribeMembers();
  }

  const q = query(
    collection(db, "users"),
    orderBy("realName"),
    limit(500)
  );

  unsubscribeMembers = onSnapshot(
    q,
    snapshot => {
      members = snapshot.docs
        .map(d => ({
          id: d.id,
          ...d.data()
        }))
        .filter(u => u.status === "approved" || u.approved === true);

      renderCurrentSection();
    },
    error => {
      console.error(error);
      showToast("Could not load JDA members.");
    }
  );
}

/* =========================================================
   CONVERSATIONS
   ========================================================= */

function conversationParticipants(data) {
  return Array.isArray(data?.participantIds)
    ? data.participantIds
    : [];
}

function otherParticipant(conversation) {
  const ids = conversationParticipants(conversation);

  return ids.find(id => id !== currentUser?.uid) || null;
}

function listenToConversations() {
  if (!currentUser) return;

  if (unsubscribeConversations) {
    unsubscribeConversations();
  }

  const q = query(
    collection(db, "conversations"),
    where(
      "participantIds",
      "array-contains",
      currentUser.uid
    )
  );

  unsubscribeConversations = onSnapshot(
    q,
    snapshot => {
      conversations = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));

      conversations.sort((a, b) => {
        const at = a.updatedAt?.toMillis?.() || 0;
        const bt = b.updatedAt?.toMillis?.() || 0;

        return bt - at;
      });

      renderCurrentSection();
    },
    error => {
      console.error(error);
      showToast("Could not load conversations.");
    }
  );
}

async function getOrCreateConversation(otherUid) {
  if (!currentUser || !otherUid) {
    throw new Error("Missing user.");
  }

  const existing = conversations.find(c =>
    conversationParticipants(c).includes(currentUser.uid) &&
    conversationParticipants(c).includes(otherUid)
  );

  if (existing) {
    return existing.id;
  }

  const ref = await addDoc(
    collection(db, "conversations"),
    {
      participantIds: [
        currentUser.uid,
        otherUid
      ],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastMessage: "",
      lastSenderId: ""
    }
  );

  return ref.id;
}

/* =========================================================
   MAIN NAVIGATION
   ========================================================= */

function setActiveSection(section) {
  currentSection = section;

  document
    .querySelectorAll("[data-jda-section]")
    .forEach(btn => {
      btn.classList.toggle(
        "active",
        btn.dataset.jdaSection === section
      );
    });

  renderCurrentSection();
}

function renderCurrentSection() {
  if (!currentUser || !currentProfile) return;

  const root =
    $("app") ||
    $("root") ||
    $("main") ||
    document.body;

  if (!root) return;

  const sectionRoot =
    $("jdaContent") ||
    $("content") ||
    $("pageContent") ||
    root;

  if (currentSection === "chats") {
    renderChats(sectionRoot);
  } else if (currentSection === "updates") {
    renderUpdates(sectionRoot);
  } else if (currentSection === "classes") {
    renderClasses(sectionRoot);
  } else if (currentSection === "staff") {
    renderStaff(sectionRoot);
  } else if (currentSection === "calls") {
    renderCalls(sectionRoot);
  }
}

/* =========================================================
   CHAT LIST
   ========================================================= */

function renderChats(root) {
  const myChats = conversations.map(c => {
    const uid = otherParticipant(c);
    const user = members.find(x => x.uid === uid);

    return {
      ...c,
      otherUser: user
    };
  }).filter(c => c.otherUser);

  root.innerHTML = `
    <div style="padding:15px">
      <div style="
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;
        margin-bottom:13px;
      ">
        <div>
          <div style="font-size:24px;font-weight:900">
            Chats
          </div>

          <div style="font-size:12px;color:#8f9bb8">
            JDA Networks
          </div>
        </div>

        <button
          id="jdaNewChatBtn"
          style="
            width:44px;
            height:44px;
            border:none;
            border-radius:50%;
            background:linear-gradient(135deg,#4b6cff,#9b5cff);
            color:white;
            font-size:22px;
          "
        >+</button>
      </div>

      <input
        id="jdaChatSearch"
        class="jda-search-box"
        placeholder="Search chats or members"
      />

      <div id="jdaChatList"></div>
    </div>
  `;

  $("jdaNewChatBtn").onclick = openNewChat;

  const list = $("jdaChatList");

  if (!myChats.length) {
    list.innerHTML = `
      <div class="jda-empty">
        No chats yet.<br><br>
        Tap <b>+</b> to start a private chat.
      </div>
    `;
  } else {
    list.innerHTML = myChats.map(c => {
      const user = c.otherUser;
      const photo = safePhoto(user.photoURL);

      return `
        <div
          class="jda-member-row"
          data-chat-user="${escapeHTML(user.uid)}"
        >
          <div class="jda-neon-avatar">
            ${
              photo
                ? `<img src="${escapeHTML(photo)}">`
                : escapeHTML(initials(user.realName))
            }
          </div>

          <div class="jda-member-info">
            <div class="jda-member-name">
              ${escapeHTML(user.realName || "JDA Member")}
            </div>

            <div class="jda-member-meta">
              ${escapeHTML(c.lastMessage || "Start chatting")}
            </div>
          </div>

          <div style="
            font-size:11px;
            color:#8793b2;
          ">
            ${formatTime(c.updatedAt)}
          </div>
        </div>
      `;
    }).join("");

    list.querySelectorAll("[data-chat-user]")
      .forEach(row => {
        row.onclick = () => {
          const uid = row.dataset.chatUser;

          const user = members.find(
            x => x.uid === uid
          );

          if (user) {
            openChat(user);
          }
        };
      });
  }

  $("jdaChatSearch").oninput = e => {
    const value = e.target.value.toLowerCase().trim();

    list.querySelectorAll("[data-chat-user]")
      .forEach(row => {
        row.style.display =
          row.textContent.toLowerCase().includes(value)
            ? "flex"
            : "none";
      });
  };
}

/* =========================================================
   NEW CHAT
   ========================================================= */

function openNewChat() {
  const root =
    $("jdaContent") ||
    $("content") ||
    document.body;

  const available = members.filter(
    m => m.uid !== currentUser.uid
  );

  root.innerHTML = `
    <div style="padding:15px">
      <div style="
        display:flex;
        align-items:center;
        gap:10px;
        margin-bottom:15px;
      ">
        <button id="jdaBackChats">
          ←
        </button>

        <div style="font-size:22px;font-weight:900">
          New chat
        </div>
      </div>

      <input
        id="jdaMemberSearch"
        class="jda-search-box"
        placeholder="Search JDA member"
      />

      <div id="jdaMemberList">
        ${
          available.length
            ? available.map(renderMemberRow).join("")
            : `<div class="jda-empty">No members available.</div>`
        }
      </div>
    </div>
  `;

  $("jdaBackChats").onclick = () => {
    setActiveSection("chats");
  };

  $("jdaMemberList")
    .querySelectorAll("[data-member-uid]")
    .forEach(row => {
      row.onclick = () => {
        const user = members.find(
          x => x.uid === row.dataset.memberUid
        );

        if (user) openChat(user);
      };
    });

  $("jdaMemberSearch").oninput = e => {
    const value = e.target.value.toLowerCase();

    $("jdaMemberList")
      .querySelectorAll("[data-member-uid]")
      .forEach(row => {
        row.style.display =
          row.textContent.toLowerCase().includes(value)
            ? "flex"
            : "none";
      });
  };
}

function renderMemberRow(user) {
  const photo = safePhoto(user.photoURL);

  const online = user.isOnline === true;

  return `
    <div
      class="jda-member-row"
      data-member-uid="${escapeHTML(user.uid)}"
    >
      <div class="jda-neon-avatar">
        ${
          photo
            ? `<img src="${escapeHTML(photo)}">`
            : escapeHTML(initials(user.realName))
        }
      </div>

      <div class="jda-member-info">
        <div class="jda-member-name">
          ${escapeHTML(user.realName || "JDA Member")}
          ${
            online
              ? `<span class="jda-online-dot"></span>`
              : ""
          }
        </div>

        <div class="jda-member-meta">
          ${
            user.accountType === "staff"
              ? `Staff • ${escapeHTML(user.department || "")}`
              : `${escapeHTML(user.className || user.studentClass || "")} ${escapeHTML(user.stream || "")}`
          }
        </div>
      </div>
    </div>
  `;
}

/* =========================================================
   OPEN CHAT
   ========================================================= */

async function openChat(user) {
  if (!user || !currentUser) return;

  currentChatUser = user;

  try {
    currentConversationId =
      await getOrCreateConversation(user.uid);

    renderChatWindow();
    listenToMessages();

  } catch (error) {
    console.error(error);
    showToast("Could not open this chat.");
  }
}

function renderChatWindow() {
  const root =
    $("jdaContent") ||
    $("content") ||
    document.body;

  const user = currentChatUser;

  if (!user) return;

  const online = user.isOnline === true;

  root.innerHTML = `
    <div style="
      height:100%;
      display:flex;
      flex-direction:column;
    ">
      <div style="
        display:flex;
        align-items:center;
        gap:10px;
        padding:10px 12px;
        border-bottom:1px solid rgba(255,255,255,.07);
        background:rgba(9,14,30,.82);
        backdrop-filter:blur(15px);
      ">
        <button id="jdaBackToChats">
          ←
        </button>

        <div class="jda-neon-avatar" style="
          width:42px;
          height:42px;
        ">
          ${
            user.photoURL
              ? `<img src="${escapeHTML(user.photoURL)}">`
              : escapeHTML(initials(user.realName))
          }
        </div>

        <div style="flex:1;min-width:0">
          <div style="
            font-weight:850;
            white-space:nowrap;
            overflow:hidden;
            text-overflow:ellipsis;
          ">
            ${escapeHTML(user.realName)}
          </div>

          <div style="
            font-size:11px;
            color:#9ca8c7;
          ">
            ${
              online
                ? `<span style="color:#39ff88">online</span>`
                : escapeHTML(formatLastSeen(user.lastSeen))
            }
          </div>
        </div>

        <button
          id="jdaAudioCallBtn"
          title="Audio call"
        >
          📞
        </button>

        <button
          id="jdaVideoCallBtn"
          title="Video call"
        >
          📹
        </button>

        <button
          id="jdaChatProfileBtn"
          title="Profile"
        >
          ⋮
        </button>
      </div>

      <div
        id="jdaMessages"
        style="
          flex:1;
          overflow-y:auto;
          padding:15px;
          background:
            radial-gradient(circle at 30% 20%,rgba(75,108,255,.06),transparent 30%),
            radial-gradient(circle at 80% 70%,rgba(155,92,255,.06),transparent 30%);
        "
      ></div>

      <div style="
        display:flex;
        gap:8px;
        padding:10px;
        border-top:1px solid rgba(255,255,255,.07);
        background:rgba(8,12,25,.95);
      ">
        <button id="jdaAttachBtn">
          ＋
        </button>

        <input
          id="jdaMessageInput"
          placeholder="Message"
          autocomplete="off"
          style="
            flex:1;
            min-width:0;
            border:none;
            outline:none;
            border-radius:18px;
            padding:12px 15px;
            background:#151e37;
            color:white;
          "
        />

        <button
          id="jdaSendBtn"
          style="
            width:45px;
            height:45px;
            border:none;
            border-radius:50%;
            background:linear-gradient(135deg,#4b6cff,#9b5cff);
            color:white;
          "
        >
          ➤
        </button>
      </div>
    </div>
  `;

  $("jdaBackToChats").onclick = () => {
    if (unsubscribeMessages) {
      unsubscribeMessages();
      unsubscribeMessages = null;
    }

    currentChatUser = null;
    currentConversationId = null;

    setActiveSection("chats");
  };

  $("jdaAudioCallBtn").onclick = () => {
    startOutgoingCall("audio");
  };

  $("jdaVideoCallBtn").onclick = () => {
    startOutgoingCall("video");
  };

  $("jdaChatProfileBtn").onclick = () => {
    showUserProfile(user);
  };

  $("jdaAttachBtn").onclick = () => {
    showToast(
      "Attachments are disabled because this build avoids Firebase Storage on Spark."
    );
  };

  $("jdaSendBtn").onclick = sendMessage;

  $("jdaMessageInput").addEventListener(
    "keydown",
    e => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    }
  );
}

/* =========================================================
   MESSAGES
   ========================================================= */

function listenToMessages() {
  if (!currentConversationId) return;

  if (unsubscribeMessages) {
    unsubscribeMessages();
  }

  const q = query(
    collection(
      db,
      "conversations",
      currentConversationId,
      "messages"
    ),
    orderBy("createdAt", "asc")
  );

  unsubscribeMessages = onSnapshot(
    q,
    snapshot => {
      renderMessages(snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      })));
    },
    error => {
      console.error(error);
      showToast("Could not load messages.");
    }
  );
}

function renderMessages(messages) {
  const box = $("jdaMessages");

  if (!box) return;

  if (!messages.length) {
    box.innerHTML = `
      <div class="jda-empty">
        Start the conversation with
        <b>${escapeHTML(currentChatUser?.realName || "this member")}</b>.
      </div>
    `;

    return;
  }

  box.innerHTML = messages.map(message => {
    const mine =
      message.senderId === currentUser.uid;

    const read =
      message.read === true ||
      message.seen === true;

    return `
      <div class="
        jda-chat-message
        ${mine ? "jda-message-me" : "jda-message-them"}
      ">
        <div>
          ${escapeHTML(message.text || "")}
        </div>

        <span class="jda-message-time">
          ${formatTime(message.createdAt)}
          ${
            mine
              ? read
                ? " ✓✓"
                : " ✓"
              : ""
          }
        </span>
      </div>
    `;
  }).join("");

  box.scrollTop = box.scrollHeight;
}

async function sendMessage() {
  if (
    !currentUser ||
    !currentChatUser ||
    !currentConversationId
  ) {
    return;
  }

  const input = $("jdaMessageInput");

  if (!input) return;

  const text = input.value.trim();

  if (!text) return;

  if (text.length > 5000) {
    showToast("Message is too long.");
    return;
  }

  input.value = "";

  try {
    await addDoc(
      collection(
        db,
        "conversations",
        currentConversationId,
        "messages"
      ),
      {
        senderId: currentUser.uid,
        receiverId: currentChatUser.uid,
        text,
        read: false,
        createdAt: serverTimestamp()
      }
    );

    await updateDoc(
      doc(
        db,
        "conversations",
        currentConversationId
      ),
      {
        lastMessage: text,
        lastSenderId: currentUser.uid,
        updatedAt: serverTimestamp()
      }
    );

  } catch (error) {
    console.error(error);

    input.value = text;

    showToast(
      error?.message || "Message could not be sent."
    );
  }
}

/* =========================================================
   USER PROFILE
   ========================================================= */

function showUserProfile(user) {
  const root =
    $("jdaContent") ||
    $("content") ||
    document.body;

  root.innerHTML = `
    <div class="jda-profile-panel">
      <button id="jdaProfileBack">
        ←
      </button>

      <div style="text-align:center;margin-top:20px">
        <div class="jda-profile-big">
          ${
            user.photoURL
              ? `<img src="${escapeHTML(user.photoURL)}">`
              : escapeHTML(initials(user.realName))
          }
        </div>

        <div style="font-size:23px;font-weight:900">
          ${escapeHTML(user.realName)}
        </div>

        <div style="color:#98a4c2;margin-top:4px">
          ${
            user.isOnline
              ? "Online"
              : formatLastSeen(user.lastSeen)
          }
        </div>
      </div>

      <div style="margin-top:25px">
        <div class="jda-class-card">
          <b>JDA Networks Number</b>
          <div style="margin-top:5px;color:#aab5d0">
            ${escapeHTML(user.jdaNumber || "Not available")}
          </div>
        </div>

        <div class="jda-class-card">
          <b>Account</b>
          <div style="margin-top:5px;color:#aab5d0">
            ${
              user.accountType === "staff"
                ? `Staff • ${escapeHTML(user.department || "")}`
                : `Student • ${escapeHTML(user.className || user.studentClass || "")} ${escapeHTML(user.stream || "")}`
            }
          </div>
        </div>
      </div>
    </div>
  `;

  $("jdaProfileBack").onclick = () => {
    if (currentChatUser) {
      renderChatWindow();
      listenToMessages();
    } else {
      setActiveSection("chats");
    }
  };
}

/* =========================================================
   CLASSES
   ========================================================= */

function renderClasses(root) {
  const classes = [
    "Form One",
    "Form Two",
    "Form Three",
    "Form Four",
    "Form Five",
    "Form Six"
  ];

  root.innerHTML = `
    <div style="padding:15px">
      <div style="font-size:24px;font-weight:900">
        Classes
      </div>

      <div style="
        color:#8f9bb8;
        font-size:13px;
        margin:4px 0 15px;
      ">
        JDA class communication
      </div>

      ${
        classes.map((name, index) => `
          <div
            class="jda-class-card"
            data-class="${escapeHTML(name)}"
          >
            <div style="
              font-size:20px;
              font-weight:900;
            ">
              ${escapeHTML(name)}
            </div>

            <div style="
              color:#9ba7c5;
              margin-top:4px;
            ">
              ${
                members.filter(m =>
                  String(
                    m.className ||
                    m.studentClass ||
                    ""
                  ).toLowerCase() === name.toLowerCase()
                ).length
              } students
            </div>
          </div>
        `).join("")
      }
    </div>
  `;

  root.querySelectorAll("[data-class]")
    .forEach(card => {
      card.onclick = () => {
        openClass(card.dataset.class);
      };
    });
}

function openClass(className) {
  const root =
    $("jdaContent") ||
    $("content") ||
    document.body;

  const students = members.filter(m =>
    String(
      m.className ||
      m.studentClass ||
      ""
    ).toLowerCase() === className.toLowerCase()
  );

  root.innerHTML = `
    <div style="padding:15px">
      <button id="jdaClassBack">
        ←
      </button>

      <div style="
        font-size:23px;
        font-weight:900;
        margin:12px 0;
      ">
        ${escapeHTML(className)}
      </div>

      ${
        students.length
          ? students.map(renderMemberRow).join("")
          : `
            <div class="jda-empty">
              No approved students found.
            </div>
          `
      }
    </div>
  `;

  $("jdaClassBack").onclick = () => {
    setActiveSection("classes");
  };

  root.querySelectorAll("[data-member-uid]")
    .forEach(row => {
      row.onclick = () => {
        const user = members.find(
          x => x.uid === row.dataset.memberUid
        );

        if (user) openChat(user);
      };
    });
}

/* =========================================================
   STAFF
   ========================================================= */

function renderStaff(root) {
  const staff = members.filter(
    m => m.accountType === "staff"
  );

  root.innerHTML = `
    <div style="padding:15px">
      <div style="font-size:24px;font-weight:900">
        Staff
      </div>

      <div style="
        color:#8f9bb8;
        font-size:13px;
        margin:4px 0 15px;
      ">
        JDA staff communication
      </div>

      <input
        id="jdaStaffSearch"
        class="jda-search-box"
        placeholder="Search staff"
      />

      <div id="jdaStaffList">
        ${
          staff.length
            ? staff.map(renderMemberRow).join("")
            : `<div class="jda-empty">No approved staff found.</div>`
        }
      </div>
    </div>
  `;

  root.querySelectorAll("[data-member-uid]")
    .forEach(row => {
      row.onclick = () => {
        const user = members.find(
          x => x.uid === row.dataset.memberUid
        );

        if (user) openChat(user);
      };
    });

  $("jdaStaffSearch").oninput = e => {
    const value = e.target.value.toLowerCase();

    $("jdaStaffList")
      .querySelectorAll("[data-member-uid]")
      .forEach(row => {
        row.style.display =
          row.textContent.toLowerCase().includes(value)
            ? "flex"
            : "none";
      });
  };
}

/* =========================================================
   UPDATES
   ========================================================= */

function renderUpdates(root) {
  root.innerHTML = `
    <div style="padding:15px">
      <div style="font-size:24px;font-weight:900">
        Updates
      </div>

      <div class="jda-class-card">
        <div style="font-size:18px;font-weight:850">
          JDA Networks
        </div>

        <div style="
          color:#a3afcb;
          margin-top:7px;
          line-height:1.5;
        ">
          School updates and announcements
          will appear here.
        </div>
      </div>

      <div class="jda-empty">
        No new updates.
      </div>
    </div>
  `;
}

/* =========================================================
   CALLS HISTORY
   ========================================================= */

async function loadCallHistory() {
  if (!currentUser) return [];

  try {
    const q = query(
      collection(db, "calls"),
      where(
        "participantIds",
        "array-contains",
        currentUser.uid
      ),
      orderBy("createdAt", "desc"),
      limit(100)
    );

    const snap = await getDocs(q);

    return snap.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));
  } catch (error) {
    console.warn(
      "Call history query unavailable:",
      error
    );

    return [];
  }
}

async function renderCalls(root) {
  root.innerHTML = `
    <div style="padding:15px">
      <div style="font-size:24px;font-weight:900">
        Calls
      </div>

      <div
        id="jdaCallHistory"
        class="jda-empty"
      >
        Loading calls...
      </div>
    </div>
  `;

  const history = await loadCallHistory();
  const box = $("jdaCallHistory");

  if (!box) return;

  if (!history.length) {
    box.innerHTML = `
      <div class="jda-empty">
        No calls yet.
      </div>
    `;

    return;
  }

  box.className = "";

  box.innerHTML = history.map(call => {
    const otherId =
      call.callerId === currentUser.uid
        ? call.calleeId
        : call.callerId;

    const user = members.find(
      m => m.uid === otherId
    );

    const outgoing =
      call.callerId === currentUser.uid;

    return `
      <div class="jda-member-row">
        <div class="jda-neon-avatar">
          ${
            user?.photoURL
              ? `<img src="${escapeHTML(user.photoURL)}">`
              : escapeHTML(initials(user?.realName || "J"))
          }
        </div>

        <div class="jda-member-info">
          <div class="jda-member-name">
            ${escapeHTML(user?.realName || "JDA Member")}
          </div>

          <div class="jda-member-meta">
            ${outgoing ? "Outgoing" : "Incoming"}
            • ${escapeHTML(call.type || "audio")}
          </div>
        </div>

        <div style="font-size:11px;color:#8793b2">
          ${formatTime(call.createdAt)}
        </div>
      </div>
    `;
  }).join("");
}

/* =========================================================
   WEBRTC
   ========================================================= */

function resetMediaElements() {
  const remoteVideo = $("jdaRemoteVideo");
  const localVideo = $("jdaLocalVideo");

  if (remoteVideo) {
    remoteVideo.srcObject = null;
  }

  if (localVideo) {
    localVideo.srcObject = null;
  }
}

async function createPeerConnection(callId, role) {
  const peer = new RTCPeerConnection(
    RTC_CONFIG
  );

  rtcPeer = peer;

  peer.onicecandidate = async event => {
    if (!event.candidate) return;

    try {
      await addDoc(
        collection(
          db,
          "calls",
          callId,
          "candidates"
        ),
        {
          senderId: currentUser.uid,
          candidate: event.candidate.toJSON(),
          createdAt: serverTimestamp()
        }
      );
    } catch (error) {
      console.error(
        "ICE candidate error:",
        error
      );
    }
  };

  peer.ontrack = event => {
    if (!remoteStream) {
      remoteStream = new MediaStream();
    }

    event.streams[0]
      ?.getTracks()
      .forEach(track => {
        if (
          !remoteStream
            .getTracks()
            .some(t => t.id === track.id)
        ) {
          remoteStream.addTrack(track);
        }
      });

    const remoteVideo =
      $("jdaRemoteVideo");

    if (remoteVideo) {
      remoteVideo.srcObject =
        remoteStream;

      remoteVideo.play().catch(() => {});
    }
  };

  peer.onconnectionstatechange = () => {
    const state = peer.connectionState;

    setCallStatus(
      state === "connected"
        ? "Connected"
        : state
    );

    if (
      ["failed", "disconnected", "closed"]
        .includes(state)
    ) {
      if (state === "failed") {
        showToast(
          "Call connection failed. Check your network."
        );
      }
    }
  };

  return peer;
}

async function getLocalMedia(type) {
  const constraints =
    type === "video"
      ? {
          audio: true,
          video: {
            facingMode: "user",
            width: {
              ideal: 720
            },
            height: {
              ideal: 1280
            }
          }
        }
      : {
          audio: true,
          video: false
        };

  localStream =
    await navigator.mediaDevices.getUserMedia(
      constraints
    );

  remoteStream = new MediaStream();

  const localVideo =
    $("jdaLocalVideo");

  if (localVideo) {
    localVideo.srcObject =
      localStream;

    localVideo.style.display =
      type === "video"
        ? "block"
        : "none";
  }

  const audioAvatar =
    $("jdaAudioAvatar");

  if (audioAvatar) {
    audioAvatar.style.display =
      type === "audio"
        ? "flex"
        : "none";
  }

  localStream
    .getTracks()
    .forEach(track => {
      rtcPeer.addTrack(
        track,
        localStream
      );
    });
}

async function startOutgoingCall(type) {
  if (
    !currentUser ||
    !currentChatUser ||
    !isApproved()
  ) {
    showToast(
      "Only approved JDA members can make calls."
    );

    return;
  }

  if (
    !window.isSecureContext ||
    !navigator.mediaDevices?.getUserMedia
  ) {
    showToast(
      "Calls require HTTPS and microphone/camera permission."
    );

    return;
  }

  if (currentCallId) {
    showToast("You are already in a call.");
    return;
  }

  try {
    currentCallType = type;
    currentCallRole = "caller";

    showCallOverlay(
      currentChatUser,
      type,
      "Calling..."
    );

    currentCallId = crypto.randomUUID();

    await setDoc(
      doc(db, "calls", currentCallId),
      {
        callerId: currentUser.uid,
        calleeId: currentChatUser.uid,
        participantIds: [
          currentUser.uid,
          currentChatUser.uid
        ],
        type,
        status: "ringing",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }
    );

    rtcPeer =
      await createPeerConnection(
        currentCallId,
        "caller"
      );

    await getLocalMedia(type);

    const offer =
      await rtcPeer.createOffer();

    await rtcPeer.setLocalDescription(
      offer
    );

    await updateDoc(
      doc(db, "calls", currentCallId),
      {
        offer: {
          type: offer.type,
          sdp: offer.sdp
        },
        updatedAt: serverTimestamp()
      }
    );

    listenToCurrentCall(
      currentCallId,
      "caller"
    );

    listenToCandidates(
      currentCallId
    );

  } catch (error) {
    console.error(
      "Start call error:",
      error
    );

    cleanupCall();

    showToast(
      error?.message ||
      "Could not start the call."
    );
  }
}

function listenToCurrentCall(
  callId,
  role
) {
  if (unsubscribeCurrentCall) {
    unsubscribeCurrentCall();
  }

  unsubscribeCurrentCall = onSnapshot(
    doc(db, "calls", callId),
    async snap => {
      if (!snap.exists()) {
        cleanupCall();
        return;
      }

      const data = snap.data();

      if (
        role === "caller" &&
        data.answer &&
        rtcPeer &&
        !rtcPeer.currentRemoteDescription
      ) {
        try {
          await rtcPeer.setRemoteDescription(
            new RTCSessionDescription(
              data.answer
            )
          );

          setCallStatus("Connected");
        } catch (error) {
          console.error(
            "Set answer error:",
            error
          );
        }
      }

      if (data.status === "rejected") {
        showToast("Call rejected.");
        cleanupCall();
      }

      if (data.status === "ended") {
        cleanupCall();
      }

      if (data.status === "accepted") {
        setCallStatus("Connecting...");
      }
    },
    error => {
      console.error(
        "Current call listener:",
        error
      );
    }
  );
}

function listenToCandidates(callId) {
  if (unsubscribeCandidates) {
    unsubscribeCandidates();
  }

  const q = query(
    collection(
      db,
      "calls",
      callId,
      "candidates"
    ),
    orderBy("createdAt", "asc")
  );

  unsubscribeCandidates = onSnapshot(
    q,
    snapshot => {
      snapshot.docChanges().forEach(
        async change => {
          if (change.type !== "added") return;

          const data =
            change.doc.data();

          if (
            data.senderId ===
            currentUser.uid
          ) {
            return;
          }

          if (
            !rtcPeer ||
            !data.candidate
          ) {
            return;
          }

          try {
            await rtcPeer.addIceCandidate(
              new RTCIceCandidate(
                data.candidate
              )
            );
          } catch (error) {
            console.warn(
              "ICE add error:",
              error
            );
          }
        }
      );
    },
    error => {
      console.error(
        "Candidate listener:",
        error
      );
    }
  );
}

/* =========================================================
   INCOMING CALLS
   ========================================================= */

function listenForIncomingCalls() {
  if (!currentUser) return;

  if (unsubscribeIncomingCalls) {
    unsubscribeIncomingCalls();
  }

  const q = query(
    collection(db, "calls"),
    where(
      "calleeId",
      "==",
      currentUser.uid
    ),
    where(
      "status",
      "==",
      "ringing"
    ),
    limit(10)
  );

  unsubscribeIncomingCalls = onSnapshot(
    q,
    snapshot => {
      snapshot.docChanges().forEach(
        change => {
          if (change.type === "added") {
            const data = change.doc.data();

            if (
              currentCallId ||
              !data.callerId
            ) {
              return;
            }

            showIncomingCall(
              change.doc.id,
              data
            );
          }
        }
      );
    },
    error => {
      console.error(
        "Incoming calls:",
        error
      );
    }
  );
}

function showIncomingCall(
  callId,
  data
) {
  const caller =
    members.find(
      m => m.uid === data.callerId
    );

  const incoming =
    $("jdaIncomingCall");

  if (!incoming) return;

  incoming.dataset.callId =
    callId;

  incoming.dataset.callType =
    data.type || "audio";

  incoming.dataset.callerId =
    data.callerId;

  const name =
    caller?.realName ||
    "JDA Member";

  $("jdaIncomingName").textContent =
    name;

  $("jdaIncomingType").textContent =
    `Incoming ${data.type || "audio"} call`;

  const avatar =
    $("jdaIncomingAvatar");

  if (avatar) {
    avatar.innerHTML =
      caller?.photoURL
        ? `<img src="${escapeHTML(caller.photoURL)}">`
        : escapeHTML(initials(name));
  }

  incoming.style.display =
    "block";
}

async function acceptIncomingCall() {
  const incoming =
    $("jdaIncomingCall");

  if (!incoming) return;

  const callId =
    incoming.dataset.callId;

  const type =
    incoming.dataset.callType ||
    "audio";

  const callerId =
    incoming.dataset.callerId;

  if (!callId || !callerId) {
    return;
  }

  incoming.style.display =
    "none";

  try {
    const caller =
      members.find(
        m => m.uid === callerId
      );

    currentChatUser =
      caller || {
        uid: callerId,
        realName: "JDA Member"
      };

    currentCallId = callId;
    currentCallType = type;
    currentCallRole = "callee";

    showCallOverlay(
      currentChatUser,
      type,
      "Connecting..."
    );

    const callSnap =
      await getDoc(
        doc(db, "calls", callId)
      );

    if (!callSnap.exists()) {
      throw new Error(
        "Call no longer exists."
      );
    }

    const call =
      callSnap.data();

    rtcPeer =
      await createPeerConnection(
        callId,
        "callee"
      );

    await getLocalMedia(type);

    if (!call.offer) {
      throw new Error(
        "Call offer is missing."
      );
    }

    await rtcPeer.setRemoteDescription(
      new RTCSessionDescription(
        call.offer
      )
    );

    const answer =
      await rtcPeer.createAnswer();

    await rtcPeer.setLocalDescription(
      answer
    );

    await updateDoc(
      doc(db, "calls", callId),
      {
        answer: {
          type: answer.type,
          sdp: answer.sdp
        },
        status: "accepted",
        updatedAt: serverTimestamp()
      }
    );

    listenToCurrentCall(
      callId,
      "callee"
    );

    listenToCandidates(
      callId
    );

  } catch (error) {
    console.error(
      "Accept call error:",
      error
    );

    try {
      await updateDoc(
        doc(db, "calls", callId),
        {
          status: "ended",
          updatedAt: serverTimestamp()
        }
      );
    } catch {}

    cleanupCall();

    showToast(
      error?.message ||
      "Could not answer the call."
    );
  }
}

async function rejectIncomingCall() {
  const incoming =
    $("jdaIncomingCall");

  if (!incoming) return;

  const callId =
    incoming.dataset.callId;

  incoming.style.display =
    "none";

  if (!callId) return;

  try {
    await updateDoc(
      doc(db, "calls", callId),
      {
        status: "rejected",
        updatedAt: serverTimestamp()
      }
    );
  } catch (error) {
    console.error(
      "Reject call error:",
      error
    );
  }
}

/* =========================================================
   CALL UI
   ========================================================= */

function showCallOverlay(
  user,
  type,
  status
) {
  ensureAppStructure();

  const overlay =
    $("jdaCallOverlay");

  if (!overlay) return;

  $("jdaCallTitle").textContent =
    user?.realName ||
    "JDA Networks";

  $("jdaCallStatus").textContent =
    status || "Connecting...";

  const audioAvatar =
    $("jdaAudioAvatar");

  if (audioAvatar) {
    audioAvatar.textContent =
      initials(
        user?.realName ||
        "JDA"
      );
  }

  const remoteVideo =
    $("jdaRemoteVideo");

  const localVideo =
    $("jdaLocalVideo");

  if (type === "video") {
    remoteVideo.style.display =
      "block";

    localVideo.style.display =
      "block";

    audioAvatar.style.display =
      "none";
  } else {
    remoteVideo.style.display =
      "none";

    localVideo.style.display =
      "none";

    audioAvatar.style.display =
      "flex";
  }

  overlay.style.display =
    "flex";
}

function setCallStatus(status) {
  const box =
    $("jdaCallStatus");

  if (box) {
    box.textContent =
      status;
  }
}

function toggleMute() {
  if (!localStream) return;

  const audioTracks =
    localStream.getAudioTracks();

  if (!audioTracks.length) return;

  isMuted = !isMuted;

  audioTracks.forEach(
    track => {
      track.enabled =
        !isMuted;
    }
  );

  const btn =
    $("jdaMuteBtn");

  if (btn) {
    btn.textContent =
      isMuted
        ? "🔇"
        : "🎙";
  }
}

function toggleCamera() {
  if (!localStream) return;

  const videoTracks =
    localStream.getVideoTracks();

  if (!videoTracks.length) return;

  cameraEnabled =
    !cameraEnabled;

  videoTracks.forEach(
    track => {
      track.enabled =
        cameraEnabled;
    }
  );

  const btn =
    $("jdaCameraBtn");

  if (btn) {
    btn.textContent =
      cameraEnabled
        ? "📷"
        : "🚫";
  }
}

/* =========================================================
   END / CLEANUP CALL
   ========================================================= */

async function endCall() {
  const callId =
    currentCallId;

  if (callId) {
    try {
      await updateDoc(
        doc(db, "calls", callId),
        {
          status: "ended",
          updatedAt: serverTimestamp()
        }
      );
    } catch (error) {
      console.warn(
        "Could not update call end:",
        error
      );
    }
  }

  cleanupCall();
}

function cleanupCall() {
  if (unsubscribeCurrentCall) {
    unsubscribeCurrentCall();
    unsubscribeCurrentCall = null;
  }

  if (unsubscribeCandidates) {
    unsubscribeCandidates();
    unsubscribeCandidates = null;
  }

  if (rtcPeer) {
    try {
      rtcPeer.onicecandidate = null;
      rtcPeer.ontrack = null;
      rtcPeer.close();
    } catch {}

    rtcPeer = null;
  }

  if (localStream) {
    localStream
      .getTracks()
      .forEach(track => {
        try {
          track.stop();
        } catch {}
      });

    localStream = null;
  }

  if (remoteStream) {
    remoteStream
      .getTracks()
      .forEach(track => {
        try {
          track.stop();
        } catch {}
      });

    remoteStream = null;
  }

  resetMediaElements();

  const overlay =
    $("jdaCallOverlay");

  if (overlay) {
    overlay.style.display =
      "none";
  }

  const incoming =
    $("jdaIncomingCall");

  if (incoming) {
    incoming.style.display =
      "none";
  }

  currentCallId = null;
  currentCallType = null;
  currentCallRole = null;

  isMuted = false;
  cameraEnabled = true;
}

/* =========================================================
   LOGOUT
   ========================================================= */

async function logout() {
  try {
    await setOffline();

    cleanupCall();

    if (unsubscribeMembers) {
      unsubscribeMembers();
      unsubscribeMembers = null;
    }

    if (unsubscribeConversations) {
      unsubscribeConversations();
      unsubscribeConversations = null;
    }

    if (unsubscribeIncomingCalls) {
      unsubscribeIncomingCalls();
      unsubscribeIncomingCalls = null;
    }

    if (unsubscribeMessages) {
      unsubscribeMessages();
      unsubscribeMessages = null;
    }

    await signOut(auth);

  } catch (error) {
    console.error(error);

    showToast(
      error?.message ||
      "Could not log out."
    );
  }
}

/* =========================================================
   ADMIN PANEL
   ========================================================= */

async function openAdminPanel() {
  if (!userIsAdmin()) {
    showToast("Admin access only.");
    return;
  }

  const root =
    $("jdaContent") ||
    $("content") ||
    document.body;

  root.innerHTML = `
    <div style="padding:15px">
      <button id="jdaAdminBack">
        ←
      </button>

      <div style="
        font-size:24px;
        font-weight:900;
        margin:12px 0 4px;
      ">
        Admin Panel
      </div>

      <div style="
        color:#8f9bb8;
        margin-bottom:15px;
      ">
        JDA Networks administration
      </div>

      <div id="jdaAdminContent">
        Loading registrations...
      </div>
    </div>
  `;

  $("jdaAdminBack").onclick = () => {
    setActiveSection("chats");
  };

  try {
    const snap =
      await getDocs(
        query(
          collection(db, "users"),
          orderBy("createdAt", "desc"),
          limit(500)
        )
      );

    const users =
      snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));

    const pending =
      users.filter(
        u => u.status === "pending"
      );

    const rejected =
      users.filter(
        u => u.status === "rejected"
      );

    const approved =
      users.filter(
        u =>
          u.status === "approved" ||
          u.approved === true
      );

    $("jdaAdminContent").innerHTML = `
      <div style="
        display:grid;
        grid-template-columns:repeat(3,1fr);
        gap:8px;
        margin-bottom:15px;
      ">
        <div class="jda-class-card">
          <b>${pending.length}</b>
          <div>Pending</div>
        </div>

        <div class="jda-class-card">
          <b>${approved.length}</b>
          <div>Approved</div>
        </div>

        <div class="jda-class-card">
          <b>${rejected.length}</b>
          <div>Rejected</div>
        </div>
      </div>

      <div style="
        font-size:18px;
        font-weight:850;
        margin:15px 0 8px;
      ">
        Pending registrations
      </div>

      ${
        pending.length
          ? pending.map(renderPendingAdminUser).join("")
          : `
            <div class="jda-empty">
              No pending registrations.
            </div>
          `
      }
    `;

    $("jdaAdminContent")
      .querySelectorAll("[data-admin-action]")
      .forEach(btn => {
        btn.onclick = async () => {
          const uid =
            btn.dataset.uid;

          const action =
            btn.dataset.adminAction;

          await processRegistration(
            uid,
            action
          );
        };
      });

  } catch (error) {
    console.error(error);

    $("jdaAdminContent").innerHTML = `
      <div class="jda-empty">
        Could not load registrations.
        <br><br>
        ${escapeHTML(error.message || "")}
      </div>
    `;
  }
}

function renderPendingAdminUser(user) {
  const photo =
    safePhoto(user.photoURL);

  return `
    <div class="jda-class-card">
      <div style="
        display:flex;
        align-items:center;
        gap:12px;
      ">
        <div class="jda-neon-avatar">
          ${
            photo
              ? `<img src="${escapeHTML(photo)}">`
              : escapeHTML(initials(user.realName))
          }
        </div>

        <div style="flex:1">
          <div style="
            font-size:17px;
            font-weight:850;
          ">
            ${escapeHTML(user.realName || "")}
          </div>

          <div style="
            color:#9aa6c3;
            font-size:12px;
            margin-top:3px;
          ">
            ${escapeHTML(user.jdaNumber || "")}
          </div>

          <div style="
            color:#9aa6c3;
            font-size:12px;
            margin-top:3px;
          ">
            ${
              user.accountType === "staff"
                ? `Staff • ${escapeHTML(user.department || "")}`
                : `Student • ${escapeHTML(user.className || user.studentClass || "")} ${escapeHTML(user.stream || "")}`
            }
          </div>
        </div>
      </div>

      <div style="
        display:flex;
        gap:8px;
        margin-top:14px;
      ">
        <button
          data-admin-action="approve"
          data-uid="${escapeHTML(user.uid)}"
          style="
            flex:1;
            padding:11px;
            border:none;
            border-radius:12px;
            background:#31df7b;
            color:#07150d;
            font-weight:850;
          "
        >
          Approve
        </button>

        <button
          data-admin-action="reject"
          data-uid="${escapeHTML(user.uid)}"
          style="
            flex:1;
            padding:11px;
            border:none;
            border-radius:12px;
            background:#ff315b;
            color:#fff;
            font-weight:850;
          "
        >
          Reject
        </button>
      </div>
    </div>
  `;
}

async function processRegistration(
  uid,
  action
) {
  if (!userIsAdmin()) return;

  if (!uid) return;

  try {
    if (action === "approve") {
      await updateDoc(
        doc(db, "users", uid),
        {
          status: "approved",
          approved: true,
          approvedAt: serverTimestamp(),
          approvedBy: currentUser.uid,
          updatedAt: serverTimestamp()
        }
      );

      showToast(
        "Registration approved."
      );
    }

    if (action === "reject") {
      await updateDoc(
        doc(db, "users", uid),
        {
          status: "rejected",
          approved: false,
          rejectedAt: serverTimestamp(),
          rejectedBy: currentUser.uid,
          updatedAt: serverTimestamp()
        }
      );

      showToast(
        "Registration rejected."
      );
    }

    await openAdminPanel();

  } catch (error) {
    console.error(error);

    showToast(
      error?.message ||
      "Admin action failed."
    );
  }
}

/* =========================================================
   SETTINGS / PROFILE MENU
   ========================================================= */

function openSettings() {
  const root =
    $("jdaContent") ||
    $("content") ||
    document.body;

  root.innerHTML = `
    <div style="padding:15px">
      <div style="font-size:24px;font-weight:900">
        Settings
      </div>

      <div class="jda-class-card">
        <