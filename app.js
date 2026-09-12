/* =========================================================
   JDA NETWORKS
   Complete app.js
   Firebase Auth + Firestore
   Private Chat + Classes + Staff + Calls
   WebRTC + Metered TURN
   NO AI
   ========================================================= */

import {
  auth,
  db
} from "./firebase.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";


/* =========================================================
   METERED TURN
   ========================================================= */

const METERED_TURN_USERNAME =
  "PASTE_YOUR_METERED_USERNAME_HERE";

const METERED_TURN_CREDENTIAL =
  "PASTE_YOUR_METERED_CREDENTIAL_HERE";


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
   GLOBAL STATE
   ========================================================= */

let currentUser = null;
let currentProfile = null;

let members = [];
let conversations = [];
let currentConversation = null;

let unsubscribeMessages = null;
let unsubscribeMembers = null;
let unsubscribeConversations = null;
let unsubscribeIncomingCalls = null;

let currentCall = null;
let peerConnection = null;
let localStream = null;
let remoteStream = null;

let pendingCandidates = [];

let activeSection = "chats";


/* =========================================================
   HELPERS
   ========================================================= */

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

function safeText(value = "") {
  return escapeHTML(value);
}

function initials(name = "User") {
  const parts = name.trim().split(/\s+/);

  if (!parts.length) return "U";

  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }

  return (
    parts[0][0] +
    parts[parts.length - 1][0]
  ).toUpperCase();
}

