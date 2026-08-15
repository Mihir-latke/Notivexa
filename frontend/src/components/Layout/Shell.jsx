import { useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

const NAV = [
  {s:'Home'},
  {p:'/dashboard',   i:'🏠', l:'Dashboard',        b:'30 Features'},
  {p:'/upload',      i:'📤', l:'Upload Files'},
  {s:'AI Studio'},
  {p:'/notebook',    i:'📓', l:'AI Notebook',       b:'11 Outputs'},
  {p:'/flashcards',  i:'🃏', l:'Flashcard Studio'},
  {p:'/podcast',     i:'🎙️', l:'Audio Lecture'},
  {p:'/chatbot',     i:'🧠', l:'AI Tutor'},
  {s:'Analytics'},
  {p:'/performance', i:'📈', l:'Performance'},
  {p:'/features',    i:'✨', l:'All 30 Features'},
  {s:'Resources'},
  {p:'/library',     i:'🗄️', l:'Smart Library'},
  {p:'/ebooks',      i:'📚', l:'E-Books & Videos'},
  {p:'/planner',     i:'📅', l:'Study Planner'},
  {p:'/settings',    i:'⚙️', l:'Settings'},
]

const META = {
  '/dashboard':  {t:'Dashboard',         s:'All 30 features — click any to run instantly'},
  '/upload':     {t:'Upload Files',       s:'PDF or image — Notivexa reads and analyses everything'},
  '/notebook':   {t:'AI Notebook',        s:'11 output types from your PDF'},
  '/flashcards': {t:'Flashcard Studio',   s:'3D flip cards with spaced repetition'},
  '/podcast':    {t:'Audio Lecture',      s:'Real Indian English MP3 from your PDF'},
  '/chatbot':    {t:'AI Tutor',           s:'Detailed answers from your document'},
  '/library':    {t:'Smart Library',      s:'All documents and generated files'},
  '/ebooks':     {t:'E-Books & Videos',   s:'Free books and YouTube for MCA, JEE, NEET'},
  '/planner':    {t:'Study Planner',      s:'Syllabus-based AI schedule with exam countdown'},
  '/features':   {t:'All 30 Features',   s:'Complete feature overview'},
  '/performance':{t:'Performance',        s:'Track accuracy and progress'},
  '/settings':   {t:'Settings',          s:'Theme, language, API status'},
}

const inits = n => n ? n.split(' ').map(x=>x[0]).join('').toUpperCase().slice(0,2) : 'U'

export default function Shell() {
  const [col, setCol] = useState(false)
  const { user, logout } = useAuth()
  const nav = useNavigate()
  const { pathname } = useLocation()
  const m = META[pathname] || {t:'Notivexa', s:'AI Academic Platform'}

  return (
    <div className="shell">
      <nav className={`sb${col ? ' col' : ''}`}>
        <div className="sb-head">
          <div className="sb-logo">📖</div>
          {!col && <div><div className="sb-name">Notivexa</div><div className="sb-tag">30 AI Features</div></div>}
        </div>
        <button className="tgl" onClick={() => setCol(c => !c)} title={col ? 'Expand' : 'Collapse'}>{col ? '›' : '‹'}</button>
        <div style={{flex:1, overflowY:'auto', overflowX:'hidden', paddingBottom:8}}>
          {NAV.map((item, i) => {
            if (item.s) return <div key={i} className="sb-sec">{item.s}</div>
            const on = pathname === item.p
            return (
              <div key={item.p} className={`nav${on?' on':''}`} onClick={() => nav(item.p)} title={col ? item.l : ''}>
                <span className="ni">{item.i}</span>
                <span className="nl">{item.l}</span>
                {item.b && !col && <span className="nb">{item.b}</span>}
              </div>
            )
          })}
        </div>
        <div className="sb-foot">
          <div className="urow">
            <div className="av" style={{width:28, height:28, fontSize:10}}>{inits(user?.name)}</div>
            {!col && <>
              <div style={{flex:1, minWidth:0}}>
                <div className="uname" style={{fontSize:12, fontWeight:600, color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{user?.name}</div>
                <div className="urole" style={{fontSize:10, color:'rgba(255,255,255,0.28)', textTransform:'capitalize'}}>{user?.role}</div>
              </div>
              <span className="uout" onClick={logout} style={{color:'rgba(255,255,255,0.25)', cursor:'pointer', fontSize:14}} title="Logout">⏻</span>
            </>}
          </div>
        </div>
      </nav>
      <div className="main">
        <header className="topbar">
          <div>
            <div className="pg-t">{m.t}</div>
            <div className="pg-s">{m.s}</div>
          </div>
          <div style={{display:'flex', alignItems:'center', gap:8}}>
            <span className="chip" style={{background:'linear-gradient(90deg,#5B4FE8,#8B5CF6)', color:'#fff', border:'none'}}>✨ 30 Features</span>
            <div className="av" title={user?.name}>{inits(user?.name)}</div>
          </div>
        </header>
        <main className="pg ai-anim"><Outlet /></main>
      </div>
    </div>
  )
}
