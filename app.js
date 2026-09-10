import { auth, db, storage } from "./firebase.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  limit
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

import {
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";

/* =========================================================
   GLOBAL VARIABLES
========================================================= */

const $ = id => document.getElementById(id);

let me = null;
let meData = null;

let activeChat = null;
let activeConversationId = null;

let unsubMessages = null;
let unsubChats = null;
let unsubPending = null;
let unsubApproved = null;

let chatMode = "user";

/* =========================================================
   HELPERS
========================================================= */

function toast(message) {
  const box = $("toast");

  if (!box) return;

  box.textContent = message;
  box.classList.add("show");

  setTimeout(() => {
    box.classList.remove("show");
  }, 3000);
}

function showOnly(id) {
  const screens = [
    "authView",
    "pendingView",
    "rejectedView",
    "appView"
  ];

  screens.forEach(screen => {
    const element = $(screen);

    if (element) {
      element.classList.toggle("hidden", screen!== id);
    }
  });

  $("mobileNav")?.classList.toggle(
    "hidden",
    id!== "appView"
  );
}

function esc(value = "") {
  return String(value).replace(
    /[&<>"']/g,
    character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[character])
  );
}

function initials(name = "JDA") {
  return (
    name
     .trim()
     .split(/\s+/)
     .slice(0, 2)
     .map(word => word[0])
     .join("")
     .toUpperCase() || "J"
  );
}

function isOnline(user) {
  if (!user?.lastSeen?.toDate) return false;

  return (
    Date.now() -
      user.lastSeen.toDate().getTime() <
    90000
  );
}

function avatarHTML(user, size = "avatar") {
  if (user?.photoURL) {
    return `
      <div
        class="${size}"
        style="background-image:url('${esc(user.photoURL)}')">
      </div>
    `;
  }

  return `
    <div class="${size}">
      ${esc(initials(user?.name || user?.username || "JDA"))}
    </div>
  `;
}

function safeFileName(name) {
  return name
   .replace(/[^a-zA-Z0-9._-]/g, "_")
   .slice(-100);
}

/* =========================================================
   AUTH TABS
========================================================= */

document.querySelectorAll("[data-auth]").forEach(button => {

  button.onclick = () => {

    document
     .querySelectorAll(".tab")
     .forEach(tab => tab.classList.remove("active"));

    button.classList.add("active");

    $("loginForm").classList.toggle(
      "hidden",
      button.dataset.auth!== "login"
    );

    $("registerForm").classList.toggle(
      "hidden",
      button.dataset.auth!== "register"
    );
  };

});

/* =========================================================
   REGISTRATION
========================================================= */

$("registerForm").onsubmit = async event => {

  event.preventDefault();

  const name = $("regName").value.trim();
  const phone = $("regPhone").value.trim();
  const username =
    $("regUsername").value.trim().toLowerCase();

  const email =
    $("regEmail").value.trim().toLowerCase();

  const password = $("regPassword").value;
  const photo = $("regPhoto").files[0];

  if (name.length < 2) {
    return toast("Enter your full name.");
  }

  if (phone.length < 5) {
    return toast("Enter a valid phone number.");
  }

  if (!/^[a-z0-9_]{3,30}$/.test(username)) {
    return toast(
      "Username must be 3-30 characters using letters, numbers or _."
    );
  }

  if (password.length < 8) {
    return toast("Password must be at least 8 characters.");
  }

  try {

    /* Check username */

    const usernameDoc = await getDoc(
      doc(db, "usernames", username)
    );

    if (usernameDoc.exists()) {
      throw new Error("Username is already taken.");
    }

    /* Create Firebase account */

    const credential =
      await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

    const user = credential.user;

    let photoURL = "";

    /* Upload profile photo */

    if (photo) {

      if (photo.size > 5 * 1024 * 1024) {
        throw new Error(
          "Profile photo must be under 5 MB."
        );
      }

      if (!photo.type.startsWith("image/")) {
        throw new Error(
          "Profile photo must be an image."
        );
      }

      const storageRef = ref(
        storage,
        `profilePhotos/${user.uid}/${Date.now()}_${safeFileName(photo.name)}`
      );

      await uploadBytes(storageRef, photo);

      photoURL =
        await getDownloadURL(storageRef);
    }

    /* Firebase Auth profile */

    await updateProfile(user, {
      displayName: name,
      photoURL
    });

    /* Firestore user */

    await setDoc(
      doc(db, "users", user.uid),
      {
        uid: user.uid,
        name,
        phone,
        username,
        email,
        photoURL,
        status: "pending",
        createdAt: serverTimestamp(),
        lastSeen: serverTimestamp()
      }
    );

    /* Username lookup */

    await setDoc(
      doc(db, "usernames", username),
      {
        uid: user.uid
      }
    );

    showOnly("pendingView");

    toast(
      "Registration submitted for approval."
    );

  } catch (error) {

    console.error(error);

    toast(
      friendlyAuthError(error)
    );
  }
};

/* =========================================================
   LOGIN
========================================================= */

$("loginForm").onsubmit = async event => {

  event.preventDefault();

  const email =
    $("loginEmail").value.trim();

  const password =
    $("loginPassword").value;

  try {

    await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

  } catch (error) {

    console.error(error);

    toast(
      friendlyAuthError(error)
    );
  }
};

function friendlyAuthError(error) {

  const code = error?.code || "";

  const messages = {

    "auth/invalid-email":
      "Please enter a valid email address.",

    "auth/user-not-found":
      "No account was found with this email.",

    "auth/wrong-password":
      "Incorrect password.",

    "auth/invalid-credential":
      "Email or password is incorrect.",

    "auth/email-already-in-use":
      "This email is already registered.",

    "auth/weak-password":
      "Password is too weak.",

    "auth/network-request-failed":
      "Network error. Check your internet connection."

  };

  return (
    messages[code] ||
    error?.message ||
    "Something went wrong."
  );
}

/* =========================================================
   LOGOUT
========================================================= */

async function logout() {

  try {

    if (unsubMessages) {
      unsubMessages();
      unsubMessages = null;
    }

    if (unsubChats) {
      unsubChats();
      unsubChats = null;
    }

    if (unsubPending) {
      unsubPending();
      unsubPending = null;
    }

    if (unsubApproved) {
      unsubApproved();
      unsubApproved = null;
    }

    activeChat = null;
    activeConversationId = null;

    await signOut(auth);

  } catch (error) {

    toast(error.message);
  }
}

$("logoutBtn").onclick = logout;
$("pendingLogout").onclick = logout;
$("rejectedLogout").onclick = logout;

/* =========================================================
   AUTH STATE
========================================================= */

onAuthStateChanged(
  auth,
  async user => {

    if (!user) {

      showOnly("authView");

      return;
    }

    try {

      me = user;

      const userDoc =
        await getDoc(
          doc(db, "users", user.uid)
        );

      if (!userDoc.exists()) {

        await signOut(auth);

        toast(
          "Your account profile could not be found."
        );

        return;
      }

      meData = {
        id: userDoc.id,
       ...userDoc.data()
      };

      /* Pending */

      if (meData.status === "pending") {

        showOnly("pendingView");

        return;
      }

      /* Rejected */

      if (meData.status === "rejected") {

        showOnly("rejectedView");

        return;
      }

      /* Disabled */

      if (meData.status === "disabled") {

        toast(
          "This account has been disabled."
        );

        await signOut(auth);

        return;
      }

      /* Only approved users enter app */

      if (meData.status!== "approved") {

        showOnly("pendingView");

        return;
      }

      /* Update last seen */

      await updateDoc(
        doc(db, "users", user.uid),
        {
          lastSeen: serverTimestamp()
        }
      );

      /* User avatar */

      $("meAvatar").innerHTML =
        initials(meData.name);

      if (meData.photoURL) {

        $("meAvatar").style.backgroundImage =
          `url('${meData.photoURL}')`;

        $("meAvatar").textContent = "";
      }

      /* Check admin */

      const adminDoc =
        await getDoc(
          doc(db, "admins", user.uid)
        );

      $("adminNav").classList.toggle(
        "hidden",
       !adminDoc.exists()
      );

      showOnly("appView");

      renderPage("chats");

    } catch (error) {

      console.error(error);

      toast(
        "Unable to load your account."
      );
    }
  }
);

/* =========================================================
   PAGE NAVIGATION
========================================================= */

const titles = {

  chats: [
    "Chats",
    "Your conversations"
  ],

  network: [
    "Network",
    "Find and connect with members"
  ],

  status: [
    "Status",
    "Updates from your network"
  ],

  calls: [
    "Calls",
    "Your calls"
  ],

  notifications: [
    "Notifications",
    "Stay up to date"
  ],

  profile: [
    "Profile",
    "Your JDA Networks profile"
  ],

  settings: [
    "Settings",
    "Account and privacy"
  ],

  admin: [
    "Admin",
    "Manage registrations and users"
  ]

};

document
 .querySelectorAll("[data-page]")
 .forEach(button => {

    button.onclick = () => {

      renderPage(
        button.dataset.page
      );

    };

  });

function renderPage(page) {

  if (
    page === "admin" &&
    $("adminNav").classList.contains("hidden")
  ) {

    toast(
      "Administrator access required."
    );

    return;
  }

  $("pageTitle").textContent =
    titles[page]?.[0] ||
    "JDA Networks";

  $("pageSubtitle").textContent =
    titles[page]?.[1] || "";

  document
   .querySelectorAll(
      ".nav-item[data-page]"
    )
   .forEach(item => {

      item.classList.toggle(
        "active",
        item.dataset.page === page
      );

    });

  const renderers = {

    chats: renderChats,
    network: renderNetwork,
    status: renderStatus,
    calls: renderCalls,
    notifications: renderNotifications,
    profile: renderProfile,
    settings: renderSettings,
    admin: renderAdmin

  };

  if (renderers[page]) {
    renderers[page]();
  }
}

/* =========================================================
   CHATS
========================================================= */

function renderChats() {

  if (unsubChats) {
    unsubChats();
    unsubChats = null;
  }

  $("pageContent").innerHTML = `

    <div class="search-box">

      <input
        id="chatSearch"
        class="search-input"
        placeholder="Search conversations"
      >

    </div>

    <div
      id="chatList"
      class="list">

      <div class="empty">
        Loading conversations…
      </div>

    </div>

    <div
      class="card"
      style="margin-top:12px;cursor:pointer"
      id="oumaCard">

      ${avatarHTML({
        name: "Ouma Jonathan"
      })}

      <div class="row-main">

        <b>Ouma Jonathan</b>

        <small>
          AI assistant • online
        </small>

      </div>

    </div>
  `;

  $("oumaCard").onclick =
    openOuma;

  const conversationsQuery =
    query(
      collection(db, "conversations"),
      where(
        "members",
        "array-contains",
        me.uid
      ),
      orderBy(
        "updatedAt",
        "desc"
      ),
      limit(50)
    );

  unsubChats =
    onSnapshot(
      conversationsQuery,
      snapshot => {

        const list =
          $("chatList");

        if (!list) return;

        if (snapshot.empty) {

          list.innerHTML = `
            <div class="empty">
              No conversations yet.
              Find someone in Network
              to start chatting.
            </div>
          `;

          return;
        }

        list.innerHTML = "";

        snapshot.forEach(
          conversationDoc => {

            const conversation =
              conversationDoc.data();

            const other =
              (conversation.memberProfiles || [])
               .find(
                  member =>
                    member.uid!== me.uid
                );

            if (!other) return;

            const row =
              document.createElement("div");

            row.className = "chat-row";

            const time =
              conversation.updatedAt?.toDate
               ? conversation.updatedAt
                   .toDate()
                   .toLocaleTimeString(
                      [],
                      {
                        hour: "2-digit",
                        minute: "2-digit"
                      }
                    )
                : "";

            row.innerHTML = `

              ${avatarHTML(other)}

              <div class="row-main">

                <b>
                  ${esc(other.name)}
                </b>

                <small>
                  ${esc(
                    conversation.lastMessage ||
                    "No messages yet"
                  )}
                </small>

              </div>

              <span class="stat">
                ${time}
              </span>
            `;

            row.onclick =
              () => openChat(other);

            list.appendChild(row);

          }
        );

      },

      error => {

        console.error(error);

        toast(
          "Could not load conversations."
        );
      }
    );

  $("chatSearch").oninput =
    filterChats;
}

function filterChats() {

  const search =
    $("chatSearch")
     ?.value
     .trim()
     .toLowerCase();

  document
   .querySelectorAll(".chat-row")
   .forEach(row => {

      row.style.display =
        row.textContent
         .toLowerCase()
         .includes(search)
         ? "flex"
          : "none";

    });
}

/* =========================================================
   NETWORK
========================================================= */

function renderNetwork() {

  $("pageContent").innerHTML = `

    <div class="search-box">

      <input
        id="memberSearch"
        class="search-input"
        placeholder="Search name or username"
      >

      <button
        id="searchMembers"
        class="primary">
        Search
      </button>

    </div>

    <div
      id="memberList"
      class="list">

      <div class="empty">
        Search for approved members.
      </div>

    </div>
  `;

  $("searchMembers").onclick =
    searchMembers;

  $("memberSearch").onkeydown =
    event => {

      if (event.key === "Enter") {
        searchMembers();
      }

    };
}

async function searchMembers() {

  const term =
    $("memberSearch")
     .value
     .trim()
     .toLowerCase();

  if (!term) {

    toast(
      "Enter a name or username."
    );

    return;
  }

  try {

    const membersQuery =
      query(
        collection(db, "users"),
        where(
          "status",
          "==",
          "approved"
        ),
        limit(100)
      );

    const snapshot =
      await getDocs(
        membersQuery
      );

    const members = [];

    snapshot.forEach(
      memberDoc => {

        const user =
          memberDoc.data();

        if (
          user.uid === me.uid
        ) {
          return;
        }

        const name =
          user.name?.toLowerCase() || "";

        const username =
          user.username?.toLowerCase() || "";

        if (
          name.includes(term) ||
          username.includes(term)
        ) {

          members.push({
            id: memberDoc.id,
           ...user
          });

        }

      }
    );

    const list =
      $("memberList");

    if (!members.length) {

      list.innerHTML = `
        <div class="empty">
          No approved member found.
        </div>
      `;

      return;
    }

    list.innerHTML =
      members
       .map(user => {

          const online =
            isOnline(user);

          return `

            <div
              class="user-row"
              data-user="${esc(user.uid)}">

              ${avatarHTML(user)}

              <div class="row-main">

                <b>
                  ${esc(user.name)}
                </b>

                <small>

                  @${esc(user.username)}

                  ·

                  <span
                    class="${
                      online
                       ? "online"
                        : "offline"
                    }">
                  </span>

                  ${
                    online
                     ? "online"
                      : "offline"
                  }

                </small>

              </div>

              <div class="row-actions">

                <button
                  class="secondary connect"
                  data-id="${esc(user.uid)}">

                  Connect

                </button>

                <button
                  class="primary message"
                  data-id="${esc(user.uid)}">

                  Message

                </button>

              </div>

            </div>
          `;

        })
       .join("");

    document
     .querySelectorAll(".connect")
     .forEach(button => {

        button.onclick =
          event => {

            event.stopPropagation();

            connectUser(
              button.dataset.id
            );

          };

      });

    document
     .querySelectorAll(".message")
     .forEach(button => {

        button.onclick =
          async event => {

            event.stopPropagation();

            const userDoc =
              await getDoc(
                doc(
                  db,
                  "users",
                  button.dataset.id
                )
              );

            if (userDoc.exists()) {

              openChat({
                uid: userDoc.id,
               ...userDoc.data()
              });

            }

          };

      });

  } catch (error) {

    console.error(error);

    toast(
      "Unable to search members."
    );
  }
}

/* =========================================================
   CONNECT USER
========================================================= */

async function connectUser(uid) {

  if (!uid || uid === me.uid) {
    return;
  }

  try {

    await setDoc(
      doc(
        db,
        "connections",
        `${me.uid}_${uid}`
      ),
      {
        from: me.uid,
        to: uid,
        createdAt: serverTimestamp()
      }
    );

    await setDoc(
      doc(
        db,
        "connections",
        `${uid}_${me.uid}`
      ),
      {
        from: uid,
        to: me.uid,
        createdAt: serverTimestamp()
      }
    );

    toast(
      "Added to your network."
    );

  } catch (error) {

    console.error(error);

    toast(
      "Could not add this member."
    );
  }
}

/* =========================================================
   STATUS
========================================================= */

function renderStatus() {

  $("pageContent").innerHTML = `

    <div class="card">

      <h3>Status / Stories</h3>

      <p class="muted">
        Status updates will appear here.
      </p>

      <button
        class="primary"
        id="createStatus">

        Create status

      </button>

    </div>
  `;

  $("createStatus").onclick =
    () => {

      toast(
        "Status publishing will be connected next."
      );

    };
}

/* =========================================================
   CALLS
========================================================= */

function renderCalls() {

  $("pageContent").innerHTML = `

    <div class="empty">

      <h3>No calls yet</h3>

      <p>
        Your voice and video calls
        will appear here.
      </p>

      <button
        class="primary"
        id="startCall">

        Start a call

      </button>

    </div>
  `;

  $("startCall").onclick =
    () => {

      toast(
        "Calling will be connected with WebRTC."
      );

    };
}

/* =========================================================
   NOTIFICATIONS
========================================================= */

function renderNotifications() {

  $("pageContent").innerHTML = `

    <div class="empty">

      <h3>No new notifications</h3>

      <p>
        Notifications from JDA Networks
        will appear here.
      </p>

    </div>
  `;
}

/* =========================================================
   PROFILE
========================================================= */

function renderProfile() {

  $("pageContent").innerHTML = `

    <div class="card">

      <div
        style="
          display:flex;
          align-items:center;
          gap:15px;
        ">

        ${avatarHTML(meData)}

        <div>

          <h3 style="margin:0">
            ${esc(meData.name)}
          </h3>

          <p
            class="muted"
            style="margin:4px 0">

            @${esc(meData.username)}

          </p>

        </div>

      </div>

      <hr>

      <p>
        <b>Phone:</b>
        ${esc(meData.phone)}
      </p>

      <p>
        <b>Email:</b>
        ${esc(meData.email)}
      </p>

      <hr>

      <label>
        Change profile photo

        <input
          id="profilePhoto"
          type="file"
          accept="image/*">

      </label>

      <button
        id="savePhoto"
        class="primary"
        style="margin-top:12px">

        Save photo

      </button>

    </div>
  `;

  $("savePhoto").onclick =
    saveProfilePhoto;
}

/* =========================================================
   PROFILE PHOTO
========================================================= */

async function saveProfilePhoto() {

  const file =
    $("profilePhoto").files[0];

  if (!file) {

    toast(
      "Choose a photo first."
    );

    return;
  }

  if (file.size > 5 * 1024 * 1024) {

    toast(
      "Photo must be under 5 MB."
    );

    return;
  }

  if (!file.type.startsWith("image/")) {

    toast(
      "Please select an image."
    );

    return;
  }

  try {

    const storageRef =
      ref(
        storage,
        `profilePhotos/${me.uid}/${Date.now()}_${safeFileName(file.name)}`
      );

    await uploadBytes(
      storageRef,
      file
    );

    const url =
      await getDownloadURL(
        storageRef
      );

    await updateProfile(
      me,
      {
        photoURL: url
      }
    );

    await updateDoc(
      doc(
        db,
        "users",
        me.uid
      ),
      {
        photoURL: url
      }
    );

    meData.photoURL = url;

    toast(
      "Profile photo updated."
    );

    renderPage("profile");

  } catch (error) {

    console.error(error);

    toast(
      "Could not update profile photo."
    );
  }
}

/* =========================================================
   SETTINGS
========================================================= */

function renderSettings() {

  $("pageContent").innerHTML = `

    <div class="settings-grid">

      <div class="card">

        <h3>Privacy & Security</h3>

        <p class="muted">
          JDA Networks uses Firebase
          authentication and security rules
          to protect member data.
        </p>

      </div>

      <div class="card">

        <h3>Account</h3>

        <button
          id="settingsLogout"
          class="danger-btn">

          Log out

        </button>

      </div>

    </div>
  `;

  $("settingsLogout").onclick =
    logout;
}

/* =========================================================
   CONVERSATION
========================================================= */

async function getOrCreateConversation(other) {

  const conversationId =
    [me.uid, other.uid]
     .sort()
     .join("_");

  const conversationRef =
    doc(
      db,
      "conversations",
      conversationId
    );

  const conversationDoc =
    await getDoc(
      conversationRef
    );

  if (!conversationDoc.exists()) {

    await setDoc(
      conversationRef,
      {
        members: [
          me.uid,
          other.uid
        ],

        memberProfiles: [

          {
            uid: me.uid,
            name: meData.name,
            username: meData.username,
            photoURL:
              meData.photoURL || ""
          },

          {
            uid: other.uid,
            name: other.name,
            username: other.username,
            photoURL:
              other.photoURL || ""
          }

        ],

        lastMessage: "",
        updatedAt: serverTimestamp()
      }
    );

  }

  return conversationId;
}

/* =========================================================
   OPEN CHAT
========================================================= */

async function openChat(other) {

  chatMode = "user";

  activeChat = other;

  $("chatName").textContent =
    other.name;

  $("chatStatus").innerHTML =
    isOnline(other)
     ? `<span class="online"></span>online`
      : `<span class="offline"></span>offline`;

  $("chatAvatar").textContent =
    initials(other.name);

  $("chatAvatar").style.backgroundImage =
    "";

  if (other.photoURL) {

    $("chatAvatar").style.backgroundImage =
      `url('${esc(other.photoURL)}')`;

    $("chatAvatar").textContent = "";
  }

  $("messageInput").placeholder =
    `Message ${other.name}`;

  $("messages").innerHTML = `
    <div class="empty">
      Loading messages…
    </div>
  `;

  $("chatModal").classList.remove(
    "hidden"
  );

  try {

    const conversationId =
      await getOrCreateConversation(
        other
      );

    activeConversationId =
      conversationId;

    if (unsubMessages) {
      unsubMessages();
      unsubMessages = null;
    }

    const messagesQuery =
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
        ),
        limit(200)
      );

    unsubMessages =
      onSnapshot(
        messagesQuery,
        snapshot => {

          const messages =
            $("messages");

          if (!messages) return;

          messages.innerHTML = "";

          if (snapshot.empty) {

            messages.innerHTML = `
              <div class="empty">
                No messages yet.
                Say hello 👋
              </div>
            `;

            return;
          }

          snapshot.forEach(
            messageDoc => {

              const message =
                messageDoc.data();

              const bubble =
                document.createElement(
                  "div"
                );

              bubble.className =
                `bubble ${
                  message.senderId === me.uid
                   ? "mine"
                    : ""
                }`;

              const time =
                message.createdAt?.toDate
                 ? message.createdAt
                     .toDate()
                     .toLocaleString(
                        [],
                        {
                          hour: "2-digit",
                          minute: "2-digit"
                        }
                      )
                  : "sending…";

              bubble.innerHTML = `
                ${esc(message.text)}
                <small>
                  ${time}
                </small>
              `;

              messages.appendChild(
                bubble
              );

            }
          );

          messages.scrollTop =
            messages.scrollHeight;
        },

        error => {

          console.error(error);

          toast(
            "Could not load messages."
          );
        }
      );

  } catch (error) {

    console.error(error);

    toast(
      "Could not open conversation."
    );
  }
}

