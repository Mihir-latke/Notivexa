import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../utils/api'
import toast from 'react-hot-toast'

const F30=[
  {id:1, i:'🔗',n:'Multi-PDF Fusion',        cat:'Core',     tip:'Combine 2+ PDFs into one',   action:'fuse'},
  {id:2, i:'📋',n:'Context Summary',          cat:'Core',     tip:'300-word smart summary',      action:'api',ep:'/generate/summary'},
  {id:3, i:'✍️',n:'Handwritten Notes',        cat:'Output',   tip:'4 paper styles to download',  action:'api',ep:'/generate/handwritten'},
  {id:4, i:'🖼️',n:'Image OCR',               cat:'AI',       tip:'Upload image to analyse',     action:'nav',path:'/upload'},
  {id:5, i:'🕸️',n:'AI Concept Linking',      cat:'AI',       tip:'Ask in AI Tutor',             action:'nav',path:'/chatbot'},
  {id:6, i:'❓',n:'Practice Questions',       cat:'Assess',   tip:'MCQ + short + long answer',   action:'api',ep:'/generate/questions'},
  {id:7, i:'🎯',n:"Bloom Taxonomy",           cat:'Assess',   tip:'BT1-BT5 mapped paper',        action:'api',ep:'/generate/paper',extra:{examType:'60_MARKS',sets:1}},
  {id:8, i:'📊',n:'CO Mapping',               cat:'Assess',   tip:'CO1-CO5 mapped paper',        action:'api',ep:'/generate/paper',extra:{examType:'20_MARKS',sets:1}},
  {id:9, i:'🔮',n:'Exam Prediction',          cat:'Planning', tip:'Important questions',         action:'api',ep:'/generate/important-questions'},
  {id:10,i:'🔄',n:'Smart Revision',           cat:'Learning', tip:'Spaced repetition cards',     action:'api',ep:'/generate/flashcards',extra:{count:10}},
  {id:11,i:'📈',n:'Performance Dashboard',    cat:'Analytics',tip:'View your scores',            action:'nav',path:'/performance'},
  {id:12,i:'🗺️',n:'Mind Map',                 cat:'Visual',   tip:'Visual concept map',          action:'api',ep:'/generate/mindmap'},
  {id:13,i:'🃏',n:'Interactive Flashcards',   cat:'Learning', tip:'Study with 3D flip cards',    action:'nav',path:'/flashcards'},
  {id:14,i:'🖊️',n:'Styled Notes',            cat:'Output',   tip:'Choose paper style',          action:'api',ep:'/generate/handwritten'},
  {id:15,i:'🎙️',n:'Podcast / Audio Lecture',  cat:'Audio',    tip:'Indian English MP3',          action:'nav',path:'/podcast'},
  {id:16,i:'🎬',n:'Video Lecture 20min',      cat:'Video',    tip:'Script + slides + audio',     action:'api',ep:'/generate/video'},
  {id:17,i:'🇮🇳',n:'Indian Accent TTS',       cat:'Audio',    tip:'Neural2 voice audio',         action:'nav',path:'/podcast'},
  {id:18,i:'📝',n:'Study Notes',              cat:'Core',     tip:'Full notes from PDF',         action:'api',ep:'/generate/notes'},
  {id:19,i:'🌐',n:'25+ Languages',            cat:'Language', tip:'Hindi, French, German etc',   action:'api',ep:'/generate/notes',extra:{lang:'Hindi'}},
  {id:20,i:'💬',n:'Indian English Meanings',  cat:'Language', tip:'Hindi in brackets',           action:'nav',path:'/chatbot'},
  {id:21,i:'📦',n:'Offline Study Pack',       cat:'Downloads',tip:'All downloads in library',    action:'nav',path:'/library'},
  {id:22,i:'📅',n:'Lesson Plan',              cat:'Teacher',  tip:'Multi-week teaching plan',    action:'api',ep:'/generate/lesson-plan'},
  {id:23,i:'📋',n:'Assignment Generator',     cat:'Teacher',  tip:'Student assignment PDF',      action:'api',ep:'/generate/assignment'},
  {id:24,i:'✅',n:'Content Validation',       cat:'Quality',  tip:'Output from PDF only',        action:'api',ep:'/generate/summary'},
  {id:25,i:'🗄️',n:'Smart Library',            cat:'Manage',   tip:'All docs and outputs',        action:'nav',path:'/library'},
  {id:26,i:'🤖',n:'AI Tutor Chat',            cat:'AI',       tip:'200-word detailed answers',   action:'nav',path:'/chatbot'},
  {id:27,i:'📚',n:'E-Books and YouTube',      cat:'Resources',tip:'Free MCA JEE NEET books',     action:'nav',path:'/ebooks'},
  {id:28,i:'📄',n:'University Q-Paper',       cat:'Assess',   tip:'20M/60M CO and BL format',    action:'api',ep:'/generate/paper',extra:{examType:'60_MARKS',sets:1}},
  {id:29,i:'📊',n:'Slide Deck',               cat:'Output',   tip:'12-slide presentation PDF',   action:'api',ep:'/generate/ppt'},
  {id:30,i:'🔤',n:'Vocabulary Glossary',      cat:'Language', tip:'Key terms with Hindi',        action:'api',ep:'/generate/vocabulary'},
]

