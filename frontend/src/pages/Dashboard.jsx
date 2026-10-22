import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useState, useEffect } from 'react'
import api from '../utils/api'

const TOOLS = [
  { path:'/upload',    icon:'📤', title:'Upload / Link',     desc:'PDF, Google Drive, YouTube & Web',   color:'#EDE9FE', badge:'START' },
  { path:'/notebook',  icon:'📓', title:'AI Notebook',      desc:'Notes, Q-papers, slides, mindmaps',color:'#DBEAFE', badge:'CORE'  },
  { path:'/flashcards',icon:'🃏', title:'Flashcard Studio', desc:'AI flip cards from your PDF',      color:'#DCFCE7', badge:null    },
  { path:'/chatbot',   icon:'🧠', title:'Ask Your PDF',     desc:'Detailed answers from document',   color:'#FEF9C3', badge:'NEW'   },
  { path:'/podcast',   icon:'🎙️', title:'Audio Lecture',    desc:'PDF → spoken MP3 lecture',         color:'#E0E7FF', badge:null    },
  { path:'/library',   icon:'🗄️', title:'My Library',       desc:'All docs & generated files',       color:'#F0FDF4', badge:null    },
  { path:'/ebooks',    icon:'📚', title:'Free E-Books',      desc:'NCERT, HCV, Irodov & more',        color:'#FFF7ED', badge:null    },
  { path:'/planner',   icon:'📅', title:'Study Planner',    desc:'AI exam schedule',                 color:'#FFFBEB', badge:null    },
]

const FREE_APIS = [
  { name:'Groq AI', url:'https://console.groq.com', key:'GROQ_API_KEY', icon:'⚡', desc:'Free Llama 3 AI — fastest, no credit card', steps:['Go to console.groq.com','Sign up free','Click API Keys → Create','Copy key → paste in backend/.env'] },
  { name:'Google Gemini', url:'https://aistudio.google.com', key:'GEMINI_API_KEY', icon:'🔷', desc:'Free Gemini 1.5 Flash — unlimited', steps:['Go to aistudio.google.com','Sign in with Google','Click "Get API Key"','Copy key → paste in backend/.env'] },
  { name:'Google TTS', url:'https://console.cloud.google.com', key:'GOOGLE_TTS_API_KEY', icon:'🔊', desc:'1M chars/month free audio', steps:['Go to console.cloud.google.com','Enable Cloud Text-to-Speech API','Create Credentials → API Key','Copy key → paste in backend/.env'] },
  { name:'ElevenLabs', url:'https://elevenlabs.io', key:'ELEVENLABS_API_KEY', icon:'🎤', desc:'10K chars free, best voice quality', steps:['Go to elevenlabs.io','Sign up free','Go to Profile → API Key','Copy key → paste in backend/.env'] },
]

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const stats = user?.studyStats || {}
  const firstName = user?.name?.split(' ')[0] || 'Student'
  const [setup, setSetup] = useState(null)
  const [showSetup, setShowSetup] = useState(false)
  const [openApi, setOpenApi] = useState(null)

  useEffect(() => {
    api.get('/setup').then(r => setSetup(r.data)).catch(() => {})
  }, [])

  return (
    <div>
      {/* Hero banner */}
      <div style={{ background:'linear-gradient(135deg,#4F46E5,#7C3AED)', borderRadius:16, padding:'22px 26px', marginBottom:18, color:'#fff', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', right:-20, top:-20, width:180, height:180, borderRadius:'50%', background:'rgba(255,255,255,.06)' }} />
        <div style={{ fontSize:13, opacity:.76, marginBottom:3 }}>Namaste, {firstName}! 🙏</div>
        <div style={{ fontFamily:'Sora,sans-serif', fontSize:20, fontWeight:800, marginBottom:5 }}>Notivexa — AI Academic Intelligence</div>
        <div style={{ fontSize:12.5, opacity:.8, marginBottom:16, maxWidth:500 }}>
          Upload PDF/Photo or paste any YouTube/Web Link → Get notes, flashcards, question papers, audio lectures — all from YOUR content.
        </div>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
          <button className="btn" style={{ background:'#fff', color:'var(--brand)', fontWeight:700 }} onClick={() => navigate('/upload')}>📤 Upload or Paste Link</button>
          <button className="btn" style={{ background:'rgba(255,255,255,.15)', color:'#fff', border:'1px solid rgba(255,255,255,.25)' }} onClick={() => navigate('/notebook')}>📓 AI Notebook</button>
        </div>
      </div>

      {/* Stats */}
      <div className="g4" style={{ marginBottom:18 }}>
        {[
          { label:'PDFs Uploaded',    val:stats.documentsUploaded||0, icon:'📄' },
          { label:'Notes Generated',  val:stats.notesGenerated||0,    icon:'📝' },
          { label:'Flashcards Made',  val:stats.flashcardsCreated||0, icon:'🃏' },
          { label:'AI Features',      val:9,                          icon:'🤖' },
        ].map((s,i) => (
          <div key={i} className="sc">
            <div style={{ fontSize:22, marginBottom:9 }}>{s.icon}</div>
            <div className="sv">{s.val}</div>
            <div className="sl">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tools grid */}
      <div className="sec" style={{ marginBottom:12 }}>
        <h2 className="st" style={{ margin:0, padding:0, fontSize:14 }}>🤖 AI Tools — All powered by your PDF</h2>
      </div>
      <div className="tools-grid">
        {TOOLS.map((t,i) => (
          <div key={i} className="fc" onClick={() => navigate(t.path)}>
            {t.badge && <span className={t.badge==='START'||t.badge==='CORE'?'bn':'bh'} style={{ position:'absolute', top:11, right:11 }}>{t.badge}</span>}
            <div style={{ width:42, height:42, borderRadius:11, background:t.color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, marginBottom:11 }}>{t.icon}</div>
            <div style={{ fontFamily:'Sora,sans-serif', fontSize:13, fontWeight:700, marginBottom:3 }}>{t.title}</div>
            <div style={{ fontSize:11.5, color:'var(--ink3)' }}>{t.desc}</div>
          </div>
        ))}
      </div>

      
    </div>
  )
}
