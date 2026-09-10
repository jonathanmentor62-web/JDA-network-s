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
// JDA NETWORKS - MAIN APP
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
// HELPERS
// ======================================================

function showToast(message) {
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}


function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function initials(name = "J") {
  const words = name.trim().split(/\s+/);

  if (!words.length) return "J";

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
    if (element) element.classList.add("hidden");
  });

  if (view) view.classList.remove("hidden");
}


// ======================================================
// FIREBASE AUTH
// ======================================================

onAuthStateChanged(auth, async user => {

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

    console.log("Loading JDA profile for UID:", uid);

    const profileRef = doc(db, "users", uid);
    const profileSnap = await getDoc(profileRef);

    if (!profileSnap.exists()) {

      console.error("Profile document does not exist:", uid);

      showOnly(authView);

      showToast(
        "Account profile couldn't be found. Please contact the administrator."
      );

      return;
    }

    currentProfile = {
      uid: uid,
      ...profileSnap.data()
    };

    console.log("JDA profile loaded:", currentProfile);

    const status = String(
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

      showToast(
        "This account has been disabled."
      );

      return;
    }


    // --------------------------------------------------
    // PENDING
    // --------------------------------------------------

    if (status !== "approved") {

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

    await updatePresence();

    await checkAdmin();

    renderPage("chats");

  } catch (error) {

    console.error(
      "Profile loading error:",
      error
    );

    showOnly(authView);

    showToast(
      "Unable to load your account profile."
    );
  }
}


// ======================================================
// LOGIN
// ======================================================

if (loginForm) {

  loginForm.addEventListener("submit", async event => {

    event.preventDefault();

    const email =
      document.getElementById("loginEmail").value.trim();

    const password =
      document.getElementById("loginPassword").value;

    try {

      await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

      showToast("Login successful.");

    } catch (error) {

      console.error(error);

      showToast(getAuthError(error));
    }
  });
}


// ======================================================
// REGISTRATION
// ======================================================

if (registerForm) {

  registerForm.addEventListener("submit", async event => {

    event.preventDefault();

    const name =
      document.getElementById("regName").value.trim();

    const phone =
      document.getElementById("regPhone").value.trim();

    const username =
      document.getElementById("regUsername").value.trim();

    const email =
      document.getElementById("regEmail").value.trim();

    const password =
      document.getElementById("regPassword").value;

    const photoInput =
      document.getElementById("regPhoto");

    try {

      // ----------------------------------------------
      // Check username
      // ----------------------------------------------

      const usernameRef =
        doc(
          db,
          "usernames",
          username.toLowerCase()
        );

      const usernameSnap =
        await getDoc(usernameRef);

      if (usernameSnap.exists()) {

        showToast(
          "That username is already taken."
        );

        return;
      }


      // ----------------------------------------------
      // Create Firebase Authentication account
      // ----------------------------------------------

      const credential =
        await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );

      const uid = credential.user.uid;


      // ----------------------------------------------
      // Optional profile photo
      // ----------------------------------------------

      let photoURL = "";

      if (
        photoInput &&
        photoInput.files &&
        photoInput.files.length > 0
      ) {

        const file = photoInput.files[0];

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
          await getDownloadURL(photoRef);
      }


      // ----------------------------------------------
      // Create user profile
      // ----------------------------------------------

      await setDoc(
        doc(db, "users", uid),
        {
          uid: uid,
          display: name,
          name: name,
          phone: phone,
          username: username,
          email: email,
          photoURL: photoURL,
          status: "pending",
          created: serverTimestamp(),
          lastSeen: serverTimestamp()
        }
      );


      // ----------------------------------------------
      // Reserve username
      // ----------------------------------------------

      await setDoc(
        usernameRef,
        {
          uid: uid,
          username: username,
          created: serverTimestamp()
        }
      );


      showToast(
        "Registration submitted for approval."
      );

      showOnly(pendingView);

    } catch (error) {

      console.error(
        "Registration error:",
        error
      );

      showToast(
        getAuthError(error)
      );
    }
  });
}


// ======================================================
// AUTH ERROR MESSAGES
// ======================================================

function getAuthError(error) {

  const code = error?.code || "";

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
      return "Too many attempts. Please try again later.";

    default:
      return error?.message || "Something went wrong.";
  }
}


// ======================================================
// LOGOUT
// ======================================================

async function logout() {

  try {

    if (currentUser) {
      await updatePresence(true);
    }

    await signOut(auth);

    currentUser = null;
    currentProfile = null;

  } catch (error) {

    console.error(error);

    showToast(
      "Unable to log out."
    );
  }
}


