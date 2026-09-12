// ============================================================
// JDA NETWORKS — APP.JS
// WHATSAPP-STYLE SCHOOL CHAT SYSTEM
// ============================================================
// Firebase Auth + Firestore only
// No AI
// No Firebase Storage
// Spark-compatible
// ============================================================

import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getDoc,
  doc,
  setDoc,
  addDoc,
  updateDoc,
  serverTimestamp,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

import {
  auth,
  db
} from "./firebase.js";


// ============================================================
// STATE
// ============================================================

let currentUser = null;
let currentProfile = null;

let members = [];
let conversations = [];

let currentConversationId = null;
let currentChatUser = null;

let unsubscribeMessages = null;
let unsubscribeConversations = null;
let unsubscribeMembers = null;

let initialized = false;


// ============================================================
// BASIC HELPERS
// ============================================================

const $ = id => document.getElementById(id);


function escapeHTML(value = "") {

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


function initials(name = "JDA") {

  const clean =
    String(name)
      .trim();

  if (!clean) return "JDA";

  return clean
    .split(/\s+/)
    .slice(0, 2)
    .map(word => word[0] || "")
    .join("")
    .toUpperCase();

}


function showError(message) {

  console.error(
    "JDA Networks:",
    message
  );

  alert(message);

}


function timestampSeconds(timestamp) {

  if (!timestamp) return 0;

  if (
    typeof timestamp.seconds ===
    "number"
  ) {

    return timestamp.seconds;

  }

  if (
    typeof timestamp.toDate ===
    "function"
  ) {

    return Math.floor(
      timestamp.toDate().getTime() / 1000
    );

  }

  if (
    timestamp instanceof Date
  ) {

    return Math.floor(
      timestamp.getTime() / 1000
    );

  }

  if (
    typeof timestamp === "number"
  ) {

    return Math.floor(
      timestamp / 1000
    );

  }

  return 0;

}


function timestampDate(timestamp) {

  const seconds =
    timestampSeconds(timestamp);

  if (!seconds) return null;

  return new Date(
    seconds * 1000
  );

}


// ============================================================
// TIME FORMATTING
// ============================================================

function formatTime(timestamp) {

  const date =
    timestampDate(timestamp);

  if (!date) return "";

  const now =
    new Date();

  const sameDay =
    date.toDateString() ===
    now.toDateString();

  if (sameDay) {

    return date.toLocaleTimeString(
      [],
      {
        hour: "2-digit",
        minute: "2-digit"
      }
    );

  }


  const yesterday =
    new Date();

  yesterday.setDate(
    yesterday.getDate() - 1
  );


  if (
    date.toDateString() ===
    yesterday.toDateString()
  ) {

    return "Yesterday";

  }


  return date.toLocaleDateString(
    [],
    {
      day: "2-digit",
      month: "short"
    }
  );

}


function formatLastSeen(timestamp) {

  const date =
    timestampDate(timestamp);

  if (!date) {

    return "Offline";

  }


  const now =
    new Date();

  const diff =
    now.getTime() -
    date.getTime();


  if (diff < 60000) {

    return "Last seen just now";

  }


  if (diff < 3600000) {

    const minutes =
      Math.floor(
        diff / 60000
      );

    return `Last seen ${minutes} min ago`;

  }


  if (
    date.toDateString() ===
    now.toDateString()
  ) {

    return `Last seen today at ${
      date.toLocaleTimeString(
        [],
        {
          hour: "2-digit",
          minute: "2-digit"
        }
      )
    }`;

  }


  return `Last seen ${
    date.toLocaleDateString(
      [],
      {
        day: "2-digit",
        month: "short"
      }
    )
  }`;

}


// ============================================================
// MEMBER HELPERS
// ============================================================

function getMemberClass(member) {

  return (
    member?.className ||
    member?.class ||
    member?.studentClass ||
    ""
  );

}


function isMemberOnline(member) {

  return member?.isOnline === true;

}


function avatarHTML(
  profile,
  size = 52
) {

  const name =
    profile?.realName ||
    "JDA Member";


  const photo =
    profile?.photoURL ||
    profile?.profilePhoto ||
    profile?.photoUrl ||
    "";


  if (photo) {

    return `
      <img
        src="${escapeHTML(photo)}"
        alt=""
        class="jda-avatar-image"
        style="
          width:${size}px;
          height:${size}px;
          border-radius:50%;
          object-fit:cover;
          flex-shrink:0;
          display:block;
        "
      >
    `;

  }


  return `
    <div
      class="jda-avatar-fallback"
      style="
        width:${size}px;
        height:${size}px;
        border-radius:50%;
        background:
          linear-gradient(
            135deg,
            #246bfd,
            #8b35ff,
            #d22cff
          );
        display:flex;
        align-items:center;
        justify-content:center;
        color:white;
        font-weight:800;
        font-size:${Math.max(
          14,
          size / 2.7
        )}px;
        flex-shrink:0;
        box-shadow:
          0 0 14px
          rgba(119,72,255,.35);
      "
    >
      ${escapeHTML(initials(name))}
    </div>
  `;

}


function onlineIndicator(
  online,
  size = 12
) {

  return `
    <span
      class="jda-online-dot ${
        online
          ? "online"
          : "offline"
      }"
      style="
        width:${size}px;
        height:${size}px;
        border-radius:50%;
        display:block;
        background:${
          online
            ? "#39ef88"
            : "#65717c"
        };
        border:2px solid #0b0d19;
        box-sizing:border-box;
        box-shadow:${
          online
            ? "0 0 8px rgba(57,239,136,.9)"
            : "none"
        };
      "
    ></span>
  `;

}


// ============================================================
// JDA NEON DESIGN
// ============================================================

function injectJDAStyles() {

  if (
    document.getElementById(
      "jdaAppStyles"
    )
  ) {

    return;

  }


  const style =
    document.createElement(
      "style"
    );


  style.id =
    "jdaAppStyles";


  style.textContent = `

    /* ======================================================
       JDA NETWORKS — VISUAL SYSTEM
       ====================================================== */

    :root {
      --jda-bg: #080914;
      --jda-panel: #101222;
      --jda-panel-2: #15172a;
      --jda-line: rgba(255,255,255,.07);
      --jda-text: #f4f4fb;
      --jda-muted: #9a9caf;
      --jda-blue: #39a9ff;
      --jda-purple: #9a4dff;
      --jda-pink: #e03cff;
      --jda-green: #39ef88;
    }


    body {
      background:
        radial-gradient(
          circle at 15% 10%,
          rgba(53,117,255,.12),
          transparent 28%
        ),
        radial-gradient(
          circle at 90% 30%,
          rgba(179,46,255,.12),
          transparent 30%
        ),
        var(--jda-bg);
    }


    .jda-chat-row {
      position:relative;
      overflow:hidden;
      border-bottom:
        1px solid
        rgba(255,255,255,.055) !important;
      background:
        linear-gradient(
          90deg,
          rgba(255,255,255,.015),
          transparent
        );
    }


    .jda-chat-row::after {
      content:"";
      position:absolute;
      left:74px;
      right:12px;
      bottom:0;
      height:1px;
      background:
        linear-gradient(
          90deg,
          transparent,
          rgba(86,128,255,.16),
          rgba(170,65,255,.13),
          transparent
        );
      pointer-events:none;
    }


    .jda-chat-row:active {
      background:
        rgba(100,75,180,.13) !important;
    }


    .jda-neon-title {
      color:#fff;
      text-shadow:
        0 0 10px rgba(78,150,255,.35),
        0 0 18px rgba(173,63,255,.25);
    }


    .jda-online-text {
      color:var(--jda-green) !important;
      text-shadow:
        0 0 7px rgba(57,239,136,.25);
    }


    .jda-offline-text {
      color:#8c91a1 !important;
    }


    .jda-chat-background {
      background:
        radial-gradient(
          circle at 20% 20%,
          rgba(39,101,255,.09),
          transparent 30%
        ),
        radial-gradient(
          circle at 85% 60%,
          rgba(169,43,255,.08),
          transparent 32%
        ),
        #080914;
    }


    .jda-message-bubble {
      position:relative;
      box-shadow:
        0 4px 18px
        rgba(0,0,0,.18);
    }


    .jda-message-mine {
      background:
        linear-gradient(
          135deg,
          #7039ff,
          #a329ff
        ) !important;
      box-shadow:
        0 0 18px
        rgba(151,52,255,.28),
        0 5px 18px
        rgba(0,0,0,.22);
    }


    .jda-message-other {
      background:
        linear-gradient(
          135deg,
          #17213a,
          #20283e
        ) !important;
      border:
        1px solid
        rgba(69,154,255,.32);
      box-shadow:
        0 0 14px
        rgba(35,119,255,.12);
    }


    .jda-send-button {
      background:
        linear-gradient(
          135deg,
          #7838ff,
          #e33dff
        ) !important;
      color:white !important;
      box-shadow:
        0 0 18px
        rgba(181,48,255,.45);
    }


    .jda-message-input {
      background:
        rgba(24,27,47,.96) !important;
      border:
        1px solid
        rgba(102,75,255,.24) !important;
      box-shadow:
        inset 0 0 12px
        rgba(0,0,0,.18);
    }


    .jda-chat-header {
      background:
        linear-gradient(
          90deg,
          #0d1020,
          #14142a
        ) !important;
      border-bottom:
        1px solid
        rgba(117,80,255,.2);
      box-shadow:
        0 4px 20px
        rgba(0,0,0,.25);
    }


    .jda-unread {
      min-width:21px;
      height:21px;
      padding:0 6px;
      border-radius:50%;
      background:
        linear-gradient(
          135deg,
          #7d39ff,
          #d635ff
        );
      color:white;
      font-size:11px;
      font-weight:800;
      display:flex;
      align-items:center;
      justify-content:center;
      box-shadow:
        0 0 10px
        rgba(184,49,255,.4);
    }


    .jda-status-line {
      display:flex;
      align-items:center;
      gap:5px;
    }


    .jda-chat-name {
      color:#fff;
      font-weight:700;
    }


    .jda-time {
      color:#9296a8;
      font-size:11px;
    }


    .jda-last-message {
      color:#a9aabd;
    }


    .jda-message-meta {
      display:flex;
      align-items:center;
      justify-content:flex-end;
      gap:4px;
      margin-top:3px;
      font-size:10px;
    }


    .jda-checks {
      letter-spacing:-2px;
      font-weight:800;
    }


    .jda-checks.sent {
      color:#a6acba;
    }


    .jda-checks.seen {
      color:#62b8ff;
      text-shadow:
        0 0 5px
        rgba(98,184,255,.45);
    }


    .jda-search-results {
      max-height:60vh;
      overflow-y:auto;
    }


    .jda-member-row:hover {
      background:
        rgba(119,74,255,.09);
    }


    .jda-member-row:active {
      background:
        rgba(119,74,255,.16);
    }

  `;


  document.head.appendChild(
    style
  );

}


// ============================================================
// AUTHENTICATION
// ============================================================

onAuthStateChanged(
  auth,
  async user => {

    if (!user) {

      window.location.replace(
        "./index.html"
      );

      return;

    }


    currentUser =
      user;


    try {

      const profileRef =
        doc(
          db,
          "users",
          user.uid
        );


      const profileSnap =
        await getDoc(
          profileRef
        );


      if (
        !profileSnap.exists()
      ) {

        await signOut(auth);

        window.location.replace(
          "./index.html"
        );

        return;

      }


      currentProfile = {
        id:
          profileSnap.id,
        ...profileSnap.data()
      };


      const approved =
        currentProfile.status ===
          "approved" ||
        currentProfile.approved ===
          true;


      if (!approved) {

        window.location.replace(
          "./index.html"
        );

        return;

      }


      if (!initialized) {

        initialized = true;

        await initializeApp();

      }


      await setOwnOnlineStatus(
        true
      );

    }
    catch(error) {

      console.error(
        "JDA authentication error:",
        error
      );

      showError(
        "JDA Networks could not load your account.\n\n" +
        error.message
      );

    }

  }
);


// ============================================================
// INITIALIZE
// ============================================================

async function initializeApp() {

  injectJDAStyles();

  renderProfile();

  createMemberModal();

  createChatWindow();

  setupNavigation();

  setupNewChatButtons();

  setupSearch();

  setupLogout();

  setupDirectoryButtons();

  setupOnlineStatusEvents();

  await loadMembers();

  listenForMembers();

  listenForConversations();

}


// ============================================================
// ONLINE / OFFLINE
// ============================================================

async function setOwnOnlineStatus(
  online
) {

  if (!currentUser) return;


  try {

    await updateDoc(
      doc(
        db,
        "users",
        currentUser.uid
      ),
      {
        isOnline:
          online,

        lastSeen:
          serverTimestamp()
      }
    );

  }
  catch(error) {

    console.warn(
      "Could not update online status:",
      error.message
    );

  }

}


function setupOnlineStatusEvents() {

  document.addEventListener(
    "visibilitychange",
    async () => {

      if (
        document.visibilityState ===
        "visible"
      ) {

        await setOwnOnlineStatus(
          true
        );

      }
      else {

        await setOwnOnlineStatus(
          false
        );

      }

    }
  );


  window.addEventListener(
    "pagehide",
    () => {

      if (!currentUser) return;


      updateDoc(
        doc(
          db,
          "users",
          currentUser.uid
        ),
        {
          isOnline:false,
          lastSeen:
            serverTimestamp()
        }
      )
      .catch(
        () => {}
      );

    }
  );


  window.addEventListener(
    "focus",
    () => {

      setOwnOnlineStatus(
        true
      );

    }
  );


  window.addEventListener(
    "blur",
    () => {

      setOwnOnlineStatus(
        false
      );

    }
  );

}


// ============================================================
// LOAD MEMBERS
// ============================================================

async function loadMembers() {

  if (!currentUser) return;


  try {

    const membersQuery =
      query(
        collection(
          db,
          "users"
        ),
        where(
          "status",
          "==",
          "approved"
        )
      );


    const snapshot =
      await getDocs(
        membersQuery
      );


    members = [];


    snapshot.forEach(
      item => {

        if (
          item.id ===
          currentUser.uid
        ) {

          return;

        }


        members.push({
          id:
            item.id,
          ...item.data()
        });

      }
    );


    sortMembers();

    renderMemberResults();

    renderDirectory();

    renderChats();

  }
  catch(error) {

    console.error(
      "Member loading error:",
      error
    );

    showError(
      "Approved members could not be loaded.\n\n" +
      error.message
    );

  }

}


// ============================================================
// SORT MEMBERS
// ============================================================

function sortMembers() {

  members.sort(
    (a, b) =>
      (
        a.realName ||
        ""
      ).localeCompare(
        b.realName ||
        ""
      )
  );

}


// ============================================================
// REAL-TIME MEMBERS
// ============================================================

function listenForMembers() {

  if (
    unsubscribeMembers
  ) {

    unsubscribeMembers();

  }


  const membersQuery =
    query(
      collection(
        db,
        "users"
      ),
      where(
        "status",
        "==",
        "approved"
      )
    );


  unsubscribeMembers =
    onSnapshot(
      membersQuery,

      snapshot => {

        members = [];


        snapshot.forEach(
          item => {

            if (
              item.id ===
              currentUser.uid
            ) {

              return;

            }


            members.push({
              id:
                item.id,
              ...item.data()
            });

          }
        );


        sortMembers();

        renderMemberResults();

        renderDirectory();

        renderChats();


        // Update currently open chat status.

        if (
          currentChatUser
        ) {

          const updated =
            members.find(
              member =>
                member.id ===
                currentChatUser.id
            );


          if (updated) {

            currentChatUser =
              updated;

            updateChatHeader(
              updated
            );

          }

        }

      },

      error => {

        console.error(
          "Member listener error:",
          error
        );

      }
    );

}


// ============================================================
// REAL-TIME CONVERSATIONS
// ============================================================

function listenForConversations() {

  if (
    unsubscribeConversations
  ) {

    unsubscribeConversations();

  }


  const conversationsQuery =
    query(
      collection(
        db,
        "conversations"
      ),
      where(
        "participantIds",
        "array-contains",
        currentUser.uid
      )
    );


  unsubscribeConversations =
    onSnapshot(
      conversationsQuery,

      snapshot => {

        conversations =
          snapshot.docs.map(
            item => ({
              id:
                item.id,
              ...item.data()
            })
          );


        conversations.sort(
          (a, b) =>
            timestampSeconds(
              b.updatedAt
            ) -
            timestampSeconds(
              a.updatedAt
            )
        );


        renderChats();

      },

      error => {

        console.error(
          "Conversation listener error:",
          error
        );

        showError(
          "Chats could not be loaded.\n\n" +
          error.message
        );

      }
    );

}


// ============================================================
// GET OTHER PARTICIPANT
// ============================================================

async function getOtherParticipant(
  conversation
) {

  const ids =
    conversation.participantIds ||
    [];


  const otherId =
    ids.find(
      id =>
        id !==
        currentUser.uid
    );


  if (!otherId) {

    return null;

  }


  const cached =
    members.find(
      member =>
        member.id ===
        otherId
    );


  if (cached) {

    return cached;

  }


  try {

    const snap =
      await getDoc(
        doc(
          db,
          "users",
          otherId
        )
      );


    if (!snap.exists()) {

      return null;

    }


    return {
      id:
        snap.id,
      ...snap.data()
    };

  }
  catch(error) {

    console.error(
      "Other participant error:",
      error
    );

    return null;

  }

}


// ============================================================
// CHAT LIST
// ============================================================

async function renderChats() {

  const list =
    $("chatList");


  if (!list) return;


  list.innerHTML = "";


  if (
    conversations.length ===
    0
  ) {

    list.innerHTML = `

      <div
        class="empty"
        style="
          text-align:center;
          padding:55px 20px;
          color:#9a9caf;
        "
      >

        <div
          style="
            width:70px;
            height:70px;
            margin:0 auto 18px;
            border-radius:50%;
            display:flex;
            align-items:center;
            justify-content:center;
            font-size:31px;
            background:
              linear-gradient(
                135deg,
                #315cff,
                #a72cff
              );
            box-shadow:
              0 0 28px
              rgba(126,62,255,.32);
          "
        >
          💬
        </div>

        <div
          style="
            color:#fff;
            font-size:19px;
            font-weight:700;
            margin-bottom:7px;
          "
        >
          No chats yet
        </div>

        <div
          style="
            margin-bottom:20px;
          "
        >
          Start a private conversation
          with a JDA member.
        </div>

        <button
          id="emptyStartChat"
          style="
            border:0;
            border-radius:24px;
            padding:12px 23px;
            background:
              linear-gradient(
                135deg,
                #7438ff,
                #d737ff
              );
            color:white;
            font-weight:800;
            box-shadow:
              0 0 18px
              rgba(180,55,255,.35);
          "
        >
          ✎ Start chatting
        </button>

      </div>

    `;


    $("emptyStartChat")
      ?.addEventListener(
        "click",
        openMemberModal
      );


    return;

  }


  const rows =
    await Promise.all(
      conversations.map(
        async conversation => {

          const person =
            await getOtherParticipant(
              conversation
            );


          if (!person) {

            return null;

          }


          return {
            conversation,
            person
          };

        }
      )
    );


  rows
    .filter(Boolean)
    .forEach(
      ({
        conversation,
        person
      }) => {

        const row =
          createChatRow(
            person,
            conversation
          );


        list.appendChild(
          row
        );

      }
    );

}


// ============================================================
// CREATE CHAT ROW
// ============================================================

function createChatRow(
  person,
  conversation
) {

  const row =
    document.createElement(
      "div"
    );


  row.className =
    "jda-chat-row";


  row.dataset.name =
    (
      person.realName ||
      ""
    ).toLowerCase();


  row.dataset.search =
    `
      ${person.realName || ""}
      ${conversation.lastMessage || ""}
      ${person.jdaNumber || ""}
    `.toLowerCase();


  const online =
    isMemberOnline(
      person
    );


  const lastMessage =
    conversation.lastMessage ||
    "Start chatting";


  const lastTime =
    formatTime(
      conversation.updatedAt
    );


  const unread =
    Number(
      conversation.unreadCounts?.[
        currentUser.uid
      ] ||
      conversation.unreadCount ||
      0
    );


  row.innerHTML = `

    <div
      style="
        position:relative;
        width:56px;
        height:56px;
        flex-shrink:0;
      "
    >

      ${avatarHTML(
        person,
        56
      )}

      <div
        style="
          position:absolute;
          right:-1px;
          bottom:-1px;
        "
      >
        ${onlineIndicator(
          online,
          14
        )}
      </div>

    </div>


    <div
      style="
        flex:1;
        min-width:0;
      "
    >

      <div
        style="
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:8px;
        "
      >

        <div
          class="jda-chat-name"
          style="
            font-size:16px;
            white-space:nowrap;
            overflow:hidden;
            text-overflow:ellipsis;
          "
        >
          ${escapeHTML(
            person.realName ||
            "JDA Member"
          )}
        </div>


        <div
          class="jda-time"
        >
          ${escapeHTML(
            lastTime
          )}
        </div>

      </div>


      <div
        class="jda-status-line"
        style="
          margin-top:4px;
          margin-bottom:3px;
          font-size:11px;
        "
      >

        <span
          class="${
            online
              ? "jda-online-text"
              : "jda-offline-text"
          }"
        >
          ${
            online
              ? "Online"
              : "Offline"
          }
        </span>

        ${
          online
            ? `
              <span
                style="
                  width:5px;
                  height:5px;
                  border-radius:50%;
                  background:#39ef88;
                  box-shadow:
                    0 0 6px
                    #39ef88;
                "
              ></span>
            `
            : ""
        }

      </div>


      <div
        style="
          display:flex;
          align-items:center;
          gap:7px;
        "
      >

        <span
          class="jda-last-message"
          style="
            flex:1;
            min-width:0;
            font-size:13px;
            white-space:nowrap;
            overflow:hidden;
            text-overflow:ellipsis;
          "
        >
          ${escapeHTML(
            lastMessage
          )}
        </span>

        ${
          unread > 0
            ? `
              <span
                class="jda-unread"
              >
                ${
                  unread > 99
                    ? "99+"
                    : unread
                }
              </span>
            `
            : ""
        }

      </div>

    </div>

  `;


  row.addEventListener(
    "click",
    () => {

      openChat(
        person,
        conversation.id
      );

    }
  );


  return row;

}


// ============================================================
// MEMBER MODAL
// ============================================================

function createMemberModal() {

  if (
    $("jdaMemberModal")
  ) {

    return;

  }


  const modal =
    document.createElement(
      "div"
    );


  modal.id =
    "jdaMemberModal";


  modal.style.cssText = `
    position:fixed;
    inset:0;
    z-index:99999;
    background:
      rgba(3,4,12,.82);
    display:none;
    align-items:flex-end;
    justify-content:center;
    backdrop-filter:blur(8px);
  `;


  modal.innerHTML = `

    <div
      style="
        width:100%;
        max-width:700px;
        max-height:92vh;
        background:
          linear-gradient(
            180deg,
            #111325,
            #090a14
          );
        border:
          1px solid
          rgba(136,69,255,.22);
        border-radius:22px 22px 0 0;
        overflow:hidden;
        display:flex;
        flex-direction:column;
        box-shadow:
          0 -10px 50px
          rgba(0,0,0,.5);
      "
    >

      <div
        style="
          padding:16px;
          border-bottom:
            1px solid
            rgba(255,255,255,.07);
          display:flex;
          align-items:center;
          gap:12px;
        "
      >

        <button
          id="closeMemberModal"
          style="
            border:0;
            background:none;
            color:#fff;
            font-size:30px;
            width:40px;
            height:40px;
          "
        >
          ×
        </button>


        <strong
          style="
            font-size:19px;
            color:#fff;
          "
        >
          New chat
        </strong>

      </div>


      <div
        style="
          padding:13px 16px 8px;
        "
      >

        <input
          id="memberSearchInput"
          type="search"
          placeholder="Search JDA members"
          autocomplete="off"
          style="
            width:100%;
            box-sizing:border-box;
            background:#191b2d;
            border:
              1px solid
              rgba(108,76,255,.2);
            outline:none;
            border-radius:14px;
            padding:13px 15px;
            color:#fff;
            font-size:15px;
          "
        >

      </div>


      <div
        style="
          padding:5px 16px 12px;
          color:#898da1;
          font-size:12px;
        "
      >
        Approved JDA members
      </div>


      <div
        id="memberResults"
        class="jda-search-results"
        style="
          padding-bottom:25px;
        "
      ></div>

    </div>

  `;


  document.body.appendChild(
    modal
  );


  $("closeMemberModal")
    .addEventListener(
      "click",
      closeMemberModal
    );


  $("memberSearchInput")
    .addEventListener(
      "input",
      renderMemberResults
    );


  modal.addEventListener(
    "click",
    event => {

      if (
        event.target ===
        modal
      ) {

        closeMemberModal();

      }

    }
  );

}


// ============================================================
// OPEN MEMBER MODAL
// ============================================================

function openMemberModal() {

  createMemberModal();


  const modal =
    $("jdaMemberModal");


  if (!modal) return;


  modal.style.display =
    "flex";


  $("memberSearchInput").value =
    "";


  renderMemberResults();


  setTimeout(
    () => {

      $("memberSearchInput")
        ?.focus();

    },
    150
  );

}


// ============================================================
// CLOSE MEMBER MODAL
// ============================================================

function closeMemberModal() {

  const modal =
    $("jdaMemberModal");


  if (modal) {

    modal.style.display =
      "none";

  }

}


// ============================================================
// MEMBER RESULTS
// ============================================================

function renderMemberResults() {

  const container =
    $("memberResults");


  if (!container) return;


  const text =
    (
      $("memberSearchInput")
        ?.value ||
      ""
    )
      .trim()
      .toLowerCase();


  const filtered =
    members.filter(
      member => {

        if (!text) return true;


        const searchable =
          `
            ${member.realName || ""}
            ${member.jdaNumber || ""}
            ${member.accountType || ""}
            ${getMemberClass(member)}
            ${member.stream || ""}
            ${member.department || ""}
          `.toLowerCase();


        return searchable.includes(
          text
        );

      }
    );


  container.innerHTML =
    "";


  if (
    filtered.length === 0
  ) {

    container.innerHTML = `

      <div
        style="
          padding:35px 20px;
          text-align:center;
          color:#85899c;
        "
      >
        No approved member found.
      </div>

    `;

    return;

  }


  filtered.forEach(
    member => {

      const row =
        document.createElement(
          "div"
        );


      row.className =
        "jda-member-row";


      row.style.cssText = `
        display:flex;
        align-items:center;
        gap:13px;
        padding:13px 18px;
        cursor:pointer;
        transition:.15s ease;
      `;


      let info = "";


      if (
        member.accountType ===
        "student"
      ) {

        const parts = [];


        const className =
          getMemberClass(
            member
          );


        if (className) {

          parts.push(
            className
          );

        }


        if (member.stream) {

          parts.push(
            member.stream
          );

        }


        info =
          parts.join(
            " • "
          );

      }
      else {

        info =
          member.department ||
          "Staff";

      }


      if (!info) {

        info =
          member.jdaNumber ||
          "JDA Member";

      }


      const online =
        isMemberOnline(
          member
        );


      row.innerHTML = `

        <div
          style="
            position:relative;
            width:52px;
            height:52px;
          "
        >

          ${avatarHTML(
            member,
            52
          )}

          <div
            style="
              position:absolute;
              right:-1px;
              bottom:-1px;
            "
          >
            ${onlineIndicator(
              online,
              12
            )}
          </div>

        </div>


        <div
          style="
            flex:1;
            min-width:0;
          "
        >

          <div
            style="
              color:#fff;
              font-size:16px;
              font-weight:700;
            "
          >
            ${escapeHTML(
              member.realName ||
              "JDA Member"
            )}
          </div>


          <div
            style="
              color:#9699ac;
              font-size:12px;
              margin-top:4px;
            "
          >
            ${escapeHTML(
              info
            )}
          </div>

        </div>


        <div
          style="
            font-size:11px;
            color:${
              online
                ? "#39ef88"
                : "#747989"
            };
          "
        >
          ${
            online
              ? "Online"
              : "Offline"
          }
        </div>

      `;


      row.addEventListener(
        "click",
        async () => {

          closeMemberModal();

          await startConversation(
            member
          );

        }
      );


      container.appendChild(
        row
      );

    }
  );

}


// ============================================================
// START CONVERSATION
// ============================================================

async function startConversation(
  member
) {

  if (
    !currentUser ||
    !member ||
    !member.id
  ) {

    showError(
      "You must be logged in before starting a chat."
    );

    return;

  }


  if (
    member.id ===
    currentUser.uid
  ) {

    return;

  }


  try {

    const ids = [
      currentUser.uid,
      member.id
    ].sort();


    const conversationId =
      `${ids[0]}_${ids[1]}`;


    const conversationRef =
      doc(
        db,
        "conversations",
        conversationId
      );


    const existing =
      await getDoc(
        conversationRef
      );


    if (
      !existing.exists()
    ) {

      await setDoc(
        conversationRef,
        {
          participantIds:
            ids,

          createdAt:
            serverTimestamp(),

          updatedAt:
            serverTimestamp(),

          lastMessage:
            ""
        }
      );

    }


    await openChat(
      member,
      conversationId
    );

  }
  catch(error) {

    console.error(
      "Conversation creation error:",
      error
    );


    showError(
      "Could not start the conversation.\n\n" +
      error.message
    );

  }

}


// ============================================================
// CHAT WINDOW
// ============================================================

function createChatWindow() {

  if (
    $("jdaChatWindow")
  ) {

    return;

  }


  const windowEl =
    document.createElement(
      "div"
    );


  windowEl.id =
    "jdaChatWindow";


  windowEl.style.cssText = `
    position:fixed;
    inset:0;
    z-index:100000;
    background:#080914;
    display:none;
    flex-direction:column;
  `;


  windowEl.innerHTML = `

    <div
      class="jda-chat-header"
      style="
        min-height:68px;
        display:flex;
        align-items:center;
        gap:9px;
        padding:0 9px;
        flex-shrink:0;
      "
    >

      <button
        id="closeChat"
        style="
          border:0;
          background:none;
          color:#fff;
          font-size:36px;
          width:40px;
          height:50px;
          line-height:40px;
        "
      >
        ‹
      </button>


      <div
        id="chatAvatar"
        style="
          position:relative;
          width:44px;
          height:44px;
          flex-shrink:0;
        "
      ></div>


      <div
        style="
          flex:1;
          min-width:0;
        "
      >

        <div
          id="chatName"
          class="jda-neon-title"
          style="
            font-size:16px;
            font-weight:700;
            white-space:nowrap;
            overflow:hidden;
            text-overflow:ellipsis;
          "
        >
          Member
        </div>


        <div
          id="chatStatus"
          style="
            font-size:11px;
            margin-top:3px;
          "
        >
          Offline
        </div>

      </div>

    </div>


    <div
      id="messageList"
      class="jda-chat-background"
      style="
        flex:1;
        overflow-y:auto;
        padding:20px 12px;
        display:flex;
        flex-direction:column;
        gap:6px;
      "
    ></div>


    <div
      style="
        background:
          linear-gradient(
            180deg,
            #0e1020,
            #0a0b15
          );
        padding:8px;
        display:flex;
        align-items:flex-end;
        gap:8px;
        flex-shrink:0;
        border-top:
          1px solid
          rgba(117,80,255,.18);
      "
    >

      <button
        id="chatAttachButton"
        type="button"
        style="
          width:43px;
          height:43px;
          border:0;
          background:none;
          color:#68bfff;
          font-size:27px;
        "
      >
        +
      </button>


      <textarea
        id="messageInput"
        rows="1"
        placeholder="Message..."
        class="jda-message-input"
        style="
          flex:1;
          resize:none;
          outline:none;
          border-radius:22px;
          color:#fff;
          padding:11px 15px;
          font-size:15px;
          max-height:120px;
          box-sizing:border-box;
        "
      ></textarea>


      <button
        id="sendMessage"
        class="jda-send-button"
        style="
          width:45px;
          height:45px;
          border:0;
          border-radius:50%;
          font-size:21px;
          font-weight:900;
        "
      >
        ➤
      </button>

    </div>

  `;


  document.body.appendChild(
    windowEl
  );


  $("closeChat")
    .addEventListener(
      "click",
      closeChat
    );


  $("sendMessage")
    .addEventListener(
      "click",
      sendMessage
    );


  $("chatAttachButton")
    .addEventListener(
      "click",
      () => {

        alert(
          "Attachments will be added in a later JDA Networks update."
        );

      }
    );


  $("messageInput")
    .addEventListener(
      "keydown",
      event => {

        if (
          event.key === "Enter" &&
          !event.shiftKey
        ) {

          event.preventDefault();

          sendMessage();

        }

      }
    );


  $("messageInput")
    .addEventListener(
      "input",
      () => {

        const input =
          $("messageInput");


        if (!input) return;


        input.style.height =
          "auto";


        input.style.height =
          Math.min(
            input.scrollHeight,
            120
          ) + "px";

      }
    );

}


// ============================================================
// UPDATE CHAT HEADER
// ============================================================

function updateChatHeader(
  member
) {

  if (!member) return;


  const avatar =
    $("chatAvatar");


  const name =
    $("chatName");


  const status =
    $("chatStatus");


  if (avatar) {

    const online =
      isMemberOnline(
        member
      );


    avatar.innerHTML = `

      <div
        style="
          position:relative;
          width:44px;
          height:44px;
        "
      >

        ${avatarHTML(
          member,
          44
        )}

        <div
          style="
            position:absolute;
            right:-1px;
            bottom:-1px;
          "
        >
          ${onlineIndicator(
            online,
            12
          )}
        </div>

      </div>

    `;

  }


  if (name) {

    name.textContent =
      member.realName ||
      "JDA Member";

  }


  if (status) {

    const online =
      isMemberOnline(
        member
      );


    if (online) {

      status.textContent =
        "Online • Active now";

      status.className =
        "jda-online-text";


    }
    else {

      status.textContent =
        formatLastSeen(
          member.lastSeen
        );

      status.className =
        "jda-offline-text";

    }

  }

}


// ============================================================
// OPEN CHAT
// ============================================================

async function openChat(
  member,
  conversationId
) {

  createChatWindow();


  currentChatUser =
    member;


  currentConversationId =
    conversationId;


  const chatWindow =
    $("jdaChatWindow");


  if (chatWindow) {

    chatWindow.style.display =
      "flex";

  }


  updateChatHeader(
    member
  );


  if (
    unsubscribeMessages
  ) {

    unsubscribeMessages();

    unsubscribeMessages =
      null;

  }


  const messagesRef =
    collection(
      db,
      "conversations",
      conversationId,
      "messages"
    );


  const messagesQuery =
    query(
      messagesRef,
      orderBy(
        "createdAt",
        "asc"
      ),
      limit(500)
    );


  unsubscribeMessages =
    onSnapshot(
      messagesQuery,

      snapshot => {

        const messages =
          snapshot.docs.map(
            item => ({
              id:
                item.id,
              ...item.data()
            })
          );


        renderMessages(
          messages
        );

      },

      error => {

        console.error(
          "Message listener error:",
          error
        );


        showError(
          "Messages could not be loaded.\n\n" +
          error.message
        );

      }
    );


  setTimeout(
    () => {

      $("messageInput")
        ?.focus();

    },
    150
  );

}


// ============================================================
// CLOSE CHAT
// ============================================================

function closeChat() {

  if (
    unsubscribeMessages
  ) {

    unsubscribeMessages();

    unsubscribeMessages =
      null;

  }


  const chat =
    $("jdaChatWindow");


  if (chat) {

    chat.style.display =
      "none";

  }


  currentConversationId =
    null;

  currentChatUser =
    null;

}


// ============================================================
// RENDER MESSAGES
// ============================================================

function renderMessages(
  messages
) {

  const container =
    $("messageList");


  if (!container) return;


  container.innerHTML =
    "";


  if (
    messages.length === 0
  ) {

    container.innerHTML = `

      <div
        style="
          margin:auto;
          text-align:center;
          color:#85899d;
          padding:30px;
          font-size:13px;
        "
      >

        <div
          style="
            font-size:30px;
            margin-bottom:10px;
          "
        >
          🔒
        </div>

        Your conversation is private.

        <br><br>

        Start the conversation.

      </div>

    `;

    return;

  }


  messages.forEach(
    message => {

      const mine =
        message.senderId ===
        currentUser.uid;


      const bubble =
        document.createElement(
          "div"
        );


      bubble.className =
        `
          jda-message-bubble
          ${
            mine
              ? "jda-message-mine"
              : "jda-message-other"
          }
        `;


      bubble.style.cssText += `
        align-self:${
          mine
            ? "flex-end"
            : "flex-start"
        };
        max-width:78%;
        color:#fff;
        padding:9px 11px 6px;
        border-radius:${
          mine
            ? "14px 4px 14px 14px"
            : "4px 14px 14px 14px"
        };
        word-wrap:break-word;
        margin-bottom:2px;
      `;


      const seen =
        message.read === true ||
        message.seen === true;


      const checks =
        mine
          ? `
            <span
              class="
                jda-checks
                ${
                  seen
                    ? "seen"
                    : "sent"
                }
              "
            >
              ✓✓
            </span>
          `
          : "";


      bubble.innerHTML = `

        <div
          style="
            font-size:15px;
            line-height:1.42;
            white-space:pre-wrap;
          "
        >
          ${escapeHTML(
            message.text ||
            ""
          )}
        </div>


        <div
          class="jda-message-meta"
        >

          <span>
            ${formatTime(
              message.createdAt
            )}
          </span>

          ${checks}

        </div>

      `;


      container.appendChild(
        bubble
      );

    }
  );


  requestAnimationFrame(
    () => {

      container.scrollTop =
        container.scrollHeight;

    }
  );

}


// ============================================================
// SEND MESSAGE
// ============================================================

async function sendMessage() {

  if (
    !currentUser ||
    !currentConversationId ||
    !currentChatUser
  ) {

    return;

  }


  const input =
    $("messageInput");


  if (!input) return;


  const text =
    input.value.trim();


  if (!text) return;


  if (
    text.length > 5000
  ) {

    showError(
      "Message cannot exceed 5000 characters."
    );

    return;

  }


  const sendButton =
    $("sendMessage");


  input.disabled =
    true;


  if (sendButton) {

    sendButton.disabled =
      true;

  }


  try {

    const conversationRef =
      doc(
        db,
        "conversations",
        currentConversationId
      );


    const messagesRef =
      collection(
        db,
        "conversations",
        currentConversationId,
        "messages"
      );


    await addDoc(
      messagesRef,
      {
        senderId:
          currentUser.uid,

        receiverId:
          currentChatUser.id,

        text,

        createdAt:
          serverTimestamp(),

        read:
          false
      }
    );


    await updateDoc(
      conversationRef,
      {
        lastMessage:
          text,

        updatedAt:
          serverTimestamp()
      }
    );


    input.value =
      "";

    input.style.height =
      "auto";


    renderChats();

  }
  catch(error) {

    console.error(
      "Send message error:",
      error
    );


    showError(
      "Message could not be sent.\n\n" +
      error.message
    );

  }
  finally {

    input.disabled =
      false;


    if (sendButton) {

      sendButton.disabled =
        false;

    }


    input.focus();

  }

}


// ============================================================
// NEW CHAT BUTTONS
// ============================================================

function setupNewChatButtons() {

  const buttons =
    document.querySelectorAll(
      "#newChatBtn, #fab"
    );


  buttons.forEach(
    button => {

      button.addEventListener(
        "click",
        event => {

          event.preventDefault();

          event.stopPropagation();

          openMemberModal();

        }
      );

    }
  );

}


// ============================================================
// SEARCH CHATS
// ============================================================

function setupSearch() {

  const search =
    $("chatSearch");


  if (!search) return;


  search.addEventListener(
    "input",
    () => {

      const text =
        search.value
          .trim()
          .toLowerCase();


      const rows =
        document.querySelectorAll(
          ".jda-chat-row"
        );


      rows.forEach(
        row => {

          const searchable =
            `
              ${row.dataset.name || ""}
              ${row.dataset.search || ""}
              ${row.innerText || ""}
            `.toLowerCase();


          row.style.display =
            !text ||
            searchable.includes(
              text
            )
              ? "flex"
              : "none";

        }
      );

    }
  );

}


// ============================================================
// NAVIGATION
// ============================================================

function setupNavigation() {

  const buttons =
    document.querySelectorAll(
      ".bottom-nav [data-page]"
    );


  buttons.forEach(
    button => {

      button.addEventListener(
        "click",
        () => {

          switchPage(
            button.dataset.page
          );

        }
      );

    }
  );

}


function switchPage(
  page
) {

  // Compatibility:
  // Classes may be called "students"
  // in the current home.html.

  const actualPage =
    page === "classes"
      ? (
          document.querySelector(
            '[data-screen="classes"]'
          )
            ? "classes"
            : "students"
        )
      : page;


  document
    .querySelectorAll(
      "[data-screen]"
    )
    .forEach(
      screen => {

        screen.classList.toggle(
          "active",
          screen.dataset.screen ===
          actualPage
        );

      }
    );


  document
    .querySelectorAll(
      ".bottom-nav [data-page]"
    )
    .forEach(
      button => {

        const buttonPage =
          button.dataset.page;


        const matches =
          buttonPage === page ||
          (
            page === "classes" &&
            buttonPage === "students"
          );


        button.classList.toggle(
          "active",
          matches
        );

      }
    );


  if (
    page === "chats"
  ) {

    renderChats();

  }


  if (
    page === "classes" ||
    page === "students"
  ) {

    renderDirectory();

  }


  if (
    page === "staff"
  ) {

    renderStaff();

  }

}


// ============================================================
// DIRECTORY BUTTONS
// ============================================================

function setupDirectoryButtons() {

  document
    .querySelectorAll(
      ".filter-button"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            const filter =
              button.dataset.filter;


            document
              .querySelectorAll(
                ".filter-button"
              )
              .forEach(
                item => {

                  item.classList.remove(
                    "active"
                  );

                }
              );


            button.classList.add(
              "active"
            );


            if (
              filter ===
              "students"
            ) {

              switchPage(
                "classes"
              );

              return;

            }


            if (
              filter ===
              "staff"
            ) {

              switchPage(
                "staff"
              );

              return;

            }


            switchPage(
              "chats"
            );

          }
        );

      }
    );


  document
    .querySelectorAll(
      ".class-button"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            const className =
              button.dataset.class;


            if (!className) return;


            const number =
              className
                .replace(
                  "Form ",
                  ""
                )
                .trim();


            const membersBox =
              document.getElementById(
                "form" +
                number +
                "Members"
              );


            if (
              !membersBox
            ) return;


            document
              .querySelectorAll(
                ".class-members"
              )
              .forEach(
                item => {

                  if (
                    item !==
                    membersBox
                  ) {

                    item.classList.remove(
                      "open"
                    );

                  }

                }
              );


            renderClassMembers(
              className,
              membersBox
            );


            membersBox.classList.toggle(
              "open"
            );

          }
        );

      }
    );

}


