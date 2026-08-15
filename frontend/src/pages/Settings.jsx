import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import api from '../utils/api'

const THEMES = [
  { id:'default', label:'🎨 Default (Indigo)', desc:'Purple-indigo academic theme', preview:'linear-gradient(135deg,#4F46E5,#7C3AED)' },
  { id:'light',   label:'☀️ Light', desc:'Clean bright white theme', preview:'linear-gradient(135deg,#1F2937,#374151)' },
  { id:'dark',    label:'🌙 Dark', desc:'Dark mode — easy on eyes', preview:'linear-gradient(135deg,#1E293B,#0F172A)' },
]

export default function Settings() {
  const { user, updateUser, logout, setTheme } = useAuth()
  const [form,setForm]=useState({name:user?.name||'',institution:user?.institution||'',preferredLanguage:user?.preferredLanguage||'English'})
  const [pw,setPw]=useState({currentPassword:'',newPassword:'',confirmPassword:''})
  const [saving,setSaving]=useState(false)
  const [savingPw,setSavingPw]=useState(false)
  const [setup,setSetup]=useState(null)

  useState(()=>{ api.get('/setup').then(r=>setSetup(r.data)).catch(()=>{}) },[])

  const inits=user?.name?user.name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2):'U'
  const currentTheme=user?.theme||'default'

  const saveProfile=async e=>{
    e.preventDefault();setSaving(true)
    try{const r=await api.put('/auth/profile',form);updateUser(r.data.user);toast.success('Profile saved!')}
    catch{toast.error('Failed')}finally{setSaving(false)}
  }

  const changeTheme=async(t)=>{
    setTheme(t)
    try{const r=await api.put('/auth/profile',{...form,theme:t});updateUser(r.data.user);toast.success(`Theme changed to ${THEMES.find(x=>x.id===t)?.label}`)}
    catch{}
  }

  const changePw=async e=>{
    e.preventDefault()
    if(pw.newPassword!==pw.confirmPassword){toast.error('Passwords do not match');return}
    if(pw.newPassword.length<6){toast.error('Min 6 characters');return}
    setSavingPw(true)
    try{await api.put('/auth/change-password',{currentPassword:pw.currentPassword,newPassword:pw.newPassword});toast.success('Password changed!');setPw({currentPassword:'',newPassword:'',confirmPassword:''})}
    catch(err){toast.error(err.response?.data?.error||'Failed')}finally{setSavingPw(false)}
  }

  return(
    <div className="tc" style={{alignItems:'start'}}>
      <div>
        {/* Profile */}
        <div className="card" style={{marginBottom:16}}>
          <div className="ch"><div className="ct">👤 Profile</div></div>
          <div className="cb">
            <div style={{display:'flex',alignItems:'center',gap:16,marginBottom:20,padding:14,background:'var(--bg)',borderRadius:11}}>
              <div style={{width:56,height:56,borderRadius:'50%',background:'linear-gradient(135deg,var(--brand),var(--brand2))',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,fontSize:20,color:'#fff'}}>{inits}</div>
              <div>
                <div style={{fontFamily:'Sora,sans-serif',fontSize:16,fontWeight:700}}>{user?.name}</div>
                <div style={{fontSize:12.5,color:'var(--ink3)'}}>{user?.email}</div>
                <span style={{background:'#EDE9FE',color:'#5B21B6',padding:'2px 9px',borderRadius:20,fontSize:11,fontWeight:600,textTransform:'capitalize'}}>{user?.role}</span>
              </div>
            </div>
            <form onSubmit={saveProfile}>
              <div className="fg"><label className="fl">Full Name</label><input className="fi" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></div>
              <div className="fg"><label className="fl">Institution</label><input className="fi" placeholder="Your college/university" value={form.institution} onChange={e=>setForm(f=>({...f,institution:e.target.value}))}/></div>
              <div className="fg"><label className="fl">Preferred Language</label>
                <select className="fi" value={form.preferredLanguage} onChange={e=>setForm(f=>({...f,preferredLanguage:e.target.value}))}>
                  {['English','Hindi','Marathi','Bengali','Tamil','Telugu','Gujarati','Kannada','French','Spanish','German','Japanese','Arabic'].map(l=><option key={l}>{l}</option>)}
                </select>
              </div>
              <button type="submit" className="btn btn-p" disabled={saving}>{saving?'Saving...':'💾 Save Profile'}</button>
            </form>
          </div>
        </div>

        {/* Change Password */}
        <div className="card">
          <div className="ch"><div className="ct">🔒 Change Password</div></div>
          <div className="cb">
            <form onSubmit={changePw}>
              <div className="fg"><label className="fl">Current Password</label><input className="fi" type="password" value={pw.currentPassword} onChange={e=>setPw(p=>({...p,currentPassword:e.target.value}))} required/></div>
              <div className="fg"><label className="fl">New Password (min 6)</label><input className="fi" type="password" value={pw.newPassword} onChange={e=>setPw(p=>({...p,newPassword:e.target.value}))} required/></div>
              <div className="fg"><label className="fl">Confirm New Password</label><input className="fi" type="password" value={pw.confirmPassword} onChange={e=>setPw(p=>({...p,confirmPassword:e.target.value}))} required/></div>
              <button type="submit" className="btn btn-p" disabled={savingPw}>{savingPw?'Changing...':'🔒 Change Password'}</button>
            </form>
          </div>
        </div>
      </div>

      <div>
        {/* THEME SWITCHER */}
        <div className="card" style={{marginBottom:16}}>
          <div className="ch"><div className="ct">🎨 Theme</div></div>
          <div className="cb">
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {THEMES.map(t=>(
                <div key={t.id} onClick={()=>changeTheme(t.id)} style={{border:`2px solid ${currentTheme===t.id?'var(--brand)':'var(--bdr2)'}`,borderRadius:11,padding:'12px 14px',cursor:'pointer',display:'flex',alignItems:'center',gap:12,background:currentTheme===t.id?'rgba(79,70,229,.06)':'transparent',transition:'.15s'}}>
                  <div style={{width:36,height:36,borderRadius:8,background:t.preview,flexShrink:0}}/>
                  <div>
                    <div style={{fontWeight:700,fontSize:13.5,color:currentTheme===t.id?'var(--brand)':'var(--ink)'}}>{t.label}</div>
                    <div style={{fontSize:12,color:'var(--ink3)',marginTop:2}}>{t.desc}</div>
                  </div>
                  {currentTheme===t.id&&<span style={{marginLeft:'auto',color:'var(--brand)',fontSize:16}}>✓</span>}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* API Status */}
        {setup&&(
          <div className="card" style={{marginBottom:16}}>
            <div className="ch"><div className="ct">⚡ API Status</div></div>
            <div className="cb">
              {[
                ['Groq AI (Free)',setup.status?.groq,'GROQ_API_KEY','console.groq.com'],
                ['Google Gemini (Free)',setup.status?.gemini,'GEMINI_API_KEY','aistudio.google.com'],
                ['Google TTS',setup.status?.googleTTS,'GOOGLE_TTS_API_KEY','console.cloud.google.com'],
                ['ElevenLabs TTS',setup.status?.eleven,'ELEVENLABS_API_KEY','elevenlabs.io'],
              ].map(([name,active,key,url],i)=>(
                <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:i<3?'1px solid var(--bdr)':'none'}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:600}}>{name}</div>
                    {!active&&<div style={{fontSize:11,color:'var(--ink3)'}}>{key}=your_key in .env</div>}
                  </div>
                  {active
                    ?<span style={{background:'#DCFCE7',color:'#166534',fontSize:11,fontWeight:700,padding:'2px 9px',borderRadius:20}}>✅ Active</span>
                    :<a href={`https://${url}`} target="_blank" rel="noreferrer" style={{textDecoration:'none'}}><span style={{background:'#FEF9C3',color:'#854D0E',fontSize:11,fontWeight:700,padding:'2px 9px',borderRadius:20,cursor:'pointer'}}>Get Free →</span></a>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="card" style={{marginBottom:16}}>
          <div className="ch"><div className="ct">📊 Your Stats</div></div>
          <div className="cb">
            {[['PDFs Uploaded',user?.studyStats?.documentsUploaded||0,'📄'],['Notes Generated',user?.studyStats?.notesGenerated||0,'📝'],['Flashcards Created',user?.studyStats?.flashcardsCreated||0,'🃏']].map(([l,v,i],idx)=>(
              <div key={idx} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:idx<2?'1px solid var(--bdr)':'none',fontSize:13}}>
                <span style={{color:'var(--ink3)'}}>{i} {l}</span><span style={{fontWeight:700,color:'var(--brand)'}}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card"><div className="cb">
          <button className="btn btn-d wf" onClick={()=>{if(confirm('Sign out of Notivexa?'))logout()}}>⏻ Sign Out</button>
        </div></div>
      </div>
    </div>
  )
}