const CC={Core:'#EDE9FE',Output:'#DCFCE7',AI:'#DBEAFE',Assess:'#FEF9C3',Learning:'#F0FDF4',Analytics:'#FFF7ED',Visual:'#F5F3FF',Audio:'#FFF1F2',Video:'#FEE2E2',Language:'#E0F2FE',Downloads:'#F0FDF4',Teacher:'#FFFBEB',Quality:'#ECFDF5',Manage:'#F8F7FF',Planning:'#FCE7F3',Resources:'#FDF4FF'}

export default function Dashboard(){
  const{user}=useAuth(),nav=useNavigate()
  const[docs,setDocs]=useState([]),[docId,setDocId]=useState(''),[lang,setLang]=useState('English')
  const[setup,setSetup]=useState(null),[activeId,setActiveId]=useState(null)
  const[result,setResult]=useState(null),[loading,setLoading]=useState(false)
  const[filter,setFilter]=useState('All'),[fuseSel,setFuseSel]=useState([])
  const stats=user?.studyStats||{},fn=user?.name?.split(' ')[0]||'Student'

  useEffect(()=>{
    api.get('/setup').then(r=>setSetup(r.data)).catch(()=>{})
    api.get('/documents?status=ready').then(r=>{
      const d=r.data.documents||[];setDocs(d)
      if(d.length>0)setDocId(d[0]._id)
    }).catch(()=>{})
  },[])

  const run=useCallback(async(feat)=>{
    if(feat.action==='nav'){nav(feat.path);return}
    if(feat.action==='fuse'){
      if(fuseSel.length<2){toast('Select 2+ docs in the Fusion box below first',{icon:'ℹ️'});return}
      setActiveId(feat.id);setResult(null);setLoading(true)
      try{
        const r=await api.post('/generate/fuse',{documentIds:fuseSel,language:lang,outputType:'notes'})
        setResult({feat,content:r.data.content,docsUsed:r.data.docsUsed})
        toast.success('Multi-PDF Fusion complete!')
      }catch(e){toast.error(e.response?.data?.error||'Fusion failed')}
      finally{setLoading(false)}
      return
    }
    if(!docId){toast.error('Please select a document first');return}
    setActiveId(feat.id);setResult(null);setLoading(true)
    try{
      const p={documentId:docId,language:feat.extra?.lang||lang}
      if(feat.extra?.examType){p.examType=feat.extra.examType;p.institution='University';p.sets=feat.extra.sets||1;p.className='FYMCA'}
      if(feat.extra?.count)p.count=feat.extra.count
      const r=await api.post(feat.ep,p),d=r.data
      if(d.flashcardSet){nav('/flashcards');toast.success('Flashcards generated!');setLoading(false);return}
      setResult({feat,...d})
      toast.success(d.message||`${feat.n} ready!`)
    }catch(e){toast.error(e.response?.data?.error||`${feat.n} failed`)}
    finally{setLoading(false)}
  },[docId,lang,fuseSel,nav])

  const renderResult=()=>{
    if(!result)return null
    const r=result
    if(r.mindmapData)return(
      <div>
        <div style={{textAlign:'center',marginBottom:12}}><span style={{background:'var(--brand)',color:'#fff',padding:'7px 18px',borderRadius:99,fontWeight:700}}>{r.mindmapData.central}</span></div>
        <div className="g2">{r.mindmapData.branches?.slice(0,4).map((b,i)=><div key={i} style={{border:`1.5px solid ${b.color||'var(--brand)'}`,borderRadius:9,padding:10,background:'var(--card)'}}><div style={{fontWeight:700,fontSize:12,color:b.color||'var(--brand)',marginBottom:6}}>{b.topic}</div>{b.subtopics?.slice(0,3).map((s,j)=><div key={j} style={{fontSize:11,color:'var(--ink2)',paddingLeft:8,borderLeft:`2px solid ${b.color||'var(--bdr2)'}`,marginBottom:3}}>{s}</div>)}</div>)}</div>
      </div>
    )
    if(r.vocabulary)return(
      <div style={{maxHeight:240,overflowY:'auto'}}>
        {r.vocabulary.slice(0,5).map((v,i)=><div key={i} style={{borderBottom:'1px solid var(--bdr)',paddingBottom:6,marginBottom:6}}><div style={{display:'flex',gap:6,marginBottom:2}}><span style={{fontWeight:700,fontSize:12.5}}>{v.word}</span>{v.hindi&&v.hindi!=='—'&&<span style={{background:'#EDE9FE',color:'#5B21B6',fontSize:10,padding:'1px 7px',borderRadius:99}}>{v.hindi}</span>}</div><div style={{fontSize:11.5,color:'var(--ink2)'}}>{v.definition}</div></div>)}
        {r.downloadUrl&&<a href={r.downloadUrl} download className="btn btn-p btn-sm" style={{textDecoration:'none',marginTop:6,display:'inline-flex'}}>Download PDF</a>}
      </div>
    )
    if(r.styles)return(
      <div>
        <div style={{fontSize:11.5,color:'var(--ink3)',marginBottom:8}}>4 handwritten styles ready:</div>
        <div className="g2" style={{gap:10}}>
          {r.styles.map((s,i)=>(
            <div key={i} style={{border:'1px solid var(--bdr)',borderRadius:12,overflow:'hidden',background:'var(--card)'}}>
              <div style={{padding:12,background:{yellow:'#FEFDE8',white:'#fff',cream:'#FEF8EC',blue:'#EFF6FF'}[s.style]||'#fff',fontFamily:'Georgia,serif',fontSize:12.5,lineHeight:1.8,maxHeight:120,overflow:'hidden',color:'#1a1a2e'}}>
                {r.content?.split('\n').slice(0,5).join('\n')}
              </div>
              <div style={{padding:'10px 12px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
                <span style={{fontSize:11.5,fontWeight:700}}>{s.label}</span>
                <a href={s.downloadUrl} download className="btn btn-s btn-sm" style={{textDecoration:'none'}}>⬇️ PDF</a>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
    if(r.likelyQuestions?.length>0)return(
      <div style={{maxHeight:220,overflowY:'auto'}}>
        <div style={{fontSize:11,fontWeight:700,color:'var(--ink3)',marginBottom:6}}>Important Exam Questions:</div>
        {r.likelyQuestions.slice(0,5).map((q,i)=><div key={i} style={{padding:'5px 9px',background:'var(--bg)',borderRadius:7,marginBottom:5,fontSize:11.5}}><span style={{background:q.priority==='high'?'#FEE2E2':'#FEF9C3',color:q.priority==='high'?'#991B1B':'#854D0E',fontSize:9,fontWeight:700,padding:'1px 5px',borderRadius:99,marginRight:5}}>{q.priority}</span>{q.question}</div>)}
      </div>
    )
    if(r.sets?.length>0)return(<div><div style={{display:'flex',gap:7,marginBottom:8,flexWrap:'wrap'}}>{r.pdfFiles?.map((f,i)=><a key={i} href={f.downloadUrl} download className="btn btn-p btn-sm" style={{textDecoration:'none'}}>Set {f.setNumber} PDF</a>)}</div><div className="ob" style={{maxHeight:200,fontSize:11,fontFamily:'monospace'}}>{r.sets[0]?.content?.slice(0,500)}...</div></div>)
    if(r.pptData?.slides)return(<div>{r.downloadUrl&&<a href={r.downloadUrl} download className="btn btn-p btn-sm" style={{textDecoration:'none',marginBottom:8,display:'inline-flex'}}>Slides PDF</a>}{r.pptData.slides.slice(0,2).map((s,i)=><div key={i} style={{background:'var(--bg)',borderRadius:8,padding:'8px 10px',marginBottom:5}}><div style={{fontWeight:700,fontSize:11}}>{s.slideNumber}: {s.title}</div><div style={{fontSize:10.5,color:'var(--ink3)'}}>{s.bullets?.[0]}</div></div>)}</div>)
    if(r.audioUrl)return(<div>{r.audioNote&&<div className="ib a" style={{marginBottom:8,fontSize:10,whiteSpace:'pre-line'}}>{r.audioNote}</div>}{r.slidesUrl&&<a href={r.slidesUrl} download className="btn btn-s btn-sm" style={{textDecoration:'none',marginBottom:7,display:'inline-flex'}}>Slides</a>}<audio controls style={{width:'100%'}} src={r.audioUrl}/></div>)
    if(r.docsUsed)return(<div><div className="ib g" style={{marginBottom:8,fontSize:11}}>Fused: {r.docsUsed?.join(' + ')}</div><div className="ob" style={{maxHeight:200}}>{r.content?.slice(0,600)}</div></div>)
    const text=r.content||r.plan||r.script||''
    return(<div>{r.downloadUrl&&<a href={r.downloadUrl} download className="btn btn-p btn-sm" style={{textDecoration:'none',marginBottom:8,display:'inline-flex'}}>Download PDF</a>}{text&&<div className="ob" style={{maxHeight:240}}>{text.slice(0,1000)}{text.length>1000?'\n\n[full content in PDF]':''}</div>}</div>)
  }

  const cats=['All',...new Set(F30.map(f=>f.cat))]
  const vis=filter==='All'?F30:F30.filter(f=>f.cat===filter)

  return(
    <div>
      <div style={{background:'linear-gradient(135deg,#4F46E5,#7C3AED 60%,#0891B2)',borderRadius:15,padding:'22px 24px',marginBottom:16,color:'#fff',position:'relative',overflow:'hidden'}}>
        <div style={{position:'absolute',right:-20,top:-20,width:180,height:180,borderRadius:'50%',background:'rgba(255,255,255,.04)'}}/>
        <div style={{fontFamily:'DM Serif Display,Georgia,serif',fontSize:20,marginBottom:4}}>Notivexa — 30 AI Features</div>
        <div style={{fontSize:12,opacity:.8,marginBottom:16}}>Upload any PDF → Click any feature below → Instant result from your document</div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <button className="btn" style={{background:'#fff',color:'#4F46E5',fontWeight:700,fontSize:12}} onClick={()=>nav('/upload')}>📤 Upload PDF</button>
          <button className="btn" style={{background:'rgba(255,255,255,.14)',color:'#fff',border:'1px solid rgba(255,255,255,.2)',fontSize:12}} onClick={()=>nav('/notebook')}>📓 AI Notebook</button>
        </div>
      </div>

      {setup&&!setup.hasAI&&<div className="ib a" style={{marginBottom:12,display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,fontSize:11.5}}><span>Add GROQ_API_KEY (free, console.groq.com) for AI output</span><button className="btn btn-p btn-sm" onClick={()=>nav('/settings')}>Setup</button></div>}
      {setup?.hasAI&&<div className="ib g" style={{marginBottom:12,fontSize:11}}>AI: {setup.status?.gemini?'Gemini':setup.status?.groq?'Groq':'Claude'} active · {setup.hasTTS?'TTS active':'No TTS'}</div>}

      <div className="g4" style={{marginBottom:16}}>
        {[{l:'PDFs',v:stats.documentsUploaded||0,i:'📄'},{l:'Notes',v:stats.notesGenerated||0,i:'📝'},{l:'Flashcards',v:stats.flashcardsCreated||0,i:'🃏'},{l:'Questions',v:stats.questionsGenerated||0,i:'❓'}]
          .map((s,i)=><div key={i} className="sc"><div style={{fontSize:18,marginBottom:5}}>{s.i}</div><div className="sv">{s.v}</div><div className="sl">{s.l}</div></div>)}
      </div>

      <div className="card" style={{marginBottom:16}}>
        <div className="ch"><div className="ct">Quick Run</div><span style={{fontSize:11,color:'var(--ink3)'}}>Select document then click any feature</span></div>
        <div className="cb">
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
            <div className="fg" style={{margin:0}}>
              <label className="fl">Document</label>
              <select className="fi" value={docId} onChange={e=>setDocId(e.target.value)}>
                <option value="">Select document</option>
                {docs.map(d=><option key={d._id} value={d._id}>{d.title?.slice(0,35)} ({d.wordCount?.toLocaleString()}w)</option>)}
              </select>
              {docs.length===0&&<div style={{fontSize:10.5,color:'var(--rose)',marginTop:3}}>No PDFs — <span style={{cursor:'pointer',textDecoration:'underline'}} onClick={()=>nav('/upload')}>upload first</span></div>}
            </div>
            <div className="fg" style={{margin:0}}>
              <label className="fl">Language</label>
              <select className="fi" value={lang} onChange={e=>setLang(e.target.value)}>
                {['English','Hindi','Marathi','Bengali','Tamil','Telugu','Gujarati','French','Spanish','German','Japanese','Arabic','Portuguese','Russian'].map(l=><option key={l}>{l}</option>)}
              </select>
            </div>
          </div>
          {docs.length>=2&&(
            <div style={{padding:'8px 11px',background:'var(--bg)',borderRadius:8,border:'1px solid var(--bdr)',marginBottom:10}}>
              <div style={{fontSize:10.5,fontWeight:600,color:'var(--ink3)',marginBottom:6}}>For Multi-PDF Fusion (Feature 1):</div>
              <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                {docs.map(d=>(
                  <label key={d._id} style={{display:'flex',alignItems:'center',gap:4,cursor:'pointer',padding:'3px 8px',borderRadius:99,border:`1px solid ${fuseSel.includes(d._id)?'var(--brand)':'var(--bdr2)'}`,background:fuseSel.includes(d._id)?'rgba(91,79,232,.07)':'transparent',fontSize:11}}>
                    <input type="checkbox" checked={fuseSel.includes(d._id)} onChange={e=>setFuseSel(p=>e.target.checked?[...p,d._id]:p.filter(x=>x!==d._id))} style={{accentColor:'var(--brand)'}}/>
                    {d.title?.slice(0,18)}
                  </label>
                ))}
              </div>
            </div>
          )}
          {loading&&<div className="dots"><div className="dot"/><div className="dot"/><div className="dot"/><span style={{fontSize:11.5,color:'var(--ink3)'}}>Running {F30.find(f=>f.id===activeId)?.n}...</span></div>}
          {result&&!loading&&(
            <div style={{marginTop:10,padding:'11px 13px',background:'var(--bg)',borderRadius:9,border:'1px solid var(--bdr)'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:9}}>
                <span style={{fontWeight:700,fontSize:12.5}}>{result.feat?.i} {result.feat?.n}</span>
                <div style={{display:'flex',gap:5}}><button className="btn btn-s btn-sm" onClick={()=>nav(result.feat?.path||'/notebook')}>Full Page</button><button className="btn btn-g btn-sm" onClick={()=>setResult(null)}>x</button></div>
              </div>
              {renderResult()}
            </div>
          )}
        </div>
      </div>

      <div className="sec"><div className="st">All 30 Features — Click to Run</div></div>
      <div style={{display:'flex',gap:5,flexWrap:'wrap',marginBottom:12}}>
        {cats.map(c=><div key={c} className={`lp${filter===c?' on':''}`} onClick={()=>setFilter(c)} style={{fontSize:10.5,padding:'3px 9px'}}>{c}</div>)}
      </div>
      <div className="g5" style={{marginBottom:18}}>
        {vis.map(feat=>(
          <div key={feat.id} onClick={()=>run(feat)}
            style={{background:activeId===feat.id?'rgba(91,79,232,.07)':'var(--card)',border:`1.5px solid ${activeId===feat.id?'var(--brand)':'var(--bdr)'}`,borderRadius:9,padding:'11px 10px',cursor:'pointer',transition:'all .12s',position:'relative',opacity:loading&&activeId!==feat.id?0.55:1}}
            onMouseOver={e=>{if(!loading){e.currentTarget.style.borderColor='var(--brand)';e.currentTarget.style.boxShadow='0 6px 20px rgba(91,79,232,.15)';e.currentTarget.style.transform='translateY(-2px)'}}}
            onMouseOut={e=>{e.currentTarget.style.borderColor=activeId===feat.id?'var(--brand)':'var(--bdr)';e.currentTarget.style.boxShadow='var(--sh)';e.currentTarget.style.transform='translateY(0)'}}>
            <div style={{position:'absolute',top:5,right:6,background:CC[feat.cat]||'var(--bg2)',fontSize:7.5,fontWeight:700,padding:'1px 5px',borderRadius:99,color:'#374151'}}>{feat.id}</div>
            {loading&&activeId===feat.id&&<div style={{position:'absolute',top:6,left:6,width:11,height:11,border:'2px solid var(--brand)',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 1s linear infinite'}}/>}
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            <div style={{fontSize:19,marginBottom:5}}>{feat.i}</div>
            <div style={{fontSize:11,fontWeight:700,marginBottom:2,lineHeight:1.3}}>{feat.n}</div>
            <div style={{fontSize:9.5,color:'var(--ink3)',lineHeight:1.4}}>{feat.tip}</div>
          </div>
        ))}
      </div>
      <div className="ib b" style={{fontSize:11}}>All 30 VeriNexis features active. Select a document above and click any feature card to run it instantly.</div>
    </div>
  )
}