document
  .getElementById("logoutBtn")
  ?.addEventListener("click", logout);

document
  .getElementById("pendingLogout")
  ?.addEventListener("click", logout);

document
  .getElementById("rejectedLogout")
  ?.addEventListener("click", logout);


// ======================================================
// ADMIN CHECK
// ======================================================

async function checkAdmin() {

  if (!currentUser) return false;

  try {

    const adminRef =
      doc(
        db,
        "admins",
        currentUser.uid
      );

    const adminSnap =
      await getDoc(adminRef);

    const isAdmin =
      adminSnap.exists();

    if (adminNav) {

      if (isAdmin) {
        adminNav.classList.remove("hidden");
      } else {
        adminNav.classList.add("hidden");
      }
    }

    return isAdmin;

  } catch (error) {

    console.error(
      "Admin check failed:",
      error
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
      doc(db, "users", currentUser.uid),
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
      "Manage your JDA Networks account"
    ],

    admin: [
      "Admin",
      "Manage registrations"
    ]
  };


  const title =
    titles[page] || [
      "JDA Networks",
      ""
    ];


  if (pageTitle) {
    pageTitle.textContent = title[0];
  }

  if (pageSubtitle) {
    pageSubtitle.textContent = title[1];
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

function avatarHTML(profile, size = "") {

  const name =
    profile?.display ||
    profile?.name ||
    "J";

  const photo =
    profile?.photoURL ||
    profile?.photo ||
    "";

  if (photo) {

    return `
      <div class="avatar ${size}">
        <img
          src="${escapeHTML(photo)}"
          alt="${escapeHTML(name)}"
        >
      </div>
    `;
  }

  return `
    <div class="avatar ${size}">
      ${escapeHTML(initials(name))}
    </div>
  `;
}


// ======================================================
// CHATS
// ======================================================

function renderChats() {

  pageContent.innerHTML = `
    <div class="search-box">
      <input
        id="chatSearch"
        type="search"
        placeholder="Search chats"
      >
    </div>

    <div id="chatList" class="list">
      <div class="empty-state">
        Loading conversations...
      </div>
    </div>

    <div class="ai-card" id="oumaCard">
      <div class="ai-avatar">O</div>
      <div>
        <strong>Ouma Jonathan</strong>
        <p>Ask Ouma Jonathan anything</p>
      </div>
    </div>
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
    collection(db, "conversations");


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
          document.getElementById("chatList");

        if (!chatList) return;


        if (snapshot.empty) {

          chatList.innerHTML = `
            <div class="empty-state">
              <h3>No chats yet</h3>
              <p>Find someone in your Network and start a conversation.</p>
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
              uid => uid !== currentUser.uid
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

            if (
              userSnap.exists()
            ) {

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
              "Could not load chat user:",
              error
            );
          }
        }


        if (!chats.length) {

          chatList.innerHTML = `
            <div class="empty-state">
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
                data-chat-user="${escapeHTML(chat.profile.uid)}"
              >
                ${avatarHTML(chat.profile)}

                <div class="row-main">
                  <strong>
                    ${escapeHTML(name)}
                  </strong>

                  <span>
                    ${escapeHTML(
                      chat.data.lastMessage ||
                      "Start chatting"
                    )}
                  </span>
                </div>

                <small>
                  ${formatTime(chat.data.updatedAt)}
                </small>
              </button>
            `;

          }).join("");


        document
          .querySelectorAll("[data-chat-user]")
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
          "Chat listener error:",
          error
        );

        const chatList =
          document.getElementById("chatList");

        if (chatList) {

          chatList.innerHTML = `
            <div class="empty-state">
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
        type="search"
        placeholder="Search by name or username..."
      >
    </div>

    <div id="memberResults" class="list">

      <div class="empty-state">
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


  term = term.trim().toLowerCase();


  if (!term) {

    results.innerHTML = `
      <div class="empty-state">
        Search for JDA Networks members.
      </div>
    `;

    return;
  }


  results.innerHTML = `
    <div class="empty-state">
      Searching...
    </div>
  `;


  try {

    const snapshot =
      await getDocs(
        query(
          collection(db, "users"),
          where("status", "==", "approved"),
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
        <div class="empty-state">
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

              <strong>
                ${escapeHTML(name)}
              </strong>

              <span>
                @${escapeHTML(
                  profile.username || ""
                )}
              </span>

            </div>

            <button
              class="primary small-btn"
              data-message-user="${escapeHTML(profile.uid)}"
            >
              Message
            </button>

          </div>
        `;

      }).join("");


    document
      .querySelectorAll("[data-message-user]")
      .forEach(button => {

        button.addEventListener(
          "click",
          () => {

            openChat(
              button.dataset.messageUser
            );
          }
        );
      });


  } catch (error) {

    console.error(
      "Member search error:",
      error
    );

    results.innerHTML = `
      <div class="empty-state">
        Unable to search members.
      </div>
    `;
  }
}


