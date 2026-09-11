// ============================================================
// JDA NETWORKS — REAL FIREBASE APP
// ============================================================

import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getDoc,
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
  onSnapshot,
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
let currentConversationId = null;
let currentChatUser = null;
let unsubscribeMessages = null;
let unsubscribeConversation = null;

let members = [];
let conversations = [];


// ============================================================
// HELPERS
// ============================================================

const $ = (id) => document.getElementById(id);

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showMessage(message) {
  alert(message);
}

function getInitials(name = "User") {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(x => x[0]?.toUpperCase() || "")
    .join("");
}

function profilePhoto(profile) {
  return profile?.photoURL || "";
}

function avatarHTML(profile, size = 52) {
  const photo = profilePhoto(profile);

  if (photo) {
    return `
      <img
        src="${escapeHTML(photo)}"
        alt=""
        style="
          width:${size}px;
          height:${size}px;
          border-radius:50%;
          object-fit:cover;
          flex-shrink:0;
        "
      >
    `;
  }

  return `
    <div style="
      width:${size}px;
      height:${size}px;
      border-radius:50%;
      background:#26343b;
      display:flex;
      align-items:center;
      justify-content:center;
      font-weight:700;
      font-size:${Math.max(14, size / 2.8)}px;
      color:#d9e1e5;
      flex-shrink:0;
    ">
      ${escapeHTML(getInitials(profile?.realName))}
    </div>
  `;
}


// ============================================================
// AUTHENTICATION
// ============================================================

onAuthStateChanged(auth, async (user) => {

  if (!user) {
    window.location.href = "./index.html";
    return;
  }

  currentUser = user;

  try {

    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);

    if (!snap.exists()) {
      await signOut(auth);
      window.location.href = "./index.html";
      return;
    }

    currentProfile = {
      id: snap.id,
      ...snap.data()
    };

    if (currentProfile.status !== "approved") {
      await signOut(auth);
      window.location.href = "./index.html";
      return;
    }

    await updateOnlineStatus(true);

    await loadMembers();
    await loadConversations();

    setupInterface();

  } catch (error) {

    console.error("JDA initialization error:", error);

    showMessage(
      "JDA Networks could not load your account.\n\n" +
      error.message
    );
  }
});


// ============================================================
// ONLINE STATUS
// ============================================================

async function updateOnlineStatus(isOnline) {

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
    console.warn("Online status error:", error);
  }
}

window.addEventListener("beforeunload", () => {
  updateOnlineStatus(false);
});


// ============================================================
// LOAD MEMBERS
// ============================================================

async function loadMembers() {

  if (!currentUser) return;

  try {

    const q = query(
      collection(db, "users"),
      where("status", "==", "approved")
    );

    const snap = await getDocs(q);

    members = [];

    snap.forEach((item) => {

      if (item.id === currentUser.uid) return;

      members.push({
        id: item.id,
        ...item.data()
      });

    });

    members.sort((a, b) =>
      (a.realName || "").localeCompare(b.realName || "")
    );

  } catch (error) {

    console.error("Member loading error:", error);

    if (error.code === "permission-denied") {
      showMessage(
        "Firebase blocked the member directory.\n\n" +
        "Check that your Firestore Rules were published."
      );
    }
  }
}


// ============================================================
// LOAD CONVERSATIONS
// ============================================================

async function loadConversations() {

  if (!currentUser) return;

  try {

    const q = query(
      collection(db, "conversations"),
      where("participantIds", "array-contains", currentUser.uid)
    );

    const snap = await getDocs(q);

    conversations = [];

    snap.forEach((item) => {

      conversations.push({
        id: item.id,
        ...item.data()
      });

    });

    conversations.sort((a, b) => {

      const aTime = a.updatedAt?.seconds || 0;
      const bTime = b.updatedAt?.seconds || 0;

      return bTime - aTime;
    });

    renderChats();

  } catch (error) {

    console.error("Conversation loading error:", error);
  }
}


// ============================================================
// FIND OTHER PARTICIPANT
// ============================================================

