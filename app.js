// ============================================================
// JDA NETWORKS — app.js
// Complete WhatsApp-style school communication app
// Firebase Auth + Firestore
// NO AI
// NO Firebase Storage
// REAL WebRTC AUDIO / VIDEO CALLS
// ============================================================

import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  arrayUnion
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

import { auth, db } from "./firebase.js";

// ============================================================
// GLOBAL STATE
// ============================================================

let currentUser = null;
let currentProfile = null;

let members = [];
let conversations = [];

let currentConversationId = null;
let currentChatUser = null;

let unsubscribeMembers = null;
let unsubscribeConversations = null;
let unsubscribeMessages = null;

let initialized = false;

// ============================================================
// CALL STATE
// ============================================================

let activeCallId = null;
let activeCallType = null;
let activeCallDocUnsubscribe = null;
let activeCandidateUnsubscribe = null;

let peerConnection = null;
let localStream = null;
let remoteStream = null;

let callMuted = false;
let cameraOff = false;

let incomingCallUnsubscribe = null;

const RTC_CONFIG = {
  iceServers: [
    {
      urls: [
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302"
      ]
    }
  ]
};

// ============================================================
// HELPERS
// ============================================================

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function initials(name) {
  const text = String(name || "?").trim();

  if (!text) return "?";

  return text
    .split(/\s+/)
    .slice(0, 2)
    .map(x => x.charAt(0).toUpperCase())
    .join("");
}

function showError(message) {
  console.error(message);

  let box = document.getElementById("jda-error-box");

  if (!box) {
    box = document.createElement("div");
    box.id = "jda-error-box";

    Object.assign(box.style, {
      position: "fixed",
      left: "15px",
      right: "15px",
      bottom: "85px",
      zIndex: "999999",
      padding: "14px 16px",
      borderRadius: "16px",
      background: "rgba(80,0,100,.94)",
      border: "1px solid rgba(255,0,220,.55)",
      color: "#fff",
      fontSize: "14px",
      boxShadow: "0 0 25px rgba(160,0,255,.45)"
    });

    document.body.appendChild(box);
  }

  box.textContent = message;

  setTimeout(() => {
    if (box) box.remove();
  }, 5000);
}

function safeTimestamp(value) {
  if (!value) return null;

  if (typeof value.toDate === "function") {
    return value.toDate();
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "number") {
    return new Date(value);
  }

  return null;
}

