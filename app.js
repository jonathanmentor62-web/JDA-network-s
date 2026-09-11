// JDA Networks - LIVE Renovated - Real Only
import { collection, addDoc, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db } from "./firebase.js";

const realNameInput = document.getElementById("realName");
const jdaNumberInput = document.getElementById("jdaNumber");
const photoInput = document.getElementById("photoInput");
const preview = document.getElementById("photoPreview");
const btn = document.getElementById("registerBtn");
let photoBase64 = "";

photoInput.addEventListener("change", (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    photoBase64 = ev.target.result;
    preview.innerHTML = `<img src="${photoBase64}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:3px solid #25D366"/>`;
  };
  reader.readAsDataURL(file);
});

btn.addEventListener("click", async ()=>{
  const realName = realNameInput.value.trim();
  const jdaNumber = jdaNumberInput.value.trim().toUpperCase();

  if(!realName ||!jdaNumber ||!photoBase64){
    alert("Boss! Real Name + JDA Number + Photo MUST! No nickname!");
    return;
  }
  if(!jdaNumber.startsWith("JD-")){
    alert("JDA Number must start with JD- Example: JD-2025-1234");
    return;
  }
  btn.innerText = "Sending..."; btn.disabled = true;

  // Once only check
  const q = query(collection(db,"jda_users_v2"), where("jdaNumber","==",jdaNumber));
  const snap = await getDocs(q);
  if(!snap.empty){ alert("This JDA Number already used! Once only Boss!"); btn.innerText="Register & Go Live 🚀"; btn.disabled=false; return; }

  await addDoc(collection(db,"jda_users_v2"),{
    realName, jdaNumber, profilePhoto: photoBase64,
    status:"pending", createdAt: new Date()
  });
  alert("✓ Sent to Admin! Wait approval!");
  realNameInput.value=""; jdaNumberInput.value=""; photoBase64=""; preview.innerHTML="";
  btn.innerText="Register & Go Live 🚀"; btn.disabled=false;
});