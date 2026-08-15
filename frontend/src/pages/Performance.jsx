import { useState, useEffect } from 'react'
import api from '../utils/api'
import { useNavigate } from 'react-router-dom'

export default function Performance() {
  const [sets, setSets] = useState([])
  const [selected, setSelected] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/flashcards').then(r => {
      const s = r.data.flashcardSets || []
      setSets(s)
      if (s.length > 0) setSelected(s[0])
    }).catch(() => {})
  }, [])

  const cards = selected?.cards || []
  const mastered = cards.filter(c => c.isKnown).length
  const total = cards.length
  const pct = total ? Math.round(mastered / total * 100) : 0
  const diff = {
    easy:   cards.filter(c => c.difficulty === 'easy'),
    medium: cards.filter(c => c.difficulty === 'medium'),
    hard:   cards.filter(c => c.difficulty === 'hard'),
  }

  const BLOOMS = {
    remember:'BT1 — Remember', understand:'BT2 — Understand',
    apply:'BT3 — Apply', analyze:'BT4 — Analyze', evaluate:'BT5 — Evaluate'
  }
  const bloomDist = {}
  cards.forEach(c => { const b = c.bloomsLevel||'remember'; bloomDist[b] = (bloomDist[b]||0) + 1 })

  return (
    <div>
      <div style={{marginBottom:16,display:'flex',gap:10,alignItems:'center'}}>
        <select className="fi" style={{maxWidth:320}} value={selected?._id||''} onChange={e=>{const s=sets.find(x=>x._id===e.target.value);setSelected(s)}}>
          {sets.map(s=><option key={s._id} value={s._id}>{s.title}</option>)}
        </select>
        <button className="btn btn-p btn-sm" onClick={()=>navigate('/flashcards')}>📖 Study Now</button>
      </div>

      {sets.length === 0 ? (
        <div className="card"><div className="cb" style={{textAlign:'center',padding:'50px'}}>
          <div style={{fontSize:44,marginBottom:12}}>📊</div>
          <div style={{fontFamily:'Sora,sans-serif',fontSize:16,fontWeight:700,marginBottom:8}}>No data yet</div>
          <div style={{fontSize:13,color:'var(--ink3)',marginBottom:16}}>Generate flashcards from a PDF to see performance analytics</div>
          <button className="btn btn-p" onClick={()=>navigate('/notebook')}>📓 Generate Flashcards</button>
        </div></div>
      ) : <>
        {/* Main score */}
        <div className="g4" style={{marginBottom:20}}>
          {[
            {l:'Total Cards',  v:total,   i:'🃏', c:'var(--brand)'},
            {l:'Mastered',     v:mastered,i:'✅', c:'var(--grn)'},
            {l:'Remaining',    v:total-mastered,i:'📚',c:'var(--gold)'},
            {l:'Accuracy',     v:`${pct}%`,i:'📊',c:pct>=70?'var(--grn)':pct>=40?'var(--gold)':'var(--rose)'},
          ].map((s,i)=>(
            <div key={i} className="sc">
              <div style={{fontSize:22,marginBottom:8}}>{s.i}</div>
              <div className="sv" style={{color:s.c}}>{s.v}</div>
              <div className="sl">{s.l}</div>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div className="card" style={{marginBottom:16}}>
          <div className="ch"><div className="ct">📈 Overall Progress — {selected?.title}</div></div>
          <div className="cb">
            <div style={{marginBottom:8,display:'flex',justifyContent:'space-between',fontSize:13}}>
              <span style={{color:'var(--ink3)'}}>Mastery level</span>
              <span style={{fontWeight:700,color:pct>=70?'var(--grn)':pct>=40?'var(--gold)':'var(--rose)'}}>{pct}%</span>
            </div>
            <div className="ptr" style={{height:14,borderRadius:8,marginBottom:8}}>
              <div className="pf" style={{width:`${pct}%`,background:`linear-gradient(90deg,${pct>=70?'#059669':pct>=40?'#D97706':'#E11D48'},${pct>=70?'#34D399':pct>=40?'#FCD34D':'#FB7185'})`,borderRadius:8}}/>
            </div>
            <div style={{fontSize:12,color:'var(--ink3)'}}>{pct < 40 ? '🔴 Needs more practice' : pct < 70 ? '🟡 Making good progress' : '🟢 Excellent mastery!'}</div>
          </div>
        </div>

        {/* Difficulty breakdown */}
        <div className="g2" style={{marginBottom:16}}>
          <div className="card">
            <div className="ch"><div className="ct">⚖️ Difficulty Breakdown</div></div>
            <div className="cb">
              {Object.entries(diff).map(([d,cards])=>{
                const dc={easy:'#DCFCE7',medium:'#FEF9C3',hard:'#FEE2E2'}
                const dt={easy:'#166534',medium:'#854D0E',hard:'#991B1B'}
                const mastPct = cards.length ? Math.round(cards.filter(c=>c.isKnown).length/cards.length*100) : 0
                return(
                  <div key={d} style={{marginBottom:12}}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:5}}>
                      <span style={{background:dc[d],color:dt[d],fontSize:12,fontWeight:700,padding:'2px 10px',borderRadius:20,textTransform:'capitalize'}}>{d}</span>
                      <span style={{fontSize:12.5,color:'var(--ink3)'}}>{cards.filter(c=>c.isKnown).length}/{cards.length} · {mastPct}%</span>
                    </div>
                    <div className="ptr"><div className="pf" style={{width:`${mastPct}%`,background:d==='easy'?'var(--grn)':d==='medium'?'var(--gold)':'var(--rose)'}}/></div>
                  </div>
                )
              })}
            </div>
          </div>
          <div className="card">
            <div className="ch"><div className="ct">🎯 Bloom's Taxonomy Distribution</div></div>
            <div className="cb">
              {Object.entries(bloomDist).map(([b,count])=>(
                <div key={b} style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid var(--bdr)',fontSize:13}}>
                  <span style={{color:'var(--ink2)'}}>{BLOOMS[b]||b}</span>
                  <span style={{fontWeight:700,color:'var(--brand)'}}>{count} cards</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Card list */}
        <div className="card">
          <div className="ch"><div className="ct">🃏 Cards Status</div></div>
          <div className="cb" style={{maxHeight:350,overflowY:'auto'}}>
            {cards.map((c,i)=>(
              <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 0',borderBottom:'1px solid var(--bdr)',fontSize:12.5}}>
                <span style={{fontSize:14}}>{c.isKnown?'✅':'⬜'}</span>
                <span style={{flex:1,color:c.isKnown?'var(--grn)':'var(--ink)',textDecoration:c.isKnown?'line-through':'none',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.question}</span>
                <span style={{background:c.difficulty==='hard'?'#FEE2E2':c.difficulty==='medium'?'#FEF9C3':'#DCFCE7',color:c.difficulty==='hard'?'#991B1B':c.difficulty==='medium'?'#854D0E':'#166534',fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:20}}>{c.difficulty}</span>
              </div>
            ))}
          </div>
        </div>
      </>}
    </div>
  )
}