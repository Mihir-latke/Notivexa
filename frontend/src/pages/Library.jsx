import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../utils/api'
const fmt=b=>b>1048576?(b/1048576).toFixed(1)+' MB':(b/1024).toFixed(0)+' KB'
export default function Library() {
  const[docs,setDocs]=useState([])
  const[outputs,setOutputs]=useState([])
  const[search,setSearch]=useState('')
  const[tab,setTab]=useState('docs')
  const navigate=useNavigate()
  useEffect(()=>{
    api.get('/library').then(r=>setDocs(r.data.documents||[])).catch(()=>{})
    api.get('/library/outputs').then(r=>setOutputs(r.data.outputs||[])).catch(()=>{})
  },[])
  const filtered=docs.filter(d=>!search||d.title.toLowerCase().includes(search.toLowerCase()))
  const del=async id=>{
    if(!confirm('Delete this document?'))return
    await api.delete(`/documents/${id}`).catch(()=>{})
    setDocs(p=>p.filter(d=>d._id!==id));toast.success('Deleted')
  }
  return(
    <div>
      <div className="g4" style={{marginBottom:18}}>
        {[{l:'Total Files',v:docs.length,i:'📁'},{l:'Ready',v:docs.filter(d=>d.status==='ready').length,i:'✅'},{l:'Generated',v:outputs.length,i:'✨'},{l:'Storage',v:fmt(docs.reduce((a,d)=>a+(d.size||0),0)),i:'💾'}].map((s,i)=>(
          <div key={i} className="sc"><div style={{fontSize:22,marginBottom:8}}>{s.i}</div><div className="sv" style={{fontSize:22}}>{s.v}</div><div className="sl">{s.l}</div></div>
        ))}
      </div>
      <div className="tbr">
        <div className={`tab${tab==='docs'?' on':''}`} onClick={()=>setTab('docs')}>📁 Documents ({docs.length})</div>
        <div className={`tab${tab==='out'?' on':''}`} onClick={()=>setTab('out')}>✨ Generated Files ({outputs.length})</div>
      </div>
      {tab==='docs'&&<>
        <div style={{display:'flex',gap:10,marginBottom:14,flexWrap:'wrap'}}>
          <input className="fi" style={{flex:'1 1 200px'}} placeholder="🔍 Search documents..." value={search} onChange={e=>setSearch(e.target.value)}/>
          <button className="btn btn-p" onClick={()=>navigate('/upload')}>➕ Upload / Link</button>
        </div>
        <div className="card"><div style={{overflowX:'auto'}}>
          <table className="tbl">
            <thead><tr><th>File Name</th><th>Words</th><th>Pages</th><th>Status</th><th>Generated</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map(d=>(
                <tr key={d._id}>
                  <td><div style={{display:'flex',alignItems:'center',gap:8}}><span style={{fontSize:18}}>{d.fileType === 'gdrive' ? '🔷' : d.fileType === 'youtube' ? '🎥' : d.fileType === 'url' ? '🌐' : d.fileType === 'image' ? '🖼️' : '📄'}</span><span style={{fontWeight:600,maxWidth:220,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{d.title}</span></div></td>
                  <td>{d.wordCount?.toLocaleString()||'—'}</td>
                  <td>{d.pageCount||'—'}</td>
                  <td><span className={d.status==='ready'?'bok':d.status==='processing'?'bpr':'ber'}>{d.status==='ready'?'✓ Ready':d.status==='processing'?'⏳ Processing':'✗ Error'}</span></td>
                  <td><span style={{fontSize:11,color:'var(--ink3)'}}>{d.outputs?.length||0} files</span></td>
                  <td><div style={{display:'flex',gap:6}}>
                    <button className="btn btn-s btn-sm" onClick={()=>navigate(`/notebook?docId=${d._id}`)}>📓 Use</button>
                    <button className="btn btn-d btn-sm" onClick={()=>del(d._id)}>🗑️</button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length===0&&<div style={{textAlign:'center',padding:'40px 20px',color:'var(--ink3)'}}>
            <div style={{fontSize:36,marginBottom:10}}>📂</div>
            <div style={{fontWeight:600}}>No documents</div>
            <button className="btn btn-p" style={{marginTop:14}} onClick={()=>navigate('/upload')}>📤 Upload or Paste Link</button>
          </div>}
        </div></div>
      </>}
      {tab==='out'&&<div className="card"><div style={{overflowX:'auto'}}>
        <table className="tbl">
          <thead><tr><th>Document</th><th>Type</th><th>Language</th><th>Date</th><th>Download</th></tr></thead>
          <tbody>
            {outputs.map((o,i)=>(
              <tr key={i}>
                <td style={{fontWeight:600,maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{o.documentTitle}</td>
                <td><span className="chip" style={{fontSize:11}}>{o.type}</span></td>
                <td>{o.language||'English'}</td>
                <td>{new Date(o.createdAt).toLocaleDateString('en-IN')}</td>
                <td>{o.fileName?<a href={`/uploads/generated/${o.fileName}`} download className="btn btn-s btn-sm" style={{textDecoration:'none'}}>⬇️ Download</a>:<span style={{fontSize:12,color:'var(--ink3)'}}>Text only</span>}</td>
              </tr>
            ))}
            {outputs.length===0&&<tr><td colSpan={5} style={{textAlign:'center',padding:30,color:'var(--ink3)'}}>No generated files yet. Use AI Notebook to create content from your PDFs.</td></tr>}
          </tbody>
        </table>
      </div></div>}
    </div>
  )
}