function formatTime(timestamp) {
  if (!timestamp) return "";

  try {
    const date =
      typeof timestamp.toDate === "function"
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

function formatDate(timestamp) {
  if (!timestamp) return "";

  try {
    const date =
      typeof timestamp.toDate === "function"
        ? timestamp.toDate()
        : new Date(timestamp);

    return date.toLocaleDateString();
  } catch {
    return "";
  }
}

function showToast(message) {
  let toast = $("jdaToast");

  if (!toast) {
    toast = document.createElement("div");
    toast.id = "jdaToast";

    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 2500);
}

function getRoot() {
  return (
    $("jdaContent") ||
    $("content") ||
    $("mainContent") ||
    $("app") ||
    $("root") ||
    document.body
  );
}

function getPhoto(profile) {
  return (
    profile?.photoURL ||
    profile?.profilePhoto ||
    ""
  );
}


/* =========================================================
   GLOBAL STYLE
   ========================================================= */

function injectStyles() {

  if ($("jdaStyles")) return;

  const style = document.createElement("style");

  style.id = "jdaStyles";

  style.textContent = `
  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    background:
      radial-gradient(circle at top left,
        rgba(76, 80, 255, .22),
        transparent 35%),
      radial-gradient(circle at bottom right,
        rgba(174, 62, 255, .18),
        transparent 35%),
      #070914;
    color: #fff;
    font-family:
      Inter,
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      sans-serif;
  }

  button,
  input,
  textarea {
    font: inherit;
  }

  button {
    cursor: pointer;
  }

  .jda-page {
    min-height: 100vh;
    padding-bottom: 90px;
  }

  .jda-header {
    position: sticky;
    top: 0;
    z-index: 50;

    display: flex;
    align-items: center;
    justify-content: space-between;

    padding: 16px;

    background:
      linear-gradient(
        135deg,
        rgba(16,20,48,.96),
        rgba(35,15,65,.96)
      );

    border-bottom: 1px solid rgba(255,255,255,.08);

    backdrop-filter: blur(18px);
  }

  .jda-title {
    font-size: 22px;
    font-weight: 900;
    letter-spacing: -.5px;
  }

  .jda-subtitle {
    color: #aeb5d8;
    font-size: 12px;
    margin-top: 3px;
  }

  .jda-header-buttons {
    display: flex;
    gap: 8px;
  }

  .jda-icon-button {
    width: 42px;
    height: 42px;

    border: 1px solid rgba(255,255,255,.1);
    border-radius: 14px;

    color: #fff;
    background:
      linear-gradient(
        135deg,
        rgba(72,83,255,.35),
        rgba(174,68,255,.3)
      );
  }

  .jda-content {
    padding: 15px;
  }

  .jda-search {
    width: 100%;
    padding: 14px 17px;

    border: 1px solid rgba(255,255,255,.09);
    border-radius: 18px;

    outline: none;
    color: white;

    background: rgba(255,255,255,.055);

    margin-bottom: 14px;
  }

  .jda-search:focus {
    border-color: #7c6cff;
    box-shadow: 0 0 0 3px rgba(124,108,255,.12);
  }

  .jda-card {
    padding: 16px;
    margin-bottom: 12px;

    border-radius: 20px;

    border: 1px solid rgba(255,255,255,.08);

    background:
      linear-gradient(
        135deg,
        rgba(28,32,68,.92),
        rgba(32,20,57,.92)
      );

    box-shadow:
      0 10px 35px rgba(0,0,0,.22);
  }

  .jda-member {
    display: flex;
    align-items: center;
    gap: 12px;

    padding: 13px;

    margin-bottom: 7px;

    border-radius: 18px;

    background: rgba(255,255,255,.035);

    border: 1px solid rgba(255,255,255,.05);
  }

  .jda-member:active {
    transform: scale(.985);
  }

  .jda-avatar {
    width: 50px;
    height: 50px;

    flex: 0 0 50px;

    border-radius: 50%;

    object-fit: cover;

    display: flex;
    align-items: center;
    justify-content: center;

    font-weight: 900;
    font-size: 16px;

    color: #fff;

    background:
      linear-gradient(
        135deg,
        #4d65ff,
        #9b3cff
      );

    box-shadow:
      0 0 18px rgba(111,81,255,.3);
  }

  .jda-member-info {
    min-width: 0;
    flex: 1;
  }

  .jda-name {
    font-weight: 800;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .jda-small {
    color: #9ca4c7;
    font-size: 12px;
    margin-top: 3px;
  }

  .jda-online {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: #28e889;
    box-shadow: 0 0 10px #28e889;
  }

  .jda-bottom-nav {
    position: fixed;
    left: 9px;
    right: 9px;
    bottom: 9px;

    z-index: 100;

    display: grid;
    grid-template-columns: repeat(5, 1fr);

    padding: 8px;

    border-radius: 23px;

    background:
      linear-gradient(
        135deg,
        rgba(18,20,45,.97),
        rgba(37,17,60,.97)
      );

    border: 1px solid rgba(255,255,255,.09);

    box-shadow:
      0 15px 45px rgba(0,0,0,.45);

    backdrop-filter: blur(20px);
  }

  .jda-nav-button {
    border: 0;
    background: transparent;

    color: #777f9e;

    padding: 8px 3px;

    border-radius: 17px;

    font-size: 11px;
    font-weight: 700;
  }

  .jda-nav-button.active {
    color: #fff;

    background:
      linear-gradient(
        135deg,
        rgba(76,93,255,.48),
        rgba(158,61,255,.48)
      );

    box-shadow:
      0 0 20px rgba(109,76,255,.25);
  }

  .jda-nav-icon {
    display: block;
    font-size: 20px;
    margin-bottom: 3px;
  }

  .jda-empty {
    padding: 45px 20px;
    text-align: center;
    color: #8e96b9;
  }

  .jda-class-card {
    padding: 18px;
    border-radius: 21px;
    margin-bottom: 11px;

    border: 1px solid rgba(255,255,255,.08);

    background:
      linear-gradient(
        135deg,
        rgba(40,48,100,.8),
        rgba(73,28,91,.75)
      );
  }

  .jda-class-title {
    font-size: 19px;
    font-weight: 900;
  }

  .jda-button {
    border: 0;
    border-radius: 15px;

    padding: 13px 17px;

    color: white;
    font-weight: 800;

    background:
      linear-gradient(
        135deg,
        #5268ff,
        #9a3dff
      );

    box-shadow:
      0 8px 25px rgba(102,74,255,.25);
  }

  .jda-button.secondary {
    background: rgba(255,255,255,.08);
    box-shadow: none;
  }

  .jda-button.danger {
    background: linear-gradient(
      135deg,
      #ff405f,
      #a52870
    );
  }

  .jda-chat-page {
    position: fixed;
    inset: 0;

    z-index: 200;

    background: #080a16;

    display: flex;
    flex-direction: column;
  }

  .jda-chat-header {
    display: flex;
    align-items: center;
    gap: 10px;

    padding: 12px;

    background:
      linear-gradient(
        135deg,
        #101530,
        #25133c
      );

    border-bottom: 1px solid rgba(255,255,255,.08);
  }

  .jda-chat-back {
    width: 40px;
    height: 40px;

    border: 0;
    border-radius: 13px;

    color: white;
    background: rgba(255,255,255,.08);
  }

  .jda-chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 15px;
  }

  .jda-message {
    max-width: 80%;
    margin-bottom: 9px;
    padding: 10px 13px;

    border-radius: 17px;

    line-height: 1.4;
    word-break: break-word;
  }

  .jda-message.mine {
    margin-left: auto;

    background:
      linear-gradient(
        135deg,
        #4b60f7,
        #803be0
      );

    border-bottom-right-radius: 5px;
  }

  .jda-message.theirs {
    margin-right: auto;

    background: #20243a;

    border-bottom-left-radius: 5px;
  }

  .jda-message-time {
    font-size: 9px;
    opacity: .65;
    margin-top: 4px;
    text-align: right;
  }

  .jda-chat-input {
    display: flex;
    gap: 8px;

    padding: 10px;

    background:
      rgba(12,14,28,.97);

    border-top: 1px solid rgba(255,255,255,.08);
  }

  .jda-chat-input input {
    flex: 1;

    min-width: 0;

    border: 1px solid rgba(255,255,255,.08);
    border-radius: 17px;

    padding: 13px;

    outline: none;

    color: white;
    background: #171a2b;
  }

  .jda-send {
    width: 48px;
    border: 0;
    border-radius: 16px;

    color: white;

    background:
      linear-gradient(
        135deg,
        #5367ff,
        #9d3fff
      );
  }

  .jda-call-overlay {
    position: fixed;
    inset: 0;

    z-index: 1000;

    display: none;

    flex-direction: column;
    align-items: center;
    justify-content: center;

    background:
      radial-gradient(
        circle,
        rgba(86,69,255,.25),
        transparent 45%
      ),
      #070812;
  }

  .jda-call-overlay.show {
    display: flex;
  }

  .jda-call-avatar {
    width: 110px;
    height: 110px;

    border-radius: 50%;

    object-fit: cover;

    display: flex;
    align-items: center;
    justify-content: center;

    font-size: 32px;
    font-weight: 900;

    background:
      linear-gradient(
        135deg,
        #5269ff,
        #a03cff
      );

    box-shadow:
      0 0 45px rgba(111,75,255,.45);
  }

  .jda-call-name {
    margin-top: 20px;

    font-size: 25px;
    font-weight: 900;
  }

  .jda-call-status {
    margin-top: 7px;
    color: #a9afd0;
  }

  .jda-call-buttons {
    display: flex;
    gap: 22px;

    margin-top: 45px;
  }

  .jda-call-button {
    width: 64px;
    height: 64px;

    border: 0;
    border-radius: 50%;

    color: white;

    font-size: 23px;
  }

  .jda-call-button.accept {
    background: #20c878;
  }

  .jda-call-button.reject {
    background: #ef3c58;
  }

  .jda-call-button.end {
    background: #ef3c58;
  }

  .jda-video-local,
  .jda-video-remote {
    position: absolute;
    object-fit: cover;

    background: #000;
  }

  .jda-video-remote {
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .jda-video-local {
    width: 115px;
    height: 165px;

    right: 15px;
    top: 70px;

    border-radius: 17px;

    border: 2px solid rgba(255,255,255,.25);
  }

  .jda-call-controls {
    position: absolute;
    bottom: 40px;

    display: flex;
    gap: 15px;
  }

  .jda-call-controls button {
    width: 58px;
    height: 58px;

    border: 0;
    border-radius: 50%;

    color: white;
    background: rgba(255,255,255,.15);
  }

  .jda-profile-box {
    text-align: center;
    padding: 25px;
  }

  .jda-profile-large {
    width: 95px;
    height: 95px;

    margin: 0 auto 15px;

    border-radius: 50%;

    object-fit: cover;

    display: flex;
    align-items: center;
    justify-content: center;

    font-size: 30px;
    font-weight: 900;

    background:
      linear-gradient(
        135deg,
        #5067ff,
        #a13eff
      );
  }

  #jdaToast {
    position: fixed;

    left: 50%;
    bottom: 105px;

    z-index: 3000;

    transform:
      translate(-50%, 20px);

    opacity: 0;

    padding: 12px 17px;

    border-radius: 15px;

    background: #20243a;

    border: 1px solid rgba(255,255,255,.1);

    box-shadow:
      0 12px 35px rgba(0,0,0,.35);

    transition: .25s;

    pointer-events: none;
  }

  #jdaToast.show {
    transform:
      translate(-50%, 0);

    opacity: 1;
  }

  .jda-admin-badge {
    display: inline-block;

    padding: 4px 8px;

    border-radius: 8px;

    font-size: 10px;
    font-weight: 900;

    color: #fff;

    background:
      linear-gradient(
        135deg,
        #5368ff,
        #a33eff
      );
  }
  `;

  document.head.appendChild(style);
}


/* =========================================================
   BASIC APP SHELL
   ========================================================= */

function ensureShell() {

  injectStyles();

  let root = getRoot();

  if (!root) {
    root = document.body;
  }

  if (!root.id) {
    root.id = "jdaContent";
  }

  let nav = $("jdaBottomNav");

  if (!nav) {

    nav = document.createElement("nav");

    nav.id = "jdaBottomNav";
    nav.className = "jda-bottom-nav";

    nav.innerHTML = `
      <button class="jda-nav-button active"
              data-section="chats">
        <span class="jda-nav-icon">💬</span>
        Chats
      </button>

      <button class="jda-nav-button"
              data-section="updates">
        <span class="jda-nav-icon">◉</span>
        Updates
      </button>

      <button class="jda-nav-button"
              data-section="classes">
        <span class="jda-nav-icon">▦</span>
        Classes
      </button>

      <button class="jda-nav-button"
              data-section="staff">
        <span class="jda-nav-icon">👥</span>
        Staff
      </button>

      <button class="jda-nav-button"
              data-section="calls">
        <span class="jda-nav-icon">☎</span>
        Calls
      </button>
    `;

    document.body.appendChild(nav);

    nav.querySelectorAll(".jda-nav-button")
      .forEach(button => {

        button.addEventListener("click", () => {

          const section =
            button.dataset.section;

          activeSection = section;

          nav.querySelectorAll(".jda-nav-button")
            .forEach(item =>
              item.classList.remove("active")
            );

          button.classList.add("active");

          renderSection(section);
        });

      });
  }

  createCallOverlay();
}


/* =========================================================
   HEADER
   ========================================================= */

function renderHeader(title, subtitle = "") {

  return `
    <header class="jda-header">

      <div>
        <div class="jda-title">
          ${safeText(title)}
        </div>

        ${
          subtitle
            ? `<div class="jda-subtitle">
                ${safeText(subtitle)}
              </div>`
            : ""
        }
      </div>

      <div class="jda-header-buttons">

        <button
          class="jda-icon-button"
          id="jdaSearchButton">
          🔍
        </button>

        <button
          class="jda-icon-button"
          id="jdaSettingsButton">
          ⚙
        </button>

      </div>

    </header>
  `;
}


/* =========================================================
   MAIN SECTION ROUTER
   ========================================================= */

function renderSection(section) {

  if (!currentProfile) return;

  switch (section) {

    case "updates":
      renderUpdates();
      break;

    case "classes":
      renderClasses();
      break;

    case "staff":
      renderStaff();
      break;

    case "calls":
      renderCalls();
      break;

    default:
      renderChats();
  }

}


/* =========================================================
   CHATS
   ========================================================= */

function renderChats() {

  const root = getRoot();

  root.innerHTML = `
    <div class="jda-page">

      ${renderHeader(
        "JDA Networks",
        "Your school community"
      )}

      <main class="jda-content">

        <input
          id="memberSearch"
          class="jda-search"
          placeholder="Search students and staff..."
          autocomplete="off"
        />

        <div id="memberList"></div>

      </main>

    </div>
  `;

  $("jdaSearchButton")
    ?.addEventListener("click", () => {
      $("memberSearch")?.focus();
    });

  $("jdaSettingsButton")
    ?.addEventListener("click", openSettings);

  $("memberSearch")
    ?.addEventListener("input", renderMemberList);

  renderMemberList();
}


function renderMemberList() {

  const container = $("memberList");

  if (!container) return;

  const search =
    ($("memberSearch")?.value || "")
      .toLowerCase()
      .trim();

  const filtered = members.filter(member => {

    if (member.uid === currentUser.uid) {
      return false;
    }

    if (member.status !== "approved") {
      return false;
    }

    const name =
      (member.realName || "")
        .toLowerCase();

    const number =
      (member.jdaNumber || "")
        .toLowerCase();

    return (
      !search ||
      name.includes(search) ||
      number.includes(search)
    );
  });

  if (!filtered.length) {

    container.innerHTML = `
      <div class="jda-empty">
        No approved members found.
      </div>
    `;

    return;
  }

  container.innerHTML =
    filtered.map(member => {

      const photo =
        getPhoto(member);

      const avatar =
        photo
          ? `<img
              class="jda-avatar"
              src="${photo}"
              alt=""
            >`
          : `<div class="jda-avatar">
              ${initials(member.realName)}
            </div>`;

      return `
        <div
          class="jda-member"
          data-member-id="${member.uid}">

          ${avatar}

          <div class="jda-member-info">

            <div class="jda-name">
              ${safeText(member.realName)}
            </div>

            <div class="jda-small">
              ${
                member.accountType === "staff"
                  ? "Staff • " +
                    safeText(member.department || "")
                  : safeText(
                      member.studentClass ||
                      member.className ||
                      ""
                    )
              }
            </div>

          </div>

          ${
            member.isOnline
              ? `<span class="jda-online"></span>`
              : ""
          }

        </div>
      `;
    }).join("");

  container
    .querySelectorAll("[data-member-id]")
    .forEach(item => {

      item.addEventListener("click", () => {

        const member =
          members.find(
            m => m.uid === item.dataset.memberId
          );

        if (member) {
          openChat(member);
        }

      });

    });
}


/* =========================================================
   CONVERSATIONS
   ========================================================= */

function startConversationListener() {

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

  unsubscribeConversations =
    onSnapshot(
      q,
      snapshot => {

        conversations =
          snapshot.docs.map(item => ({
            id: item.id,
            ...item.data()
          }));

      },
      error => {
        console.error(
          "Conversation listener:",
          error
        );
      }
    );
}


async function getOrCreateConversation(otherUserId) {

  if (!currentUser) {
    throw new Error("Not signed in.");
  }

  const participantIds = [
    currentUser.uid,
    otherUserId
  ].sort();

  const existing =
    conversations.find(conversation => {

      const ids =
        conversation.participantIds || [];

      return (
        ids.length === 2 &&
        ids[0] === participantIds[0] &&
        ids[1] === participantIds[1]
      );
    });

  if (existing) {
    return existing;
  }

  const ref =
    await addDoc(
      collection(db, "conversations"),
      {
        participantIds,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastMessage: "",
        lastMessageAt: serverTimestamp()
      }
    );

  return {
    id: ref.id,
    participantIds
  };
}


/* =========================================================
   OPEN CHAT
   ========================================================= */

async function openChat(member) {

  try {

    const conversation =
      await getOrCreateConversation(member.uid);

    currentConversation = conversation;

    const root = document.body;

    const old =
      $("jdaChatPage");

    if (old) old.remove();

    const page =
      document.createElement("div");

    page.id = "jdaChatPage";
    page.className = "jda-chat-page";

    const photo =
      getPhoto(member);

    page.innerHTML = `

      <div class="jda-chat-header">

        <button
          class="jda-chat-back"
          id="chatBack">
          ←
        </button>

        ${
          photo
            ? `<img
                class="jda-avatar"
                src="${photo}"
                alt=""
              >`
            : `<div class="jda-avatar">
                ${initials(member.realName)}
              </div>`
        }

        <div style="flex:1">

          <div class="jda-name">
            ${safeText(member.realName)}
          </div>

          <div class="jda-small">
            ${
              member.isOnline
                ? "online"
                : "offline"
            }
          </div>

        </div>

        <button
          class="jda-icon-button"
          id="audioCallButton">
          📞
        </button>

        <button
          class="jda-icon-button"
          id="videoCallButton">
          🎥
        </button>

      </div>

      <div
        class="jda-chat-messages"
        id="chatMessages">
      </div>

      <form
        class="jda-chat-input"
        id="chatForm">

        <input
          id="chatText"
          placeholder="Type a message..."
          autocomplete="off"
          maxlength="5000"
        />

        <button
          class="jda-send"
          type="submit">
          ➤
        </button>

      </form>
    `;

    root.appendChild(page);

    $("chatBack")
      .addEventListener("click", () => {

        if (unsubscribeMessages) {
          unsubscribeMessages();
          unsubscribeMessages = null;
        }

        page.remove();
        currentConversation = null;
      });

    $("audioCallButton")
      .addEventListener(
        "click",
        () => startCall(member, "audio")
      );

    $("videoCallButton")
      .addEventListener(
        "click",
        () => startCall(member, "video")
      );

    $("chatForm")
      .addEventListener(
        "submit",
        sendMessage
      );

    listenToMessages(conversation.id);

  } catch (error) {

    console.error(error);

    showToast(
      "Could not open this chat."
    );
  }
}


/* =========================================================
   MESSAGES
   ========================================================= */

function listenToMessages(conversationId) {

  if (unsubscribeMessages) {
    unsubscribeMessages();
  }

  const q = query(
    collection(
      db,
      "conversations",
      conversationId,
      "messages"
    ),
    orderBy("createdAt", "asc")
  );

  unsubscribeMessages =
    onSnapshot(
      q,
      snapshot => {

        const messages =
          snapshot.docs.map(item => ({
            id: item.id,
            ...item.data()
          }));

        renderMessages(messages);
      },
      error => {
        console.error(
          "Message listener:",
          error
        );
      }
    );
}


function renderMessages(messages) {

  const box =
    $("chatMessages");

  if (!box) return;

  if (!messages.length) {

    box.innerHTML = `
      <div class="jda-empty">
        Start the conversation.
      </div>
    `;

    return;
  }

  box.innerHTML =
    messages.map(message => {

      const mine =
        message.senderId === currentUser.uid;

      return `
        <div
          class="jda-message ${
            mine ? "mine" : "theirs"
          }">

          <div>
            ${safeText(message.text || "")}
          </div>

          <div class="jda-message-time">
            ${formatTime(message.createdAt)}
            ${mine ? " ✓✓" : ""}
          </div>

        </div>
      `;

    }).join("");

  box.scrollTop =
    box.scrollHeight;
}


async function sendMessage(event) {

  event.preventDefault();

  const input =
    $("chatText");

  if (!input) return;

  const text =
    input.value.trim();

  if (!text) return;

  if (!currentConversation) return;

  const participantIds =
    currentConversation.participantIds || [];

  const receiverId =
    participantIds.find(
      id => id !== currentUser.uid
    );

  if (!receiverId) return;

  input.value = "";

  try {

    await addDoc(
      collection(
        db,
        "conversations",
        currentConversation.id,
        "messages"
      ),
      {
        senderId: currentUser.uid,
        receiverId,
        text,
        createdAt: serverTimestamp(),
        read: false
      }
    );

    await updateDoc(
      doc(
        db,
        "conversations",
        currentConversation.id
      ),
      {
        lastMessage: text,
        lastMessageAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }
    );

  } catch (error) {

    console.error(error);

    showToast(
      "Message could not be sent."
    );
  }
}


/* =========================================================
   UPDATES
   ========================================================= */

function renderUpdates() {

  const root = getRoot();

  root.innerHTML = `
    <div class="jda-page">

      ${renderHeader(
        "Updates",
        "School announcements"
      )}

      <main class="jda-content">

        <div class="jda-card">

          <div
            style="
              font-size:20px;
              font-weight:900;
            ">
            JDA Networks
          </div>

          <div
            class="jda-small"
            style="margin-top:8px">
            Stay connected with your
            school community.
          </div>

        </div>

        <div class="jda-empty">
          No new updates yet.
        </div>

      </main>

    </div>
  `;

  $("jdaSettingsButton")
    ?.addEventListener(
      "click",
      openSettings
    );
}


/* =========================================================
   CLASSES
   ========================================================= */

function renderClasses() {

  const root = getRoot();

  const classes = [
    "Form One",
    "Form Two",
    "Form Three",
    "Form Four",
    "Form Five",
    "Form Six"
  ];

  root.innerHTML = `
    <div class="jda-page">

      ${renderHeader(
        "Classes",
        "Choose your class"
      )}

      <main class="jda-content">

        ${
          classes.map((name, index) => `
            <div
              class="jda-class-card"
              data-class-index="${index}">

              <div class="jda-class-title">
                ${name}
              </div>

              <div class="jda-small">
                Blue • Green
              </div>

            </div>
          `).join("")
        }

      </main>

    </div>
  `;

  $("jdaSettingsButton")
    ?.addEventListener(
      "click",
      openSettings
    );

  root
    .querySelectorAll("[data-class-index]")
    .forEach(card => {

      card.addEventListener(
        "click",
        () => {

          const index =
            Number(card.dataset.classIndex);

          openClassMembers(
            classes[index]
          );
        }
      );

    });
}


function openClassMembers(className) {

  const root = getRoot();

  const classMembers =
    members.filter(member => {

      if (member.accountType !== "student") {
        return false;
      }

      if (member.status !== "approved") {
        return false;
      }

      return (
        member.studentClass === className ||
        member.className === className
      );
    });

  root.innerHTML = `
    <div class="jda-page">

      <header class="jda-header">

        <div>
          <div class="jda-title">
            ${safeText(className)}
          </div>

          <div class="jda-subtitle">
            Class members
          </div>
        </div>

        <button
          class="jda-icon-button"
          id="classBack">
          ←
        </button>

      </header>

      <main class="jda-content">

        ${
          classMembers.length
            ? classMembers.map(member => {

                const photo =
                  getPhoto(member);

                return `
                  <div
                    class="jda-member"
                    data-member-id="${member.uid}">

                    ${
                      photo
                        ? `<img
                            class="jda-avatar"
                            src="${photo}"
                            alt=""
                          >`
                        : `<div class="jda-avatar">
                            ${initials(member.realName)}
                          </div>`
                    }

                    <div class="jda-member-info">

                      <div class="jda-name">
                        ${safeText(member.realName)}
                      </div>

                      <div class="jda-small">
                        ${safeText(
                          member.stream || ""
                        )}
                      </div>

                    </div>

                  </div>
                `;

              }).join("")
            : `
              <div class="jda-empty">
                No approved members in this class yet.
              </div>
            `
        }

      </main>

    </div>
  `;

  $("classBack")
    ?.addEventListener(
      "click",
      () => renderClasses()
    );

  root
    .querySelectorAll("[data-member-id]")
    .forEach(item => {

      item.addEventListener(
        "click",
        () => {

          const member =
            members.find(
              m => m.uid === item.dataset.memberId
            );

          if (member) {
            openChat(member);
          }
        }
      );

    });
}


/* =========================================================
   STAFF
   ========================================================= */

function renderStaff() {

  const root = getRoot();

  const staff =
    members.filter(member =>
      member.accountType === "staff" &&
      member.status === "approved"
    );

  root.innerHTML = `
    <div class="jda-page">

      ${renderHeader(
        "Staff",
        "JDA Networks staff"
      )}

      <main class="jda-content">

        ${
          staff.length
            ? staff.map(member => {

                const photo =
                  getPhoto(member);

                return `
                  <div
                    class="jda-member"
                    data-member-id="${member.uid}">

                    ${
                      photo
                        ? `<img
                            class="jda-avatar"
                            src="${photo}"
                            alt=""
                          >`
                        : `<div class="jda-avatar">
                            ${initials(member.realName)}
                          </div>`
                    }

                    <div class="jda-member-info">

                      <div class="jda-name">
                        ${safeText(member.realName)}
                      </div>

                      <div class="jda-small">
                        ${safeText(
                          member.department || "Staff"
                        )}
                      </div>

                    </div>

                  </div>
                `;

              }).join("")
            : `
              <div class="jda-empty">
                No approved staff found.
              </div>
            `
        }

      </main>

    </div>
  `;

  $("jdaSettingsButton")
    ?.addEventListener(
      "click",
      openSettings
    );

  root
    .querySelectorAll("[data-member-id]")
    .forEach(item => {

      item.addEventListener(
        "click",
        () => {

          const member =
            members.find(
              m => m.uid === item.dataset.memberId
            );

          if (member) {
            openChat(member);
          }
        }
      );

    });
}


/* =========================================================
   CALL HISTORY
   ========================================================= */

function renderCalls() {

  const root = getRoot();

  root.innerHTML = `
    <div class="jda-page">

      ${renderHeader(
        "Calls",
        "Your recent calls"
      )}

      <main class="jda-content">

        <div id="callHistory">
          <div class="jda-empty">
            Loading calls...
          </div>
        </div>

      </main>

    </div>
  `;

  $("jdaSettingsButton")
    ?.addEventListener(
      "click",
      openSettings
    );

  loadCallHistory();
}


async function loadCallHistory() {

  const container =
    $("callHistory");

  if (!container) return;

  try {

    const q = query(
      collection(db, "calls"),
      where(
        "participantIds",
        "array-contains",
        currentUser.uid
      ),
      orderBy("createdAt", "desc"),
      limit(50)
    );

    const snapshot =
      await getDocs(q);

    const calls =
      snapshot.docs.map(item => ({
        id: item.id,
        ...item.data()
      }));

    if (!calls.length) {

      container.innerHTML = `
        <div class="jda-empty">
          No calls yet.
        </div>
      `;

      return;
    }

    container.innerHTML =
      calls.map(call => {

        const otherId =
          call.callerId === currentUser.uid
            ? call.calleeId
            : call.callerId;

        const member =
          members.find(
            m => m.uid === otherId
          );

        const name =
          member?.realName ||
          "JDA Member";

        const icon =
          call.type === "video"
            ? "🎥"
            : "📞";

        return `
          <div class="jda-member">

            <div class="jda-avatar">
              ${icon}
            </div>

            <div class="jda-member-info">

              <div class="jda-name">
                ${safeText(name)}
              </div>

              <div class="jda-small">
                ${safeText(call.status || "")}
                ${
                  call.createdAt
                    ? " • " +
                      formatDate(call.createdAt)
                    : ""
                }
              </div>

            </div>

          </div>
        `;

      }).join("");

  } catch (error) {

    console.error(
      "Call history:",
      error
    );

    container.innerHTML = `
      <div class="jda-empty">
        Call history is unavailable.
      </div>
    `;
  }
}


/* =========================================================
   WEBRTC CALL OVERLAY
   ========================================================= */

function createCallOverlay() {

  if ($("jdaCallOverlay")) return;

  const overlay =
    document.createElement("div");

  overlay.id =
    "jdaCallOverlay";

  overlay.className =
    "jda-call-overlay";

  overlay.innerHTML = `

    <video
      id="jdaRemoteVideo"
      class="jda-video-remote"
      autoplay
      playsinline
      style="display:none">
    </video>

    <video
      id="jdaLocalVideo"
      class="jda-video-local"
      autoplay
      muted
      playsinline
      style="display:none">
    </video>

    <div id="jdaCallAvatar"
         class="jda-call-avatar">
      JDA
    </div>

    <div
      id="jdaCallName"
      class="jda-call-name">
      JDA Member
    </div>

    <div
      id="jdaCallStatus"
      class="jda-call-status">
      Calling...
    </div>

    <div
      id="jdaCallButtons"
      class="jda-call-buttons">

      <button
        id="jdaAcceptCall"
        class="jda-call-button accept">
        ✓
      </button>

      <button
        id="jdaRejectCall"
        class="jda-call-button reject">
        ✕
      </button>

    </div>

    <div
      id="jdaActiveCallControls"
      class="jda-call-controls"
      style="display:none">

      <button id="jdaMuteButton">
        🎙️
      </button>

      <button id="jdaCameraButton">
        🎥
      </button>

      <button
        id="jdaEndCallButton"
        style="
          background:#ef3c58;
        ">
        ☎
      </button>

    </div>

  `;

  document.body.appendChild(overlay);

  $("jdaAcceptCall")
    .addEventListener(
      "click",
      acceptIncomingCall
    );

  $("jdaRejectCall")
    .addEventListener(
      "click",
      rejectIncomingCall
    );

  $("jdaEndCallButton")
    .addEventListener(
      "click",
      endCall
    );

  $("jdaMuteButton")
    .addEventListener(
      "click",
      toggleMute
    );

  $("jdaCameraButton")
    .addEventListener(
      "click",
      toggleCamera
    );
}


/* =========================================================
   START CALL
   ========================================================= */

async function startCall(member, type) {

  if (!currentUser || !member) return;

  if (peerConnection) {

    showToast(
      "You are already on a call."
    );

    return;
  }

  try {

    const callRef =
      await addDoc(
        collection(db, "calls"),
        {
          callerId: currentUser.uid,
          calleeId: member.uid,
          participantIds: [
            currentUser.uid,
            member.uid
          ],
          type,
          status: "ringing",
          createdAt: serverTimestamp()
        }
      );

    currentCall = {
      id: callRef.id,
      callerId: currentUser.uid,
      calleeId: member.uid,
      type,
      outgoing: true
    };

    showCallOverlay(
      member,
      type,
      "Calling..."
    );

    await createPeerConnection();

    localStream =
      await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === "video"
      });

    localStream
      .getTracks()
      .forEach(track => {

        peerConnection.addTrack(
          track,
          localStream
        );

      });

    if (type === "video") {
      showLocalVideo();
    }

    peerConnection.onicecandidate =
      async event => {

        if (!event.candidate) return;

        try {

          await addDoc(
            collection(
              db,
              "calls",
              callRef.id,
              "candidates"
            ),
            {
              senderId: currentUser.uid,
              candidate:
                event.candidate.toJSON(),
              createdAt:
                serverTimestamp()
            }
          );

        } catch (error) {
          console.error(
            "ICE candidate:",
            error
          );
        }
      };

    peerConnection.ontrack =
      event => {

        if (!remoteStream) {
          remoteStream =
            new MediaStream();
        }

        event.streams[0]
          ?.getTracks()
          .forEach(track => {

            remoteStream.addTrack(track);

          });

        const video =
          $("jdaRemoteVideo");

        if (video) {
          video.srcObject =
            remoteStream;
        }

        showRemoteVideo();
      };

    const offer =
      await peerConnection.createOffer();

    await peerConnection.setLocalDescription(
      offer
    );

    await updateDoc(
      doc(db, "calls", callRef.id),
      {
        offer: {
          type: offer.type,
          sdp: offer.sdp
        }
      }
    );

    listenToCallChanges(
      callRef.id,
      member,
      true
    );

    listenToCandidates(
      callRef.id,
      true
    );

  } catch (error) {

    console.error(
      "Start call:",
      error
    );

    await cleanupCall();

    showToast(
      "Could not start the call."
    );
  }
}


