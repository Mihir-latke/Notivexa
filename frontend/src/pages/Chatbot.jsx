import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../utils/api'

const SUGGESTED = [
  "Explain the main concepts in this document",
  "What are the important formulas mentioned?",
  "Give me a summary of chapter 1",
  "What are the key definitions?",
  "Explain with an example from the document",
  "What topics should I focus on for exams?",
  "Explain step by step",
  "Give me MCQ questions from this topic"
]

export default function Chatbot() {
  const[docs,setDocs]=useState([])
  const[docId,setDocId]=useState('')
  const[chatLang,setChatLang]=useState('auto')
  const[sessId,setSessId]=useState(null)
  const[msgs,setMsgs]=useState([
    {role:'assistant',content:`Namaste! 🙏 I am your Notivexa AI Tutor.

Select a PDF document above, then ask me anything about it. I will:
• Give detailed, thorough explanations
• Explain formulas step by step
• Provide examples from your document
• Answer ONLY from your document content (like NotebookLM)

Try asking: "Explain the main topic" or "What are the key formulas?"`}
  ])
  const[input,setInput]=useState('')
  const[loading,setLoading]=useState(false)
  const bottom=useRef()
  const navigate=useNavigate()

  useEffect(()=>{api.get('/documents?status=ready').then(r=>setDocs(r.data.documents||[])).catch(()=>{})},[])
  useEffect(()=>{bottom.current?.scrollIntoView({behavior:'smooth'})},[msgs])

  const send=async(msg)=>{
    const m=(msg||input).trim()
    if(!m)return
    setInput('')
    setMsgs(p=>[...p,{role:'user',content:m}])
    setLoading(true)
    try{
      const res=await api.post('/chatbot/message',{message:m,documentId:docId||undefined,sessionId:sessId,outputLanguage:chatLang})
      setSessId(res.data.sessionId)
      setMsgs(p=>[...p,{role:'assistant',content:res.data.reply}])
    }catch{
      setMsgs(p=>[...p,{role:'assistant',content:'Sorry, something went wrong. Please try again.'}])
    }
    finally{setLoading(false)}
  }

  const reset=()=>{
    setMsgs([{role:'assistant',content:'New chat started! Select a document and ask me anything.'}])
    setSessId(null)
  }

  return(
    <div style={{display:'flex',flexDirection:'column',height:'calc(100vh - 140px)'}}>
      {/* Doc selector & Language */}
      <div style={{display:'flex',gap:10,marginBottom:10,flexShrink:0}}>
        <select className="fi" style={{flex:1}} value={docId} onChange={e=>setDocId(e.target.value)}>
          <option value="">🌐 General AI Tutor (no document)</option>
          {docs.map(d=><option key={d._id} value={d._id}>📄 {d.title} ({d.wordCount?.toLocaleString()} words)</option>)}
        </select>
        <select className="fi" style={{width:170}} value={chatLang} onChange={e=>setChatLang(e.target.value)}>
          <option value="auto">🌐 Auto / Original</option>
          <option value="english">🇬🇧 English</option>
          <option value="hindi">🇮🇳 Hindi</option>
          <option value="marathi">🇮🇳 Marathi</option>
          <option value="gujarati">🇮🇳 Gujarati</option>
          <option value="bengali">🇮🇳 Bengali</option>
          <option value="tamil">🇮🇳 Tamil</option>
          <option value="telugu">🇮🇳 Telugu</option>
          <option value="kannada">🇮🇳 Kannada</option>
          <option value="urdu">🇵🇰 Urdu</option>
          <option value="arabic">🇸🇦 Arabic</option>
          <option value="spanish">🇪🇸 Spanish</option>
          <option value="french">🇫🇷 French</option>
          <option value="german">🇩🇪 German</option>
          <option value="chinese">🇨🇳 Chinese</option>
          <option value="japanese">🇯🇵 Japanese</option>
          <option value="korean">🇰🇷 Korean</option>
          <option value="russian">🇷🇺 Russian</option>
        </select>
        <button className="btn btn-g btn-sm" onClick={reset}>🔄 New Chat</button>
      </div>

      {docId && (
        <div className="ib b" style={{marginBottom:10,fontSize:12,flexShrink:0}}>
          📄 AI will answer from: <strong>{docs.find(d=>d._id===docId)?.title}</strong> — Detailed answers only from document content
        </div>
      )}
      {docs.length===0 && (
        <div className="ib a" style={{marginBottom:10,fontSize:12,flexShrink:0}}>
          ⚠️ No documents. <button className="btn btn-g btn-sm" onClick={()=>navigate('/upload')}>Upload PDF first</button>
        </div>
      )}

      {/* Messages */}
      <div style={{flex:1,overflowY:'auto',display:'flex',flexDirection:'column',gap:12,paddingRight:4}}>
        {msgs.map((m,i)=>(
          <div key={i} style={{display:'flex',justifyContent:m.role==='user'?'flex-end':'flex-start',alignItems:'flex-end',gap:9}}>
            {m.role==='assistant'&&<div style={{width:32,height:32,borderRadius:'50%',background:'var(--brand)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:15,flexShrink:0}}>🧠</div>}
            <div className={m.role==='user'?'cu':'ca'} style={{whiteSpace:'pre-wrap',maxWidth:m.role==='user'?'70%':'85%'}}>{m.content}</div>
          </div>
        ))}
        {loading&&(
          <div style={{display:'flex',gap:9}}>
            <div style={{width:32,height:32,borderRadius:'50%',background:'var(--brand)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:15}}>🧠</div>
            <div className="ca"><div className="dots" style={{padding:0}}><div className="dot"/><div className="dot"/><div className="dot"/></div></div>
          </div>
        )}
        <div ref={bottom}/>
      </div>

      {/* Suggested questions */}
      {msgs.length <= 2 && (
        <div style={{flexShrink:0,marginTop:8,marginBottom:8}}>
          <div style={{fontSize:11.5,color:'var(--ink3)',marginBottom:6,fontWeight:600}}>💡 Try asking:</div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            {SUGGESTED.slice(0,4).map((q,i)=>(
              <button key={i} className="btn btn-g btn-sm" style={{fontSize:11.5}} onClick={()=>send(q)}>{q}</button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div style={{display:'flex',gap:10,marginTop:8,flexShrink:0}}>
        <input className="fi" style={{flex:1}} placeholder="Ask a detailed question about your PDF..." value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&!e.shiftKey&&send()}/>
        <button className="btn btn-p" onClick={()=>send()} disabled={loading||!input.trim()}>Send ↗</button>
      </div>
    </div>
  )
}