function formatTime(value) {
  const date = safeTimestamp(value);

  if (!date) return "";

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatLastSeen(value) {
  const date = safeTimestamp(value);

  if (!date) return "last seen recently";

  return `last seen ${date.toLocaleDateString([], {
    day: "2-digit",
    month: "short"
  })} ${date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  })}`;
}

function getMemberClass(member) {
  return (
    member.className ||
    member.studentClass ||
    member.form ||
    ""
  );
}

function isMemberOnline(member) {
  return member.isOnline === true;
}

function avatarHTML(member, size = 46) {
  const photo = member?.photoURL;

  if (photo) {
    return `
      <img
        src="${escapeHTML(photo)}"
        class="jda-avatar"
        style="width:${size}px;height:${size}px"
        alt=""
      >
    `;
  }

  return `
    <div
      class="jda-avatar jda-avatar-placeholder"
      style="width:${size}px;height:${size}px"
    >
      ${escapeHTML(initials(member?.realName))}
    </div>
  `;
}

function onlineIndicator(member) {
  return isMemberOnline(member)
    ? `<span class="jda-online-dot"></span>`
    : "";
}

function getConversationOtherUser(conversation) {
  if (!conversation?.participantIds) return null;

  const otherId = conversation.participantIds.find(
    id => id !== currentUser?.uid
  );

  if (!otherId) return null;

  return members.find(m => m.uid === otherId) || {
    uid: otherId,
    realName: "JDA Member",
    photoURL: ""
  };
}

// ============================================================
// NEON DESIGN
// ============================================================

function injectJDAStyles() {
  if (document.getElementById("jda-app-styles")) return;

  const style = document.createElement("style");

  style.id = "jda-app-styles";

  style.textContent = `
    :root {
      --jda-blue: #168cff;
      --jda-purple: #8b3dff;
      --jda-pink: #ff2bd6;
      --jda-cyan: #00eaff;
      --jda-bg: #070812;
      --jda-card: rgba(18, 18, 38, .82);
      --jda-border: rgba(135, 80, 255, .28);
    }

    * {
      box-sizing: border-box;
    }

    body {
      background:
        radial-gradient(circle at 10% 10%, rgba(0,150,255,.20), transparent 28%),
        radial-gradient(circle at 90% 15%, rgba(190,0,255,.18), transparent 30%),
        radial-gradient(circle at 50% 100%, rgba(255,0,200,.12), transparent 35%),
        #070812 !important;
      color: #fff !important;
    }

    .jda-avatar {
      border-radius: 50%;
      object-fit: cover;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .jda-avatar-placeholder {
      background:
        linear-gradient(135deg,#126cff,#a72bff,#ff29ca);
      box-shadow:
        0 0 12px rgba(60,120,255,.35),
        0 0 20px rgba(180,30,255,.20);
      font-weight: 800;
      color: white;
    }

    .jda-online-dot {
      width: 10px;
      height: 10px;
      background: #00ff9d;
      border-radius: 50%;
      display: inline-block;
      box-shadow: 0 0 10px #00ff9d;
      border: 2px solid #0a0b16;
      margin-left: -12px;
      position: relative;
      z-index: 2;
    }

    .chat-item {
      background:
        linear-gradient(
          120deg,
          rgba(20,120,255,.08),
          rgba(150,40,255,.08),
          rgba(255,20,210,.05)
        ) !important;
      border: 1px solid rgba(130,80,255,.13) !important;
      border-radius: 17px !important;
      margin: 7px 8px !important;
      transition: .2s;
    }

    .chat-item:hover {
      border-color: rgba(80,180,255,.45) !important;
      transform: translateY(-1px);
      box-shadow: 0 0 20px rgba(70,80,255,.13);
    }

    .jda-neon-button {
      background:
        linear-gradient(
          135deg,
          #087cff,
          #7d35ff,
          #ed25cf
        ) !important;
      border: none !important;
      color: white !important;
      box-shadow:
        0 0 14px rgba(45,120,255,.35),
        0 0 25px rgba(170,30,255,.18);
    }

    .jda-message-out {
      background:
        linear-gradient(
          135deg,
          #086fff,
          #6f35ff,
          #b52bdc
        ) !important;
      color: white !important;
      border-radius: 18px 18px 4px 18px !important;
      box-shadow: 0 0 18px rgba(80,70,255,.16);
    }

    .jda-message-in {
      background:
        linear-gradient(
          135deg,
          rgba(38,40,75,.94),
          rgba(58,30,75,.94)
        ) !important;
      color: white !important;
      border-radius: 18px 18px 18px 4px !important;
      border: 1px solid rgba(150,80,255,.15);
    }

    .jda-call-overlay {
      position: fixed;
      inset: 0;
      z-index: 99990;
      background:
        radial-gradient(circle at 50% 10%, rgba(20,130,255,.30), transparent 35%),
        radial-gradient(circle at 50% 90%, rgba(210,20,255,.25), transparent 40%),
        rgba(3,4,13,.97);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .jda-call-video {
      width: 100%;
      max-width: 700px;
      max-height: 70vh;
      background: #000;
      border-radius: 22px;
      object-fit: cover;
      box-shadow: 0 0 35px rgba(80,80,255,.35);
    }

    .jda-local-video {
      position: absolute;
      width: 110px;
      height: 155px;
      right: 20px;
      top: 20px;
      border-radius: 16px;
      object-fit: cover;
      border: 2px solid rgba(255,255,255,.5);
      box-shadow: 0 0 20px rgba(80,80,255,.35);
      background: #000;
    }

    .jda-call-controls {
      display: flex;
      gap: 14px;
      margin-top: 22px;
      justify-content: center;
      flex-wrap: wrap;
    }

    .jda-call-control {
      width: 56px;
      height: 56px;
      border: none;
      border-radius: 50%;
      background: rgba(255,255,255,.12);
      color: white;
      font-size: 22px;
      box-shadow: 0 0 18px rgba(100,80,255,.12);
    }

    .jda-call-end {
      background: #ed214c;
      box-shadow: 0 0 22px rgba(255,20,70,.35);
    }

    .jda-incoming-card {
      width: min(380px, 92vw);
      background: rgba(17,18,38,.96);
      border: 1px solid rgba(130,70,255,.45);
      border-radius: 28px;
      padding: 30px 20px;
      text-align: center;
      box-shadow:
        0 0 35px rgba(70,70,255,.25),
        0 0 60px rgba(190,20,255,.12);
    }

    .jda-call-actions {
      display: flex;
      gap: 12px;
      justify-content: center;
      margin-top: 24px;
    }

    .jda-call-action {
      border: none;
      padding: 13px 25px;
      border-radius: 30px;
      color: white;
      font-weight: 700;
      font-size: 15px;
    }

    .jda-call-accept {
      background: #00b86b;
      box-shadow: 0 0 18px rgba(0,255,150,.25);
    }

    .jda-call-reject {
      background: #e8274f;
      box-shadow: 0 0 18px rgba(255,20,70,.25);
    }

    .jda-member-card {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 13px;
      margin: 7px 0;
      border-radius: 16px;
      background: rgba(30,30,55,.62);
      border: 1px solid rgba(120,70,255,.15);
    }

    .jda-member-card:active {
      transform: scale(.985);
    }

    .jda-status-text {
      font-size: 12px;
      opacity: .72;
    }

    .jda-search-highlight {
      border-color: rgba(0,220,255,.45) !important;
    }

    .jda-empty {
      text-align: center;
      opacity: .6;
      padding: 40px 20px;
      font-size: 14px;
    }

    .jda-unread {
      min-width: 20px;
      height: 20px;
      padding: 0 6px;
      border-radius: 12px;
      background: #0be98c;
      color: #03150d;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 900;
    }
  `;

  document.head.appendChild(style);
}

// ============================================================
// AUTH GATE
// ============================================================

onAuthStateChanged(auth, async user => {
  if (!user) {
    return;
  }

  currentUser = user;

  try {
    const profileRef = doc(db, "users", user.uid);
    const profileSnap = await getDoc(profileRef);

    if (!profileSnap.exists()) {
      window.location.href = "./index.html";
      return;
    }

    currentProfile = {
      uid: user.uid,
      ...profileSnap.data()
    };

    if (currentProfile.status !== "approved") {
      window.location.href = "./index.html";
      return;
    }

    if (!initialized) {
      initialized = true;
      await initializeJDA();
    }

    await setOwnOnlineStatus(true);

  } catch (error) {
    console.error(error);
    showError("Unable to load your JDA Networks profile.");
  }
});

// ============================================================
// INITIALIZE
// ============================================================

async function initializeJDA() {
  injectJDAStyles();

  renderProfile();

  createMemberModal();

  createChatWindow();

  createCallInterface();

  setupNavigation();

  setupSearch();

  setupNewChatButtons();

  setupDirectoryButtons();

  setupLogout();

  setupOnlineStatus();

  listenMembers();

  listenConversations();

  listenIncomingCalls();

  setupCallButtons();

  window.JDA = {
    startConversation,
    openChat,
    startAudioCall,
    startVideoCall,
    endCurrentCall
  };
}

// ============================================================
// ONLINE STATUS
// ============================================================

async function setOwnOnlineStatus(isOnline) {
  if (!currentUser) return;

  try {
    await updateDoc(
      doc(db, "users", currentUser.uid),
      {
        isOnline,
        lastSeen: serverTimestamp()
      }
    );
  } catch (error) {
    console.warn("Online status update failed:", error);
  }
}

function setupOnlineStatus() {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      setOwnOnlineStatus(true);
    } else {
      setOwnOnlineStatus(false);
    }
  });

  window.addEventListener("focus", () => {
    setOwnOnlineStatus(true);
  });

  window.addEventListener("blur", () => {
    setOwnOnlineStatus(false);
  });

  window.addEventListener("pagehide", () => {
    setOwnOnlineStatus(false);
  });

  setInterval(() => {
    if (document.visibilityState === "visible") {
      setOwnOnlineStatus(true);
    }
  }, 60000);
}

// ============================================================
// MEMBERS
// ============================================================

function listenMembers() {
  if (unsubscribeMembers) {
    unsubscribeMembers();
  }

  const q = query(
    collection(db, "users"),
    where("status", "==", "approved")
  );

  unsubscribeMembers = onSnapshot(
    q,
    snapshot => {
      members = snapshot.docs
        .map(d => ({
          uid: d.id,
          ...d.data()
        }))
        .filter(m => m.uid !== currentUser.uid);

      renderChats();
      renderDirectory();
      renderClasses();
      renderStaff();
    },
    error => {
      console.error(error);
      showError("Unable to load JDA members.");
    }
  );
}

// ============================================================
// CONVERSATIONS
// ============================================================

function listenConversations() {
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
        const ta = safeTimestamp(a.updatedAt)?.getTime() || 0;
        const tb = safeTimestamp(b.updatedAt)?.getTime() || 0;
        return tb - ta;
      });

      renderChats();
    },
    error => {
      console.error(error);
      showError(
        "Unable to load your chats. Check your Firestore rules."
      );
    }
  );
}

// ============================================================
// CHAT LIST
// ============================================================

