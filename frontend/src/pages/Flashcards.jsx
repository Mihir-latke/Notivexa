import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../utils/api'

const DC = { easy:'#DCFCE7', medium:'#FEF9C3', hard:'#FEE2E2' }
const DT = { easy:'#15803D', medium:'#854D0E', hard:'#B91C1C' }

// Demo cards shown when no real flashcards exist
const DEMO_CARDS = [
  { _id:'d1', question:'What is the difference between RAM and ROM?', answer:'RAM (Random Access Memory) is volatile memory used for temporary storage while the computer is running. ROM (Read Only Memory) is non-volatile and retains data even without power — used to store firmware.', difficulty:'medium' },
  { _id:'d2', question:'Define an Operating System.', answer:'An Operating System (OS) is system software that manages computer hardware and software resources, providing common services for computer programs. Examples: Windows, Linux, macOS.', difficulty:'easy' },
  { _id:'d3', question:'What is a deadlock in OS?', answer:'A deadlock occurs when two or more processes are blocked indefinitely, each waiting for a resource held by the other. Conditions: Mutual Exclusion, Hold & Wait, No Preemption, Circular Wait.', difficulty:'hard' },
  { _id:'d4', question:'Explain the concept of Virtual Memory.', answer:'Virtual Memory is a memory management technique that gives an application the impression it has contiguous working memory. It uses hard disk space as an extension of RAM, allowing larger programs to run than physical memory allows.', difficulty:'hard' },
  { _id:'d5', question:'What is a Primary Key in DBMS?', answer:'A Primary Key is a column (or combination of columns) that uniquely identifies each row in a table. It must be unique and cannot contain NULL values.', difficulty:'easy' },
  { _id:'d6', question:'Differentiate between TCP and UDP.', answer:'TCP (Transmission Control Protocol) is connection-oriented, reliable, ordered, and slower. UDP (User Datagram Protocol) is connectionless, faster, but does not guarantee delivery or order — used in streaming.', difficulty:'medium' },
]