/* =========================================================
   PEER CONNECTION
   ========================================================= */

async function createPeerConnection() {

  peerConnection =
    new RTCPeerConnection(
      RTC_CONFIG
    );

  peerConnection.onconnectionstatechange =
    () => {

      const state =
        peerConnection.connectionState;

      console.log(
        "WebRTC:",
        state
      );

      if (
        state === "connected"
      ) {

        const status =
          $("jdaCallStatus");

        if (status) {
          status.textContent =
            "Connected";
        }

      }

      if (
        state === "failed" ||
        state === "closed"
      ) {

        cleanupCall();

      }

    };

  return peerConnection;
}


/* =========================================================
   CALL CHANGES
   ========================================================= */

function listenToCallChanges(
  callId,
  member,
  outgoing
) {

  const callRef =
    doc(db, "calls", callId);

  return onSnapshot(
    callRef,
    async snapshot => {

      if (!snapshot.exists()) {
        return;
      }

      const data =
        snapshot.data();

      if (
        outgoing &&
        data.answer &&
        peerConnection &&
        !peerConnection.currentRemoteDescription
      ) {

        try {

          await peerConnection.setRemoteDescription(
            new RTCSessionDescription(
              data.answer
            )
          );

          showCallOverlay(
            member,
            currentCall.type,
            "Connected"
          );

          showActiveCallControls();

        } catch (error) {

          console.error(
            "Remote answer:",
            error
          );
        }
      }

      if (
        data.status === "rejected" ||
        data.status === "ended"
      ) {

        await cleanupCall();

        showToast(
          data.status === "rejected"
            ? "Call rejected."
            : "Call ended."
        );
      }

    },
    error => {
      console.error(
        "Call listener:",
        error
      );
    }
  );
}