async function getOtherParticipant(conversation) {

  const ids = conversation.participantIds || [];

  const otherId = ids.find(
    id => id !== currentUser.uid
  );

  if (!otherId) return null;

  const cached = members.find(
    member => member.id === otherId
  );

  if (cached) return cached;

  try {

    const snap = await getDoc(
      doc(db, "users", otherId)
    );

    if (!snap.exists()) return null;

    return {
      id: snap.id,
      ...snap.data()
    };

  } catch {
    return null;
  }
}


// ============================================================
// RENDER CHATS
// ============================================================

async function renderChats() {

  const container =
    $("chatList") ||
    $("conversationList") ||
    $("chatsList");

  if (!container) return;

  container.innerHTML = "";

  if (conversations.length === 0) {

    container.innerHTML = `
      <div style="
        padding:50px 25px;
        text-align:center;
        color:#8696a0;
      ">
        <div style="font-size:42px;margin-bottom:12px;">💬</div>

        <div style="
          font-size:18px;
          font-weight:600;
          color:#d9e1e5;
          margin-bottom:8px;
        ">
          No chats yet
        </div>

        <div style="font-size:14px;">
          Tap the + button to find a JDA Networks member.
        </div>
      </div>
    `;

    return;
  }

  for (const conversation of conversations) {

    const person =
      await getOtherParticipant(conversation);

    if (!person) continue;

    const row = document.createElement("div");

    row.className = "jda-chat-row";

    row.style.cssText = `
      display:flex;
      align-items:center;
      gap:13px;
      padding:12px 16px;
      cursor:pointer;
      border-bottom:1px solid rgba(255,255,255,.04);
    `;

    const preview =
      conversation.lastMessage || "Start chatting";

    row.innerHTML = `

      ${avatarHTML(person, 52)}

      <div style="
        flex:1;
        min-width:0;
      ">

        <div style="
          display:flex;
          justify-content:space-between;
          gap:10px;
        ">

          <strong style="
            color:#e9edef;
            font-size:16px;
            white-space:nowrap;
            overflow:hidden;
            text-overflow:ellipsis;
          ">
            ${escapeHTML(person.realName || "JDA Member")}
          </strong>

          <span style="
            color:#8696a0;
            font-size:11px;
            white-space:nowrap;
          ">
            ${formatTime(conversation.updatedAt)}
          </span>

        </div>

        <div style="
          color:#8696a0;
          font-size:14px;
          margin-top:5px;
          white-space:nowrap;
          overflow:hidden;
          text-overflow:ellipsis;
        ">
          ${escapeHTML(preview)}
        </div>

      </div>
    `;

    row.addEventListener("click", () => {
      openChat(person, conversation.id);
    });

    container.appendChild(row);
  }
}


// ============================================================
// FORMAT TIME
// ============================================================

function formatTime(timestamp) {

  if (!timestamp?.seconds) return "";

  const date = new Date(
    timestamp.seconds * 1000
  );

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}


// ============================================================
// CREATE MEMBER SEARCH MODAL
// ============================================================

function createMemberModal() {

  if ($("jdaMemberModal")) return;

  const modal = document.createElement("div");

  modal.id = "jdaMemberModal";

  modal.style.cssText = `
    position:fixed;
    inset:0;
    z-index:9999;
    background:rgba(0,0,0,.72);
    display:none;
    align-items:flex-end;
    justify-content:center;
  `;

  modal.innerHTML = `

    <div style="
      width:100%;
      max-width:700px;
      max-height:90vh;
      background:#111b21;
      border-radius:22px 22px 0 0;
      overflow:hidden;
      display:flex;
      flex-direction:column;
    ">

      <div style="
        padding:17px;
        border-bottom:1px solid #26343b;
        display:flex;
        align-items:center;
        gap:12px;
      ">

        <button id="closeMemberModal"
          style="
            border:0;
            background:none;
            color:#e9edef;
            font-size:26px;
            cursor:pointer;
          ">
          ×
        </button>

        <strong style="
          color:#e9edef;
          font-size:19px;
        ">
          New chat
        </strong>

      </div>

      <div style="padding:12px 16px;">

        <input
          id="memberSearchInput"
          type="text"
          placeholder="Search JDA members"
          autocomplete="off"
          style="
            width:100%;
            box-sizing:border-box;
            background:#202c33;
            border:0;
            outline:none;
            border-radius:12px;
            padding:13px 15px;
            color:#e9edef;
            font-size:15px;
          "
        >

      </div>

      <div
        id="memberResults"
        style="
          overflow-y:auto;
          padding-bottom:20px;
        "
      ></div>

    </div>
  `;

  document.body.appendChild(modal);

  $("closeMemberModal").onclick =
    closeMemberModal;

  $("memberSearchInput").addEventListener(
    "input",
    renderMemberResults
  );

  modal.addEventListener("click", (event) => {

    if (event.target === modal) {
      closeMemberModal();
    }

  });
}


