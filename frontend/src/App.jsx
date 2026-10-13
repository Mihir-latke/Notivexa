import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Shell from './components/Layout/Shell'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Upload from './pages/Upload'
import Notebook from './pages/Notebook'
import Flashcards from './pages/Flashcards'
import Podcast from './pages/Podcast'
import Chatbot from './pages/Chatbot'
import Library from './pages/Library'
import Ebooks from './pages/Ebooks'
import Planner from './pages/Planner'
import Settings from './pages/Settings'
import NotFound from './pages/NotFound'

function Protected({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center'}}><div style={{textAlign:'center'}}><div style={{fontSize:42,marginBottom:12}}>📖</div><div style={{fontFamily:'Sora,sans-serif',fontSize:13,color:'#6E6C8A'}}>Loading Notivexa...</div></div></div>
  return user ? children : <Navigate to="/login" replace />
}
function Public({ children }) {
  const { user, loading } = useAuth()
  if (loading) return null
  return !user ? children : <Navigate to="/dashboard" replace />
}
export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login"    element={<Public><Login/></Public>}/>
        <Route path="/register" element={<Public><Register/></Public>}/>
        <Route path="/" element={<Protected><Shell/></Protected>}>
          <Route index element={<Navigate to="/dashboard" replace/>}/>
          <Route path="dashboard"  element={<Dashboard/>}/>
          <Route path="upload"     element={<Upload/>}/>
          <Route path="notebook"   element={<Notebook/>}/>
          <Route path="flashcards" element={<Flashcards/>}/>
          <Route path="podcast"    element={<Podcast/>}/>
          <Route path="chatbot"    element={<Chatbot/>}/>
          <Route path="library"    element={<Library/>}/>
          <Route path="ebooks"     element={<Ebooks/>}/>
          <Route path="planner"    element={<Planner/>}/>
          <Route path="settings"   element={<Settings/>}/>
          <Route path="404"        element={<NotFound/>}/>
          <Route path="*"          element={<NotFound/>}/>
        </Route>
        <Route path="/404" element={<NotFound/>}/>
        <Route path="*"    element={<NotFound/>}/>
      </Routes>
    </AuthProvider>
  )
}