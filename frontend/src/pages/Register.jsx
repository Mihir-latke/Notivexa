import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import SEOHead from '../components/SEOHead'

export default function Register() {
  const [form, setForm] = useState({ name:'', email:'', password:'', role:'student', institution:'' })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const { register } = useAuth()
  const navigate = useNavigate()
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async e => {
    e.preventDefault()
    if (!form.name.trim()) { toast.error('Please enter your full name'); return }
    if (!form.email.trim()) { toast.error('Please enter your email address'); return }
    if (form.password.length < 6) { toast.error('Password must be at least 6 characters long'); return }
    
    setLoading(true)
    try {
      await register(form)
      toast.success(`Welcome to Notivexa, ${form.name}! 📖`)
      navigate('/dashboard')
    } catch (err) {
      if (err?.response?.status === 409) toast.error('Email is already registered. Please sign in.')
      else toast.error(err?.response?.data?.error || 'Registration could not be completed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-bg">
      <SEOHead
        title="Create Free Student or Teacher Account"
        description="Sign up for Notivexa. Convert textbooks and lectures into handwritten notes in 15 fonts, Bloom's Taxonomy exams, flashcards, and audio lectures."
        canonical="/register"
      />
      <div style={{ position:'absolute', width:500, height:500, borderRadius:'50%', background:'#4F46E5', opacity:.07, top:-200, left:-150 }} />
      <div style={{ position:'absolute', width:400, height:400, borderRadius:'50%', background:'#7C3AED', opacity:.06, bottom:-150, right:-100 }} />
      <div className="auth-c">
        <div style={{ textAlign:'center', marginBottom:20 }}>
          <div style={{ width:50, height:50, background:'linear-gradient(135deg,#4F46E5,#7C3AED)', borderRadius:14, display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, margin:'0 auto 12px' }}>📖</div>
          <h1 style={{ fontFamily:'Sora,sans-serif', fontSize:21, fontWeight:800, margin: 0, padding: 0 }}>Create Account</h1>
          <div style={{ fontSize:12, color:'var(--ink3)', marginTop:3 }}>Sign up to save notes, flashcards, and presentations permanently</div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:9, marginBottom:16 }}>
          {['student','teacher'].map(r => (
            <div
              key={r}
              onClick={() => set('role',r)}
              style={{
                border:`1.5px solid ${form.role===r?'var(--brand)':'var(--bdr2)'}`,
                borderRadius:9,
                padding:9,
                textAlign:'center',
                cursor:'pointer',
                background:form.role===r?'rgba(79,70,229,.06)':'#fff',
                transition:'.15s'
              }}
            >
              <div style={{ fontSize:18, marginBottom:2 }}>{r==='student'?'🎒':'👩‍🏫'}</div>
              <div style={{ fontSize:12, fontWeight:700, color:form.role===r?'var(--brand)':'var(--ink2)', textTransform:'capitalize' }}>
                {r === 'student' ? 'Student' : 'Teacher / Prof'}
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          <div className="fg">
            <label className="fl">Full Name *</label>
            <input
              className="fi"
              placeholder="e.g. Aryan Sharma"
              value={form.name}
              onChange={e => set('name',e.target.value)}
              autoComplete="name"
              required
            />
          </div>

          <div className="fg">
            <label className="fl">Email Address *</label>
            <input
              className="fi"
              type="email"
              placeholder="e.g. name@college.edu or personal email"
              value={form.email}
              onChange={e => set('email',e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div className="fg">
            <label className="fl">Institution / University (Optional)</label>
            <input
              className="fi"
              placeholder="IIT Bombay, Mumbai University, etc."
              value={form.institution}
              onChange={e => set('institution',e.target.value)}
            />
          </div>

          <div className="fg">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="fl">Password * (min 6 characters)</label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{ background: 'none', border: 'none', color: 'var(--brand)', fontSize: 11.5, cursor: 'pointer', fontWeight: 600 }}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            <input
              className="fi"
              type={showPassword ? 'text' : 'password'}
              placeholder="Choose a strong password"
              value={form.password}
              onChange={e => set('password',e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-p btn-lg wf"
            disabled={loading}
            style={{ marginTop: 6 }}
          >
            {loading ? '⏳ Creating Account...' : '📖 Create Free Account'}
          </button>
        </form>

        <div style={{ textAlign:'center', marginTop:16, fontSize:12.5, color:'var(--ink2)' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color:'var(--brand)', fontWeight:700 }}>
            Sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
