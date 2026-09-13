/* =========================================================
   jChat
   Firebase Auth + Firestore + WebRTC
   Production-oriented client engine
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
   WEBRTC
   ========================================================= */

const METERED_TURN_USERNAME = "3e34f2edd42777aac34b9a4f";
const METERED_TURN_CREDENTIAL = "hSQcaWCgT3jN4xUe";

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

let currentConversation = null;
let currentPeer = null;

let unsubscribeMessages = null;
let unsubscribeMembers = null;
let unsubscribeConversations = null;
let unsubscribeIncomingCalls = null;
let unsubscribeCurrentCall = null;
let unsubscribeCandidates = null;

let peerConnection = null;
let localStream = null;
let remoteStream = null;

let currentCall = null;

let pendingIceCandidates = [];
let remoteDescriptionReady = false;

let appStarted = false;


/* =========================================================
   HELPERS
   ========================================================= */

const $ = id => document.getElementById(id);

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const safe = escapeHTML;


function initials(name = "User") {
  const clean = String(name).trim();

  if (!clean) return "U";

  const parts = clean.split(/\s+/);

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


function formatRelative(timestamp) {
  if (!timestamp) return "";

  try {
    const date =
      typeof timestamp.toDate === "function"
        ? timestamp.toDate()
        : new Date(timestamp);

    const diff =
      (Date.now() - date.getTime()) / 1000;

    if (diff < 60) return "now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d`;

    return date.toLocaleDateString();
  } catch {
    return "";
  }
}


function getPhoto(profile) {
  return (
    profile?.photoURL ||
    profile?.profilePhoto ||
    ""
  );
}


function showToast(message) {
  if (window.jChatUI?.showToast) {
    window.jChatUI.showToast(message);
    return;
  }

  const toast = $("toast");

  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 2500);
}


function findMember(uid) {
  return members.find(
    member => member.uid === uid
  );
}


/* =========================================================
   AUTH
   ========================================================= */

onAuthStateChanged(auth, async user => {

  if (!user) {

    currentUser = null;
    currentProfile = null;

    stopAllListeners();

    return;
  }

  currentUser = user;

  await startApp();
});


/* =========================================================
   APP START
   ========================================================= */