// ============================================================
// RENDER DIRECTORY
// ============================================================

function renderDirectory() {

  for (
    let number = 1;
    number <= 6;
    number++
  ) {

    const box =
      document.getElementById(
        "form" +
        number +
        "Members"
      );


    if (!box) continue;


    renderClassMembers(
      "Form " + number,
      box
    );

  }


  renderStaff();

}


// ============================================================
// CLASS MEMBERS
// ============================================================

function renderClassMembers(
  className,
  container
) {

  const students =
    members.filter(
      member => {

        if (
          member.accountType !==
          "student"
        ) {

          return false;

        }


        return (
          getMemberClass(
            member
          ).toLowerCase() ===
          className.toLowerCase()
        );

      }
    );


  container.innerHTML =
    "";


  if (
    students.length === 0
  ) {

    container.innerHTML = `

      <div
        class="class-members-empty"
        style="
          color:#888ca0;
          padding:12px 4px;
          font-size:13px;
        "
      >
        No approved students in
        ${escapeHTML(className)}
        yet.
      </div>

    `;

    return;

  }


  students.forEach(
    member => {

      const row =
        document.createElement(
          "div"
        );


      row.style.cssText = `
        display:flex;
        align-items:center;
        gap:10px;
        padding:10px 4px;
        cursor:pointer;
        border-bottom:
          1px solid
          rgba(255,255,255,.05);
      `;


      const online =
        isMemberOnline(
          member
        );


      row.innerHTML = `

        <div
          style="
            position:relative;
            width:42px;
            height:42px;
          "
        >

          ${avatarHTML(
            member,
            42
          )}

          <div
            style="
              position:absolute;
              right:-1px;
              bottom:-1px;
            "
          >
            ${onlineIndicator(
              online,
              11
            )}
          </div>

        </div>


        <div
          style="
            flex:1;
            min-width:0;
          "
        >

          <div
            style="
              font-weight:700;
              color:#fff;
              font-size:14px;
            "
          >
            ${escapeHTML(
              member.realName ||
              "Student"
            )}
          </div>


          <div
            style="
              color:#8f93a5;
              font-size:12px;
              margin-top:3px;
            "
          >
            ${escapeHTML(
              member.stream ||
              "Student"
            )}
          </div>

        </div>


        <div
          style="
            color:${
              online
                ? "#39ef88"
                : "#747989"
            };
            font-size:10px;
          "
        >
          ${
            online
              ? "Online"
              : "Offline"
          }
        </div>

      `;


      row.addEventListener(
        "click",
        () => {

          startConversation(
            member
          );

        }
      );


      container.appendChild(
        row
      );

    }
  );

}


