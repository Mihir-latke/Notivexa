import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../utils/api'
import toast from 'react-hot-toast'
import SEOHead from '../components/SEOHead'
import PasswordStrengthIndicator, { checkPasswordStrength } from '../components/PasswordStrengthIndicator'

export default function ForgotPassword() {
  const [step, setStep] = useState(1) // 1: Email, 2: OTP + New Password, 3: Success
  const [email, setEmail] = useState('')
  const [maskedEmail, setMaskedEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const navigate = useNavigate()

  // Step 1: Request Password Reset OTP
  const handleRequestOtp = async (e) => {
    e.preventDefault()
    if (!email.trim()) {
      toast.error('Please enter your email address')
      return
    }

    setLoading(true)
    try {
      const res = await api.post('/auth/forgot-password', { email: email.trim() })
      setMaskedEmail(res.data.email || email)
      toast.success(res.data.message || 'Verification code sent to your email inbox! 📧')
      setStep(2)
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to send reset code. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Resend OTP
  const handleResendOtp = async () => {
    if (resending) return
    setResending(true)
    try {
      await api.post('/auth/forgot-password', { email: email.trim() })
      toast.success('A new verification code has been sent to your email inbox!')
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to resend code. Please try again.')
    } finally {
      setResending(false)
    }
  }

  // Step 2: Reset Password with OTP & New Password
  const handleResetPassword = async (e) => {
    e.preventDefault()
    const cleanOtp = otp.trim()
    if (!cleanOtp || cleanOtp.length < 6) {
      toast.error('Please enter the 6-digit verification code')
      return
    }

    const pwCheck = checkPasswordStrength(newPassword)
    if (!pwCheck.isValid) {
      if (!pwCheck.rules.length.valid) toast.error('Password must be at least 7 characters long')
      else if (!pwCheck.rules.letters.valid) toast.error('Password must contain at least 4 letters')
      else if (!pwCheck.rules.numbers.valid) toast.error('Password must contain at least 2 numbers')
      else if (!pwCheck.rules.special.valid) toast.error('Password must contain at least 1 special character (!@#$%)')
      return
    }

    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    setLoading(true)
    try {
      await api.post('/auth/reset-password', {
        email: email.trim(),
        otp: cleanOtp,
        newPassword
      })
      toast.success('Password updated successfully! 🎉')
      setStep(3)
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to reset password. Please check your code.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-bg">
      <SEOHead
        title="Reset Password | Notivexa"
        description="Reset your Notivexa account password securely using email OTP verification."
        canonical="/forgot-password"
      />
      <div style={{ position:'absolute', width:500, height:500, borderRadius:'50%', background:'#78A2D2', opacity:.07, top:-200, left:-150 }} />
      <div style={{ position:'absolute', width:400, height:400, borderRadius:'50%', background:'#FEFFAF', opacity:.06, bottom:-150, right:-100 }} />

      <div className="auth-c">
        {step === 1 && (
          <>
            <div style={{ textAlign:'center', marginBottom:24 }}>
              <div style={{ width:54, height:54, background:'linear-gradient(135deg,#78A2D2,#FEFFAF)', borderRadius:15, display:'flex', alignItems:'center', justifyContent:'center', fontSize:26, margin:'0 auto 12px' }}>🔑</div>
              <h1 style={{ fontFamily:'Sora,sans-serif', fontSize:22, fontWeight:800, color:'var(--ink)', margin: 0, padding: 0 }}>Forgot Password?</h1>
              <div style={{ fontSize:12.5, color:'var(--ink3)', marginTop:4, lineHeight:1.5 }}>
                Enter your registered email address and we'll send you a 6-digit verification code to reset your password.
              </div>
            </div>

            <form onSubmit={handleRequestOtp}>
              <div className="fg">
                <label className="fl">Email Address</label>
                <input
                  className="fi"
                  type="email"
                  placeholder="name@college.edu or personal email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  autoFocus
                />
              </div>

              <button
                type="submit"
                className="btn btn-p btn-lg wf"
                disabled={loading}
                style={{ marginTop: 8 }}
              >
                {loading ? '⏳ Sending code...' : '✉️ Send Reset Code'}
              </button>
            </form>

            <div style={{ textAlign:'center', marginTop:18, fontSize:13, color:'var(--ink2)' }}>
              Remember your password?{' '}
              <Link to="/login" style={{ color:'var(--brand)', fontWeight:700 }}>
                Sign in
              </Link>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div style={{ textAlign:'center', marginBottom:18 }}>
              <div style={{ width:54, height:54, background:'linear-gradient(135deg,#78A2D2,#5885BA)', borderRadius:15, display:'flex', alignItems:'center', justifyContent:'center', fontSize:26, margin:'0 auto 12px' }}>🛡️</div>
              <h1 style={{ fontFamily:'Sora,sans-serif', fontSize:22, fontWeight:800, color:'var(--ink)', margin: 0, padding: 0 }}>Reset Password</h1>
              <div style={{ fontSize:12.5, color:'var(--ink3)', marginTop:4, lineHeight:1.5 }}>
                We sent a 6-digit verification code to <strong>{maskedEmail}</strong>. Please check your Gmail inbox (and spam folder), then enter the code below.
              </div>
            </div>

            <form onSubmit={handleResetPassword}>
              <div className="fg">
                <label className="fl">6-Digit Verification Code</label>
                <input
                  className="fi"
                  type="text"
                  maxLength={6}
                  placeholder="Enter 6-digit code"
                  value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                  style={{ textAlign: 'center', fontSize: 22, letterSpacing: 8, fontWeight: 700 }}
                  autoFocus
                  required
                />
              </div>

              <div className="fg">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="fl">New Password</label>
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
                  placeholder="Create a new strong password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
                <PasswordStrengthIndicator password={newPassword} />
              </div>

              <div className="fg">
                <label className="fl">Confirm New Password</label>
                <input
                  className="fi"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Re-enter your new password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>

              <button
                type="submit"
                className="btn btn-p btn-lg wf"
                disabled={loading}
                style={{ marginTop: 8 }}
              >
                {loading ? '⏳ Updating password...' : '🔒 Reset Password'}
              </button>
            </form>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, fontSize: 12.5 }}>
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={resending}
                style={{ background: 'none', border: 'none', color: 'var(--brand)', cursor: 'pointer', fontWeight: 600, padding: 0 }}
              >
                {resending ? 'Sending...' : '↻ Resend Code'}
              </button>
              <button
                type="button"
                onClick={() => setStep(1)}
                style={{ background: 'none', border: 'none', color: 'var(--ink3)', cursor: 'pointer', padding: 0 }}
              >
                ← Change Email
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <div style={{ width: 64, height: 64, background: 'linear-gradient(135deg,#78A2D2,#5885BA)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, margin: '0 auto 16px', color: '#fff' }}>✓</div>
            <h2 style={{ fontFamily: 'Sora,sans-serif', fontSize: 22, fontWeight: 800, color: 'var(--ink)', marginBottom: 8 }}>Password Reset!</h2>
            <p style={{ fontSize: 13, color: 'var(--ink3)', lineHeight: 1.6, marginBottom: 24 }}>
              Your password has been securely updated. You can now sign in to Notivexa using your new credentials.
            </p>
            <button
              type="button"
              className="btn btn-p btn-lg wf"
              onClick={() => navigate('/login')}
            >
              🚀 Sign In Now
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
