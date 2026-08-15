import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../utils/api'

export default function Podcast() {
  const[docs,setDocs]=useState([])
  const[docId,setDocId]=useState('')
  const[doc,setDoc]=useState(null)
  const[sec,setSec]=useState('')
  const[lang,setLang]=useState('English')
  const[voice,setVoice]=useState('male')
  const[loading,setLoading]=useState(false)
  const[result,setResult]=useState(null)
  const[playing,setPlaying]=useState(false)
  const[prog,setProg]=useState(0)
  const[dur,setDur]=useState(0)
  const[vol,setVol]=useState(1)
  const ref=useRef()
  const navigate=useNavigate()

  useEffect(()=>{api.get('/documents?status=ready').then(r=>setDocs(r.data.documents||[])).catch(()=>{})},[])
  useEffect(()=>{if(docId)api.get(`/documents/${docId}`).then(r=>setDoc(r.data.document)).catch(()=>{})},[docId])

  const generate=async()=>{
    if(!docId){toast.error('Select a document');return}
    setLoading(true);setResult(null)
    try{
      const res=await api.post('/generate/podcast',{documentId:docId,sectionIndex:sec!==''?parseInt(sec):undefined,language:lang,voiceStyle:voice})
      setResult(res.data)
      if(res.data.provider&&res.data.provider!=='placeholder') toast.success(`🎙️ Real audio generated using ${res.data.provider}!`)
      else toast('📄 Script ready! Add GOOGLE_TTS_API_KEY for real audio',{icon:'ℹ️'})
    }catch(err){toast.error(err.response?.data?.error||'Generation failed')}
    finally{setLoading(false)}
  }

  const togglePlay=()=>{
    if(!ref.current)return
    if(playing){ref.current.pause();setPlaying(false)}
    else{ref.current.play().then(()=>setPlaying(true)).catch(e=>{toast.error('Audio playback failed. Download the MP3 instead.');setPlaying(false)})}
  }

  const seek=(e)=>{
    if(!ref.current||!dur)return
    const r=e.currentTarget.getBoundingClientRect()
    ref.current.currentTime=(e.clientX-r.left)/r.width*dur
  }

  const fmt=s=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`
  const bars=Array.from({length:40},(_,i)=>10+Math.abs(Math.sin(i*.7))*28+Math.abs(Math.sin(i*.3))*10)

  return(
    <div className="tc" style={{alignItems:'start'}}>
      <div>
        {result?(
          <div>
            <div className="pp" style={{marginBottom:16}}>
              <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:8}}>
                <div style={{width:50,height:50,borderRadius:12,background:'rgba(255,255,255,0.12)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22}}>🎙️</div>
                <div>
                  <div style={{fontWeight:700,fontSize:15,marginBottom:2}}>{doc?.title?.slice(0,40)}</div>
                  <div style={{fontSize:11.5,opacity:.65}}>
                    {result.provider&&result.provider!=='placeholder'?`✅ ${result.provider}`:'📄 Script ready'} · ~{result.duration||8} min
                  </div>
                </div>
              </div>

              {/* Waveform */}
              <div style={{display:'flex',alignItems:'center',gap:1.5,height:48,margin:'14px 0',justifyContent:'center'}}>
                {bars.map((h,i)=><div key={i} className={`wb${playing?' pl':''}`} style={{height:h,animationDelay:`${i*.04}s`}}/>)}
              </div>

              {/* Progress */}
              <div style={{display:'flex',justifyContent:'space-between',fontSize:11,opacity:.55,marginBottom:6}}>
                <span>{fmt(prog)}</span><span>{fmt(dur||(result.duration||8)*60)}</span>
              </div>
              <div style={{height:5,background:'rgba(255,255,255,0.15)',borderRadius:3,marginBottom:16,cursor:'pointer'}} onClick={seek}>
                <div style={{width:`${dur?prog/dur*100:0}%`,height:'100%',background:'var(--brand3)',borderRadius:3,transition:'width .3s'}}/>
              </div>

              {/* Controls */}
              <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:16,marginBottom:14}}>
                <button onClick={()=>{if(ref.current)ref.current.currentTime=Math.max(0,ref.current.currentTime-15)}} style={{width:36,height:36,borderRadius:'50%',border:'none',background:'rgba(255,255,255,0.12)',color:'#fff',cursor:'pointer',fontSize:13,display:'flex',alignItems:'center',justifyContent:'center'}}>⏪15s</button>
                <button onClick={togglePlay} style={{width:56,height:56,borderRadius:'50%',border:'none',background:'var(--brand)',color:'#fff',cursor:'pointer',fontSize:20,display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 4px 14px rgba(79,70,229,.5)'}}>{playing?'⏸':'▶'}</button>
                <button onClick={()=>{if(ref.current)ref.current.currentTime=Math.min(dur,ref.current.currentTime+15)}} style={{width:36,height:36,borderRadius:'50%',border:'none',background:'rgba(255,255,255,0.12)',color:'#fff',cursor:'pointer',fontSize:13,display:'flex',alignItems:'center',justifyContent:'center'}}>⏩15s</button>
              </div>

              {/* Volume */}
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
                <span style={{fontSize:14}}>🔊</span>
                <input type="range" min={0} max={1} step={0.1} value={vol} onChange={e=>{setVol(+e.target.value);if(ref.current)ref.current.volume=+e.target.value}} style={{flex:1}}/>
              </div>

              <div style={{display:'flex',justifyContent:'center',gap:10}}>
                <a href={result.audioUrl} download className="btn" style={{background:'rgba(255,255,255,0.12)',border:'none',color:'#fff',fontSize:12,borderRadius:20,padding:'6px 16px',textDecoration:'none'}}>⬇️ Download Audio</a>
              </div>
              {result.note&&<div style={{marginTop:12,background:'rgba(255,255,255,0.08)',borderRadius:8,padding:'10px 13px',fontSize:11,lineHeight:1.7,color:'rgba(255,255,255,0.8)',whiteSpace:'pre-line'}}>{result.note}</div>}
            </div>
            <audio ref={ref} src={result.audioUrl} onTimeUpdate={()=>setProg(ref.current?.currentTime||0)} onLoadedMetadata={()=>setDur(ref.current?.duration||0)} onEnded={()=>setPlaying(false)} onError={()=>{setPlaying(false)}}/>
            <div className="card">
              <div className="ch">
                <div className="ct">📄 Lecture Script (~{result.duration||8} min)</div>
                <button className="btn btn-s btn-sm" onClick={()=>{navigator.clipboard?.writeText(result.script);toast.success('Copied!')}}>📋 Copy</button>
              </div>
              <div className="cb"><div className="ob" style={{maxHeight:320,lineHeight:1.9}}>{result.script}</div></div>
            </div>
          </div>
        ):(
          <div className="card"><div className="cb" style={{textAlign:'center',padding:'44px 24px'}}>
            <div style={{fontSize:44,marginBottom:12}}>🎙️</div>
            <div style={{fontFamily:'Sora,sans-serif',fontSize:16,fontWeight:700,marginBottom:8}}>Audio Lecture Generator</div>
            <div style={{fontSize:13,color:'var(--ink3)',lineHeight:1.7}}>Converts your PDF into a complete spoken lecture<br/>script with MP3 audio (if TTS API configured).</div>
            <div className="ib b" style={{marginTop:16,textAlign:'left',fontSize:12}}>
              <strong>FREE Audio Setup:</strong><br/>
              Add to backend/.env:<br/>
              GOOGLE_TTS_API_KEY=your_key (console.cloud.google.com)<br/>
              or ELEVENLABS_API_KEY=your_key (elevenlabs.io)
            </div>
          </div></div>
        )}
      </div>

      <div className="card">
        <div className="ch"><div className="ct">⚙️ Configure Lecture</div></div>
        <div className="cb">
          <div className="fg"><label className="fl">Document *</label>
            <select className="fi" value={docId} onChange={e=>setDocId(e.target.value)}>
              <option value="">— Select PDF —</option>
              {docs.map(d=><option key={d._id} value={d._id}>{d.title} ({d.wordCount?.toLocaleString()}w)</option>)}
            </select>
          </div>
          {doc?.sections?.length>1&&(
            <div className="fg"><label className="fl">Section</label>
              <select className="fi" value={sec} onChange={e=>setSec(e.target.value)}>
                <option value="">Full document</option>
                {doc.sections.map((s,i)=><option key={i} value={i}>{s.title?.slice(0,50)}</option>)}
              </select>
            </div>
          )}
          <div className="fg"><label className="fl">Language</label>
            <select className="fi" value={lang} onChange={e=>setLang(e.target.value)}>
              {['English','Hindi','Marathi','Bengali','Tamil','Telugu','Gujarati'].map(l=><option key={l}>{l}</option>)}
            </select>
          </div>
          <div className="fg"><label className="fl">Voice</label>
            <select className="fi" value={voice} onChange={e=>setVoice(e.target.value)}>
              <option value="male">👨 Indian Male</option><option value="female">👩 Indian Female</option>
            </select>
          </div>
          <button className="btn btn-p wf" onClick={generate} disabled={loading||!docId}>
            {loading?'⏳ Generating lecture...':' 🎙️ Generate Audio Lecture'}
          </button>
          {loading&&<div className="dots" style={{marginTop:8}}><div className="dot"/><div className="dot"/><div className="dot"/><span style={{fontSize:12.5,color:'var(--ink3)'}}>Generating script + audio...</span></div>}
          {docs.length===0&&<div className="ib a" style={{marginTop:10,fontSize:12}}>⚠️ <button className="btn btn-g btn-sm" onClick={()=>navigate('/upload')}>Upload PDF first</button></div>}
        </div>
      </div>
    </div>
  )
}