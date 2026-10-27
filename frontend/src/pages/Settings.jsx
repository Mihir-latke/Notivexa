import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import toast from 'react-hot-toast'
import api from '../utils/api'

const THEMES = [
  { id: 'default', label: 'Default', icon: '🌈', desc: 'Purple-tinted' },
  { id: 'light',   label: 'Light',   icon: '☀️', desc: 'Clean white' },
  { id: 'dark',    label: 'Dark',    icon: '🌙', desc: 'Night mode' },
]

export default function Settings() {
  const { user, updateUser, logout } = useAuth()
  const { theme, setTheme } = useTheme()
  const [form, setForm] = useState({
    name: user?.name||'',
    institution: user?.institution||'',
    preferredLanguage: user?.preferredLanguage||'English',
    defaultOutputLanguage: user?.defaultOutputLanguage||'english'
  })
  const [pw, setPw] = useState({ currentPassword:'', newPassword:'', confirmPassword:'' })
  const [saving, setSaving] = useState(false)
  const [savingPw, setSavingPw] = useState(false)
  const inits = user?.name ? user.name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2) : 'U'

  const saveProfile = async e => {
    e.preventDefault(); setSaving(true)
    try { const r = await api.put('/auth/profile', form); updateUser(r.data.user); toast.success('Profile updated!') }
    catch { toast.error('Failed') } finally { setSaving(false) }
  }
  const changePw = async e => {
    e.preventDefault()
    if (pw.newPassword !== pw.confirmPassword) { toast.error('Passwords do not match'); return }
    if (pw.newPassword.length < 6) { toast.error('Min 6 characters'); return }
    setSavingPw(true)
    try { await api.put('/auth/change-password', { currentPassword: pw.currentPassword, newPassword: pw.newPassword }); toast.success('Password changed!'); setPw({ currentPassword:'', newPassword:'', confirmPassword:'' }) }
    catch(err) { toast.error(err.response?.data?.error||'Failed') } finally { setSavingPw(false) }
  }

  return (
    <div className="tc" style={{ alignItems:'start' }}>
      <div>
        <div className="card" style={{ marginBottom:16 }}>
          <div className="ch"><div className="ct">🎨 Appearance</div></div>
          <div className="cb">
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
              {THEMES.map(t => (
                <div key={t.id}
                  onClick={() => { setTheme(t.id); toast.success(t.icon+' '+t.label+' mode active') }}
                  style={{
                    border: '2px solid '+(theme===t.id?'var(--brand)':'var(--bdr2)'),
                    borderRadius:11, padding:'14px 12px', cursor:'pointer',
                    background: theme===t.id?'rgba(79,70,229,0.08)':'var(--bg)',
                    textAlign:'center', transition:'.15s'
                  }}>
                  <div style={{ fontSize:26, marginBottom:6 }}>{t.icon}</div>
                  <div style={{ fontSize:13, fontWeight:700, color:theme===t.id?'var(--brand)':'var(--ink)' }}>{t.label}</div>
                  <div style={{ fontSize:11, color:'var(--ink3)', marginTop:2 }}>{t.desc}</div>
                  {theme===t.id && <div style={{ fontSize:10, color:'var(--brand)', fontWeight:700, marginTop:6 }}>✓ Active</div>}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom:16 }}>
          <div className="ch"><div className="ct">👤 Profile</div></div>
          <div className="cb">
            <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:20, padding:14, background:'var(--bg)', borderRadius:11 }}>
              <div style={{ width:56, height:56, borderRadius:'50%', background:'linear-gradient(135deg,var(--brand),var(--brand2))', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:20, color:'#fff' }} role="img" aria-label={`Avatar for ${user?.name || 'User'}`}>{inits}</div>
              <div>
                <div style={{ fontFamily:'Sora,sans-serif', fontSize:16, fontWeight:700 }}>{user?.name}</div>
                <div style={{ fontSize:12.5, color:'var(--ink3)' }}>{user?.email}</div>
                <span style={{ background:'#EDE9FE', color:'#5B21B6', padding:'2px 9px', borderRadius:20, fontSize:11, fontWeight:600, textTransform:'capitalize' }}>{user?.role}</span>
              </div>
            </div>
            <form onSubmit={saveProfile}>
              <div className="fg"><label className="fl">Full Name</label><input className="fi" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></div>
              <div className="fg"><label className="fl">Institution</label><input className="fi" placeholder="Your college/university" value={form.institution} onChange={e=>setForm(f=>({...f,institution:e.target.value}))}/></div>
              <div className="fg"><label className="fl">Preferred Language</label>
                <select className="fi" value={form.preferredLanguage} onChange={e=>setForm(f=>({...f,preferredLanguage:e.target.value}))}>
                  {['English','Hindi','Marathi','Gujarati','Bengali','Tamil','Telugu','Kannada','Urdu','Arabic','Spanish','French','German','Chinese','Japanese','Korean','Russian'].map(l=><option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div className="fg"><label className="fl">Default AI Output Language</label>
                <select className="fi" value={form.defaultOutputLanguage} onChange={e=>setForm(f=>({...f,defaultOutputLanguage:e.target.value}))}>
                  <option value="english">🇬🇧 English (Default)</option>
                  <option value="original">📄 Original Document Language</option>
                  <option value="hindi">🇮🇳 Hindi</option>
                  <option value="marathi">🇮🇳 Marathi</option>
                  <option value="gujarati">🇮🇳 Gujarati</option>
                  <option value="bengali">🇮🇳 Bengali</option>
                  <option value="tamil">🇮🇳 Tamil</option>
                  <option value="telugu">🇮🇳 Telugu</option>
                  <option value="kannada">🇮🇳 Kannada</option>
                  <option value="urdu">🇵🇰 Urdu</option>
                  <option value="arabic">🇸🇦 Arabic</option>
                  <option value="spanish">🇪🇸 Spanish</option>
                  <option value="french">🇫🇷 French</option>
                  <option value="german">🇩🇪 German</option>
                  <option value="chinese">🇨🇳 Chinese (Simplified)</option>
                  <option value="japanese">🇯🇵 Japanese</option>
                  <option value="korean">🇰🇷 Korean</option>
                  <option value="russian">🇷🇺 Russian</option>
                </select>
              </div>
              <button type="submit" className="btn btn-p" disabled={saving}>{saving?'Saving...':'💾 Save Changes'}</button>
            </form>
          </div>
        </div>
      </div>

      <div>
        <div className="card" style={{ marginBottom:16 }}>
          <div className="ch"><div className="ct">🔒 Change Password</div></div>
          <div className="cb">
            <form onSubmit={changePw}>
              <div className="fg"><label className="fl">Current Password</label><input className="fi" type="password" value={pw.currentPassword} onChange={e=>setPw(p=>({...p,currentPassword:e.target.value}))} required/></div>
              <div className="fg"><label className="fl">New Password</label><input className="fi" type="password" value={pw.newPassword} onChange={e=>setPw(p=>({...p,newPassword:e.target.value}))} required/></div>
              <div className="fg"><label className="fl">Confirm Password</label><input className="fi" type="password" value={pw.confirmPassword} onChange={e=>setPw(p=>({...p,confirmPassword:e.target.value}))} required/></div>
              <button type="submit" className="btn btn-p" disabled={savingPw}>{savingPw?'Changing...':'🔒 Change Password'}</button>
            </form>
          </div>
        </div>

        <div className="card" style={{ marginBottom:16 }}>
          <div className="ch"><div className="ct">📊 Your Stats</div></div>
          <div className="cb">
            {[['PDFs Uploaded',user?.studyStats?.documentsUploaded||0,'📄'],['Notes Generated',user?.studyStats?.notesGenerated||0,'📝'],['Flashcards Created',user?.studyStats?.flashcardsCreated||0,'🃏']].map(([l,v,i],idx)=>(
              <div key={idx} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:idx<2?'1px solid var(--bdr)':'none', fontSize:13 }}>
                <span style={{ color:'var(--ink3)' }}>{i} {l}</span><span style={{ fontWeight:700 }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card"><div className="cb">
          <button className="btn btn-d wf" onClick={()=>{if(confirm('Sign out?'))logout()}}>⏻ Sign Out</button>
        </div></div>
      </div>
    </div>
  )
}