export default function Flashcards() {
  const [sets, setSets] = useState([])
  const [docs, setDocs] = useState([])
  const [selectedDoc, setSelectedDoc] = useState('')
  const [generating, setGenerating] = useState(false)
  const [active, setActive] = useState(null)
  const [flipped, setFlipped] = useState(new Set())
  const [known, setKnown] = useState(new Set())
  const [studyMode, setStudyMode] = useState(false)
  const [idx, setIdx] = useState(0)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    setLoading(true)
    api.get('/documents?status=ready').then(r => {
      const d = r.data.documents || [];
      setDocs(d);
      if (d.length > 0) setSelectedDoc(d[0]._id);
    }).catch(()=>{})
    api.get('/flashcards').then(r => {
      const s = r.data.flashcardSets || []
      setSets(s)
      if (s.length > 0) setActive(s[0])
      else {
        // Load demo set
        setActive({ _id: 'demo', title: '🎓 Demo: CS Fundamentals', cards: DEMO_CARDS })
      }
    }).catch(() => {
      setActive({ _id: 'demo', title: '🎓 Demo: CS Fundamentals', cards: DEMO_CARDS })
    }).finally(() => setLoading(false))
  }, [])

  

  
  const handleGenerate = async () => {
    if (!selectedDoc) return toast.error('Select a document first');
    setGenerating(true);
    try {
      const res = await api.post('/generate/flashcards', {
        documentId: selectedDoc,
        docId: selectedDoc,
        count: 10,
        language: 'English',
        lang: 'English'
      });
      toast.success('Flashcards generated!');
      if (res.data?.flashcardSet) {
        setSets(prev => [res.data.flashcardSet, ...prev.filter(s => s._id !== 'demo')]);
        setActive(res.data.flashcardSet);
        setIdx(0);
        setFlipped(new Set());
        setKnown(new Set());
      } else {
        window.location.reload();
      }
    } catch(err) {
      toast.error(err.response?.data?.error || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }

  const cards = active?.cards || []
  const card = cards[idx]
  const flip = id => { const f = new Set(flipped); f.has(id)?f.delete(id):f.add(id); setFlipped(f) }
  const mark = isKnown => {
    const nk = new Set(known)
    if (isKnown) nk.add(card._id); else nk.delete(card._id)
    setKnown(nk)
    if (idx < cards.length - 1) { setIdx(i => i+1); setFlipped(new Set()) }
    else { toast.success('Done! '+nk.size+'/'+cards.length+' mastered! 🎉'); setStudyMode(false); setIdx(0) }
  }

  if (loading) return <div style={{textAlign:'center',padding:'60px 20px'}}><div style={{fontSize:36,marginBottom:10}}>🃏</div><div style={{color:'var(--ink3)',fontSize:13}}>Loading flashcards...</div></div>

  if (studyMode && card) return (
    <div style={{ maxWidth:600, margin:'0 auto' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
        <button className="btn btn-g btn-sm" onClick={()=>{setStudyMode(false);setIdx(0);setFlipped(new Set())}}>← Exit</button>
        <span style={{ fontSize:13, color:'var(--ink3)', fontWeight:600 }}>{idx+1}/{cards.length}</span>
        <span style={{ fontSize:12, color:'var(--ink3)' }}>✅ {known.size} mastered</span>
      </div>
      <div className="ptr" style={{ marginBottom:18 }}>
        <div className="pf" style={{ width:(idx/cards.length*100)+'%', background:'var(--brand)' }}/>
      </div>
      <div className="card" style={{ minHeight:260, cursor:'pointer' }} onClick={()=>flip(card._id)}>
        <div className="cb" style={{ minHeight:240, display:'flex', flexDirection:'column', justifyContent:'space-between' }}>
          <div>
            <div style={{ display:'flex', gap:8, marginBottom:12 }}>
              <span style={{ fontSize:10.5, fontWeight:700, textTransform:'uppercase', color:'var(--ink3)', background:'var(--bg2)', padding:'3px 9px', borderRadius:20 }}>
                {flipped.has(card._id) ? '✅ ANSWER' : '❓ QUESTION'}
              </span>
              <span style={{ background:DC[card.difficulty||'medium'], color:DT[card.difficulty||'medium'], fontSize:11, fontWeight:700, padding:'2px 9px', borderRadius:20 }}>{card.difficulty||'medium'}</span>
            </div>
            {!flipped.has(card._id)
              ? <div style={{ fontSize:17, fontWeight:600, lineHeight:1.5 }}>{card.question}</div>
              : <div style={{ fontSize:14, background:'var(--bg)', borderRadius:10, padding:'13px 15px', lineHeight:1.7, borderLeft:'3px solid var(--brand)' }}>{card.answer}</div>}
          </div>
          <div style={{ textAlign:'center', color:'var(--ink3)', fontSize:12.5, marginTop:12 }}>
            {flipped.has(card._id) ? '👆 Tap to see question again' : '👆 Tap to reveal answer'}
          </div>
        </div>
      </div>
      {flipped.has(card._id) && (
        <div style={{ display:'flex', gap:12, marginTop:14, justifyContent:'center' }}>
          <button className="btn btn-d" style={{ minWidth:140 }} onClick={()=>mark(false)}>✗ Still Learning</button>
          <button className="btn btn-p" style={{ background:'var(--grn)', minWidth:140 }} onClick={()=>mark(true)}>✓ Got It!</button>
        </div>
      )}
      <div style={{ display:'flex', gap:8, justifyContent:'center', marginTop:10 }}>
        <button className="btn btn-g btn-sm" onClick={()=>{if(idx>0){setIdx(i=>i-1);setFlipped(new Set())}}}>← Prev</button>
        <button className="btn btn-g btn-sm" onClick={()=>{if(idx<cards.length-1){setIdx(i=>i+1);setFlipped(new Set())}}}>Next →</button>
      </div>
    </div>
  )

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
        <div>
          <div style={{ fontFamily:'Sora,sans-serif', fontSize:15, fontWeight:700 }}>{active?.title||'Flashcards'}</div>
          <div style={{ fontSize:12, color:'var(--ink3)', marginTop:2 }}>
            {cards.length} cards · {known.size} mastered
            {active?._id === 'demo' && <span style={{ marginLeft:8, background:'#FEF9C3', color:'#854D0E', fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20 }}>DEMO</span>}
          </div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {cards.length > 0 && <button className="btn btn-p btn-sm" onClick={()=>{setStudyMode(true);setIdx(0);setFlipped(new Set());setKnown(new Set())}}>📖 Study Mode</button>}
          <button className="btn btn-s btn-sm" onClick={() => navigate('/notebook')}>✨ Generate from PDF</button>
        </div>
      </div>

      

      
      <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:16, background:'var(--bg)', padding:'10px 14px', borderRadius:10 }}>
        <span style={{fontSize:13, fontWeight:600}}>Generate New:</span>
        <select className="fi" style={{margin:0, maxWidth:300, padding:'6px 10px', height:'auto'}} value={selectedDoc} onChange={e=>setSelectedDoc(e.target.value)}>
          <option value="">-- Select PDF / Image --</option>
          {docs.map(d=><option key={d._id} value={d._id}>{d.title}</option>)}
        </select>
        <button className="btn btn-p btn-sm" onClick={handleGenerate} disabled={!selectedDoc || generating}>
          {generating ? 'Generating...' : '⚡ Generate Flashcards'}
        </button>
      </div>

      {/* Set switcher */}
      {sets.length > 0 && (
        <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }}>
          {sets.map(s => (
            <div key={s._id} className={'lp'+(active?._id===s._id?' on':'')}
              onClick={()=>{setActive(s);setFlipped(new Set());setKnown(new Set());setIdx(0)}}>
              {s.title?.slice(0,30)}
            </div>
          ))}
        </div>
      )}

      {/* Stats */}
      <div className="g4" style={{ marginBottom:16 }}>
        {[
          {l:'Total Cards',v:cards.length,i:'🃏',c:'var(--brand)'},
          {l:'Mastered',v:known.size,i:'✅',c:'var(--grn)'},
          {l:'Remaining',v:cards.length-known.size,i:'📚',c:'var(--gold)'},
          {l:'Progress',v:Math.round(known.size/Math.max(cards.length,1)*100)+'%',i:'📊',c:'var(--rose)'}
        ].map((s,i)=>(
          <div key={i} className="sc">
            <div style={{ fontSize:20 }}>{s.i}</div>
            <div className="sv" style={{ fontSize:24, color:s.c }}>{s.v}</div>
            <div className="sl">{s.l}</div>
          </div>
        ))}
      </div>

      {/* Demo notice */}
      {active?._id === 'demo' && (
        <div style={{ background:'#FEF9C3', border:'1px solid #E5D87A', borderRadius:10, padding:'10px 14px', marginBottom:14, fontSize:12.5, color:'#854D0E', display:'flex', alignItems:'center', gap:8 }}>
          📌 <strong>Demo mode:</strong> These are sample CS flashcards. Upload a PDF in AI Notebook to generate flashcards from your own content!
          <button className="btn btn-sm" style={{ marginLeft:'auto', background:'#854D0E', color:'#fff', border:'none' }} onClick={()=>navigate('/notebook')}>Upload PDF</button>
        </div>
      )}

      {/* Cards grid */}
      <div className="g2">
        {cards.map(c => (
          <div key={c._id} className="card" style={{ cursor:'pointer', padding:18, minHeight:130, display:'flex', flexDirection:'column', justifyContent:'space-between', transition:'all .2s' }}
            onClick={()=>flip(c._id)}
            onMouseOver={e=>e.currentTarget.style.boxShadow='var(--sh2)'}
            onMouseOut={e=>e.currentTarget.style.boxShadow='var(--sh)'}>
            <div>
              <div style={{ display:'flex', gap:8, marginBottom:9 }}>
                <span style={{ background:DC[c.difficulty||'medium'], color:DT[c.difficulty||'medium'], fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20 }}>{c.difficulty||'medium'}</span>
                {known.has(c._id) && <span style={{ marginLeft:'auto', color:'var(--grn)', fontSize:12 }}>✓ Mastered</span>}
              </div>
              <div style={{ fontSize:13.5, fontWeight:600, color:flipped.has(c._id)?'var(--ink3)':'var(--ink)', lineHeight:1.45 }}>{c.question}</div>
            </div>
            {flipped.has(c._id)
              ? <div style={{ background:'var(--bg)', borderRadius:8, padding:'9px 11px', fontSize:12.5, lineHeight:1.6, marginTop:'auto', borderLeft:'2px solid var(--brand)' }}>{c.answer}</div>
              : <div style={{ fontSize:11.5, color:'var(--ink3)', marginTop:10 }}>👆 Click to reveal answer →</div>}
          </div>
        ))}
      </div>
    </div>
  )
}