// ============================================================
// OPEN MEMBER SEARCH
// ============================================================

function openMemberModal() {

  createMemberModal();

  $("jdaMemberModal").style.display = "flex";

  $("memberSearchInput").value = "";

  renderMemberResults();

  setTimeout(() => {
    $("memberSearchInput")?.focus();
  }, 100);
}


// ============================================================
// CLOSE MEMBER SEARCH
// ============================================================

function closeMemberModal() {

  const modal = $("jdaMemberModal");

  if (modal) {
    modal.style.display = "none";
  }
}


// ============================================================
// RENDER MEMBER SEARCH
// ============================================================

function renderMemberResults() {

  const container = $("memberResults");

  if (!container) return;

  const search =
    ($("memberSearchInput")?.value || "")
      .trim()
      .toLowerCase();

  const filtered = members.filter(member => {

    if (!search) return true;

    const name =
      (member.realName || "").toLowerCase();

    const number =
      (member.jdaNumber || "").toLowerCase();

    const type =
      (member.accountType || "").toLowerCase();

    const cls =
      (member.className || "").toLowerCase();

    return (
      name.includes(search) ||
      number.includes(search) ||
      type.includes(search) ||
      cls.includes(search)
    );
  });

  container.innerHTML = "";

  if (filtered.length === 0) {

    container.innerHTML = `
      <div style="
        padding:35px 20px;
        text-align:center;
        color:#8696a0;
      ">
        No approved member found.
      </div>
    `;

    return;
  }

  filtered.forEach(member => {

    const row = document.createElement("div");

    row.style.cssText = `
      display:flex;
      align-items:center;
      gap:13px;
      padding:13px 18px;
      cursor:pointer;
    `;

    const details = [];

    if (member.accountType === "student") {

      if (member.className) {
        details.push(member.className);
      }

      if (member.stream) {
        details.push(member.stream);
      }

    } else if (member.department) {

      details.push(member.department);

    }

    row.innerHTML = `

      ${avatarHTML(member, 52)}

      <div style="flex:1;min-width:0;">

        <div style="
          color:#e9edef;
          font-size:16px;
          font-weight:600;
        ">
          ${escapeHTML(member.realName || "JDA Member")}
        </div>

        <div style="
          color:#8696a0;
          font-size:13px;
          margin-top:4px;
        ">
          ${escapeHTML(
            details.join(" • ") ||
            member.jdaNumber ||
            "JDA Networks member"
          )}
        </div>

      </div>

      <div style="
        width:9px;
        height:9px;
        border-radius:50%;
        background:${member.isOnline ? "#25d366" : "#667781"};
      "></div>
    `;

    row.addEventListener("click", async () => {

      closeMemberModal();

      await startConversation(member);
    });

    container.appendChild(row);
  });
}


// ============================================================
// START CONVERSATION
// ============================================================

async function startConversation(member) {

  if (!currentUser || !member?.id) return;

  try {

    const ids = [
      currentUser.uid,
      member.id
    ].sort();

    const conversationId =
      `${ids[0]}_${ids[1]}`;

    const conversationRef =
      doc(db, "conversations", conversationId);

    const existing =
      await getDoc(conversationRef);

    if (!existing.exists()) {

      await setDoc(conversationRef, {

        participantIds: ids,

        createdAt: serverTimestamp(),

        updatedAt: serverTimestamp(),

        lastMessage: ""

      });

    }

    await loadConversations();

    await openChat(member, conversationId);

  } catch (error) {

    console.error(error);

    showMessage(
      "Could not start the chat.\n\n" +
      error.message
    );
  }
}


// ============================================================
// CHAT WINDOW
// ============================================================

