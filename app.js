// ============================================================
// JDA NETWORKS — FIREBASE APP
// WHATSAPP-STYLE CHAT SYSTEM + MEMBER DIRECTORY
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
    return Math.floor(
      timestamp.getTime() / 1000
    );
  }

  return 0;

}


function formatTime(timestamp) {

  const seconds =
    timestampSeconds(timestamp);

  if (!seconds) return "";

  const date =
    new Date(seconds * 1000);

  const now =
    new Date();

  const sameDay =
    date.toDateString() ===
    now.toDateString();

  if (sameDay) {

    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });

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

  return date.toLocaleDateString([], {
    day: "2-digit",
    month: "short"
  });

}


function getMemberClass(member) {

  return (
    member.className ||
    member.class ||
    member.studentClass ||
    ""
  );

}


function avatarHTML(profile, size = 52) {

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
        font-size:${Math.max(
          14,
          size / 2.7
        )}px;
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

onAuthStateChanged(
  auth,
  async user => {

    if (!user) {

      window.location.replace(
        "./index.html"
      );

      return;

    }


    currentUser = user;


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


      // ONLY APPROVED MEMBERS
      // CAN USE THE APP.

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

  renderProfile();

  createMemberModal();

  createChatWindow();

  setupNavigation();

  setupNewChatButtons();

  setupSearch();

  setupLogout();

  setupDirectoryButtons();

  await loadMembers();

  listenForMembers();

  listenForConversations();

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
          id: item.id,
          ...item.data()
        });

      }
    );


    sortMembers();

    renderMemberResults();

    renderDirectory();

    // Refresh chat list in case
    // members loaded after conversations.
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
        a.realName || ""
      ).localeCompare(
        b.realName || ""
      )
  );

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
              id: item.id,
              ...item.data()
            });

          }
        );


        sortMembers();

        renderMemberResults();

        renderDirectory();

        renderChats();

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

  if (unsubscribeConversations) {

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
              id: item.id,
              ...item.data()
            })
          );


        // NEWEST CONVERSATIONS FIRST

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
        member.id === otherId
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
      id: snap.id,
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
// WHATSAPP-STYLE CHAT LIST
// ============================================================

