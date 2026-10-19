import React, { useState, useEffect, Fragment } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import api from '../utils/api'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'

const TOOLS = [
  { id:'notes',       icon:'📝', label:'Study Notes',       desc:'Full notes from your PDF' },
  { id:'summary',     icon:'📋', label:'Summary',            desc:'Concise 300-word overview' },
  { id:'questions',   icon:'❓', label:'Practice Q&A',       desc:'MCQ + short + long answer' },
  { id:'paper',       icon:'📄', label:'Question Papers',    desc:'20M or 60M exam format' },
  { id:'handwritten', icon:'✍️', label:'Handwritten Notes',  desc:'Notebook-style PDF (3–4 pages)' },
  { id:'ppt',         icon:'📊', label:'Slide Deck',         desc:'10-15 presentation slides' },
  { id:'video',       icon:'🎬', label:'Video Lecture',      desc:'1-2 min script + slides + video' },
  { id:'mindmap',     icon:'🗺️', label:'Mind Map',           desc:'Visual topic structure' },
  { id:'vocabulary',  icon:'🔤', label:'Vocabulary',         desc:'Key terms with Hindi meanings' },
]

const LANGS = ['English','Hindi','Marathi','Bengali','Tamil']
const FLAG = { English:'🇬🇧', Hindi:'🇮🇳', Marathi:'🟠', Bengali:'🟡', Tamil:'🔴' }
const EP = {
  notes:'/generate/notes', summary:'/generate/summary',
  questions:'/generate/questions', paper:'/generate/paper',
  handwritten:'/generate/handwritten', ppt:'/generate/ppt',
  video:'/generate/video', mindmap:'/generate/mindmap', vocabulary:'/generate/vocabulary'
}

export const HANDWRITING_FONTS = [
  { id: 'caveat', name: 'Caveat', fontFamily: "'Caveat', cursive", size: 21, tag: 'Teacher Cursive', desc: 'Flowing natural cursive' },
  { id: 'kalam', name: 'Kalam', fontFamily: "'Kalam', cursive", size: 19, tag: 'Indian School', desc: 'School notebook handwriting' },
  { id: 'indie-flower', name: 'Indie Flower', fontFamily: "'Indie Flower', cursive", size: 18, tag: 'Bubbly Notes', desc: 'Friendly casual handwriting' },
  { id: 'architects-daughter', name: 'Architects Daughter', fontFamily: "'Architects Daughter', cursive", size: 17, tag: 'Architect Print', desc: 'Neat grid blueprint style' },
  { id: 'patrick-hand', name: 'Patrick Hand', fontFamily: "'Patrick Hand', cursive", size: 19, tag: 'Neat Print', desc: 'Clean student notebook' },
  { id: 'shadows-into-light', name: 'Shadows Into Light', fontFamily: "'Shadows Into Light', cursive", size: 20, tag: 'Delicate Cursive', desc: 'Sharp personal cursive' },
  { id: 'gloria-hallelujah', name: 'Gloria Hallelujah', fontFamily: "'Gloria Hallelujah', cursive", size: 16, tag: 'Blackboard Chalk', desc: 'Playful whiteboard notes' },
  { id: 'permanent-marker', name: 'Permanent Marker', fontFamily: "'Permanent Marker', cursive", size: 16, tag: 'Bold Marker', desc: 'Felt-tip study notes' },
  { id: 'sacramento', name: 'Sacramento', fontFamily: "'Sacramento', cursive", size: 24, tag: 'Elegant Script', desc: 'Flowing calligraphic script' },
  { id: 'courgette', name: 'Courgette', fontFamily: "'Courgette', cursive", size: 18, tag: 'Fluid Italic', desc: 'Graceful italic notes' },
  { id: 'marck-script', name: 'Marck Script', fontFamily: "'Marck Script', cursive", size: 20, tag: 'Fountain Pen', desc: 'Poetic cursive ink' },
  { id: 'nanum-pen', name: 'Nanum Pen Script', fontFamily: "'Nanum Pen Script', cursive", size: 21, tag: 'Fine Ballpen', desc: 'Thin gel-pen notes' },
  { id: 'reenie-beanie', name: 'Reenie Beanie', fontFamily: "'Reenie Beanie', cursive", size: 24, tag: 'Fast Lecture', desc: 'Quick student lecture scrawl' },
  { id: 'covered-by-your-grace', name: 'Covered By Your Grace', fontFamily: "'Covered By Your Grace', cursive", size: 19, tag: 'Casual Pencil', desc: 'Tall relaxed pencil print' },
  { id: 'rock-salt', name: 'Rock Salt', fontFamily: "'Rock Salt', cursive", size: 15, tag: 'Expressive Pen', desc: 'Bold felt-marker script' }
];

export const PAPER_STYLES = [
  { id: 'yellow', name: '📒 Yellow Ruled', className: '', bg: '#FEFDE8' },
  { id: 'ruled-white', name: '📄 White Ruled', className: 'ruled-white', bg: '#FFFFFF' },
  { id: 'grid-paper', name: '📐 Graph / Grid', className: 'grid-paper', bg: '#F9FAFB' },
  { id: 'plain-paper', name: '📜 Cream Plain', className: 'plain-paper', bg: '#FFFDF0' },
  { id: 'dark-chalk', name: '⬛ Dark Board', className: 'dark-chalk', bg: '#1E293B' }
];

export const PPT_THEMES_LIST = [
  { id: 'indigo', name: '🌌 Academic Indigo', bg: '#0F172A', card: '#1E293B', header: '#4F46E5', text: '#E2E8F0', title: '#FFFFFF', accent: '#818CF8', border: '#312E81' },
  { id: 'light', name: '📄 Clean Light', bg: '#F8FAFC', card: '#FFFFFF', header: '#2563EB', text: '#334155', title: '#0F172A', accent: '#2563EB', border: '#CBD5E1' },
  { id: 'emerald', name: '🌿 Emerald Forest', bg: '#064E3B', card: '#065F46', header: '#059669', text: '#D1FAE5', title: '#FFFFFF', accent: '#34D399', border: '#047857' },
  { id: 'sunset', name: '🌅 Sunset Crimson', bg: '#4C0519', card: '#881337', header: '#E11D48', text: '#FFE4E6', title: '#FFFFFF', accent: '#FB7185', border: '#BE123C' },
  { id: 'cyber', name: '⚡ Cyber Purple', bg: '#180828', card: '#2E1065', header: '#9333EA', text: '#F3E8FF', title: '#FFFFFF', accent: '#C084FC', border: '#6B21A8' }
];