function createChatWindow() {

  if ($("jdaChatWindow")) return;

  const screen = document.createElement("div");

  screen.id = "jdaChatWindow";

  screen.style.cssText = `
    position:fixed;
    inset:0;
    z-index:10000;
    background:#0b141a;
    display:none;
    flex-direction:column;
  `;

  screen.innerHTML = `

    <div style="
      height:62px;
      background:#202c33;
      display:flex;
      align-items:center;
      gap:12px;
      padding:0 10px;
      box-sizing:border-box;
      flex-shrink:0;
    ">

      <button
        id="closeChat"
        style="
          border:0;
          background:none;
          color:#e9edef;
          font-size:27px;
          cursor:pointer;
        "
      >
        ‹
      </button>

      <div id="chatAvatar"></div>

      <div style="
        flex:1;
        min-width:0;
      ">

        <div
          id="chatName"
          style="
            color:#e9edef;
            font-weight:600;
            font-size:16px;
          "
        >
          Member
        </div>

        <div
          id="chatStatus"
          style="
            color:#8696a0;
            font-size:12px;
            margin-top:2px;
          "
        >
          offline
        </div>

      </div>

    </div>


    <div
      id="messageList"
      style="
        flex:1;
        overflow-y:auto;
        padding:18px 12px;
        box-sizing:border-box;
        display:flex;
        flex-direction:column;
        gap:5px;
      "
    ></div>


    <div style="
      background:#202c33;
      padding:8px;
      display:flex;
      align-items:flex-end;
      gap:8px;
      flex-shrink:0;
    ">

      <textarea
        id="messageInput"
        rows="1"
        placeholder="Message"
        style="
          flex:1;
          resize:none;
          border:0;
          outline:none;
          border-radius:20px;
          background:#2a3942;
          color:#e9edef;
          padding:11px 15px;
          font-size:15px;
          box-sizing:border-box;
          max-height:120px;
        "
      ></textarea>

      <button
        id="sendMessage"
        style="
          width:45px;
          height:45px;
          border-radius:50%;
          border:0;
          background:#25d366;
          color:#061b13;
          font-size:19px;
          font-weight:bold;
          cursor:pointer;
          flex-shrink:0;
        "
      >
        ➤
      </button>

    </div>
  `;

  document.body.appendChild(screen);

  $("closeChat").onclick =
    closeChat;

  $("sendMessage").onclick =
    sendMessage;

  $("messageInput").addEventListener(
    "keydown",
    (event) => {

      if (
        event.key === "Enter" &&
        !event.shiftKey
      ) {

        event.preventDefault();

        sendMessage();
      }

    }
  );
}


// ============================================================
// OPEN CHAT
// ============================================================

async function openChat(member, conversationId) {

  createChatWindow();

  currentChatUser = member;

  currentConversationId =
    conversationId;

  $("jdaChatWindow").style.display =
    "flex";

  $("chatAvatar").innerHTML =
    avatarHTML(member, 42);

  $("chatName").textContent =
    member.realName || "JDA Member";

  updateChatStatus(member);

  if (unsubscribeMessages) {
    unsubscribeMessages();
    unsubscribeMessages = null;
  }

  const messagesRef =
    collection(
      db,
      "conversations",
      conversationId,
      "messages"
    );

  const q = query(
    messagesRef,
    orderBy("createdAt", "asc"),
    limit(500)
  );

  unsubscribeMessages =
    onSnapshot(
      q,
      (snap) => {

        renderMessages(
          snap.docs.map(item => ({
            id: item.id,
            ...item.data()
          }))
        );

      },
      (error) => {

        console.error(
          "Message listener error:",
          error
        );

        showMessage(
          "Unable to load messages.\n\n" +
          error.message
        );
      }
    );

  setTimeout(() => {
    $("messageInput")?.focus();
  }, 100);
}


// ============================================================
// CHAT STATUS
// ============================================================

function updateChatStatus(member) {

  const status =
    $("chatStatus");

  if (!status) return;

  if (member.isOnline) {

    status.textContent =
      "online";

    status.style.color =
      "#25d366";

  } else {

    status.textContent =
      "offline";

    status.style.color =
      "#8696a0";
  }
}


