import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../utils/api'

const TOOLS = [
  { id:'notes',       icon:'📝', label:'Study Notes',      desc:'Full notes from PDF' },
  { id:'summary',     icon:'📋', label:'Summary',           desc:'Concise 300-word overview' },
  { id:'questions',   icon:'❓', label:'Practice Q&A',      desc:'MCQ + short + long answer' },
  { id:'paper',       icon:'📄', label:'Question Paper',    desc:'20M/60M university format' },
  { id:'handwritten', icon:'✍️', label:'Handwritten Notes', desc:'4 paper styles downloadable' },
  { id:'ppt',         icon:'📊', label:'Slide Deck',        desc:'12-slide presentation PDF' },
  { id:'video',       icon:'🎬', label:'Video Lecture',     desc:'20-min script + slides + audio' },
  { id:'mindmap',     icon:'🗺️', label:'Mind Map',          desc:'Visual topic structure' },
  { id:'vocabulary',  icon:'🔤', label:'Vocabulary',        desc:'Key terms + Hindi meanings' },
  { id:'lesson-plan', icon:'📅', label:'Lesson Plan',       desc:'Weekly plan for teachers' },
  { id:'paper-20',  icon:'📄', label:'20-Mark Paper',     desc:'University 20M with CO+BT' },
  { id:'paper-60',  icon:'📜', label:'60-Mark Paper',     desc:'University 60M Q1+any 3' },
  { id:'assignment',  icon:'📝', label:'Assignment',         desc:'Student assignment PDF' },
]

const LANGS = [
  'English','Hindi','Marathi','Bengali','Tamil','Telugu','Gujarati',
  'Kannada','Punjabi','French','Spanish','German','Japanese','Arabic',
  'Portuguese','Russian','Chinese','Korean','Italian','Turkish'
]
const FLAG = {
  English:'🇬🇧',Hindi:'🇮🇳',Marathi:'🟠',Bengali:'🟡',Tamil:'🔴',
  Telugu:'🔵',Gujarati:'🟢',Kannada:'🟤',Punjabi:'🟣',French:'🇫🇷',
  Spanish:'🇪🇸',German:'🇩🇪',Japanese:'🇯🇵',Arabic:'🇸🇦',Portuguese:'🇵🇹',
  Russian:'🇷🇺',Chinese:'🇨🇳',Korean:'🇰🇷',Italian:'🇮🇹',Turkish:'🇹🇷'
}

const EP = {
  notes:'/generate/notes',summary:'/generate/summary',questions:'/generate/questions',
  paper:'/generate/paper',handwritten:'/generate/handwritten',ppt:'/generate/ppt',
  video:'/generate/video',mindmap:'/generate/mindmap',vocabulary:'/generate/vocabulary'
}