// ============================================================
// STAFF
// ============================================================

function renderStaff() {

  const container =
    document.querySelector(
      ".staff-list"
    );


  if (!container) return;


  const staff =
    members.filter(
      member =>
        member.accountType ===
        "staff"
    );


  container.innerHTML =
    "";


  if (
    staff.length === 0
  ) {

    container.innerHTML = `

      <div
        class="staff-card"
      >

        <div
          class="staff-title"
        >
          No approved staff yet
        </div>

        <div
          class="staff-description"
        >
          Approved staff members
          will appear here.
        </div>

      </div>

    `;

    return;

  }


  staff.forEach(
    member => {

      const card =
        document.createElement(
          "div"
        );


      card.className =
        "staff-card";


      card.style.cssText += `
        display:flex;
        align-items:center;
        gap:12px;
        cursor:pointer;
        position:relative;
      `;


      const online =
        isMemberOnline(
          member
        );


      card.innerHTML = `

        <div
          style="
            position:relative;
            width:48px;
            height:48px;
          "
        >

          ${avatarHTML(
            member,
            48
          )}

          <div
            style="
              position:absolute;
              right:-1px;
              bottom:-1px;
            "
          >
            ${onlineIndicator(
              online,
              12
            )}
          </div>

        </div>


        <div
          style="
            flex:1;
            min-width:0;
          "
        >

          <div
            class="staff-title"
          >
            ${escapeHTML(
              member.realName ||
              "Staff"
            )}
          </div>


          <div
            class="staff-description"
          >
            ${escapeHTML(
              member.department ||
              "Staff"
            )}
          </div>

        </div>


        <div
          style="
            color:${
              online
                ? "#39ef88"
                : "#747989"
            };
            font-size:10px;
          "
        >
          ${
            online
              ? "Online"
              : "Offline"
          }
        </div>

      `;


      card.addEventListener(
        "click",
        () => {

          startConversation(
            member
          );

        }
      );


      container.appendChild(
        card
      );

    }
  );

}


