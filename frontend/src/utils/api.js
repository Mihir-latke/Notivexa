import axios from 'axios'
import toast from 'react-hot-toast'

// ─── Render Cold-Start Manager ───────────────────────────────────────────────
// Render free-tier servers spin down after 15 min inactivity and take ~30–60s
// to wake. This module pings /api/health in the background, shows a friendly
// banner while the server boots, and auto-dismisses when it's ready.

let serverReady = false       // Set to true once /api/health returns 200
let pingInterval = null        // ID for the polling interval
let warmupToastId = null       // react-hot-toast ID so we can dismiss it
let warmupStarted = false      // Guard so we start pinging only once

function formatWarmupTime(secs) {
  if (secs < 60) return `${secs}s`
  return `${Math.floor(secs / 60)}m ${secs % 60}s`
}

export function startServerWarmup() {
  if (warmupStarted) return
  warmupStarted = true

  // Show a dismissable loading toast immediately
  warmupToastId = toast.loading(
    '⏳ Backend server starting up… Please wait (usually 20–60s)',
    { duration: Infinity, id: 'server-warmup' }
  )

  let elapsed = 0
  const MAX_WAIT_SECS = 120   // give up after 2 minutes

  pingInterval = setInterval(async () => {
    elapsed += 5
    try {
      const res = await axios.get('/api/health', { timeout: 8000 })
      if (res.status === 200 && res.data?.status !== 'unhealthy') {
        serverReady = true
        clearInterval(pingInterval)
        pingInterval = null
        toast.success('✅ Server ready! You can now log in.', { id: 'server-warmup', duration: 3500 })
        warmupToastId = null
        return
      }
    } catch {
      // Still booting — ignore error and keep pinging
    }

    if (elapsed >= MAX_WAIT_SECS) {
      clearInterval(pingInterval)
      pingInterval = null
      toast.error(
        '⚠️ Server is taking longer than usual. Try refreshing the page.',
        { id: 'server-warmup', duration: 8000 }
      )
    } else {
      // Update the loading message with live elapsed time
      toast.loading(
        `⏳ Server warming up… (${formatWarmupTime(elapsed)} elapsed — usually finishes in 30–60s)`,
        { id: 'server-warmup', duration: Infinity }
      )
    }
  }, 5000)   // poll every 5 seconds
}

// Probe once on module load — if server responds instantly it's already warm
;(async () => {
  try {
    const res = await axios.get('/api/health', { timeout: 5000 })
    if (res.status === 200 && res.data?.status !== 'unhealthy') {
      serverReady = true
    }
  } catch {
    // Server is cold — warmup will be triggered by first 503/network error
  }
})()

// ─── Axios Instance ───────────────────────────────────────────────────────────
const api = axios.create({ baseURL: '/api', timeout: 180000 })

api.interceptors.request.use(cfg => {
  const t = localStorage.getItem('ntv_token')
  if (t) cfg.headers.Authorization = `Bearer ${t}`
  return cfg
})

api.interceptors.response.use(
  r => r,
  err => {
    const status = err.response?.status
    const isNetworkError = !err.response && (err.code === 'ERR_NETWORK' || err.code === 'ECONNREFUSED' || err.message === 'Network Error')
    const isServerStartup = status === 503 || status === 502 || isNetworkError

    // ── 401 → redirect to login (unless already on login/register page)
    if (status === 401) {
      const p = typeof window !== 'undefined' ? window.location.pathname : ''
      if (p !== '/login' && p !== '/register') {
        localStorage.removeItem('ntv_token')
        localStorage.removeItem('ntv_user')
        window.location.href = '/login'
      }
      return Promise.reject(err)
    }

    // ── 503 / 502 / network error → server is cold-starting
    if (isServerStartup && !serverReady) {
      startServerWarmup()
      // Suppress the generic "Server error" toast for startup failures
      return Promise.reject(err)
    }

    // ── Generic 5xx errors (after server is known-ready)
    if (status >= 500) {
      const msg = err.response?.data?.error || 'Server error. Please try again.'
      toast.error(msg)
    }

    return Promise.reject(err)
  }
)

// ─── Authenticated Media URL Utility ─────────────────────────────────────────
export const getAuthedMediaUrl = (url) => {
  if (!url || typeof url !== 'string') return ''
  if (url.startsWith('data:') || url.startsWith('blob:')) return url

  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('ntv_token') : null
  if (!token) return url

  try {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const parsed = new URL(url)
      if (typeof window !== 'undefined' && parsed.origin !== window.location.origin) {
        return url
      }
    }
  } catch {}

  const cleanUrl = url.replace(/([?&])token=[^&]+(&|$)/, '$1').replace(/[?&]$/, '')
  const separator = cleanUrl.includes('?') ? '&' : '?'
  return `${cleanUrl}${separator}token=${encodeURIComponent(token)}`
}

export const getMediaUrlWithToken = getAuthedMediaUrl

export default api