/* =========================================================
   CANDIDATES
   ========================================================= */

function listenToCandidates(
  callId,
  outgoing
) {

  const q = query(
    collection(
      db,
      "calls",
      callId,
      "candidates"
    ),
    orderBy("createdAt", "asc")
  );

  onSnapshot(
    q,
    async snapshot => {

      for (
        const change of snapshot.docChanges()
      ) {

        if (change.type !== "added") {
          continue;
        }

        const data =
          change.doc.data();

        if (
          data.senderId === currentUser.uid
        ) {
          continue;
        }

        if (
          !peerConnection ||
          !data.candidate
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

          console.error(
            "Add ICE candidate:",
            error
          );

        }
      }

    }
  );
}


/* =========================================================
   INCOMING CALL LISTENER
   ========================================================= */

function startIncomingCallListener() {

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
    limit(1)
  );

  unsubscribeIncomingCalls =
    onSnapshot(
      q,
      snapshot => {

        snapshot.docChanges()
          .forEach(change => {

            if (change.type !== "added") {
              return;
            }

            const data =
              change.doc.data();

            if (peerConnection) {
              return;
            }

            const member =
              members.find(
                m => m.uid === data.callerId
              );

            if (!member) {
              return;
            }

            currentCall = {
              id: change.doc.id,
              callerId: data.callerId,
              calleeId: data.calleeId,
              type: data.type,
              outgoing: false
            };

            showIncomingCall(
              member,
              data.type
            );

          });

      },
      error => {

        console.error(
          "Incoming calls:",
          error
        );

      }
    );
}


