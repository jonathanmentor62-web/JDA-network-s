"use client";
import { useEffect, useState } from "react";
import { collection, getDocs, updateDoc, doc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase";

export default function AdminApproval() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPending = async () => {
    setLoading(true);
    const snap = await getDocs(collection(db, "jda_users_v2"));
    const pending = snap.docs
     .map(d => ({ id: d.id,...d.data() } as any))
     .filter(u => u.status === "pending");
    setUsers(pending);
    setLoading(false);
  };

  useEffect(() => { loadPending(); }, []);

  const approve = async (id: string, name: string) => {
    if(!confirm(`Approve ${name}? Confirm real name & photo is real Boss?`)) return;
    await updateDoc(doc(db, "jda_users_v2", id), { status: "approved", approvedAt: new Date() });
    alert(`✓ ${name} Approved! Can now chat!`);
    loadPending();
  };

  const reject = async (id: string, name: string) => {
    if(!confirm(`Reject ${name}? This will delete registration!`)) return;
    await deleteDoc(doc(db, "jda_users_v2", id));
    alert(`✕ ${name} Rejected & Deleted`);
    loadPending();
  };

  if(loading) return <div className="min-h-screen bg-[#0B141A] text-white p-6">Loading pending...</div>;

  return (
    <div className="min-h-screen bg-[#0B141A] text-white p-4">
      <h1 className="text-2xl font-black">Admin Approval</h1>
      <p className="text-xs text-gray-400">Pending: {users.length} • Must confirm real name & photo • No nickname</p>

      <div className="mt-6 space-y-4">
        {users.length===0 && <p className="text-center text-gray-500 mt-20">No pending users Boss! ✅</p>}

        {users.map(u => (
          <div key={u.id} className="bg-[#202C33] p-4 rounded-2xl flex gap-4 items-start">
            <img src={u.profilePhoto} alt={u.realName} className="w-20 h-20 rounded-full object-cover border-2 border-[#25D366]" />
            <div className="flex-1">
              <p className="font-bold text-lg">{u.realName}</p>
              <p className="text-sm text-[#25D366]">JDA: {u.jdaNumber}</p>
              <p className="text-[11px] text-gray-500">Registered: {u.createdAt?.toDate? u.createdAt.toDate().toLocaleString() : new Date(u.createdAt).toLocaleString()}</p>
              <p className="text-[10px] text-gray-400 mt-1">✓ Photo MUST ✓ Real name ✓ Once only</p>

              <div className="flex gap-2 mt-3">
                <button onClick={()=>approve(u.id, u.realName)} className="bg-[#25D366] text-black px-5 py-2 rounded-full font-bold text-sm">✓ Approve</button>
                <button onClick={()=>reject(u.id, u.realName)} className="bg-transparent border border-red-500 text-red-500 px-5 py-2 rounded-full text-sm">✕ Reject</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}