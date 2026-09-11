// JDA Networks - LIVE Renovated - Real Only - FIXED DELAY
import { collection, addDoc, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";
import { db, storage } from "./firebase.js";

const realNameInput = document.getElementById("realName");
const jdaNumberInput = document.getElementById("jdaNumber");
const photoInput = document.getElementById("photoInput");
const preview = document.getElementById("photoPreview");
const btn = document.getElementById("registerBtn");
let photoFile = null;

photoInput.addEventListener("change", (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  photoFile = file; // SAVE FILE, NOT BASE64
  const reader = new FileReader();
  reader.onload = ev => {
    preview.innerHTML = `<img src="${ev.target.result}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:3px solid #25D366"/>`;
  };
  reader.readAsDataURL(file);
});

btn.addEventListener("click", async ()=>{
  const realName = realNameInput.value.trim();
  const jdaNumber = jdaNumberInput.value.trim().toUpperCase();

  if(!realName ||!jdaNumber ||!photoFile){
    alert("Boss! Real Name + JDA Number + Photo MUST! No nickname!");
    return;
  }
  if(!jdaNumber.startsWith("JD-")){
    alert("JDA Number must start with JD- Example: JD-2025-1234");
    return;
  }
  btn.innerText = "Sending..."; btn.disabled = true;

  try {
    // Once only check
    const q = query(collection(db,"jda_users_v2"), where("jdaNumber","==",jdaNumber));
    const snap = await getDocs(q);
    if(!snap.empty){ alert("This JDA Number already used! Once only Boss!"); btn.innerText="Register & Go Live 🚀"; btn.disabled=false; return; }

    // UPLOAD TO STORAGE - FAST! NO DELAY!
    const fileName = `${jdaNumber}_${Date.now()}_${photoFile.name.replace(/\s/g,"_")}`;
    const storageRef = ref(storage, `profilePhotos/${fileName}`);
    await uploadBytes(storageRef, photoFile);
    const photoURL = await getDownloadURL(storageRef);

    await addDoc(collection(db,"jda_users_v2"),{
      realName, jdaNumber, profilePhoto: photoURL,
      status:"pending", createdAt: new Date()
    });

    alert("✓ Sent to Admin! Wait approval!");
    realNameInput.value=""; jdaNumberInput.value=""; photoFile=null; preview.innerHTML="";

  } catch(err){
    alert("Error: " + err.message);
    console.error(err);
  }
  btn.innerText="Register & Go Live 🚀"; btn.disabled=false;
});