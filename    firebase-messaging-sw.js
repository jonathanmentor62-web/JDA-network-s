importScripts('https://www.gstatic.com/firebasejs/12.2.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.2.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAPnOHdVISPw_fGBLdMLELSU9f1IWMTC3I",
  authDomain: "jda-network-fabde.firebaseapp.com",
  projectId: "jda-network-fabde",
  storageBucket: "jda-network-fabde.firebasestorage.app",
  messagingSenderId: "383915852673",
  appId: "1:383915852673:web:4b185c0387ed0bbad1de80"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || 'New JDA Registration!';
  const options = {
    body: payload.notification?.body || 'New user wants approval',
    icon: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png'
  };
  self.registration.showNotification(title, options);
});