async function renderChats() {
  const container =
    document.getElementById("chatList") ||
    document.querySelector(".chat-list") ||
    document.querySelector("[data-chat-list]");

  if (!container) return;

  if (!conversations.length) {
    container.innerHTML = `
      <div class="jda-empty">
        No chats yet.<br>
        Start a conversation with a JDA member.
      </div>
    `;
    return;
  }

  const html = conversations.map(conversation => {
    const member = getConversationOtherUser(conversation);

    if (!member) return "";

    const unread =
      conversation.unreadCounts?.[currentUser.uid] ||
      conversation.unreadCount?.[currentUser.uid] ||
      0;

    return `
      <div
        class="chat-item"
        data-user-id="${escapeHTML(member.uid)}"
        data-name="${escapeHTML(member.realName)}"
        style="
          display:flex;
          align-items:center;
          gap:12px;
          padding:12px;
          cursor:pointer;
        "
      >

        ${avatarHTML(member, 48)}

        <div style="flex:1;min-width:0">

          <div style="
            display:flex;
            align-items:center;
            justify-content:space-between;
            gap:8px;
          ">

            <strong style="
              white-space:nowrap;
              overflow:hidden;
              text-overflow:ellipsis;
            ">
              ${escapeHTML(member.realName)}
            </strong>

            <span style="
              font-size:11px;
              opacity:.55;
              white-space:nowrap;
            ">
              ${formatTime(conversation.updatedAt)}
            </span>

          </div>

          <div style="
            display:flex;
            align-items:center;
            justify-content:space-between;
            gap:8px;
            margin-top:4px;
          ">

            <span style="
              font-size:12px;
              opacity:.68;
              white-space:nowrap;
              overflow:hidden;
              text-overflow:ellipsis;
            ">
              ${escapeHTML(
                conversation.lastMessage || "No messages yet"
              )}
            </span>

            ${
              unread
                ? `<span class="jda-unread">${unread}</span>`
                : ""
            }

          </div>

        </div>

      </div>
    `;
  }).join("");

  container.innerHTML = html;

  container.querySelectorAll(".chat-item").forEach(item => {
    item.addEventListener("click", () => {
      const member = members.find(
        m => m.uid === item.dataset.userId
      );

      if (member) {
        startConversation(member);
      }
    });
  });
}

// ============================================================
// START CONVERSATION
// ============================================================

async function startConversation(member) {
  if (!member || !currentUser) return;

  const ids = [
    currentUser.uid,
    member.uid
  ].sort();

  const conversationId = ids.join("_");

  const conversationRef =
    doc(db, "conversations", conversationId);

  try {
    const snap = await getDoc(conversationRef);

    if (!snap.exists()) {
      await setDoc(conversationRef, {
        participantIds: ids,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastMessage: "",
        unreadCounts: {
          [currentUser.uid]: 0,
          [member.uid]: 0
        }
      });
    }

    currentConversationId = conversationId;
    currentChatUser = member;

    openChat(member);

  } catch (error) {
    console.error(error);
    showError(
      "Could not open this conversation. Check Firestore permissions."
    );
  }
}

// ============================================================
// CHAT WINDOW
// ============================================================

function createChatWindow() {
  if (document.getElementById("jda-chat-window")) return;

  const wrapper = document.createElement("div");

  wrapper.id = "jda-chat-window";

  wrapper.style.display = "none";

  wrapper.innerHTML = `
    <div
      id="jda-chat-header"
      style="
        position:fixed;
        inset:0 0 auto 0;
        z-index:5000;
        height:64px;
        display:flex;
        align-items:center;
        gap:10px;
        padding:8px 12px;
        background:
          linear-gradient(
            120deg,
            rgba(5,20,50,.98),
            rgba(35,10,55,.98)
          );
        border-bottom:1px solid rgba(130,80,255,.28);
        box-shadow:0 0 25px rgba(80,60,255,.16);
      "
    >

      <button
        id="jda-chat-back"
        style="
          border:0;
          background:none;
          color:white;
          font-size:28px;
          padding:3px 8px;
        "
      >
        ‹
      </button>

      <div id="jda-chat-avatar"></div>

      <div style="flex:1;min-width:0">

        <div
          id="jda-chat-name"
          style="
            font-weight:800;
            white-space:nowrap;
            overflow:hidden;
            text-overflow:ellipsis;
          "
        >
          Chat
        </div>

        <div
          id="jda-chat-status"
          class="jda-status-text"
        >
          offline
        </div>

      </div>

      <button
        id="jda-chat-audio"
        title="Audio call"
        style="
          border:0;
          background:none;
          color:white;
          font-size:20px;
          padding:8px;
        "
      >
        📞
      </button>

      <button
        id="jda-chat-video"
        title="Video call"
        style="
          border:0;
          background:none;
          color:white;
          font-size:20px;
          padding:8px;
        "
      >
        🎥
      </button>

    </div>

    <div
      id="jda-chat-messages"
      style="
        position:fixed;
        inset:64px 0 66px 0;
        overflow-y:auto;
        padding:15px 10px;
        background:
          radial-gradient(
            circle at 20% 10%,
            rgba(0,110,255,.10),
            transparent 30%
          ),
          radial-gradient(
            circle at 90% 70%,
            rgba(220,0,220,.08),
            transparent 35%
          ),
          #070812;
      "
    ></div>

    <div
      id="jda-chat-composer"
      style="
        position:fixed;
        inset:auto 0 0 0;
        z-index:5001;
        min-height:66px;
        padding:9px;
        display:flex;
        align-items:center;
        gap:7px;
        background:
          linear-gradient(
            120deg,
            rgba(7,12,30,.98),
            rgba(25,8,35,.98)
          );
        border-top:1px solid rgba(130,70,255,.25);
      "
    >

      <button
        id="jda-attach"
        style="
          width:40px;
          height:40px;
          border-radius:50%;
          border:0;
          background:rgba(130,80,255,.15);
          color:white;
          font-size:19px;
        "
      >
        ＋
      </button>

      <textarea
        id="jda-message-input"
        rows="1"
        placeholder="Message"
        style="
          flex:1;
          resize:none;
          min-height:42px;
          max-height:110px;
          border-radius:22px;
          border:1px solid rgba(120,70,255,.25);
          background:rgba(30,31,55,.8);
          color:white;
          padding:11px 15px;
          outline:none;
        "
      ></textarea>

      <button
        id="jda-send-message"
        class="jda-neon-button"
        style="
          width:43px;
          height:43px;
          border-radius:50%;
          font-size:18px;
        "
      >
        ➤
      </button>

    </div>
  `;

  document.body.appendChild(wrapper);

  document
    .getElementById("jda-chat-back")
    .addEventListener("click", closeChat);

  document
    .getElementById("jda-send-message")
    .addEventListener("click", sendMessage);

  document
    .getElementById("jda-attach")
    .addEventListener("click", handleAttachment);

  const input =
    document.getElementById("jda-message-input");

  input.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });

  document
    .getElementById("jda-chat-audio")
    .addEventListener("click", () => {
      if (currentChatUser) {
        startAudioCall(currentChatUser);
      }
    });

  document
    .getElementById("jda-chat-video")
    .addEventListener("click", () => {
      if (currentChatUser) {
        startVideoCall(currentChatUser);
      }
    });
}

// ============================================================
// OPEN CHAT
// ============================================================

