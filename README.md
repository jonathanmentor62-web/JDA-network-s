# JDA Networks

JDA Networks is a modern, mobile-first social networking and messaging application designed to provide a simple and familiar communication experience.

## 🚀 Features

### 🔐 Authentication
- Secure email and password registration
- User login and logout
- Full name
- Phone number
- Username
- Profile photo
- Passwords handled securely by Firebase Authentication

### 👤 Registration Approval
New registrations are placed into a `pending` state.

An administrator must approve a new account before the member can access JDA Networks.

Possible account states:

- `pending`
- `approved`
- `rejected`
- `disabled`

### 💬 Private Messaging
Approved members can:

- Search for other members
- Connect with members
- Start private conversations
- Send messages in real time
- View message timestamps
- See recent conversations
- Continue conversations after logging out and back in

### 👥 Network
Members can search approved users by:

- Name
- Username

Members can also add other approved members to their JDA Network.

### 👤 Profiles
Members can view:

- Profile photo
- Full name
- Username
- Phone number
- Email address

Members can also change their profile photo.

### 🛡️ Administrator Panel

Administrators can:

- View pending registrations
- Approve registrations
- Reject registrations
- View approved users
- Disable accounts

Administrator permissions are protected using Firebase Firestore security rules.

### 🤖 Ouma Jonathan AI

JDA Networks includes a separate AI assistant called:

**Ouma Jonathan**

Ouma Jonathan is designed as the JDA Networks AI assistant and is kept separate from normal private conversations.

A secure server-side AI connection should be added before connecting an external AI provider.

## 📱 Navigation

JDA Networks is designed with a mobile-first interface.

Main sections include:

- Chats
- Network
- Status
- Calls
- Notifications
- Profile
- Settings
- Admin

The interface is responsive and can be used on phones, tablets and desktop computers.

## 🔥 Firebase

JDA Networks uses Firebase for its backend services.

Firebase services used include:

- Firebase Authentication
- Cloud Firestore
- Firebase Storage

Firebase Authentication handles user accounts.

Cloud Firestore stores application data such as:

- User profiles
- Conversations
- Messages
- Connections
- Administrator records

Firebase Storage stores profile photos.

## 🔒 Security

Security is an important part of JDA Networks.

The project uses Firebase Security Rules to control access to application data.

Important security principles:

- Only authenticated users can access protected data.
- Only approved members can use the main application.
- Users cannot approve their own accounts.
- Administrator access is controlled separately.
- Users can only send messages as themselves.
- Conversation access is restricted to conversation members.
- Profile uploads are restricted to the authenticated user's own profile folder.
- Uploaded profile images are limited to 5 MB.
- AI provider API keys must never be placed in frontend JavaScript.

## ⚙️ Firebase Setup

### 1. Create or open the Firebase project

The JDA Networks Firebase project is:

`jda-network-fabde`

### 2. Enable Authentication

In Firebase Console:

1. Open **Authentication**
2. Select **Sign-in method**
3. Enable **Email/Password**

### 3. Create Firestore

Open:

**Firestore Database**

Create the database.

### 4. Enable Storage

Open:

**Storage**

Enable Firebase Storage.

### 5. Deploy Firestore Rules

Copy the contents of:

`firestore.rules`

into the Firebase Firestore Rules section.

### 6. Deploy Storage Rules

Copy the contents of:

`storage.rules`

into Firebase Storage Rules.

## 👑 Creating the First Administrator

For security, administrators should not be created automatically from the frontend.

First create a normal Firebase Authentication account.

Then find that user's Firebase Authentication UID.

In Firestore create:

`admins/{USER_UID}`

For example:

```text
admins
└── ABC123USERUID
    └── role: "admin"