async function startApp() {

  if (appStarted) {
    applyProfileToUI();
    return;
  }

  appStarted = true;

  try {

    const userRef =
      doc(db, "users", currentUser.uid);

    const snap =
      await getDoc(userRef);


    if (!snap.exists()) {

      currentProfile = {
        uid: currentUser.uid,
        realName:
          currentUser.displayName ||
          currentUser.phoneNumber ||
          "jChat User",
        phoneNumber:
          currentUser.phoneNumber || "",
        photoURL:
          currentUser.photoURL || "",
        about:
          "Hey there! I am using jChat."
      };

      // Create the missing profile safely.
      await setDoc(
        userRef,
        {
          ...currentProfile,
          isOnline: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );

    } else {

      currentProfile = {
        uid: currentUser.uid,
        ...snap.data()
      };

    }


    applyProfileToUI();

    await setOnlineStatus(true);

    startMembersListener();
    startConversationsListener();
    startIncomingCallListener();

    window.addEventListener(
      "beforeunload",
      handleBeforeUnload
    );

  } catch (error) {

    console.error(
      "jChat start error:",
      error
    );

    appStarted = false;

    showToast(
      "Unable to load jChat."
    );
  }
}


/* =========================================================
   STOP LISTENERS
   ========================================================= */

function stopAllListeners() {

  unsubscribeMembers?.();
  unsubscribeConversations?.();
  unsubscribeMessages?.();
  unsubscribeIncomingCalls?.();
  unsubscribeCurrentCall?.();
  unsubscribeCandidates?.();

  unsubscribeMembers = null;
  unsubscribeConversations = null;
  unsubscribeMessages = null;
  unsubscribeIncomingCalls = null;
  unsubscribeCurrentCall = null;
  unsubscribeCandidates = null;

  appStarted = false;
}


/* =========================================================
   PROFILE UI
   ========================================================= */

function applyProfileToUI() {

  const name =
    currentProfile?.realName ||
    "jChat User";

  const about =
    currentProfile?.about ||
    "Hey there! I am using jChat.";

  const photo =
    getPhoto(currentProfile);


  const nameElement =
    $("profileName");

  const aboutElement =
    $("profileAbout");

  const avatarElement =
    $("profileAvatar");


  if (nameElement) {
    nameElement.textContent = name;
  }

  if (aboutElement) {
    aboutElement.textContent = about;
  }


  if (avatarElement) {

    if (photo) {

      avatarElement.innerHTML = `
        <img
          src="${safe(photo)}"
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

      avatarElement.textContent =
        initials(name);

    }
  }
}


/* =========================================================
   ONLINE STATUS
   ========================================================= */

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
      {
        merge: true
      }
    );

  } catch (error) {

    console.error(
      "Online status:",
      error
    );
  }
}


function handleBeforeUnload() {

  // Firestore network writes during beforeunload
  // are not guaranteed, but we still attempt it.
  setOnlineStatus(false);
}


/* =========================================================
   LOGOUT
   ========================================================= */

async function logoutUser() {

  try {

    await setOnlineStatus(false);

    await signOut(auth);

    stopAllListeners();

    location.href = "index.html";

  } catch (error) {

    console.error(error);

    showToast(
      "Could not log out."
    );
  }
}


/* =========================================================
   MEMBERS
   ========================================================= */

function startMembersListener() {

  if (!currentUser) return;

  unsubscribeMembers?.();


  unsubscribeMembers = onSnapshot(

    query(
      collection(db, "users"),
      orderBy("realName")
    ),

    snapshot => {

      members =
        snapshot.docs.map(docSnap => ({
          uid: docSnap.id,
          ...docSnap.data()
        }));

      renderChatList();
      renderContacts();

      if (currentPeer) {

        const updatedPeer =
          findMember(currentPeer.uid);

        if (updatedPeer) {
          currentPeer = updatedPeer;
        }
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
   CONVERSATIONS
   ========================================================= */

function startConversationsListener() {

  if (!currentUser) return;

  unsubscribeConversations?.();


  unsubscribeConversations = onSnapshot(

    query(
      collection(db, "conversations"),
      where(
        "participantIds",
        "array-contains",
        currentUser.uid
      )
    ),

    snapshot => {

      conversations =
        snapshot.docs
          .map(docSnap => ({
            id: docSnap.id,
            ...docSnap.data()
          }))
          .sort((a, b) => {

            const aTime =
              a.lastMessageAt?.toMillis?.() || 0;

            const bTime =
              b.lastMessageAt?.toMillis?.() || 0;

            return bTime - aTime;
          });


      renderChatList();

      if (
        currentConversation &&
        !conversations.some(
          c =>
            c.id ===
            currentConversation.id
        )
      ) {

        currentConversation = null;
        currentPeer = null;
      }
    },

    error => {

      console.error(
        "Conversations listener:",
        error
      );
    }
  );
}


/* =========================================================
   CHAT LIST
   ========================================================= */

function renderChatList() {

  const list =
    $("chatList");

  const empty =
    $("emptyChats");

  if (!list) return;


  const rows =
    conversations.filter(
      conversation =>
        conversation.lastMessage ||
        conversation.lastMessageAt
    );


  if (!rows.length) {

    list.innerHTML = "";

    if (empty) {
      empty.style.display = "block";
    }

    return;
  }


  if (empty) {
    empty.style.display = "none";
  }


  list.innerHTML =
    rows.map(conversation => {

      const otherId =
        (conversation.participantIds || [])
          .find(
            id => id !== currentUser.uid
          );


      const other =
        findMember(otherId);


      const name =
        other?.realName ||
        "jChat User";

      const photo =
        getPhoto(other);

      const avatarInitials =
        initials(name);


      const onlineDot =
        other?.isOnline
          ? `<span class="onlineDot"></span>`
          : "";


      const avatar =
        photo
          ? `
            <div class="avatar">
              <img
                src="${safe(photo)}"
                alt=""
              >
              ${onlineDot}
            </div>
          `
          : `
            <div class="avatar">
              ${avatarInitials}
              ${onlineDot}
            </div>
          `;


      const preview =
        safe(
          conversation.lastMessage ||
          "Tap to start chatting"
        );


      const time =
        formatRelative(
          conversation.lastMessageAt
        ) ||
        formatTime(
          conversation.lastMessageAt
        );


      const unread =
        Number(
          conversation.unreadCount?.[
            currentUser.uid
          ] || 0
        );


      const badge =
        unread > 0
          ? `<span class="unreadBadge">${unread}</span>`
          : "";


      return `
        <div
          class="chatItem"
          data-conversation-id="${safe(conversation.id)}"
          data-other-id="${safe(otherId || "")}"
        >

          ${avatar}

          <div class="chatInfo">

            <div class="chatTop">

              <div class="chatName">
                ${safe(name)}
              </div>

              <div class="chatTime">
                ${safe(time)}
              </div>

            </div>


            <div class="chatBottom">

              <div class="lastMessage">
                ${preview}
              </div>

              ${badge}

            </div>

          </div>

        </div>
      `;

    }).join("");


  list
    .querySelectorAll(
      "[data-conversation-id]"
    )
    .forEach(item => {

      item.addEventListener(
        "click",
        async () => {

          const conversation =
            conversations.find(
              c =>
                c.id ===
                item.dataset.conversationId
            );


          const other =
            findMember(
              item.dataset.otherId
            );


          if (
            conversation &&
            other
          ) {

            await openConversation(
              conversation,
              other
            );
          }
        }
      );
    });
}


/* =========================================================
   OPEN CHAT
   ========================================================= */

async function openConversation(
  conversation,
  otherMember
) {

  currentConversation =
    conversation;

  currentPeer =
    otherMember;


  if (window.jChatUI?.openChat) {

    window.jChatUI.openChat({
      name:
        otherMember.realName ||
        "jChat User",

      status:
        otherMember.isOnline
          ? "Online • Active now"
          : "Offline",

      initials:
        initials(
          otherMember.realName
        ),

      photoURL:
        getPhoto(otherMember)
    });

  }


  listenToMessages(
    conversation.id
  );

  await markConversationRead(
    conversation
  );
}


/* =========================================================
   MESSAGES LISTENER
   ========================================================= */

function listenToMessages(
  conversationId
) {

  unsubscribeMessages?.();


  unsubscribeMessages =
    onSnapshot(

      query(
        collection(
          db,
          "conversations",
          conversationId,
          "messages"
        ),
        orderBy(
          "createdAt",
          "asc"
        )
      ),

      snapshot => {

        const messages =
          snapshot.docs.map(
            docSnap => ({
              id: docSnap.id,
              ...docSnap.data()
            })
          );

        renderMessages(messages);
      },

      error => {

        console.error(
          "Messages:",
          error
        );
      }
    );
}


/* =========================================================
   MARK CONVERSATION READ
   ========================================================= */

async function markConversationRead(
  conversation
) {

  if (!conversation || !currentUser) {
    return;
  }


  const currentUnread =
    Number(
      conversation.unreadCount?.[
        currentUser.uid
      ] || 0
    );


  if (!currentUnread) {
    return;
  }


  const updatedUnread = {
    ...(conversation.unreadCount || {})
  };

  updatedUnread[currentUser.uid] = 0;


  try {

    await updateDoc(
      doc(
        db,
        "conversations",
        conversation.id
      ),
      {
        unreadCount: updatedUnread
      }
    );

  } catch (error) {

    console.error(
      "Mark read:",
      error
    );
  }
}


/* =========================================================
   RENDER MESSAGES
   ========================================================= */

function renderMessages(
  messages
) {

  const area =
    $("messagesArea");

  if (!area) return;


  if (!messages.length) {

    area.innerHTML = `
      <div
        style="
          text-align:center;
          color:#8c91aa;
          font-size:13px;
          padding:40px 20px;
        "
      >
        No messages yet. Say hi 👋
      </div>
    `;

    return;
  }


  area.innerHTML =
    messages.map(message => {

      const mine =
        message.senderId ===
        currentUser.uid;

      const rowClass =
        mine
          ? "outgoing"
          : "incoming";


      const ticks =
        mine
          ? `
            <span class="seenTicks">
              ${message.read ? "✓✓" : "✓"}
            </span>
          `
          : "";


      return `
        <div
          class="messageRow ${rowClass}"
        >

          <div class="messageBubble">

            <div class="messageText">
              ${safe(message.text || "")}
            </div>

            <div class="messageMeta">
              ${ticks}
              ${safe(formatTime(message.createdAt))}
            </div>

          </div>

        </div>
      `;

    }).join("");


  requestAnimationFrame(() => {
    area.scrollTop =
      area.scrollHeight;
  });
}


/* =========================================================
   SEND MESSAGE
   ========================================================= */

document.addEventListener(
  "jchat-send-message",
  async event => {

    const text =
      (event.detail?.text || "")
        .trim();


    if (
      !text ||
      !currentConversation ||
      !currentPeer ||
      !currentUser
    ) {
      return;
    }


    try {

      const conversationRef =
        doc(
          db,
          "conversations",
          currentConversation.id
        );


      const unread =
        {
          ...(currentConversation.unreadCount || {})
        };


      unread[currentPeer.uid] =
        Number(
          unread[currentPeer.uid] || 0
        ) + 1;


      await addDoc(

        collection(
          db,
          "conversations",
          currentConversation.id,
          "messages"
        ),

        {
          senderId:
            currentUser.uid,

          receiverId:
            currentPeer.uid,

          text,

          createdAt:
            serverTimestamp(),

          read: false
        }
      );


      await updateDoc(
        conversationRef,
        {
          lastMessage: text,
          lastMessageAt:
            serverTimestamp(),
          updatedAt:
            serverTimestamp(),
          unreadCount: unread
        }
      );


      document.dispatchEvent(
        new CustomEvent(
          "jchat-message-sent"
        )
      );


    } catch (error) {

      console.error(
        "Send message:",
        error
      );

      showToast(
        "Message could not be sent."
      );
    }
  }
);


/* =========================================================
   CONTACTS
   ========================================================= */

function renderContacts() {

  const list =
    $("contactList");

  if (!list) return;


  const others =
    members.filter(
      member =>
        member.uid !==
        currentUser.uid
    );


  if (!others.length) {

    list.innerHTML = `
      <div
        style="
          text-align:center;
          color:#8c91aa;
          padding:40px 20px;
          font-size:13px;
        "
      >
        No contacts yet.
      </div>
    `;

    return;
  }


  list.innerHTML =
    others.map(member => {

      const photo =
        getPhoto(member);


      const avatar =
        photo
          ? `
            <div class="avatar">
              <img
                src="${safe(photo)}"
                alt=""
              >
            </div>
          `
          : `
            <div class="avatar">
              ${initials(member.realName)}
            </div>
          `;


      return `
        <div
          class="contactItem"
          data-member-id="${safe(member.uid)}"
        >

          ${avatar}

          <div class="contactInfo">

            <div class="contactName">
              ${safe(member.realName || "")}
            </div>

            <div class="contactAbout">
              ${safe(
                member.about ||
                "Hey there! I am using jChat."
              )}
            </div>

          </div>

        </div>
      `;

    }).join("");


  list
    .querySelectorAll(
      "[data-member-id]"
    )
    .forEach(item => {

      item.addEventListener(
        "click",
        async () => {

          const member =
            findMember(
              item.dataset.memberId
            );


          if (!member) return;


          const conversation =
            await getOrCreateConversation(
              member.uid
            );


          await openConversation(
            conversation,
            member
          );
        }
      );
    });
}


/* =========================================================
   GET / CREATE CONVERSATION
   ========================================================= */

async function getOrCreateConversation(
  otherId
) {

  if (!currentUser || !otherId) {
    throw new Error(
      "Invalid conversation users."
    );
  }


  const ids = [
    currentUser.uid,
    otherId
  ].sort();


  const existing =
    conversations.find(
      conversation => {

        const participants =
          conversation.participantIds || [];


        return (
          participants.length === 2 &&
          participants[0] === ids[0] &&
          participants[1] === ids[1]
        );
      }
    );


  if (existing) {
    return existing;
  }


  // Double-check Firestore before creating.
  const snapshot =
    await getDocs(
      query(
        collection(db, "conversations"),
        where(
          "participantIds",
          "==",
          ids
        )
      )
    );


  if (!snapshot.empty) {

    const existingDoc =
      snapshot.docs[0];

    return {
      id: existingDoc.id,
      ...existingDoc.data()
    };
  }


  const conversationRef =
    await addDoc(
      collection(db, "conversations"),
      {
        participantIds: ids,
        createdAt:
          serverTimestamp(),
        updatedAt:
          serverTimestamp(),
        lastMessage: "",
        lastMessageAt:
          null,
        unreadCount: {
          [ids[0]]: 0,
          [ids[1]]: 0
        }
      }
    );


  return {
    id: conversationRef.id,
    participantIds: ids,
    unreadCount: {
      [ids[0]]: 0,
      [ids[1]]: 0
    }
  };
}


/* =========================================================
   CALL HISTORY
   ========================================================= */

async function loadCallHistory() {

  const container =
    $("callHistory");

  if (!container || !currentUser) {
    return;
  }


  try {

    const snapshot =
      await getDocs(
        query(
          collection(db, "calls"),
          where(
            "participantIds",
            "array-contains",
            currentUser.uid
          ),
          orderBy(
            "createdAt",
            "desc"
          ),
          limit(50)
        )
      );


    const calls =
      snapshot.docs.map(
        docSnap => ({
          id: docSnap.id,
          ...docSnap.data()
        })
      );


    const empty =
      $("emptyCalls");


    if (!calls.length) {

      container.innerHTML = "";

      if (empty) {
        empty.style.display = "block";
      }

      return;
    }


    if (empty) {
      empty.style.display = "none";
    }


    container.innerHTML =
      calls.map(call => {

        const otherId =
          call.callerId === currentUser.uid
            ? call.calleeId
            : call.callerId;


        const member =
          findMember(otherId);


        const name =
          member?.realName ||
          "jChat User";


        const icon =
          call.type === "video"
            ? "🎥"
            : "📞";


        return `
          <div class="callItem">

            <div class="avatar">
              ${icon}
            </div>

            <div class="callDetails">

              <div class="callName">
                ${safe(name)}
              </div>

              <div class="callMeta">
                ${safe(call.status || "")}
                •
                ${safe(formatTime(call.createdAt))}
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

    showToast(
      "Could not load call history."
    );
  }
}


/* =========================================================
   WEBRTC — PEER CONNECTION
   ========================================================= */

async function createPeerConnection() {

  if (peerConnection) {
    return peerConnection;
  }


  peerConnection =
    new RTCPeerConnection(
      RTC_CONFIG
    );


  remoteDescriptionReady = false;
  pendingIceCandidates = [];


  peerConnection.onconnectionstatechange =
    () => {

      if (!peerConnection) return;

      const state =
        peerConnection.connectionState;


      if (state === "connected") {

        $("callStatus") &&
          ($("callStatus").textContent =
            "Connected");

      }


      if (
        state === "failed"
      ) {

        showToast(
          "Call connection failed."
        );

        cleanupCall();
      }


      if (
        state === "closed"
      ) {

        cleanupCall();
      }
    };


  peerConnection.oniceconnectionstatechange =
    () => {

      if (!peerConnection) return;

      const state =
        peerConnection.iceConnectionState;

      console.log(
        "ICE:",
        state
      );
    };


  return peerConnection;
}


/* =========================================================
   ADD REMOTE ICE SAFELY
   ========================================================= */

async function addRemoteCandidate(
  candidate
) {

  if (!peerConnection || !candidate) {
    return;
  }


  if (!remoteDescriptionReady) {

    pendingIceCandidates.push(
      candidate
    );

    return;
  }


  try {

    await peerConnection.addIceCandidate(
      new RTCIceCandidate(candidate)
    );

  } catch (error) {

    console.error(
      "ICE candidate:",
      error
    );
  }
}


async function flushPendingCandidates() {

  if (!peerConnection) return;

  if (!remoteDescriptionReady) return;


  const pending =
    [...pendingIceCandidates];

  pendingIceCandidates = [];


  for (const candidate of pending) {

    try {

      await peerConnection.addIceCandidate(
        new RTCIceCandidate(candidate)
      );

    } catch (error) {

      console.error(
        "Pending ICE:",
        error
      );
    }
  }
}


/* =========================================================
   LISTEN TO CANDIDATES
   ========================================================= */

function listenToCandidates(
  callId
) {

  unsubscribeCandidates?.();


  unsubscribeCandidates =
    onSnapshot(

      query(
        collection(
          db,
          "calls",
          callId,
          "candidates"
        ),
        orderBy(
          "createdAt",
          "asc"
        )
      ),

      async snapshot => {

        for (
          const change
          of snapshot.docChanges()
        ) {

          if (
            change.type !==
            "added"
          ) {
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


          await addRemoteCandidate(
            data.candidate
          );
        }
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
   WEBRTC — OUTGOING CALL
   ========================================================= */

async function startCall(
  member,
  type
) {

  if (
    !currentUser ||
    !member
  ) {
    return;
  }


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
          callerId:
            currentUser.uid,

          calleeId:
            member.uid,

          participantIds: [
            currentUser.uid,
            member.uid
          ],

          type,

          status:
            "ringing",

          createdAt:
            serverTimestamp()
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
      await navigator.mediaDevices
        .getUserMedia({
          audio: true,
          video:
            type === "video"
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

        if (!event.candidate) {
          return;
        }


        try {

          await addDoc(
            collection(
              db,
              "calls",
              callRef.id,
              "candidates"
            ),
            {
              senderId:
                currentUser.uid,

              candidate:
                event.candidate.toJSON(),

              createdAt:
                serverTimestamp()
            }
          );

        } catch (error) {

          console.error(
            "Send ICE:",
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


        const stream =
          event.streams?.[0];


        if (stream) {

          stream
            .getTracks()
            .forEach(track => {

              if (
                !remoteStream
                  .getTracks()
                  .some(
                    t =>
                      t.id ===
                      track.id
                  )
              ) {

                remoteStream.addTrack(
                  track
                );
              }
            });

        } else {

          remoteStream.addTrack(
            event.track
          );
        }


        const video =
          $("remoteVideo");


        if (video) {
          video.srcObject =
            remoteStream;
        }
      };


    const offer =
      await peerConnection
        .createOffer();


    await peerConnection
      .setLocalDescription(
        offer
      );


    await updateDoc(
      callRef,
      {
        offer: {
          type:
            offer.type,

          sdp:
            offer.sdp
        }
      }
    );


    listenToCallChanges(
      callRef.id,
      member,
      true
    );


    listenToCandidates(
      callRef.id
    );


  } catch (error) {

    console.error(
      "startCall:",
      error
    );

    await cleanupCall();

    showToast(
      "Could not start the call."
    );
  }
}


/* =========================================================
   CALL CHANGES
   ========================================================= */

function listenToCallChanges(
  callId,
  member,
  outgoing
) {

  unsubscribeCurrentCall?.();


  unsubscribeCurrentCall =
    onSnapshot(
      doc(db, "calls", callId),

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
          !peerConnection
            .currentRemoteDescription
        ) {

          try {

            await peerConnection
              .setRemoteDescription(
                new RTCSessionDescription(
                  data.answer
                )
              );


            remoteDescriptionReady =
              true;


            await flushPendingCandidates();


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
          data.status ===
          "rejected"
        ) {

          showToast(
            "Call rejected."
          );

          await cleanupCall();

          return;
        }


        if (
          data.status ===
          "ended"
        ) {

          await cleanupCall();

          return;
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
   INCOMING CALLS
   ========================================================= */

function startIncomingCallListener() {

  if (!currentUser) return;

  unsubscribeIncomingCalls?.();


  unsubscribeIncomingCalls =
    onSnapshot(

      query(
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
      ),

      snapshot => {

        snapshot
          .docChanges()
          .forEach(change => {

            if (
              change.type !==
              "added"
            ) {
              return;
            }


            if (peerConnection) {
              return;
            }


            const data =
              change.doc.data();


            const member =
              findMember(
                data.callerId
              );


            if (!member) {
              return;
            }


            currentCall = {
              id: change.doc.id,
              callerId:
                data.callerId,
              calleeId:
                data.calleeId,
              type:
                data.type,
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
   ACCEPT INCOMING CALL
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


    if (
      data.status !==
      "ringing"
    ) {
      return;
    }


    await createPeerConnection();


    localStream =
      await navigator.mediaDevices
        .getUserMedia({
          audio: true,
          video:
            currentCall.type ===
            "video"
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
      currentCall.type ===
      "video"
    ) {

      showLocalVideo();
    }


    peerConnection.onicecandidate =
      async event => {

        if (!event.candidate) {
          return;
        }


        try {

          await addDoc(
            collection(
              db,
              "calls",
              currentCall.id,
              "candidates"
            ),
            {
              senderId:
                currentUser.uid,

              candidate:
                event.candidate.toJSON(),

              createdAt:
                serverTimestamp()
            }
          );

        } catch (error) {

          console.error(
            "Incoming ICE:",
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


        const stream =
          event.streams?.[0];


        if (stream) {

          stream
            .getTracks()
            .forEach(track => {

              if (
                !remoteStream
                  .getTracks()
                  .some(
                    t =>
                      t.id ===
                      track.id
                  )
              ) {

                remoteStream.addTrack(
                  track
                );
              }
            });

        } else {

          remoteStream.addTrack(
            event.track
          );
        }


        const video =
          $("remoteVideo");


        if (video) {
          video.srcObject =
            remoteStream;
        }
      };


    if (!data.offer) {

      throw new Error(
        "Call offer missing."
      );
    }


    await peerConnection
      .setRemoteDescription(
        new RTCSessionDescription(
          data.offer
        )
      );


    remoteDescriptionReady =
      true;


    await flushPendingCandidates();


    const answer =
      await peerConnection
        .createAnswer();


    await peerConnection
      .setLocalDescription(
        answer
      );


    await updateDoc(
      callRef,
      {
        answer: {
          type:
            answer.type,

          sdp:
            answer.sdp
        },

        status:
          "accepted"
      }
    );


    const member =
      findMember(
        currentCall.callerId
      );


    showCallOverlay(
      member || {
        realName:
          "jChat User"
      },
      currentCall.type,
      "Connected"
    );


    showActiveCallControls();


    listenToCallChanges(
      currentCall.id,
      member || {
        realName:
          "jChat User"
      },
      false
    );


    listenToCandidates(
      currentCall.id
    );


  } catch (error) {

    console.error(
      "Accept call:",
      error
    );

    await rejectIncomingCall();
  }
}


/* =========================================================
   REJECT
   ========================================================= */

async function rejectIncomingCall() {

  if (!currentCall) {
    return;
  }


  try {

    await updateDoc(
      doc(
        db,
        "calls",
        currentCall.id
      ),
      {
        status:
          "rejected"
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

  const call =
    currentCall;


  if (call) {

    try {

      await updateDoc(
        doc(
          db,
          "calls",
          call.id
        ),
        {
          status:
            "ended"
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

  unsubscribeCurrentCall?.();
  unsubscribeCandidates?.();

  unsubscribeCurrentCall = null;
  unsubscribeCandidates = null;


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


  pendingIceCandidates = [];
  remoteDescriptionReady = false;

  currentCall = null;


  const overlay =
    $("callOverlay");

  if (overlay) {
    overlay.classList.remove("show");
  }


  const localVideo =
    $("localVideo");

  const remoteVideo =
    $("remoteVideo");


  if (localVideo) {
    localVideo.srcObject = null;
  }


  if (remoteVideo) {
    remoteVideo.srcObject = null;
  }
}


/* =========================================================
   CALL UI
   ========================================================= */

function showCallOverlay(
  member,
  type,
  status
) {

  const overlay =
    $("callOverlay");

  if (!overlay) return;


  overlay.classList.add(
    "show"
  );


  const name =
    $("callName");

  const callStatus =
    $("callStatus");


  if (name) {
    name.textContent =
      member.realName ||
      "jChat User";
  }


  if (callStatus) {
    callStatus.textContent =
      status;
  }


  const localVideo =
    $("localVideo");

  const remoteVideo =
    $("remoteVideo");


  const isVideo =
    type === "video";


  if (localVideo) {
    localVideo.style.display =
      isVideo
        ? "block"
        : "none";
  }


  if (remoteVideo) {
    remoteVideo.style.display =
      isVideo
        ? "block"
        : "none";
  }
}


function showIncomingCall(
  member,
  type
) {

  showCallOverlay(
    member,
    type,
    type === "video"
      ? "Incoming video call"
      : "Incoming audio call"
  );


  // If home.html has dedicated incoming
  // buttons, activate them.
  $("acceptCallBtn")?.classList.add("show");
  $("rejectCallBtn")?.classList.add("show");
}


function showActiveCallControls() {

  $("acceptCallBtn")?.classList.remove("show");
  $("rejectCallBtn")?.classList.remove("show");
}


function showLocalVideo() {

  const video =
    $("localVideo");

  if (
    video &&
    localStream
  ) {

    video.srcObject =
      localStream;

    video.style.display =
      "block";

    video.muted = true;

    video.playsInline = true;

    video.play?.().catch(() => {});
  }
}


/* =========================================================
   HOME UI
   ========================================================= */

function wireHomeUI() {

  $("closeChatButton")
    ?.addEventListener(
      "click",
      () => {

        unsubscribeMessages?.();

        unsubscribeMessages =
          null;

        currentConversation =
          null;

        currentPeer =
          null;
      }
    );


  $("audioCallButton")
    ?.addEventListener(
      "click",
      () => {

        if (currentPeer) {

          startCall(
            currentPeer,
            "audio"
          );

        } else {

          showToast(
            "Open a chat first."
          );
        }
      }
    );


  $("videoCallButton")
    ?.addEventListener(
      "click",
      () => {

        if (currentPeer) {

          startCall(
            currentPeer,
            "video"
          );

        } else {

          showToast(
            "Open a chat first."
          );
        }
      }
    );


  $("headerVideoButton")
    ?.addEventListener(
      "click",
      () => {

        if (currentPeer) {

          startCall(
            currentPeer,
            "video"
          );

        } else {

          showToast(
            "Open a chat first."
          );
        }
      }
    );


  $("endCallBtn")
    ?.addEventListener(
      "click",
      endCall
    );


  $("acceptCallBtn")
    ?.addEventListener(
      "click",
      acceptIncomingCall
    );


  $("rejectCallBtn")
    ?.addEventListener(
      "click",
      rejectIncomingCall
    );


  $("muteCallBtn")
    ?.addEventListener(
      "click",
      () => {

        if (!localStream) {
          return;
        }


        const tracks =
          localStream
            .getAudioTracks();


        if (!tracks.length) {
          return;
        }


        const enabled =
          tracks[0].enabled;


        tracks.forEach(
          track => {
            track.enabled =
              !enabled;
          }
        );


        showToast(
          enabled
            ? "Microphone muted"
            : "Microphone unmuted"
        );
      }
    );


  $("cameraCallBtn")
    ?.addEventListener(
      "click",
      () => {

        if (!localStream) {
          return;
        }


        const tracks =
          localStream
            .getVideoTracks();


        if (!tracks.length) {

          showToast(
            "This is an audio call."
          );

          return;
        }


        const enabled =
          tracks[0].enabled;


        tracks.forEach(
          track => {
            track.enabled =
              !enabled;
          }
        );


        showToast(
          enabled
            ? "Camera off"
            : "Camera on"
        );
      }
    );


  $("logoutButton")
    ?.addEventListener(
      "click",
      logoutUser
    );


  document
    .querySelectorAll(
      '.navButton[data-target="callsScreen"]'
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          setTimeout(
            loadCallHistory,
            100
          );
        }
      );
    });


  $("contactSearchInput")
    ?.addEventListener(
      "input",
      () => {

        const value =
          (
            $("contactSearchInput")
              .value || ""
          )
          .toLowerCase()
          .trim();


        document
          .querySelectorAll(
            "#contactList .contactItem"
          )
          .forEach(item => {

            const name =
              item
                .querySelector(
                  ".contactName"
                )
                ?.textContent
                ?.toLowerCase() || "";


            item.style.display =
              !value ||
              name.includes(value)
                ? ""
                : "none";
          });
      }
    );
}


/* =========================================================
   BOOT
   ========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {

    wireHomeUI();

  }
);


/* =========================================================
   GLOBAL API
   ========================================================= */

window.jChatApp = {

  startCall,

  endCall,

  acceptIncomingCall,

  rejectIncomingCall,

  cleanupCall,

  loadCallHistory,

  renderChatList,

  openConversation

};


console.log(
  "jChat app.js loaded successfully."
);