function openChat(member) {
  if (!member) return;

  currentChatUser = member;

  const wrapper =
    document.getElementById("jda-chat-window");

  if (!wrapper) return;

  wrapper.style.display = "block";

  const avatar =
    document.getElementById("jda-chat-avatar");

  avatar.innerHTML = avatarHTML(member, 42);

  const name =
    document.getElementById("jda-chat-name");

  name.textContent = member.realName || "JDA Member";

  const status =
    document.getElementById("jda-chat-status");

  status.textContent =
    isMemberOnline(member)
      ? "online"
      : formatLastSeen(member.lastSeen);

  if (unsubscribeMessages) {
    unsubscribeMessages();
    unsubscribeMessages = null;
  }

  if (!currentConversationId) {
    const ids = [
      currentUser.uid,
      member.uid
    ].sort();

    currentConversationId = ids.join("_");
  }

  const messagesRef = collection(
    db,
    "conversations",
    currentConversationId,
    "messages"
  );

  const q = query(
    messagesRef,
    orderBy("createdAt", "asc"),
    limit(500)
  );

  unsubscribeMessages = onSnapshot(
    q,
    snapshot => {
      const messages = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));

      renderMessages(messages);
    },
    error => {
      console.error(error);
      showError(
        "Unable to load messages."
      );
    }
  );
}

// ============================================================
// RENDER MESSAGES
// ============================================================

function renderMessages(messages) {
  const container =
    document.getElementById("jda-chat-messages");

  if (!container) return;

  if (!messages.length) {
    container.innerHTML = `
      <div class="jda-empty">
        Start your conversation with
        ${escapeHTML(currentChatUser?.realName || "this member")}.
      </div>
    `;

    return;
  }

  container.innerHTML = messages.map(message => {
    const outgoing =
      message.senderId === currentUser.uid;

    const time = formatTime(message.createdAt);

    let ticks = "";

    if (outgoing) {
      ticks = message.read || message.seen
        ? `<span style="color:#50eaff">✓✓</span>`
        : `<span style="opacity:.55">✓</span>`;
    }

    return `
      <div
        style="
          display:flex;
          justify-content:${outgoing ? "flex-end" : "flex-start"};
          margin:5px 0;
        "
      >

        <div
          class="${outgoing
            ? "jda-message-out"
            : "jda-message-in"}"
          style="
            max-width:82%;
            padding:9px 12px 6px;
            word-break:break-word;
          "
        >

          <div style="
            white-space:pre-wrap;
            font-size:14px;
            line-height:1.4;
          ">
            ${escapeHTML(message.text)}
          </div>

          <div style="
            text-align:right;
            font-size:10px;
            margin-top:3px;
            opacity:.68;
          ">
            ${escapeHTML(time)}
            ${ticks}
          </div>

        </div>

      </div>
    `;
  }).join("");

  container.scrollTop = container.scrollHeight;
}

// ============================================================
// SEND MESSAGE
// ============================================================

async function sendMessage() {
  if (!currentUser || !currentChatUser) return;

  const input =
    document.getElementById("jda-message-input");

  if (!input) return;

  const text = input.value.trim();

  if (!text) return;

  if (text.length > 5000) {
    showError("Message is too long.");
    return;
  }

  if (!currentConversationId) {
    await startConversation(currentChatUser);
    return;
  }

  input.value = "";

  try {
    const messagesRef = collection(
      db,
      "conversations",
      currentConversationId,
      "messages"
    );

    await addDoc(messagesRef, {
      senderId: currentUser.uid,
      receiverId: currentChatUser.uid,
      text,
      createdAt: serverTimestamp(),
      read: false
    });

    await updateDoc(
      doc(
        db,
        "conversations",
        currentConversationId
      ),
      {
        lastMessage: text,
        updatedAt: serverTimestamp(),
        [`unreadCounts.${currentChatUser.uid}`]:
          1
      }
    );

  } catch (error) {
    console.error(error);

    input.value = text;

    showError(
      "Message could not be sent. Check Firestore rules."
    );
  }
}

// ============================================================
// CLOSE CHAT
// ============================================================

function closeChat() {
  const wrapper =
    document.getElementById("jda-chat-window");

  if (wrapper) {
    wrapper.style.display = "none";
  }

  if (unsubscribeMessages) {
    unsubscribeMessages();
    unsubscribeMessages = null;
  }

  currentConversationId = null;
  currentChatUser = null;
}

// ============================================================
// ATTACHMENT
// ============================================================

function handleAttachment() {
  showError(
    "Attachments are not enabled because this JDA build uses Firebase Spark without Storage."
  );
}

// ============================================================
// MEMBER MODAL
// ============================================================

function createMemberModal() {
  if (document.getElementById("jda-member-modal")) return;

  const modal = document.createElement("div");

  modal.id = "jda-member-modal";

  modal.style.display = "none";

  modal.innerHTML = `
    <div
      style="
        position:fixed;
        inset:0;
        z-index:9000;
        background:rgba(0,0,0,.72);
        display:flex;
        align-items:flex-end;
        justify-content:center;
      "
    >

      <div
        style="
          width:min(600px,100%);
          max-height:88vh;
          overflow:hidden;
          border-radius:25px 25px 0 0;
          background:
            radial-gradient(
              circle at 20% 0%,
              rgba(20,120,255,.18),
              transparent 35%
            ),
            radial-gradient(
              circle at 90% 0%,
              rgba(220,20,255,.18),
              transparent 35%
            ),
            #090a18;
          border:1px solid rgba(130,80,255,.25);
        "
      >

        <div style="
          display:flex;
          align-items:center;
          padding:15px;
          gap:10px;
        ">

          <strong style="font-size:18px;flex:1">
            New conversation
          </strong>

          <button
            id="jda-member-close"
            style="
              border:0;
              background:none;
              color:white;
              font-size:25px;
            "
          >
            ×
          </button>

        </div>

        <div style="padding:0 15px 10px">

          <input
            id="jda-member-search"
            placeholder="Search JDA member"
            style="
              width:100%;
              height:45px;
              border-radius:23px;
              border:1px solid rgba(120,80,255,.25);
              background:rgba(30,30,55,.8);
              color:white;
              padding:0 16px;
              outline:none;
            "
          >

        </div>

        <div
          id="jda-member-results"
          style="
            max-height:65vh;
            overflow-y:auto;
            padding:0 15px 20px;
          "
        ></div>

      </div>
    </div>
  `;

  document.body.appendChild(modal);

  document
    .getElementById("jda-member-close")
    .addEventListener("click", closeMemberModal);

  document
    .getElementById("jda-member-search")
    .addEventListener("input", e => {
      renderMemberModal(e.target.value);
    });
}

function openMemberModal() {
  const modal =
    document.getElementById("jda-member-modal");

  if (!modal) return;

  modal.style.display = "block";

  const search =
    document.getElementById("jda-member-search");

  if (search) {
    search.value = "";
    search.focus();
  }

  renderMemberModal("");
}

