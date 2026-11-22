import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../utils/api'
import toast from 'react-hot-toast'
import SEOHead from '../components/SEOHead'

export default function Login() {
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [showDemo, setShowDemo] = useState(false)
  const [loading, setLoading] = useState(false)

  // 2FA / MFA state
  const [mfaSession, setMfaSession] = useState(null) // { tempToken, email }
  const [mfaOtp, setMfaOtp] = useState('')
  const [verifyingMfa, setVerifyingMfa] = useState(false)
  const [resendingMfa, setResendingMfa] = useState(false)

  const { login, completeMfaLogin } = useAuth()
  const navigate = useNavigate()
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const doLogin = async (email, password) => {
    setLoading(true)
    try {
      const result = await login(email, password)
      if (result && result.mfaRequired) {
        setMfaSession({
          tempToken: result.tempToken,
          email: result.email || email
        })
        setMfaOtp('')
        toast.success('Security code sent to your email inbox! 🛡️')
        return
      }

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

  const handleVerifyMfa = async (e) => {
    e.preventDefault()
    const cleanOtp = mfaOtp.trim()
    if (!cleanOtp || cleanOtp.length < 6) {
      toast.error('Please enter the 6-digit verification code')
      return
    }

    setVerifyingMfa(true)
    try {
      const res = await api.post('/auth/verify-mfa', {
        tempToken: mfaSession.tempToken,
        otp: cleanOtp
      })

      completeMfaLogin(res.data.token, res.data.user)
      toast.success('Authenticated successfully! 📖')
      navigate('/dashboard')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Invalid or expired verification code.')
    } finally {
      setVerifyingMfa(false)
    }
  }

  const handleResendMfa = async () => {
    if (resendingMfa) return
    setResendingMfa(true)
    try {
      const res = await api.post('/auth/resend-mfa-otp', {
        tempToken: mfaSession.tempToken
      })
      if (res.data.tempToken) {
        setMfaSession(prev => ({
          ...prev,
          tempToken: res.data.tempToken
        }))
      }
      toast.success('A new 2FA code has been sent to your email inbox!')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to resend code. Please try again.')
    } finally {
      setResendingMfa(false)
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
        {mfaSession ? (
          // MFA 2FA Challenge View
          <>
            <div style={{ textAlign:'center', marginBottom:20 }}>
              <div style={{ width:54, height:54, background:'linear-gradient(135deg,#10B981,#059669)', borderRadius:15, display:'flex', alignItems:'center', justifyContent:'center', fontSize:26, margin:'0 auto 12px' }}>🛡️</div>
              <h1 style={{ fontFamily:'Sora,sans-serif', fontSize:22, fontWeight:800, color:'var(--ink)', margin: 0, padding: 0 }}>Two-Factor Authentication</h1>
              <div style={{ fontSize:12.5, color:'var(--ink3)', marginTop:5, lineHeight:1.5 }}>
                Enter the 6-digit security code sent to <strong>{mfaSession.email}</strong>. Please check your Gmail inbox and spam folder.
              </div>
            </div>

            <form onSubmit={handleVerifyMfa}>
              <div className="fg">
                <label className="fl">6-Digit Verification Code</label>
                <input
                  className="fi"
                  type="text"
                  maxLength={6}
                  placeholder="Enter 6-digit code"
                  value={mfaOtp}
                  onChange={e => setMfaOtp(e.target.value.replace(/\D/g, ''))}
                  style={{ textAlign: 'center', fontSize: 22, letterSpacing: 8, fontWeight: 700 }}
                  autoFocus
                  required
                />
              </div>

              <button
                type="submit"
                className="btn btn-p btn-lg wf"
                disabled={verifyingMfa}
                style={{ marginTop: 8 }}
              >
                {verifyingMfa ? '⏳ Verifying code...' : '✓ Confirm & Sign In'}
              </button>
            </form>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, fontSize: 12.5 }}>
              <button
                type="button"
                onClick={handleResendMfa}
                disabled={resendingMfa}
                style={{ background: 'none', border: 'none', color: 'var(--brand)', cursor: 'pointer', fontWeight: 600, padding: 0 }}
              >
                {resendingMfa ? 'Sending...' : '↻ Resend Code'}
              </button>
              <button
                type="button"
                onClick={() => { setMfaSession(null); setMfaOtp('') }}
                style={{ background: 'none', border: 'none', color: 'var(--ink3)', cursor: 'pointer', padding: 0 }}
              >
                ← Back to Login
              </button>
            </div>
          </>
        ) : (
          // Regular Login View
          <>
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
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{ background: 'none', border: 'none', color: 'var(--brand)', fontSize: 11.5, cursor: 'pointer', fontWeight: 600 }}
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                    <Link
                      to="/forgot-password"
                      style={{ color: 'var(--brand)', fontSize: 11.5, textDecoration: 'none', fontWeight: 600 }}
                    >
                      Forgot?
                    </Link>
                  </div>
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
          </>
        )}
      </div>
    </div>
  )
}