/* =========================================================
   SHOW CALL UI
   ========================================================= */

function showCallOverlay(
  member,
  type,
  status
) {

  const overlay =
    $("jdaCallOverlay");

  if (!overlay) return;

  overlay.classList.add("show");

  const photo =
    getPhoto(member);

  const avatar =
    $("jdaCallAvatar");

  if (avatar) {

    if (photo) {

      avatar.innerHTML =
        `<img
          src="${photo}"
          style="
            width:100%;
            height:100%;
            object-fit:cover;
            border-radius:50%;
          "
        >`;

    } else {

      avatar.textContent =
        initials(member.realName);

    }
  }

  $("jdaCallName").textContent =
    member.realName || "JDA Member";

  $("jdaCallStatus").textContent =
    status;

  $("jdaCallButtons").style.display =
    currentCall?.outgoing
      ? "none"
      : "flex";

  $("jdaActiveCallControls").style.display =
    "none";

  if (type === "video") {

    $("jdaLocalVideo").style.display =
      "block";

    $("jdaRemoteVideo").style.display =
      "block";

  } else {

    $("jdaLocalVideo").style.display =
      "none";

    $("jdaRemoteVideo").style.display =
      "none";

  }
}


function showIncomingCall(member, type) {

  showCallOverlay(
    member,
    type,
    type === "video"
      ? "Incoming video call"
      : "Incoming audio call"
  );

  const buttons =
    $("jdaCallButtons");

  if (buttons) {
    buttons.style.display =
      "flex";
  }

  const active =
    $("jdaActiveCallControls");

  if (active) {
    active.style.display =
      "none";
  }
}