function closeMemberModal() {
  const modal =
    document.getElementById("jda-member-modal");

  if (modal) {
    modal.style.display = "none";
  }
}

function renderMemberModal(searchText = "") {
  const container =
    document.getElementById("jda-member-results");

  if (!container) return;

  const term = searchText.toLowerCase().trim();

  const filtered = members.filter(member =>
    !term ||
    String(member.realName || "")
      .toLowerCase()
      .includes(term) ||
    String(member.jdaNumber || "")
      .toLowerCase()
      .includes(term)
  );

  if (!filtered.length) {
    container.innerHTML = `
      <div class="jda-empty">
        No JDA members found.
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(member => `
    <div
      class="jda-member-card"
      data-member-id="${escapeHTML(member.uid)}"
      style="cursor:pointer"
    >

      ${avatarHTML(member, 48)}

      <div style="flex:1">

        <div style="font-weight:800">
          ${escapeHTML(member.realName)}
          ${onlineIndicator(member)}
        </div>

        <div class="jda-status-text">
          ${
            member.accountType === "student"
              ? `${escapeHTML(getMemberClass(member))} ${
                  escapeHTML(member.stream || "")
                }`
              : escapeHTML(member.department || "Staff")
          }
        </div>

      </div>

    </div>
  `).join("");

  container.querySelectorAll(".jda-member-card")
    .forEach(card => {
      card.addEventListener("click", () => {
        const member = members.find(
          m => m.uid === card.dataset.memberId
        );

        if (member) {
          closeMemberModal();
          startConversation(member);
        }
      });
    });
}

// ============================================================
// NAVIGATION
// ============================================================

function setupNavigation() {
  const navItems = document.querySelectorAll(
    "[data-tab], .bottom-nav button, .nav-item"
  );

  navItems.forEach(item => {
    item.addEventListener("click", () => {
      const tab =
        item.dataset.tab ||
        item.dataset.screen ||
        item.getAttribute("data-screen");

      if (tab) {
        activateTab(tab);
      }
    });
  });
}

function activateTab(tab) {
  const aliases = {
    groups: "staff",
    students: "classes",
    favorites: "classes"
  };

  tab = aliases[tab] || tab;

  const screens = document.querySelectorAll(
    "[data-screen]"
  );

  screens.forEach(screen => {
    if (
      screen.dataset.screen === tab
    ) {
      screen.style.display = "";
    } else if (
      screen.dataset.screen
    ) {
      screen.style.display = "none";
    }
  });

  document
    .querySelectorAll(
      "[data-tab], .bottom-nav button, .nav-item"
    )
    .forEach(item => {
      const itemTab =
        item.dataset.tab ||
        item.dataset.screen;

      item.classList.toggle(
        "active",
        itemTab === tab
      );
    });
}

// ============================================================
// SEARCH
// ============================================================

function setupSearch() {
  const search =
    document.querySelector(
      "#searchInput, [data-search], input[placeholder*='Search']"
    );

  if (!search) return;

  search.addEventListener("input", () => {
    const term =
      search.value.toLowerCase().trim();

    document
      .querySelectorAll(".chat-item")
      .forEach(item => {
        const name =
          item.dataset.name || "";

        item.style.display =
          !term ||
          name.toLowerCase().includes(term)
            ? ""
            : "none";
      });
  });
}

// ============================================================
// NEW CHAT BUTTONS
// ============================================================

function setupNewChatButtons() {
  document
    .querySelectorAll(
      "#newChatBtn, [data-new-chat], .new-chat-btn"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        openMemberModal
      );
    });
}

// ============================================================
// DIRECTORY
// ============================================================

function setupDirectoryButtons() {
  document
    .querySelectorAll("[data-directory='classes']")
    .forEach(button => {
      button.addEventListener("click", () => {
        activateTab("classes");
      });
    });

  document
    .querySelectorAll("[data-directory='staff']")
    .forEach(button => {
      button.addEventListener("click", () => {
        activateTab("staff");
      });
    });

  document
    .querySelectorAll(
      "[data-filter='students'], [data-filter='classes']"
    )
    .forEach(button => {
      button.addEventListener("click", () => {
        activateTab("classes");
      });
    });

  document
    .querySelectorAll("[data-filter='staff']")
    .forEach(button => {
      button.addEventListener("click", () => {
        activateTab("staff");
      });
    });
}

// ============================================================
// CLASSES
// ============================================================

function renderClasses() {
  const container =
    document.getElementById("classesList") ||
    document.querySelector("[data-classes-list]");

  if (!container) return;

  const students = members.filter(
    member => member.accountType === "student"
  );

  if (!students.length) {
    container.innerHTML = `
      <div class="jda-empty">
        No students available yet.
      </div>
    `;
    return;
  }

  const forms = [
    "Form 1",
    "Form 2",
    "Form 3",
    "Form 4",
    "Form 5",
    "Form 6"
  ];

  container.innerHTML = forms.map(form => {
    const formStudents = students.filter(
      student =>
        String(getMemberClass(student))
          .toLowerCase()
          .replace("form", "")
          .trim() ===
        form.replace("Form", "")
      );

    return `
      <div
        class="jda-class-block"
        data-form="${escapeHTML(form)}"
        style="margin-bottom:10px"
      >

        <button
          class="jda-class-toggle jda-neon-button"
          style="
            width:100%;
            padding:13px;
            border-radius:15px;
            font-weight:800;
          "
        >
          ${form}
          <span style="float:right">
            ${formStudents.length}
          </span>
        </button>

        <div
          class="jda-class-members"
          style="
            display:none;
            padding:5px 0;
          "
        >

          ${
            formStudents.length
              ? formStudents.map(student =>
                  directoryMemberHTML(student)
                ).join("")
              : `
                <div class="jda-empty">
                  No students in ${form}.
                </div>
              `
          }

        </div>

      </div>
    `;
  }).join("");

  container
    .querySelectorAll(".jda-class-toggle")
    .forEach(button => {
      button.addEventListener("click", () => {
        const block =
          button.parentElement;

        const membersBox =
          block.querySelector(
            ".jda-class-members"
          );

        membersBox.style.display =
          membersBox.style.display === "none"
            ? "block"
            : "none";
      });
    });

  attachDirectoryMemberEvents(container);
}

// ============================================================
// STAFF
// ============================================================

function renderStaff() {
  const container =
    document.getElementById("staffList") ||
    document.querySelector("[data-staff-list]");

  if (!container) return;

  const staff = members.filter(
    member => member.accountType === "staff"
  );

  if (!staff.length) {
    container.innerHTML = `
      <div class="jda-empty">
        No approved staff members yet.
      </div>
    `;
    return;
  }

  container.innerHTML =
    staff
      .map(member =>
        directoryMemberHTML(member)
      )
      .join("");

  attachDirectoryMemberEvents(container);
}

// ============================================================
// DIRECTORY MEMBER CARD
// ============================================================

function directoryMemberHTML(member) {
  const detail =
    member.accountType === "staff"
      ? member.department || "Staff"
      : `${getMemberClass(member)} ${
          member.stream || ""
        }`;

  return `
    <div
      class="jda-member-card"
      data-member-id="${escapeHTML(member.uid)}"
      style="cursor:pointer"
    >

      ${avatarHTML(member, 48)}

      <div style="flex:1">

        <div style="font-weight:800">
          ${escapeHTML(member.realName)}
          ${onlineIndicator(member)}
        </div>

        <div class="jda-status-text">
          ${escapeHTML(detail)}
        </div>

      </div>

      <div style="
        font-size:18px;
        opacity:.65;
      ">
        ›
      </div>

    </div>
  `;
}

function attachDirectoryMemberEvents(container) {
  container
    .querySelectorAll("[data-member-id]")
    .forEach(card => {
      card.addEventListener("click", () => {
        const member = members.find(
          m => m.uid === card.dataset.memberId
        );

        if (member) {
          startConversation(member);
        }
      });
    });
}

// ============================================================
// PROFILE
// ============================================================

function renderProfile() {
  const nameElements =
    document.querySelectorAll(
      "[data-profile-name], #profileName"
    );

  nameElements.forEach(el => {
    el.textContent =
      currentProfile?.realName || "";
  });

  const photoElements =
    document.querySelectorAll(
      "[data-profile-photo], #profilePhoto"
    );

  photoElements.forEach(el => {
    if (currentProfile?.photoURL) {
      if (el.tagName === "IMG") {
        el.src = currentProfile.photoURL;
      } else {
        el.innerHTML =
          `<img src="${escapeHTML(
            currentProfile.photoURL
          )}" class="jda-avatar" style="width:100%;height:100%">`;
      }
    }
  });

  const numberElements =
    document.querySelectorAll(
      "[data-profile-number], #profileNumber"
    );

  numberElements.forEach(el => {
    el.textContent =
      currentProfile?.jdaNumber || "";
  });
}

