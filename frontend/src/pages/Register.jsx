import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import SEOHead from '../components/SEOHead'

export default function Register() {
  const [form, setForm] = useState({ name:'', email:'', password:'', role:'student', institution:'' })
  const [loading, setLoading] = useState(false)
  const { register } = useAuth()
  const navigate = useNavigate()
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async e => {
    e.preventDefault()
    if (form.password.length < 6) { toast.error('Password must be at least 6 characters'); return }
    setLoading(true)
    try {
      await register(form)
      toast.success(`Welcome to Notivexa, ${form.name}! 📖`)
      navigate('/dashboard')
    } catch (err) {
      if (err?.response?.status === 409) toast.error('Email already registered')
      else toast.error(err?.response?.data?.error || 'Registration failed')
    } finally { setLoading(false) }
  }

  return (
    <div className="auth-bg">
      <SEOHead
        title="Create Free Student or Teacher Account"
        description="Sign up for Notivexa. Convert textbooks and lectures into handwritten notes in 15 fonts, Bloom's Taxonomy exams, flashcards, and audio lectures."
        canonical="/register"
      />
      <div className="auth-c">
        <div style={{ textAlign:'center', marginBottom:22 }}>
          <div style={{ width:50, height:50, background:'linear-gradient(135deg,#4F46E5,#7C3AED)', borderRadius:14, display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, margin:'0 auto 12px' }}>📖</div>
          <h1 style={{ fontFamily:'Sora,sans-serif', fontSize:20, fontWeight:800, margin: 0, padding: 0 }}>Create Account</h1>
          <div style={{ fontSize:12, color:'var(--ink3)', marginTop:3 }}>Join Notivexa — AI Academic Intelligence</div>
        </div>
        <div className="g2" style={{ gap:9, marginBottom:14 }}>
          {['student','teacher'].map(r => (
            <div key={r} onClick={() => set('role',r)} style={{ border:`1.5px solid ${form.role===r?'var(--brand)':'var(--bdr2)'}`, borderRadius:9, padding:10, textAlign:'center', cursor:'pointer', background:form.role===r?'rgba(79,70,229,.05)':'#fff', transition:'.15s' }}>
              <div style={{ fontSize:20, marginBottom:3 }}>{r==='student'?'🎒':'👩‍🏫'}</div>
              <div style={{ fontSize:12.5, fontWeight:700, color:form.role===r?'var(--brand)':'var(--ink2)', textTransform:'capitalize' }}>{r}</div>
            </div>
          ))}
        </div>
        <form onSubmit={handleSubmit}>
          <div className="fg"><label className="fl">Full Name *</label><input className="fi" placeholder="Aryan Sharma" value={form.name} onChange={e => set('name',e.target.value)} required /></div>
          <div className="fg"><label className="fl">Email *</label><input className="fi" type="email" placeholder="you@college.edu" value={form.email} onChange={e => set('email',e.target.value)} required /></div>
          <div className="fg"><label className="fl">Institution</label><input className="fi" placeholder="IIT Bombay, Mumbai University..." value={form.institution} onChange={e => set('institution',e.target.value)} /></div>
          <div className="fg"><label className="fl">Password * (min 6)</label><input className="fi" type="password" placeholder="Create password" value={form.password} onChange={e => set('password',e.target.value)} required /></div>
          <button type="submit" className="btn btn-p btn-lg wf" disabled={loading}>{loading?'⏳ Creating...':'📖 Create Free Account'}</button>
        </form>
        <div style={{ textAlign:'center', marginTop:14, fontSize:12.5, color:'var(--ink3)' }}>
          Have an account? <Link to="/login" style={{ color:'var(--brand)', fontWeight:700 }}>Sign in</Link>
        </div>
      </div>
    </div>
  )
}