/* =========================================================
   CLOSE CHAT
========================================================= */

$("closeChat").onclick =
  closeChat;

function closeChat() {

  $("chatModal").classList.add(
    "hidden"
  );

  if (unsubMessages) {

    unsubMessages();

    unsubMessages = null;
  }

  activeChat = null;
  activeConversationId = null;
  chatMode = "user";

  $("messageInput").value = "";
}

/* =========================================================
   SEND MESSAGE
========================================================= */

$("messageForm").onsubmit =
  async event => {

    event.preventDefault();

    const text =
      $("messageInput")
       .value
       .trim();

    if (!text) return;

    if (
      chatMode!== "user" ||
     !activeChat ||
     !activeConversationId
    ) {

      return;
    }

    $("messageInput").value = "";

    try {

      await addDoc(
        collection(
          db,
          "conversations",
          activeConversationId,
          "messages"
        ),
        {
          senderId: me.uid,
          receiverId: activeChat.uid,
          text,
          createdAt: serverTimestamp()
        }
      );

      await updateDoc(
        doc(
          db,
          "conversations",
          activeConversationId
        ),
        {
          lastMessage: text,
          updatedAt: serverTimestamp()
        }
      );

    } catch (error) {

      console.error(error);

      $("messageInput").value =
        text;

      toast(
        "Message could not be sent."
      );
    }
  };

