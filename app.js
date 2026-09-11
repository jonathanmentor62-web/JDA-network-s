// ============================================================
// JDA NETWORKS — FIREBASE APP
// Clean chat + member directory system
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


// ============================================================
// HELPERS
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

  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(word => word[0] || "")
    .join("")
    .toUpperCase();

}


function showError(message) {

  console.error(message);

  alert(message);

}


function timestampSeconds(timestamp) {

  if (!timestamp) return 0;

  if (typeof timestamp.seconds === "number") {
    return timestamp.seconds;
  }

  if (timestamp instanceof Date) {
    return Math.floor(timestamp.getTime() / 1000);
  }

  return 0;

}


function formatTime(timestamp) {

  const seconds =
    timestampSeconds(timestamp);

  if (!seconds) return "";

  const date =
    new Date(seconds * 1000);

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });

}


function avatarHTML(profile, size = 52) {

  const name =
    profile?.realName || "JDA Member";

  const photo =
    profile?.photoURL || "";

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
    <div
      style="
        width:${size}px;
        height:${size}px;
        border-radius:50%;
        background:#26343b;
        display:flex;
        align-items:center;
        justify-content:center;
        color:#e9edef;
        font-weight:700;
        font-size:${Math.max(14, size / 2.7)}px;
        flex-shrink:0;
      "
    >
      ${escapeHTML(initials(name))}
    </div>
  `;

}


// ============================================================
// AUTHENTICATION
// ============================================================

onAuthStateChanged(auth, async user => {

  if (!user) {

    window.location.replace(
      "./index.html"
    );

    return;
  }


  currentUser = user;


  try {

    const profileRef =
      doc(db, "users", user.uid);

    const profileSnap =
      await getDoc(profileRef);


    if (!profileSnap.exists()) {

      await signOut(auth);

      window.location.replace(
        "./index.html"
      );

      return;
    }


    currentProfile = {
      id: profileSnap.id,
      ...profileSnap.data()
    };


    /*
      ONLY APPROVED MEMBERS CAN ENTER.
    */

    if (
      currentProfile.status !== "approved" &&
      currentProfile.approved !== true
    ) {

      window.location.replace(
        "./index.html"
      );

      return;
    }


    initializeApp();

  } catch (error) {

    console.error(
      "JDA authentication error:",
      error
    );

    showError(
      "JDA Networks could not load your account.\n\n" +
      error.message
    );

  }

});


// ============================================================
// INITIALIZE
// ============================================================

async function initializeApp() {

  renderProfile();

  createMemberModal();

  createChatWindow();

  setupNavigation();

  setupNewChatButtons();

  setupSearch();

  setupLogout();

  await loadMembers();

  listenForMembers();

  listenForConversations();

}


// ============================================================
// MEMBERS
// ============================================================

async function loadMembers() {

  if (!currentUser) return;


  try {

    const membersQuery =
      query(
        collection(db, "users"),
        where("status", "==", "approved")
      );


    const snapshot =
      await getDocs(membersQuery);


    members = [];


    snapshot.forEach(item => {

      if (
        item.id === currentUser.uid
      ) {
        return;
      }


      members.push({
        id: item.id,
        ...item.data()
      });

    });


    members.sort(
      (a, b) =>
        (a.realName || "")
          .localeCompare(
            b.realName || ""
          )
    );


  } catch (error) {

    console.error(
      "Member loading error:",
      error
    );

  }

}


// ============================================================
// REAL-TIME MEMBERS
// ============================================================

function listenForMembers() {

  if (unsubscribeMembers) {
    unsubscribeMembers();
  }


  const membersQuery =
    query(
      collection(db, "users"),
      where("status", "==", "approved")
    );


  unsubscribeMembers =
    onSnapshot(
      membersQuery,
      snapshot => {

        members = [];


        snapshot.forEach(item => {

          if (
            item.id === currentUser.uid
          ) {
            return;
          }


          members.push({
            id: item.id,
            ...item.data()
          });

        });


        members.sort(
          (a, b) =>
            (a.realName || "")
              .localeCompare(
                b.realName || ""
              )
        );


        renderMemberResults();

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
// CONVERSATIONS
// ============================================================

function listenForConversations() {

  if (unsubscribeConversations) {
    unsubscribeConversations();
  }


  const conversationsQuery =
    query(
      collection(db, "conversations"),
      where(
        "participantIds",
        "array-contains",
        currentUser.uid
      )
    );


  unsubscribeConversations =
    onSnapshot(
      conversationsQuery,
      async snapshot => {

        conversations =
          snapshot.docs.map(item => ({
            id: item.id,
            ...item.data()
          }));


        conversations.sort(
          (a, b) =>
            timestampSeconds(b.updatedAt) -
            timestampSeconds(a.updatedAt)
        );


        await renderChats();

      },

      error => {

        console.error(
          "Conversation listener error:",
          error
        );

      }
    );

}


// ============================================================
// FIND OTHER PERSON
// ============================================================

async function getOtherParticipant(
  conversation
) {

  const ids =
    conversation.participantIds || [];


  const otherId =
    ids.find(
      id => id !== currentUser.uid
    );


  if (!otherId) {
    return null;
  }


  const cached =
    members.find(
      member => member.id === otherId
    );


  if (cached) {
    return cached;
  }


  try {

    const snap =
      await getDoc(
        doc(db, "users", otherId)
      );


    if (!snap.exists()) {
      return null;
    }


    return {
      id: snap.id,
      ...snap.data()
    };


  } catch (error) {

    console.error(error);

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


  if (conversations.length === 0) {

    list.innerHTML = `
      <div class="empty">

        <div class="empty-icon">
          💬
        </div>

        <div class="empty-title">
          No chats yet
        </div>

        <div>
          Tap + to start a conversation
          with a JDA member.
        </div>

      </div>
    `;

    return;
  }


  for (
    const conversation of conversations
  ) {

    const person =
      await getOtherParticipant(
        conversation
      );


    if (!person) continue;


    const row =
      document.createElement("div");


    row.className =
      "jda-chat-row";


    row.style.cssText = `
      display:flex;
      align-items:center;
      gap:13px;
      padding:12px 16px;
      cursor:pointer;
      border-bottom:1px solid rgba(255,255,255,.04);
    `;


    const onlineDot =
      person.isOnline
        ? "#25d366"
        : "#667781";


    row.innerHTML = `

      ${avatarHTML(person, 52)}

      <div
        style="
          flex:1;
          min-width:0;
        "
      >

        <div
          style="
            display:flex;
            justify-content:space-between;
            gap:8px;
          "
        >

          <strong
            style="
              color:#e9edef;
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
          </strong>

          <span
            style="
              color:#8696a0;
              font-size:11px;
              white-space:nowrap;
            "
          >
            ${formatTime(
              conversation.updatedAt
            )}
          </span>

        </div>


        <div
          style="
            color:#8696a0;
            font-size:14px;
            margin-top:5px;
            white-space:nowrap;
            overflow:hidden;
            text-overflow:ellipsis;
          "
        >
          ${escapeHTML(
            conversation.lastMessage ||
            "Start chatting"
          )}
        </div>

      </div>


      <span
        style="
          width:8px;
          height:8px;
          border-radius:50%;
          background:${onlineDot};
          flex-shrink:0;
        "
      ></span>

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


    list.appendChild(row);

  }

}


