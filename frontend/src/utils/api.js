import axios from 'axios'
import toast from 'react-hot-toast'
const api = axios.create({ baseURL: '/api', timeout: 180000 })
api.interceptors.request.use(cfg => {
  const t = localStorage.getItem('ntv_token')
  if (t) cfg.headers.Authorization = `Bearer ${t}`
  return cfg
})
api.interceptors.response.use(r => r, err => {
  if (err.response?.status === 401) {
    const p = typeof window !== 'undefined' ? window.location.pathname : ''
    if (p !== '/login' && p !== '/register') {
      localStorage.removeItem('ntv_token')
      localStorage.removeItem('ntv_user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
  if (err.response?.status >= 500) toast.error(err.response?.data?.error || 'Server error')
  return Promise.reject(err)
})
export const getAuthedMediaUrl = (url) => {
  if (!url || typeof url !== 'string') return '';
  if (url.startsWith('data:') || url.startsWith('blob:')) return url;

  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('ntv_token') : null;
  if (!token) return url;

  // If it's an external domain, do not append authentication token
  try {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const parsed = new URL(url);
      if (typeof window !== 'undefined' && parsed.origin !== window.location.origin) {
        return url;
      }
    }
  } catch {}

  // Strip existing token query parameter if present to avoid duplicates
  const cleanUrl = url.replace(/([?&])token=[^&]+(&|$)/, '$1').replace(/[?&]$/, '');
  const separator = cleanUrl.includes('?') ? '&' : '?';
  return `${cleanUrl}${separator}token=${encodeURIComponent(token)}`;
};

export const getMediaUrlWithToken = getAuthedMediaUrl;

export default api