// ============================================================
// LOGOUT
// ============================================================

function setupLogout() {

  const button =
    $("logoutBtn");


  if (!button) return;


  button.addEventListener(
    "click",
    async () => {

      if (
        !confirm(
          "Log out of JDA Networks?"
        )
      ) {

        return;

      }


      await setOwnOnlineStatus(
        false
      );


      try {

        await signOut(
          auth
        );


        window.location.replace(
          "./index.html"
        );

      }
      catch(error) {

        showError(
          "Could not log out.\n\n" +
          error.message
        );

      }

    }
  );

}


// ============================================================
// PROFILE
// ============================================================

function renderProfile() {

  if (
    !currentProfile
  ) {

    return;

  }


  const name =
    currentProfile.realName ||
    "JDA Member";


  const number =
    currentProfile.jdaNumber ||
    "—";


  const photo =
    currentProfile.photoURL ||
    currentProfile.profilePhoto ||
    "";


  const photoElement =
    $("profilePhoto");


  if (photoElement) {

    if (photo) {

      photoElement.innerHTML = `

        <img
          src="${escapeHTML(
            photo
          )}"
          alt=""
          style="
            width:100%;
            height:100%;
            object-fit:cover;
            border-radius:50%;
          "
        >

      `;

    }
    else {

      photoElement.textContent =
        initials(name);

    }

  }


  if (
    $("profileName")
  ) {

    $("profileName").textContent =
      name;

  }


  if (
    $("profileJdaNumber")
  ) {

    $("profileJdaNumber")
      .textContent =
        number;

  }


  if (
    $("profileEmail")
  ) {

    $("profileEmail")
      .textContent =
        currentProfile.email ||
        currentUser.email ||
        "—";

  }


  if (
    $("profileAccountType")
  ) {

    $("profileAccountType")
      .textContent =
        currentProfile.accountType ===
        "student"
          ? "Student"
          : "Staff";

  }


  if (
    $("profileClass")
  ) {

    if (
      currentProfile.accountType ===
      "student"
    ) {

      const parts = [];


      const className =
        getMemberClass(
          currentProfile
        );


      if (className) {

        parts.push(
          className
        );

      }


      if (
        currentProfile.stream
      ) {

        parts.push(
          currentProfile.stream
        );

      }


      $("profileClass")
        .textContent =
          parts.join(
            " • "
          ) ||
          "Student";

    }
    else {

      $("profileClass")
        .textContent =
          currentProfile.department ||
          "Staff";

    }

  }

}


// ============================================================
// PUBLIC JDA API
// ============================================================

window.JDA = {

  openNewChat:
    openMemberModal,

  startConversation,

  openChat,

  closeChat,

  refreshMembers:
    loadMembers,

  refreshChats:
    async () => {

      if (
        unsubscribeConversations
      ) {

        unsubscribeConversations();

      }


      listenForConversations();

    },

  switchPage,

  logout:
    async () => {

      await setOwnOnlineStatus(
        false
      );


      await signOut(
        auth
      );


      window.location.replace(
        "./index.html"
      );

    }

};


// ============================================================
// FINISHED
// ============================================================

console.log(
  "JDA Networks — WhatsApp-style neon chat system loaded."
);