/* =========================================================
   OUMA JONATHAN
========================================================= */

function openOuma() {

  chatMode = "ouma";

  activeChat = null;
  activeConversationId = null;

  if (unsubMessages) {

    unsubMessages();

    unsubMessages = null;
  }

  $("chatName").textContent =
    "Ouma Jonathan";

  $("chatStatus").textContent =
    "AI assistant • online";

  $("chatAvatar").textContent =
    "O";

  $("chatAvatar").style.backgroundImage =
    "";

  $("messageInput").placeholder =
    "Message Ouma Jonathan";

  $("messages").innerHTML = `

    <div class="bubble">

      <b>
        Ouma Jonathan
      </b>

      <br><br>

      Hello 👋 I'm Ouma Jonathan.

      <br><br>

      I'm your JDA Networks AI assistant.
      How can I help you today?

    </div>
  `;

  $("chatModal").classList.remove(
    "hidden"
  );
}

/* =========================================================
   ADMIN PANEL
========================================================= */

async function renderAdmin() {

  $("pageContent").innerHTML = `

    <div class="card">

      <h3>
        Pending registrations
      </h3>

      <div
        id="pendingUsers"
        class="list">

        <div class="empty">
          Loading…
        </div>

      </div>

    </div>

    <div
      class="card"
      style="margin-top:15px">

      <h3>
        Approved users
      </h3>

      <div
        id="approvedUsers"
        class="list">

        <div class="empty">
          Loading…
        </div>

      </div>

    </div>
  `;

  const adminDoc =
    await getDoc(
      doc(
        db,
        "admins",
        me.uid
      )
    );

  if (!adminDoc.exists()) {

    toast(
      "Administrator access required."
    );

    return;
  }

  /* Remove old listeners */

  if (unsubPending) {
    unsubPending();
  }

  if (unsubApproved) {
    unsubApproved();
  }

  /* Pending users */

  const pendingQuery =
    query(
      collection(db, "users"),
      where(
        "status",
        "==",
        "pending"
      ),
      limit(100)
    );

  unsubPending =
    onSnapshot(
      pendingQuery,
      snapshot => {

        const container =
          $("pendingUsers");

        if (!container) return;

        container.innerHTML =
          snapshot.empty
           ? `
              <div class="empty">
                No pending registrations.
              </div>
            `
            : "";

        snapshot.forEach(
          userDoc => {

            const user = {
              id: userDoc.id,
             ...userDoc.data()
            };

            const row =
              document.createElement(
                "div"
              );

            row.className =
              "user-row";

            row.innerHTML = `

              ${avatarHTML(user)}

              <div class="row-main">

                <b>
                  ${esc(user.name)}
                </b>

                <small>
                  @${esc(user.username)}
                  ·
                  ${esc(user.phone)}
                </small>

              </div>

              <button
                class="primary approve">

                Approve

              </button>

              <button
                class="danger-btn reject">

                Reject

              </button>
            `;

            row
             .querySelector(".approve")
             .onclick =
              () =>
                setUserStatus(
                  user.id,
                  "approved"
                );

            row
             .querySelector(".reject")
             .onclick =
              () =>
                setUserStatus(
                  user.id,
                  "rejected"
                );

            container.appendChild(
              row
            );

          }
        );

      }
    );

  /* Approved users */

  const approvedQuery =
    query(
      collection(db, "users"),
      where(
        "status",
        "==",
        "approved"
      ),
      limit(100)
    );

  unsubApproved =
    onSnapshot(
      approvedQuery,
      snapshot => {

        const container =
          $("approvedUsers");

        if (!container) return;

        container.innerHTML =
          snapshot.empty
           ? `
              <div class="empty">
                No approved users.
              </div>
            `
            : "";

        snapshot.forEach(
          userDoc => {

            const user = {
              id: userDoc.id,
             ...userDoc.data()
            };

            const row =
              document.createElement(
                "div"
              );

            row.className =
              "user-row";

            row.innerHTML = `

              ${avatarHTML(user)}

              <div class="row-main">

                <b>
                  ${esc(user.name)}
                </b>

                <small>
                  @${esc(user.username)}
                </small>

              </div>

              <button
                class="danger-btn disable">

                Disable

              </button>
            `;

            row
             .querySelector(".disable")
             .onclick =
              () =>
                setUserStatus(
                  user.id,
                  "disabled"
                );

            container.appendChild(
              row
            );

          }
        );

      }
    );
}

