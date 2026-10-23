import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import SEOHead from '../components/SEOHead'

export default function Login() {
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [showDemo, setShowDemo] = useState(false)
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
      const msg = err?.response?.data?.error || 'Cannot connect to server'
      if (s === 401) toast.error('Invalid email or password')
      else if (s === 400) toast.error('Please fill all fields')
      else toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-bg">
      <SEOHead
        title="Sign In to Notivexa"
        description="Sign in to your Notivexa student or teacher account to access your AI notes, flashcards, question papers, and study materials."
        canonical="/login"
      />
      <div style={{ position:'absolute', width:500, height:500, borderRadius:'50%', background:'#4F46E5', opacity:.07, top:-200, left:-150 }} />
      <div style={{ position:'absolute', width:400, height:400, borderRadius:'50%', background:'#7C3AED', opacity:.06, bottom:-150, right:-100 }} />
      <div className="auth-c">
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <div style={{ width:54, height:54, background:'linear-gradient(135deg,#4F46E5,#7C3AED)', borderRadius:15, display:'flex', alignItems:'center', justifyContent:'center', fontSize:26, margin:'0 auto 12px' }}>📖</div>
          <h1 style={{ fontFamily:'Sora,sans-serif', fontSize:22, fontWeight:800, color:'var(--ink)', margin: 0, padding: 0 }}>Sign In</h1>
          <div style={{ fontSize:12.5, color:'var(--ink3)', marginTop:4 }}>Enter your credentials to access your academic dashboard</div>
        </div>

        <form onSubmit={e => { e.preventDefault(); doLogin(form.email, form.password) }}>
          <div className="fg">
            <label className="fl">Email Address</label>
            <input
              className="fi"
              type="email"
              placeholder="name@college.edu or personal email"
              value={form.email}
              onChange={e => set('email', e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div className="fg">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label className="fl">Password</label>
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
              placeholder="Enter your password"
              value={form.password}
              onChange={e => set('password', e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-p btn-lg wf"
            disabled={loading}
            style={{ marginTop: 6 }}
          >
            {loading ? '⏳ Signing in...' : '🚀 Sign In'}
          </button>
        </form>

        <div style={{ textAlign:'center', marginTop:18, fontSize:13, color:'var(--ink2)' }}>
          Don't have an account?{' '}
          <Link to="/register" style={{ color:'var(--brand)', fontWeight:700 }}>
            Sign up free
          </Link>
        </div>

        {/* Optional Quick Demo Section */}
        <div style={{ marginTop: 22, paddingTop: 16, borderTop: '1px solid var(--bdr)', textAlign: 'center' }}>
          <button
            type="button"
            onClick={() => setShowDemo(!showDemo)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--ink3)',
              fontSize: 12,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5
            }}
          >
            <span>{showDemo ? '▲ Hide demo accounts' : '⚡ Or test with sample demo accounts'}</span>
          </button>

          {showDemo && (
            <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button
                type="button"
                className="btn btn-s wf"
                style={{ fontSize: 11.5, padding: '7px 10px' }}
                onClick={() => doLogin('student@demo.com', 'demo1234')}
                disabled={loading}
              >
                🎒 Student Demo
              </button>
              <button
                type="button"
                className="btn btn-s wf"
                style={{ fontSize: 11.5, padding: '7px 10px' }}
                onClick={() => doLogin('teacher@demo.com', 'demo1234')}
                disabled={loading}
              >
                👩‍🏫 Teacher Demo
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
