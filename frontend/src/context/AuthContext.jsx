import { createContext, useContext, useState, useEffect } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'
const Ctx = createContext(null)
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const t = localStorage.getItem('ntv_token'); const u = localStorage.getItem('ntv_user')
    if (t && u) { try { setUser(JSON.parse(u)) } catch {} }
    setLoading(false)
  }, [])
  const login = async (email, password) => {
    const r = await api.post('/auth/login', { email, password })
    localStorage.setItem('ntv_token', r.data.token); localStorage.setItem('ntv_user', JSON.stringify(r.data.user))
    setUser(r.data.user); return r.data.user
  }
  const register = async (data) => {
    const r = await api.post('/auth/register', data)
    localStorage.setItem('ntv_token', r.data.token); localStorage.setItem('ntv_user', JSON.stringify(r.data.user))
    setUser(r.data.user); return r.data.user
  }
  const logout = () => { localStorage.removeItem('ntv_token'); localStorage.removeItem('ntv_user'); setUser(null); toast.success('Logged out') }
  const updateUser = u => { setUser(u); localStorage.setItem('ntv_user', JSON.stringify(u)) }
  return <Ctx.Provider value={{ user, loading, login, register, logout, updateUser }}>{children}</Ctx.Provider>
}
export const useAuth = () => { const c = useContext(Ctx); if (!c) throw new Error('useAuth outside AuthProvider'); return c }