/* =========================================================
   ADMIN STATUS CHANGE
========================================================= */

async function setUserStatus(
  uid,
  status
) {

  if (!uid) return;

  try {

    await updateDoc(
      doc(
        db,
        "users",
        uid
      ),
      {
        status,
        reviewedAt:
          serverTimestamp(),
        reviewedBy:
          me.uid
      }
    );

    toast(
      `User ${status}.`
    );

  } catch (error) {

    console.error(error);

    toast(
      "Could not update user status."
    );
  }
}

/* =========================================================
   === ADDED: JDA PHONE APPROVAL NOTIFICATION ===
   This does NOT change anything above - only adds
========================================================= */

let adminApprovalListenerStarted = false;
let lastNotifiedPendingIds = new Set();

function startAdminApprovalPhoneNotify() {
  if (adminApprovalListenerStarted) return;
  adminApprovalListenerStarted = true;

  // Request notification permission once
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission().catch(()=>{});
  }

  const pendingQ = query(collection(db, "users"), where("status", "==", "pending"));

  onSnapshot(pendingQ, (snap) => {
    snap.docChanges().forEach(change => {
      if (change.type!== "added") return;
      const docId = change.doc.id;
      if (lastNotifiedPendingIds.has(docId)) return;
      lastNotifiedPendingIds.add(docId);

      const u = change.doc.data();
      const title = "JDA Needs Your Approval!";
      const body = `${u.name} @${u.username} - ${u.phone} wants to join`;

      // 1. Vibrate phone
      try { if (navigator.vibrate) navigator.vibrate([400,150,400,150,600]); } catch(e){}

      // 2. Play beep sound
      try {
        const audio = new Audio("https://actions.google.com/sounds/v1/alarms/beep_short.ogg");
        audio.volume = 1.0;
        audio.play().catch(()=>{});
      } catch(e){}

      // 3. Chrome/Android system notification to your phone
      try {
        if ("Notification" in window && Notification.permission === "granted") {
          const n = new Notification(title, { body, icon: "/favicon.ico" || "" });
          n.onclick = () => { window.focus(); renderPage("admin"); n.close(); };
        }
      } catch(e){}

      // 4. In-app toast + confirm
      toast(`🔔 NEW: ${u.name} needs approval`);
      if (meData) {
        // only show confirm if you are already admin inside app
        setTimeout(()=>{
          if (confirm(`🔔 NEW REGISTRATION\n\nName: ${u.name}\nUsername: ${u.username}\nPhone: ${u.phone}\n\nApprove now?`)) {
            renderPage("admin");
          }
        }, 500);
      }
    });
  });
}

// Auto-start notification listener ONLY when you are admin
// We hook into existing onAuthStateChanged by polling meData
setInterval(async () => {
  if (!me ||!meData) return;
  try {
    const adminDoc = await getDoc(doc(db, "admins", me.uid));
    if (adminDoc.exists()) {
      startAdminApprovalPhoneNotify();
    }
  } catch(e){}
}, 3000);
