import { useState, useEffect } from 'react'
import api from '../utils/api'

export default function Ebooks() {
  const [items,setItems]=useState([])
  const [q,setQ]=useState('')
  const [category,setCategory]=useState('All')
  const [type,setType]=useState('books')
  const [loading,setLoading]=useState(false)

  const load=(newType=type,newCat=category,newQ=q)=>{
    setLoading(true)
    api.get(`/ebooks?q=${encodeURIComponent(newQ)}&category=${newCat==='All'?'':newCat}&type=${newType}`)
      .then(r=>setItems(r.data.items||[]))
      .catch(()=>{})
      .finally(()=>setLoading(false))
  }

  useEffect(()=>{load()},[])

  const switchType=(t)=>{setType(t);load(t,category,q)}
  const switchCat=(c)=>{setCategory(c);load(type,c,q)}

  return(
    <div>
      {/* Type tabs */}
      <div className="tbr" style={{marginBottom:16}}>
        <div className={`tab${type==='books'?' on':''}`} onClick={()=>switchType('books')}>📚 E-Books</div>
        <div className={`tab${type==='youtube'?' on':''}`} onClick={()=>switchType('youtube')}>▶️ YouTube Lectures</div>
      </div>

      {/* Search */}
      <div style={{display:'flex',gap:10,marginBottom:14}}>
        <input className="fi" style={{flex:1}} placeholder={type==='books'?'🔍 Search books, authors...':'🔍 Search channels, topics...'} value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&load()}/>
        <button className="btn btn-p" onClick={()=>load()}>Search</button>
      </div>

      {/* Category filter */}
      <div style={{display:'flex',gap:7,marginBottom:16,flexWrap:'wrap'}}>
        {['All','MCA','Science'].map(c=>(
          <div key={c} className={`lp${category===c?' on':''}`} onClick={()=>switchCat(c)}>{c==='MCA'?'💻':c==='Science'?'🔬':'🌐'} {c}</div>
        ))}
      </div>

      <div className="sec">
        <div className="st">{type==='books'?'📚':'▶️'} {type==='books'?'Study Materials':'Video Lectures'}</div>
        <span className="chip">{items.length} results</span>
      </div>

      {loading&&<div style={{textAlign:'center',padding:'40px',color:'var(--ink3)'}}>⏳ Loading...</div>}

      {type==='books'?(
        <div className="g3">
          {items.map(b=>(
            <div key={b.id} style={{background:'var(--card)',border:'1px solid var(--bdr)',borderRadius:12,overflow:'hidden',transition:'all .2s'}}
              onMouseOver={e=>e.currentTarget.style.boxShadow='var(--sh2)'}
              onMouseOut={e=>e.currentTarget.style.boxShadow='var(--sh)'}>
              <div style={{height:90,background:b.color||'#EDE9FE',display:'flex',alignItems:'center',justifyContent:'center',fontSize:36}}>{b.emoji}</div>
              <div style={{padding:'12px 14px'}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:2,lineHeight:1.3}}>{b.title}</div>
                <div style={{fontSize:11.5,color:'var(--ink3)',marginBottom:2}}>{b.author}</div>
                <div style={{fontSize:11,color:'var(--brand)',marginBottom:9,fontWeight:600}}>{b.category}</div>
                <div style={{display:'flex',gap:5,flexWrap:'wrap',marginBottom:10}}>
                  {b.tags?.map(t=><span key={t} style={{fontSize:10,padding:'2px 8px',borderRadius:20,background:'var(--bg2)',color:'var(--ink3)',fontWeight:600}}>{t}</span>)}
                </div>
                <a href={b.url} target="_blank" rel="noreferrer" className="btn btn-p btn-sm wf" style={{textDecoration:'none',justifyContent:'center'}}>📖 Open Free</a>
              </div>
            </div>
          ))}
        </div>
      ):(
        <div className="g2" style={{gap:14}}>
          {items.map(v=>(
            <a key={v.id} href={v.url} target="_blank" rel="noreferrer" style={{textDecoration:'none',color:'inherit',background:'var(--card)',border:'1px solid var(--bdr)',borderRadius:12,overflow:'hidden',display:'block',transition:'all .2s'}}
              onMouseOver={e=>e.currentTarget.style.boxShadow='var(--sh2)'}
              onMouseOut={e=>e.currentTarget.style.boxShadow='var(--sh)'}>
              <div style={{height:80,background:v.color||'#EDE9FE',display:'flex',alignItems:'center',justifyContent:'center',fontSize:32,position:'relative'}}>
                {v.emoji}
                <span style={{position:'absolute',bottom:8,right:10,background:'rgba(0,0,0,0.7)',color:'#fff',fontSize:11,padding:'2px 8px',borderRadius:20}}>▶ {v.duration}</span>
              </div>
              <div style={{padding:'12px 14px'}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:3,lineHeight:1.3}}>{v.title}</div>
                <div style={{fontSize:12,color:'var(--brand)',fontWeight:600,marginBottom:2}}>{v.channel}</div>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:11.5,color:'var(--ink3)'}}>
                  <span>{v.subject}</span><span>👁️ {v.views}</span>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}

      {items.length===0&&!loading&&(
        <div style={{textAlign:'center',padding:'40px',color:'var(--ink3)'}}>
          <div style={{fontSize:36,marginBottom:10}}>📚</div>
          <div style={{fontWeight:600}}>No results found</div>
        </div>
      )}
    </div>
  )
}