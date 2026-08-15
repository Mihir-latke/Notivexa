import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

export default function Login() {
  const [form, setForm] = useState({ email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const doLogin = async (email, password) => {
    setLoading(true)
    try {
      await login(email, password)
      toast.success('Welcome back! 📖')
      navigate('/dashboard')
    } catch (err) {
      const s = err?.response?.status
      if (s === 401) toast.error('Invalid email or password')
      else if (s === 400) toast.error('Please fill all fields')
      else toast.error('Cannot connect. Make sure the backend is running on port 5000.')
    } finally { setLoading(false) }
  }

  return (
    <div className="auth-bg">
      <div style={{ position:'absolute', width:500, height:500, borderRadius:'50%', background:'#4F46E5', opacity:.07, top:-200, left:-150 }} />
      <div style={{ position:'absolute', width:400, height:400, borderRadius:'50%', background:'#7C3AED', opacity:.06, bottom:-150, right:-100 }} />
      <div className="auth-c">
        <div style={{ textAlign:'center', marginBottom:26 }}>
          <div style={{ width:54, height:54, background:'linear-gradient(135deg,#4F46E5,#7C3AED)', borderRadius:15, display:'flex', alignItems:'center', justifyContent:'center', fontSize:26, margin:'0 auto 12px' }}>📖</div>
          <div style={{ fontFamily:'Sora,sans-serif', fontSize:22, fontWeight:800, color:'var(--ink)' }}>Notivexa</div>
          <div style={{ fontSize:12.5, color:'var(--ink3)', marginTop:4 }}>AI Academic Intelligence Platform</div>
        </div>
        <form onSubmit={e => { e.preventDefault(); doLogin(form.email, form.password) }}>
          <div className="fg"><label className="fl">Email</label><input className="fi" type="email" placeholder="your@email.com" value={form.email} onChange={e => set('email', e.target.value)} required /></div>
          <div className="fg"><label className="fl">Password</label><input className="fi" type="password" placeholder="Your password" value={form.password} onChange={e => set('password', e.target.value)} required /></div>
          <button type="submit" className="btn btn-p btn-lg wf" disabled={loading}>{loading ? '⏳ Signing in...' : '🚀 Sign In'}</button>
        </form>
        <div style={{ display:'flex', alignItems:'center', gap:10, color:'var(--ink3)', fontSize:12, margin:'14px 0' }}>
          <div style={{ flex:1, height:1, background:'var(--bdr)' }} />Demo<div style={{ flex:1, height:1, background:'var(--bdr)' }} />
        </div>
        <div className="g2" style={{ gap:10 }}>
          <button className="btn btn-s wf" onClick={() => doLogin('student@demo.com','demo1234')} disabled={loading}>🎒 Student Demo</button>
          <button className="btn btn-s wf" onClick={() => doLogin('teacher@demo.com','demo1234')} disabled={loading}>👩‍🏫 Teacher Demo</button>
        </div>
        <div style={{ marginTop:10, padding:'8px 12px', background:'#EDE9FE', borderRadius:9, fontSize:12, color:'#5B21B6' }}>
          Demo: student@demo.com / demo1234
        </div>
        <div style={{ textAlign:'center', marginTop:14, fontSize:12.5, color:'var(--ink3)' }}>
          No account? <Link to="/register" style={{ color:'var(--brand)', fontWeight:700 }}>Sign up free</Link>
        </div>
      </div>
    </div>
  )
}