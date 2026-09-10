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

    if (Number.isNaN(date.getTime())) return "";

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
    const date = timestamp.toDate
      ? timestamp.toDate()
      : new Date(timestamp);

    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleDateString([], {
      day: "numeric",
      month: "short",
      year: "numeric"
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


function isApprovedProfile(profile) {
  const status = String(
    profile?.status || ""
  ).toLowerCase();

  return (
    status === "approved" ||
    status === "active"
  );
}


function getDisplayName(profile) {
  return (
    profile?.display ||
    profile?.name ||
    profile?.username ||
    "JDA Member"
  );
}


// ======================================================
// AUTH TABS
// ======================================================

document
  .querySelectorAll("[data-auth]")
  .forEach(button => {

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

    if (unsubscribeChats) {
      unsubscribeChats();
      unsubscribeChats = null;
    }

    if (unsubscribeMessages) {
      unsubscribeMessages();
      unsubscribeMessages = null;
    }

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
      "Loading user profile:",
      uid
    );

    const profileRef =
      doc(db, "users", uid);

    const profileSnap =
      await getDoc(profileRef);


    // --------------------------------------------------
    // PROFILE DOES NOT EXIST
    // --------------------------------------------------

    if (!profileSnap.exists()) {

      console.error(
        "User is authenticated but profile is missing."
      );

      showOnly(authView);

      showToast(
        "Login worked, but your JDA profile was not found."
      );

      return;
    }


    currentProfile = {
      uid: uid,
      ...profileSnap.data()
    };


    console.log(
      "Loaded profile:",
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

      showOnly(authView);

      showToast(
        "This account has been disabled."
      );

      return;
    }


    // --------------------------------------------------
    // PENDING
    // --------------------------------------------------

    if (!isApprovedProfile(currentProfile)) {

      showOnly(pendingView);

      return;
    }


    // --------------------------------------------------
    // APPROVED / ACTIVE
    // --------------------------------------------------

    showOnly(appView);

    if (mobileNav) {
      mobileNav.classList.remove("hidden");
    }


    updateMeAvatar();


    // These functions have their own error handling.
    await checkAdmin();
    await updatePresence(false);


    renderPage("chats");


    console.log(
      "JDA Networks application opened successfully."
    );

  } catch (error) {

    console.error(
      "PROFILE LOADING ERROR:",
      error
    );

    /*
      IMPORTANT:
      Do not sign the user out here.

      If Firestore has a temporary problem,
      the Firebase login session should remain.
    */

    showOnly(authView);

    showToast(
      "Your account could not be loaded. Check Firebase/Firestore settings."
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

      console.log(
        "Attempting Firebase login..."
      );


      await signInWithEmailAndPassword(
        auth,
        email,
        password
      );


      console.log(
        "Firebase login successful."
      );


      /*
        DO NOT reload the page.

        onAuthStateChanged() automatically
        continues the login process.
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


    if (
      !name ||
      !phone ||
      !username ||
      !email ||
      !password
    ) {

      showToast(
        "Please complete all required fields."
      );

      return;
    }


    if (password.length < 8) {

      showToast(
        "Password must be at least 8 characters."
      );

      return;
    }


    const usernameClean =
      username
        .toLowerCase()
        .replace(/^@/, "")
        .trim();


    if (!/^[a-z0-9._-]{3,30}$/.test(usernameClean)) {

      showToast(
        "Username must be 3-30 characters and use letters, numbers, dots, underscores or hyphens."
      );

      return;
    }


    const button =
      registerForm.querySelector(
        "button[type='submit']"
      );


    if (button) {
      button.disabled = true;
      button.textContent = "Creating account...";
    }


    try {

      // ------------------------------------------------
      // CHECK USERNAME
      // ------------------------------------------------

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


      // ------------------------------------------------
      // CREATE AUTH ACCOUNT
      // ------------------------------------------------

      const credential =
        await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );


      const uid =
        credential.user.uid;


      // ------------------------------------------------
      // UPLOAD PHOTO
      // ------------------------------------------------

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


      // ------------------------------------------------
      // CREATE USER PROFILE
      // ------------------------------------------------

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

          online: false,

          created: serverTimestamp(),
          lastSeen: serverTimestamp()
        }
      );


      // ------------------------------------------------
      // RESERVE USERNAME
      // ------------------------------------------------

      await setDoc(
        usernameRef,
        {
          uid: uid,
          username: usernameClean,
          created: serverTimestamp()
        }
      );


      currentUser = credential.user;

      currentProfile = {
        uid: uid,
        display: name,
        name: name,
        phone: phone,
        username: usernameClean,
        email: email,
        photoURL: photoURL,
        status: "pending",
        online: false
      };


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

    } finally {

      if (button) {
        button.disabled = false;
        button.textContent = "Create account";
      }
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

    case "auth/user-disabled":
      return "This Firebase account has been disabled.";

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

    if (unsubscribeChats) {
      unsubscribeChats();
      unsubscribeChats = null;
    }

    if (unsubscribeMessages) {
      unsubscribeMessages();
      unsubscribeMessages = null;
    }

    await signOut(auth);

    currentUser = null;
    currentProfile = null;
    currentChatUser = null;
    currentConversationId = null;

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
// ADMIN CHECK
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

        if (page) {
          renderPage(page);
        }
      }
    );
  });


function renderPage(page) {

  if (!currentUser || !currentProfile) {
    return;
  }


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
    getDisplayName(profile);


  const photo =
    profile?.photoURL ||
    profile?.photo ||
    "";


  if (photo) {

    return `
      <div class="avatar ${escapeHTML(extraClass)}">
        <img
          src="${escapeHTML(photo)}"
          alt="${escapeHTML(name)}"
        >
      </div>
    `;
  }


  return `
    <div class="avatar ${escapeHTML(extraClass)}">
      ${escapeHTML(initials(name))}
    </div>
  `;
}


// ======================================================
// UPDATE MY AVATAR
// ======================================================

function updateMeAvatar() {

  const meAvatar =
    document.getElementById("meAvatar");


  if (!meAvatar || !currentProfile) {
    return;
  }


  const photo =
    currentProfile.photoURL ||
    currentProfile.photo ||
    "";


  const name =
    getDisplayName(currentProfile);


  if (photo) {

    meAvatar.innerHTML = `
      <img
        src="${escapeHTML(photo)}"
        alt="${escapeHTML(name)}"
      >
    `;

  } else {

    meAvatar.textContent =
      initials(name);
  }
}


// ======================================================
// CHATS PAGE
// ======================================================

function renderChats() {

  if (!pageContent) return;


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

              const profile =
                userSnap.data();


              if (!isApprovedProfile(profile)) {
                continue;
              }


              chats.push({
                id: chatDoc.id,
                profile: {
                  uid: otherUid,
                  ...profile
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


        // Newest chats first

        chats.sort((a, b) => {

          const aTime =
            a.data.updatedAt?.toMillis?.() || 0;

          const bTime =
            b.data.updatedAt?.toMillis?.() || 0;

          return bTime - aTime;
        });


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
              getDisplayName(
                chat.profile
              );


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


        // Chat search

        const searchInput =
          document.getElementById(
            "chatSearch"
          );


        searchInput?.addEventListener(
          "input",
          () => {

            const term =
              searchInput.value
                .trim()
                .toLowerCase();


            document
              .querySelectorAll(
                "[data-chat-user]"
              )
              .forEach(button => {

                const text =
                  button.textContent
                    .toLowerCase();


                button.style.display =
                  !term ||
                  text.includes(term)
                    ? ""
                    : "none";
              });
          }
        );

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
              <br><br>
              Check your Firestore rules.
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

  if (!pageContent) return;


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


  if (!results || !currentUser) return;


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
          getDisplayName(profile);


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


    if (!isApprovedProfile(profile)) {

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
      getDisplayName(
        currentChatUser
      );


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
          : (
            currentChatUser.lastSeen
              ? `last seen ${formatTime(
                  currentChatUser.lastSeen
                )}`
              : "offline"
          );
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
            alt="${escapeHTML(name)}"
          >
        `;

      } else {

        avatar.textContent =
          initials(name);
      }
    }


    if (messagesBox) {
      messagesBox.innerHTML = `
        <div class="empty">
          Loading messages...
        </div>
      `;
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
// MESSAGES LISTENER
// ======================================================

function listenToMessages() {

  if (
    !currentConversationId ||
    !currentUser
  ) {
    return;
  }


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
              No messages yet.<br>
              Say hello 👋
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

                    <span>
                      ${escapeHTML(
                        message.text || ""
                      )}
                    </span>

                    <small>
                      ${escapeHTML(
                        formatTime(
                          message.createdAt
                        )
                      )}
                    </small>

                  </div>

                </div>
              `;

            }
          ).join("");


        messagesBox.scrollTop =
          messagesBox.scrollHeight;

      },
      error => {

        console.error(
          "MESSAGES LISTENER ERROR:",
          error
        );


        if (messagesBox) {

          messagesBox.innerHTML = `
            <div class="empty">
              Unable to load messages.
            </div>
          `;
        }
      }
    );
}


// ======================================================
// SEND MESSAGE
// ======================================================

document
  .getElementById("messageForm")
  ?.addEventListener(
    "submit",
    async event => {

      event.preventDefault();


      if (
        !currentUser ||
        !currentChatUser ||
        !currentConversationId
      ) {
        return;
      }


      const input =
        document.getElementById(
          "messageInput"
        );


      if (!input) return;


      const text =
        input.value.trim();


      if (!text) return;


      const button =
        document.querySelector(
          "#messageForm button[type='submit']"
        );


      if (button) {
        button.disabled = true;
      }


      try {

        const messageRef =
          collection(
            db,
            "conversations",
            currentConversationId,
            "messages"
          );


        await addDoc(
          messageRef,
          {
            senderId:
              currentUser.uid,

            receiverId:
              currentChatUser.uid,

            text: text,

            createdAt:
              serverTimestamp(),

            read: false
          }
        );


        await updateDoc(
          doc(
            db,
            "conversations",
            currentConversationId
          ),
          {
            lastMessage: text,

            lastSenderId:
              currentUser.uid,

            updatedAt:
              serverTimestamp()
          }
        );


        input.value = "";

        input.focus();

      } catch (error) {

        console.error(
          "SEND MESSAGE ERROR:",
          error
        );

        showToast(
          "Message could not be sent."
        );

      } finally {

        if (button) {
          button.disabled = false;
        }
      }
    }
  );


// ======================================================
// OUMA JONATHAN
// ======================================================

function openOumaJonathan() {

  if (!chatModal) return;


  currentChatUser = {
    uid: "ouma-jonathan",
    display: "Ouma Jonathan",
    online: true,
    isAI: true
  };


  currentConversationId = null;


  const nameElement =
    document.getElementById(
      "chatName"
    );


  const statusElement =
    document.getElementById(
      "chatStatus"
    );


  const avatar =
    document.getElementById(
      "chatAvatar"
    );


  if (nameElement) {
    nameElement.textContent =
      "Ouma Jonathan";
  }


  if (statusElement) {
    statusElement.textContent =
      "AI assistant • online";
  }


  if (avatar) {
    avatar.textContent = "O";
  }


  if (messagesBox) {

    messagesBox.innerHTML = `

      <div class="message theirs">

        <div class="bubble">

          <span>
            Hello 👋 I'm Ouma Jonathan.
            How can I help you today?
          </span>

          <small>
            Now
          </small>

        </div>

      </div>

    `;
  }


  chatModal.classList.remove(
    "hidden"
  );


  const form =
    document.getElementById(
      "messageForm"
    );


  const input =
    document.getElementById(
      "messageInput"
    );


  // Replace normal message handler for AI
  if (form) {

    form.onsubmit = async event => {

      event.preventDefault();


      const text =
        input?.value.trim();


      if (!text || !messagesBox) {
        return;
      }


      messagesBox.insertAdjacentHTML(
        "beforeend",
        `
          <div class="message mine">

            <div class="bubble">

              <span>
                ${escapeHTML(text)}
              </span>

              <small>
                Now
              </small>

            </div>

          </div>
        `
      );


      if (input) {
        input.value = "";
      }


      messagesBox.insertAdjacentHTML(
        "beforeend",
        `
          <div class="message theirs">

            <div class="bubble">

              <span>
                Ouma Jonathan is ready to help.
                A real AI connection can be added
                to this assistant later.
              </span>

              <small>
                Now
              </small>

            </div>

          </div>
        `
      );


      messagesBox.scrollTop =
        messagesBox.scrollHeight;
    };
  }
}


// ======================================================
// PROFILE PAGE
// ======================================================

function renderProfile() {

  if (!pageContent || !currentProfile) {
    return;
  }


  const name =
    getDisplayName(
      currentProfile
    );


  pageContent.innerHTML = `

    <div class="profile-card">

      ${avatarHTML(
        currentProfile,
        "profile-avatar"
      )}

      <h2>
        ${escapeHTML(name)}
      </h2>

      <p>
        @${escapeHTML(
          currentProfile.username || ""
        )}
      </p>

      <div class="profile-info">

        <div>
          <strong>Phone</strong>
          <span>
            ${escapeHTML(
              currentProfile.phone || "Not provided"
            )}
          </span>
        </div>

        <div>
          <strong>Email</strong>
          <span>
            ${escapeHTML(
              currentProfile.email || "Not provided"
            )}
          </span>
        </div>

        <div>
          <strong>Status</strong>
          <span>
            ${escapeHTML(
              currentProfile.status || "unknown"
            )}
          </span>
        </div>

      </div>

      <label class="primary">
        Change profile photo

        <input
          id="profilePhotoInput"
          type="file"
          accept="image/*"
          hidden
        >
      </label>

    </div>
  `;


  document
    .getElementById(
      "profilePhotoInput"
    )
    ?.addEventListener(
      "change",
      uploadProfilePhoto
    );
}


// ======================================================
// UPLOAD PROFILE PHOTO
// ======================================================

async function uploadProfilePhoto(event) {

  if (!currentUser) return;


  const file =
    event.target.files?.[0];


  if (!file) return;


  if (!file.type.startsWith("image/")) {

    showToast(
      "Please select an image."
    );

    return;
  }


  if (file.size > 5 * 1024 * 1024) {

    showToast(
      "Photo must be smaller than 5 MB."
    );

    return;
  }


  try {

    showToast(
      "Uploading photo..."
    );


    const photoRef =
      ref(
        storage,
        `profilePhotos/${currentUser.uid}/profile`
      );


    await uploadBytes(
      photoRef,
      file
    );


    const photoURL =
      await getDownloadURL(
        photoRef
      );


    await updateDoc(
      doc(
        db,
        "users",
        currentUser.uid
      ),
      {
        photoURL:
          photoURL
      }
    );


    currentProfile.photoURL =
      photoURL;


    updateMeAvatar();


    renderProfile();


    showToast(
      "Profile photo updated."
    );

  } catch (error) {

    console.error(
      "PHOTO UPLOAD ERROR:",
      error
    );

    showToast(
      "Unable to upload profile photo."
    );
  }
}


// ======================================================
// STATUS PAGE
// ======================================================

function renderStatus() {

  if (!pageContent) return;


  pageContent.innerHTML = `

    <div class="empty-state">

      <h2>Status</h2>

      <p>
        Status updates will appear here.
      </p>

      <button
        class="primary"
        id="createStatusBtn"
        type="button"
      >
        Create status
      </button>

    </div>
  `;


  document
    .getElementById(
      "createStatusBtn"
    )
    ?.addEventListener(
      "click",
      () => {

        showToast(
          "Status creation will be added next."
        );
      }
    );
}


// ======================================================
// CALLS PAGE
// ======================================================

function renderCalls() {

  if (!pageContent) return;


  pageContent.innerHTML = `

    <div class="empty-state">

      <h2>Calls</h2>

      <p>
        Your JDA Networks calls will appear here.
      </p>

      <p>
        Voice and video calling can be connected
        to this section later.
      </p>

    </div>
  `;
}


// ======================================================
// NOTIFICATIONS PAGE
// ======================================================

function renderNotifications() {

  if (!pageContent) return;


  pageContent.innerHTML = `

    <div class="empty-state">

      <h2>Notifications</h2>

      <p>
        You have no new notifications.
      </p>

    </div>
  `;
}


// ======================================================
// SETTINGS PAGE
// ======================================================

function renderSettings() {

  if (!pageContent) return;


  pageContent.innerHTML = `

    <div class="settings">

      <div class="card">

        <h3>
          Account
        </h3>

        <p>
          ${escapeHTML(
            currentProfile?.email || ""
          )}
        </p>

      </div>

      <div class="card">

        <h3>
          Privacy
        </h3>

        <p>
          Your account is protected by
          Firebase Authentication.
        </p>

      </div>

      <div class="card">

        <h3>
          JDA Networks
        </h3>

        <p>
          Version 1.0
        </p>

      </div>

      <button
        id="settingsLogout"
        class="danger"
        type="button"
      >
        Log out
      </button>

    </div>
  `;


  document
    .getElementById(
      "settingsLogout"
    )
    ?.addEventListener(
      "click",
      logout
    );
}


// ======================================================
// ADMIN PAGE
// ======================================================

async function renderAdmin() {

  if (!pageContent || !currentUser) {
    return;
  }


  const isAdmin =
    await checkAdmin();


  if (!isAdmin) {

    pageContent.innerHTML = `

      <div class="empty-state">

        <h2>
          Access denied
        </h2>

        <p>
          You do not have administrator permission.
        </p>

      </div>
    `;

    return;
  }


  pageContent.innerHTML = `

    <div class="admin-page">

      <h2>
        Registration requests
      </h2>

      <div
        id="pendingUsers"
        class="list"
      >

        <div class="empty">
          Loading pending registrations...
        </div>

      </div>

      <h2>
        Approved members
      </h2>

      <div
        id="approvedUsers"
        class="list"
      >

        <div class="empty">
          Loading members...
        </div>

      </div>

    </div>
  `;


  await loadPendingUsers();
  await loadApprovedUsers();
}


// ======================================================
// LOAD PENDING USERS
// ======================================================

async function loadPendingUsers() {

  const container =
    document.getElementById(
      "pendingUsers"
    );


  if (!container) return;


  try {

    const snapshot =
      await getDocs(
        query(
          collection(db, "users"),
          where(
            "status",
            "==",
            "pending"
          ),
          limit(100)
        )
      );


    if (snapshot.empty) {

      container.innerHTML = `
        <div class="empty">
          No pending registrations.
        </div>
      `;

      return;
    }


    container.innerHTML =
      snapshot.docs.map(
        userDoc => {

          const profile =
            userDoc.data();


          const name =
            getDisplayName(profile);


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

                <small>
                  ${escapeHTML(
                    profile.email || ""
                  )}
                </small>

                <small>
                  Registered:
                  ${formatDate(
                    profile.created
                  )}
                </small>

              </div>

              <div class="admin-actions">

                <button
                  class="primary small-btn"
                  type="button"
                  data-approve="${escapeHTML(
                    userDoc.id
                  )}"
                >
                  Approve
                </button>

                <button
                  class="danger small-btn"
                  type="button"
                  data-reject="${escapeHTML(
                    userDoc.id
                  )}"
                >
                  Reject
                </button>

              </div>

            </div>
          `;
        }
      ).join("");


    document
      .querySelectorAll(
        "[data-approve]"
      )
      .forEach(button => {

        button.addEventListener(
          "click",
          () => {

            approveUser(
              button.dataset.approve
            );
          }
        );
      });


    document
      .querySelectorAll(
        "[data-reject]"
      )
      .forEach(button => {

        button.addEventListener(
          "click",
          () => {

            rejectUser(
              button.dataset.reject
            );
          }
        );
      });

  } catch (error) {

    console.error(
      "PENDING USERS ERROR:",
      error
    );


    container.innerHTML = `
      <div class="empty">
        Unable to load registrations.
      </div>
    `;
  }
}


// ======================================================
// APPROVE USER
// ======================================================

async function approveUser(uid) {

  if (!uid) return;


  try {

    await updateDoc(
      doc(
        db,
        "users",
        uid
      ),
      {
        status: "approved"
      }
    );


    showToast(
      "Member approved."
    );


    renderAdmin();

  } catch (error) {

    console.error(
      "APPROVE USER ERROR:",
      error
    );


    showToast(
      "Unable to approve member."
    );
  }
}


// ======================================================
// REJECT USER
// ======================================================

async function rejectUser(uid) {

  if (!uid) return;


  try {

    await updateDoc(
      doc(
        db,
        "users",
        uid
      ),
      {
        status: "rejected"
      }
    );


    showToast(
      "Member rejected."
    );


    renderAdmin();

  } catch (error) {

    console.error(
      "REJECT USER ERROR:",
      error
    );


    showToast(
      "Unable to reject member."
    );
  }
}


// ======================================================
// LOAD APPROVED USERS
// ======================================================

async function loadApprovedUsers() {

  const container =
    document.getElementById(
      "approvedUsers"
    );


  if (!container) return;


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


    if (snapshot.empty) {

      container.innerHTML = `
        <div class="empty">
          No approved members.
        </div>
      `;

      return;
    }


    container.innerHTML =
      snapshot.docs.map(
        userDoc => {

          const profile =
            userDoc.data();


          const name =
            getDisplayName(profile);


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

              <span
                class="${
                  profile.online
                    ? "online"
                    : "offline"
                }"
              >
                ${
                  profile.online
                    ? "Online"
                    : "Offline"
                }
              </span>

            </div>
          `;
        }
      ).join("");

  } catch (error) {

    console.error(
      "APPROVED USERS ERROR:",
      error
    );


    container.innerHTML = `
      <div class="empty">
        Unable to load members.
      </div>
    `;
  }
}


// ======================================================
// SEARCH BUTTON
// ======================================================

document
  .getElementById("searchBtn")
  ?.addEventListener(
    "click",
    () => {

      renderPage("network");

      setTimeout(() => {

        document
          .getElementById("memberSearch")
          ?.focus();

      }, 100);
    }
  );


// ======================================================
// ONLINE PRESENCE HEARTBEAT
// ======================================================

setInterval(
  async () => {

    if (
      currentUser &&
      currentProfile &&
      isApprovedProfile(currentProfile)
    ) {

      await updatePresence(false);
    }

  },
  60000
);


// ======================================================
// PAGE VISIBILITY
// ======================================================

document.addEventListener(
  "visibilitychange",
  async () => {

    if (
      document.visibilityState === "visible" &&
      currentUser &&
      currentProfile &&
      isApprovedProfile(currentProfile)
    ) {

      await updatePresence(false);
    }
  }
);


// ======================================================
// INITIAL UI
// ======================================================

if (!auth.currentUser) {
  showOnly(authView);
}

console.log(
  "JDA Networks app.js loaded successfully."
);