import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../utils/api'

export default function Upload() {
  const [files,setFiles]=useState([])
  const [dragOver,setDragOver]=useState(false)
  const [uploading,setUploading]=useState(false)
  const [result,setResult]=useState(null)
  const [subject,setSubject]=useState('')
  const ref=useRef()
  const navigate=useNavigate()

  const addFiles=fs=>{
    const allowed=['application/pdf','image/jpeg','image/jpg','image/png','image/webp']
    const arr=Array.from(fs).filter(f=>allowed.includes(f.type))
    if(arr.length<Array.from(fs).length) toast.error('Only PDF and image files accepted')
    setFiles(prev=>[...prev,...arr.map(f=>({file:f,id:Date.now()+Math.random(),name:f.name,size:(f.size/1024/1024).toFixed(2)+' MB',type:f.type.startsWith('image/')?'IMG':'PDF',progress:0,done:false,error:null}))])
  }

  const upload=async()=>{
    if(!files.length){toast.error('Add at least one file');return}
    setUploading(true);setResult(null)
    try{
      const fd=new FormData()
      files.forEach(f=>fd.append('files',f.file))
      if(subject)fd.append('subject',subject)
      setFiles(p=>p.map(f=>({...f,progress:15})))
      const res=await api.post('/documents/upload',fd,{
        headers:{'Content-Type':'multipart/form-data'},
        onUploadProgress:e=>{const pct=Math.round(e.loaded/e.total*90);setFiles(p=>p.map(f=>({...f,progress:pct})))}
      })
      setFiles(p=>p.map(f=>({...f,progress:100,done:true})))
      setResult(res.data)
      const ok=res.data.documents?.filter(d=>d.status==='ready').length||0
      const fail=res.data.documents?.filter(d=>d.status==='error').length||0
      if(ok>0)toast.success(`✅ ${ok} file(s) processed successfully!`)
      if(fail>0)toast.error(`❌ ${fail} file(s) failed`)
    }catch(err){toast.error(err.response?.data?.error||'Upload failed');setFiles(p=>p.map(f=>({...f,error:'Failed'})))}
    finally{setUploading(false)}
  }

  return(
    <div className="tc" style={{alignItems:'start'}}>
      <div>
        <div className="card" style={{marginBottom:16}}>
          <div className="ch"><div className="ct">📤 Upload PDF or Image</div></div>
          <div className="cb">
            <div className="ib b" style={{marginBottom:14,fontSize:12}}>
              📄 <strong>PDF:</strong> Full text extraction for notes, questions, flashcards<br/>
              🖼️ <strong>Image/Photo:</strong> AI reads text + explains diagrams (needs Gemini API)
            </div>
            <div className={`dz${dragOver?' ov':''}`}
              onDragOver={e=>{e.preventDefault();setDragOver(true)}}
              onDragLeave={()=>setDragOver(false)}
              onDrop={e=>{e.preventDefault();setDragOver(false);addFiles(e.dataTransfer.files)}}
              onClick={()=>ref.current?.click()}>
              <div style={{fontSize:36,marginBottom:10}}>📂</div>
              <div style={{fontFamily:'Sora,sans-serif',fontSize:14,fontWeight:700,marginBottom:5}}>Drop files here or click to browse</div>
              <div style={{fontSize:12,color:'var(--ink3)'}}>PDF · JPG · PNG · WebP · Up to 10 files · 100MB each</div>
            </div>
            <input ref={ref} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,image/*,application/pdf" style={{display:'none'}} onChange={e=>addFiles(e.target.files)}/>
            {files.length>0&&(
              <div style={{marginTop:13,display:'flex',flexDirection:'column',gap:7}}>
                {files.map(f=>(
                  <div key={f.id} style={{display:'flex',alignItems:'center',gap:10,background:'var(--card)',border:'1px solid var(--bdr)',borderRadius:9,padding:'9px 12px'}}>
                    <div style={{width:34,height:34,borderRadius:7,background:f.type==='IMG'?'#DBEAFE':'#FEE2E2',color:f.type==='IMG'?'#1D4ED8':'#B91C1C',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,flexShrink:0}}>{f.type==='IMG'?'🖼️':'📄'}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.name}</div>
                      <div style={{fontSize:11,color:'var(--ink3)'}}>{f.size} · {f.type}</div>
                      {!f.done&&f.progress>0&&<div style={{background:'var(--bg3)',borderRadius:20,height:4,overflow:'hidden',marginTop:4}}><div style={{height:'100%',borderRadius:20,background:'var(--brand)',width:`${f.progress}%`,transition:'width .4s'}}/></div>}
                    </div>
                    {f.done&&<span style={{color:'var(--grn)',fontSize:18}}>✓</span>}
                    {!f.done&&<span onClick={()=>setFiles(p=>p.filter(x=>x.id!==f.id))} style={{cursor:'pointer',color:'var(--ink3)',fontSize:16}}>✕</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="card">
          <div className="ch"><div className="ct">⚙️ Options</div></div>
          <div className="cb">
            <div className="fg"><label className="fl">Subject / Topic (optional)</label>
              <input className="fi" placeholder="e.g. Organic Chemistry, Data Structures, History..." value={subject} onChange={e=>setSubject(e.target.value)}/>
            </div>
          </div>
        </div>
      </div>
      <div>
        <div className="card" style={{marginBottom:16}}>
          <div className="ch"><div className="ct">⚡ Process</div></div>
          <div className="cb">
            <div style={{fontSize:13,color:files.length?'var(--grn)':'var(--ink3)',marginBottom:13,fontWeight:files.length?600:400}}>
              {files.length===0?'⚠️ Add files above':files.some(f=>f.type==='IMG')?`📸 ${files.length} file(s) — AI will analyse images`:`✅ ${files.length} PDF(s) ready`}
            </div>
            <button className="btn btn-p btn-lg wf" onClick={upload} disabled={uploading||!files.length}>
              {uploading?'⏳ Processing...':'📤 Upload & Process'}
            </button>
            {uploading&&<div className="dots" style={{marginTop:8}}><div className="dot"/><div className="dot"/><div className="dot"/><span style={{fontSize:13,color:'var(--ink3)'}}>Extracting content...</span></div>}
          </div>
        </div>

        {result?.documents?.length>0&&(
          <div className="card" style={{marginBottom:16}}>
            <div className="ch"><div className="ct">✅ Results</div></div>
            <div className="cb">
              {result.documents.map(doc=>(
                <div key={doc._id} style={{background:'var(--bg)',borderRadius:9,padding:'12px 14px',marginBottom:9}}>
                  <div style={{fontWeight:700,fontSize:13,marginBottom:5}}>{doc.fileType==='image'?'🖼️':'📄'} {doc.title}</div>
                  {doc.status==='ready'?(
                    <>
                      <div className="ib g" style={{marginBottom:9,fontSize:12}}>
                        ✅ {doc.fileType==='image'?'Image analysed by AI':''}
                        {doc.wordCount?.toLocaleString()} words extracted
                      </div>
                      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                        <button className="btn btn-p btn-sm" onClick={()=>navigate(`/notebook?docId=${doc._id}`)}>📓 Generate Content</button>
                        <button className="btn btn-s btn-sm" onClick={()=>navigate('/chatbot')}>🧠 Ask Questions</button>
                      </div>
                    </>
                  ):(
                    <div className="ib r" style={{fontSize:12}}>❌ {doc.errorMessage||'Processing failed'}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="card">
          <div className="ch"><div className="ct">💡 Tips</div></div>
          <div className="cb">
            {[
              ['📄','PDF with selectable text works best'],
              ['🖼️','Photo of textbook page — AI reads + explains'],
              ['📊','Upload diagrams, charts, equations as images'],
              ['🔍','Scanned PDFs: upload as image for OCR'],
              ['📦','Up to 10 files at once'],
            ].map(([ic,t],i)=>(
              <div key={i} style={{display:'flex',gap:9,padding:'7px 0',borderBottom:i<4?'1px solid var(--bdr)':'none',fontSize:12.5}}>
                <span style={{fontSize:16,flexShrink:0}}>{ic}</span>
                <span style={{color:'var(--ink2)'}}>{t}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}