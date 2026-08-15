import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../utils/api'

const DC={easy:'#DCFCE7',medium:'#FEF9C3',hard:'#FEE2E2'}
const DT={easy:'#166534',medium:'#854D0E',hard:'#991B1B'}

export default function Flashcards() {
  const [sets,setSets]=useState([])
  const [active,setActive]=useState(null)
  const [flipped,setFlipped]=useState(new Set())
  const [known,setKnown]=useState(new Set())
  const [studyMode,setStudyMode]=useState(false)
  const [idx,setIdx]=useState(0)
  const navigate=useNavigate()

  useEffect(()=>{
    api.get('/flashcards').then(r=>{
      const s=r.data.flashcardSets||[]
      setSets(s)
      if(s.length>0) setActive(s[0])
    }).catch(()=>{})
  },[])

  const cards=active?.cards||[]
  const card=cards[idx]
  const flip=(id)=>{const f=new Set(flipped);f.has(id)?f.delete(id):f.add(id);setFlipped(f)}
  const mark=(isKnown)=>{
    const nk=new Set(known)
    if(isKnown)nk.add(card._id);else nk.delete(card._id)
    setKnown(nk)
    if(idx<cards.length-1){setIdx(i=>i+1);setFlipped(new Set())}
    else{toast.success(`Done! ${nk.size}/${cards.length} mastered! 🎉`);setStudyMode(false);setIdx(0);setFlipped(new Set())}
  }

  const switchSet=(s)=>{setActive(s);setFlipped(new Set());setKnown(new Set());setIdx(0);setStudyMode(false)}

  const deleteSet=async(id)=>{
    if(!confirm('Delete this flashcard set?'))return
    await api.delete(`/flashcards/${id}`).catch(()=>{})
    const updated=sets.filter(s=>s._id!==id)
    setSets(updated)
    if(active?._id===id){setActive(updated[0]||null)}
    toast.success('Deleted')
  }

  // Study mode — 3D flip card
  if(studyMode&&card) return(
    <div style={{maxWidth:580,margin:'0 auto'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <button className="btn btn-g btn-sm" onClick={()=>{setStudyMode(false);setIdx(0);setFlipped(new Set())}}>← Exit Study</button>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <span style={{fontSize:13,color:'var(--ink3)',fontWeight:600}}>{idx+1}/{cards.length}</span>
          <span style={{background:DC[card.difficulty||'medium'],color:DT[card.difficulty||'medium'],fontSize:11,fontWeight:700,padding:'2px 9px',borderRadius:20}}>{card.difficulty||'medium'}</span>
        </div>
      </div>
      <div className="ptr" style={{marginBottom:18,height:6}}>
        <div className="pf" style={{width:`${(idx/cards.length)*100}%`,background:'linear-gradient(90deg,var(--brand),var(--brand2))'}}/>
      </div>

      {/* 3D flip card */}
      <div className={`card-flip${flipped.has(card._id)?' flipped':''}`} style={{height:260,marginBottom:16}} onClick={()=>flip(card._id)}>
        <div className="card-flip-inner" style={{width:'100%',height:'100%'}}>
          <div className="card-face" style={{background:'var(--card)',border:'1px solid var(--bdr)',boxShadow:'var(--sh2)'}}>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:1,color:'var(--ink3)',marginBottom:16,textTransform:'uppercase'}}>Question</div>
            <div style={{fontSize:17,fontWeight:600,lineHeight:1.5,color:'var(--ink)'}}>{card.question}</div>
            <div style={{fontSize:12,color:'var(--ink3)',marginTop:18}}>👆 Tap to reveal answer</div>
          </div>
          <div className="card-face card-back">
            <div style={{fontSize:11,fontWeight:700,letterSpacing:1,opacity:.7,marginBottom:16,textTransform:'uppercase'}}>Answer</div>
            <div style={{fontSize:15,lineHeight:1.65}}>{card.answer}</div>
            <div style={{fontSize:12,opacity:.7,marginTop:18}}>👆 Tap to see question</div>
          </div>
        </div>
      </div>

      {flipped.has(card._id)&&(
        <div style={{display:'flex',gap:12,justifyContent:'center',marginBottom:14}}>
          <button className="btn" style={{background:'#FEF2F2',color:'#B91C1C',border:'1px solid rgba(225,29,72,.2)',padding:'12px 28px',fontSize:14}} onClick={()=>mark(false)}>✗ Again</button>
          <button className="btn" style={{background:'#F0FDF4',color:'#166534',border:'1px solid rgba(5,150,105,.2)',padding:'12px 28px',fontSize:14}} onClick={()=>mark(true)}>✓ Got It!</button>
        </div>
      )}
      <div style={{display:'flex',gap:8,justifyContent:'center'}}>
        <button className="btn btn-g btn-sm" disabled={idx===0} onClick={()=>{setIdx(i=>i-1);setFlipped(new Set())}}>← Prev</button>
        <button className="btn btn-g btn-sm" disabled={idx===cards.length-1} onClick={()=>{setIdx(i=>i+1);setFlipped(new Set())}}>Next →</button>
      </div>
    </div>
  )

  return(
    <div>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,flexWrap:'wrap',gap:10}}>
        <div>
          <div style={{fontFamily:'Sora,sans-serif',fontSize:15,fontWeight:700}}>{active?.title||'Flashcards'}</div>
          <div style={{fontSize:12,color:'var(--ink3)',marginTop:2}}>{cards.length} cards · {known.size} mastered · from "{active?.documentTitle||'your PDF'}"</div>
        </div>
        <div style={{display:'flex',gap:8}}>
          {cards.length>0&&<button className="btn btn-p btn-sm" onClick={()=>{setStudyMode(true);setIdx(0);setFlipped(new Set())}}>📖 Study Mode</button>}
          <button className="btn btn-s btn-sm" onClick={()=>navigate('/notebook')}>➕ Generate New</button>
          {active&&<button className="btn btn-d btn-sm" onClick={()=>deleteSet(active._id)}>🗑️</button>}
        </div>
      </div>

      {/* Set tabs */}
      {sets.length>1&&(
        <div className="tbr" style={{marginBottom:14}}>
          {sets.map(s=><div key={s._id} className={`tab${active?._id===s._id?' on':''}`} onClick={()=>switchSet(s)}>{s.title?.slice(0,28)}</div>)}
        </div>
      )}

      {/* Stats */}
      <div className="g4" style={{marginBottom:16}}>
        {[{l:'Total',v:cards.length,i:'🃏',c:'var(--brand)'},{l:'Mastered',v:known.size,i:'✅',c:'var(--grn)'},{l:'Remaining',v:cards.length-known.size,i:'📚',c:'var(--gold)'},{l:'Progress',v:`${Math.round(known.size/Math.max(cards.length,1)*100)}%`,i:'📊',c:'var(--rose)'}].map((s,i)=>(
          <div key={i} className="sc"><div style={{fontSize:20,marginBottom:6}}>{s.i}</div><div className="sv" style={{fontSize:22,color:s.c}}>{s.v}</div><div className="sl">{s.l}</div></div>
        ))}
      </div>

      {cards.length===0?(
        <div className="card"><div className="cb" style={{textAlign:'center',padding:'40px 20px'}}>
          <div style={{fontSize:42,marginBottom:12}}>🃏</div>
          <div style={{fontFamily:'Sora,sans-serif',fontSize:15,fontWeight:700,marginBottom:8}}>No flashcards yet</div>
          <div style={{fontSize:13,color:'var(--ink3)',marginBottom:14}}>Upload a PDF and generate flashcards from it in AI Notebook</div>
          <button className="btn btn-p btn-sm" onClick={()=>navigate('/notebook')}>📓 Go to AI Notebook</button>
        </div></div>
      ):(
        <div className="g2">
          {cards.map(c=>(
            <div key={c._id} style={{cursor:'pointer',background:'var(--card)',border:`1px solid ${known.has(c._id)?'#86EFAC':'var(--bdr)'}`,borderRadius:12,padding:18,minHeight:130,display:'flex',flexDirection:'column',justifyContent:'space-between',transition:'all .2s',boxShadow:'var(--sh)'}}
              onClick={()=>flip(c._id)}
              onMouseOver={e=>e.currentTarget.style.boxShadow='var(--sh2)'}
              onMouseOut={e=>e.currentTarget.style.boxShadow='var(--sh)'}>
              <div>
                <div style={{display:'flex',gap:8,marginBottom:9}}>
                  <span style={{background:DC[c.difficulty||'medium'],color:DT[c.difficulty||'medium'],fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:20}}>{c.difficulty||'medium'}</span>
                  {known.has(c._id)&&<span style={{color:'var(--grn)',fontSize:12,marginLeft:'auto',fontWeight:700}}>✓ Mastered</span>}
                </div>
                <div style={{fontSize:13.5,fontWeight:600,color:'var(--ink)',lineHeight:1.45}}>{c.question}</div>
              </div>
              {flipped.has(c._id)
                ?<div style={{background:'var(--bg)',borderRadius:8,padding:'9px 11px',fontSize:12.5,lineHeight:1.6,marginTop:10,color:'var(--ink2)'}}>{c.answer}</div>
                :<div style={{fontSize:11.5,color:'var(--ink3)',marginTop:10}}>Click to reveal →</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}