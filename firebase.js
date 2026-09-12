import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAPnOHdVISPw_fGBLdMLELSU9f1IWMTC3I",
  authDomain: "jda-network-fabde.firebaseapp.com",
  projectId: "jda-network-fabde",
  storageBucket: "jda-network-fabde.firebasestorage.app",
  messagingSenderId: "383915852673",
  appId: "1:383915852673:web:4b185c0387ed0bbad1de80"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);