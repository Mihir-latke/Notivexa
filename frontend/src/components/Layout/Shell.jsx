import { useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import SEOHead from '../SEOHead'

const NAV=[
  {s:'Main'},{p:'/dashboard',i:'🏠',l:'Dashboard'},
  {p:'/upload',i:'📤',l:'Upload PDF',b:'START'},
  {s:'AI Tools — From Your PDF'},
  {p:'/notebook',i:'📓',l:'AI Notebook',b:'CORE'},
  {p:'/flashcards',i:'🃏',l:'Flashcard Studio'},
  {p:'/podcast',i:'🎙️',l:'Audio Lecture'},
  {p:'/chatbot',i:'🧠',l:'Ask Your PDF'},
  {s:'Resources'},
  {p:'/library',i:'🗄️',l:'My Library'},
  {p:'/ebooks',i:'📚',l:'Free E-Books'},
  {p:'/planner',i:'📅',l:'Study Planner'},
  {p:'/settings',i:'⚙️',l:'Settings'},
]
const META={
  '/dashboard':{
    t:'Dashboard',
    s:'Your AI academic companion — powered by your PDFs',
    d:'View your academic study statistics, recent documents, and launch AI study workflows.'
  },
  '/upload':{
    t:'Upload & Extract',
    s:'Upload textbooks, notes, photo captures or YouTube links',
    d:'Upload academic PDFs, capture handwritten notes via camera, or import YouTube lectures for AI extraction.'
  },
  '/notebook':{
    t:'AI Notebook',
    s:'Generate handwritten notes in 15 fonts, exams, slides & mindmaps',
    d:'Generate realistic handwritten study notes, Bloom’s Taxonomy question papers, slide presentations, and process flowcharts.'
  },
  '/flashcards':{
    t:'Flashcard Studio',
    s:'Smart flashcards created from your uploaded document',
    d:'Study with AI-generated interactive flashcards with difficulty grading and spaced repetition.'
  },
  '/podcast':{
    t:'Audio Lecture',
    s:'Convert your PDF into a spoken audio lecture',
    d:'Listen to spoken academic audio lectures generated directly from your textbook chapters and notes.'
  },
  '/chatbot':{
    t:'Ask Your PDF',
    s:'Chat with your document — answers only from your content',
    d:'Ask questions to your academic document with step-by-step derivations, definitions, and zero hallucination.'
  },
  '/library':{
    t:'My Library',
    s:'All your documents and generated study materials',
    d:'Manage all uploaded PDFs, extracted text, generated handwritten notes, question papers, and audio files.'
  },
  '/ebooks':{
    t:'Free E-Books & Lectures',
    s:'Discover free Indian academic textbooks and video playlists',
    d:'Browse curated free academic textbooks (NCERT, CLRS, Let Us C, Galvin) and video playlists for university students.'
  },
  '/planner':{
    t:'Study Planner',
    s:'AI-powered study schedule for your exams',
    d:'Generate a custom exam revision timetable with daily study hours and high-yield questions.'
  },
  '/settings':{
    t:'Settings',
    s:'Account preferences, themes, and profile options',
    d:'Manage your profile, change theme preferences, switch language accents, and update security credentials.'
  },
  '/404':{
    t:'Page Not Found',
    s:'The requested resource could not be found',
    d:'404 Page Not Found. Return to your dashboard or explore the notebook and library.'
  }
}
const inits=n=>n?n.split(' ').map(x=>x[0]).join('').toUpperCase().slice(0,2):'U'
const THEME_ICONS = { default:'🌈', light:'☀️', dark:'🌙' }
const THEME_CYCLE = { default:'light', light:'dark', dark:'default' }
export default function Shell(){
  const[col,setCol]=useState(false)
  const{user,logout}=useAuth()
  const{theme,setTheme}=useTheme()
  const nav=useNavigate()
  const{pathname}=useLocation()
  const m=META[pathname]||{t:'Notivexa',s:''}
  return(
    <div className="shell">
      <nav className={`sb${col?' col':''}`}>
        <div className="sb-head">
          <div className="sb-logo">📖</div>
          {!col&&<div><div className="sb-name">Notivexa</div><div className="sb-tag">AI Academic Intelligence</div></div>}
        </div>
        <button className="tgl" onClick={()=>setCol(c=>!c)}>{col?'→':'←'}</button>
        <div style={{flex:1,overflowY:'auto',overflowX:'hidden',paddingBottom:8}}>
          {NAV.map((item,i)=>{
            if(item.s) return <div key={i} className="sb-sec">{item.s}</div>
            const on=pathname===item.p
            return(
              <div key={item.p} className={`nav${on?' on':''}`} onClick={()=>nav(item.p)} title={col?item.l:''}>
                <span className="ni">{item.i}</span>
                <span className="nl">{item.l}</span>
                {item.b&&!col&&<span className="nb">{item.b}</span>}
              </div>
            )
          })}
        </div>
        <div className="sb-foot">
          <div className="urow">
            <div className="av" style={{width:30,height:30,fontSize:11}} role="img" aria-label={`Avatar for ${user?.name || 'User'}`}>{inits(user?.name)}</div>
            {!col&&<>
              <div style={{flex:1,minWidth:0}}>
                <div className="uname" style={{fontSize:12.5,fontWeight:600,color:'#fff',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{user?.name}</div>
                <div className="urole" style={{fontSize:10.5,color:'rgba(255,255,255,0.35)'}}>{user?.role==='teacher'?'👩‍🏫 Teacher':'🎒 Student'}</div>
              </div>
              <span className="uout" onClick={logout} style={{color:'rgba(255,255,255,0.3)',cursor:'pointer',fontSize:16}} title="Logout">⏻</span>
            </>}
          </div>
        </div>
      </nav>
      <div className="main">
        <SEOHead title={m.t} description={m.d || m.s} canonical={pathname} />
        <header className="topbar">
          <div>
            <h1 className="pg-t" style={{ margin: 0, padding: 0 }}>{m.t}</h1>
            <div className="pg-s">{m.s}</div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <button onClick={()=>setTheme(THEME_CYCLE[theme])} title={'Switch theme'} style={{background:'var(--bg2)',border:'1px solid var(--bdr2)',borderRadius:8,padding:'5px 10px',cursor:'pointer',display:'flex',alignItems:'center',gap:5,fontFamily:'Inter,sans-serif',fontWeight:600,color:'var(--ink2)',fontSize:12}}>
              {THEME_ICONS[theme]} {theme.charAt(0).toUpperCase()+theme.slice(1)}
            </button>
            <div className="chip">🇮🇳 Indian English</div>
            <div className="av" title={user?.name} role="img" aria-label={`Profile avatar of ${user?.name || 'User'}`}>{inits(user?.name)}</div>
          </div>
        </header>
        <main className="page ai"><Outlet/></main>
      </div>
    </div>
  )
}