async function renderChats() {

  const list =
    $("chatList");


  if (!list) return;


  list.innerHTML = "";


  if (
    conversations.length === 0
  ) {

    const empty =
      document.createElement(
        "div"
      );


    empty.className =
      "empty";


    empty.innerHTML = `

      <div class="empty-icon">
        💬
      </div>

      <div class="empty-title">
        No chats yet
      </div>

      <div style="margin-bottom:18px;">
        Start a conversation with
        another JDA member.
      </div>

      <button
        id="emptyStartChat"
        style="
          border:0;
          border-radius:22px;
          padding:12px 22px;
          background:#25d366;
          color:#062b1d;
          font-weight:700;
          cursor:pointer;
        "
      >
        ✎ Start chatting
      </button>

    `;


    list.appendChild(
      empty
    );


    $("emptyStartChat")
      ?.addEventListener(
        "click",
        openMemberModal
      );


    return;

  }


  // Render each conversation.

  for (
    const conversation of
    conversations
  ) {

    const person =
      await getOtherParticipant(
        conversation
      );


    if (!person) {

      continue;

    }


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


    row.style.cssText = `
      display:flex;
      align-items:center;
      gap:12px;
      padding:12px 16px;
      cursor:pointer;
      min-height:72px;
      border-bottom:1px solid rgba(255,255,255,.05);
      transition:background .15s ease;
    `;


    row.onmouseenter = () => {

      row.style.background =
        "rgba(255,255,255,.04)";

    };


    row.onmouseleave = () => {

      row.style.background =
        "transparent";

    };


    const onlineDot =
      person.isOnline
        ? "#25d366"
        : "#667781";


    const lastMessage =
      conversation.lastMessage ||
      "Start chatting";


    const lastTime =
      formatTime(
        conversation.updatedAt
      );


    row.innerHTML = `

      <div
        style="
          position:relative;
          width:52px;
          height:52px;
          flex-shrink:0;
        "
      >

        ${avatarHTML(
          person,
          52
        )}

        <span
          style="
            position:absolute;
            right:0;
            bottom:1px;
            width:12px;
            height:12px;
            border-radius:50%;
            background:${onlineDot};
            border:2px solid #111b21;
          "
        ></span>

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
            justify-content:space-between;
            align-items:center;
            gap:8px;
          "
        >

          <strong
            style="
              color:#e9edef;
              font-size:16px;
              font-weight:500;
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
              flex-shrink:0;
            "
          >
            ${escapeHTML(
              lastTime
            )}
          </span>

        </div>


        <div
          style="
            display:flex;
            align-items:center;
            margin-top:5px;
            gap:5px;
          "
        >

          <span
            style="
              color:#8696a0;
              font-size:14px;
              white-space:nowrap;
              overflow:hidden;
              text-overflow:ellipsis;
              display:block;
              flex:1;
            "
          >
            ${escapeHTML(
              lastMessage
            )}
          </span>

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


    list.appendChild(
      row
    );

  }

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
    background:rgba(0,0,0,.75);
    display:none;
    align-items:flex-end;
    justify-content:center;
  `;


  modal.innerHTML = `

    <div
      style="
        width:100%;
        max-width:700px;
        max-height:92vh;
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
            color:#e9edef;
          "
        >
          New chat
        </strong>

      </div>


      <div
        style="
          padding:12px 16px;
        "
      >

        <input
          id="memberSearchInput"
          type="search"
          placeholder="Search approved members"
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
        style="
          padding:0 16px 8px;
          color:#8696a0;
          font-size:12px;
        "
      >
        Select a JDA member to start chatting.
      </div>


      <div
        id="memberResults"
        style="
          overflow-y:auto;
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


  const input =
    $("memberSearchInput");


  const text =
    (
      input?.value ||
      ""
    )
      .trim()
      .toLowerCase();


  const filtered =
    members.filter(
      member => {

        if (!text) {

          return true;

        }


        const name =
          (
            member.realName ||
            ""
          ).toLowerCase();


        const number =
          (
            member.jdaNumber ||
            ""
          ).toLowerCase();


        const type =
          (
            member.accountType ||
            ""
          ).toLowerCase();


        const className =
          getMemberClass(
            member
          ).toLowerCase();


        const stream =
          (
            member.stream ||
            ""
          ).toLowerCase();


        const department =
          (
            member.department ||
            ""
          ).toLowerCase();


        return (
          name.includes(text) ||
          number.includes(text) ||
          type.includes(text) ||
          className.includes(text) ||
          stream.includes(text) ||
          department.includes(text)
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
          color:#8696a0;
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


      row.style.cssText = `
        display:flex;
        align-items:center;
        gap:13px;
        padding:13px 18px;
        cursor:pointer;
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
          "JDA member";

      }


      row.innerHTML = `

        ${avatarHTML(
          member,
          52
        )}

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
            ${escapeHTML(
              info
            )}
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


    // Check whether this chat already exists.

    const existing =
      await getDoc(
        conversationRef
      );


    // Create the conversation
    // if it does not exist.

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


    // Open the conversation.

    await openChat(
      member,
      conversationId
    );


    // Immediately refresh the Chats tab.
    // The realtime listener will also update it.

    setTimeout(
      () => {

        renderChats();

      },
      100
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
          width:40px;
          height:45px;
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
          box-sizing:border-box;
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


  // Automatically grow the message box.

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
    .style.display =
      "flex";


  $("chatAvatar").innerHTML =
    avatarHTML(
      member,
      42
    );


  $("chatName").textContent =
    member.realName ||
    "JDA Member";


  updateChatStatus(
    member
  );


  if (
    unsubscribeMessages
  ) {

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

      $("messageInput")
        ?.focus();

    },
    100
  );

}


// ============================================================
// CHAT STATUS
// ============================================================

function updateChatStatus(
  member
) {

  const status =
    $("chatStatus");


  if (!status) return;


  if (member.isOnline) {

    status.textContent =
      "online";

    status.style.color =
      "#25d366";

  }
  else {

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


  messages.forEach(
    message => {

      const mine =
        message.senderId ===
        currentUser.uid;


      const bubble =
        document.createElement(
          "div"
        );


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
            message.text ||
            ""
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

    }
  );


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


    // First save the message.

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


    // Then update the conversation preview.

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


    // Make sure the chat list refreshes.

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

      button.onclick =
        event => {

          event.preventDefault();

          event.stopPropagation();

          openMemberModal();

        };

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

          const name =
            row.dataset.name ||
            "";


          const content =
            row.innerText
              .toLowerCase();


          row.style.display =
            !text ||
            name.includes(text) ||
            content.includes(text)
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

  document
    .querySelectorAll(
      "[data-screen]"
    )
    .forEach(
      screen => {

        screen.classList.toggle(
          "active",
          screen.dataset.screen ===
          page
        );

      }
    );


  document
    .querySelectorAll(
      ".bottom-nav [data-page]"
    )
    .forEach(
      button => {

        button.classList.toggle(
          "active",
          button.dataset.page ===
          page
        );

      }
    );


  // Refresh the chat list whenever
  // the Chats tab is opened.

  if (
    page === "chats"
  ) {

    renderChats();

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
                "students"
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


            const number =
              className.replace(
                "Form ",
                ""
              );


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


    const className =
      "Form " +
      number;


    renderClassMembers(
      className,
      box
    );

  }


  renderStaff();

}


// ============================================================
// RENDER CLASS MEMBERS
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

      <div class="class-members-empty">
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
        border-bottom:1px solid rgba(255,255,255,.05);
      `;


      row.innerHTML = `

        ${avatarHTML(
          member,
          42
        )}

        <div
          style="
            flex:1;
            min-width:0;
          "
        >

          <div
            style="
              font-weight:600;
              color:#e9edef;
              font-size:14px;
            "
          >
            ${escapeHTML(
              member.realName
            )}
          </div>

          <div
            style="
              color:#8696a0;
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
// RENDER STAFF
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

      <div class="staff-card">

        <div class="staff-title">
          No approved staff yet
        </div>

        <div class="staff-description">
          Approved staff members will
          appear here.
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
      `;


      card.innerHTML = `

        ${avatarHTML(
          member,
          48
        )}

        <div
          style="
            flex:1;
          "
        >

          <div
            class="staff-title"
          >
            ${escapeHTML(
              member.realName
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

    $("profileJdaNumber").textContent =
      number;

  }


  if (
    $("profileEmail")
  ) {

    $("profileEmail").textContent =
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
// PUBLIC API
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

  logout:
    async () => {

      await signOut(
        auth
      );


      window.location.replace(
        "./index.html"
      );

    }

};


// ============================================================
// DONE
// ============================================================

console.log(
  "JDA Networks — WhatsApp-style chat system loaded."
);