function showActiveCallControls() {

  const buttons =
    $("jdaCallButtons");

  if (buttons) {
    buttons.style.display =
      "none";
  }

  const controls =
    $("jdaActiveCallControls");

  if (controls) {
    controls.style.display =
      "flex";
  }
}


function showLocalVideo() {

  const video =
    $("jdaLocalVideo");

  if (!video || !localStream) {
    return;
  }

  video.srcObject =
    localStream;

  video.style.display =
    "block";
}


function showRemoteVideo() {

  const video =
    $("jdaRemoteVideo");

  if (!video || !remoteStream) {
    return;
  }

  video.srcObject =
    remoteStream;

  video.style.display =
    "block";
}


/* =========================================================
   ACCEPT CALL
   ========================================================= */

async function acceptIncomingCall() {

  if (
    !currentCall ||
    currentCall.outgoing
  ) {
    return;
  }

  try {

    const callRef =
      doc(
        db,
        "calls",
        currentCall.id
      );

    const snapshot =
      await getDoc(callRef);

    if (!snapshot.exists()) {
      throw new Error(
        "Call no longer exists."
      );
    }

    const data =
      snapshot.data();

    await createPeerConnection();

    localStream =
      await navigator.mediaDevices.getUserMedia({
        audio: true,
        video:
          currentCall.type === "video"
      });

    localStream
      .getTracks()
      .forEach(track => {

        peerConnection.addTrack(
          track,
          localStream
        );

      });

    if (
      currentCall.type === "video"
    ) {
      showLocalVideo();
    }

    peerConnection.onicecandidate =
      async event => {

        if (!event.candidate) return;

        await addDoc(
          collection(
            db,
            "calls",
            currentCall.id,
            "candidates"
          ),
          {
            senderId: currentUser.uid,
            candidate:
              event.candidate.toJSON(),
            createdAt:
              serverTimestamp()
          }
        );
      };

    peerConnection.ontrack =
      event => {

        if (!remoteStream) {
          remoteStream =
            new MediaStream();
        }

        event.streams[0]
          ?.getTracks()
          .forEach(track => {

            remoteStream.addTrack(track);

          });

        showRemoteVideo();
      };

    if (data.offer) {

      await peerConnection.setRemoteDescription(
        new RTCSessionDescription(
          data.offer
        )
      );

    }

    const answer =
      await peerConnection.createAnswer();

    await peerConnection.setLocalDescription(
      answer
    );

    await updateDoc(
      callRef,
      {
        answer: {
          type: answer.type,
          sdp: answer.sdp
        },
        status: "accepted"
      }
    );

    const member =
      members.find(
        m => m.uid === currentCall.callerId
      );

    showCallOverlay(
      member || {
        realName: "JDA Member"
      },
      currentCall.type,
      "Connected"
    );

    showActiveCallControls();

    listenToCandidates(
      currentCall.id,
      false
    );

  } catch (error) {

    console.error(
      "Accept call:",
      error
    );

    await rejectIncomingCall();

    showToast(
      "Could not accept the call."
    );
  }
}


/* =========================================================
   REJECT CALL
   ========================================================= */

async function rejectIncomingCall() {

  if (!currentCall) return;

  try {

    await updateDoc(
      doc(
        db,
        "calls",
        currentCall.id
      ),
      {
        status: "rejected"
      }
    );

  } catch (error) {

    console.error(
      "Reject call:",
      error
    );

  }

  await cleanupCall();
}


