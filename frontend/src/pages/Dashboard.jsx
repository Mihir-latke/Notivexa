import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useState, useEffect } from 'react'
import api from '../utils/api'

const MODULES = [
  { path: '/notebook?tool=notes', icon: '📖', title: 'Study Notes', desc: '14-Point University Structure, Formulas & Exam Points', color: 'rgba(120,162,210,0.18)', badge: 'CORE' },
  { path: '/notebook?tool=summary', icon: '📋', title: 'Summary Engine', desc: 'Full Academic Synthesis & High-Yield Key Points', color: 'rgba(120,162,210,0.15)', badge: 'NEW' },
  { path: '/notebook?tool=questions', icon: '🎯', title: 'Practice Simulator', desc: 'Timed Exam Practice, Bloom\'s Taxonomy & Citations', color: 'rgba(254,255,175,0.35)', badge: 'ASSESS' },
  { path: '/notebook?tool=paper', icon: '🏛️', title: 'Question Papers', desc: 'Autonomous 20M–100M Exams + Model Marking Schemes', color: 'rgba(120,162,210,0.22)', badge: 'EXAM' },
  { path: '/notebook?tool=handwritten', icon: '✍️', title: 'Handwritten Notes', desc: 'Multi-Page Notebook with 15 Natural Fonts & Diagrams', color: 'rgba(254,255,175,0.32)', badge: 'A4' },
  { path: '/notebook?tool=ppt', icon: '📊', title: 'Slide Deck Studio', desc: 'Editable Academic Slides with PPTX Download', color: 'rgba(120,162,210,0.16)', badge: 'SLIDES' },
  { path: '/video-studio', icon: '🎬', title: 'AI Video Lectures', desc: 'Synchronized Narration, Subtitles & MP4 Video', color: 'rgba(120,162,210,0.18)', badge: 'VIDEO' },
  { path: '/notebook?tool=mindmap', icon: '🗺️', title: 'Interactive Mind Map', desc: 'Hierarchical Knowledge Graph with SVG Export', color: 'rgba(120,162,210,0.20)', badge: 'GRAPH' },
  { path: '/notebook?tool=vocabulary', icon: '🔤', title: 'Vocabulary Explorer', desc: '7-Field Academic Terms, Contexts & Flip Cards', color: 'rgba(254,255,175,0.35)', badge: 'VOCAB' },
  { path: '/flashcards', icon: '🃏', title: 'Flashcard Studio', desc: 'Spaced Repetition Mastery & Interactive Study', color: 'rgba(120,162,210,0.16)', badge: 'CARDS' },
  { path: '/chatbot', icon: '🛡️', title: 'BM25 Document Tutor', desc: 'Anti-Hallucination Grounded Chat with [Page X] Citations', color: 'rgba(120,162,210,0.22)', badge: 'RAG' },
  { path: '/upload', icon: '📤', title: 'Document Ingestion', desc: 'PDF, Books, Notes, YouTube & Web Link Extraction', color: 'rgba(120,162,210,0.14)', badge: 'INPUT' }
]

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const stats = user?.studyStats || {}
  const firstName = user?.name?.split(' ')[0] || 'Scholar'
  const [setup, setSetup] = useState(null)

  useEffect(() => {
    api.get('/setup').then(r => setSetup(r.data)).catch(() => {})
  }, [])

  return (
    <div>
      {/* University-Grade Vista Blue & Mindaro Academic Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, #1C3554 0%, #355C8A 40%, #78A2D2 85%, #FEFFAF 145%)',
          borderRadius: 16,
          padding: '26px 30px',
          marginBottom: 20,
          color: '#fff',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 10px 30px rgba(120, 162, 210, 0.25)'
        }}
      >
        <div style={{ position: 'absolute', right: -30, top: -30, width: 220, height: 220, borderRadius: '50%', background: 'rgba(254, 255, 175, 0.12)' }} />
        <div style={{ position: 'absolute', right: 80, bottom: -50, width: 140, height: 140, borderRadius: '50%', background: 'rgba(120, 162, 210, 0.25)' }} />

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#FEFFAF', color: '#1B2700', padding: '4px 11px', borderRadius: 20, fontSize: 11.5, fontWeight: 800, marginBottom: 10, letterSpacing: 0.4, boxShadow: '0 2px 6px rgba(0,0,0,0.1)' }}>
          <span>🏛️ NOTIVEXA AI 3.0</span>
          <span>•</span>
          <span>ACADEMIC LEARNING PLATFORM</span>
        </div>

        <div style={{ fontFamily: 'Sora, sans-serif', fontSize: 22, fontWeight: 800, marginBottom: 6 }}>
          Welcome back, {firstName}! 🎓
        </div>
        <div style={{ fontSize: 13, opacity: 0.95, marginBottom: 18, maxWidth: 620, lineHeight: 1.6, color: '#F0F6FF' }}>
          Transform any textbook, research paper, or curriculum into a complete university learning ecosystem — with 14-point structured notes, practice simulators, model answer keys, slide decks, video lectures, and BM25-grounded research tutoring.
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            className="btn"
            style={{ background: '#FEFFAF', color: '#0F1E33', fontWeight: 800, boxShadow: '0 4px 14px rgba(0,0,0,0.15)' }}
            onClick={() => navigate('/upload')}
          >
            📤 Upload Textbook / Syllabus
          </button>
          <button
            className="btn"
            style={{ background: 'rgba(255,255,255,0.18)', color: '#fff', border: '1px solid rgba(254,255,175,0.4)', fontWeight: 700 }}
            onClick={() => navigate('/notebook')}
          >
            📖 Academic Notebook
          </button>
          <button
            className="btn"
            style={{ background: 'rgba(120,162,210,0.3)', color: '#FEFFAF', border: '1px solid rgba(254,255,175,0.5)', fontWeight: 700 }}
            onClick={() => navigate('/chatbot')}
          >
            🛡️ Grounded Research Tutor
          </button>
        </div>
      </div>

      {/* Cloned Repository Database Setup Notice */}
      {setup?.database?.setupRequired && (
        <div
          style={{
            background: 'rgba(254, 255, 175, 0.20)',
            border: '1px solid rgba(120, 162, 210, 0.4)',
            borderRadius: 12,
            padding: '14px 18px',
            marginBottom: 18,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12
          }}
        >
          <span style={{ fontSize: 20 }}>🛡️</span>
          <div style={{ flex: 1, fontSize: 12.5, color: 'var(--ink)' }}>
            <div style={{ fontWeight: 700, marginBottom: 2 }}>
              Repository Data Mode: Multi-Tenant Isolated Storage
            </div>
            <div style={{ color: 'var(--ink2)', lineHeight: 1.5 }}>
              Your session is securely isolated with multi-tenant workspace credentials. To connect a permanent MongoDB Atlas cluster, configure <code>MONGODB_URI</code> in <code>backend/.env</code>.
            </div>
          </div>
        </div>
      )}

      {/* Key Academic Metrics */}
      <div className="g4" style={{ marginBottom: 20 }}>
        {[
          { label: 'Textbooks & Books', val: stats.documentsUploaded || 0, icon: '📚' },
          { label: 'Academic Notes', val: stats.notesGenerated || 0, icon: '📖' },
          { label: 'Assessments & Cards', val: stats.flashcardsCreated || 0, icon: '🎯' },
          { label: 'Active AI Modules', val: 11, icon: '🏛️' }
        ].map((s, i) => (
          <div key={i} className="sc" style={{ border: '1.5px solid var(--bdr)' }}>
            <div style={{ fontSize: 22, marginBottom: 8 }}>{s.icon}</div>
            <div className="sv" style={{ color: 'var(--brand)', fontWeight: 800 }}>{s.val}</div>
            <div className="sl">{s.label}</div>
          </div>
        ))}
      </div>

      {/* 11 Core University Modules Showcase */}
      <div className="sec" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 className="st" style={{ margin: 0, padding: 0, fontSize: 16 }}>
              🎓 11 University Academic Learning Modules
            </h2>
            <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 2 }}>
              Everything generated from your uploaded curriculum source material
            </div>
          </div>
        </div>
      </div>

      <div className="tools-grid">
        {MODULES.map((t, i) => (
          <div
            key={i}
            className="fc"
            onClick={() => navigate(t.path)}
            style={{
              border: '1.5px solid var(--bdr)',
              transition: 'all 0.2s ease',
              cursor: 'pointer'
            }}
          >
            {t.badge && (
              <span
                className="bn"
                style={{
                  position: 'absolute',
                  top: 11,
                  right: 11,
                  fontSize: 10,
                  fontWeight: 800,
                  background: '#FEFFAF',
                  color: '#242D00'
                }}
              >
                {t.badge}
              </span>
            )}
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: t.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 22,
                marginBottom: 12
              }}
            >
              {t.icon}
            </div>
            <div style={{ fontFamily: 'Sora, sans-serif', fontSize: 13.5, fontWeight: 700, marginBottom: 4, color: 'var(--ink)' }}>
              {t.title}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--ink3)', lineHeight: 1.5 }}>
              {t.desc}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
