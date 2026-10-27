import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../utils/api'

export default function Upload() {
  const [tab, setTab] = useState('file') // 'file', 'drive', 'url'
  const [files, setFiles] = useState([])
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState(null)
  const [subject, setSubject] = useState('')
  const [ocrLanguage, setOcrLanguage] = useState('auto')
  
  // Google Drive state
  const [driveUrl, setDriveUrl] = useState('')
  const [driveTitle, setDriveTitle] = useState('')
  const [driveLoading, setDriveLoading] = useState(false)
  const [openedDriveTab, setOpenedDriveTab] = useState(false)
  const [detectedClipboardUrl, setDetectedClipboardUrl] = useState('')

  // URL Link state
  const [url, setUrl] = useState('')
  const [urlTitle, setUrlTitle] = useState('')
  const [urlLoading, setUrlLoading] = useState(false)

  const ref = useRef()
  const cameraRef = useRef()
  const navigate = useNavigate()

  // Detect when user returns to Notivexa tab and inspect clipboard for copied Drive links
  useEffect(() => {
    const handleWindowFocus = async () => {
      if (tab !== 'drive') return
      try {
        if (navigator.clipboard?.readText) {
          const text = await navigator.clipboard.readText()
          const trimmed = (text || '').trim()
          if (/drive\.google\.com|docs\.google\.com/i.test(trimmed) && trimmed !== driveUrl) {
            setDetectedClipboardUrl(trimmed)
          }
        }
      } catch {}
    }
    window.addEventListener('focus', handleWindowFocus)
    return () => window.removeEventListener('focus', handleWindowFocus)
  }, [tab, driveUrl])

  const handleOpenGoogleDrive = () => {
    window.open('https://drive.google.com', '_blank', 'noopener,noreferrer')
    setOpenedDriveTab(true)
    toast('Google Drive opened! In Drive, open your file, copy the link, and return here.', { icon: '🔷', duration: 5000 })
  }

  const handlePasteFromClipboard = async () => {
    try {
      if (!navigator.clipboard?.readText) {
        toast.error('Clipboard permission not supported. Please press Ctrl+V to paste.')
        return
      }
      const text = await navigator.clipboard.readText()
      const trimmed = (text || '').trim()
      if (!trimmed) {
        toast.error('Clipboard is empty! Copy a link in Google Drive first.')
        return
      }
      setDriveUrl(trimmed)
      setDetectedClipboardUrl('')
      if (/drive\.google\.com|docs\.google\.com/i.test(trimmed)) {
        toast.success('📋 Google Drive link pasted!')
      } else {
        toast('Pasted link from clipboard', { icon: '📋' })
      }
    } catch (e) {
      toast.error('Clipboard access denied. Please paste manually into the input box.')
    }
  }

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
      if (ocrLanguage && ocrLanguage !== 'auto') fd.append('language', ocrLanguage)
      setFiles(prev => prev.map(f => ({ ...f, progress: 20 })))
      const res = await api.post('/documents/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: e => {
          const pct = Math.round(e.loaded / e.total * 90)
          setFiles(prev => prev.map(f => ({ ...f, progress: pct })))
        }
      })
      setFiles(prev => prev.map(f => ({ ...f, progress: 100, done: true, error: null })))
      setResult(res.data)
      const ok = res.data.documents?.filter(d => d.status === 'ready' || d.status === 'partial' || d.wordCount > 0).length || 0
      const fail = res.data.documents?.filter(d => d.status === 'error' && !d.wordCount).length || 0
      if (ok > 0) toast.success(`✅ ${ok} File(s) successfully extracted!`)
      if (fail > 0) toast.error(`❌ ${fail} file(s) failed — see details`)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Upload failed. Check backend is running.')
      setFiles(prev => prev.map(f => ({ ...f, error: 'Upload failed' })))
    } finally { setUploading(false) }
  }

  const handleImportDrive = async () => {
    const trimmed = driveUrl.trim()
    if (!trimmed) { toast.error('Please enter a Google Drive or Google Docs link'); return }
    if (!/^https?:\/\//i.test(trimmed)) { toast.error('Link must start with http:// or https://'); return }
    if (!/drive\.google\.com|docs\.google\.com/i.test(trimmed)) {
      toast.error('Link must be from drive.google.com or docs.google.com'); return
    }
    if (isGDriveFolder) {
      toast.error('This is a Google Drive folder link. Please click on the specific file inside the folder and copy its link.'); return
    }
    if (isGDriveRoot) {
      toast.error('This is your Google Drive home page. Please open your specific document and copy its link.'); return
    }

    setDriveLoading(true)
    try {
      const res = await api.post('/documents/import-url', {
        url: trimmed,
        subject: subject.trim(),
        title: driveTitle.trim()
      })
      const doc = res.data.document
      toast.success('🎉 Google Drive resource successfully extracted!')
      setResult(prev => ({
        ...prev,
        documents: [doc, ...(prev?.documents || [])]
      }))
      setDriveUrl('')
      setDriveTitle('')
      setOpenedDriveTab(false)
      setDetectedClipboardUrl('')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to extract content from Google Drive. Ensure file sharing is set to "Anyone with the link".')
    } finally {
      setDriveLoading(false)
    }
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

  // Detect link types
  const isYouTube = /(?:youtube\.com|youtu\.be)/i.test(url)
  const isPdf = /\.pdf($|\?)/i.test(url)
  const isUrlDrive = /drive\.google\.com|docs\.google\.com/i.test(url)

  const isGDriveDoc = /docs\.google\.com\/document/i.test(driveUrl)
  const isGDriveSlides = /docs\.google\.com\/presentation/i.test(driveUrl)
  const isGDriveSheets = /docs\.google\.com\/spreadsheets/i.test(driveUrl)
  const isGDriveFile = /drive\.google\.com\/(file|open|uc)/i.test(driveUrl)
  const isGDriveFolder = /drive\.google\.com\/drive(?:\/u\/\d+)?\/folders/i.test(driveUrl)
  const isGDriveRoot = /drive\.google\.com\/drive(?:\/u\/\d+)?\/(?:my-drive|home|recent)/i.test(driveUrl)
  const isGDrive = isGDriveDoc || isGDriveSlides || isGDriveSheets || isGDriveFile || (!isGDriveFolder && !isGDriveRoot && /drive\.google\.com|docs\.google\.com/i.test(driveUrl))

  return (
    <div className="tc" style={{ alignItems:'start' }}>
      <div>
        {/* Source Switcher Tabs */}
        <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }}>
          <button 
            className={`btn ${tab === 'file' ? 'btn-p' : 'btn-s'}`}
            style={{ flex:'1 1 140px', display:'flex', justifyContent:'center', alignItems:'center', gap:6 }}
            onClick={() => setTab('file')}
          >
            📁 Upload PDF / Image
          </button>
          <button 
            className={`btn ${tab === 'drive' ? 'btn-p' : 'btn-s'}`}
            style={{ 
              flex:'1 1 140px', 
              display:'flex', 
              justifyContent:'center', 
              alignItems:'center', 
              gap:6,
              background: tab === 'drive' ? 'var(--brand)' : '#F0FDF4',
              color: tab === 'drive' ? '#fff' : '#15803D',
              borderColor: tab === 'drive' ? 'var(--brand)' : '#BBF7D0',
              fontWeight: 700
            }}
            onClick={() => setTab('drive')}
          >
            <span style={{ fontSize:16 }}>🔷</span> Google Drive
          </button>
          <button 
            className={`btn ${tab === 'url' ? 'btn-p' : 'btn-s'}`}
            style={{ flex:'1 1 140px', display:'flex', justifyContent:'center', alignItems:'center', gap:6 }}
            onClick={() => setTab('url')}
          >
            🔗 Paste Link (YouTube / Web)
          </button>
        </div>

        {tab === 'file' && (
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
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginTop:12 }}>
                <button className="btn btn-s" style={{ display:'flex', justifyContent:'center', alignItems:'center', gap:5 }} onClick={() => cameraRef.current?.click()}>📸 Take Photo</button>
                <button 
                  type="button"
                  className="btn btn-s" 
                  style={{ display:'flex', justifyContent:'center', alignItems:'center', gap:5, background:'#EFF6FF', color:'#1D4ED8', borderColor:'#BFDBFE', fontWeight:600 }}
                  onClick={() => setTab('drive')}
                >
                  🔷 Import from Google Drive
                </button>
              </div>
              <div style={{ fontSize:11.5, color:'var(--ink3)', marginTop:8, textAlign:'center' }}>
                💡 Tip: If you have Google Drive on your computer or phone, you can select your files directly using the browse area above!
              </div>

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
        )}

        {tab === 'drive' && (
          <div className="card" style={{ marginBottom:16 }}>
            <div className="ch" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8 }}>
              <div className="ct">🔷 Import from Google Drive</div>
              <button 
                type="button"
                onClick={handleOpenGoogleDrive}
                className="btn btn-sm"
                style={{ background:'#E8F0FE', color:'#1A73E8', border:'1px solid #D2E3FC', fontWeight:700, display:'flex', alignItems:'center', gap:6, cursor:'pointer' }}
              >
                🌐 Open Google Drive ↗
              </button>
            </div>
            <div className="cb">
              <div className="ib b" style={{ marginBottom:14, background:'#EFF6FF', borderColor:'#BFDBFE', color:'#1E40AF', fontSize:12.5, lineHeight:1.6 }}>
                <strong>How Google Drive Import Works:</strong>
                <div style={{ marginTop:4 }}>
                  Google Drive is an external cloud storage service. When you open a PDF or document in Google Drive, there is no third-party "Upload to Notivexa" button inside Google Drive.
                  <br/>
                  👉 <strong>To import into Notivexa:</strong> Simply copy the link of your file in Google Drive and paste it below, or download the file from Drive and drop it into the Upload tab!
                </div>
              </div>

              {/* Fast Open Google Drive Banner */}
              <div style={{
                background:'linear-gradient(135deg, #F8FAFC, #EFF6FF)',
                border:'1px solid #DBEAFE',
                borderRadius:10,
                padding:'12px 14px',
                marginBottom:16,
                display:'flex',
                alignItems:'center',
                justifyContent:'space-between',
                flexWrap:'wrap',
                gap:10
              }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ fontSize:28 }}>📂</span>
                  <div>
                    <div style={{ fontWeight:700, fontSize:13, color:'var(--ink)' }}>Need to pick a document from your Google Drive?</div>
                    <div style={{ fontSize:11.5, color:'var(--ink3)' }}>Click below to open Drive in a new tab, copy your file's link, and return here.</div>
                  </div>
                </div>
                <button 
                  type="button"
                  onClick={handleOpenGoogleDrive}
                  className="btn btn-sm"
                  style={{ background:'#1A73E8', color:'#fff', border:'none', fontWeight:700, padding:'7px 14px', borderRadius:8, cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}
                >
                  🚀 Open Google Drive ↗
                </button>
              </div>

              {/* Live Assistant Banner when Google Drive was opened in another tab */}
              {openedDriveTab && (
                <div style={{
                  background:'#FEF3C7',
                  border:'1px solid #FCD34D',
                  borderRadius:10,
                  padding:'12px 14px',
                  marginBottom:16,
                  display:'flex',
                  flexDirection:'column',
                  gap:8
                }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, fontWeight:700, color:'#92400E', fontSize:13 }}>
                    <span>🌐</span> Google Drive is open in your other tab!
                  </div>
                  <div style={{ fontSize:12, color:'#78350F', lineHeight:1.6 }}>
                    1. In Google Drive, click on your PDF or document to open it.
                    <br/>
                    2. <strong>Copy the URL</strong> from your browser address bar (<code>drive.google.com/file/d/...</code>) OR right-click the file → <strong>Share → Copy link</strong>.
                    <br/>
                    3. Click the button below to paste your copied link automatically:
                  </div>
                  <button 
                    type="button" 
                    className="btn btn-sm" 
                    style={{ alignSelf:'flex-start', background:'#D97706', color:'#fff', border:'none', padding:'7px 16px', fontWeight:700, borderRadius:7, cursor:'pointer' }}
                    onClick={handlePasteFromClipboard}
                  >
                    📋 Paste Copied Link from Clipboard
                  </button>
                </div>
              )}

              {/* Clipboard Auto-detection Banner */}
              {detectedClipboardUrl && detectedClipboardUrl !== driveUrl && (
                <div style={{
                  background:'#DCFCE7',
                  border:'1px solid #86EFAC',
                  borderRadius:9,
                  padding:'10px 14px',
                  marginBottom:14,
                  display:'flex',
                  justifyContent:'space-between',
                  alignItems:'center',
                  gap:10,
                  flexWrap:'wrap'
                }}>
                  <div style={{ minWidth:0, flex:1 }}>
                    <div style={{ fontWeight:700, fontSize:12.5, color:'#166534' }}>📋 Copied Google Drive link detected!</div>
                    <div style={{ fontSize:11.5, color:'#15803D', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{detectedClipboardUrl}</div>
                  </div>
                  <button 
                    type="button" 
                    className="btn btn-sm btn-p" 
                    style={{ background:'#16A34A', border:'none', padding:'6px 14px', cursor:'pointer' }}
                    onClick={() => {
                      setDriveUrl(detectedClipboardUrl)
                      setDetectedClipboardUrl('')
                      toast.success('✅ Link applied!')
                    }}
                  >
                    ⚡ Use this Link
                  </button>
                </div>
              )}

              <div className="fg" style={{ marginBottom:14 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                  <label className="fl" style={{ margin:0 }}>Google Drive / Google Docs Link *</label>
                  <button 
                    type="button" 
                    className="btn btn-s btn-sm" 
                    style={{ padding:'3px 10px', fontSize:11.5, display:'flex', alignItems:'center', gap:4, background:'#EEF2FF', color:'#4338CA', borderColor:'#C7D2FE', cursor:'pointer' }}
                    onClick={handlePasteFromClipboard}
                  >
                    📋 Paste from Clipboard
                  </button>
                </div>
                <input 
                  className="fi" 
                  placeholder="https://drive.google.com/file/d/... or https://docs.google.com/document/d/..."
                  value={driveUrl}
                  onChange={e => setDriveUrl(e.target.value)}
                />
                {driveUrl && (
                  <div style={{ marginTop:6, display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}>
                    {isGDriveDoc && <span style={{ background:'#DBEAFE', color:'#1D4ED8', fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:20 }}>📝 Google Doc Detected (Text auto-export)</span>}
                    {isGDriveSlides && <span style={{ background:'#FEF3C7', color:'#B45309', fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:20 }}>📊 Google Presentation / Slides Detected</span>}
                    {isGDriveSheets && <span style={{ background:'#DCFCE7', color:'#15803D', fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:20 }}>📈 Google Sheet / CSV Detected</span>}
                    {isGDriveFile && <span style={{ background:'#E0E7FF', color:'#4338CA', fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:20 }}>📄 Google Drive PDF / File Detected</span>}
                    {isGDriveFolder && <span style={{ background:'#FEE2E2', color:'#B91C1C', fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:20 }}>⚠️ Google Drive Folder Link (Please click on the specific file inside the folder and copy its link)</span>}
                    {isGDriveRoot && <span style={{ background:'#FEE2E2', color:'#B91C1C', fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:20 }}>⚠️ Google Drive Homepage Link (Please open your specific file and copy its link)</span>}
                    {!isGDrive && !isGDriveFolder && !isGDriveRoot && /^https?:\/\//i.test(driveUrl) && <span style={{ background:'#FEE2E2', color:'#B91C1C', fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:20 }}>⚠️ Please enter a drive.google.com or docs.google.com link</span>}
                  </div>
                )}
              </div>

              <div className="fg" style={{ marginBottom:14 }}>
                <label className="fl">Custom Title (optional)</label>
                <input 
                  className="fi" 
                  placeholder="Leave blank to use Drive file name" 
                  value={driveTitle} 
                  onChange={e => setDriveTitle(e.target.value)} 
                />
              </div>

              {/* Step-by-step sharing instructions & Private Files Helper */}
              <div style={{ background:'var(--bg)', borderRadius:9, padding:'12px 14px', fontSize:12, color:'var(--ink2)', marginBottom:16 }}>
                <div style={{ fontWeight:700, marginBottom:5 }}>📌 Easy 3-step import guide:</div>
                <ol style={{ margin:'4px 0 0 16px', padding:0, lineHeight:1.7 }}>
                  <li>Open your document or file in Google Drive.</li>
                  <li>Click <strong>Share</strong> (top right), set General access to <strong>"Anyone with the link"</strong>, and click <strong>Copy link</strong>.</li>
                  <li>Click <strong>Paste from Clipboard</strong> above, then click <strong>Extract & Import</strong>!</li>
                </ol>
                <div style={{ marginTop:10, paddingTop:8, borderTop:'1px dashed var(--bdr)', fontSize:11.5, color:'var(--ink3)', lineHeight:1.6 }}>
                  🔒 <strong>Private or School Account File?</strong> If your school or organization blocks public link sharing, simply open the file in Google Drive, click <strong>Download (⬇)</strong>, then drop the downloaded file directly into the <strong>Upload PDF / Image</strong> tab! It works 100% offline with full AI and OCR.
                </div>
              </div>

              <button 
                className="btn btn-p btn-lg wf" 
                onClick={handleImportDrive} 
                disabled={driveLoading || !driveUrl.trim()}
              >
                {driveLoading ? '⏳ Extracting from Google Drive...' : '⚡ Extract & Import Drive Resource'}
              </button>

              {driveLoading && (
                <div className="dots" style={{ marginTop:10, justifyContent:'center' }}>
                  <div className="dot"/><div className="dot"/><div className="dot"/>
                  <span style={{ fontSize:13, color:'var(--ink3)' }}>
                    Downloading and reading Google Drive content...
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'url' && (
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
                  <div style={{ marginTop:6, display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}>
                    {isYouTube && <span style={{ background:'#FEE2E2', color:'#B91C1C', fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:20 }}>🎥 YouTube Video Detected (Transcript extraction)</span>}
                    {isPdf && <span style={{ background:'#DBEAFE', color:'#1D4ED8', fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:20 }}>📄 Online PDF Detected (Direct parsing)</span>}
                    {isUrlDrive && <span style={{ background:'#DCFCE7', color:'#15803D', fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:20 }}>🔷 Google Drive Resource Detected</span>}
                    {!isYouTube && !isPdf && !isUrlDrive && /^https?:\/\//i.test(url) && <span style={{ background:'#EDE9FE', color:'#6D28D9', fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:20 }}>🌐 Web Article / Link Detected</span>}
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
          <div className="ch"><div className="ct">⚙️ Subject & Language</div></div>
          <div className="cb">
            <div className="fg" style={{ marginBottom: 12 }}>
              <label className="fl">Subject / Topic (optional)</label>
              <input className="fi" placeholder="e.g. Organic Chemistry, Thermodynamics, Computer Science..." value={subject} onChange={e => setSubject(e.target.value)} />
            </div>
            <div className="fg">
              <label className="fl">Document Language / OCR Override</label>
              <select className="fi" value={ocrLanguage} onChange={e => setOcrLanguage(e.target.value)}>
                <option value="auto">🌐 Auto-detect (Multi-lingual OCR)</option>
                <option value="eng">English</option>
                <option value="hin">Hindi (हिन्दी)</option>
                <option value="mar">Marathi (मराठी)</option>
                <option value="guj">Gujarati (ગુજરાતી)</option>
                <option value="ben">Bengali (বাংলা)</option>
                <option value="tam">Tamil (தமிழ்)</option>
                <option value="tel">Telugu (తెలుగు)</option>
                <option value="kan">Kannada (ಕನ್ನಡ)</option>
                <option value="urd">Urdu (اردو)</option>
                <option value="ara">Arabic (العربية)</option>
                <option value="spa">Spanish (Español)</option>
                <option value="fra">French (Français)</option>
                <option value="deu">German (Deutsch)</option>
                <option value="chi_sim">Chinese (Simplified 简体中文)</option>
                <option value="jpn">Japanese (日本語)</option>
                <option value="kor">Korean (한국어)</option>
                <option value="rus">Russian (Русский)</option>
              </select>
              <div style={{ fontSize: 11, color: 'var(--ink3)', marginTop: 4 }}>
                Supports English, Hindi, Marathi, Gujarati, Tamil, Arabic, Spanish, etc.
              </div>
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
                      {doc.fileType === 'gdrive' ? '🔷' : doc.fileType === 'youtube' ? '🎥' : doc.fileType === 'url' ? '🌐' : doc.fileType === 'image' ? '🖼️' : '📄'}
                    </span>
                    <div style={{ fontWeight:700, fontSize:13, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{doc.title}</div>
                  </div>
                  {doc.status === 'ready' || doc.status === 'partial' || doc.wordCount > 0 ? (
                    <>
                      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:8 }}>
                        <span style={{ background:'#ECFDF5', color:'#065F46', border:'1px solid #A7F3D0', padding:'2px 8px', borderRadius:10, fontSize:11, fontWeight:600 }}>
                          🌐 {doc.primaryLanguage ? doc.primaryLanguage.toUpperCase() : 'ENG'} ({doc.extractionMethod === 'ocr' ? `${doc.ocrConfidence || 95}% OCR` : 'Native Text'})
                        </span>
                        {doc.isRTL && (
                          <span style={{ background:'#FEF3C7', color:'#92400E', border:'1px solid #FDE68A', padding:'2px 8px', borderRadius:10, fontSize:11, fontWeight:600 }}>
                            RTL
                          </span>
                        )}
                      </div>
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
              ['🔷','Google Drive files, shared PDFs, Google Docs & Slides'],
              ['🎥','YouTube lectures, video explanations, tutorial links'],
              ['📄','Online PDFs (links directly to .pdf documents)'],
              ['🌐','Web articles, blogs, research notes, Wikipedia'],
              ['📸','Camera photos & handwritten paper snapshots'],
              ['📦','Local textbook & courseware PDF uploads'],
            ].map(([ic,t],i) => (
              <div key={i} style={{ display:'flex', gap:9, padding:'7px 0', borderBottom:i<5?'1px solid var(--bdr)':'none', fontSize:12.5 }}>
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