/* =========================================================
   END CALL
   ========================================================= */

async function endCall() {

  if (currentCall) {

    try {

      await updateDoc(
        doc(
          db,
          "calls",
          currentCall.id
        ),
        {
          status: "ended"
        }
      );

    } catch (error) {

      console.error(
        "End call:",
        error
      );

    }
  }

  await cleanupCall();
}


/* =========================================================
   CLEANUP CALL
   ========================================================= */

async function cleanupCall() {

  if (localStream) {

    localStream
      .getTracks()
      .forEach(track =>
        track.stop()
      );

    localStream = null;
  }

  if (remoteStream) {

    remoteStream
      .getTracks()
      .forEach(track =>
        track.stop()
      );

    remoteStream = null;
  }

  if (peerConnection) {

    try {
      peerConnection.close();
    } catch {}

    peerConnection = null;
  }

  currentCall = null;
  pendingCandidates = [];

  const overlay =
    $("jdaCallOverlay");

  if (overlay) {
    overlay.classList.remove("show");
  }

  const localVideo =
    $("jdaLocalVideo");

  const remoteVideo =
    $("jdaRemoteVideo");

  if (localVideo) {
    localVideo.srcObject = null;
    localVideo.style.display =
      "none";
  }

  if (remoteVideo) {
    remoteVideo.srcObject = null;
    remoteVideo.style.display =
      "none";
  }
}


/* =========================================================
   MUTE
   ========================================================= */

function toggleMute() {

  if (!localStream) return;

  const audioTracks =
    localStream.getAudioTracks();

  if (!audioTracks.length) return;

  const enabled =
    audioTracks[0].enabled;

  audioTracks.forEach(
    track => {
      track.enabled = !enabled;
    }
  );

  const button =
    $("jdaMuteButton");

  if (button) {
    button.textContent =
      enabled
        ? "🔇"
        : "🎙️";
  }
}


/* =========================================================
   CAMERA
   ========================================================= */

function toggleCamera() {

  if (!localStream) return;

  const videoTracks =
    localStream.getVideoTracks();

  if (!videoTracks.length) {
    showToast(
      "This is an audio call."
    );
    return;
  }

  const enabled =
    videoTracks[0].enabled;

  videoTracks.forEach(
    track => {
      track.enabled = !enabled;
    }
  );

  const button =
    $("jdaCameraButton");

  if (button) {
    button.textContent =
      enabled
        ? "📷"
        : "🎥";
  }
}


/* =========================================================
   MEMBERS
   ========================================================= */

function startMembersListener() {

  if (!currentUser) return;

  if (unsubscribeMembers) {
    unsubscribeMembers();
  }

  const q =
    query(
      collection(db, "users"),
      orderBy("realName")
    );

  unsubscribeMembers =
    onSnapshot(
      q,
      snapshot => {

        members =
          snapshot.docs.map(item => ({
            uid: item.id,
            ...item.data()
          }));

        if (
          activeSection === "chats"
        ) {
          renderMemberList();
        }

      },
      error => {

        console.error(
          "Members listener:",
          error
        );

      }
    );
}


/* =========================================================
   ONLINE STATUS
   ========================================================= */

async function setOnlineStatus(isOnline) {

  if (!currentUser) return;

  try {

    await updateDoc(
      doc(
        db,
        "users",
        currentUser.uid
      ),
      {
        isOnline,
        lastSeen:
          serverTimestamp()
      }
    );

  } catch (error) {

    console.error(
      "Online status:",
      error
    );
  }
}


/* =========================================================
   SETTINGS
   ========================================================= */

function openSettings() {

  const root = getRoot();

  const photo =
    getPhoto(currentProfile);

  root.innerHTML = `
    <div class="jda-page">

      <header class="jda-header">

        <div>
          <div class="jda-title">
            Settings
          </div>

          <div class="jda-subtitle">
            Your JDA Networks account
          </div>
        </div>

        <button
          class="jda-icon-button"
          id="settingsBack">
          ←
        </button>

      </header>

      <main class="jda-content">

        <div class="jda-card jda-profile-box">

          ${
            photo
              ? `<img
                  class="jda-profile-large"
                  src="${photo}"
                  alt=""
                >`
              : `<div class="jda-profile-large">
                  ${initials(
                    currentProfile?.realName ||
                    "User"
                  )}
                </div>`
          }

          <div
            style="
              font-size:22px;
              font-weight:900;
            ">
            ${safeText(
              currentProfile?.realName ||
              "User"
            )}
          </div>

          <div class="jda-small">
            ${safeText(
              currentProfile?.jdaNumber ||
              ""
            )}
          </div>

          <div style="margin-top:10px">
            ${
              currentProfile?.accountType === "staff"
                ? `<span class="jda-admin-badge">
                    STAFF
                  </span>`
                : `<span class="jda-admin-badge">
                    STUDENT
                  </span>`
            }
          </div>

        </div>

        <div class="jda-card">

          <div class="jda-name">
            Email
          </div>

          <div class="jda-small">
            ${safeText(
              currentProfile?.email ||
              currentUser?.email ||
              ""
            )}
          </div>

        </div>

        ${
          currentProfile?.accountType === "student"
            ? `
              <div class="jda-card">

                <div class="jda-name">
                  Class
                </div>

                <div class="jda-small">
                  ${safeText(
                    currentProfile?.studentClass ||
                    currentProfile?.className ||
                    ""
                  )}

                  ${
                    currentProfile?.stream
                      ? " • " +
                        safeText(
                          currentProfile.stream
                        )
                      : ""
                  }
                </div>

              </div>
            `
            : ""
        }

        ${
          currentProfile?.accountType === "staff"
            ? `
              <div class="jda-card">

                <div class="jda-name">
                  Department
                </div>

                <div class="jda-small">
                  ${safeText(
                    currentProfile?.department ||
                    ""
                  )}
                </div>

              </div>
            `
            : ""
        }

        <button
          class="jda-button danger"
          id="logoutButton"
          style="
            width:100%;
            margin-top:10px;
          ">
          Log out
        </button>

        ${
          isSuperAdmin()
            ? `
              <button
                class="jda-button"
                id="adminButton"
                style="
                  width:100%;
                  margin-top:10px;
                ">
                Admin Panel
              </button>
            `
            : ""
        }

      </main>

    </div>
  `;

  $("settingsBack")
    ?.addEventListener(
      "click",
      () => renderSection(activeSection)
    );

  $("logoutButton")
    ?.addEventListener(
      "click",
      logoutUser
    );

  $("adminButton")
    ?.addEventListener(
      "click",
      openAdminPanel
    );
}


/* =========================================================
   ADMIN
   ========================================================= */

function isSuperAdmin() {

  return (
    currentUser?.email ===
    "jonathanmentor62@gmail.com"
  );
}


async function isAdmin() {

  if (!currentUser) {
    return false;
  }

  if (isSuperAdmin()) {
    return true;
  }

  try {

    const adminDoc =
      await getDoc(
        doc(
          db,
          "admins",
          currentUser.uid
        )
      );

    return adminDoc.exists();

  } catch {

    return false;
  }
}