// ============================================================
// CLOSE CHAT
// ============================================================

function closeChat() {

  if (unsubscribeMessages) {

    unsubscribeMessages();

    unsubscribeMessages = null;
  }

  const windowEl =
    $("jdaChatWindow");

  if (windowEl) {
    windowEl.style.display = "none";
  }

  currentConversationId = null;
  currentChatUser = null;
}


// ============================================================
// RENDER MESSAGES
// ============================================================

function renderMessages(messages) {

  const container =
    $("messageList");

  if (!container) return;

  container.innerHTML = "";

  if (messages.length === 0) {

    container.innerHTML = `
      <div style="
        text-align:center;
        color:#8696a0;
        font-size:13px;
        margin:auto;
        padding:30px;
      ">
        🔒 Messages are stored securely
        in JDA Networks.
        <br><br>
        Start the conversation.
      </div>
    `;

    return;
  }

  messages.forEach(message => {

    const mine =
      message.senderId === currentUser.uid;

    const bubble =
      document.createElement("div");

    bubble.style.cssText = `
      align-self:${mine ? "flex-end" : "flex-start"};
      max-width:78%;
      background:${mine ? "#005c4b" : "#202c33"};
      color:#e9edef;
      padding:8px 10px 5px;
      border-radius:${mine
        ? "9px 3px 9px 9px"
        : "3px 9px 9px 9px"};
      margin-bottom:3px;
      word-wrap:break-word;
      box-shadow:0 1px 1px rgba(0,0,0,.2);
    `;

    bubble.innerHTML = `

      <div style="
        font-size:15px;
        line-height:1.35;
        white-space:pre-wrap;
      ">
        ${escapeHTML(message.text || "")}
      </div>

      <div style="
        text-align:right;
        color:#8696a0;
        font-size:10px;
        margin-top:3px;
      ">
        ${formatTime(message.createdAt)}
        ${mine ? " ✓" : ""}
      </div>
    `;

    container.appendChild(bubble);
  });

  container.scrollTop =
    container.scrollHeight;
}


// ============================================================
// SEND MESSAGE
// ============================================================

async function sendMessage() {

  if (
    !currentUser ||
    !currentConversationId ||
    !currentChatUser
  ) return;

  const input =
    $("messageInput");

  if (!input) return;

  const text =
    input.value.trim();

  if (!text) return;

  if (text.length > 5000) {

    showMessage(
      "Message is too long. Maximum is 5000 characters."
    );

    return;
  }

  input.disabled = true;

  try {

    const conversationRef =
      doc(
        db,
        "conversations",
        currentConversationId
      );

    const messageRef =
      collection(
        db,
        "conversations",
        currentConversationId,
        "messages"
      );

    await addDoc(messageRef, {

      senderId:
        currentUser.uid,

      receiverId:
        currentChatUser.id,

      text,

      createdAt:
        serverTimestamp()

    });

    await updateDoc(
      conversationRef,
      {
        lastMessage: text,
        updatedAt: serverTimestamp()
      }
    );

    input.value = "";

    input.style.height = "auto";

  } catch (error) {

    console.error(
      "Send message error:",
      error
    );

    showMessage(
      "Message could not be sent.\n\n" +
      error.message
    );

  } finally {

    input.disabled = false;

    input.focus();
  }
}


// ============================================================
// SEARCH EXISTING CHATS
// ============================================================

function setupSearch() {

  const searchInput =
    document.querySelector(
      'input[placeholder*="Search" i]'
    );

  if (!searchInput) return;

  searchInput.addEventListener(
    "input",
    async () => {

      const text =
        searchInput.value
          .trim()
          .toLowerCase();

      if (!text) {

        await renderChats();

        return;
      }

      const container =
        $("chatList") ||
        $("conversationList") ||
        $("chatsList");

      if (!container) return;

      const results = [];

      for (const conversation of conversations) {

        const person =
          await getOtherParticipant(
            conversation
          );

        if (!person) continue;

        if (
          (person.realName || "")
            .toLowerCase()
            .includes(text) ||
          (person.jdaNumber || "")
            .toLowerCase()
            .includes(text)
        ) {

          results.push({
            conversation,
            person
          });
        }
      }

      container.innerHTML = "";

      results.forEach(
        ({ conversation, person }) => {

          const row =
            document.createElement("div");

          row.style.cssText = `
            display:flex;
            align-items:center;
            gap:13px;
            padding:12px 16px;
            cursor:pointer;
          `;

          row.innerHTML = `

            ${avatarHTML(person, 52)}

            <div style="flex:1;">

              <div style="
                color:#e9edef;
                font-weight:600;
              ">
                ${escapeHTML(person.realName)}
              </div>

              <div style="
                color:#8696a0;
                font-size:13px;
              ">
                ${escapeHTML(
                  conversation.lastMessage ||
                  "Start chatting"
                )}
              </div>

            </div>
          `;

          row.onclick = () =>
            openChat(
              person,
              conversation.id
            );

          container.appendChild(row);
        }
      );
    }
  );
}


