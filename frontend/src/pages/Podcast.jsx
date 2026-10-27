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
  const ref=useRef()
  const navigate=useNavigate()

  useEffect(()=>{api.get('/documents?status=ready').then(r=>setDocs(r.data.documents||[])).catch(()=>{})},[])
  useEffect(()=>{if(docId)api.get(`/documents/${docId}`).then(r=>setDoc(r.data.document)).catch(()=>{})},[docId])

  const generate=async()=>{
    if(!docId){toast.error('Select a document');return}
    setLoading(true)
    try{
      const res=await api.post('/generate/podcast',{
        documentId:docId,
        sectionIndex:sec!==''?parseInt(sec):undefined,
        language:lang,
        outputLanguage:lang,
        voiceStyle:voice
      })
      setResult(res.data)
      if(res.data.provider&&res.data.provider!=='placeholder'){
        toast.success(`🎙️ Audio generated using ${res.data.provider}!`)
      } else {
        toast('📄 Script generated! Add Google TTS key for real audio.',{icon:'ℹ️'})
      }
    }catch(err){toast.error(err.response?.data?.error||'Generation failed')}
    finally{setLoading(false)}
  }

  const togglePlay=()=>{
    if(!ref.current)return
    if(playing){ref.current.pause();setPlaying(false)}else{ref.current.play().then(()=>setPlaying(true)).catch(()=>{})}
  }

  const bars=Array.from({length:40},(_,i)=>8+Math.abs(Math.sin(i*.6))*26)
  const fmt=s=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`

  return(
    <div className="tc" style={{alignItems:'start'}}>
      <div>
        {/* Player / Script area */}
        {result ? (
          <div>
            <div className="pp" style={{marginBottom:16}}>
              <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:6}}>
                <div style={{width:48,height:48,borderRadius:12,background:'rgba(255,255,255,0.1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22}}>🎙️</div>
                <div>
                  <div style={{fontWeight:700,fontSize:15}}>{doc?.title?.slice(0,40)}</div>
                  <div style={{fontSize:11.5,opacity:.6,marginTop:2}}>
                    {result.provider&&result.provider!=='placeholder' ? `✅ Real Audio · ${result.provider}` : '📄 Script only (add TTS API for audio)'}
                    {result.duration ? ` · ~${result.duration} min` : ''}
                  </div>
                </div>
              </div>

              {/* Waveform */}
              <div style={{display:'flex',alignItems:'center',gap:1.5,height:44,margin:'14px 0',justifyContent:'center'}}>
                {bars.map((h,i)=>(
                  <div key={i} className={`wb${playing?' pl':''}`} style={{height:h,animationDelay:`${i*.04}s`}}/>
                ))}
              </div>

              {/* Progress bar */}
              <div style={{display:'flex',justifyContent:'space-between',fontSize:11,opacity:.5,marginBottom:5}}>
                <span>{fmt(prog)}</span>
                <span>{fmt(dur||(result.duration*60)||0)}</span>
              </div>
              <div style={{height:4,background:'rgba(255,255,255,0.15)',borderRadius:2,marginBottom:14,cursor:'pointer'}}
                onClick={e=>{if(!ref.current||!dur)return;const r=e.currentTarget.getBoundingClientRect();ref.current.currentTime=(e.clientX-r.left)/r.width*dur}}>
                <div style={{width:`${dur?prog/dur*100:0}%`,height:'100%',background:'var(--brand3)',borderRadius:2,transition:'width .3s'}}/>
              </div>

              {/* Controls */}
              <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:14}}>
                <button onClick={()=>{if(ref.current){ref.current.currentTime=Math.max(0,ref.current.currentTime-10)}}} style={{width:36,height:36,borderRadius:'50%',border:'none',cursor:'pointer',background:'rgba(255,255,255,0.1)',color:'#fff',fontSize:13,display:'flex',alignItems:'center',justifyContent:'center'}}>⏪</button>
                <button onClick={togglePlay} style={{width:52,height:52,borderRadius:'50%',border:'none',cursor:'pointer',background:'var(--brand)',color:'#fff',fontSize:18,display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 4px 12px rgba(79,70,229,.4)'}}>
                  {playing?'⏸':'▶'}
                </button>
                <button onClick={()=>{if(ref.current){ref.current.currentTime=Math.min(dur,ref.current.currentTime+10)}}} style={{width:36,height:36,borderRadius:'50%',border:'none',cursor:'pointer',background:'rgba(255,255,255,0.1)',color:'#fff',fontSize:13,display:'flex',alignItems:'center',justifyContent:'center'}}>⏩</button>
              </div>

              {/* Download */}
              <div style={{display:'flex',justifyContent:'center',gap:10,marginTop:14}}>
                <a href={result.audioUrl} download className="btn" style={{background:'rgba(255,255,255,0.1)',border:'none',color:'#fff',fontSize:12,borderRadius:20,padding:'6px 16px',textDecoration:'none'}}>⬇️ Download Audio</a>
              </div>
            </div>

            {/* Hidden audio element */}
            <audio ref={ref} src={result.audioUrl}
              onTimeUpdate={()=>setProg(ref.current?.currentTime||0)}
              onLoadedMetadata={()=>setDur(ref.current?.duration||0)}
              onEnded={()=>setPlaying(false)}
              onError={()=>setPlaying(false)}
            />

            {/* Script display */}
            <div className="card">
              <div className="ch">
                <div className="ct">📄 Lecture Script</div>
                <button className="btn btn-s btn-sm" onClick={()=>{navigator.clipboard?.writeText(result.script);toast.success('Copied!')}}>📋 Copy</button>
              </div>
              <div className="cb">
                <div className="ob" style={{maxHeight:350,fontSize:13.5,lineHeight:1.9}}>{result.script}</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="card" style={{marginBottom:16}}>
            <div className="cb" style={{textAlign:'center',padding:'44px 24px'}}>
              <div style={{fontSize:44,marginBottom:12}}>🎙️</div>
              <div style={{fontFamily:'Sora,sans-serif',fontSize:16,fontWeight:700,marginBottom:8}}>Audio Lecture Generator</div>
              <div style={{fontSize:13,color:'var(--ink3)',lineHeight:1.7}}>
                Converts your PDF into a spoken lecture script.
                <br/>Generates real MP3 audio if TTS API keys are configured.
              </div>

            </div>
          </div>
        )}
      </div>

      {/* Config panel */}
      <div className="card">
        <div className="ch"><div className="ct">🎙️ Generate Audio Lecture</div></div>
        <div className="cb">
          <div className="fg"><label className="fl">Document *</label>
            <select className="fi" value={docId} onChange={e=>setDocId(e.target.value)}>
              <option value="">— Select PDF —</option>
              {docs.map(d=><option key={d._id} value={d._id}>{d.title} ({d.wordCount?.toLocaleString()} words)</option>)}
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
          <div className="fg"><label className="fl">Language / Output Language</label>
            <select className="fi" value={lang} onChange={e=>setLang(e.target.value)}>
              {['Original Language','English','Hindi','Marathi','Gujarati','Bengali','Tamil','Telugu','Kannada','Urdu','Arabic','Spanish','French','German','Chinese (Simplified)','Japanese','Korean','Russian'].map(l=><option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div className="fg"><label className="fl">Voice</label>
            <select className="fi" value={voice} onChange={e=>setVoice(e.target.value)}>
              <option value="male">👨 Indian English — Male (Prabhat)</option>
              <option value="female">👩 Indian English — Female (Neerja)</option>
            </select>
          </div>
          <button className="btn btn-p wf" onClick={generate} disabled={loading||!docId}>
            {loading?'⏳ Generating...':'🎙️ Generate Audio Lecture'}
          </button>
          {loading&&<div className="dots"><div className="dot"/><div className="dot"/><div className="dot"/><span style={{fontSize:12.5,color:'var(--ink3)'}}>Generating script + audio...</span></div>}
          {docs.length===0&&<div className="ib a" style={{marginTop:10,fontSize:12}}>⚠️ <button className="btn btn-g btn-sm" onClick={()=>navigate('/upload')}>Upload PDF first</button></div>}
        </div>
      </div>
    </div>
  )
}