// ============================================================
// MEMBER MODAL
// ============================================================

function createMemberModal() {

  if ($("jdaMemberModal")) {
    return;
  }


  const modal =
    document.createElement("div");


  modal.id =
    "jdaMemberModal";


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

    <div
      style="
        width:100%;
        max-width:700px;
        max-height:90vh;
        background:#111b21;
        border-radius:20px 20px 0 0;
        overflow:hidden;
        display:flex;
        flex-direction:column;
      "
    >

      <div
        style="
          padding:16px;
          border-bottom:1px solid #26343b;
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
            color:#e9edef;
            font-size:28px;
          "
        >
          ×
        </button>

        <strong
          style="
            font-size:19px;
            color:#e9edef;
          "
        >
          New chat
        </strong>

      </div>


      <div style="padding:12px 16px;">

        <input
          id="memberSearchInput"
          type="search"
          placeholder="Search members"
          autocomplete="off"
          style="
            width:100%;
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
        event.target === modal
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


  modal.style.display =
    "flex";


  $("memberSearchInput").value = "";


  renderMemberResults();


  setTimeout(
    () => {
      $("memberSearchInput")?.focus();
    },
    100
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
// MEMBER SEARCH RESULTS
// ============================================================

function renderMemberResults() {

  const container =
    $("memberResults");


  if (!container) return;


  const input =
    $("memberSearchInput");


  const text =
    (input?.value || "")
      .trim()
      .toLowerCase();


  const filtered =
    members.filter(member => {

      if (!text) return true;


      const name =
        (member.realName || "")
          .toLowerCase();


      const number =
        (member.jdaNumber || "")
          .toLowerCase();


      const type =
        (member.accountType || "")
          .toLowerCase();


      const className =
        (member.className || "")
          .toLowerCase();


      const stream =
        (member.stream || "")
          .toLowerCase();


      const department =
        (member.department || "")
          .toLowerCase();


      return (
        name.includes(text) ||
        number.includes(text) ||
        type.includes(text) ||
        className.includes(text) ||
        stream.includes(text) ||
        department.includes(text)
      );

    });


  container.innerHTML = "";


  if (filtered.length === 0) {

    container.innerHTML = `
      <div
        style="
          padding:35px 20px;
          text-align:center;
          color:#8696a0;
        "
      >
        No approved member found.
      </div>
    `;

    return;

  }


  filtered.forEach(member => {

    const row =
      document.createElement("div");


    row.style.cssText = `
      display:flex;
      align-items:center;
      gap:13px;
      padding:13px 18px;
      cursor:pointer;
    `;


    let info = "";


    if (
      member.accountType === "student"
    ) {

      const parts = [];


      if (member.className) {
        parts.push(
          member.className
        );
      }


      if (member.stream) {
        parts.push(
          member.stream
        );
      }


      info =
        parts.join(" • ");

    } else {

      info =
        member.department ||
        "Staff";

    }


    if (!info) {
      info =
        member.jdaNumber ||
        "JDA member";
    }


    row.innerHTML = `

      ${avatarHTML(member, 52)}

      <div
        style="
          flex:1;
          min-width:0;
        "
      >

        <div
          style="
            color:#e9edef;
            font-size:16px;
            font-weight:600;
          "
        >
          ${escapeHTML(
            member.realName ||
            "JDA Member"
          )}
        </div>


        <div
          style="
            color:#8696a0;
            font-size:13px;
            margin-top:4px;
          "
        >
          ${escapeHTML(info)}
        </div>

      </div>


      <div
        style="
          width:9px;
          height:9px;
          border-radius:50%;
          background:${
            member.isOnline
              ? "#25d366"
              : "#667781"
          };
        "
      ></div>

    `;


    row.addEventListener(
      "click",
      () => {

        closeMemberModal();

        startConversation(member);

      }
    );


    container.appendChild(row);

  });

}


// ============================================================
// START CONVERSATION
// ============================================================

async function startConversation(member) {

  if (
    !currentUser ||
    !member?.id
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


    if (!existing.exists()) {

      await setDoc(
        conversationRef,
        {
          participantIds: ids,
          createdAt:
            serverTimestamp(),
          updatedAt:
            serverTimestamp(),
          lastMessage: ""
        }
      );

    }


    await openChat(
      member,
      conversationId
    );


  } catch (error) {

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

  if ($("jdaChatWindow")) {
    return;
  }


  const windowEl =
    document.createElement("div");


  windowEl.id =
    "jdaChatWindow";


  windowEl.style.cssText = `
    position:fixed;
    inset:0;
    z-index:10000;
    background:#0b141a;
    display:none;
    flex-direction:column;
  `;


  windowEl.innerHTML = `

    <div
      style="
        height:62px;
        background:#202c33;
        display:flex;
        align-items:center;
        gap:11px;
        padding:0 10px;
        flex-shrink:0;
      "
    >

      <button
        id="closeChat"
        style="
          border:0;
          background:none;
          color:#e9edef;
          font-size:30px;
        "
      >
        ‹
      </button>


      <div id="chatAvatar"></div>


      <div
        style="
          flex:1;
          min-width:0;
        "
      >

        <div
          id="chatName"
          style="
            color:#e9edef;
            font-size:16px;
            font-weight:600;
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
        display:flex;
        flex-direction:column;
        gap:4px;
      "
    ></div>


    <div
      style="
        background:#202c33;
        padding:8px;
        display:flex;
        align-items:flex-end;
        gap:8px;
        flex-shrink:0;
      "
    >

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
          max-height:120px;
        "
      ></textarea>


      <button
        id="sendMessage"
        style="
          width:45px;
          height:45px;
          border:0;
          border-radius:50%;
          background:#25d366;
          color:#062b1d;
          font-size:18px;
          font-weight:bold;
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


  $("jdaChatWindow")
    .style.display = "flex";


  $("chatAvatar").innerHTML =
    avatarHTML(
      member,
      42
    );


  $("chatName").textContent =
    member.realName ||
    "JDA Member";


  updateChatStatus(member);


  if (unsubscribeMessages) {
    unsubscribeMessages();
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
              id: item.id,
              ...item.data()
            })
          );


        renderMessages(
          messages
        );

      },

      error => {

        console.error(
          "Message error:",
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
      $("messageInput")?.focus();
    },
    100
  );

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

function renderMessages(messages) {

  const container =
    $("messageList");


  if (!container) return;


  container.innerHTML = "";


  if (messages.length === 0) {

    container.innerHTML = `
      <div
        style="
          margin:auto;
          text-align:center;
          color:#8696a0;
          padding:30px;
          font-size:13px;
        "
      >
        🔒 Your conversation is private.
        <br><br>
        Start the conversation.
      </div>
    `;

    return;

  }


  messages.forEach(message => {

    const mine =
      message.senderId ===
      currentUser.uid;


    const bubble =
      document.createElement("div");


    bubble.style.cssText = `
      align-self:${
        mine
          ? "flex-end"
          : "flex-start"
      };
      max-width:78%;
      background:${
        mine
          ? "#005c4b"
          : "#202c33"
      };
      color:#e9edef;
      padding:8px 10px 5px;
      border-radius:${
        mine
          ? "9px 3px 9px 9px"
          : "3px 9px 9px 9px"
      };
      word-wrap:break-word;
      margin-bottom:3px;
    `;


    bubble.innerHTML = `

      <div
        style="
          font-size:15px;
          line-height:1.4;
          white-space:pre-wrap;
        "
      >
        ${escapeHTML(
          message.text || ""
        )}
      </div>


      <div
        style="
          text-align:right;
          color:#8696a0;
          font-size:10px;
          margin-top:3px;
        "
      >
        ${formatTime(
          message.createdAt
        )}
        ${mine ? " ✓" : ""}
      </div>

    `;


    container.appendChild(
      bubble
    );

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
  ) {
    return;
  }


  const input =
    $("messageInput");


  if (!input) return;


  const text =
    input.value.trim();


  if (!text) return;


  if (text.length > 5000) {

    showError(
      "Message cannot exceed 5000 characters."
    );

    return;

  }


  const sendButton =
    $("sendMessage");


  input.disabled = true;

  if (sendButton) {
    sendButton.disabled = true;
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
          serverTimestamp()
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


    input.value = "";

    input.style.height =
      "auto";


  } catch (error) {

    console.error(
      "Send message error:",
      error
    );


    showError(
      "Message could not be sent.\n\n" +
      error.message
    );


  } finally {

    input.disabled = false;

    if (sendButton) {
      sendButton.disabled = false;
    }

    input.focus();

  }

}


// ============================================================
// SEARCH
// ============================================================

function setupSearch() {

  const search =
    $("chatSearch");


  if (!search) return;


  search.addEventListener(
    "input",
    async () => {

      const text =
        search.value
          .trim()
          .toLowerCase();


      const rows =
        document.querySelectorAll(
          ".jda-chat-row"
        );


      if (!text) {

        rows.forEach(
          row => {
            row.style.display =
              "flex";
          }
        );

        return;

      }


      for (
        const row of rows
      ) {

        row.style.display =
          row.innerText
            .toLowerCase()
            .includes(text)
              ? "flex"
              : "none";

      }

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


  buttons.forEach(button => {

    button.addEventListener(
      "click",
      () => {

        switchPage(
          button.dataset.page
        );

      }
    );

  });

}


function switchPage(page) {

  document
    .querySelectorAll(
      "[data-screen]"
    )
    .forEach(screen => {

      screen.classList.toggle(
        "active",
        screen.dataset.screen === page
      );

    });


  document
    .querySelectorAll(
      ".bottom-nav [data-page]"
    )
    .forEach(button => {

      button.classList.toggle(
        "active",
        button.dataset.page === page
      );

    });


  const content =
    document.querySelector(
      ".content"
    );


  if (content) {
    content.scrollTop = 0;
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


  buttons.forEach(button => {

    button.addEventListener(
      "click",
      event => {

        event.preventDefault();

        openMemberModal();

      }
    );

  });

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

      const confirmed =
        confirm(
          "Log out of JDA Networks?"
        );


      if (!confirmed) {
        return;
      }


      try {

        await signOut(auth);

        window.location.replace(
          "./index.html"
        );

      } catch (error) {

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

  if (!currentProfile) {
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
    "";


  const photoElement =
    $("profilePhoto");


  if (photoElement) {

    if (photo) {

      photoElement.innerHTML = `
        <img
          src="${escapeHTML(photo)}"
          alt=""
          style="
            width:100%;
            height:100%;
            object-fit:cover;
            border-radius:50%;
          "
        >
      `;

    } else {

      photoElement.textContent =
        initials(name);

    }

  }


  if ($("profileName")) {

    $("profileName").textContent =
      name;

  }


  if ($("profileJdaNumber")) {

    $("profileJdaNumber").textContent =
      number;

  }


  if ($("profileEmail")) {

    $("profileEmail").textContent =
      currentProfile.email ||
      currentUser.email ||
      "—";

  }


  if ($("profileAccountType")) {

    $("profileAccountType")
      .textContent =
        currentProfile.accountType ===
        "student"
          ? "Student"
          : "Staff";

  }


  if ($("profileClass")) {

    if (
      currentProfile.accountType ===
      "student"
    ) {

      const parts = [];


      if (
        currentProfile.className
      ) {
        parts.push(
          currentProfile.className
        );
      }


      if (
        currentProfile.stream
      ) {
        parts.push(
          currentProfile.stream
        );
      }


      $("profileClass").textContent =
        parts.join(" • ") ||
        "Student";

    } else {

      $("profileClass").textContent =
        currentProfile.department ||
        "Staff";

    }

  }

}


// ============================================================
// PUBLIC API
// ============================================================

window.JDA = {

  openNewChat:
    openMemberModal,

  openChat,

  closeChat,

  refreshMembers:
    loadMembers,

  refreshChats:
    async () => {

      if (unsubscribeConversations) {
        unsubscribeConversations();
      }

      listenForConversations();

    },

  logout:
    async () => {

      await signOut(auth);

      window.location.replace(
        "./index.html"
      );

    }

};


// ============================================================
// DONE
// ============================================================

console.log(
  "JDA Networks Firebase app loaded successfully."
);