// ============================================================
// SETUP INTERFACE
// ============================================================

function setupInterface() {

  createMemberModal();

  createChatWindow();

  setupSearch();

  setupNewChatButtons();

  setupLogoutButtons();

  updateProfileUI();

  setupBottomNavigation();
}


// ============================================================
// NEW CHAT BUTTONS
// ============================================================

function setupNewChatButtons() {

  const buttons =
    document.querySelectorAll(
      "#newChatBtn, #fab, .new-chat, .fab"
    );

  buttons.forEach(button => {

    button.addEventListener(
      "click",
      (event) => {

        event.preventDefault();

        openMemberModal();
      }
    );
  });
}


// ============================================================
// LOGOUT
// ============================================================

function setupLogoutButtons() {

  const buttons =
    document.querySelectorAll(
      "#logoutBtn, .logout"
    );

  buttons.forEach(button => {

    button.addEventListener(
      "click",
      async () => {

        if (
          !confirm(
            "Log out of JDA Networks?"
          )
        ) return;

        await updateOnlineStatus(false);

        await signOut(auth);

        window.location.href =
          "./index.html";
      }
    );
  });
}


// ============================================================
// PROFILE UI
// ============================================================

function updateProfileUI() {

  if (!currentProfile) return;

  const name =
    currentProfile.realName ||
    "JDA Member";

  document
    .querySelectorAll(
      "[data-user-name], #profileName"
    )
    .forEach(el => {
      el.textContent = name;
    });

  document
    .querySelectorAll(
      "[data-jda-number], #profileJdaNumber"
    )
    .forEach(el => {
      el.textContent =
        currentProfile.jdaNumber || "";
    });

  document
    .querySelectorAll(
      "[data-user-photo], #profilePhoto"
    )
    .forEach(el => {

      const photo =
        profilePhoto(currentProfile);

      if (
        el.tagName === "IMG" &&
        photo
      ) {
        el.src = photo;
      }

    });
}


// ============================================================
// BOTTOM NAVIGATION
// ============================================================

function setupBottomNavigation() {

  const navButtons =
    document.querySelectorAll(
      "[data-page], .bottom-nav button"
    );

  navButtons.forEach(button => {

    button.addEventListener(
      "click",
      () => {

        const page =
          button.dataset.page;

        if (!page) return;

        switchPage(page);
      }
    );
  });
}


// ============================================================
// SWITCH PAGE
// ============================================================

function switchPage(page) {

  const pages =
    document.querySelectorAll(
      "[data-screen]"
    );

  if (pages.length === 0) return;

  pages.forEach(screen => {

    screen.style.display =
      screen.dataset.screen === page
        ? ""
        : "none";
  });

  document
    .querySelectorAll(
      "[data-page]"
    )
    .forEach(button => {

      button.classList.toggle(
        "active",
        button.dataset.page === page
      );

    });
}


// ============================================================
// PUBLIC FUNCTIONS
// ============================================================

window.JDA = {

  openNewChat: openMemberModal,

  openChat,

  closeChat,

  refreshMembers: async () => {

    await loadMembers();

    renderMemberResults();
  },

  refreshChats: async () => {

    await loadConversations();
  },

  logout: async () => {

    await updateOnlineStatus(false);

    await signOut(auth);

    window.location.href =
      "./index.html";
  }

};

console.log(
  "JDA Networks real Firebase app loaded."
);