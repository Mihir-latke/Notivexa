import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../utils/api'

export default function Upload() {
  const [tab, setTab] = useState('file') // 'file' or 'url'
  const [files, setFiles] = useState([])
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState(null)
  const [subject, setSubject] = useState('')
  
  // URL Link state
  const [url, setUrl] = useState('')
  const [urlTitle, setUrlTitle] = useState('')
  const [urlLoading, setUrlLoading] = useState(false)

  const ref = useRef()
  const cameraRef = useRef()
  const navigate = useNavigate()

  const addFiles = fs => {
    const arr = Array.from(fs).filter(f => f.type === 'application/pdf' || f.type.startsWith('image/'))
    if (arr.length < Array.from(fs).length) toast.error('Only PDF and image files are accepted')
    const mapped = arr.map(f => ({ file:f, id:Date.now()+Math.random(), name:f.name, size:(f.size/1024/1024).toFixed(2)+' MB', progress:0, done:false, error:null }))
    setFiles(prev => [...prev, ...mapped])
  }

  const upload = async () => {
    if (!files.length) { toast.error('Add at least one document or image'); return }
    setUploading(true); setResult(null)
    try {
      const fd = new FormData()
      files.forEach(f => fd.append('files', f.file))
      if (subject) fd.append('subject', subject)
      setFiles(prev => prev.map(f => ({ ...f, progress: 20 })))
      const res = await api.post('/documents/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: e => {
          const pct = Math.round(e.loaded / e.total * 90)
          setFiles(prev => prev.map(f => ({ ...f, progress: pct })))
        }
      })
      setFiles(prev => prev.map(f => ({ ...f, progress: 100, done: true })))
      setResult(res.data)
      const ok = res.data.documents?.filter(d => d.status === 'ready').length || 0
      const fail = res.data.documents?.filter(d => d.status === 'error').length || 0
      if (ok > 0) toast.success(`✅ ${ok} File(s) successfully extracted!`)
      if (fail > 0) toast.error(`❌ ${fail} file(s) failed — see details`)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Upload failed. Check backend is running.')
      setFiles(prev => prev.map(f => ({ ...f, error: 'Upload failed' })))
    } finally { setUploading(false) }
  }

  const handleImportUrl = async () => {
    const trimmed = url.trim()
    if (!trimmed) { toast.error('Please enter a YouTube video URL or online PDF link'); return }
    if (!/^https?:\/\//i.test(trimmed)) { toast.error('Link must start with http:// or https://'); return }

    setUrlLoading(true)
    try {
      const res = await api.post('/documents/import-url', {
        url: trimmed,
        subject: subject.trim(),
        title: urlTitle.trim()
      })
      const doc = res.data.document
      toast.success('🎉 Content successfully extracted from link!')
      setResult(prev => ({
        ...prev,
        documents: [doc, ...(prev?.documents || [])]
      }))
      setUrl('')
      setUrlTitle('')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to extract content from link. Please verify URL.')
    } finally {
      setUrlLoading(false)
    }
  }

  const isYouTube = /(?:youtube\.com|youtu\.be)/i.test(url)
  const isPdf = /\.pdf($|\?)/i.test(url)

  return (
    <div className="tc" style={{ alignItems:'start' }}>
      <div>
        {/* Source Switcher Tabs */}
        <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }}>
          <button 
            className={`btn ${tab === 'file' ? 'btn-p' : 'btn-s'}`}
            style={{ flex:'1 1 160px', display:'flex', justifyContent:'center', alignItems:'center', gap:6 }}
            onClick={() => setTab('file')}
          >
            📁 Upload PDF / Image
          </button>
          <button 
            className={`btn ${tab === 'url' ? 'btn-p' : 'btn-s'}`}
            style={{ flex:'1 1 160px', display:'flex', justifyContent:'center', alignItems:'center', gap:6 }}
            onClick={() => setTab('url')}
          >
            🔗 Paste Link (YouTube / PDF)
          </button>
        </div>

        {tab === 'file' ? (
          <div className="card" style={{ marginBottom:16 }}>
            <div className="ch"><div className="ct">📤 Upload PDF or Image</div></div>
            <div className="cb">
              <div className="ib b" style={{ marginBottom:14 }}>
                <strong>How this works:</strong> Notivexa extracts and stores all text from your PDF or Camera photo. Then use AI Notebook to generate notes, question papers, flashcards — all from your document content.
              </div>
              <div
                className={`dz${dragOver?' ov':''}`}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files) }}
                onClick={() => ref.current?.click()}>
                <div style={{ fontSize:36, marginBottom:10 }}>📂</div>
                <div style={{ fontFamily:'Sora,sans-serif', fontSize:14, fontWeight:700, marginBottom:5 }}>Drop PDF/Image files here or click to browse</div>
                <div style={{ fontSize:12, color:'var(--ink3)' }}>PDF or Images · Up to 10 files · 50MB each</div>
              </div>
              <input ref={ref} type="file" multiple accept=".pdf,application/pdf,image/*" style={{ display:'none' }} onChange={e => addFiles(e.target.files)} />
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display:'none' }} onChange={e => addFiles(e.target.files)} />
              <button className="btn btn-s wf" style={{ marginTop: 12, display: 'flex', justifyContent: 'center' }} onClick={() => cameraRef.current?.click()}>📸 Take Photo from Camera</button>

              {files.length > 0 && (
                <div style={{ marginTop:13, display:'flex', flexDirection:'column', gap:7 }}>
                  {files.map(f => (
                    <div key={f.id} className="fr">
                      <div className="fb fb-p">{f.file.type.startsWith('image/') ? 'IMG' : 'PDF'}</div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{f.name}</div>
                        <div style={{ fontSize:11, color:'var(--ink3)' }}>{f.size}</div>
                        {!f.done && f.progress > 0 && <div className="pb"><div className="pbf" style={{ width:`${f.progress}%` }}/></div>}
                        {f.error && <div style={{ fontSize:11, color:'var(--rose)' }}>{f.error}</div>}
                      </div>
                      {f.done && <span style={{ color:'var(--grn)', fontSize:18 }}>✓</span>}
                      {!f.done && <span onClick={() => setFiles(p => p.filter(x => x.id !== f.id))} style={{ cursor:'pointer', color:'var(--ink3)', fontSize:16 }}>✕</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="card" style={{ marginBottom:16 }}>
            <div className="ch"><div className="ct">🔗 Import from YouTube or Online Link</div></div>
            <div className="cb">
              <div className="ib b" style={{ marginBottom:14 }}>
                <strong>Paste any link:</strong> YouTube lectures, video URLs, online PDFs, or educational articles. Notivexa extracts transcripts and content to generate study notes, flashcards, and quizzes!
              </div>

              <div className="fg" style={{ marginBottom:14 }}>
                <label className="fl">Video / Document URL *</label>
                <input 
                  className="fi" 
                  placeholder="https://www.youtube.com/watch?v=... or https://notivexa.com/sample-notes.pdf"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                />
                {url && (
                  <div style={{ marginTop:6, display:'flex', gap:6, alignItems:'center' }}>
                    {isYouTube && <span style={{ background:'#FEE2E2', color:'#B91C1C', fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:20 }}>🎥 YouTube Video Detected (Transcript extraction)</span>}
                    {isPdf && <span style={{ background:'#DBEAFE', color:'#1D4ED8', fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:20 }}>📄 Online PDF Detected (Direct parsing)</span>}
                    {!isYouTube && !isPdf && /^https?:\/\//i.test(url) && <span style={{ background:'#EDE9FE', color:'#6D28D9', fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:20 }}>🌐 Web Article / Link Detected</span>}
                  </div>
                )}
              </div>

              <div className="fg" style={{ marginBottom:14 }}>
                <label className="fl">Custom Title (optional)</label>
                <input 
                  className="fi" 
                  placeholder="Leave blank to auto-detect title" 
                  value={urlTitle} 
                  onChange={e => setUrlTitle(e.target.value)} 
                />
              </div>

              {/* Sample link suggestions */}
              <div style={{ fontSize:11.5, color:'var(--ink3)', marginBottom:16 }}>
                <strong>Supported formats:</strong>
                <ul style={{ margin:'4px 0 0 16px', padding:0, lineHeight:1.6 }}>
                  <li>YouTube Videos & Shorts (auto-extracts timestamps & captions)</li>
                  <li>Online PDF URLs (textbooks, research papers, lecture notes)</li>
                  <li>Educational webpages, Wikipedia, and study portals</li>
                </ul>
              </div>

              <button 
                className="btn btn-p btn-lg wf" 
                onClick={handleImportUrl} 
                disabled={urlLoading || !url.trim()}
              >
                {urlLoading ? '⏳ Extracting Content from Link...' : '⚡ Extract & Import Content'}
              </button>

              {urlLoading && (
                <div className="dots" style={{ marginTop:10, justifyContent:'center' }}>
                  <div className="dot"/><div className="dot"/><div className="dot"/>
                  <span style={{ fontSize:13, color:'var(--ink3)' }}>
                    {isYouTube ? 'Extracting YouTube captions & video notes...' : 'Downloading and reading content...'}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="card">
          <div className="ch"><div className="ct">⚙️ Subject & Topic</div></div>
          <div className="cb">
            <div className="fg">
              <label className="fl">Subject / Topic (optional)</label>
              <input className="fi" placeholder="e.g. Organic Chemistry, Thermodynamics, Computer Science..." value={subject} onChange={e => setSubject(e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      <div>
        {tab === 'file' && (
          <div className="card" style={{ marginBottom:16 }}>
            <div className="ch"><div className="ct">⚡ Process Files</div></div>
            <div className="cb">
              <div style={{ fontSize:13, color:files.length?'var(--grn)':'var(--ink3)', marginBottom:13, fontWeight:files.length?600:400 }}>
                {files.length === 0 ? '⚠️ Add PDF files above to begin' : `✅ ${files.length} File(s) ready to process`}
              </div>
              <button className="btn btn-p btn-lg wf" onClick={upload} disabled={uploading || !files.length}>
                {uploading ? '⏳ Extracting text...' : '📤 Upload & Extract'}
              </button>
              {uploading && (
                <div className="dots" style={{ marginTop:8 }}>
                  <div className="dot"/><div className="dot"/><div className="dot"/>
                  <span style={{ fontSize:13, color:'var(--ink3)' }}>Reading document text...</span>
                </div>
              )}
            </div>
          </div>
        )}

        {result?.documents?.length > 0 && (
          <div className="card" style={{ marginBottom:16 }}>
            <div className="ch"><div className="ct">✅ Ready Documents</div></div>
            <div className="cb">
              {result.documents.map(doc => (
                <div key={doc._id} style={{ background:'var(--bg)', borderRadius:9, padding:'12px 14px', marginBottom:9 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5 }}>
                    <span style={{ fontSize:16 }}>
                      {doc.fileType === 'youtube' ? '🎥' : doc.fileType === 'url' ? '🌐' : doc.fileType === 'image' ? '🖼️' : '📄'}
                    </span>
                    <div style={{ fontWeight:700, fontSize:13, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{doc.title}</div>
                  </div>
                  {doc.status === 'ready' ? (
                    <>
                      <div className="ib g" style={{ marginBottom:9, fontSize:12 }}>
                        ✅ <strong>{doc.wordCount?.toLocaleString()}</strong> words · <strong>{doc.pageCount}</strong> pages · <strong>{doc.sections?.length || 1}</strong> sections detected
                      </div>
                      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                        <button className="btn btn-p btn-sm" onClick={() => navigate(`/notebook?docId=${doc._id}`)}>📓 Generate Content</button>
                        <button className="btn btn-s btn-sm" onClick={() => navigate('/chatbot')}>🧠 Ask Questions</button>
                        <button className="btn btn-s btn-sm" onClick={() => navigate('/flashcards')}>🃏 Flashcards</button>
                      </div>
                    </>
                  ) : (
                    <div className="ib" style={{ background:'#FEF2F2', border:'1px solid rgba(225,29,72,.15)', color:'#B91C1C', fontSize:12 }}>
                      ❌ {doc.errorMessage || 'Extraction failed'}
                    </div>
                  )}
                </div>
              ))}
              {result.errors?.length > 0 && (
                <div className="ib a" style={{ marginTop:8, fontSize:12 }}>
                  ⚠️ {result.errors.map(e => `${e.file}: ${e.error}`).join(' | ')}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="card">
          <div className="ch"><div className="ct">💡 Supported Sources</div></div>
          <div className="cb">
            {[
              ['🎥','YouTube lectures, video explanations, tutorial links'],
              ['📄','Online PDFs (links directly to .pdf documents)'],
              ['🌐','Web articles, blogs, research notes, Wikipedia'],
              ['📸','Camera photos & handwritten paper snapshots'],
              ['📦','Local textbook & courseware PDF uploads'],
            ].map(([ic,t],i) => (
              <div key={i} style={{ display:'flex', gap:9, padding:'7px 0', borderBottom:i<4?'1px solid var(--bdr)':'none', fontSize:12.5 }}>
                <span style={{ fontSize:16, flexShrink:0 }}>{ic}</span>
                <span style={{ color:'var(--ink2)' }}>{t}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}