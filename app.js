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
          <div class="contact-name">${escapeHTML(name)}</div>
          <div class="contact-about">
            ${escapeHTML(
              member.isOnline
                ? "Online"
                : member.about || "Hey there! I am using jChat."
            )}
          </div>
        </div>
      </button>
    `;
  }).join("");

  container.querySelectorAll(".contact-item").forEach(button => {
    button.addEventListener("click", async () => {
      const uid = button.dataset.userId;

      const peer = members.find(
        member => member.uid === uid
      );

      if (!peer) return;

      await openConversationWith(peer);
    });
  });
}


// =========================================================
// CONVERSATIONS
// =========================================================

function conversationIdFor(uid1, uid2) {
  return [uid1, uid2].sort().join("_");
}

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
      conversations = snapshot.docs
        .map(item => ({
          id: item.id,
          ...item.data()
        }))
        .sort((a, b) => {
          const aTime =
            a.updatedAt?.toMillis?.() || 0;

          const bTime =
            b.updatedAt?.toMillis?.() || 0;

          return bTime - aTime;
        });

      renderChatList();
    },
    error => {
      console.error("Conversation listener error:", error);
    }
  );
}


async function getOrCreateConversation(peer) {
  if (!currentUser || !peer?.uid) {
    throw new Error("Invalid conversation participant.");
  }

  const id = conversationIdFor(
    currentUser.uid,
    peer.uid
  );

  const ref = doc(db, "conversations", id);

  const existing = await getDoc(ref);

  if (!existing.exists()) {
    await setDoc(ref, {
      participantIds: [
        currentUser.uid,
        peer.uid
      ].sort(),

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),

      lastMessage: "",
      lastMessageSenderId: "",
      lastMessageAt: null,

      unreadCount: {
        [currentUser.uid]: 0,
        [peer.uid]: 0
      }
    });
  }

  return {
    id,
    ...(existing.exists()
      ? existing.data()
      : {
          participantIds: [
            currentUser.uid,
            peer.uid
          ].sort()
        })
  };
}


// =========================================================
// CHAT LIST
// =========================================================

function getPeerForConversation(conversation) {
  const peerId = conversation.participantIds?.find(
    uid => uid !== currentUser.uid
  );

  if (!peerId) return null;

  return members.find(
    member => member.uid === peerId
  ) || null;
}


function renderChatList() {
  const container = $("chatList");
  const empty = $("emptyChats");

  if (!container) return;

  container.innerHTML = "";

  if (!conversations.length) {
    if (empty) empty.style.display = "";
    return;
  }

  if (empty) empty.style.display = "none";

  conversations.forEach(conversation => {
    const peer = getPeerForConversation(conversation);

    if (!peer) return;

    const name = peer.realName || "jChat User";
    const photo = profilePhoto(peer);

    const unread =
      Number(
        conversation.unreadCount?.[
          currentUser.uid
        ] || 0
      );

    const item = document.createElement("button");

    item.className = "chat-list-item";

    item.innerHTML = `
      <div class="avatar-wrap">
        ${
          photo
            ? `<img class="chat-avatar" src="${escapeHTML(photo)}" alt="">`
            : `<div class="chat-avatar avatar-fallback">${escapeHTML(
                initials(name)
              )}</div>`
        }

        ${
          peer.isOnline
            ? `<span class="online-dot"></span>`
            : ""
        }
      </div>

      <div class="chat-list-content">
        <div class="chat-list-top">
          <strong>${escapeHTML(name)}</strong>
          <span>${escapeHTML(
            formatTime(conversation.lastMessageAt)
          )}</span>
        </div>

        <div class="chat-list-bottom">
          <span>${escapeHTML(
            conversation.lastMessage ||
            "Start chatting..."
          )}</span>

          ${
            unread > 0
              ? `<b class="unread-count">${unread}</b>`
              : ""
          }
        </div>
      </div>
    `;

    item.addEventListener("click", () => {
      openConversation(conversation, peer);
    });

    container.appendChild(item);
  });
}


// =========================================================
// OPEN CHAT
// =========================================================

async function openConversationWith(peer) {
  try {
    const conversation =
      await getOrCreateConversation(peer);

    openConversation(
      conversation,
      peer
    );
  } catch (error) {
    console.error(error);
    showToast("Could not open chat.");
  }
}


function openConversation(conversation, peer) {
  if (!peer) return;

  currentConversation = conversation;
  currentPeer = peer;

  if (window.jChatUI?.openChat) {
    window.jChatUI.openChat({
      conversation,
      peer
    });
  }

  updateChatHeader();
  listenMessages(conversation.id);
  markConversationRead(conversation.id);
}


function updateChatHeader() {
  if (!currentPeer) return;

  const name =
    currentPeer.realName ||
    "jChat User";

  const photo =
    profilePhoto(currentPeer);

  if ($("chatHeaderName")) {
    $("chatHeaderName").textContent = name;
  }

  if ($("chatHeaderStatus")) {
    $("chatHeaderStatus").textContent =
      currentPeer.isOnline
        ? "Online"
        : "Offline";
  }

  if ($("chatHeaderAvatar")) {
    if (photo) {
      $("chatHeaderAvatar").src = photo;
    } else {
      $("chatHeaderAvatar").src =
        `https://ui-avatars.com/api/?name=${encodeURIComponent(
          name
        )}&background=15152b&color=ffffff`;
    }
  }
}


// =========================================================
// MESSAGES
// =========================================================

function listenMessages(conversationId) {
  if (unsubscribeMessages) {
    unsubscribeMessages();
    unsubscribeMessages = null;
  }

  const messagesRef = collection(
    db,
    "conversations",
    conversationId,
    "messages"
  );

  const q = query(
    messagesRef,
    orderBy("createdAt", "asc")
  );

  unsubscribeMessages = onSnapshot(
    q,
    snapshot => {
      renderMessages(snapshot.docs);
    },
    error => {
      console.error("Messages listener error:", error);
    }
  );
}


function renderMessages(docs) {
  const area = $("messagesArea");

  if (!area) return;

  area.innerHTML = "";

  docs.forEach(item => {
    const message = {
      id: item.id,
      ...item.data()
    };

    const mine =
      message.senderId === currentUser.uid;

    const wrapper =
      document.createElement("div");

    wrapper.className =
      `message-row ${mine ? "mine" : "theirs"}`;

    const bubble =
      document.createElement("div");

    bubble.className =
      `message-bubble ${mine ? "mine" : "theirs"}`;

    bubble.innerHTML = `
      <div class="message-text">
        ${escapeHTML(message.text || "")}
      </div>

      <div class="message-time">
        ${escapeHTML(formatTime(message.createdAt))}
      </div>
    `;

    wrapper.appendChild(bubble);
    area.appendChild(wrapper);
  });

  requestAnimationFrame(() => {
    area.scrollTop = area.scrollHeight;
  });
}


async function sendMessage(text) {
  if (
    !currentUser ||
    !currentConversation ||
    !currentPeer
  ) {
    return;
  }

  const cleanText =
    String(text || "").trim();

  if (!cleanText) return;

  const conversationId =
    currentConversation.id;

  const messageRef = collection(
    db,
    "conversations",
    conversationId,
    "messages"
  );

  try {
    await addDoc(messageRef, {
      senderId: currentUser.uid,
      receiverId: currentPeer.uid,
      text: cleanText,
      createdAt: serverTimestamp(),
      type: "text"
    });

    const unread =
      currentConversation.unreadCount || {};

    const peerUnread =
      Number(unread[currentPeer.uid] || 0);

    const updatedUnread = {
      ...unread,
      [currentUser.uid]: 0,
      [currentPeer.uid]: peerUnread + 1
    };

    await updateDoc(
      doc(
        db,
        "conversations",
        conversationId
      ),
      {
        lastMessage: cleanText,
        lastMessageSenderId:
          currentUser.uid,
        lastMessageAt:
          serverTimestamp(),
        updatedAt:
          serverTimestamp(),
        unreadCount:
          updatedUnread
      }
    );
  } catch (error) {
    console.error("Send message error:", error);
    showToast("Message could not be sent.");
  }
}


async function markConversationRead(conversationId) {
  if (!currentUser) return;

  try {
    await updateDoc(
      doc(
        db,
        "conversations",
        conversationId
      ),
      {
        [`unreadCount.${currentUser.uid}`]: 0
      }
    );
  } catch (error) {
    console.error(
      "Mark read error:",
      error
    );
  }
}


// =========================================================
// CALLS — WEBRTC
// =========================================================

function createPeerConnection() {
  const pc =
    new RTCPeerConnection({
      iceServers: ICE_SERVERS
    });

  pc.onicecandidate = async event => {
    if (!event.candidate || !currentCall) {
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
          senderId: currentUser.uid,
          candidate:
            event.candidate.toJSON(),
          createdAt:
            serverTimestamp()
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

    const video =
      $("remoteVideo");

    if (video) {
      video.srcObject =
        remoteStream;

      video.play?.().catch(() => {});
    }
  };

  pc.onconnectionstatechange = () => {
    const state =
      pc.connectionState;

    console.log(
      "WebRTC state:",
      state
    );

    if (
      state === "failed" ||
      state === "closed"
    ) {
      endCall(false);
    }
  };

  return pc;
}


// =========================================================
// OUTGOING CALL
// =========================================================

async function startCall(type = "audio") {
  if (
    !currentUser ||
    !currentPeer
  ) {
    showToast(
      "Open a chat before calling."
    );
    return;
  }

  if (currentCall) {
    showToast(
      "You are already on a call."
    );
    return;
  }

  try {
    const constraints =
      type === "video"
        ? {
            audio: true,
            video: true
          }
        : {
            audio: true,
            video: false
          };

    localStream =
      await navigator.mediaDevices.getUserMedia(
        constraints
      );

    remoteStream =
      new MediaStream();

    peerConnection =
      createPeerConnection();

    localStream
      .getTracks()
      .forEach(track => {
        peerConnection.addTrack(
          track,
          localStream
        );
      });

    const callRef =
      await addDoc(
        collection(db, "calls"),
        {
          callerId:
            currentUser.uid,

          calleeId:
            currentPeer.uid,

          participantIds: [
            currentUser.uid,
            currentPeer.uid
          ].sort(),

          type,

          status: "ringing",

          createdAt:
            serverTimestamp(),

          updatedAt:
            serverTimestamp()
        }
      );

    currentCall = {
      id: callRef.id,
      callerId:
        currentUser.uid,
      calleeId:
        currentPeer.uid,
      type,
      outgoing: true
    };

    await listenToCurrentCall(
      callRef.id
    );

    const offer =
      await peerConnection.createOffer();

    await peerConnection.setLocalDescription(
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

    attachLocalVideo();

    showCallOverlay(
      currentPeer.realName,
      type,
      "Calling..."
    );

  } catch (error) {
    console.error(
      "Start call error:",
      error
    );

    cleanupCall();

    showToast(
      "Could not start the call. Check microphone/camera permission."
    );
  }
}


// =========================================================
// INCOMING CALLS
// =========================================================

function listenIncomingCalls() {
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
    )
  );

  unsubscribeIncomingCalls =
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

            const call = {
              id: change.doc.id,
              ...change.doc.data()
            };

            if (
              currentCall ||
              incomingCallId
            ) {
              return;
            }

            incomingCallId =
              call.id;

            incomingCallData =
              call;

            showIncomingCall(call);
          });
      },
      error => {
        console.error(
          "Incoming call listener error:",
          error
        );
      }
    );
}


async function showIncomingCall(call) {
  const caller =
    members.find(
      member =>
        member.uid === call.callerId
    );

  const callerName =
    caller?.realName ||
    "jChat User";

  showCallOverlay(
    callerName,
    call.type || "audio",
    "Incoming call..."
  );

  const overlay =
    $("callOverlay");

  if (!overlay) return;

  let controls =
    overlay.querySelector(
      ".incoming-call-controls"
    );

  if (!controls) {
    controls =
      document.createElement("div");

    controls.className =
      "incoming-call-controls";

    overlay.appendChild(
      controls
    );
  }

  controls.innerHTML = `
    <button
      type="button"
      class="incoming-accept"
      id="incomingAcceptBtn">
      Accept
    </button>

    <button
      type="button"
      class="incoming-reject"
      id="incomingRejectBtn">
      Reject
    </button>
  `;

  $("incomingAcceptBtn")
    ?.addEventListener(
      "click",
      () => acceptIncomingCall(call)
    );

  $("incomingRejectBtn")
    ?.addEventListener(
      "click",
      () => rejectIncomingCall(call)
    );
}


// =========================================================
// ACCEPT CALL
// =========================================================

async function acceptIncomingCall(call) {
  if (!call) return;

  try {
    const type =
      call.type || "audio";

    const constraints =
      type === "video"
        ? {
            audio: true,
            video: true
          }
        : {
            audio: true,
            video: false
          };

    localStream =
      await navigator.mediaDevices.getUserMedia(
        constraints
      );

    remoteStream =
      new MediaStream();

    peerConnection =
      createPeerConnection();

    localStream
      .getTracks()
      .forEach(track => {
        peerConnection.addTrack(
          track,
          localStream
        );
      });

    currentCall = {
      id: call.id,
      callerId:
        call.callerId,
      calleeId:
        call.calleeId,
      type,
      outgoing: false
    };

    incomingCallId = null;
    incomingCallData = null;

    await updateDoc(
      doc(db, "calls", call.id),
      {
        status: "accepted",
        acceptedAt:
          serverTimestamp(),
        updatedAt:
          serverTimestamp()
      }
    );

    await listenToCurrentCall(
      call.id
    );

    const callSnap =
      await getDoc(
        doc(db, "calls", call.id)
      );

    const callData =
      callSnap.data();

    if (!callData?.offer) {
      throw new Error(
        "Call offer is missing."
      );
    }

    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(
        callData.offer
      )
    );

    await flushPendingCandidates();

    const answer =
      await peerConnection.createAnswer();

    await peerConnection.setLocalDescription(
      answer
    );

    await updateDoc(
      doc(db, "calls", call.id),
      {
        answer: {
          type: answer.type,
          sdp: answer.sdp
        },
        status: "connected",
        updatedAt:
          serverTimestamp()
      }
    );

    attachLocalVideo();

    const caller =
      members.find(
        member =>
          member.uid ===
          call.callerId
      );

    showCallOverlay(
      caller?.realName ||
        "jChat User",
      type,
      "Connected"
    );

  } catch (error) {
    console.error(
      "Accept call error:",
      error
    );

    await rejectIncomingCall(
      call
    );

    showToast(
      "Could not accept the call."
    );
  }
}


// =========================================================
// REJECT CALL
// =========================================================

async function rejectIncomingCall(call) {
  try {
    if (call?.id) {
      await updateDoc(
        doc(db, "calls", call.id),
        {
          status: "rejected",
          endedAt:
            serverTimestamp(),
          updatedAt:
            serverTimestamp()
        }
      );
    }
  } catch (error) {
    console.error(
      "Reject call error:",
      error
    );
  }

  incomingCallId = null;
  incomingCallData = null;

  hideCallOverlay();
}


// =========================================================
// CURRENT CALL LISTENER
// =========================================================

async function listenToCurrentCall(
  callId
) {
  if (unsubscribeCurrentCall) {
    unsubscribeCurrentCall();
  }

  unsubscribeCurrentCall =
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
          call.status === "rejected" ||
          call.status === "ended"
        ) {
          cleanupCall();
          return;
        }

        if (
          currentCall?.outgoing &&
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

            await flushPendingCandidates();

            updateCallStatus(
              "Connected"
            );
          } catch (error) {
            console.error(
              "Set answer error:",
              error
            );
          }
        }

        if (
          call.status === "connected"
        ) {
          updateCallStatus(
            "Connected"
          );
        }
      }
    );

  listenForCallCandidates(
    callId
  );
}


// =========================================================
// CALL ICE CANDIDATES
// =========================================================

function listenForCallCandidates(
  callId
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
        if (
          change.type !== "added"
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

        const candidate =
          new RTCIceCandidate(
            data.candidate
          );

        if (
          peerConnection?.remoteDescription
            ?.type
        ) {
          try {
            await peerConnection.addIceCandidate(
              candidate
            );
          } catch (error) {
            console.error(
              "Add ICE candidate error:",
              error
            );
          }
        } else {
          pendingRemoteCandidates.push(
            candidate
          );
        }
      }
    }
  );
}


async function flushPendingCandidates() {
  if (!peerConnection) return;

  const candidates =
    [...pendingRemoteCandidates];

  pendingRemoteCandidates = [];

  for (const candidate of candidates) {
    try {
      await peerConnection.addIceCandidate(
        candidate
      );
    } catch (error) {
      console.error(
        "Queued ICE candidate error:",
        error
      );
    }
  }
}


// =========================================================
// CALL UI
// =========================================================

function showCallOverlay(
  name,
  type,
  status
) {
  const overlay =
    $("callOverlay");

  if (!overlay) return;

  overlay.classList.add("active");
  overlay.style.display = "flex";

  if ($("callName")) {
    $("callName").textContent =
      name || "jChat User";
  }

  if ($("callStatus")) {
    $("callStatus").textContent =
      status || "Calling...";
  }

  const remoteVideo =
    $("remoteVideo");

  const localVideo =
    $("localVideo");

  if (type === "video") {
    if (remoteVideo) {
      remoteVideo.style.display =
        "block";
    }

    if (localVideo) {
      localVideo.style.display =
        "block";
    }
  } else {
    if (remoteVideo) {
      remoteVideo.style.display =
        "none";
    }

    if (localVideo) {
      localVideo.style.display =
        "none";
    }
  }
}


function updateCallStatus(status) {
  if ($("callStatus")) {
    $("callStatus").textContent =
      status;
  }
}


function attachLocalVideo() {
  if (!$("localVideo")) return;

  if (localStream) {
    $("localVideo").srcObject =
      localStream;

    $("localVideo")
      .play?.()
      .catch(() => {});
  }
}


function hideCallOverlay() {
  const overlay =
    $("callOverlay");

  if (!overlay) return;

  overlay.classList.remove(
    "active"
  );

  overlay.style.display =
    "none";

  const controls =
    overlay.querySelector(
      ".incoming-call-controls"
    );

  controls?.remove();
}


// =========================================================
// END CALL
// =========================================================

async function endCall(updateRemote = true) {
  const callId =
    currentCall?.id;

  if (
    updateRemote &&
    callId
  ) {
    try {
      await updateDoc(
        doc(db, "calls", callId),
        {
          status: "ended",
          endedAt:
            serverTimestamp(),
          updatedAt:
            serverTimestamp()
        }
      );
    } catch (error) {
      console.error(
        "End call update error:",
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

  if (peerConnection) {
    try {
      peerConnection.close();
    } catch {}
  }

  peerConnection = null;

  if (localStream) {
    localStream
      .getTracks()
      .forEach(track =>
        track.stop()
      );
  }

  if (remoteStream) {
    remoteStream
      .getTracks()
      .forEach(track =>
        track.stop()
      );
  }

  localStream = null;
  remoteStream = null;

  currentCall = null;

  pendingRemoteCandidates = [];

  incomingCallId = null;
  incomingCallData = null;

  if ($("localVideo")) {
    $("localVideo").srcObject =
      null;
  }

  if ($("remoteVideo")) {
    $("remoteVideo").srcObject =
      null;
  }

  hideCallOverlay();
}


// =========================================================
// CALL HISTORY
// =========================================================

async function loadCallHistory() {
  if (!currentUser) return;

  const container =
    $("callHistory");

  const empty =
    $("emptyCalls");

  if (!container) return;

  try {
    const q = query(
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
    );

    const snapshot =
      await getDocs(q);

    container.innerHTML = "";

    if (snapshot.empty) {
      if (empty) {
        empty.style.display = "";
      }
      return;
    }

    if (empty) {
      empty.style.display = "none";
    }

    snapshot.forEach(item => {
      const call = {
        id: item.id,
        ...item.data()
      };

      const otherId =
        call.callerId ===
        currentUser.uid
          ? call.calleeId
          : call.callerId;

      const peer =
        members.find(
          member =>
            member.uid === otherId
        );

      const name =
        peer?.realName ||
        "jChat User";

      const direction =
        call.callerId ===
        currentUser.uid
          ? "Outgoing"
          : "Incoming";

      const row =
        document.createElement(
          "div"
        );

      row.className =
        "call-history-item";

      row.innerHTML = `
        <div class="call-history-avatar">
          ${
            peer?.photoURL
              ? `<img src="${escapeHTML(
                  peer.photoURL
                )}" alt="">`
              : escapeHTML(
                  initials(name)
                )
          }
        </div>

        <div class="call-history-info">
          <strong>${escapeHTML(
            name
          )}</strong>

          <span>
            ${escapeHTML(
              direction
            )}
            ·
            ${escapeHTML(
              call.type === "video"
                ? "Video"
                : "Audio"
            )}
            ·
            ${escapeHTML(
              formatDateTime(
                call.createdAt
              )
            )}
          </span>
        </div>
      `;

      container.appendChild(row);
    });
  } catch (error) {
    console.error(
      "Call history error:",
      error
    );

    if (
      error.code ===
      "failed-precondition"
    ) {
      console.warn(
        "A Firestore composite index may be required for call history."
      );
    }
  }
}


// =========================================================
// UI EVENTS
// =========================================================

function wireHomeUI() {
  $("logoutButton")
    ?.addEventListener(
      "click",
      async () => {
        await setOnlineStatus(false);

        stopListeners();

        try {
          await signOut(auth);
        } catch (error) {
          console.error(
            "Logout error:",
            error
          );
        }
      }
    );


  $("audioCallButton")
    ?.addEventListener(
      "click",
      () => startCall("audio")
    );


  $("videoCallButton")
    ?.addEventListener(
      "click",
      () => startCall("video")
    );


  $("endCallBtn")
    ?.addEventListener(
      "click",
      () => endCall(true)
    );


  $("muteCallBtn")
    ?.addEventListener(
      "click",
      toggleMute
    );


  $("cameraCallBtn")
    ?.addEventListener(
      "click",
      toggleCamera
    );


  $("sendMessageButton")
    ?.addEventListener(
      "click",
      () => {
        const input =
          $("messageInput");

        if (!input) return;

        const text =
          input.value.trim();

        if (!text) return;

        sendMessage(text);

        input.value = "";
      }
    );


  $("messageInput")
    ?.addEventListener(
      "keydown",
      event => {
        if (
          event.key === "Enter" &&
          !event.shiftKey
        ) {
          event.preventDefault();

          $("sendMessageButton")
            ?.click();
        }
      }
    );


  $("contactSearchInput")
    ?.addEventListener(
      "input",
      event => {
        renderContacts(
          event.target.value
        );
      }
    );


  $("chatSearchInput")
    ?.addEventListener(
      "input",
      event => {
        filterChatList(
          event.target.value
        );
      }
    );


  $("closeChatButton")
    ?.addEventListener(
      "click",
      () => {
        if (unsubscribeMessages) {
          unsubscribeMessages();
          unsubscribeMessages = null;
        }

        currentConversation = null;
        currentPeer = null;
      }
    );


  document.addEventListener(
    "jchat-send-message",
    event => {
      sendMessage(
        event.detail?.text || ""
      );
    }
  );


  document.addEventListener(
    "jchat-open-contact",
    event => {
      const uid =
        event.detail?.uid;

      const peer =
        members.find(
          member =>
            member.uid === uid
        );

      if (peer) {
        openConversationWith(
          peer
        );
      }
    }
  );
}


function filterChatList(term = "") {
  const value =
    term.trim().toLowerCase();

  document
    .querySelectorAll(
      "#chatList .chat-list-item"
    )
    .forEach(item => {
      const text =
        item.textContent
          .toLowerCase();

      item.style.display =
        !value ||
        text.includes(value)
          ? ""
          : "none";
    });
}


function toggleMute() {
  if (!localStream) return;

  const tracks =
    localStream.getAudioTracks();

  if (!tracks.length) return;

  const enabled =
    tracks[0].enabled;

  tracks.forEach(
    track => {
      track.enabled =
        !enabled;
    }
  );

  if ($("muteCallBtn")) {
    $("muteCallBtn").textContent =
      enabled
        ? "Unmute"
        : "Mute";
  }
}


function toggleCamera() {
  if (!localStream) return;

  const tracks =
    localStream.getVideoTracks();

  if (!tracks.length) return;

  const enabled =
    tracks[0].enabled;

  tracks.forEach(
    track => {
      track.enabled =
        !enabled;
    }
  );

  if ($("cameraCallBtn")) {
    $("cameraCallBtn").textContent =
      enabled
        ? "Camera Off"
        : "Camera On";
  }
}


// =========================================================
// STOP LISTENERS
// =========================================================

function stopListeners() {
  unsubscribeMembers?.();
  unsubscribeConversations?.();
  unsubscribeMessages?.();
  unsubscribeIncomingCalls?.();
  unsubscribeCurrentCall?.();

  unsubscribeMembers = null;
  unsubscribeConversations = null;
  unsubscribeMessages = null;
  unsubscribeIncomingCalls = null;
  unsubscribeCurrentCall = null;
}


// =========================================================
// START UI
// =========================================================

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    wireHomeUI
  );
} else {
  wireHomeUI();
}


// =========================================================
// PUBLIC API
// =========================================================

window.jChatApp = {
  startCall,
  endCall,
  cleanupCall,
  loadCallHistory,
  renderChatList,
  renderContacts,
  openConversationWith
};