// ======================================================
// OPEN CHAT
// ======================================================

async function openChat(otherUid) {

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


    currentChatUser = {
      uid: otherUid,
      ...userSnap.data()
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
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      },
      {
        merge: true
      }
    );


    const chatName =
      currentChatUser.display ||
      currentChatUser.name ||
      currentChatUser.username ||
      "Chat";


    document.getElementById(
      "chatName"
    ).textContent = chatName;


    document.getElementById(
      "chatStatus"
    ).textContent =
      currentChatUser.online
        ? "online"
        : "offline";


    const chatAvatar =
      document.getElementById(
        "chatAvatar"
      );


    if (chatAvatar) {

      if (currentChatUser.photoURL) {

        chatAvatar.innerHTML = `
          <img
            src="${escapeHTML(
              currentChatUser.photoURL
            )}"
            alt=""
          >
        `;

      } else {

        chatAvatar.textContent =
          initials(chatName);
      }
    }


    chatModal?.classList.remove(
      "hidden"
    );


    listenToMessages();


  } catch (error) {

    console.error(
      "Open chat error:",
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
// LISTEN TO MESSAGES
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
      orderBy("createdAt", "asc"),
      limit(200)
    );


  unsubscribeMessages =
    onSnapshot(
      q,
      snapshot => {

        if (!messagesBox) return;


        if (snapshot.empty) {

          messagesBox.innerHTML = `
            <div class="empty-state">
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
                        message.createdAt
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
          "Message listener error:",
          error
        );

        showToast(
          "Unable to load messages."
        );
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


      const input =
        document.getElementById(
          "messageInput"
        );


      const text =
        input?.value.trim();


      if (!text) return;


      if (
        !currentUser ||
        !currentConversationId ||
        !currentChatUser
      ) {

        showToast(
          "Open a chat first."
        );

        return;
      }


      try {

        await addDoc(
          collection(
            db,
            "conversations",
            currentConversationId,
            "messages"
          ),
          {
            senderId: currentUser.uid,
            receiverId:
              currentChatUser.uid,
            text: text,
            createdAt:
              serverTimestamp()
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

      } catch (error) {

        console.error(
          "Send message error:",
          error
        );

        showToast(
          "Message could not be sent."
        );
      }
    }
  );


// ======================================================
// OUMA JONATHAN
// ======================================================

function openOumaJonathan() {

  currentChatUser = null;
  currentConversationId = null;


  document.getElementById(
    "chatName"
  ).textContent =
    "Ouma Jonathan";


  document.getElementById(
    "chatStatus"
  ).textContent =
    "AI assistant • online";


  document.getElementById(
    "chatAvatar"
  ).textContent = "O";


  if (messagesBox) {

    messagesBox.innerHTML = `

      <div class="message theirs">

        <div class="bubble">

          Hello 👋 I'm Ouma Jonathan.
          How can I help you today?

        </div>

      </div>

    `;
  }


  chatModal?.classList.remove(
    "hidden"
  );


  showToast(
    "Ouma Jonathan is ready."
  );
}


// ======================================================
// PROFILE
// ======================================================

function renderProfile() {

  const name =
    currentProfile?.display ||
    currentProfile?.name ||
    "JDA Member";


  pageContent.innerHTML = `

    <div class="profile-card">

      ${avatarHTML(
        currentProfile || {},
        "large"
      )}

      <h2>
        ${escapeHTML(name)}
      </h2>

      <p class="muted">
        @${escapeHTML(
          currentProfile?.username || ""
        )}
      </p>

      <p>
        ${escapeHTML(
          currentProfile?.email || ""
        )}
      </p>

      <p>
        ${escapeHTML(
          currentProfile?.phone || ""
        )}
      </p>

    </div>

    <div class="card">

      <h3>Change profile photo</h3>

      <input
        id="profilePhotoInput"
        type="file"
        accept="image/*"
      >

      <button
        id="uploadProfilePhoto"
        class="primary"
      >
        Upload photo
      </button>

    </div>
  `;


  document
    .getElementById(
      "uploadProfilePhoto"
    )
    ?.addEventListener(
      "click",
      uploadProfilePhoto
    );
}


// ======================================================
// UPLOAD PROFILE PHOTO
// ======================================================

async function uploadProfilePhoto() {

  const input =
    document.getElementById(
      "profilePhotoInput"
    );


  if (
    !input ||
    !input.files ||
    !input.files.length
  ) {

    showToast(
      "Choose a photo first."
    );

    return;
  }


  const file =
    input.files[0];


  if (file.size > 5 * 1024 * 1024) {

    showToast(
      "Photo must be smaller than 5 MB."
    );

    return;
  }


  if (!file.type.startsWith("image/")) {

    showToast(
      "Please choose an image."
    );

    return;
  }


  try {

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
        photoURL: photoURL
      }
    );


    currentProfile.photoURL =
      photoURL;


    showToast(
      "Profile photo updated."
    );


    renderProfile();


  } catch (error) {

    console.error(error);

    showToast(
      "Unable to upload photo."
    );
  }
}


// ======================================================
// SETTINGS
// ======================================================

function renderSettings() {

  pageContent.innerHTML = `

    <div class="card">

      <h3>Account</h3>

      <p>
        <strong>Email:</strong>
        ${escapeHTML(
          currentProfile?.email || ""
        )}
      </p>

      <p>
        <strong>Status:</strong>
        ${escapeHTML(
          currentProfile?.status || ""
        )}
      </p>

    </div>

    <div class="card">

      <h3>Privacy & Security</h3>

      <p class="muted">
        Keep your account information secure.
      </p>

    </div>

    <div class="card">

      <button
        id="settingsLogout"
        class="secondary"
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
// STATUS
// ======================================================

function renderStatus() {

  pageContent.innerHTML = `

    <div class="card">

      <h3>Status</h3>

      <p>
        Status and stories will appear here.
      </p>

      <p class="muted">
        Your JDA Networks status system can be
        expanded with photos, videos and text updates.
      </p>

    </div>
  `;
}


// ======================================================
// CALLS
// ======================================================

function renderCalls() {

  pageContent.innerHTML = `

    <div class="card">

      <h3>Calls</h3>

      <p>
        Your calls will appear here.
      </p>

      <p class="muted">
        Voice and video calling can be connected
        to this section.
      </p>

    </div>
  `;
}


// ======================================================
// NOTIFICATIONS
// ======================================================

function renderNotifications() {

  pageContent.innerHTML = `

    <div class="card">

      <h3>Notifications</h3>

      <p>
        You have no new notifications.
      </p>

    </div>
  `;
}


// ======================================================
// ADMIN PANEL
// ======================================================

async function renderAdmin() {

  const isAdmin =
    await checkAdmin();


  if (!isAdmin) {

    pageContent.innerHTML = `

      <div class="card">

        <h3>Access denied</h3>

        <p>
          You are not authorized to access
          the JDA Networks administrator area.
        </p>

      </div>
    `;

    return;
  }


  pageContent.innerHTML = `

    <div class="card">

      <h3>Registration approvals</h3>

      <p class="muted">
        Review new JDA Networks registrations.
      </p>

    </div>

    <div id="pendingUsers">

      <div class="empty-state">
        Loading pending registrations...
      </div>

    </div>

    <div class="card">

      <h3>Approved members</h3>

      <div id="approvedUsers">
        Loading...
      </div>

    </div>
  `;


  loadPendingUsers();
  loadApprovedUsers();
}


// ======================================================
// PENDING USERS
// ======================================================

async function loadPendingUsers() {

  const box =
    document.getElementById(
      "pendingUsers"
    );


  if (!box) return;


  try {

    const snapshot =
      await getDocs(
        query(
          collection(db, "users"),
          where("status", "==", "pending"),
          limit(100)
        )
      );


    if (snapshot.empty) {

      box.innerHTML = `
        <div class="empty-state">
          No pending registrations 🎉
        </div>
      `;

      return;
    }


    box.innerHTML =
      snapshot.docs.map(
        userDoc => {

          const user = {
            uid: userDoc.id,
            ...userDoc.data()
          };


          const name =
            user.display ||
            user.name ||
            "New member";


          return `

            <div class="member-row">

              ${avatarHTML(user)}

              <div class="row-main">

                <strong>
                  ${escapeHTML(name)}
                </strong>

                <span>
                  @${escapeHTML(
                    user.username || ""
                  )}
                </span>

                <small>
                  ${escapeHTML(
                    user.email || ""
                  )}
                </small>

                <small>
                  ${escapeHTML(
                    user.phone || ""
                  )}
                </small>

              </div>

              <div class="admin-actions">

                <button
                  class="primary small-btn"
                  data-approve="${escapeHTML(user.uid)}"
                >
                  Approve
                </button>

                <button
                  class="secondary small-btn"
                  data-reject="${escapeHTML(user.uid)}"
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
          () => approveUser(
            button.dataset.approve
          )
        );
      });


    document
      .querySelectorAll(
        "[data-reject]"
      )
      .forEach(button => {

        button.addEventListener(
          "click",
          () => rejectUser(
            button.dataset.reject
          )
        );
      });


  } catch (error) {

    console.error(
      "Pending users error:",
      error
    );

    box.innerHTML = `
      <div class="empty-state">
        Unable to load pending registrations.
      </div>
    `;
  }
}


// ======================================================
// APPROVE USER
// ======================================================

async function approveUser(uid) {

  if (!currentUser) return;


  const isAdmin =
    await checkAdmin();


  if (!isAdmin) {

    showToast(
      "Administrator access required."
    );

    return;
  }


  try {

    await updateDoc(
      doc(
        db,
        "users",
        uid
      ),
      {
        status: "approved",
        approvedAt:
          serverTimestamp(),
        approvedBy:
          currentUser.uid
      }
    );


    showToast(
      "Registration approved."
    );


    loadPendingUsers();
    loadApprovedUsers();


  } catch (error) {

    console.error(
      "Approve error:",
      error
    );

    showToast(
      "Unable to approve registration."
    );
  }
}


// ======================================================
// REJECT USER
// ======================================================

async function rejectUser(uid) {

  if (!currentUser) return;


  const isAdmin =
    await checkAdmin();


  if (!isAdmin) {

    showToast(
      "Administrator access required."
    );

    return;
  }


  try {

    await updateDoc(
      doc(
        db,
        "users",
        uid
      ),
      {
        status: "rejected",
        rejectedAt:
          serverTimestamp(),
        rejectedBy:
          currentUser.uid
      }
    );


    showToast(
      "Registration rejected."
    );


    loadPendingUsers();
    loadApprovedUsers();


  } catch (error) {

    console.error(
      "Reject error:",
      error
    );

    showToast(
      "Unable to reject registration."
    );
  }
}


// ======================================================
// APPROVED USERS
// ======================================================

async function loadApprovedUsers() {

  const box =
    document.getElementById(
      "approvedUsers"
    );


  if (!box) return;


  try {

    const snapshot =
      await getDocs(
        query(
          collection(db, "users"),
          where("status", "==", "approved"),
          limit(100)
        )
      );


    if (snapshot.empty) {

      box.innerHTML =
        "No approved members.";

      return;
    }


    box.innerHTML =
      snapshot.docs.map(
        userDoc => {

          const user = {
            uid: userDoc.id,
            ...userDoc.data()
          };


          return `

            <div class="member-row">

              ${avatarHTML(user)}

              <div class="row-main">

                <strong>
                  ${escapeHTML(
                    user.display ||
                    user.name ||
                    "Member"
                  )}
                </strong>

                <span>
                  @${escapeHTML(
                    user.username || ""
                  )}
                </span>

              </div>

            </div>
          `;

        }
      ).join("");


  } catch (error) {

    console.error(
      "Approved users error:",
      error
    );

    box.innerHTML =
      "Unable to load approved members.";
  }
}


// ======================================================
// ME AVATAR
// ======================================================

function updateMeAvatar() {

  const avatar =
    document.getElementById(
      "meAvatar"
    );


  if (!avatar) return;


  const name =
    currentProfile?.display ||
    currentProfile?.name ||
    "J";


  if (currentProfile?.photoURL) {

    avatar.innerHTML = `
      <img
        src="${escapeHTML(
          currentProfile.photoURL
        )}"
        alt=""
      >
    `;

  } else {

    avatar.textContent =
      initials(name);
  }
}


// ======================================================
// KEEP PRESENCE ALIVE
// ======================================================

setInterval(
  () => {

    if (
      currentUser &&
      currentProfile?.status === "approved"
    ) {

      updatePresence();
    }

  },
  60000
);


// ======================================================
// INITIAL UI
// ======================================================

if (auth.currentUser) {
  currentUser = auth.currentUser;
}


// ======================================================
// DEBUG MESSAGE
// ======================================================

console.log(
  "JDA Networks app.js loaded successfully."
);