import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  orderBy,
  onSnapshot,
  serverTimestamp,
  limit
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

import {
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js";

import { auth, db, storage } from "./firebase.js";


// ======================================================
// JDA NETWORKS
// ======================================================

let currentUser = null;
let currentProfile = null;
let currentPage = "chats";
let currentChatUser = null;
let currentConversationId = null;

let unsubscribeMessages = null;
let unsubscribeChats = null;


// ======================================================
// ELEMENTS
// ======================================================

const authView = document.getElementById("authView");
const pendingView = document.getElementById("pendingView");
const rejectedView = document.getElementById("rejectedView");
const appView = document.getElementById("appView");
const mobileNav = document.getElementById("mobileNav");

const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");

const pageContent = document.getElementById("pageContent");
const pageTitle = document.getElementById("pageTitle");
const pageSubtitle = document.getElementById("pageSubtitle");

const adminNav = document.getElementById("adminNav");

const chatModal = document.getElementById("chatModal");
const messagesBox = document.getElementById("messages");

const toast = document.getElementById("toast");


// ======================================================
// TOAST
// ======================================================

function showToast(message) {
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}


// ======================================================
// HELPERS
// ======================================================

function escapeHTML(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


function initials(name = "J") {
  const clean = String(name).trim();

  if (!clean) return "J";

  const words = clean.split(/\s+/);

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return (
    words[0][0] +
    words[words.length - 1][0]
  ).toUpperCase();
}


function formatTime(timestamp) {
  if (!timestamp) return "";

  try {
    const date = timestamp.toDate
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


function showOnly(view) {
  [
    authView,
    pendingView,
    rejectedView,
    appView,
    mobileNav
  ].forEach(element => {
    if (element) {
      element.classList.add("hidden");
    }
  });

  if (view) {
    view.classList.remove("hidden");
  }
}


// ======================================================
// AUTH TABS
// ======================================================

document.querySelectorAll("[data-auth]").forEach(button => {

  button.addEventListener("click", () => {

    const mode = button.dataset.auth;

    document
      .querySelectorAll("[data-auth]")
      .forEach(tab => {
        tab.classList.toggle(
          "active",
          tab.dataset.auth === mode
        );
      });

    if (mode === "login") {

      loginForm?.classList.remove("hidden");
      registerForm?.classList.add("hidden");

    } else {

      loginForm?.classList.add("hidden");
      registerForm?.classList.remove("hidden");
    }
  });

});


// ======================================================
// AUTH STATE
// ======================================================

onAuthStateChanged(auth, async user => {

  console.log(
    "Firebase auth state:",
    user ? user.uid : "signed out"
  );

  if (!user) {

    currentUser = null;
    currentProfile = null;

    showOnly(authView);

    return;
  }

  currentUser = user;

  await loadUserProfile(user.uid);
});


// ======================================================
// LOAD USER PROFILE
// ======================================================

async function loadUserProfile(uid) {

  try {

    console.log(
      "Loading profile:",
      uid
    );

    const profileRef =
      doc(db, "users", uid);

    const profileSnap =
      await getDoc(profileRef);


    if (!profileSnap.exists()) {

      console.error(
        "No user profile document:",
        uid
      );

      await signOut(auth);

      showOnly(authView);

      showToast(
        "Your account profile could not be found."
      );

      return;
    }


    currentProfile = {
      uid: uid,
      ...profileSnap.data()
    };


    console.log(
      "Profile:",
      currentProfile
    );


    const status =
      String(
        currentProfile.status || "pending"
      ).toLowerCase();


    // --------------------------------------------------
    // REJECTED
    // --------------------------------------------------

    if (
      status === "rejected" ||
      status === "declined"
    ) {

      showOnly(rejectedView);

      return;
    }


    // --------------------------------------------------
    // DISABLED
    // --------------------------------------------------

    if (
      status === "disabled" ||
      status === "suspended"
    ) {

      await signOut(auth);

      showOnly(authView);

      showToast(
        "This account has been disabled."
      );

      return;
    }


    // --------------------------------------------------
    // PENDING
    // --------------------------------------------------

    if (
      status !== "approved" &&
      status !== "active"
    ) {

      showOnly(pendingView);

      return;
    }


    // --------------------------------------------------
    // APPROVED
    // --------------------------------------------------

    showOnly(appView);


    if (mobileNav) {
      mobileNav.classList.remove("hidden");
    }


    updateMeAvatar();


    await checkAdmin();


    try {
      await updatePresence(false);
    } catch (error) {
      console.warn(
        "Presence error:",
        error
      );
    }


    renderPage("chats");


    console.log(
      "JDA Networks application opened."
    );

  } catch (error) {

    console.error(
      "LOAD PROFILE ERROR:",
      error
    );

    showOnly(authView);

    showToast(
      "Unable to load your account. Please try again."
    );
  }
}


// ======================================================
// LOGIN
// ======================================================

loginForm?.addEventListener(
  "submit",
  async event => {

    event.preventDefault();

    const email =
      document
        .getElementById("loginEmail")
        ?.value
        .trim();

    const password =
      document
        .getElementById("loginPassword")
        ?.value;


    if (!email || !password) {

      showToast(
        "Enter your email and password."
      );

      return;
    }


    const button =
      loginForm.querySelector(
        "button[type='submit']"
      );


    if (button) {
      button.disabled = true;
      button.textContent = "Logging in...";
    }


    try {

      await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

      /*
        IMPORTANT:
        Do NOT reload the page here.

        onAuthStateChanged() will automatically
        load the profile and open the application.
      */

      showToast(
        "Login successful."
      );

    } catch (error) {

      console.error(
        "LOGIN ERROR:",
        error
      );

      showToast(
        getAuthError(error)
      );

    } finally {

      if (button) {
        button.disabled = false;
        button.textContent = "Log in";
      }
    }
  }
);


// ======================================================
// REGISTRATION
// ======================================================

registerForm?.addEventListener(
  "submit",
  async event => {

    event.preventDefault();


    const name =
      document
        .getElementById("regName")
        ?.value
        .trim();

    const phone =
      document
        .getElementById("regPhone")
        ?.value
        .trim();

    const username =
      document
        .getElementById("regUsername")
        ?.value
        .trim();

    const email =
      document
        .getElementById("regEmail")
        ?.value
        .trim();

    const password =
      document
        .getElementById("regPassword")
        ?.value;

    const photoInput =
      document.getElementById("regPhoto");


    if (!name || !phone || !username || !email || !password) {

      showToast(
        "Please complete all required fields."
      );

      return;
    }


    const usernameClean =
      username.toLowerCase();


    try {

      // Check username

      const usernameRef =
        doc(
          db,
          "usernames",
          usernameClean
        );


      const usernameSnap =
        await getDoc(usernameRef);


      if (usernameSnap.exists()) {

        showToast(
          "That username is already taken."
        );

        return;
      }


      // Create Firebase account

      const credential =
        await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );


      const uid =
        credential.user.uid;


      // Upload optional photo

      let photoURL = "";


      if (
        photoInput &&
        photoInput.files &&
        photoInput.files.length
      ) {

        const file =
          photoInput.files[0];


        if (file.size > 5 * 1024 * 1024) {

          showToast(
            "Profile photo must be smaller than 5 MB."
          );

          return;
        }


        if (!file.type.startsWith("image/")) {

          showToast(
            "Please select an image."
          );

          return;
        }


        const photoRef =
          ref(
            storage,
            `profilePhotos/${uid}/profile`
          );


        await uploadBytes(
          photoRef,
          file
        );


        photoURL =
          await getDownloadURL(
            photoRef
          );
      }


      // Create profile

      await setDoc(
        doc(db, "users", uid),
        {
          uid: uid,
          display: name,
          name: name,
          phone: phone,
          username: usernameClean,
          email: email,
          photoURL: photoURL,
          status: "pending",
          created: serverTimestamp(),
          lastSeen: serverTimestamp(),
          online: false
        }
      );


      // Reserve username

      await setDoc(
        usernameRef,
        {
          uid: uid,
          username: usernameClean,
          created: serverTimestamp()
        }
      );


      showOnly(pendingView);

      showToast(
        "Registration submitted for approval."
      );

    } catch (error) {

      console.error(
        "REGISTRATION ERROR:",
        error
      );

      showToast(
        getAuthError(error)
      );
    }
  }
);


// ======================================================
// AUTH ERRORS
// ======================================================

function getAuthError(error) {

  const code =
    error?.code || "";


  switch (code) {

    case "auth/email-already-in-use":
      return "That email is already registered.";

    case "auth/invalid-email":
      return "Please enter a valid email address.";

    case "auth/weak-password":
      return "Password must be at least 8 characters.";

    case "auth/invalid-credential":
      return "Incorrect email or password.";

    case "auth/user-not-found":
      return "Account not found.";

    case "auth/wrong-password":
      return "Incorrect password.";

    case "auth/too-many-requests":
      return "Too many attempts. Try again later.";

    case "auth/network-request-failed":
      return "Network error. Check your internet connection.";

    default:
      return error?.message ||
        "Something went wrong.";
  }
}


// ======================================================
// LOGOUT
// ======================================================

async function logout() {

  try {

    await updatePresence(true);

    await signOut(auth);

    currentUser = null;
    currentProfile = null;

    if (unsubscribeChats) {
      unsubscribeChats();
      unsubscribeChats = null;
    }

    if (unsubscribeMessages) {
      unsubscribeMessages();
      unsubscribeMessages = null;
    }

    chatModal?.classList.add("hidden");

    showOnly(authView);

  } catch (error) {

    console.error(
      "LOGOUT ERROR:",
      error
    );

    showToast(
      "Unable to log out."
    );
  }
}


document
  .getElementById("logoutBtn")
  ?.addEventListener(
    "click",
    logout
  );

document
  .getElementById("pendingLogout")
  ?.addEventListener(
    "click",
    logout
  );

document
  .getElementById("rejectedLogout")
  ?.addEventListener(
    "click",
    logout
  );


// ======================================================
// ADMIN
// ======================================================

async function checkAdmin() {

  if (!currentUser) return false;


  try {

    const adminSnap =
      await getDoc(
        doc(
          db,
          "admins",
          currentUser.uid
        )
      );


    const isAdmin =
      adminSnap.exists();


    if (adminNav) {

      adminNav.classList.toggle(
        "hidden",
        !isAdmin
      );
    }


    return isAdmin;

  } catch (error) {

    console.error(
      "ADMIN CHECK ERROR:",
      error
    );

    adminNav?.classList.add(
      "hidden"
    );

    return false;
  }
}


// ======================================================
// PRESENCE
// ======================================================

async function updatePresence(logout = false) {

  if (!currentUser) return;


  try {

    await updateDoc(
      doc(
        db,
        "users",
        currentUser.uid
      ),
      {
        online: !logout,
        lastSeen: serverTimestamp()
      }
    );

  } catch (error) {

    console.warn(
      "Presence update failed:",
      error
    );
  }
}


// ======================================================
// NAVIGATION
// ======================================================

document
  .querySelectorAll("[data-page]")
  .forEach(button => {

    button.addEventListener(
      "click",
      () => {

        const page =
          button.dataset.page;

        renderPage(page);
      }
    );
  });


function renderPage(page) {

  currentPage = page;


  document
    .querySelectorAll("[data-page]")
    .forEach(button => {

      button.classList.toggle(
        "active",
        button.dataset.page === page
      );
    });


  const titles = {

    chats: [
      "Chats",
      "Your conversations"
    ],

    network: [
      "Network",
      "Find people on JDA Networks"
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
      "Your JDA Networks notifications"
    ],

    profile: [
      "Profile",
      "Your account"
    ],

    settings: [
      "Settings",
      "Manage your account"
    ],

    admin: [
      "Admin",
      "Manage registrations"
    ]
  };


  const title =
    titles[page] ||
    ["JDA Networks", ""];


  if (pageTitle) {
    pageTitle.textContent =
      title[0];
  }


  if (pageSubtitle) {
    pageSubtitle.textContent =
      title[1];
  }


  switch (page) {

    case "chats":
      renderChats();
      break;

    case "network":
      renderNetwork();
      break;

    case "status":
      renderStatus();
      break;

    case "calls":
      renderCalls();
      break;

    case "notifications":
      renderNotifications();
      break;

    case "profile":
      renderProfile();
      break;

    case "settings":
      renderSettings();
      break;

    case "admin":
      renderAdmin();
      break;

    default:
      renderChats();
  }
}


// ======================================================
// AVATAR
// ======================================================

function avatarHTML(profile, extraClass = "") {

  const name =
    profile?.display ||
    profile?.name ||
    profile?.username ||
    "J";


  const photo =
    profile?.photoURL ||
    profile?.photo ||
    "";


  if (photo) {

    return `
      <div class="avatar ${extraClass}">
        <img
          src="${escapeHTML(photo)}"
          alt="${escapeHTML(name)}"
        >
      </div>
    `;
  }


  return `
    <div class="avatar ${extraClass}">
      ${escapeHTML(initials(name))}
    </div>
  `;
}


// ======================================================
// CHATS PAGE
// ======================================================

function renderChats() {

  pageContent.innerHTML = `

    <div class="search-box">
      <input
        id="chatSearch"
        type="search"
        placeholder="Search chats..."
      >
    </div>

    <div id="chatList" class="list">

      <div class="empty">
        Loading conversations...
      </div>

    </div>

    <button
      id="oumaCard"
      class="ai-card"
      type="button"
    >

      <div class="ai-avatar">
        O
      </div>

      <div>
        <strong>Ouma Jonathan</strong>

        <p>
          Ask Ouma Jonathan anything
        </p>
      </div>

    </button>
  `;


  document
    .getElementById("oumaCard")
    ?.addEventListener(
      "click",
      openOumaJonathan
    );


  loadChats();
}


// ======================================================
// LOAD CHATS
// ======================================================

function loadChats() {

  if (!currentUser) return;


  const chatsRef =
    collection(
      db,
      "conversations"
    );


  const q =
    query(
      chatsRef,
      where(
        "members",
        "array-contains",
        currentUser.uid
      ),
      limit(50)
    );


  if (unsubscribeChats) {
    unsubscribeChats();
  }


  unsubscribeChats =
    onSnapshot(
      q,
      async snapshot => {

        const chatList =
          document.getElementById(
            "chatList"
          );


        if (!chatList) return;


        if (snapshot.empty) {

          chatList.innerHTML = `
            <div class="empty">
              <h3>No chats yet</h3>
              <p>
                Find someone in your Network
                and start a conversation.
              </p>
            </div>
          `;

          return;
        }


        const chats = [];


        for (
          const chatDoc of snapshot.docs
        ) {

          const data =
            chatDoc.data();


          const otherUid =
            data.members?.find(
              uid =>
                uid !== currentUser.uid
            );


          if (!otherUid) continue;


          try {

            const userSnap =
              await getDoc(
                doc(
                  db,
                  "users",
                  otherUid
                )
              );


            if (userSnap.exists()) {

              chats.push({
                id: chatDoc.id,
                profile: {
                  uid: otherUid,
                  ...userSnap.data()
                },
                data: data
              });
            }

          } catch (error) {

            console.warn(
              "Chat user error:",
              error
            );
          }
        }


        if (!chats.length) {

          chatList.innerHTML = `
            <div class="empty">
              No conversations found.
            </div>
          `;

          return;
        }


        chatList.innerHTML =
          chats.map(chat => {

            const name =
              chat.profile.display ||
              chat.profile.name ||
              chat.profile.username ||
              "User";


            return `
              <button
                class="chat-row"
                type="button"
                data-chat-user="${escapeHTML(
                  chat.profile.uid
                )}"
              >

                ${avatarHTML(chat.profile)}

                <div class="row-main">

                  <b>
                    ${escapeHTML(name)}
                  </b>

                  <small>
                    ${escapeHTML(
                      chat.data.lastMessage ||
                      "Start chatting"
                    )}
                  </small>

                </div>

                <small>
                  ${formatTime(
                    chat.data.updatedAt
                  )}
                </small>

              </button>
            `;

          }).join("");


        document
          .querySelectorAll(
            "[data-chat-user]"
          )
          .forEach(button => {

            button.addEventListener(
              "click",
              () => {

                openChat(
                  button.dataset.chatUser
                );
              }
            );
          });

      },
      error => {

        console.error(
          "CHAT LIST ERROR:",
          error
        );

        const chatList =
          document.getElementById(
            "chatList"
          );


        if (chatList) {

          chatList.innerHTML = `
            <div class="empty">
              Unable to load chats.
            </div>
          `;
        }
      }
    );
}


// ======================================================
// NETWORK
// ======================================================

function renderNetwork() {

  pageContent.innerHTML = `

    <div class="search-box">

      <input
        id="memberSearch"
        class="search-input"
        type="search"
        placeholder="Search by name or username..."
      >

    </div>

    <div
      id="memberResults"
      class="list"
    >

      <div class="empty">
        Search for JDA Networks members.
      </div>

    </div>
  `;


  const input =
    document.getElementById(
      "memberSearch"
    );


  let timer;


  input?.addEventListener(
    "input",
    () => {

      clearTimeout(timer);

      timer =
        setTimeout(
          () => searchMembers(input.value),
          350
        );
    }
  );
}


// ======================================================
// SEARCH MEMBERS
// ======================================================

async function searchMembers(term) {

  const results =
    document.getElementById(
      "memberResults"
    );


  if (!results) return;


  term =
    term.trim().toLowerCase();


  if (!term) {

    results.innerHTML = `
      <div class="empty">
        Search for JDA Networks members.
      </div>
    `;

    return;
  }


  results.innerHTML = `
    <div class="empty">
      Searching...
    </div>
  `;


  try {

    const snapshot =
      await getDocs(
        query(
          collection(db, "users"),
          where(
            "status",
            "in",
            ["approved", "active"]
          ),
          limit(100)
        )
      );


    const matches =
      snapshot.docs
        .map(docSnap => ({
          uid: docSnap.id,
          ...docSnap.data()
        }))
        .filter(profile => {

          if (
            profile.uid ===
            currentUser.uid
          ) {
            return false;
          }


          const name =
            String(
              profile.display ||
              profile.name ||
              ""
            ).toLowerCase();


          const username =
            String(
              profile.username ||
              ""
            ).toLowerCase();


          return (
            name.includes(term) ||
            username.includes(term)
          );
        });


    if (!matches.length) {

      results.innerHTML = `
        <div class="empty">
          No approved member found.
        </div>
      `;

      return;
    }


    results.innerHTML =
      matches.map(profile => {

        const name =
          profile.display ||
          profile.name ||
          profile.username ||
          "JDA Member";


        return `
          <div class="member-row">

            ${avatarHTML(profile)}

            <div class="row-main">

              <b>
                ${escapeHTML(name)}
              </b>

              <small>
                @${escapeHTML(
                  profile.username || ""
                )}
              </small>

            </div>

            <button
              class="primary small-btn"
              type="button"
              data-message-user="${escapeHTML(
                profile.uid
              )}"
            >
              Message
            </button>

          </div>
        `;

      }).join("");


    document
      .querySelectorAll(
        "[data-message-user]"
      )
      .forEach(button => {

        button.addEventListener(
          "click",
          event => {

            event.stopPropagation();

            openChat(
              button.dataset.messageUser
            );
          }
        );
      });


  } catch (error) {

    console.error(
      "SEARCH ERROR:",
      error
    );


    results.innerHTML = `
      <div class="empty">
        Unable to search members.
      </div>
    `;
  }
}


// ======================================================
// OPEN CHAT
// ======================================================

async function openChat(otherUid) {

  if (!currentUser) return;


  if (otherUid === currentUser.uid) {

    showToast(
      "You cannot chat with yourself."
    );

    return;
  }


  try {

    const userSnap =
      await getDoc(
        doc(
          db,
          "users",
          otherUid
        )
      );


    if (!userSnap.exists()) {

      showToast(
        "This member could not be found."
      );

      return;
    }


    const profile =
      userSnap.data();


    const status =
      String(
        profile.status || ""
      ).toLowerCase();


    if (
      status !== "approved" &&
      status !== "active"
    ) {

      showToast(
        "This member is not available."
      );

      return;
    }


    currentChatUser = {
      uid: otherUid,
      ...profile
    };


    currentConversationId =
      [currentUser.uid, otherUid]
        .sort()
        .join("_");


    await setDoc(
      doc(
        db,
        "conversations",
        currentConversationId
      ),
      {
        members: [
          currentUser.uid,
          otherUid
        ],
        updatedAt:
          serverTimestamp()
      },
      {
        merge: true
      }
    );


    const name =
      currentChatUser.display ||
      currentChatUser.name ||
      currentChatUser.username ||
      "Chat";


    const nameElement =
      document.getElementById(
        "chatName"
      );


    const statusElement =
      document.getElementById(
        "chatStatus"
      );


    if (nameElement) {
      nameElement.textContent =
        name;
    }


    if (statusElement) {

      statusElement.textContent =
        currentChatUser.online
          ? "online"
          : "offline";
    }


    const avatar =
      document.getElementById(
        "chatAvatar"
      );


    if (avatar) {

      if (currentChatUser.photoURL) {

        avatar.innerHTML = `
          <img
            src="${escapeHTML(
              currentChatUser.photoURL
            )}"
            alt=""
          >
        `;

      } else {

        avatar.textContent =
          initials(name);
      }
    }


    chatModal?.classList.remove(
      "hidden"
    );


    listenToMessages();

  } catch (error) {

    console.error(
      "OPEN CHAT ERROR:",
      error
    );

    showToast(
      "Unable to open this chat."
    );
  }
}


// ======================================================
// CLOSE CHAT
// ======================================================

document
  .getElementById("closeChat")
  ?.addEventListener(
    "click",
    () => {

      chatModal?.classList.add(
        "hidden"
      );


      if (unsubscribeMessages) {

        unsubscribeMessages();

        unsubscribeMessages =
          null;
      }


      currentChatUser = null;
      currentConversationId = null;
    }
  );


// ======================================================
// MESSAGES
// ======================================================

function listenToMessages() {

  if (!currentConversationId) return;


  if (unsubscribeMessages) {
    unsubscribeMessages();
  }


  const messagesRef =
    collection(
      db,
      "conversations",
      currentConversationId,
      "messages"
    );


  const q =
    query(
      messagesRef,
      orderBy(
        "createdAt",
        "asc"
      ),
      limit(200)
    );


  unsubscribeMessages =
    onSnapshot(
      q,
      snapshot => {

        if (!messagesBox) return;


        if (snapshot.empty) {

          messagesBox.innerHTML = `
            <div class="empty">
              No messages yet. Say hello 👋
            </div>
          `;

          return;
        }


        messagesBox.innerHTML =
          snapshot.docs.map(
            messageDoc => {

              const message =
                messageDoc.data();


              const mine =
                message.senderId ===
                currentUser.uid;


              return `
                <div class="message ${
                  mine
                    ? "mine"
                    : "theirs"
                }">

                  <div class="bubble">

                    ${escapeHTML(
                      message.text || ""
                    )}

                    <small>
                      ${formatTime(
                       