// Renders a handwritten-style page
function HandwrittenPage({ content, pageNum, total, fontId = 'caveat', paperStyle = 'yellow', sizeMod = 0 }) {
  const fontObj = HANDWRITING_FONTS.find(f => f.id === fontId) || HANDWRITING_FONTS[0];
  const paperObj = PAPER_STYLES.find(p => p.id === paperStyle) || PAPER_STYLES[0];
  const currentSize = Math.max(12, fontObj.size + sizeMod);

  return (
    <div style={{ marginBottom:20 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
        <span style={{ fontSize:11, fontWeight:700, color:'var(--ink3)', textTransform:'uppercase', letterSpacing:.5 }}>
          Page {pageNum} of {total} · Font: {fontObj.name} ({fontObj.tag})
        </span>
        <button className="btn btn-g btn-sm" onClick={()=>{ navigator.clipboard?.writeText(content); toast.success('Page copied!') }}>📋 Copy Page</button>
      </div>
      <div 
        className={`hw ${paperObj.className}`} 
        style={{ 
          minHeight:320,
          fontFamily: fontObj.fontFamily,
          fontSize: `${currentSize}px`
        }}
      >
        <ReactMarkdown 
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
          components={{
            img: ({ node, ...props }) => (
              <figure style={{ margin: '16px auto', textAlign: 'center' }}>
                <img {...props} style={{ maxWidth: '95%', maxHeight: '420px', objectFit: 'contain', height: 'auto', borderRadius: 8, border: '1.5px solid rgba(0,0,0,0.15)', boxShadow: '0 4px 14px rgba(0,0,0,0.08)', background: '#fff' }} />
                {props.alt && <figcaption style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: 6, fontStyle: 'italic', fontFamily: 'Inter, sans-serif' }}>{props.alt}</figcaption>}
              </figure>
            )
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  )
}

// Renders an authentic Autonomous College Question Paper matching university standards
function AutonomousExamPaper({ paper }) {
  if (!paper) return <div style={{ padding: 20, textAlign: 'center' }}>No question paper data available.</div>;

  const sections = Array.isArray(paper.sections) ? paper.sections : [];

  return (
    <div
      className="exam-paper-container"
      style={{
        background: '#FFFFFF',
        color: '#000000',
        padding: 'clamp(14px, 3.5vw, 36px)',
        borderRadius: 4,
        boxShadow: '0 4px 25px rgba(0,0,0,0.12)',
        border: '1.5px solid #000000',
        fontFamily: '"Times New Roman", Times, Georgia, serif',
        maxWidth: 820,
        width: '100%',
        margin: '0 auto',
        lineHeight: 1.35,
        boxSizing: 'border-box'
      }}
    >
      {/* 1. Centered 5-Line Autonomous College Header */}
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 500, letterSpacing: 0.2 }}>
          {paper.institution || "Mahatma Education Society's"}
        </div>
        <div style={{ fontSize: 15.5, fontWeight: 700, margin: '2px 0' }}>
          {paper.college || "Pillai HOC College of Engineering and Technology, Rasayani."}
        </div>
        <div style={{ fontSize: 13, fontWeight: 700 }}>
          {paper.status || "(Autonomous)"}
        </div>
        <div style={{ fontSize: 13, fontWeight: 700 }}>
          {paper.department || "Department of Computer Application"}
        </div>
        <div style={{ fontSize: 13, fontWeight: 700 }}>
          {paper.examType || "Internal Assessment- I OSAY 2026-2027"}
        </div>
      </div>

      {/* 2. Metadata Two Rows */}
      <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
          <span>Subject: {paper.subject || 'Big Data Analytics and Visualization'}</span>
          <span>Class: {paper.class || 'SY-MCA'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
          <span>Date: {paper.date || '22/8/2026'}</span>
          <span style={{ textAlign: 'center' }}>Time: {paper.time || '10.30am - 11.30am'}</span>
          <span>Duration: {paper.duration || '1Hr'} &nbsp; Marks: {paper.marks || '20'}</span>
        </div>
      </div>

      {/* 3. Boxed Grid Table */}
      <div className="exam-table-wrapper" style={{ width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch', margin: '10px 0' }}>
        <table
          className="exam-table"
          style={{
            minWidth: 540,
            width: '100%',
            borderCollapse: 'collapse',
            border: '1.5px solid #000',
            fontSize: 12.5
          }}
        >
        <thead>
          {/* Top Note Row */}
          <tr>
            <td
              colSpan={3}
              style={{
                border: '1px solid #000',
                padding: '6px 10px',
                fontWeight: 700,
                textAlign: 'left'
              }}
            >
              {paper.note || 'Note: Assume suitable data wherever necessary.'}
            </td>
            <th
              style={{
                border: '1px solid #000',
                padding: '4px 6px',
                textAlign: 'center',
                width: 62,
                fontSize: 11,
                fontWeight: 700
              }}
            >
              Course<br />Outcome
            </th>
            <th
              style={{
                border: '1px solid #000',
                padding: '4px 6px',
                textAlign: 'center',
                width: 62,
                fontSize: 11,
                fontWeight: 700
              }}
            >
              Bloom's<br />Level
            </th>
          </tr>
        </thead>
        <tbody>
          {sections.map((sec, si) => (
            <Fragment key={si}>
              {/* Section Header Row */}
              <tr style={{ background: '#FAF9F6' }}>
                <td
                  style={{
                    border: '1px solid #000',
                    padding: '6px 6px',
                    textAlign: 'center',
                    fontWeight: 700,
                    width: 44
                  }}
                >
                  [ {sec.qNum || si + 1} ]
                </td>
                <td
                  colSpan={2}
                  style={{
                    border: '1px solid #000',
                    padding: '6px 10px',
                    fontWeight: 700,
                    textAlign: 'left'
                  }}
                >
                  {sec.instruction || 'Attempt Any Five out of Six'}
                </td>
                <td
                  style={{
                    border: '1px solid #000',
                    padding: '6px 6px',
                    textAlign: 'center',
                    fontWeight: 700,
                    fontSize: 11.5
                  }}
                >
                  CO
                </td>
                <td
                  style={{
                    border: '1px solid #000',
                    padding: '6px 6px',
                    textAlign: 'center',
                    fontWeight: 700,
                    fontSize: 11.5
                  }}
                >
                  BL
                </td>
              </tr>

              {/* Question Sub-rows */}
              {(sec.questions || []).map((q, qi) => (
                <tr key={qi}>
                  <td
                    style={{
                      border: '1px solid #000',
                      padding: '7px 6px',
                      textAlign: 'center',
                      fontWeight: 700,
                      width: 44,
                      verticalAlign: 'top'
                    }}
                  >
                    {q.id || `${String.fromCharCode(65 + qi)}.`}
                  </td>
                  <td
                    style={{
                      border: '1px solid #000',
                      padding: '7px 10px',
                      textAlign: 'left',
                      verticalAlign: 'top',
                      lineHeight: 1.45
                    }}
                  >
                    {q.text || q.question}
                  </td>
                  <td
                    style={{
                      border: '1px solid #000',
                      padding: '7px 6px',
                      textAlign: 'center',
                      fontWeight: 700,
                      width: 52,
                      verticalAlign: 'top',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {q.marks || '[ 02 ]'}
                  </td>
                  <td
                    style={{
                      border: '1px solid #000',
                      padding: '7px 6px',
                      textAlign: 'center',
                      width: 62,
                      verticalAlign: 'top'
                    }}
                  >
                    {q.co || 'CO1'}
                  </td>
                  <td
                    style={{
                      border: '1px solid #000',
                      padding: '7px 6px',
                      textAlign: 'center',
                      width: 62,
                      verticalAlign: 'top'
                    }}
                  >
                    {q.bl || 'L2'}
                  </td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);
}

export default function Notebook() {
  const [sp] = useSearchParams()
  const navigate = useNavigate()
  const [docs, setDocs] = useState([])
  const [docId, setDocId] = useState(sp.get('docId') || '')
  const [doc, setDoc] = useState(null)
  const [section, setSection] = useState('')
  const [tool, setTool] = useState('notes')
  const [lang, setLang] = useState('English')
  const [marks, setMarks] = useState(20)
  const [paperType, setPaperType] = useState('20_MARKS') // 20_MARKS or 60_MARKS
  const [institution, setInstitution] = useState("Mahatma Education Society's")
  const [collegeName, setCollegeName] = useState("Pillai HOC College of Engineering and Technology, Rasayani.")
  const [departmentName, setDepartmentName] = useState("Department of Computer Application")
  const [examTypeName, setExamTypeName] = useState("Internal Assessment- I OSAY 2026-2027")
  const [className, setClassName] = useState("SY-MCA")
  const [showAdvancedPaperSettings, setShowAdvancedPaperSettings] = useState(false)
  const [sets, setSets] = useState(3)
  const [count, setCount] = useState(10)
  const [hwPage, setHwPage] = useState(0) // current handwritten page index
  const [hwFont, setHwFont] = useState('caveat') // one of the 15 handwriting fonts
  const [hwPaper, setHwPaper] = useState('yellow') // paper style
  const [hwSizeMod, setHwSizeMod] = useState(0) // size adjustment
  const [loading, setLoading] = useState(false)
  const [hwDownloading, setHwDownloading] = useState(false)
  const [result, setResult] = useState(null)
  const [activeSet, setActiveSet] = useState(0)

  // Editable content & export states
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const [editSlides, setEditSlides] = useState([])
  const [editPaperData, setEditPaperData] = useState(null)
  const [paperEditMode, setPaperEditMode] = useState('visual') // 'visual' | 'json'
  const [pptTheme, setPptTheme] = useState('indigo')
  const [exportingWord, setExportingWord] = useState(false)
  const [exportingPptx, setExportingPptx] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)

  useEffect(() => {
    api.get('/documents?status=ready').then(r => setDocs(r.data.documents || [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (docId) api.get('/documents/'+docId).then(r => setDoc(r.data.document)).catch(() => setDoc(null))
    else setDoc(null)
  }, [docId])

  const generate = async () => {
    if (!docId) { toast.error('Select a document first'); return }
    setLoading(true); setResult(null)
    try {
      const payload = { documentId: docId, language: lang }
      if (section !== '') payload.sectionIndex = parseInt(section)
      if (tool === 'paper') {
        payload.totalMarks = paperType === '20_MARKS' ? 20 : 60
        payload.paperType = paperType
        payload.timeHours = paperType === '20_MARKS' ? 1 : 2
        payload.institution = institution || "Mahatma Education Society's"
        payload.college = collegeName || "Pillai HOC College of Engineering and Technology, Rasayani."
        payload.department = departmentName || "Department of Computer Application"
        payload.examType = examTypeName || (paperType === '20_MARKS' ? "Internal Assessment- I OSAY 2026-2027" : "End Semester Examination")
        payload.className = className || "SY-MCA"
        payload.sets = sets
      }
      if (tool === 'handwritten') {
        payload.font = hwFont
        payload.style = hwPaper
      }
      if (tool === 'flashcards') payload.count = count
      const res = await api.post(EP[tool], payload)
      setResult({ tool, data: res.data })
      setActiveSet(0); setHwPage(0)
      setIsEditing(false)
      const rawText = res.data.content || res.data.notes || res.data.summary || res.data.questions || res.data.paperContent || ''
      setEditText(rawText)
      if (res.data.pptData?.slides) {
        setEditSlides(res.data.pptData.slides)
      } else {
        setEditSlides([])
      }
      if (res.data.sets && res.data.sets.length > 0) {
        const s0 = res.data.sets[0]
        setEditPaperData(s0.structured || null)
      } else {
        setEditPaperData(null)
      }
      if (tool === 'paper') toast.success('✅ Question paper ready!')
      else if (res.data.downloadUrl) toast.success('✅ '+TOOLS.find(t=>t.id===tool)?.label+' ready!')
      else toast.success('✅ Generated from "'+doc?.title+'"!')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Generation failed. Try again.')
    } finally { setLoading(false) }
  }

  const triggerDownload = (url, name) => {
    const link = document.createElement('a')
    link.href = url
    link.download = name || 'document'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const downloadDocx = async (contentToExport, defaultTitle) => {
    const text = (contentToExport !== undefined ? contentToExport : editText) || ''
    if (!text.trim()) { toast.error('No content to export.'); return }
    setExportingWord(true)
    try {
      const res = await api.post('/generate/export-docx', {
        content: text,
        title: doc?.title || defaultTitle || 'Academic Notes',
        subject: doc?.subject || doc?.title || 'General'
      })
      if (res.data.downloadUrl) {
        triggerDownload(res.data.downloadUrl, res.data.fileName || `${doc?.title || 'notes'}.docx`)
        toast.success('✅ Word (.docx) downloaded!')
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Word export failed.')
    } finally { setExportingWord(false) }
  }

  const downloadPptx = async (slidesToExport, defaultTitle) => {
    const slides = (slidesToExport && slidesToExport.length > 0 ? slidesToExport : editSlides) || []
    if (!slides.length) { toast.error('No slides to export.'); return }
    setExportingPptx(true)
    try {
      const res = await api.post('/generate/export-pptx', {
        slides,
        title: doc?.title || defaultTitle || 'Presentation',
        subject: doc?.subject || doc?.title || 'Academic Lecture',
        theme: pptTheme
      })
      if (res.data.downloadUrl) {
        triggerDownload(res.data.downloadUrl, res.data.fileName || `${doc?.title || 'presentation'}.pptx`)
        toast.success('✅ PowerPoint (.pptx) downloaded!')
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'PowerPoint export failed.')
    } finally { setExportingPptx(false) }
  }

  const downloadPdf = async (contentToExport, type = 'notes', defaultTitle) => {
    setExportingPdf(true)
    try {
      const res = await api.post('/generate/export-pdf', {
        content: contentToExport !== undefined ? contentToExport : (type === 'ppt' ? editSlides : editText),
        type,
        title: doc?.title || defaultTitle || 'Document',
        subject: doc?.subject || doc?.title || 'General',
        theme: pptTheme,
        font: hwFont,
        style: hwPaper,
        totalMarks: paperType === '20_MARKS' ? 20 : 60,
        timeHours: paperType === '20_MARKS' ? 1 : 2,
        documentId: doc?._id || doc?.id || docId,
        docId: doc?._id || doc?.id || docId
      })
      if (res.data.downloadUrl) {
        triggerDownload(res.data.downloadUrl, res.data.fileName || `${doc?.title || 'document'}.pdf`)
        toast.success('✅ PDF downloaded!')
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'PDF export failed.')
    } finally { setExportingPdf(false) }
  }

  const renderHandwritten = (data) => {
    const currentText = editText || data.content || data.notes || ''
    const pages = []
    if (currentText) {
      // Split intelligently: preserve markdown blocks (like images and paragraphs)
      const paragraphs = currentText.split(/\n\n+/);
      let curPage = '';
      const targetCharCount = 750;
      for (const p of paragraphs) {
        if (!curPage) {
          curPage = p;
        } else if (curPage.length + p.length < targetCharCount) {
          curPage += '\n\n' + p;
        } else {
          pages.push(curPage.trim());
          curPage = p;
        }
      }
      if (curPage.trim()) pages.push(curPage.trim());
    } else if (data.pages?.length) {
      data.pages.forEach(p => pages.push(p))
    }
    const safePages = pages.slice(0, 6)
    const total = safePages.length || 1

    return (
      <div>
        {/* Interactive Handwriting Style Toolbar */}
        <div style={{ background:'var(--card)', border:'1.5px solid var(--bdr)', borderRadius:12, padding:'12px 16px', marginBottom:14 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:12 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
              <span style={{ fontSize:12, fontWeight:700, color:'var(--ink)' }}>✍️ Handwriting Font:</span>
              <select 
                className="fi" 
                style={{ width:'auto', minWidth:210, padding:'6px 12px', fontSize:13, fontWeight:600 }}
                value={hwFont} 
                onChange={e => setHwFont(e.target.value)}
              >
                {HANDWRITING_FONTS.map(f => (
                  <option key={f.id} value={f.id}>
                    {f.name} — {f.tag}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ fontSize:12, fontWeight:600, color:'var(--ink2)' }}>📄 Paper:</span>
                <select 
                  className="fi" 
                  style={{ width:'auto', padding:'5px 10px', fontSize:12 }}
                  value={hwPaper} 
                  onChange={e => setHwPaper(e.target.value)}
                >
                  {PAPER_STYLES.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                <span style={{ fontSize:11, color:'var(--ink3)' }}>Size:</span>
                <button className="btn btn-g btn-sm" style={{ padding:'3px 8px' }} onClick={() => setHwSizeMod(s => Math.max(-4, s - 1))}>A-</button>
                <button className="btn btn-g btn-sm" style={{ padding:'3px 8px' }} onClick={() => setHwSizeMod(0)}>Reset</button>
                <button className="btn btn-g btn-sm" style={{ padding:'3px 8px' }} onClick={() => setHwSizeMod(s => Math.min(6, s + 1))}>A+</button>
              </div>
            </div>
          </div>

          {/* Quick pills for popular fonts */}
          <div style={{ display:'flex', gap:6, marginTop:10, flexWrap:'wrap', alignItems:'center', borderTop:'1px solid var(--bdr)', paddingTop:8 }}>
            <span style={{ fontSize:11, color:'var(--ink3)', marginRight:4 }}>Quick Select:</span>
            {['kalam','caveat','indie-flower','patrick-hand','architects-daughter','shadows-into-light','permanent-marker','sacramento'].map(fId => {
              const fontObj = HANDWRITING_FONTS.find(f => f.id === fId)
              if (!fontObj) return null
              const isSelected = hwFont === fontObj.id
              return (
                <button 
                  key={fId}
                  className="btn btn-sm"
                  style={{
                    padding:'2px 9px',
                    fontSize:11.5,
                    background: isSelected ? 'var(--brand)' : 'var(--bg2)',
                    color: isSelected ? '#fff' : 'var(--ink2)',
                    border: isSelected ? '1px solid var(--brand)' : '1px solid var(--bdr)',
                    fontFamily: fontObj.fontFamily
                  }}
                  onClick={() => setHwFont(fontObj.id)}
                >
                  {fontObj.name}
                </button>
              )
            })}
          </div>
        </div>

        {/* Action Toolbar: Edit, Download PDF, Download Word, Copy */}
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14, flexWrap:'wrap' }}>
          <button
            className="btn btn-sm"
            style={{
              background: isEditing ? 'var(--grn)' : 'var(--brand)',
              color: '#fff',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5
            }}
            onClick={() => {
              if (!isEditing) {
                setEditText(currentText)
                setIsEditing(true)
              } else {
                data.content = editText
                data.notes = editText
                setIsEditing(false)
                setHwPage(0)
                toast.success('✅ Notes updated and re-rendered!')
              }
            }}
          >
            {isEditing ? '💾 Save & Re-render' : '✏️ Edit Notes Content'}
          </button>

          {isEditing && (
            <button
              className="btn btn-s btn-sm"
              onClick={() => {
                setEditText(data.content || data.notes || '')
                setIsEditing(false)
              }}
            >
              Cancel
            </button>
          )}

          <button
            className="btn btn-p btn-sm"
            onClick={() => downloadPdf(currentText, 'handwritten', doc?.title)}
            disabled={exportingPdf}
            style={{ display:'inline-flex', alignItems:'center', gap:6 }}
          >
            {exportingPdf ? '⏳ Preparing PDF…' : '⬇️ Download PDF'}
          </button>

          <button
            className="btn btn-s btn-sm"
            style={{ background:'#2B579A', color:'#fff', border:'none', display:'inline-flex', alignItems:'center', gap:6 }}
            onClick={() => downloadDocx(currentText, doc?.title)}
            disabled={exportingWord}
          >
            {exportingWord ? '⏳ Exporting…' : '📄 Download Word (.docx)'}
          </button>

          <button
            className="btn btn-s btn-sm"
            onClick={() => { navigator.clipboard?.writeText(currentText); toast.success('Notes copied!') }}
          >
            📋 Copy Notes
          </button>

          <span style={{ fontSize:11, color:'var(--ink3)' }}>
            Font: <strong style={{ color:'var(--brand)' }}>{HANDWRITING_FONTS.find(f => f.id === hwFont)?.name || hwFont}</strong>
          </span>
        </div>

        {isEditing ? (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 6 }}>
              ✏️ <strong>Live Note Editor:</strong> You can edit Title, Subtitle, Definition, Process Flow Diagram, Explanation, or Examples below. Click <strong>Save &amp; Re-render</strong> to see changes in the handwritten fonts immediately!
            </div>
            <textarea
              className="fi"
              style={{
                width: '100%',
                minHeight: 400,
                fontFamily: 'Consolas, Monaco, monospace',
                fontSize: 13,
                lineHeight: 1.6,
                padding: 14,
                background: 'var(--bg)',
                color: 'var(--ink)',
                border: '1.5px solid var(--brand)',
                borderRadius: 10
              }}
              value={editText}
              onChange={e => setEditText(e.target.value)}
            />
          </div>
        ) : (
          <>
            {safePages.length > 1 && (
              <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }}>
                {safePages.map((_,i) => (
                  <div key={i} className={'lp'+(hwPage===i?' on':'')} onClick={()=>setHwPage(i)}>
                    📄 Page {i+1}
                  </div>
                ))}
              </div>
            )}
            {safePages.length > 0
              ? <HandwrittenPage content={safePages[hwPage] || safePages[0]} pageNum={hwPage+1} total={total} fontId={hwFont} paperStyle={hwPaper} sizeMod={hwSizeMod}/>
              : <div className="hw" style={{ minHeight:320 }}>No content generated. Try again.</div>}
            {safePages.length > 1 && (
              <div style={{ display:'flex', gap:8, justifyContent:'center', marginTop:8 }}>
                <button className="btn btn-g btn-sm" disabled={hwPage===0} onClick={()=>setHwPage(p=>p-1)}>← Prev Page</button>
                <button className="btn btn-g btn-sm" disabled={hwPage===safePages.length-1} onClick={()=>setHwPage(p=>p+1)}>Next Page →</button>
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  const renderPaper = (data) => {
    const sets_data = data?.sets || []
    const curSet = sets_data[activeSet] || sets_data[0] || null

    const getActivePaperObj = () => {
      if (editPaperData && isEditing) return editPaperData
      if (curSet?.structured && typeof curSet.structured === 'object') return curSet.structured
      const raw = curSet?.content || data.paperContent || data.content || ''
      if (typeof raw === 'object' && raw !== null && raw.sections) return raw
      try {
        const parsed = JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim())
        if (parsed && Array.isArray(parsed.sections)) return parsed
      } catch(e) {}
      return {
        institution: institution || "Mahatma Education Society's",
        college: collegeName || "Pillai HOC College of Engineering and Technology, Rasayani.",
        status: "(Autonomous)",
        department: departmentName || "Department of Computer Application",
        examType: examTypeName || (paperType === '20_MARKS' ? "Internal Assessment- I OSAY 2026-2027" : "End Semester Examination"),
        subject: doc?.subject || doc?.title || "Big Data Analytics and Visualization",
        class: className || "SY-MCA",
        date: "22/8/2026",
        time: paperType === '20_MARKS' ? "10.30am - 11.30am" : "10.30am - 12.30pm",
        duration: paperType === '20_MARKS' ? "1Hr" : "2Hr",
        marks: paperType === '20_MARKS' ? "20" : "60",
        note: "Note: Assume suitable data wherever necessary.",
        sections: [
          {
            qNum: "1",
            instruction: "Attempt Any Five out of Six",
            questions: [
              { id: "A.", text: "Explain advantages of NoSQL(any 4).", marks: "[ 02 ]", co: "CO3", bl: "L2" },
              { id: "B.", text: "What is Rack Awareness in Hadoop HDFS?", marks: "[ 02 ]", co: "CO1", bl: "L1" },
              { id: "C.", text: "Illustrate Partitioner and Combiners MapReduce process.", marks: "[ 02 ]", co: "CO2", bl: "L2" },
              { id: "D.", text: "Elaborate application workflow in Hadoop YARN.", marks: "[ 02 ]", co: "CO1", bl: "L6" },
              { id: "E.", text: "Define Big Data and Explain Big Data characteristics.", marks: "[ 02 ]", co: "CO1", bl: "L2" },
              { id: "F.", text: "Explain Master-Slave Architecture with a suitable diagram.", marks: "[ 02 ]", co: "CO3", bl: "L2" }
            ]
          },
          {
            qNum: "2",
            instruction: "Attempt Any One",
            questions: [
              { id: "A.", text: "Discuss the architecture and components of the Hadoop Ecosystem with a suitable diagram.", marks: "[ 05 ]", co: "CO1", bl: "L2" },
              { id: "B.", text: "What are the different types of NoSQL datastores? Explain each one in short.", marks: "[ 05 ]", co: "CO3", bl: "L2" }
            ]
          },
          {
            qNum: "3",
            instruction: "Attempt Any One",
            questions: [
              { id: "A.", text: "Discuss the structure and working of HBase Architecture with a suitable diagram.", marks: "[ 05 ]", co: "CO3", bl: "L2" },
              { id: "B.", text: "Explain Computing Selection and Projection by Map Reduce algorithm with suitable example.", marks: "[ 05 ]", co: "CO2", bl: "L2" }
            ]
          }
        ]
      }
    }

    const currentPaper = getActivePaperObj()
    const jsonStringContent = JSON.stringify(currentPaper, null, 2)

    return (
      <div>
        <div className="ib g" style={{ marginBottom:14, fontSize:12 }}>
          ✅ {data.message || 'Autonomous Question Paper ready!'}
        </div>

        {/* Set Switcher Tabs */}
        {sets_data.length > 1 && (
          <div className="tbr" style={{ marginBottom:16 }}>
            {sets_data.map((s,i) => (
              <div 
                key={i} 
                className={'tab'+(activeSet===i?' on':'')} 
                onClick={() => {
                  setActiveSet(i);
                  setIsEditing(false);
                  const st = sets_data[i]?.structured || null;
                  setEditPaperData(st);
                  setEditText(sets_data[i]?.content || '');
                }}
              >
                Set {s.setNumber||i+1}
              </div>
            ))}
          </div>
        )}

        {/* Toolbar: Edit, Cancel, Download PDF, Download Word, Copy */}
        <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
          <button
            className="btn btn-sm"
            style={{
              background: isEditing ? 'var(--grn)' : 'var(--brand)',
              color: '#fff',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5
            }}
            onClick={() => {
              if (!isEditing) {
                const fresh = JSON.parse(JSON.stringify(currentPaper))
                setEditPaperData(fresh)
                setEditText(JSON.stringify(fresh, null, 2))
                setIsEditing(true)
              } else {
                let toSave = editPaperData
                if (paperEditMode === 'json') {
                  try {
                    toSave = JSON.parse(editText)
                  } catch (e) {
                    toast.error('Invalid JSON: ' + e.message)
                    return
                  }
                }
                if (curSet) {
                  curSet.structured = toSave
                  curSet.content = JSON.stringify(toSave, null, 2)
                }
                data.content = JSON.stringify(toSave, null, 2)
                setEditPaperData(toSave)
                setIsEditing(false)
                toast.success('✅ Question paper updated and re-rendered!')
              }
            }}
          >
            {isEditing ? '💾 Save & Re-render Paper' : '✏️ Edit Question Paper'}
          </button>

          {isEditing && (
            <>
              <button
                className="btn btn-s btn-sm"
                onClick={() => {
                  setEditPaperData(curSet?.structured || null)
                  setIsEditing(false)
                }}
              >
                Cancel
              </button>

              <button
                className="btn btn-s btn-sm"
                style={{ fontSize: 11 }}
                onClick={() => {
                  if (paperEditMode === 'visual') {
                    setEditText(JSON.stringify(editPaperData, null, 2))
                    setPaperEditMode('json')
                  } else {
                    try {
                      const p = JSON.parse(editText)
                      setEditPaperData(p)
                      setPaperEditMode('visual')
                    } catch(e) {
                      toast.error('Cannot switch to visual: Invalid JSON syntax.')
                    }
                  }
                }}
              >
                {paperEditMode === 'visual' ? '🛠️ Switch to JSON Code' : '📝 Switch to Visual Form'}
              </button>
            </>
          )}

          {/* Download PDF */}
          <button
            className="btn btn-p btn-sm"
            onClick={() => downloadPdf(jsonStringContent, 'paper', `Question Paper Set ${curSet?.setNumber || activeSet + 1}`)}
            disabled={exportingPdf}
            style={{ display:'inline-flex', alignItems:'center', gap:6 }}
          >
            {exportingPdf ? '⏳ Generating PDF…' : `⬇️ Download PDF (Set ${curSet?.setNumber || activeSet + 1})`}
          </button>

          {/* Download Word (.docx) */}
          <button
            className="btn btn-s btn-sm"
            style={{ background:'#2B579A', color:'#fff', border:'none', display:'inline-flex', alignItems:'center', gap:6 }}
            onClick={() => downloadDocx(jsonStringContent, `Question Paper Set ${curSet?.setNumber || activeSet + 1}`)}
            disabled={exportingWord}
          >
            {exportingWord ? '⏳ Exporting…' : '📄 Download Word (.docx)'}
          </button>

          <button 
            className="btn btn-s btn-sm" 
            onClick={() => { navigator.clipboard?.writeText(jsonStringContent); toast.success('Question paper copied!') }}
          >
            📋 Copy Paper
          </button>
        </div>

        {/* Edit Mode View */}
        {isEditing ? (
          paperEditMode === 'visual' && editPaperData ? (
            <div style={{ background:'var(--card)', border:'1.5px solid var(--bdr)', borderRadius:12, padding:16, marginBottom:16 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--brand)', marginBottom:12 }}>
                🏛️ Institutional &amp; Exam Header Settings
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:10, marginBottom:14 }}>
                <div>
                  <label style={{ fontSize:11, fontWeight:700, color:'var(--ink3)' }}>Society / Trust Name</label>
                  <input className="fi" style={{ fontSize:12 }} value={editPaperData.institution||''} onChange={e=>setEditPaperData({...editPaperData, institution:e.target.value})}/>
                </div>
                <div>
                  <label style={{ fontSize:11, fontWeight:700, color:'var(--ink3)' }}>College Name</label>
                  <input className="fi" style={{ fontSize:12 }} value={editPaperData.college||''} onChange={e=>setEditPaperData({...editPaperData, college:e.target.value})}/>
                </div>
                <div>
                  <label style={{ fontSize:11, fontWeight:700, color:'var(--ink3)' }}>Autonomous Status Tag</label>
                  <input className="fi" style={{ fontSize:12 }} value={editPaperData.status||''} onChange={e=>setEditPaperData({...editPaperData, status:e.target.value})}/>
                </div>
                <div>
                  <label style={{ fontSize:11, fontWeight:700, color:'var(--ink3)' }}>Department</label>
                  <input className="fi" style={{ fontSize:12 }} value={editPaperData.department||''} onChange={e=>setEditPaperData({...editPaperData, department:e.target.value})}/>
                </div>
                <div>
                  <label style={{ fontSize:11, fontWeight:700, color:'var(--ink3)' }}>Examination Title</label>
                  <input className="fi" style={{ fontSize:12 }} value={editPaperData.examType||''} onChange={e=>setEditPaperData({...editPaperData, examType:e.target.value})}/>
                </div>
                <div>
                  <label style={{ fontSize:11, fontWeight:700, color:'var(--ink3)' }}>Class / Branch</label>
                  <input className="fi" style={{ fontSize:12 }} value={editPaperData.class||''} onChange={e=>setEditPaperData({...editPaperData, class:e.target.value})}/>
                </div>
                <div>
                  <label style={{ fontSize:11, fontWeight:700, color:'var(--ink3)' }}>Subject</label>
                  <input className="fi" style={{ fontSize:12 }} value={editPaperData.subject||''} onChange={e=>setEditPaperData({...editPaperData, subject:e.target.value})}/>
                </div>
                <div>
                  <label style={{ fontSize:11, fontWeight:700, color:'var(--ink3)' }}>Date</label>
                  <input className="fi" style={{ fontSize:12 }} value={editPaperData.date||''} onChange={e=>setEditPaperData({...editPaperData, date:e.target.value})}/>
                </div>
                <div>
                  <label style={{ fontSize:11, fontWeight:700, color:'var(--ink3)' }}>Time</label>
                  <input className="fi" style={{ fontSize:12 }} value={editPaperData.time||''} onChange={e=>setEditPaperData({...editPaperData, time:e.target.value})}/>
                </div>
                <div>
                  <label style={{ fontSize:11, fontWeight:700, color:'var(--ink3)' }}>Duration</label>
                  <input className="fi" style={{ fontSize:12 }} value={editPaperData.duration||''} onChange={e=>setEditPaperData({...editPaperData, duration:e.target.value})}/>
                </div>
                <div>
                  <label style={{ fontSize:11, fontWeight:700, color:'var(--ink3)' }}>Total Marks</label>
                  <input className="fi" style={{ fontSize:12 }} value={editPaperData.marks||''} onChange={e=>setEditPaperData({...editPaperData, marks:e.target.value})}/>
                </div>
              </div>

              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'var(--ink3)' }}>Exam Note / Instructions</label>
                <input className="fi" style={{ fontSize:12, marginBottom:14 }} value={editPaperData.note||''} onChange={e=>setEditPaperData({...editPaperData, note:e.target.value})}/>
              </div>

              <div style={{ fontSize:13, fontWeight:700, color:'var(--brand)', margin:'14px 0 10px' }}>
                📋 Sections &amp; Questions Editor
              </div>

              {(editPaperData.sections || []).map((sec, si) => (
                <div key={si} style={{ border:'1px solid var(--bdr)', borderRadius:10, padding:12, marginBottom:12, background:'var(--bg)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, marginBottom:8 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6, flex:1 }}>
                      <span style={{ fontWeight:700, fontSize:13 }}>[ {sec.qNum || si+1} ]</span>
                      <input 
                        className="fi" 
                        style={{ fontSize:12, fontWeight:700, flex:1 }} 
                        value={sec.instruction||''} 
                        onChange={e => {
                          const updated = { ...editPaperData }
                          updated.sections[si].instruction = e.target.value
                          setEditPaperData(updated)
                        }}
                      />
                    </div>
                    <button 
                      className="btn btn-d btn-sm" 
                      style={{ padding:'2px 8px', fontSize:11 }}
                      onClick={() => {
                        const updated = { ...editPaperData }
                        updated.sections = updated.sections.filter((_, idx) => idx !== si)
                        setEditPaperData(updated)
                      }}
                    >
                      Delete Section
                    </button>
                  </div>

                  {/* Questions in Section */}
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {(sec.questions || []).map((q, qi) => (
                      <div key={qi} style={{ display:'flex', gap:6, alignItems:'flex-start', background:'var(--card)', padding:8, borderRadius:8, border:'1px solid var(--bdr)' }}>
                        <input 
                          className="fi" 
                          style={{ width:44, textAlign:'center', fontWeight:700, fontSize:12, padding:'4px 2px' }}
                          value={q.id||''} 
                          onChange={e => {
                            const updated = { ...editPaperData }
                            updated.sections[si].questions[qi].id = e.target.value
                            setEditPaperData(updated)
                          }}
                        />
                        <textarea 
                          className="fi" 
                          style={{ flex:1, minHeight:48, fontSize:12, padding:'6px 8px' }}
                          value={q.text||q.question||''} 
                          onChange={e => {
                            const updated = { ...editPaperData }
                            updated.sections[si].questions[qi].text = e.target.value
                            setEditPaperData(updated)
                          }}
                        />
                        <input 
                          className="fi" 
                          style={{ width:60, textAlign:'center', fontWeight:700, fontSize:12, padding:'4px 2px' }}
                          placeholder="[ 02 ]"
                          value={q.marks||''} 
                          onChange={e => {
                            const updated = { ...editPaperData }
                            updated.sections[si].questions[qi].marks = e.target.value
                            setEditPaperData(updated)
                          }}
                        />
                        <input 
                          className="fi" 
                          style={{ width:54, textAlign:'center', fontSize:11, padding:'4px 2px' }}
                          placeholder="CO"
                          value={q.co||''} 
                          onChange={e => {
                            const updated = { ...editPaperData }
                            updated.sections[si].questions[qi].co = e.target.value
                            setEditPaperData(updated)
                          }}
                        />
                        <input 
                          className="fi" 
                          style={{ width:48, textAlign:'center', fontSize:11, padding:'4px 2px' }}
                          placeholder="BL"
                          value={q.bl||''} 
                          onChange={e => {
                            const updated = { ...editPaperData }
                            updated.sections[si].questions[qi].bl = e.target.value
                            setEditPaperData(updated)
                          }}
                        />
                        <button 
                          className="btn btn-g btn-sm"
                          style={{ padding:'4px 8px', fontSize:12 }}
                          onClick={() => {
                            const updated = { ...editPaperData }
                            updated.sections[si].questions = updated.sections[si].questions.filter((_, idx) => idx !== qi)
                            setEditPaperData(updated)
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>

                  <button 
                    className="btn btn-s btn-sm" 
                    style={{ marginTop:8, fontSize:11 }}
                    onClick={() => {
                      const updated = { ...editPaperData }
                      const curQs = updated.sections[si].questions || []
                      const nextId = `${String.fromCharCode(65 + curQs.length)}.`
                      curQs.push({ id: nextId, text: 'New Question text here', marks: '[ 02 ]', co: 'CO1', bl: 'L2' })
                      updated.sections[si].questions = curQs
                      setEditPaperData(updated)
                    }}
                  >
                    ➕ Add Question
                  </button>
                </div>
              ))}

              <button 
                className="btn btn-s btn-sm" 
                style={{ background:'var(--brand2)', color:'#fff', border:'none', fontSize:12 }}
                onClick={() => {
                  const updated = { ...editPaperData }
                  const sNum = (updated.sections?.length || 0) + 1
                  updated.sections = [
                    ...(updated.sections || []),
                    {
                      qNum: String(sNum),
                      instruction: 'Attempt Any One',
                      questions: [
                        { id: 'A.', text: 'Detailed question description', marks: '[ 05 ]', co: 'CO1', bl: 'L2' },
                        { id: 'B.', text: 'Detailed question description', marks: '[ 05 ]', co: 'CO2', bl: 'L2' }
                      ]
                    }
                  ]
                  setEditPaperData(updated)
                }}
              >
                ➕ Add New Section
              </button>
            </div>
          ) : (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 6 }}>
                ✏️ <strong>Question Paper JSON Editor:</strong> Edit raw questions, Course Outcomes (CO), Bloom’s levels, marks, or instructions.
              </div>
              <textarea
                className="fi"
                style={{
                  width: '100%',
                  minHeight: 460,
                  fontFamily: 'Consolas, Monaco, monospace',
                  fontSize: 12.5,
                  lineHeight: 1.5,
                  padding: 14,
                  background: 'var(--bg)',
                  color: 'var(--ink)',
                  border: '1.5px solid var(--brand)',
                  borderRadius: 10
                }}
                value={editText}
                onChange={e => setEditText(e.target.value)}
              />
            </div>
          )
        ) : (
          <div style={{ marginTop: 14 }}>
            <AutonomousExamPaper paper={currentPaper} />
          </div>
        )}
      </div>
    )
  }

  const renderResult = () => {
    if (!result) return null
    const { tool: t, data } = result

    if (t === 'handwritten') return renderHandwritten(data)
    if (t === 'paper') return renderPaper(data)

    if (t === 'mindmap' && data.mindmapData) {
      const mm = data.mindmapData
      return (
        <div>
          <div style={{ textAlign:'center', marginBottom:16 }}>
            <span style={{ background:'var(--brand)', color:'#fff', padding:'9px 22px', borderRadius:20, fontFamily:'Sora,sans-serif', fontWeight:700, fontSize:14 }}>{mm.central}</span>
          </div>
          <div className="g2">
            {mm.branches?.map((b,i) => (
              <div key={i} style={{ background:'var(--card)', border:'1px solid var(--bdr)', borderRadius:11, padding:14 }}>
                <div style={{ fontSize:13, fontWeight:700, color:b.color||'var(--brand)', marginBottom:9 }}>● {b.topic}</div>
                {b.subtopics?.map((s,j) => (
                  <div key={j} style={{ fontSize:12.5, color:'var(--ink2)', paddingLeft:12, borderLeft:'2px solid '+(b.color||'var(--bdr2)'), marginBottom:5 }}>→ {s}</div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )
    }

    if (t === 'vocabulary') {
      const vocab = data.vocabulary || []
      return (
        <div>
          {vocab.map((v,i) => (
            <div key={i} style={{ borderBottom:'1px solid var(--bdr)', paddingBottom:11, marginBottom:11 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4, flexWrap:'wrap' }}>
                <span style={{ fontWeight:700, fontSize:14 }}>{v.word}</span>
                {v.hindi&&v.hindi!=='—'&&<span style={{ background:'#EDE9FE', color:'#5B21B6', fontSize:12, padding:'2px 9px', borderRadius:20, fontWeight:600 }}>{v.hindi}</span>}
                {v.formula&&<span style={{ background:'#FEF9C3', color:'#854D0E', fontSize:12, padding:'2px 9px', borderRadius:20, fontWeight:600, fontFamily:'monospace' }}>{v.formula}</span>}
              </div>
              <div style={{ fontSize:13, color:'var(--ink2)', lineHeight:1.65 }}>{v.definition}</div>
              {v.example&&<div style={{ fontSize:12, color:'var(--brand)', marginTop:4, fontStyle:'italic' }}>💡 Example: {v.example}</div>}
              {v.context&&<div style={{ fontSize:12, color:'var(--grn)', marginTop:3 }}>📚 Exam: {v.context}</div>}
            </div>
          ))}
        </div>
      )
    }

    if (t === 'ppt' && (data.pptData?.slides || editSlides.length > 0)) {
      const slides = editSlides.length > 0 ? editSlides : (data.pptData?.slides || [])
      const activeThemeObj = PPT_THEMES_LIST.find(th => th.id === pptTheme) || PPT_THEMES_LIST[0]

      return (
        <div>
          {/* Theme Selector Toolbar */}
          <div style={{ background:'var(--card)', border:'1.5px solid var(--bdr)', borderRadius:12, padding:'12px 16px', marginBottom:14 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:12 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                <span style={{ fontSize:12, fontWeight:700, color:'var(--ink)' }}>🎨 Presentation Theme:</span>
                <select
                  className="fi"
                  style={{ width:'auto', minWidth:200, padding:'6px 12px', fontSize:13, fontWeight:600 }}
                  value={pptTheme}
                  onChange={e => setPptTheme(e.target.value)}
                >
                  {PPT_THEMES_LIST.map(th => (
                    <option key={th.id} value={th.id}>{th.name}</option>
                  ))}
                </select>
              </div>

              {/* Quick theme swatches */}
              <div style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}>
                {PPT_THEMES_LIST.map(th => {
                  const on = pptTheme === th.id
                  return (
                    <button
                      key={th.id}
                      className="btn btn-sm"
                      style={{
                        padding:'3px 10px',
                        fontSize:11.5,
                        background: on ? th.header : 'var(--bg2)',
                        color: on ? '#fff' : 'var(--ink2)',
                        border: on ? `2px solid ${th.header}` : '1px solid var(--bdr)',
                        display:'inline-flex',
                        alignItems:'center',
                        gap:5
                      }}
                      onClick={() => setPptTheme(th.id)}
                    >
                      <span style={{ width:10, height:10, borderRadius:'50%', background: th.header, display:'inline-block' }}/>
                      {th.name.replace(/^[^\s]+\s/, '')}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Action Buttons: Edit Slides, Download PPT (.pptx), Download PDF, Add Slide */}
          <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
            <button
              className="btn btn-sm"
              style={{
                background: isEditing ? 'var(--grn)' : 'var(--brand)',
                color: '#fff',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5
              }}
              onClick={() => {
                if (!isEditing) {
                  setEditSlides(JSON.parse(JSON.stringify(slides)))
                  setIsEditing(true)
                } else {
                  if (data.pptData) data.pptData.slides = editSlides
                  setIsEditing(false)
                  toast.success('✅ Slide deck changes saved!')
                }
              }}
            >
              {isEditing ? '💾 Save Slides' : '✏️ Edit Slides'}
            </button>

            {isEditing && (
              <>
                <button
                  className="btn btn-s btn-sm"
                  onClick={() => {
                    setEditSlides(data.pptData?.slides || [])
                    setIsEditing(false)
                  }}
                >
                  Cancel
                </button>

                <button
                  className="btn btn-s btn-sm"
                  style={{ background:'var(--brand2)', color:'#fff', border:'none' }}
                  onClick={() => {
                    const newSlide = {
                      slideNumber: editSlides.length + 1,
                      title: 'New Slide Title',
                      bullets: ['Key takeaway point 1', 'Key takeaway point 2'],
                      speakerNotes: 'Speaker notes for this slide'
                    }
                    setEditSlides([...editSlides, newSlide])
                    toast.success('New slide added!')
                  }}
                >
                  ➕ Add Slide
                </button>
              </>
            )}

            {/* Download PowerPoint (.pptx) */}
            <button
              className="btn btn-sm"
              style={{ background:'#D04423', color:'#fff', border:'none', display:'inline-flex', alignItems:'center', gap:6 }}
              onClick={() => downloadPptx(slides, doc?.title)}
              disabled={exportingPptx}
            >
              {exportingPptx ? '⏳ Generating PPT…' : '📊 Download PowerPoint (.pptx)'}
            </button>

            {/* Download Slides PDF */}
            <button
              className="btn btn-p btn-sm"
              style={{ display:'inline-flex', alignItems:'center', gap:6 }}
              onClick={() => downloadPdf(slides, 'ppt', doc?.title)}
              disabled={exportingPdf}
            >
              {exportingPdf ? '⏳ Generating PDF…' : '⬇️ Download Slides PDF'}
            </button>

            <span style={{ fontSize:11, color:'var(--ink3)' }}>
              Theme: <strong style={{ color:'var(--brand)' }}>{activeThemeObj.name}</strong>
            </span>
          </div>

          {/* Slide Deck View / Interactive Edit Mode */}
          <div style={{ marginTop: 12 }}>
            {slides.map((s, i) => (
              <div
                key={i}
                style={{
                  background: activeThemeObj.card,
                  border: `1.5px solid ${activeThemeObj.border}`,
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 14,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                  color: activeThemeObj.text
                }}
              >
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 10 }}>
                  <span
                    style={{
                      background: activeThemeObj.header,
                      color: '#fff',
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '3px 10px',
                      borderRadius: 20
                    }}
                  >
                    SLIDE {s.slideNumber || i + 1} OF {slides.length}
                  </span>

                  {isEditing && (
                    <button
                      className="btn btn-d btn-sm"
                      style={{ padding:'2px 8px', fontSize:11 }}
                      onClick={() => {
                        if (slides.length <= 1) { toast.error('Presentation must have at least 1 slide.'); return }
                        const updated = editSlides.filter((_, idx) => idx !== i).map((sl, idx) => ({ ...sl, slideNumber: idx + 1 }))
                        setEditSlides(updated)
                      }}
                    >
                      🗑️ Remove Slide
                    </button>
                  )}
                </div>

                {isEditing ? (
                  <div>
                    <div style={{ marginBottom: 10 }}>
                      <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Slide Title:</label>
                      <input
                        className="fi"
                        style={{ width: '100%', fontSize: 14, fontWeight: 700 }}
                        value={s.title || ''}
                        onChange={e => {
                          const updated = [...editSlides]
                          updated[i].title = e.target.value
                          setEditSlides(updated)
                        }}
                      />
                    </div>

                    <div style={{ marginBottom: 10 }}>
                      <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Bullet Points:</label>
                      {(s.bullets || []).map((b, j) => (
                        <div key={j} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                          <input
                            className="fi"
                            style={{ flex: 1, fontSize: 13 }}
                            value={b}
                            onChange={e => {
                              const updated = [...editSlides]
                              updated[i].bullets[j] = e.target.value
                              setEditSlides(updated)
                            }}
                          />
                          <button
                            className="btn btn-g btn-sm"
                            style={{ padding: '0 8px' }}
                            onClick={() => {
                              const updated = [...editSlides]
                              updated[i].bullets = updated[i].bullets.filter((_, bj) => bj !== j)
                              setEditSlides(updated)
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      <button
                        className="btn btn-s btn-sm"
                        style={{ fontSize: 11, marginTop: 4 }}
                        onClick={() => {
                          const updated = [...editSlides]
                          updated[i].bullets = [...(updated[i].bullets || []), 'New key point']
                          setEditSlides(updated)
                        }}
                      >
                        ➕ Add Bullet
                      </button>
                    </div>

                    <div>
                      <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 4 }}>Speaker Notes:</label>
                      <textarea
                        className="fi"
                        style={{ width: '100%', minHeight: 60, fontSize: 12 }}
                        value={s.speakerNotes || ''}
                        onChange={e => {
                          const updated = [...editSlides]
                          updated[i].speakerNotes = e.target.value
                          setEditSlides(updated)
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <div
                      style={{
                        fontFamily: 'Sora, sans-serif',
                        fontSize: 16,
                        fontWeight: 700,
                        color: activeThemeObj.title,
                        margin: '8px 0 12px'
                      }}
                    >
                      {s.title}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {(s.bullets || []).map((b, j) => (
                        <div
                          key={j}
                          style={{
                            fontSize: 13.5,
                            lineHeight: 1.6,
                            paddingLeft: 12,
                            borderLeft: `3px solid ${activeThemeObj.accent}`,
                            color: activeThemeObj.text
                          }}
                        >
                          {b}
                        </div>
                      ))}
                    </div>

                    {s.speakerNotes && (
                      <div
                        style={{
                          fontSize: 12,
                          color: activeThemeObj.text,
                          opacity: 0.75,
                          marginTop: 12,
                          fontStyle: 'italic',
                          borderTop: `1px solid ${activeThemeObj.border}`,
                          paddingTop: 8
                        }}
                      >
                        📝 Speaker Notes: {s.speakerNotes}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )
    }

    if (t === 'video') {
      return (
        <div>
          <div className="ib g" style={{ marginBottom:12 }}>{data.message}</div>
          {data.videoUrl && (
            <div style={{ marginBottom: 16 }}>
              <video controls src={data.videoUrl} style={{ width: '100%', borderRadius: 8, background: '#000' }} />
            </div>
          )}
          <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }}>
            {data.videoUrl && <a href={data.videoUrl} download className="btn btn-p btn-sm" style={{ textDecoration:'none' }}>⬇️ Download Video</a>}
            {data.slidesUrl && <a href={data.slidesUrl} download className="btn btn-s btn-sm" style={{ textDecoration:'none' }}>⬇️ Slides PDF</a>}
            {data.audioUrl && <a href={data.audioUrl} download className="btn btn-s btn-sm" style={{ textDecoration:'none', background:'transparent', color:'var(--ink2)', border:'1px solid var(--bdr)' }}>⬇️ Audio Only</a>}
          </div>
          {data.audioNote && <div className="ib a" style={{ marginBottom:12, fontSize:12 }}>🎙️ {data.audioNote}</div>}
          <div style={{ fontFamily:'Sora,sans-serif', fontSize:13, fontWeight:700, marginBottom:8 }}>📜 1-2 Minute Lecture Script:</div>
          <div className="ob">
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
              {data.script}
            </ReactMarkdown>
          </div>
        </div>
      )
    }

    const text = data.content || data.notes || data.summary || data.questions || data.paperContent || ''
    const currentText = editText !== '' && isEditing ? editText : (data.content || text)

    return (
      <div>
        <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
          <button
            className="btn btn-sm"
            style={{
              background: isEditing ? 'var(--grn)' : 'var(--brand)',
              color: '#fff',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5
            }}
            onClick={() => {
              if (!isEditing) {
                setEditText(currentText)
                setIsEditing(true)
              } else {
                data.content = editText
                if (data.notes) data.notes = editText
                if (data.summary) data.summary = editText
                if (data.questions) data.questions = editText
                setIsEditing(false)
                toast.success('✅ Changes saved!')
              }
            }}
          >
            {isEditing ? '💾 Save Changes' : '✏️ Edit Content'}
          </button>

          {isEditing && (
            <button
              className="btn btn-s btn-sm"
              onClick={() => {
                setEditText(text)
                setIsEditing(false)
              }}
            >
              Cancel
            </button>
          )}

          {/* Download PDF */}
          <button
            className="btn btn-p btn-sm"
            onClick={() => downloadPdf(currentText, t === 'summary' ? 'notes' : t, doc?.title)}
            disabled={exportingPdf}
            style={{ display:'inline-flex', alignItems:'center', gap:6 }}
          >
            {exportingPdf ? '⏳ Preparing PDF…' : '⬇️ Download PDF'}
          </button>

          {/* Download Word (.docx) */}
          <button
            className="btn btn-s btn-sm"
            style={{ background:'#2B579A', color:'#fff', border:'none', display:'inline-flex', alignItems:'center', gap:6 }}
            onClick={() => downloadDocx(currentText, doc?.title)}
            disabled={exportingWord}
          >
            {exportingWord ? '⏳ Exporting…' : '📄 Download Word (.docx)'}
          </button>

          {currentText && (
            <button
              className="btn btn-s btn-sm"
              onClick={() => { navigator.clipboard?.writeText(currentText); toast.success('Copied!') }}
            >
              📋 Copy
            </button>
          )}
        </div>

        {isEditing ? (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12, color: 'var(--ink3)', marginBottom: 6 }}>
              ✏️ <strong>Live Content Editor:</strong> Edit your notes, formulas, headings, or definitions below. Click <strong>Save Changes</strong> when finished.
            </div>
            <textarea
              className="fi"
              style={{
                width: '100%',
                minHeight: 420,
                fontFamily: 'Consolas, Monaco, monospace',
                fontSize: 13,
                lineHeight: 1.6,
                padding: 14,
                background: 'var(--bg)',
                color: 'var(--ink)',
                border: '1.5px solid var(--brand)',
                borderRadius: 10
              }}
              value={editText}
              onChange={e => setEditText(e.target.value)}
            />
          </div>
        ) : (
          currentText ? (
            <div className="ob">
              <ReactMarkdown 
                remarkPlugins={[remarkGfm, remarkMath]} 
                rehypePlugins={[rehypeKatex]}
                components={{
                  img: ({ node, ...props }) => (
                    <figure style={{ margin: '18px auto', textAlign: 'center' }}>
                      <img {...props} style={{ maxWidth: '95%', maxHeight: '420px', objectFit: 'contain', height: 'auto', borderRadius: 8, border: '1.5px solid var(--bdr2)', boxShadow: '0 4px 14px rgba(0,0,0,0.08)', background: '#fff' }} />
                      {props.alt && <figcaption style={{ fontSize: '12px', color: 'var(--ink3)', marginTop: 6, fontStyle: 'italic', fontFamily: 'Inter, sans-serif' }}>{props.alt}</figcaption>}
                    </figure>
                  )
                }}
              >
                {currentText}
              </ReactMarkdown>
            </div>
          ) : (
            <div style={{ background:'#FEF3F2', border:'1px solid #FCA5A5', borderRadius:9, padding:'12px 14px', fontSize:13, color:'#B91C1C' }}>No content returned. Try again.</div>
          )
        )}
      </div>
    )
  }

  return (
    <div className="tc" style={{ alignItems:'start' }}>
      <div>
        {/* Step 1 */}
        <div className="card" style={{ marginBottom:16 }}>
          <div className="ch"><div className="ct">📄 1. Select Document or Video</div></div>
          <div className="cb">
            {docs.length === 0 ? (
              <div style={{ textAlign:'center', padding:'20px 0' }}>
                <div style={{ fontSize:30, marginBottom:10 }}>📂</div>
                <div style={{ fontSize:13, color:'var(--ink3)', marginBottom:12 }}>No processed documents yet</div>
                <button className="btn btn-p btn-sm" onClick={()=>navigate('/upload')}>📤 Upload or Import a Link</button>
              </div>
            ) : (
              <select className="fi" value={docId} onChange={e=>setDocId(e.target.value)}>
                <option value="">— Select a document / video —</option>
                {docs.map(d => <option key={d._id} value={d._id}>{d.fileType === 'youtube' ? '🎥 ' : d.fileType === 'url' ? '🌐 ' : d.fileType === 'image' ? '🖼️ ' : '📄 '}{d.title} ({d.wordCount?.toLocaleString()} words)</option>)}
              </select>
            )}
            {doc && (
              <div style={{ marginTop:10, fontSize:12, background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:8, padding:'8px 12px', color:'#166534' }}>
                ✅ <strong>{doc.title}</strong> — {doc.wordCount?.toLocaleString()} words · {doc.pageCount} pages · {doc.sections?.length} sections
              </div>
            )}
            {doc?.sections?.length > 1 && (
              <div className="fg" style={{ marginTop:12 }}>
                <label className="fl">Section (optional)</label>
                <select className="fi" value={section} onChange={e=>setSection(e.target.value)}>
                  <option value="">📄 Full document</option>
                  {doc.sections.map((s,i) => <option key={i} value={i}>{s.title?.slice(0,60)} ({s.wordCount} words)</option>)}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Step 2 */}
        <div className="card" style={{ marginBottom:16 }}>
          <div className="ch"><div className="ct">🛠️ 2. Choose Output</div></div>
          <div className="cb">
            <div className="output-tools-grid">
              {TOOLS.map(t => (
                <div key={t.id} className={'to'+(tool===t.id?' on':'')} onClick={()=>setTool(t.id)} style={{ flexDirection:'column', alignItems:'flex-start', gap:4, padding:'10px 11px' }}>
                  <span style={{ fontSize:16 }}>{t.icon}</span>
                  <span style={{ fontSize:12, fontWeight:700 }}>{t.label}</span>
                  <span style={{ fontSize:10.5, color:'var(--ink3)', fontWeight:400 }}>{t.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Step 3 - Language */}
        <div className="card" style={{ marginBottom:16 }}>
          <div className="ch"><div className="ct">🌐 3. Language</div></div>
          <div className="cb">
            <div style={{ display:'flex', gap:7, flexWrap:'wrap' }}>
              {LANGS.map(l => <div key={l} className={'lp'+(lang===l?' on':'')} onClick={()=>setLang(l)}>{FLAG[l]} {l}</div>)}
            </div>
            {lang !== 'English' && (
              <div style={{ marginTop:10, fontSize:12, background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:8, padding:'7px 11px', color:'#1D4ED8' }}>
                🌐 Output will be in {lang}.
              </div>
            )}
          </div>
        </div>

        {/* Question paper settings */}
        {tool === 'paper' && (
          <div className="card" style={{ marginBottom:16 }}>
            <div className="ch"><div className="ct">📄 Paper Settings</div></div>
            <div className="cb">
              {/* Paper Type */}
              <div className="fg">
                <label className="fl">Exam Type</label>
                <div className="g2" style={{ marginTop:6 }}>
                  <div onClick={()=>setPaperType('20_MARKS')}
                    style={{ border:'2px solid '+(paperType==='20_MARKS'?'var(--brand)':'var(--bdr2)'), borderRadius:10, padding:'12px', cursor:'pointer', background:paperType==='20_MARKS'?'rgba(79,70,229,0.06)':'var(--bg)', textAlign:'center' }}>
                    <div style={{ fontSize:20, marginBottom:4 }}>📝</div>
                    <div style={{ fontWeight:700, fontSize:13, color:paperType==='20_MARKS'?'var(--brand)':'var(--ink)' }}>20 Marks</div>
                    <div style={{ fontSize:11, color:'var(--ink3)', marginTop:2 }}>Internal · 1 Hour<br/>MCQ + Short Answers</div>
                    {paperType==='20_MARKS' && <div style={{ fontSize:10, color:'var(--brand)', fontWeight:700, marginTop:4 }}>✓ Selected</div>}
                  </div>
                  <div onClick={()=>setPaperType('60_MARKS')}
                    style={{ border:'2px solid '+(paperType==='60_MARKS'?'var(--brand)':'var(--bdr2)'), borderRadius:10, padding:'12px', cursor:'pointer', background:paperType==='60_MARKS'?'rgba(79,70,229,0.06)':'var(--bg)', textAlign:'center' }}>
                    <div style={{ fontSize:20, marginBottom:4 }}>📋</div>
                    <div style={{ fontWeight:700, fontSize:13, color:paperType==='60_MARKS'?'var(--brand)':'var(--ink)' }}>60 Marks</div>
                    <div style={{ fontSize:11, color:'var(--ink3)', marginTop:2 }}>End Sem · 2 Hours<br/>Q1 + Any 3 from Q2–Q6</div>
                    {paperType==='60_MARKS' && <div style={{ fontSize:10, color:'var(--brand)', fontWeight:700, marginTop:4 }}>✓ Selected</div>}
                  </div>
                </div>
              </div>
              <div className="fg">
                <label className="fl">Number of Sets: {sets}</label>
                <input type="range" min={1} max={5} step={1} value={sets} onChange={e=>setSets(+e.target.value)} style={{ width:'100%' }}/>
                <div style={{ fontSize:11, color:'var(--ink3)', marginTop:4 }}>{sets} unique question paper set{sets>1?'s':''}</div>
              </div>
              <div className="fg">
                <button
                  type="button"
                  className="btn btn-g btn-sm"
                  style={{ width: '100%', marginBottom: 8, fontSize: 11.5 }}
                  onClick={() => setShowAdvancedPaperSettings(!showAdvancedPaperSettings)}
                >
                  {showAdvancedPaperSettings ? '▲ Hide College Details' : '🏛️ Customize College / Exam Headers'}
                </button>
                {showAdvancedPaperSettings && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--bg)', padding: 10, borderRadius: 8, marginBottom: 8 }}>
                    <div>
                      <label style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)' }}>Institution / Society</label>
                      <input className="fi" style={{ fontSize: 12 }} value={institution} onChange={e=>setInstitution(e.target.value)} />
                    </div>
                    <div>
                      <label style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)' }}>College Name</label>
                      <input className="fi" style={{ fontSize: 12 }} value={collegeName} onChange={e=>setCollegeName(e.target.value)} />
                    </div>
                    <div>
                      <label style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)' }}>Department</label>
                      <input className="fi" style={{ fontSize: 12 }} value={departmentName} onChange={e=>setDepartmentName(e.target.value)} />
                    </div>
                    <div>
                      <label style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)' }}>Exam Title</label>
                      <input className="fi" style={{ fontSize: 12 }} value={examTypeName} onChange={e=>setExamTypeName(e.target.value)} />
                    </div>
                    <div>
                      <label style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink3)' }}>Class / Branch</label>
                      <input className="fi" style={{ fontSize: 12 }} value={className} onChange={e=>setClassName(e.target.value)} />
                    </div>
                  </div>
                )}
              </div>
              {/* CO & BL info */}
              <div style={{ background:'var(--bg)', borderRadius:9, padding:'10px 12px', fontSize:12, color:'var(--ink3)', lineHeight:1.7 }}>
                <strong style={{ color:'var(--ink2)' }}>Auto-applied:</strong> CO1–CO6 mapping · BL1 (Remember) → BL6 (Create) · Autonomous Grid Table
              </div>
            </div>
          </div>
        )}

        {/* Handwritten font and paper options */}
        {tool === 'handwritten' && (
          <div className="card" style={{ marginBottom:16 }}>
            <div className="ch">
              <div className="ct">✍️ Choose Handwriting Style (15 Fonts)</div>
              <span className="bn">{HANDWRITING_FONTS.length} Fonts Available</span>
            </div>
            <div className="cb">
              <div className="fg">
                <label className="fl">Select Handwriting Font</label>
                <div style={{ maxHeight:260, overflowY:'auto', border:'1.5px solid var(--bdr2)', borderRadius:10, padding:8, background:'var(--bg)' }}>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(130px, 1fr))', gap:8 }}>
                    {HANDWRITING_FONTS.map(f => {
                      const isSelected = hwFont === f.id
                      return (
                        <div 
                          key={f.id}
                          onClick={() => setHwFont(f.id)}
                          style={{
                            border: '1.5px solid ' + (isSelected ? 'var(--brand)' : 'var(--bdr)'),
                            background: isSelected ? 'rgba(79,70,229,0.08)' : 'var(--card)',
                            borderRadius: 8,
                            padding: '8px 10px',
                            cursor: 'pointer',
                            transition: 'all .15s',
                            boxShadow: isSelected ? '0 0 0 2px rgba(79,70,229,0.15)' : 'none'
                          }}
                        >
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:2 }}>
                            <span style={{ fontSize:9.5, fontWeight:700, color:isSelected?'var(--brand)':'var(--ink3)', textTransform:'uppercase' }}>{f.tag}</span>
                            {isSelected && <span style={{ color:'var(--brand)', fontSize:12, fontWeight:800 }}>✓</span>}
                          </div>
                          <div style={{ fontFamily:f.fontFamily, fontSize:17, fontWeight:600, color:isSelected?'var(--brand)':'var(--ink)', lineHeight:1.2, margin:'4px 0' }}>
                            {f.name}
                          </div>
                          <div style={{ fontSize:10, color:'var(--ink3)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                            {f.desc}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Paper Background Style */}
              <div className="fg" style={{ marginTop:14 }}>
                <label className="fl">Paper Style</label>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(80px, 1fr))', gap:6 }}>
                  {PAPER_STYLES.map(p => {
                    const isSelected = hwPaper === p.id
                    return (
                      <div 
                        key={p.id}
                        onClick={() => setHwPaper(p.id)}
                        style={{
                          border: '1.5px solid ' + (isSelected ? 'var(--brand)' : 'var(--bdr2)'),
                          background: isSelected ? 'rgba(79,70,229,0.08)' : 'var(--bg)',
                          borderRadius: 8,
                          padding: '6px 4px',
                          textAlign: 'center',
                          cursor: 'pointer',
                          fontSize: 11,
                          fontWeight: isSelected ? 700 : 500,
                          color: isSelected ? 'var(--brand)' : 'var(--ink2)'
                        }}
                      >
                        {p.name}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Page overview */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(70px, 1fr))', gap:8, marginTop:14, marginBottom:8 }}>
                {[1,2,3,4].map(p => (
                  <div key={p} style={{ border:'1px solid var(--bdr)', borderRadius:8, padding:'8px 4px', textAlign:'center', background:'#FEFDE8', fontFamily:HANDWRITING_FONTS.find(f=>f.id===hwFont)?.fontFamily || 'Caveat,cursive' }}>
                    <div style={{ fontSize:10, fontWeight:700, color:'var(--ink3)' }}>Page {p}</div>
                    <div style={{ fontSize:8.5, color:'var(--ink3)', marginTop:2 }}>
                      {p===1?'Overview':p===2?'Concepts':p===3?'Formulas':p===4?'Summary':''}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize:11.5, color:'var(--ink3)', marginTop:6 }}>
                ✍️ <strong>Selected:</strong> {HANDWRITING_FONTS.find(f=>f.id===hwFont)?.name} · You can also switch fonts anytime after generating!
              </div>
            </div>
          </div>
        )}

        {tool === 'flashcards' && (
          <div className="card" style={{ marginBottom:16 }}>
            <div className="ch"><div className="ct">🃏 Flashcard Settings</div></div>
            <div className="cb">
              <div className="fg">
                <label className="fl">Cards: {count}</label>
                <input type="range" min={5} max={30} step={5} value={count} onChange={e=>setCount(+e.target.value)} style={{ width:'100%' }}/>
              </div>
            </div>
          </div>
        )}

        {/* Generate button */}
        <div className="card">
          <div className="cb">
            <button className="btn btn-p btn-lg wf" onClick={generate} disabled={loading||!docId}>
              {loading ? '🤖 Generating...' : '🤖 Generate '+TOOLS.find(t=>t.id===tool)?.label}
            </button>
            {loading && (
              <div className="dots" style={{ marginTop:12 }}>
                <div className="dot"/><div className="dot"/><div className="dot"/>
                <span style={{ fontSize:12.5, color:'var(--ink3)' }}>
                  {tool==='paper' ? 'Generating question paper with CO & BL mapping...' : tool==='handwritten' ? 'Creating handwritten notes (3–4 pages)...' : tool==='video' ? 'Creating video lecture...' : 'Analysing your PDF...'}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Result panel */}
      <div>
        {result ? (
          <div className="card">
            <div className="ch">
              <div className="ct">✨ {TOOLS.find(t=>t.id===result.tool)?.label}</div>
              <div style={{ display:'flex', gap:8 }}>
                {result.tool==='paper' && <span className="chip">{paperType==='20_MARKS'?'📝 20M':'📋 60M'}</span>}
                <span className="chip">{FLAG[lang]} {lang}</span>
              </div>
            </div>
            <div className="cb">{renderResult()}</div>
          </div>
        ) : (
          <div className="card">
            <div className="cb" style={{ textAlign:'center', padding:'56px 24px' }}>
              <div style={{ fontSize:48, marginBottom:16 }}>📓</div>
              <div style={{ fontFamily:'Sora,sans-serif', fontSize:18, fontWeight:700, marginBottom:10 }}>AI Notebook</div>
              <div style={{ fontSize:13, color:'var(--ink3)', lineHeight:1.8, maxWidth:300, margin:'0 auto' }}>
                Select your PDF → choose what to generate → click the button.
                <br/><br/>
                All content comes from <strong>your document</strong>.
                <br/>Supports Hindi, Marathi & more.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
