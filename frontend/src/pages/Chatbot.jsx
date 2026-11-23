import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import api from '../utils/api'

const SUGGESTED = [
  "Explain the core theoretical architecture and key principles",
  "Extract all mathematical formulas and explain their variables step by step",
  "What are the top 5 most important exam questions from this document?",
  "Compare the primary methodologies or algorithms discussed with their trade-offs",
  "Provide a structured summary of the main definitions and terminology",
  "Explain the step-by-step working of the main process described in this text"
]

export default function Chatbot() {
  const [docs, setDocs] = useState([])
  const [docId, setDocId] = useState('')
  const [chatLang, setChatLang] = useState('auto')
  const [sessId, setSessId] = useState(null)
  const [strictGrounded, setStrictGrounded] = useState(true)
  const [expandedEvidence, setExpandedEvidence] = useState({})
  const [msgs, setMsgs] = useState([
    {
      role: 'assistant',
      content: `### Welcome to Notivexa AI Academic Tutor 🎓\n\nI am your university-grade academic research assistant, powered by **Hybrid BM25 Grounded Retrieval**.\n\nSelect a textbook or document above, and I will:\n* Provide thorough, step-by-step academic explanations\n* Cite exact **[Page X, Chapter Y]** source locations\n* Format mathematical formulas with KaTeX \\(E = mc^2\\)\n* Answer strictly from your document with zero hallucinations\n\n*Try asking a question below or pick a suggested topic to begin.*`,
      citations: [],
      passages: []
    }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottom = useRef()
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/documents?status=ready')
      .then(r => setDocs(r.data.documents || []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs])

  const send = async (msg) => {
    const m = (msg || input).trim()
    if (!m) return
    setInput('')
    setMsgs(p => [...p, { role: 'user', content: m }])
    setLoading(true)
    try {
      const res = await api.post('/chatbot/message', {
        message: m,
        documentId: docId || undefined,
        sessionId: sessId,
        outputLanguage: chatLang,
        allowGeneralKnowledge: !strictGrounded
      })
      setSessId(res.data.sessionId)
      setMsgs(p => [
        ...p,
        {
          role: 'assistant',
          content: res.data.reply,
          citations: res.data.citations || [],
          passages: res.data.passages || []
        }
      ])
    } catch {
      setMsgs(p => [
        ...p,
        {
          role: 'assistant',
          content: '⚠️ Failed to retrieve an answer. Please verify the document is ready and try again.',
          citations: [],
          passages: []
        }
      ])
    } finally {
      setLoading(false)
    }
  }

  const reset = () => {
    setMsgs([
      {
        role: 'assistant',
        content: 'New academic chat session started! Select a document and ask your questions.',
        citations: [],
        passages: []
      }
    ])
    setSessId(null)
  }

  const toggleEvidence = (index) => {
    setExpandedEvidence(prev => ({
      ...prev,
      [index]: !prev[index]
    }))
  }

  const selectedDoc = docs.find(d => d._id === docId)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 130px)', maxWidth: 1100, margin: '0 auto', width: '100%' }}>
      {/* Top Bar: Doc selector, Grounding Mode, Language & New Chat */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center', flexShrink: 0 }}>
        <select
          className="fi"
          style={{ flex: 1, minWidth: 260, fontWeight: 600 }}
          value={docId}
          onChange={e => { setDocId(e.target.value); reset(); }}
        >
          <option value="">🌐 General Academic Tutor (Broad Knowledge)</option>
          {docs.map(d => (
            <option key={d._id} value={d._id}>
              📖 {d.title} ({d.wordCount?.toLocaleString() || 0} words{d.pageCount ? ` · ${d.pageCount} pgs` : ''})
            </option>
          ))}
        </select>

        {docId && (
          <div
            onClick={() => setStrictGrounded(!strictGrounded)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: strictGrounded ? 'rgba(5, 150, 105, 0.12)' : 'var(--bg)',
              border: `1.5px solid ${strictGrounded ? 'var(--brand)' : 'var(--bdr)'}`,
              borderRadius: 8,
              padding: '7px 12px',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 700,
              color: strictGrounded ? 'var(--brand)' : 'var(--ink3)',
              userSelect: 'none'
            }}
            title="Toggle whether answers must strictly originate from the document or can leverage general knowledge"
          >
            <span>{strictGrounded ? '🛡️ Strict Document-Only' : '🌐 Hybrid (Doc + General)'}</span>
          </div>
        )}

        <select
          className="fi"
          style={{ width: 160, fontWeight: 600 }}
          value={chatLang}
          onChange={e => setChatLang(e.target.value)}
        >
          <option value="auto">🌐 Auto Language</option>
          <option value="english">🇬🇧 English</option>
          <option value="hindi">🇮🇳 Hindi (हिन्दी)</option>
          <option value="marathi">🟠 Marathi (मराठी)</option>
          <option value="gujarati">🟢 Gujarati (ગુજરાતી)</option>
          <option value="bengali">🟡 Bengali (বাংলা)</option>
          <option value="tamil">🔴 Tamil (தமிழ்)</option>
          <option value="telugu">🟣 Telugu (తెలుగు)</option>
          <option value="kannada">🟤 Kannada (ಕನ್ನಡ)</option>
          <option value="urdu">🇵🇰 Urdu (اردو)</option>
          <option value="french">🇫🇷 French</option>
          <option value="german">🇩🇪 German</option>
          <option value="spanish">🇪🇸 Spanish</option>
        </select>

        <button className="btn btn-s btn-sm" onClick={reset} style={{ fontWeight: 600 }}>
          🔄 New Session
        </button>
      </div>

      {/* Document Grounding Notice */}
      {selectedDoc && (
        <div
          style={{
            background: 'rgba(5, 150, 105, 0.06)',
            border: '1px solid rgba(5, 150, 105, 0.25)',
            borderRadius: 10,
            padding: '8px 14px',
            marginBottom: 10,
            fontSize: 12.5,
            color: 'var(--brand)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0
          }}
        >
          <div>
            📖 <strong>Grounded Source:</strong> {selectedDoc.title} &nbsp;•&nbsp; 
            <span style={{ color: 'var(--ink2)' }}>{selectedDoc.subject || 'Academic'}</span> &nbsp;•&nbsp;
            <span style={{ color: 'var(--ink3)' }}>{strictGrounded ? 'Verified Anti-Hallucination Active' : 'Hybrid Grounding'}</span>
          </div>
          <button
            className="btn btn-g btn-sm"
            style={{ fontSize: 11, padding: '3px 8px' }}
            onClick={() => navigate(`/notebook?docId=${selectedDoc._id}&tool=notes`)}
          >
            Open in Notebook ↗
          </button>
        </div>
      )}

      {docs.length === 0 && (
        <div className="ib a" style={{ marginBottom: 10, fontSize: 12, flexShrink: 0 }}>
          ⚠️ No documents found. <button className="btn btn-g btn-sm" onClick={() => navigate('/upload')}>Upload Textbook / PDF first</button>
        </div>
      )}

      {/* Chat Messages */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          paddingRight: 6,
          paddingBottom: 10
        }}
      >
        {msgs.map((m, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: m.role === 'user' ? 'flex-end' : 'flex-start',
              gap: 6
            }}
          >
            <div
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
                maxWidth: m.role === 'user' ? '75%' : '90%'
              }}
            >
              {m.role === 'assistant' && (
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    background: 'linear-gradient(135deg, #059669, #047857)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 16,
                    color: '#fff',
                    flexShrink: 0,
                    boxShadow: '0 2px 6px rgba(5,150,105,0.2)'
                  }}
                >
                  🎓
                </div>
              )}

              <div
                className={m.role === 'user' ? 'cu' : 'ca'}
                style={{
                  padding: '14px 18px',
                  borderRadius: 14,
                  fontSize: 14,
                  lineHeight: 1.65,
                  background: m.role === 'user' ? 'var(--brand)' : 'var(--card)',
                  color: m.role === 'user' ? '#fff' : 'var(--ink)',
                  border: m.role === 'user' ? 'none' : '1.5px solid var(--bdr)',
                  boxShadow: m.role === 'user' ? '0 2px 8px rgba(5,150,105,0.25)' : '0 2px 8px rgba(0,0,0,0.03)'
                }}
              >
                {m.role === 'user' ? (
                  <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
                ) : (
                  <div className="scholar-markdown">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkMath]}
                      rehypePlugins={[rehypeKatex]}
                    >
                      {m.content}
                    </ReactMarkdown>

                    {/* Citations Badges */}
                    {m.citations && m.citations.length > 0 && (
                      <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid var(--bdr)', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand)' }}>
                          📍 Verified Source Citations:
                        </span>
                        {m.citations.map((c, ci) => (
                          <span
                            key={ci}
                            style={{
                              fontSize: 11,
                              background: 'rgba(5, 150, 105, 0.1)',
                              border: '1px solid rgba(5, 150, 105, 0.3)',
                              borderRadius: 6,
                              padding: '2px 7px',
                              color: 'var(--brand)',
                              fontWeight: 600
                            }}
                          >
                            Page {c.page}{c.chapter ? ` · Ch: ${c.chapter}` : ''}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Assistant Action Pills & Evidence Drawer */}
            {m.role === 'assistant' && i > 0 && (
              <div style={{ marginLeft: 44, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  className="btn btn-g btn-sm"
                  style={{ fontSize: 11, padding: '3px 8px' }}
                  onClick={() => {
                    navigator.clipboard?.writeText(m.content)
                    toast.success('Answer copied!')
                  }}
                >
                  📋 Copy Answer
                </button>

                {docId && (
                  <>
                    <button
                      className="btn btn-g btn-sm"
                      style={{ fontSize: 11, padding: '3px 8px' }}
                      onClick={() => navigate(`/notebook?docId=${docId}&tool=questions`)}
                    >
                      🎯 Practice MCQs
                    </button>
                    <button
                      className="btn btn-g btn-sm"
                      style={{ fontSize: 11, padding: '3px 8px' }}
                      onClick={() => navigate(`/flashcards?docId=${docId}`)}
                    >
                      🃏 Flashcards
                    </button>
                  </>
                )}

                {m.passages && m.passages.length > 0 && (
                  <button
                    className="btn btn-g btn-sm"
                    style={{ fontSize: 11, padding: '3px 8px', color: 'var(--brand)' }}
                    onClick={() => toggleEvidence(i)}
                  >
                    {expandedEvidence[i] ? '▲ Hide Grounded Evidence' : `▼ View Grounded Evidence (${m.passages.length})`}
                  </button>
                )}
              </div>
            )}

            {/* Retrieved Passages Accordion */}
            {m.role === 'assistant' && expandedEvidence[i] && m.passages && (
              <div
                style={{
                  marginLeft: 44,
                  maxWidth: '85%',
                  background: 'var(--bg)',
                  border: '1px dashed var(--brand)',
                  borderRadius: 10,
                  padding: 12,
                  marginTop: 4
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand)', marginBottom: 6 }}>
                  📚 BM25 Document Passages Retrieved for Grounding:
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {m.passages.map((p, pi) => (
                    <div key={pi} style={{ fontSize: 12, color: 'var(--ink2)', borderLeft: '3px solid var(--brand)', paddingLeft: 8 }}>
                      <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 11 }}>
                        Passage #{pi + 1} (Page {p.pageNumber || 'N/A'}{p.chapter ? ` · Chapter: ${p.chapter}` : ''}):
                      </div>
                      <div style={{ marginTop: 2, fontStyle: 'italic' }}>"{p.text}"</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                background: 'linear-gradient(135deg, #059669, #047857)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 16,
                color: '#fff',
                boxShadow: '0 2px 6px rgba(5,150,105,0.2)'
              }}
            >
              🎓
            </div>
            <div className="ca" style={{ padding: '10px 16px', borderRadius: 12 }}>
              <div className="dots" style={{ padding: 0 }}>
                <div className="dot" /><div className="dot" /><div className="dot" />
              </div>
            </div>
          </div>
        )}
        <div ref={bottom} />
      </div>

      {/* Suggested Starter Questions */}
      {msgs.length <= 2 && (
        <div style={{ flexShrink: 0, marginTop: 6, marginBottom: 8 }}>
          <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginBottom: 6, fontWeight: 700 }}>
            💡 Recommended Academic Inquiries:
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {SUGGESTED.slice(0, 4).map((q, i) => (
              <button
                key={i}
                className="btn btn-g btn-sm"
                style={{ fontSize: 11.5, background: 'var(--card)', border: '1px solid var(--bdr)' }}
                onClick={() => send(q)}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Form */}
      <div style={{ display: 'flex', gap: 10, marginTop: 8, flexShrink: 0 }}>
        <input
          className="fi"
          style={{ flex: 1, padding: '12px 16px', fontSize: 14 }}
          placeholder={docId ? "Ask a detailed, grounded question about this textbook..." : "Ask any academic or scientific question..."}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
        />
        <button
          className="btn btn-p"
          style={{ padding: '0 22px', fontWeight: 700 }}
          onClick={() => send()}
          disabled={loading || !input.trim()}
        >
          Ask Tutor →
        </button>
      </div>
    </div>
  )
}
