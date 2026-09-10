"use client";
// DIRECT LIVE LINKS - Put this in app.js Boss!
const LIVE_ANIMATION_CDN = "https://cdn.jsdelivr.net/npm/@lottiefiles/dotlottie-web@latest/dist/dotlottie-web.mjs";

import { useState, useEffect } from "react";

export default function App() {
  const [showForm, setShowForm] = useState(false);
  
  useEffect(()=>{
    // Load live animation CDN
    const script = document.createElement("script");
    script.src = LIVE_ANIMATION_CDN;
    script.type = "module";
    document.head.appendChild(script);
    
    // Make form live playing like TikTok after 0.8 sec
    setTimeout(()=> setShowForm(true), 800);
  },[]);

  return (
    <div style={{background:"#3B82F6", minHeight:"100vh", display:"flex", justifyContent:"center", alignItems:"center"}}>
      
      {/* LIVE CHARACTERS - Using direct link */}
      <div style={{position:"absolute", left:"20px", top:"80px", fontSize:"40px", animation:"bounce 1s infinite"}}>
        🧑‍💻
      </div>

      {/* YOUR REGISTRATION FORM - LIVE */}
      <div style={{
        background:"white", 
        padding:"24px", 
        borderRadius:"20px", 
        width:"320px",
        transform: showForm ? "scale(1)" : "scale(0)",
        transition:"0.7s",
        boxShadow:"0 20px 60px rgba(0,0,0,0.4)"
      }}>
        <h2 style={{textAlign:"center", fontWeight:"900"}}>JDA Networks</h2>
        <p style={{textAlign:"center", fontSize:"11px", color:"gray"}}>Live Registration</p>
        
        <input placeholder="Real Name (No nickname)" required 
          style={{width:"100%", background:"#f1f5f9", padding:"12px", borderRadius:"12px", marginTop:"16px", border:"none"}} />
        
        <input placeholder="JDA Number JD-2025-XXXX" required
          style={{width:"100%", background:"#f1f5f9", padding:"12px", borderRadius:"12px", marginTop:"12px", border:"none"}} />
        
        <label style={{width:"100%", border:"2px dashed #ccc", borderRadius:"12px", padding:"16px", display:"flex", flexDirection:"column", alignItems:"center", marginTop:"12px", cursor:"pointer"}}>
          <span style={{fontSize:"24px"}}>📸</span>
          <span style={{fontSize:"11px", fontWeight:"bold"}}>Profile Photo MUST</span>
          <input type="file" accept="image/*" required style={{display:"none"}} />
        </label>
        
        <button style={{width:"100%", background:"black", color:"white", padding:"12px", borderRadius:"12px", marginTop:"16px", fontWeight:"bold"}}>
          Register & Go Live
        </button>
      </div>

      <style>{`@keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}`}</style>
    </div>
  );
}