// ============================================================
// LOGOUT
// ============================================================

function setupLogout() {
  document
    .querySelectorAll(
      "#logoutBtn, [data-logout]"
    )
    .forEach(button => {
      button.addEventListener("click", async () => {
        try {
          await setOwnOnlineStatus(false);
          await signOut(auth);
          window.location.href = "./index.html";
        } catch (error) {
          console.error(error);
          showError("Could not log out.");
        }
      });
    });
}

// ============================================================
// ADMIN PANEL
// ============================================================

function setupAdminButton() {
  const button =
    document.querySelector(
      "#adminPanelBtn, [data-admin-panel]"
    );

  if (!button) return;

  button.style.display = "";

  button.addEventListener("click", async () => {
    try {
      const adminRef =
        doc(db, "admins", currentUser.uid);

      const adminSnap =
        await getDoc(adminRef);

      const isSuperAdmin =
        currentUser.email ===
        "jonathanmentor62@gmail.com";

      if (!isSuperAdmin && !adminSnap.exists()) {
        showError(
          "You do not have administrator permission."
        );
        return;
      }

      window.location.href =
        "./admin.html";

    } catch (error) {
      console.error(error);
      showError(
        "Unable to open Admin Panel."
      );
    }
  });
}

setTimeout(setupAdminButton, 800);

// ============================================================
// REAL WEBRTC CALL SYSTEM
// ============================================================

// ------------------------------------------------------------
// CREATE CALL INTERFACE
// ------------------------------------------------------------

function createCallInterface() {
  if (document.getElementById("jda-call-ui")) return;

  const ui = document.createElement("div");

  ui.id = "jda-call-ui";

  ui.style.display = "none";

  ui.innerHTML = `
    <div
      id="jda-call-overlay"
      class="jda-call-overlay"
    >

      <div
        id="jda-call-title"
        style="
          font-size:20px;
          font-weight:800;
          margin-bottom:18px;
        "
      >
        Calling...
      </div>

      <div
        id="jda-call-avatar-area"
        style="
          margin-bottom:18px;
          display:flex;
          justify-content:center;
        "
      ></div>

      <div
        id="jda-call-video-area"
        style="
          width:100%;
          max-width:700px;
          position:relative;
          display:none;
        "
      >

        <video
          id="jda-remote-video"
          class="jda-call-video"
          autoplay
          playsinline
        ></video>

        <video
          id="jda-local-video"
          class="jda-local-video"
          autoplay
          muted
          playsinline
        ></video>

      </div>

      <audio
        id="jda-remote-audio"
        autoplay
      ></audio>

      <div
        id="jda-call-status"
        style="
          margin-top:10px;
          opacity:.7;
          text-align:center;
        "
      >
        Connecting...
      </div>

      <div class="jda-call-controls">

        <button
          id="jda-mute-button"
          class="jda-call-control"
          title="Mute"
        >
          🎙️
        </button>

        <button
          id="jda-camera-button"
          class="jda-call-control"
          title="Camera"
        >
          📷
        </button>

        <button
          id="jda-end-call-button"
          class="jda-call-control jda-call-end"
          title="End call"
        >
          ☎
        </button>

      </div>

    </div>
  `;

  document.body.appendChild(ui);
}

// ------------------------------------------------------------
// SHOW CALL UI
// ------------------------------------------------------------

function showCallUI(type, member, status = "Connecting...") {
  const ui =
    document.getElementById("jda-call-ui");

  if (!ui) return;

  ui.style.display = "block";

  const title =
    document.getElementById("jda-call-title");

  title.textContent =
    type === "video"
      ? `Video call with ${member.realName}`
      : `Audio call with ${member.realName}`;

  const avatarArea =
    document.getElementById(
      "jda-call-avatar-area"
    );

  avatarArea.innerHTML =
    avatarHTML(member, 90);

  const statusElement =
    document.getElementById(
      "jda-call-status"
    );

  statusElement.textContent = status;

  const videoArea =
    document.getElementById(
      "jda-call-video-area"
    );

  videoArea.style.display =
    type === "video"
      ? "block"
      : "none";

  const cameraButton =
    document.getElementById(
      "jda-camera-button"
    );

  cameraButton.style.display =
    type === "video"
      ? ""
      : "none";
}

function hideCallUI() {
  const ui =
    document.getElementById("jda-call-ui");

  if (ui) {
    ui.style.display = "none";
  }

  const remoteVideo =
    document.getElementById(
      "jda-remote-video"
    );

  const localVideo =
    document.getElementById(
      "jda-local-video"
    );

  if (remoteVideo) {
    remoteVideo.srcObject = null;
  }

  if (localVideo) {
    localVideo.srcObject = null;
  }

  const audio =
    document.getElementById(
      "jda-remote-audio"
    );

  if (audio) {
    audio.srcObject = null;
  }
}

// ------------------------------------------------------------
// CREATE PEER CONNECTION
// ------------------------------------------------------------