export default function Notebook() {
  const [sp] = useSearchParams()
  const navigate = useNavigate()
  const [docs, setDocs] = useState([])
  const [docId, setDocId] = useState(sp.get('docId')||'')
  const [doc, setDoc] = useState(null)
  const [section, setSection] = useState('')
  const [tool, setTool] = useState('notes')
  const [lang, setLang] = useState('English')
  const [examType, setExamType] = useState('60_MARKS')
  const [institution, setInstitution] = useState('')
  const [sets, setSets] = useState(3)
  const [count, setCount] = useState(10)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [activeSet, setActiveSet] = useState(0)
  const [showAllLangs, setShowAllLangs] = useState(false)

  useEffect(() => { api.get('/documents?status=ready').then(r=>setDocs(r.data.documents||[])).catch(()=>{}) },[])
  useEffect(() => {
    if(docId) api.get(`/documents/${docId}`).then(r=>setDoc(r.data.document)).catch(()=>setDoc(null))
    else setDoc(null)
  },[docId])

  const generate = async () => {
    if (!docId) { toast.error('Select a document first'); return }
    setLoading(true); setResult(null)
    try {
      const payload = { documentId:docId, language:lang }
      if (section!=='') payload.sectionIndex=parseInt(section)
      if (tool==='paper') { payload.examType=examType; payload.institution=institution||'University'; payload.sets=sets }
      if (tool==='flashcards') payload.count=count
      const res = await api.post(EP[tool], payload)
      setResult({ tool, data:res.data })
      setActiveSet(0)
      toast.success(res.data.message || `✅ ${TOOLS.find(t=>t.id===tool)?.label} ready!`)
    } catch(err) { toast.error(err.response?.data?.error||'Generation failed') }
    finally { setLoading(false) }
  }

  const renderResult = () => {
    if (!result) return null
    const { tool:t, data } = result

    // QUESTION PAPER SETS
    if (t==='paper' && data.sets) return (
      <div>
        <div className="ib g" style={{marginBottom:14}}>{data.message}</div>
        <div className="tbr">
          {data.sets.map((s,i)=><div key={i} className={`tab${activeSet===i?' on':''}`} onClick={()=>setActiveSet(i)}>Set {s.setNumber} ({s.examType.replace('_',' ')})</div>)}
        </div>
        <div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap'}}>
          {data.pdfFiles?.map((f,i)=>(
            <a key={i} href={f.downloadUrl} download className="btn btn-p btn-sm" style={{textDecoration:'none'}}>⬇️ Set {f.setNumber} PDF</a>
          ))}
        </div>
        {data.sets[activeSet] && <div className="ob" style={{fontFamily:'JetBrains Mono,monospace',fontSize:12.5}}>{data.sets[activeSet].content}</div>}
      </div>
    )

    // HANDWRITTEN — 4 styles
    if (t==='handwritten' && data.styles) return (
      <div>
        <div style={{fontFamily:'Sora,sans-serif',fontWeight:700,fontSize:13,marginBottom:12}}>✍️ Choose your handwritten notes style:</div>
        <div className="g2" style={{gap:12,marginBottom:16}}>
          {data.styles.map((s,i)=>(
            <div key={i} style={{border:'1px solid var(--bdr)',borderRadius:12,overflow:'hidden',transition:'all .2s'}}
              onMouseOver={e=>e.currentTarget.style.borderColor='var(--brand)'}
              onMouseOut={e=>e.currentTarget.style.borderColor='var(--bdr)'}>
              <div style={{padding:14,background:{yellow:'#FEFDE8',white:'#fff',cream:'#FEF8EC',blue:'#EFF6FF'}[s.style]||'#fff',fontFamily:'Georgia,serif',fontSize:14,lineHeight:1.8,maxHeight:110,overflow:'hidden',color:'#1a1a2e'}}>
                {data.content?.split('\n').slice(0,4).join('\n')}
              </div>
              <div style={{padding:'10px 14px',borderTop:'1px solid var(--bdr)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <span style={{fontSize:12.5,fontWeight:600}}>{s.label}</span>
                <a href={s.downloadUrl} download className="btn btn-p btn-sm" style={{textDecoration:'none'}}>⬇️ Download</a>
              </div>
            </div>
          ))}
        </div>
        {data.content && <div style={{marginTop:10}}><div style={{fontSize:12,fontWeight:600,color:'var(--ink3)',marginBottom:6}}>Preview (content inside all styles):</div><div className="ob" style={{maxHeight:200}}>{data.content}</div></div>}
      </div>
    )

    // MIND MAP
    if (t==='mindmap' && data.mindmapData) {
      const mm = data.mindmapData
      return (
        <div>
          <div style={{textAlign:'center',marginBottom:18}}>
            <span style={{background:'var(--brand)',color:'#fff',padding:'10px 24px',borderRadius:20,fontFamily:'Sora,sans-serif',fontWeight:700,fontSize:14}}>{mm.central}</span>
          </div>
          <div className="g2">
            {mm.branches?.map((b,i)=>(
              <div key={i} style={{background:'var(--card)',border:`2px solid ${b.color||'var(--brand)'}`,borderRadius:11,padding:14}}>
                <div style={{fontSize:13,fontWeight:700,color:b.color||'var(--brand)',marginBottom:9}}>● {b.topic}</div>
                {b.subtopics?.map((s,j)=><div key={j} style={{fontSize:12.5,color:'var(--ink2)',paddingLeft:12,borderLeft:`2px solid ${b.color||'var(--bdr2)'}`,marginBottom:5}}>→ {s}</div>)}
              </div>
            ))}
          </div>
        </div>
      )
    }

    // VOCABULARY
    if (t==='vocabulary') {
      const vocab = data.vocabulary||[]
      return (
        <div>
          {vocab.map((v,i)=>(
            <div key={i} style={{borderBottom:'1px solid var(--bdr)',paddingBottom:12,marginBottom:12}}>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4,flexWrap:'wrap'}}>
                <span style={{fontWeight:700,fontSize:14}}>{v.word}</span>
                {v.hindi&&v.hindi!=='—'&&<span style={{background:'#EDE9FE',color:'#5B21B6',fontSize:12,padding:'2px 9px',borderRadius:20,fontWeight:600}}>{v.hindi}</span>}
                {v.formula&&<span style={{background:'#FEF9C3',color:'#854D0E',fontSize:11,padding:'2px 9px',borderRadius:20,fontFamily:'monospace'}}>{v.formula}</span>}
              </div>
              <div style={{fontSize:13,color:'var(--ink2)',lineHeight:1.65}}>{v.definition}</div>
              {v.example&&<div style={{fontSize:12,color:'var(--brand)',marginTop:4,fontStyle:'italic'}}>💡 {v.example}</div>}
            </div>
          ))}
        </div>
      )
    }

    // PPT
    if (t==='ppt' && data.pptData?.slides) return (
      <div>
        {data.downloadUrl&&<a href={data.downloadUrl} download className="btn btn-p btn-sm" style={{textDecoration:'none',marginBottom:14,display:'inline-flex'}}>⬇️ Download Slides PDF</a>}
        {data.pptData.slides.map((s,i)=>(
          <div key={i} style={{background:'var(--card)',border:'1px solid var(--bdr)',borderRadius:11,padding:14,marginBottom:10}}>
            <span style={{background:'var(--brand)',color:'#fff',fontSize:11,fontWeight:700,padding:'2px 9px',borderRadius:20}}>SLIDE {s.slideNumber}</span>
            <div style={{fontFamily:'Sora,sans-serif',fontSize:14,fontWeight:700,margin:'8px 0'}}>{s.title}</div>
            {s.bullets?.map((b,j)=><div key={j} style={{fontSize:12.5,color:'var(--ink2)',paddingLeft:14,borderLeft:'2px solid var(--brand)',marginBottom:5}}>{b}</div>)}
            {s.speakerNotes&&<div style={{fontSize:12,color:'var(--ink3)',marginTop:8,fontStyle:'italic'}}>{s.speakerNotes}</div>}
          </div>
        ))}
      </div>
    )

    // VIDEO
    if (t==='video') return (
      <div>
        <div className="ib g" style={{marginBottom:12}}>{data.message}</div>
        <div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap'}}>
          {data.slidesUrl&&<a href={data.slidesUrl} download className="btn btn-p btn-sm" style={{textDecoration:'none'}}>⬇️ Slides PDF</a>}
          {data.audioUrl&&<a href={data.audioUrl} download className="btn btn-s btn-sm" style={{textDecoration:'none'}}>⬇️ Narration Audio ({data.audioDuration} min)</a>}
        </div>
        {data.audioNote&&<div className="ib a" style={{marginBottom:12,fontSize:12,whiteSpace:'pre-line'}}>🎙️ {data.audioNote}</div>}
        {data.audioUrl&&data.audioProvider!=='placeholder'&&(
          <audio controls style={{width:'100%',marginBottom:12}} src={data.audioUrl}/>
        )}
        <div style={{fontFamily:'Sora,sans-serif',fontSize:13,fontWeight:700,marginBottom:8}}>📜 20-Minute Lecture Script:</div>
        <div className="ob">{data.script}</div>
      </div>
    )

    // DEFAULT TEXT
    const text = data.content||''
    return (
      <div>
        {(data.downloadUrl||text)&&(
          <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap'}}>
            {data.downloadUrl&&<a href={data.downloadUrl} download className="btn btn-p btn-sm" style={{textDecoration:'none'}}>⬇️ Download PDF</a>}
            {text&&<button className="btn btn-s btn-sm" onClick={()=>{navigator.clipboard?.writeText(text);toast.success('Copied!')}}>📋 Copy</button>}
          </div>
        )}
        {text?<div className="ob">{text}</div>:<div className="ib a">No content returned.</div>}
      </div>
    )
  }

  const visibleLangs = showAllLangs ? LANGS : LANGS.slice(0,7)

  return (
    <div className="tc" style={{alignItems:'start'}}>
      <div>
        {/* Doc selector */}
        <div className="card" style={{marginBottom:14}}>
          <div className="ch"><div className="ct">📄 1. Select Your PDF / Image</div></div>
          <div className="cb">
            {docs.length===0 ? (
              <div style={{textAlign:'center',padding:'20px 0'}}>
                <div style={{fontSize:30,marginBottom:10}}>📂</div>
                <div style={{fontSize:13,color:'var(--ink3)',marginBottom:12}}>No uploaded files yet</div>
                <button className="btn btn-p btn-sm" onClick={()=>navigate('/upload')}>📤 Upload First</button>
              </div>
            ) : (
              <select className="fi" value={docId} onChange={e=>setDocId(e.target.value)}>
                <option value="">— Select document —</option>
                {docs.map(d=><option key={d._id} value={d._id}>{d.fileType==='image'?'🖼️':'📄'} {d.title} ({d.wordCount?.toLocaleString()} words)</option>)}
              </select>
            )}
            {doc&&<div className="ib g" style={{marginTop:10,fontSize:12}}>✅ <strong>{doc.title}</strong> — {doc.wordCount?.toLocaleString()} words · {doc.fileType==='image'?'Image (AI-analysed)':doc.pageCount+' pages'}</div>}
            {doc?.sections?.length>1&&(
              <div className="fg" style={{marginTop:12}}>
                <label className="fl">Section (optional)</label>
                <select className="fi" value={section} onChange={e=>setSection(e.target.value)}>
                  <option value="">Full document</option>
                  {doc.sections.map((s,i)=><option key={i} value={i}>{s.title?.slice(0,60)} ({s.wordCount}w)</option>)}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Tool selector */}
        <div className="card" style={{marginBottom:14}}>
          <div className="ch"><div className="ct">🛠️ 2. Choose Output</div></div>
          <div className="cb">
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
              {TOOLS.map(t=>(
                <div key={t.id} className={`to${tool===t.id?' on':''}`} onClick={()=>setTool(t.id)} style={{flexDirection:'column',alignItems:'flex-start',gap:4,padding:'10px 11px'}}>
                  <span style={{fontSize:16}}>{t.icon}</span>
                  <span style={{fontSize:12,fontWeight:700}}>{t.label}</span>
                  <span style={{fontSize:10.5,color:'var(--ink3)',fontWeight:400}}>{t.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Language */}
        <div className="card" style={{marginBottom:14}}>
          <div className="ch"><div className="ct">🌐 3. Language (25+ languages)</div></div>
          <div className="cb">
            <div style={{display:'flex',gap:7,flexWrap:'wrap',marginBottom:8}}>
              {visibleLangs.map(l=><div key={l} className={`lp${lang===l?' on':''}`} onClick={()=>setLang(l)}>{FLAG[l]||'🌐'} {l}</div>)}
            </div>
            <button className="btn btn-g btn-sm" onClick={()=>setShowAllLangs(p=>!p)}>
              {showAllLangs?'▲ Show less':'▼ Show all 20 languages'}
            </button>
            {lang!=='English'&&<div className="ib b" style={{marginTop:10,fontSize:12}}>🌐 Output in {lang} using free translation API</div>}
          </div>
        </div>

        {/* Paper settings */}
        {tool==='paper'&&(
          <div className="card" style={{marginBottom:14}}>
            <div className="ch"><div className="ct">📄 University Paper Settings</div></div>
            <div className="cb">
              <div className="fg">
                <label className="fl">Exam Type</label>
                <div style={{display:'flex',gap:10}}>
                  {['20_MARKS','60_MARKS'].map(et=>(
                    <div key={et} onClick={()=>setExamType(et)} style={{flex:1,border:`2px solid ${examType===et?'var(--brand)':'var(--bdr2)'}`,borderRadius:10,padding:'12px 16px',cursor:'pointer',background:examType===et?'rgba(79,70,229,.06)':'transparent',textAlign:'center',transition:'.15s'}}>
                      <div style={{fontWeight:700,fontSize:14,color:examType===et?'var(--brand)':'var(--ink2)'}}>{et==='20_MARKS'?'20 Marks':'60 Marks'}</div>
                      <div style={{fontSize:11.5,color:'var(--ink3)',marginTop:3}}>{et==='20_MARKS'?'1 Hour · 3 Sections':'2 Hours · Q1+any 3'}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="fg"><label className="fl">Sets: {sets}</label>
                <input type="range" min={1} max={5} value={sets} onChange={e=>setSets(+e.target.value)} style={{width:'100%'}}/>
                <div style={{fontSize:11,color:'var(--ink3)',marginTop:3}}>{sets} complete sets, each with different questions</div>
              </div>
              <div className="fg"><label className="fl">Institution</label>
                <input className="fi" placeholder="University / College name" value={institution} onChange={e=>setInstitution(e.target.value)}/>
              </div>
            </div>
          </div>
        )}

        {/* Generate */}
        <div className="card">
          <div className="cb">
            <button className="btn btn-p btn-lg wf" onClick={generate} disabled={loading||!docId}>
              {loading?'🤖 Generating...':` 🤖 Generate ${TOOLS.find(t=>t.id===tool)?.label}`}
            </button>
            {loading&&<div className="dots"><div className="dot"/><div className="dot"/><div className="dot"/>
              <span style={{fontSize:12.5,color:'var(--ink3)'}}>{tool==='video'?'Creating 20-min lecture...':tool==='paper'?`Generating ${sets} paper sets...`:'Analysing your PDF...'}</span>
            </div>}
          </div>
        </div>
      </div>

      {/* Result panel */}
      <div>
        {result?(
          <div className="card">
            <div className="ch">
              <div className="ct">✨ {TOOLS.find(t=>t.id===result.tool)?.label}</div>
              <span className="chip">{FLAG[lang]||'🌐'} {lang}</span>
            </div>
            <div className="cb">{renderResult()}</div>
          </div>
        ):(
          <div className="card">
            <div className="cb" style={{textAlign:'center',padding:'56px 24px'}}>
              <div style={{fontSize:52,marginBottom:16}}>📓</div>
              <div style={{fontFamily:'Sora,sans-serif',fontSize:18,fontWeight:700,marginBottom:10}}>AI Notebook</div>
              <div style={{fontSize:13,color:'var(--ink3)',lineHeight:1.8,maxWidth:280,margin:'0 auto'}}>
                Select PDF → choose tool → generate.<br/><br/>
                All from <strong>your document</strong>.<br/>
                25+ languages · 4 handwritten styles · University Q-papers
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}