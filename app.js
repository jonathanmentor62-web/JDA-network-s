/* =========================================================
   jChat
   Firebase Auth + Firestore + WebRTC
   Follows home.html structure exactly
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
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";


/* =========================================================
   TURN
   ========================================================= */

const METERED_TURN_USERNAME = "3e34f2edd42777aac34b9a4f";
const METERED_TURN_CREDENTIAL = "hSQcaWCgT3jN4xUe";

const RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.relay.metered.ca:80" },
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

let peerConnection = null;
let localStream = null;
let remoteStream = null;
let currentCall = null;


/* =========================================================
   HELPERS
   ========================================================= */

const $ = id => document.getElementById(id);

function escapeHTML(v = "") {
  return String(v)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const safe = v => escapeHTML(v);

function initials(name = "User") {
  const p = name.trim().split(/\s+/);
  if (!p.length) return "U";
  if (p.length === 1) return p[0].substring(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

function formatTime(ts) {
  if (!ts) return "";
  try {
    const d = typeof ts.toDate === "function" ? ts.toDate() : new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

function formatRelative(ts) {
  if (!ts) return "";
  try {
    const d = typeof ts.toDate === "function" ? ts.toDate() : new Date(ts);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return "now";
    if (diff < 3600) return Math.floor(diff / 60) + "m";
    if (diff < 86400) return Math.floor(diff / 3600) + "h";
    if (diff < 604800) return Math.floor(diff / 86400) + "d";
    return d.toLocaleDateString();
  } catch { return ""; }
}

function getPhoto(p) {
  return p?.photoURL || p?.profilePhoto || "";
}

function showToast(message) {
  if (window.jChatUI?.showToast) {
    window.jChatUI.showToast(message);
    return;
  }
  let t = $("toast");
  if (t) {
    t.textContent = message;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2500);
  }
}


/* =========================================================
   AUTH
   ========================================================= */

onAuthStateChanged(auth, async user => {
  if (!user) {
    currentUser = null;
    currentProfile = null;
    return;
  }
  currentUser = user;
  await startApp();
});


async function startApp() {
  try {
    const snap = await getDoc(doc(db, "users", currentUser.uid));

    currentProfile = snap.exists()
      ? { uid: currentUser.uid, ...snap.data() }
      : { uid: currentUser.uid, realName: currentUser.email || "jChat User" };

    applyProfileToUI();

    await setOnlineStatus(true);

    startMembersListener();
    startConversationsListener();
    startIncomingCallListener();

    window.addEventListener("beforeunload", () => setOnlineStatus(false));
  } catch (err) {
    console.error("startApp:", err);
    showToast("Unable to load jChat.");
  }
}


function applyProfileToUI() {
  const name = currentProfile?.realName || "jChat User";
  const about = currentProfile?.about || "Hey there! I am using jChat.";
  const photo = getPhoto(currentProfile);

  const nameEl = $("profileName");
  const aboutEl = $("profileAbout");
  const avatarEl = $("profileAvatar");

  if (nameEl) nameEl.textContent = name;
  if (aboutEl) aboutEl.textContent = about;

  if (avatarEl) {
    if (photo) {
      avatarEl.innerHTML = `<img src="${photo}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    } else {
      avatarEl.textContent = initials(name);
    }
  }
}


async function setOnlineStatus(isOnline) {
  if (!currentUser) return;
  try {
    await updateDoc(doc(db, "users", currentUser.uid), {
      isOnline,
      lastSeen: serverTimestamp()
    });
  } catch {}
}


async function logoutUser() {
  try {
    await setOnlineStatus(false);
    await signOut(auth);
  } catch {
    showToast("Could not log out.");
  }
}


/* =========================================================
   MEMBERS LISTENER
   ========================================================= */

function startMembersListener() {
  if (!currentUser) return;
  if (unsubscribeMembers) unsubscribeMembers();

  unsubscribeMembers = onSnapshot(
    query(collection(db, "users"), orderBy("realName")),
    snap => {
      members = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
      renderChatList();
      renderContacts();
    },
    err => console.error("Members listener:", err)
  );
}


function findMember(uid) {
  return members.find(m => m.uid === uid);
}


/* =========================================================
   CONVERSATIONS LISTENER
   ========================================================= */

function startConversationsListener() {
  if (!currentUser) return;
  if (unsubscribeConversations) unsubscribeConversations();

  unsubscribeConversations = onSnapshot(
    query(
      collection(db, "conversations"),
      where("participantIds", "array-contains", currentUser.uid)
    ),
    snap => {
      conversations = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const ta = a.lastMessageAt?.toMillis?.() || 0;
          const tb = b.lastMessageAt?.toMillis?.() || 0;
          return tb - ta;
        });

      renderChatList();
    },
    err => console.error("Conversations listener:", err)
  );
}


/* =========================================================
   CHAT LIST (home.html: #chatList, .chatItem, .avatar etc.)
   ========================================================= */

function renderChatList() {
  const list = $("chatList");
  const empty = $("emptyChats");
  if (!list) return;

  const rows = conversations.filter(c => c.lastMessage || c.lastMessageAt);

  if (!rows.length) {
    list.innerHTML = "";
    if (empty) empty.style.display = "block";
    return;
  }

  if (empty) empty.style.display = "none";

  list.innerHTML = rows.map(convo => {
    const otherId = (convo.participantIds || []).find(id => id !== currentUser.uid);
    const other = findMember(otherId);
    const name = other?.realName || "jChat User";
    const photo = getPhoto(other);
    const initialsText = initials(name);

    const avatar = photo
      ? `<img src="${photo}" alt="">`
      : `<div class="avatar" style="font-size:16px">${initialsText}</div>`;

    const onlineDot = other?.isOnline
      ? `<span class="onlineDot"></span>`
      : "";

    const preview = safe(convo.lastMessage || "Tap to start chatting");
    const time = formatRelative(convo.lastMessageAt) || formatTime(convo.lastMessageAt);
    const unread = convo.unreadCount?.[currentUser.uid] || 0;
    const unreadBadge = unread > 0
      ? `<span class="unreadBadge">${unread}</span>`
      : "";

    const avatarBlock = photo
      ? `<div class="avatar">${avatar}${onlineDot}</div>`
      : `<div class="avatar">${initialsText}${onlineDot}</div>`;

    return `
      <div class="chatItem" data-conversation-id="${convo.id}" data-other-id="${otherId || ""}">
        ${avatarBlock}
        <div class="chatInfo">
          <div class="chatTop">
            <div class="chatName">${safe(name)}</div>
            <div class="chatTime">${safe(time)}</div>
          </div>
          <div class="chatBottom">
            <div class="lastMessage">${preview}</div>
            ${unreadBadge}
          </div>
        </div>
      </div>
    `;
  }).join("");

  list.querySelectorAll("[data-conversation-id]").forEach(item => {
    item.addEventListener("click", () => {
      const convo = conversations.find(c => c.id === item.dataset.conversationId);
      const other = findMember(item.dataset.otherId);
      if (convo && other) openConversation(convo, other);
    });
  });
}


/* =========================================================
   OPEN CONVERSATION (uses home.html #chatWindow)
   ========================================================= */

async function openConversation(convo, otherMember) {
  currentConversation = convo;
  currentPeer = otherMember;

  if (window.jChatUI?.openChat) {
    window.jChatUI.openChat({
      name: otherMember.realName,
      status: otherMember.isOnline ? "Online • Active now" : "Offline",
      initials: initials(otherMember.realName),
      photoURL: getPhoto(otherMember)
    });
  }

  listenToMessages(convo.id);
}


function listenToMessages(conversationId) {
  if (unsubscribeMessages) unsubscribeMessages();

  unsubscribeMessages = onSnapshot(
    query(
      collection(db, "conversations", conversationId, "messages"),
      orderBy("createdAt", "asc")
    ),
    snap => {
      const messages = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderMessages(messages);
    },
    err => console.error("Messages listener:", err)
  );
}


/* =========================================================
   MESSAGES (home.html: .messageRow, .messageBubble)
   ========================================================= */

function renderMessages(messages) {
  const area = $("messagesArea");
  if (!area) return;

  if (!messages.length) {
    area.innerHTML = `
      <div style="text-align:center;color:#8c91aa;font-size:13px;padding:40px 20px">
        No messages yet. Say hi 👋
      </div>
    `;
    return;
  }

  area.innerHTML = messages.map(msg => {
    const mine = msg.senderId === currentUser.uid;
    const cls = mine ? "outgoing" : "incoming";
    const ticks = mine
      ? `<span class="seenTicks">${msg.read ? "✓✓" : "✓"}</span>`
      : "";
    const time = formatTime(msg.createdAt);

    return `
      <div class="messageRow ${cls}">
        <div class="messageBubble">
          <div class="messageText">${safe(msg.text || "")}</div>
          <div class="messageMeta">${ticks}${time}</div>
        </div>
      </div>
    `;
  }).join("");

  area.scrollTop = area.scrollHeight;
}


/* =========================================================
   SEND MESSAGE
   ========================================================= */

document.addEventListener("jchat-send-message", async e => {
  const text = (e.detail?.text || "").trim();
  if (!text || !currentConversation || !currentPeer) return;

  try {
    await addDoc(
      collection(db, "conversations", currentConversation.id, "messages"),
      {
        senderId: currentUser.uid,
        receiverId: currentPeer.uid,
        text,
        createdAt: serverTimestamp(),
        read: false
      }
    );

    await updateDoc(doc(db, "conversations", currentConversation.id), {
      lastMessage: text,
      lastMessageAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    document.dispatchEvent(new CustomEvent("jchat-message-sent"));
  } catch (err) {
    console.error(err);
    showToast("Message could not be sent.");
  }
});


/* =========================================================
   CONTACTS (home.html: #contactList)
   ========================================================= */

function renderContacts() {
  const list = $("contactList");
  if (!list) return;

  const others = members.filter(m => m.uid !== currentUser.uid);

  if (!others.length) {
    list.innerHTML = `<div style="text-align:center;color:#8c91aa;padding:40px 20px;font-size:13px">No contacts yet.</div>`;
    return;
  }

  list.innerHTML = others.map(m => {
    const photo = getPhoto(m);
    const avatar = photo
      ? `<div class="avatar"><img src="${photo}" alt=""></div>`
      : `<div class="avatar">${initials(m.realName)}</div>`;

    return `
      <div class="contactItem" data-member-id="${m.uid}">
        ${avatar}
        <div class="contactInfo">
          <div class="contactName">${safe(m.realName || "")}</div>
          <div class="contactAbout">${safe(m.about || "Hey there! I am using jChat.")}</div>
        </div>
      </div>
    `;
  }).join("");

  list.querySelectorAll("[data-member-id]").forEach(item => {
    item.addEventListener("click", async () => {
      const member = findMember(item.dataset.memberId);
      if (!member) return;
      const convo = await getOrCreateConversation(member.uid);
      openConversation(convo, member);
    });
  });
}


async function getOrCreateConversation(otherId) {
  const ids = [currentUser.uid, otherId].sort();

  const existing = conversations.find(c => {
    const p = c.participantIds || [];
    return p.length === 2 && p[0] === ids[0] && p[1] === ids[1];
  });

  if (existing) return existing;

  const ref = await addDoc(collection(db, "conversations"), {
    participantIds: ids,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastMessage: "",
    lastMessageAt: serverTimestamp()
  });

  return { id: ref.id, participantIds: ids };
}


/* =========================================================
   CALL HISTORY (home.html: #callHistory)
   ========================================================= */

async function loadCallHistory() {
  const container = $("callHistory");
  if (!container) return;

  try {
    const snap = await getDocs(
      query(
        collection(db, "calls"),
        where("participantIds", "array-contains", currentUser.uid),
        orderBy("createdAt", "desc"),
        limit(50)
      )
    );

    const calls = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (!calls.length) {
      container.innerHTML = "";
      const empty = $("emptyCalls");
      if (empty) empty.style.display = "block";
      return;
    }

    const empty = $("emptyCalls");
    if (empty) empty.style.display = "none";

    container.innerHTML = calls.map(call => {
      const otherId = call.callerId === currentUser.uid ? call.calleeId : call.callerId;
      const member = findMember(otherId);
      const name = member?.realName || "jChat User";
      const icon = call.type === "video" ? "🎥" : "📞";

      return `
        <div class="callItem">
          <div class="avatar">${icon}</div>
          <div class="callDetails">
            <div class="callName">${safe(name)}</div>
            <div class="callMeta">${safe(call.status || "")} • ${formatTime(call.createdAt)}</div>
          </div>
        </div>
      `;
    }).join("");
  } catch (err) {
    console.error("Call history:", err);
  }
}


/* =========================================================
   WEBRTC — OUTGOING
   ========================================================= */

async function startCall(member, type) {
  if (!currentUser || !member || peerConnection) {
    if (peerConnection) showToast("You are already on a call.");
    return;
  }

  try {
    const callRef = await addDoc(collection(db, "calls"), {
      callerId: currentUser.uid,
      calleeId: member.uid,
      participantIds: [currentUser.uid, member.uid],
      type,
      status: "ringing",
      createdAt: serverTimestamp()
    });

    currentCall = {
      id: callRef.id,
      callerId: currentUser.uid,
      calleeId: member.uid,
      type,
      outgoing: true
    };

    showCallOverlay(member, type, "Calling...");

    await createPeerConnection();

    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: type === "video"
    });

    localStream.getTracks().forEach(t => peerConnection.addTrack(t, localStream));

    if (type === "video") showLocalVideo();

    peerConnection.onicecandidate = async ev => {
      if (!ev.candidate) return;
      await addDoc(
        collection(db, "calls", callRef.id, "candidates"),
        {
          senderId: currentUser.uid,
          candidate: ev.candidate.toJSON(),
          createdAt: serverTimestamp()
        }
      );
    };

    peerConnection.ontrack = ev => {
      if (!remoteStream) remoteStream = new MediaStream();
      ev.streams[0]?.getTracks().forEach(t => remoteStream.addTrack(t));
      const v = $("remoteVideo");
      if (v) v.srcObject = remoteStream;
    };

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    await updateDoc(doc(db, "calls", callRef.id), {
      offer: { type: offer.type, sdp: offer.sdp }
    });

    listenToCallChanges(callRef.id, member, true);
    listenToCandidates(callRef.id);
  } catch (err) {
    console.error("startCall:", err);
    await cleanupCall();
    showToast("Could not start the call.");
  }
}


async function createPeerConnection() {
  peerConnection = new RTCPeerConnection(RTC_CONFIG);

  peerConnection.onconnectionstatechange = () => {
    const s = peerConnection.connectionState;
    if (s === "connected") {
      const st = $("callStatus");
      if (st) st.textContent = "Connected";
    }
    if (s === "failed" || s === "closed") cleanupCall();
  };

  return peerConnection;
}


function listenToCallChanges(callId, member, outgoing) {
  onSnapshot(doc(db, "calls", callId), async snap => {
    if (!snap.exists()) return;
    const data = snap.data();

    if (outgoing && data.answer && peerConnection && !peerConnection.currentRemoteDescription) {
      try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        showCallOverlay(member, currentCall.type, "Connected");
        showActiveCallControls();
      } catch (err) {
        console.error("Remote answer:", err);
      }
    }

    if (data.status === "rejected" || data.status === "ended") {
      await cleanupCall();
      showToast(data.status === "rejected" ? "Call rejected." : "Call ended.");
    }
  });
}


function listenToCandidates(callId) {
  onSnapshot(
    query(
      collection(db, "calls", callId, "candidates"),
      orderBy("createdAt", "asc")
    ),
    async snap => {
      for (const change of snap.docChanges()) {
        if (change.type !== "added") continue;
        const data = change.doc.data();
        if (data.senderId === currentUser.uid) continue;
        if (!peerConnection || !data.candidate) continue;
        try {
          await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (err) {
          console.error("addIceCandidate:", err);
        }
      }
    }
  );
}


/* =========================================================
   WEBRTC — INCOMING
   ========================================================= */

function startIncomingCallListener() {
  if (!currentUser) return;
  if (unsubscribeIncomingCalls) unsubscribeIncomingCalls();

  unsubscribeIncomingCalls = onSnapshot(
    query(
      collection(db, "calls"),
      where("calleeId", "==", currentUser.uid),
      where("status", "==", "ringing"),
      limit(1)
    ),
    snap => {
      snap.docChanges().forEach(change => {
        if (change.type !== "added") return;
        const data = change.doc.data();
        if (peerConnection) return;

        const member = findMember(data.callerId);
        if (!member) return;

        currentCall = {
          id: change.doc.id,
          callerId: data.callerId,
          calleeId: data.calleeId,
          type: data.type,
          outgoing: false
        };

        showIncomingCall(member, data.type);
      });
    }
  );
}


async function acceptIncomingCall() {
  if (!currentCall || currentCall.outgoing) return;

  try {
    const callRef = doc(db, "calls", currentCall.id);
    const snap = await getDoc(callRef);
    if (!snap.exists()) throw new Error("Call missing");
    const data = snap.data();

    await createPeerConnection();

    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: currentCall.type === "video"
    });

    localStream.getTracks().forEach(t => peerConnection.addTrack(t, localStream));

    if (currentCall.type === "video") showLocalVideo();

    peerConnection.onicecandidate = async ev => {
      if (!ev.candidate) return;
      await addDoc(
        collection(db, "calls", currentCall.id, "candidates"),
        {
          senderId: currentUser.uid,
          candidate: ev.candidate.toJSON(),
          createdAt: serverTimestamp()
        }
      );
    };

    peerConnection.ontrack = ev => {
      if (!remoteStream) remoteStream = new MediaStream();
      ev.streams[0]?.getTracks().forEach(t => remoteStream.addTrack(t));
      const v = $("remoteVideo");
      if (v) v.srcObject = remoteStream;
    };

    if (data.offer) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
    }

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    await updateDoc(callRef, {
      answer: { type: answer.type, sdp: answer.sdp },
      status: "accepted"
    });

    const member = findMember(currentCall.callerId);
    showCallOverlay(member || { realName: "jChat User" }, currentCall.type, "Connected");
    showActiveCallControls();
    listenToCandidates(currentCall.id);
  } catch (err) {
    console.error("accept:", err);
    await rejectIncomingCall();
  }
}


async function rejectIncomingCall() {
  if (!currentCall) return;
  try {
    await updateDoc(doc(db, "calls", currentCall.id), { status: "rejected" });
  } catch {}
  await cleanupCall();
}


async function endCall() {
  if (currentCall) {
    try {
      await updateDoc(doc(db, "calls", currentCall.id), { status: "ended" });
    } catch {}
  }
  await cleanupCall();
}


async function cleanupCall() {
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }
  if (remoteStream) {
    remoteStream.getTracks().forEach(t => t.stop());
    remoteStream = null;
  }
  if (peerConnection) {
    try { peerConnection.close(); } catch {}
    peerConnection = null;
  }
  currentCall = null;

  const overlay = $("callOverlay");
  if (overlay) overlay.classList.remove("show");

  const lv = $("localVideo");
  const rv = $("remoteVideo");
  if (lv) { lv.srcObject = null; }
  if (rv) { rv.srcObject = null; }
}


/* =========================================================
   CALL OVERLAY UI (home.html: #callOverlay)
   ========================================================= */

function showCallOverlay(member, type, status) {
  const overlay = $("callOverlay");
  if (!overlay) return;
  overlay.classList.add("show");

  const name = $("callName");
  const stat = $("callStatus");
  if (name) name.textContent = member.realName || "jChat User";
  if (stat) stat.textContent = status;

  const lv = $("localVideo");
  const rv = $("remoteVideo");
  if (lv) lv.style.display = type === "video" ? "block" : "none";
  if (rv) rv.style.display = type === "video" ? "block" : "none";
}


function showIncomingCall(member, type) {
  showCallOverlay(
    member,
    type,
    type === "video" ? "Incoming video call" : "Incoming audio call"
  );
}


function showActiveCallControls() {}


function showLocalVideo() {
  const v = $("localVideo");
  if (v && localStream) {
    v.srcObject = localStream;
    v.style.display = "block";
  }
}


/* =========================================================
   WIRE UP home.html ELEMENTS
   ========================================================= */

function wireHomeUI() {
  // chat window back button
  $("closeChatButton")?.addEventListener("click", () => {
    if (unsubscribeMessages) {
      unsubscribeMessages();
      unsubscribeMessages = null;
    }
    currentConversation = null;
    currentPeer = null;
  });

  // chat window call buttons
  $("audioCallButton")?.addEventListener("click", () => {
    if (currentPeer) startCall(currentPeer, "audio");
  });

  $("videoCallButton")?.addEventListener("click", () => {
    if (currentPeer) startCall(currentPeer, "video");
  });

  // header video button — call current peer if any
  $("headerVideoButton")?.addEventListener("click", () => {
    if (currentPeer) startCall(currentPeer, "video");
    else showToast("Open a chat first.");
  });

  // call overlay controls
  $("endCallBtn")?.addEventListener("click", endCall);

  $("muteCallBtn")?.addEventListener("click", () => {
    if (!localStream) return;
    const tracks = localStream.getAudioTracks();
    if (!tracks.length) return;
    const enabled = tracks[0].enabled;
    tracks.forEach(t => (t.enabled = !enabled));
  });

  $("cameraCallBtn")?.addEventListener("click", () => {
    if (!localStream) return;
    const tracks = localStream.getVideoTracks();
    if (!tracks.length) return showToast("This is an audio call.");
    const enabled = tracks[0].enabled;
    tracks.forEach(t => (t.enabled = !enabled));
  });

  // settings / logout wiring in profile screen
  $("logoutButton")?.addEventListener("click", logoutUser);

  // calls screen — load history when opened
  document.querySelectorAll('.navButton[data-target="callsScreen"]')
    .forEach(btn => btn.addEventListener("click", () => setTimeout(loadCallHistory, 50)));

  // contacts search
  $("contactSearchInput")?.addEventListener("input", () => {
    const q = ($("contactSearchInput").value || "").toLowerCase().trim();
    document.querySelectorAll("#contactList .contactItem").forEach(item => {
      const name = item.querySelector(".contactName")?.textContent?.toLowerCase() || "";
      item.style.display = !q || name.includes(q) ? "" : "none";
    });
  });
}


/* =========================================================
   BOOT
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  wireHomeUI();
});


/* =========================================================
   GLOBAL API
   ========================================================= */

window.jChatApp = {
  startCall,
  endCall,
  cleanupCall,
  loadCallHistory,
  renderChatList
};

console.log("jChat app.js loaded.");