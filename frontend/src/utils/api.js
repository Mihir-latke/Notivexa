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
    localStorage.removeItem('ntv_token'); localStorage.removeItem('ntv_user')
    window.location.href = '/login'; return Promise.reject(err)
  }
  if (err.response?.status >= 500) toast.error(err.response?.data?.error || 'Server error')
  return Promise.reject(err)
})
export default api