function createPeerConnection(callId, type, isCaller) {
  const pc =
    new RTCPeerConnection(RTC_CONFIG);

  peerConnection = pc;

  pc.onicecandidate = async event => {
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
          candidate:
            event.candidate.toJSON(),
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

  pc.ontrack = event => {
    if (!remoteStream) {
      remoteStream =
        new MediaStream();
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

    if (type === "video") {
      const remoteVideo =
        document.getElementById(
          "jda-remote-video"
        );

      if (remoteVideo) {
        remoteVideo.srcObject =
          remoteStream;
      }
    } else {
      const remoteAudio =
        document.getElementById(
          "jda-remote-audio"
        );

      if (remoteAudio) {
        remoteAudio.srcObject =
          remoteStream;
      }
    }
  };

  pc.onconnectionstatechange = () => {
    console.log(
      "WebRTC state:",
      pc.connectionState
    );

    if (
      pc.connectionState ===
        "connected"
    ) {
      updateCallStatus(
        "Connected"
      );
    }

    if (
      pc.connectionState ===
        "disconnected"
    ) {
      updateCallStatus(
        "Connection interrupted..."
      );
    }

    if (
      pc.connectionState ===
        "failed"
    ) {
      updateCallStatus(
        "Connection failed."
      );
    }

    if (
      pc.connectionState ===
        "closed"
    ) {
      updateCallStatus(
        "Call ended"
      );
    }
  };

  return pc;
}

// ------------------------------------------------------------
// GET MEDIA
// ------------------------------------------------------------

async function getLocalMedia(type) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      "This device/browser does not support microphone or camera access."
    );
  }

  const constraints =
    type === "video"
      ? {
          audio: true,
          video: {
            facingMode: "user"
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

  if (type === "video") {
    const localVideo =
      document.getElementById(
        "jda-local-video"
      );

    if (localVideo) {
      localVideo.srcObject =
        localStream;
    }
  }

  return localStream;
}

// ------------------------------------------------------------
// START AUDIO CALL
// ------------------------------------------------------------

async function startAudioCall(member) {
  return startCall(member, "audio");
}

// ------------------------------------------------------------
// START VIDEO CALL
// ------------------------------------------------------------

async function startVideoCall(member) {
  return startCall(member, "video");
}

// ------------------------------------------------------------
// START CALL
// ------------------------------------------------------------

async function startCall(member, type) {
  if (!member || !currentUser) return;

  if (activeCallId) {
    showError("You are already on a call.");
    return;
  }

  try {
    await getLocalMedia(type);

    const callRef =
      await addDoc(
        collection(db, "calls"),
        {
          callerId: currentUser.uid,
          calleeId: member.uid,
          type,
          status: "ringing",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }
      );

    activeCallId = callRef.id;
    activeCallType = type;

    showCallUI(
      type,
      member,
      "Calling..."
    );

    const pc =
      createPeerConnection(
        activeCallId,
        type,
        true
      );

    localStream
      .getTracks()
      .forEach(track => {
        pc.addTrack(
          track,
          localStream
        );
      });

    const offer =
      await pc.createOffer();

    await pc.setLocalDescription(
      offer
    );

    await updateDoc(
      callRef,
      {
        offer: {
          type: offer.type,
          sdp: offer.sdp
        },
        updatedAt:
          serverTimestamp()
      }
    );

    listenActiveCall(
      activeCallId,
      member,
      false
    );

    listenCandidates(
      activeCallId,
      false
    );

  } catch (error) {
    console.error(
      "Start call failed:",
      error
    );

    cleanupCall();

    showError(
      "Could not start the call. Make sure microphone/camera permission is allowed."
    );
  }
}

// ------------------------------------------------------------
// LISTEN ACTIVE CALL
// ------------------------------------------------------------

function listenActiveCall(
  callId,
  member,
  incoming
) {
  if (activeCallDocUnsubscribe) {
    activeCallDocUnsubscribe();
  }

  activeCallDocUnsubscribe =
    onSnapshot(
      doc(db, "calls", callId),
      async snapshot => {
        if (!snapshot.exists()) {
          cleanupCall();
          return;
        }

        const call =
          snapshot.data();

        if (
          call.status === "ended" ||
          call.status === "rejected"
        ) {
          cleanupCall();
          return;
        }

        if (
          !incoming &&
          call.answer &&
          peerConnection &&
          !peerConnection.currentRemoteDescription
        ) {
          try {
            await peerConnection.setRemoteDescription(
              new RTCSessionDescription(
                call.answer
              )
            );

            updateCallStatus(
              "Connected"
            );
          } catch (error) {
            console.error(
              "Answer error:",
              error
            );
          }
        }

        if (
          incoming &&
          call.status === "accepted" &&
          call.answer &&
          peerConnection &&
          !peerConnection.currentRemoteDescription
        ) {
          try {
            await peerConnection.setRemoteDescription(
              new RTCSessionDescription(
                call.answer
              )
            );

            updateCallStatus(
              "Connected"
            );
          } catch (error) {
            console.error(error);
          }
        }
      },
      error => {
        console.error(
          "Call listener error:",
          error
        );
      }
    );
}

// ------------------------------------------------------------
// LISTEN ICE CANDIDATES
// ------------------------------------------------------------

function listenCandidates(
  callId,
  incoming
) {
  if (activeCandidateUnsubscribe) {
    activeCandidateUnsubscribe();
  }

  const candidatesRef =
    collection(
      db,
      "calls",
      callId,
      "candidates"
    );

  const q = query(
    candidatesRef,
    orderBy("createdAt", "asc")
  );

  activeCandidateUnsubscribe =
    onSnapshot(
      q,
      async snapshot => {
        if (!peerConnection) return;

        for (
          const change of snapshot.docChanges()
        ) {
          if (change.type !== "added") {
            continue;
          }

          const data =
            change.doc.data();

          if (
            data.senderId ===
            currentUser.uid
          ) {
            continue;
          }

          try {
            await peerConnection.addIceCandidate(
              new RTCIceCandidate(
                data.candidate
              )
            );
          } catch (error) {
            console.warn(
              "Could not add ICE candidate:",
              error
            );
          }
        }
      },
      error => {
        console.error(
          "Candidate listener error:",
          error
        );
      }
    );
}

// ------------------------------------------------------------
// INCOMING CALLS
// ------------------------------------------------------------

function listenIncomingCalls() {
  if (incomingCallUnsubscribe) {
    incomingCallUnsubscribe();
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

  incomingCallUnsubscribe =
    onSnapshot(
      q,
      snapshot => {
        snapshot.docChanges()
          .forEach(change => {
            if (
              change.type !== "added"
            ) {
              return;
            }

            const call =
              change.doc.data();

            if (activeCallId) {
              return;
            }

            const caller =
              members.find(
                m =>
                  m.uid ===
                  call.callerId
              );

            if (caller) {
              showIncomingCall(
                change.doc.id,
                call,
                caller
              );
            }
          });
      },
      error => {
        console.error(
          "Incoming call listener:",
          error
        );
      }
    );
}

// ------------------------------------------------------------
// INCOMING CALL UI
// ------------------------------------------------------------

function showIncomingCall(
  callId,
  call,
  caller
) {
  if (
    document.getElementById(
      "jda-incoming-call"
    )
  ) {
    return;
  }

  const overlay =
    document.createElement("div");

  overlay.id =
    "jda-incoming-call";

  overlay.className =
    "jda-call-overlay";

  overlay.innerHTML = `
    <div class="jda-incoming-card">

      ${avatarHTML(caller, 95)}

      <div style="
        font-size:22px;
        font-weight:900;
        margin-top:18px;
      ">
        ${escapeHTML(caller.realName)}
      </div>

      <div style="
        margin-top:7px;
        opacity:.7;
      ">
        Incoming ${
          call.type === "video"
            ? "video"
            : "audio"
        } call
      </div>

      <div class="jda-call-actions">

        <button
          id="jda-reject-incoming"
          class="jda-call-action jda-call-reject"
        >
          Decline
        </button>

        <button
          id="jda-accept-incoming"
          class="jda-call-action jda-call-accept"
        >
          Accept
        </button>

      </div>

    </div>
  `;

  document.body.appendChild(overlay);

  document
    .getElementById(
      "jda-reject-incoming"
    )
    .addEventListener(
      "click",
      () => {
        rejectIncomingCall(
          callId
        );
      }
    );

  document
    .getElementById(
      "jda-accept-incoming"
    )
    .addEventListener(
      "click",
      () => {
        acceptIncomingCall(
          callId,
          call,
          caller
        );
      }
    );
}

// ------------------------------------------------------------
// ACCEPT CALL
// ------------------------------------------------------------

async function acceptIncomingCall(
  callId,
  call,
  caller
) {
  try {
    const incomingUI =
      document.getElementById(
        "jda-incoming-call"
      );

    if (incomingUI) {
      incomingUI.remove();
    }

    activeCallId = callId;
    activeCallType = call.type;

    await getLocalMedia(
      call.type
    );

    showCallUI(
      call.type,
      caller,
      "Connecting..."
    );

    const pc =
      createPeerConnection(
        callId,
        call.type,
        false
      );

    localStream
      .getTracks()
      .forEach(track => {
        pc.addTrack(
          track,
          localStream
        );
      });

    if (call.offer) {
      await pc.setRemoteDescription(
        new RTCSessionDescription(
          call.offer
        )
      );
    }

    const answer =
      await pc.createAnswer();

    await pc.setLocalDescription(
      answer
    );

    await updateDoc(
      doc(db, "calls", callId),
      {
        status: "accepted",
        answer: {
          type: answer.type,
          sdp: answer.sdp
        },
        updatedAt:
          serverTimestamp()
      }
    );

    listenActiveCall(
      callId,
      caller,
      true
    );

    listenCandidates(
      callId,
      true
    );

  } catch (error) {
    console.error(
      "Accept call failed:",
      error
    );

    cleanupCall();

    showError(
      "Could not answer the call."
    );
  }
}

// ------------------------------------------------------------
// REJECT CALL
// ------------------------------------------------------------

async function rejectIncomingCall(
  callId
) {
  const incomingUI =
    document.getElementById(
      "jda-incoming-call"
    );

  if (incomingUI) {
    incomingUI.remove();
  }

  try {
    await updateDoc(
      doc(db, "calls", callId),
      {
        status: "rejected",
        updatedAt:
          serverTimestamp()
      }
    );
  } catch (error) {
    console.error(
      "Reject call failed:",
      error
    );
  }
}

// ------------------------------------------------------------
// UPDATE CALL STATUS
// ------------------------------------------------------------

function updateCallStatus(text) {
  const element =
    document.getElementById(
      "jda-call-status"
    );

  if (element) {
    element.textContent = text;
  }
}

// ------------------------------------------------------------
// CALL BUTTONS
// ------------------------------------------------------------

function setupCallButtons() {
  const endButton =
    document.getElementById(
      "jda-end-call-button"
    );

  if (endButton) {
    endButton.addEventListener(
      "click",
      () => {
        endCurrentCall();
      }
    );
  }

  const muteButton =
    document.getElementById(
      "jda-mute-button"
    );

  if (muteButton) {
    muteButton.addEventListener(
      "click",
      toggleMute
    );
  }

  const cameraButton =
    document.getElementById(
      "jda-camera-button"
    );

  if (cameraButton) {
    cameraButton.addEventListener(
      "click",
      toggleCamera
    );
  }
}

// ------------------------------------------------------------
// MUTE
// ------------------------------------------------------------

function toggleMute() {
  if (!localStream) return;

  const audioTracks =
    localStream.getAudioTracks();

  callMuted = !callMuted;

  audioTracks.forEach(track => {
    track.enabled = !callMuted;
  });

  const button =
    document.getElementById(
      "jda-mute-button"
    );

  if (button) {
    button.textContent =
      callMuted
        ? "🔇"
        : "🎙️";
  }
}

// ------------------------------------------------------------
// CAMERA
// ------------------------------------------------------------

function toggleCamera() {
  if (!localStream) return;

  const videoTracks =
    localStream.getVideoTracks();

  if (!videoTracks.length) {
    return;
  }

  cameraOff = !cameraOff;

  videoTracks.forEach(track => {
    track.enabled = !cameraOff;
  });

  const button =
    document.getElementById(
      "jda-camera-button"
    );

  if (button) {
    button.textContent =
      cameraOff
        ? "🚫"
        : "📷";
  }
}

// ------------------------------------------------------------
// END CALL
// ------------------------------------------------------------

async function endCurrentCall() {
  if (activeCallId) {
    try {
      await updateDoc(
        doc(
          db,
          "calls",
          activeCallId
        ),
        {
          status: "ended",
          updatedAt:
            serverTimestamp()
        }
      );
    } catch (error) {
      console.warn(
        "Could not update call status:",
        error
      );
    }
  }

  cleanupCall();
}

// ------------------------------------------------------------
// CLEANUP CALL
// ------------------------------------------------------------

function cleanupCall() {
  if (activeCallDocUnsubscribe) {
    activeCallDocUnsubscribe();
    activeCallDocUnsubscribe = null;
  }

  if (activeCandidateUnsubscribe) {
    activeCandidateUnsubscribe();
    activeCandidateUnsubscribe = null;
  }

  if (peerConnection) {
    try {
      peerConnection.close();
    } catch {}
  }

  peerConnection = null;

  if (localStream) {
    localStream
      .getTracks()
      .forEach(track => {
        try {
          track.stop();
        } catch {}
      });
  }

  localStream = null;
  remoteStream = null;

  activeCallId = null;
  activeCallType = null;

  callMuted = false;
  cameraOff = false;

  hideCallUI();
}

// ============================================================
// GLOBAL SHORTCUTS
// ============================================================

window.JDA = {
  startConversation,
  openChat,
  startAudioCall,
  startVideoCall,
  endCurrentCall,
  activateTab
};

console.log(
  "JDA Networks app.js loaded successfully."
);