async function openAdminPanel() {

  if (!(await isAdmin())) {

    showToast(
      "Admin access required."
    );

    return;
  }

  const root = getRoot();

  root.innerHTML = `
    <div class="jda-page">

      <header class="jda-header">

        <div>
          <div class="jda-title">
            Admin Panel
          </div>

          <div class="jda-subtitle">
            Manage JDA Networks
          </div>
        </div>

        <button
          class="jda-icon-button"
          id="adminBack">
          ←
        </button>

      </header>

      <main class="jda-content">

        <div class="jda-card">

          <div
            style="
              font-size:19px;
              font-weight:900;
            ">
            Registration Requests
          </div>

          <div
            class="jda-small"
            style="margin-top:5px">
            Approve or reject new members.
          </div>

        </div>

        <div id="pendingUsers">
          <div class="jda-empty">
            Loading...
          </div>
        </div>

      </main>

    </div>
  `;

  $("adminBack")
    ?.addEventListener(
      "click",
      openSettings
    );

  loadPendingUsers();
}


async function loadPendingUsers() {

  const container =
    $("pendingUsers");

  if (!container) return;

  try {

    const q =
      query(
        collection(db, "users"),
        where(
          "status",
          "==",
          "pending"
        )
      );

    const snapshot =
      await getDocs(q);

    const pending =
      snapshot.docs.map(item => ({
        uid: item.id,
        ...item.data()
      }));

    if (!pending.length) {

      container.innerHTML = `
        <div class="jda-empty">
          No pending registrations.
        </div>
      `;

      return;
    }

    container.innerHTML =
      pending.map(user => {

        const photo =
          getPhoto(user);

        return `
          <div class="jda-card">

            <div
              style="
                display:flex;
                gap:12px;
                align-items:center;
              ">

              ${
                photo
                  ? `<img
                      class="jda-avatar"
                      src="${photo}"
                      alt=""
                    >`
                  : `<div class="jda-avatar">
                      ${initials(
                        user.realName
                      )}
                    </div>`
              }

              <div
                class="jda-member-info">

                <div class="jda-name">
                  ${safeText(
                    user.realName
                  )}
                </div>

                <div class="jda-small">
                  ${safeText(
                    user.jdaNumber || ""
                  )}
                </div>

                <div class="jda-small">
                  ${
                    user.accountType === "staff"
                      ? "Staff • " +
                        safeText(
                          user.department || ""
                        )
                      : safeText(
                          user.studentClass ||
                          user.className ||
                          ""
                        ) +
                        (
                          user.stream
                            ? " • " +
                              safeText(
                                user.stream
                              )
                            : ""
                        )
                  }
                </div>

              </div>

            </div>

            <div
              style="
                display:flex;
                gap:8px;
                margin-top:14px;
              ">

              <button
                class="jda-button"
                data-approve="${user.uid}"
                style="flex:1">
                Approve
              </button>

              <button
                class="jda-button danger"
                data-reject="${user.uid}"
                style="flex:1">
                Reject
              </button>

            </div>

          </div>
        `;

      }).join("");

    container
      .querySelectorAll("[data-approve]")
      .forEach(button => {

        button.addEventListener(
          "click",
          () =>
            approveUser(
              button.dataset.approve
            )
        );

      });

    container
      .querySelectorAll("[data-reject]")
      .forEach(button => {

        button.addEventListener(
          "click",
          () =>
            rejectUser(
              button.dataset.reject
            )
        );

      });

  } catch (error) {

    console.error(
      "Pending users:",
      error
    );

    container.innerHTML = `
      <div class="jda-empty">
        Could not load registrations.
      </div>
    `;
  }
}


async function approveUser(uid) {

  if (!(await isAdmin())) return;

  try {

    await updateDoc(
      doc(db, "users", uid),
      {
        status: "approved",
        approved: true,
        approvedAt:
          serverTimestamp(),
        updatedAt:
          serverTimestamp()
      }
    );

    showToast(
      "Member approved."
    );

    loadPendingUsers();

  } catch (error) {

    console.error(
      error
    );

    showToast(
      "Approval failed."
    );
  }
}


async function rejectUser(uid) {

  if (!(await isAdmin())) return;

  try {

    await updateDoc(
      doc(db, "users", uid),
      {
        status: "rejected",
        approved: false,
        updatedAt:
          serverTimestamp()
      }
    );

    showToast(
      "Registration rejected."
    );

    loadPendingUsers();

  } catch (error) {

    console.error(
      error
    );

    showToast(
      "Rejection failed."
    );
  }
}


/* =========================================================
   LOGOUT
   ========================================================= */

async function logoutUser() {

  try {

    await setOnlineStatus(false);

    await signOut(auth);

  } catch (error) {

    console.error(
      "Logout:",
      error
    );

    showToast(
      "Could not log out."
    );
  }
}


/* =========================================================
   PROFILE
   ========================================================= */

async function loadCurrentProfile() {

  if (!currentUser) {
    return null;
  }

  const profileDoc =
    await getDoc(
      doc(
        db,
        "users",
        currentUser.uid
      )
    );

  if (!profileDoc.exists()) {
    return null;
  }

  return {
    uid: currentUser.uid,
    ...profileDoc.data()
  };
}


/* =========================================================
   START APP
   ========================================================= */

async function startApp(user) {

  currentUser = user;

  try {

    currentProfile =
      await loadCurrentProfile();

    if (!currentProfile) {

      showToast(
        "Your JDA profile was not found."
      );

      return;
    }

    if (
      currentProfile.status !==
      "approved"
    ) {

      document.body.innerHTML = `
        <div
          style="
            min-height:100vh;
            display:flex;
            align-items:center;
            justify-content:center;
            padding:25px;
            text-align:center;
          ">

          <div class="jda-card">

            <div
              style="
                font-size:28px;
                font-weight:900;
              ">
              JDA Networks
            </div>

            <div
              style="
                margin-top:12px;
                color:#aab0ce;
              ">
              Your account is ${
                safeText(
                  currentProfile.status ||
                  "pending"
                )
              }.
            </div>

          </div>

        </div>
      `;

      return;
    }

    ensureShell();

    await setOnlineStatus(true);

    startMembersListener();

    startConversationListener();

    startIncomingCallListener();

    renderSection("chats");

    window.addEventListener(
      "beforeunload",
      () => {
        setOnlineStatus(false);
      }
    );

  } catch (error) {

    console.error(
      "Start app:",
      error
    );

    document.body.innerHTML = `
      <div
        style="
          min-height:100vh;
          display:flex;
          align-items:center;
          justify-content:center;
          padding:25px;
          text-align:center;
        ">

        <div class="jda-card">

          <div
            style="
              font-size:24px;
              font-weight:900;
            ">
            JDA Networks
          </div>

          <div
            style="
              margin-top:10px;
              color:#ff7288;
            ">
            Unable to load the app.
          </div>

          <div
            style="
              margin-top:8px;
              color:#9299b8;
              font-size:12px;
            ">
            Check your Firebase connection
            and Firestore rules.
          </div>

        </div>

      </div>
    `;
  }
}


/* =========================================================
   FIREBASE AUTH
   ========================================================= */

onAuthStateChanged(
  auth,
  async user => {

    if (!user) {

      currentUser = null;
      currentProfile = null;

      return;
    }

    await startApp(user);
  }
);


/* =========================================================
   GLOBAL API
   ========================================================= */

window.JDA = {

  openChat,
  renderSection,
  openSettings,
  openAdminPanel,
  startCall,
  endCall,
  cleanupCall

};

console.log(
  "JDA Networks loaded successfully."
);