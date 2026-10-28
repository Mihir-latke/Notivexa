import { useState, useEffect, useRef } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'

const STYLES = [
  { id: 'realistic_cinematic', label: 'Realistic Cinematic', icon: '🎥', desc: 'University classroom with professor, student & visual board' },
  { id: 'animated_explainer', label: 'Animated Explainer', icon: '🎨', desc: 'Clean vector illustration with bold visual emphasis' },
  { id: 'educational_documentary', label: 'Educational Documentary', icon: '🏛️', desc: 'Rich archival and authoritative documentary framing' },
  { id: '3d_simulation', label: '3D Simulation', icon: '🔬', desc: 'Scientific 3D models, anatomical and technical diagrams' },
  { id: 'blackboard_lecture', label: 'Blackboard Lecture', icon: '🧑‍🏫', desc: 'Authentic chalkboard equations and step-by-step notes' }
]

const AUDIENCES = [
  { id: 'beginner', label: 'Beginner', desc: 'Simple analogies & clear basics' },
  { id: 'intermediate', label: 'Intermediate', desc: 'Standard syllabus depth & definitions' },
  { id: 'advanced', label: 'Advanced', desc: 'Rigorous derivations & exam tips' }
]

const LANGUAGES = [
  { code: 'auto', name: 'Auto-detect Document Language' },
  { code: 'mr', name: 'Marathi (मराठी)' },
  { code: 'en', name: 'English' },
  { code: 'hi', name: 'Hindi (हिन्दी)' },
  { code: 'gu', name: 'Gujarati (ગુજરાતી)' },
  { code: 'ta', name: 'Tamil (தமிழ்)' },
  { code: 'te', name: 'Telugu (తెలుగు)' },
  { code: 'kn', name: 'Kannada (ಕನ್ನಡ)' },
  { code: 'bn', name: 'Bengali (বাংলা)' },
  { code: 'ur', name: 'Urdu (اردو)' }
]

const DURATIONS = [
  { seconds: 6, label: '6s (Quick Clip)', scenes: 1 },
  { seconds: 12, label: '12s (Micro Lecture)', scenes: 2 },
  { seconds: 18, label: '18s (Deep Concept)', scenes: 3 },
  { seconds: 24, label: '24s (Full Topic)', scenes: 4 }
]

export default function VideoStudio() {
  // Global & Capabilities State
  const [capabilities, setCapabilities] = useState(null)
  const [docs, setDocs] = useState([])
  const [historyJobs, setHistoryJobs] = useState([])
  const [loadingDocs, setLoadingDocs] = useState(true)

  // Step 1: Content Source
  const [sourceType, setSourceType] = useState('book') // 'book' | 'notes' | 'custom'
  const [selectedDocId, setSelectedDocId] = useState('')
  const [selectedSection, setSelectedSection] = useState('')
  const [customTitle, setCustomTitle] = useState('')
  const [customText, setCustomText] = useState('')

  // Step 2: Configuration
  const [visualStyle, setVisualStyle] = useState('realistic_cinematic')
  const [audienceLevel, setAudienceLevel] = useState('intermediate')
  const [outputLanguage, setOutputLanguage] = useState('auto')
  const [durationSeconds, setDurationSeconds] = useState(18)
  const [aspectRatio, setAspectRatio] = useState('16:9')
  const [includeNarration, setIncludeNarration] = useState(true)
  const [includeSubtitles, setIncludeSubtitles] = useState(true)

  // Step 3: Storyboard
  const [draftingStoryboard, setDraftingStoryboard] = useState(false)
  const [storyboard, setStoryboard] = useState(null)
  const [activeSceneTab, setActiveSceneTab] = useState(0)

  // Step 4: Active Job Execution
  const [activeJob, setActiveJob] = useState(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const pollTimerRef = useRef(null)

  // Load Capabilities, Documents, and Job History
  useEffect(() => {
    fetchCapabilities()
    fetchDocs()
    fetchJobs()
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    }
  }, [])

  const fetchCapabilities = async () => {
    try {
      const res = await api.get('/video-studio/capabilities')
      if (res.data?.success) setCapabilities(res.data)
    } catch (err) {
      console.warn('Could not fetch video capabilities:', err.message)
    }
  }

  const fetchDocs = async () => {
    try {
      setLoadingDocs(true)
      const res = await api.get('/documents')
      const items = res.data?.documents || res.data || []
      setDocs(Array.isArray(items) ? items : [])
      if (items.length > 0 && !selectedDocId) {
        setSelectedDocId((items[0]._id || items[0].id).toString())
      }
    } catch (err) {
      console.warn('Could not fetch documents:', err.message)
    } finally {
      setLoadingDocs(false)
    }
  }

  const fetchJobs = async () => {
    try {
      const res = await api.get('/video-studio/jobs')
      if (res.data?.jobs) setHistoryJobs(res.data.jobs)
    } catch (err) {
      console.warn('Could not fetch video jobs:', err.message)
    }
  }

  const selectedDoc = docs.find(d => (d._id || d.id || '').toString() === selectedDocId)

  // Handle Draft Storyboard
  const handleDraftStoryboard = async () => {
    if (sourceType !== 'custom' && !selectedDocId) {
      toast.error('Please select a document from your library.')
      return
    }
    if (sourceType === 'custom' && (!customTitle.trim() || !customText.trim())) {
      toast.error('Please enter a topic title and lesson content.')
      return
    }

    try {
      setDraftingStoryboard(true)
      setStoryboard(null)

      const payload = {
        sourceType,
        docId: selectedDocId,
        sectionIndex: selectedSection !== '' ? parseInt(selectedSection) : null,
        customTitle: customTitle.trim(),
        customText: customText.trim(),
        visualStyle,
        audienceLevel,
        outputLanguage,
        durationSeconds: parseInt(durationSeconds) || 18,
        aspectRatio
      }

      const res = await api.post('/video-studio/storyboard', payload)
      if (res.data?.success && res.data.storyboard) {
        setStoryboard(res.data.storyboard)
        setActiveSceneTab(0)
        toast.success(`🎬 Drafted ${res.data.storyboard.scenes?.length || 0} scenes storyboard!`)
      } else {
        toast.error('Failed to draft storyboard. Please try again.')
      }
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Error generating storyboard.')
    } finally {
      setDraftingStoryboard(false)
    }
  }

  // Update a scene in the editable storyboard
  const handleSceneEdit = (index, field, value) => {
    if (!storyboard || !storyboard.scenes) return
    const updated = [...storyboard.scenes]
    updated[index] = { ...updated[index], [field]: value }
    setStoryboard({ ...storyboard, scenes: updated })
  }

  // Handle Start Generation
  const handleStartGeneration = async () => {
    if (sourceType !== 'custom' && !selectedDocId) {
      toast.error('Please select a document first.')
      return
    }

    try {
      setIsGenerating(true)
      const payload = {
        sourceType,
        docId: selectedDocId,
        sectionIndex: selectedSection !== '' ? parseInt(selectedSection) : null,
        customTitle: customTitle.trim(),
        customText: customText.trim(),
        visualStyle,
        audienceLevel,
        outputLanguage,
        durationSeconds: parseInt(durationSeconds) || 18,
        aspectRatio,
        includeNarration,
        includeSubtitles,
        storyboard: storyboard || null
      }

      const res = await api.post('/video-studio/generate', payload)
      if (res.data?.success && res.data.job) {
        setActiveJob(res.data.job)
        toast.success('🚀 Video rendering job initiated!')
        startPollingJob(res.data.job.jobId)
      } else {
        toast.error('Could not initiate video generation.')
        setIsGenerating(false)
      }
    } catch (err) {
      setIsGenerating(false)
      toast.error(err.response?.data?.error || err.message || 'Generation failed.')
    }
  }

  // Poll Job Status every 2 seconds
  const startPollingJob = (jobId) => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current)

    pollTimerRef.current = setInterval(async () => {
      try {
        const res = await api.get(`/video-studio/jobs/${jobId}`)
        if (res.data?.job) {
          const job = res.data.job
          setActiveJob(job)
          if (job.status === 'completed') {
            clearInterval(pollTimerRef.current)
            setIsGenerating(false)
            toast.success('🎉 Educational Video Generated Successfully!')
            fetchJobs()
          } else if (job.status === 'failed') {
            clearInterval(pollTimerRef.current)
            setIsGenerating(false)
            toast.error(job.errorMessage || 'Video generation failed.')
            fetchJobs()
          }
        }
      } catch (err) {
        console.warn('Polling error:', err.message)
      }
    }, 2000)
  }

  // Delete Job
  const handleDeleteJob = async (jobId, e) => {
    e.stopPropagation()
    if (!window.confirm('Delete this video job?')) return
    try {
      await api.delete(`/video-studio/jobs/${jobId}`)
      toast.success('Video job deleted.')
      if (activeJob?.jobId === jobId) setActiveJob(null)
      fetchJobs()
    } catch (err) {
      toast.error('Could not delete video job.')
    }
  }

  const getMediaUrlWithToken = (url) => {
    if (!url) return ''
    const token = localStorage.getItem('ntv_token')
    let clean = url
    if (clean.includes('token=')) {
      clean = clean.replace(/([?&])token=[^&]+(&|$)/, '$1').replace(/[?&]$/, '')
    }
    if (!token) return clean
    return `${clean}${clean.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 40 }}>
      {/* Header Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, #0F172A 0%, #1E1B4B 60%, #312E81 100%)',
          borderRadius: 18,
          padding: '24px 28px',
          color: '#fff',
          marginBottom: 20,
          boxShadow: '0 10px 30px rgba(15,23,42,0.18)',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 28 }}>🎬</span>
              <h1 style={{ fontFamily: 'Sora, sans-serif', fontSize: 22, fontWeight: 800, margin: 0 }}>
                AI Educational Video Studio
              </h1>
              <span
                style={{
                  background: 'rgba(16, 185, 129, 0.2)',
                  color: '#34D399',
                  border: '1px solid rgba(16, 185, 129, 0.4)',
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 20
                }}
              >
                PRO VID ENGINE
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: '#CBD5E1', maxWidth: 640, lineHeight: 1.5 }}>
              Generate grounded educational video lectures directly from your textbooks, notes, and lessons.
              Synthesizes multi-scene storyboards, realistic academic visuals, synchronized Devanagari/multilingual subtitles, and crystal-clear voiceovers.
            </p>
          </div>

          {/* Engine Capability Badge */}
          {capabilities && (
            <div
              style={{
                background: 'rgba(255,255,255,0.08)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 12,
                padding: '10px 14px',
                minWidth: 200
              }}
            >
              <div style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>
                Active Video Core
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#F8FAFC', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: capabilities.hasVeoAccess ? '#10B981' : '#60A5FA' }} />
                {capabilities.hasVeoAccess ? `Google Veo (${capabilities.activeModel})` : 'Dynamic Scene Motion Engine'}
              </div>
              <div style={{ fontSize: 11, color: '#A5B4FC', marginTop: 4 }}>
                Full HD 1080p • 16:9 / 9:16 • 15+ Languages
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 440px) 1fr', gap: 20 }}>
        {/* Left Column: Input Source & Settings */}
        <div>
          {/* Step 1: Content Source */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="ch">
              <div className="ct">📚 1. Select Content Source</div>
            </div>
            <div className="cb">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
                <button
                  type="button"
                  className={`btn btn-sm ${sourceType === 'book' ? 'btn-p' : 'btn-s'}`}
                  onClick={() => setSourceType('book')}
                >
                  📖 Book/PDF
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${sourceType === 'notes' ? 'btn-p' : 'btn-s'}`}
                  onClick={() => setSourceType('notes')}
                >
                  📝 Notes
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${sourceType === 'custom' ? 'btn-p' : 'btn-s'}`}
                  onClick={() => setSourceType('custom')}
                >
                  ✍️ Custom Text
                </button>
              </div>

              {sourceType !== 'custom' ? (
                <>
                  <div className="fg">
                    <label className="fl">Uploaded Book or Document</label>
                    {loadingDocs ? (
                      <div style={{ fontSize: 12, color: 'var(--ink3)' }}>Loading library documents...</div>
                    ) : (
                      <select
                        className="fi"
                        value={selectedDocId}
                        onChange={e => setSelectedDocId(e.target.value)}
                      >
                        <option value="">- Select a document -</option>
                        {docs.map(d => (
                          <option key={d._id || d.id} value={d._id || d.id}>
                            {d.title || d.originalName} ({d.primaryLanguage || 'English'})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {selectedDoc?.sections && selectedDoc.sections.length > 0 && (
                    <div className="fg">
                      <label className="fl">Chapter / Section Focus</label>
                      <select
                        className="fi"
                        value={selectedSection}
                        onChange={e => setSelectedSection(e.target.value)}
                      >
                        <option value="">Entire Document Concept Overview</option>
                        {selectedDoc.sections.map((s, idx) => (
                          <option key={idx} value={idx}>
                            Section {idx + 1}: {(s.title || s.heading || `Page ${idx + 1}`).slice(0, 45)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="fg">
                    <label className="fl">Topic / Lecture Title</label>
                    <input
                      type="text"
                      className="fi"
                      placeholder="e.g. Newton's Laws of Motion or भारतीय राज्यघटना"
                      value={customTitle}
                      onChange={e => setCustomTitle(e.target.value)}
                    />
                  </div>
                  <div className="fg">
                    <label className="fl">Lesson Content / Core Principles</label>
                    <textarea
                      className="fi"
                      rows={5}
                      placeholder="Enter the educational concepts, formulas, or explanation to generate the video lecture from..."
                      value={customText}
                      onChange={e => setCustomText(e.target.value)}
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Step 2: Video Configuration */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="ch">
              <div className="ct">⚙️ 2. Video Lecture Styling</div>
            </div>
            <div className="cb">
              {/* Output Language */}
              <div className="fg">
                <label className="fl">🌐 Narration & Subtitle Language</label>
                <select
                  className="fi"
                  value={outputLanguage}
                  onChange={e => setOutputLanguage(e.target.value)}
                >
                  {LANGUAGES.map(l => (
                    <option key={l.code} value={l.code}>{l.name}</option>
                  ))}
                </select>
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  {['auto', 'mr', 'en', 'hi'].map(c => {
                    const lObj = LANGUAGES.find(x => x.code === c)
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setOutputLanguage(c)}
                        style={{
                          fontSize: 11,
                          padding: '3px 8px',
                          borderRadius: 6,
                          border: outputLanguage === c ? '1px solid var(--brand)' : '1px solid var(--bdr)',
                          background: outputLanguage === c ? 'var(--brand)' : 'var(--bg2)',
                          color: outputLanguage === c ? '#fff' : 'var(--ink2)',
                          cursor: 'pointer'
                        }}
                      >
                        {lObj?.name.split(' ')[0]}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Visual Style */}
              <div className="fg">
                <label className="fl">🎨 Visual Presentation Style</label>
                <select
                  className="fi"
                  value={visualStyle}
                  onChange={e => setVisualStyle(e.target.value)}
                >
                  {STYLES.map(s => (
                    <option key={s.id} value={s.id}>{s.icon} {s.label}</option>
                  ))}
                </select>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 4 }}>
                  {STYLES.find(s => s.id === visualStyle)?.desc}
                </div>
              </div>

              {/* Audience Level & Duration */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="fg">
                  <label className="fl">🎯 Audience Level</label>
                  <select
                    className="fi"
                    value={audienceLevel}
                    onChange={e => setAudienceLevel(e.target.value)}
                  >
                    {AUDIENCES.map(a => (
                      <option key={a.id} value={a.id}>{a.label}</option>
                    ))}
                  </select>
                </div>
                <div className="fg">
                  <label className="fl">⏱️ Target Duration</label>
                  <select
                    className="fi"
                    value={durationSeconds}
                    onChange={e => setDurationSeconds(Number(e.target.value))}
                  >
                    {DURATIONS.map(d => (
                      <option key={d.seconds} value={d.seconds}>{d.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Aspect Ratio & Features */}
              <div className="fg">
                <label className="fl">📐 Frame Aspect Ratio</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <button
                    type="button"
                    className={`btn btn-sm ${aspectRatio === '16:9' ? 'btn-p' : 'btn-s'}`}
                    onClick={() => setAspectRatio('16:9')}
                  >
                    🖥️ 16:9 Landscape
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${aspectRatio === '9:16' ? 'btn-p' : 'btn-s'}`}
                    onClick={() => setAspectRatio('9:16')}
                  >
                    📱 9:16 Portrait
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={includeNarration}
                    onChange={e => setIncludeNarration(e.target.checked)}
                  />
                  <span>Voiceover Audio</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={includeSubtitles}
                    onChange={e => setIncludeSubtitles(e.target.checked)}
                  />
                  <span>Devanagari / English Subtitles</span>
                </label>
              </div>

              {/* Action Buttons */}
              <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-s wf"
                  onClick={handleDraftStoryboard}
                  disabled={draftingStoryboard || isGenerating}
                >
                  {draftingStoryboard ? '📋 Drafting Storyboard...' : '📋 Draft Storyboard First'}
                </button>
                <button
                  type="button"
                  className="btn btn-p btn-lg wf"
                  onClick={handleStartGeneration}
                  disabled={isGenerating || draftingStoryboard}
                  style={{ background: 'linear-gradient(135deg, #4F46E5, #7C3AED)' }}
                >
                  {isGenerating ? '⏳ Generating Video...' : '🎬 Generate AI Educational Video'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Storyboard, Video Player & Job Status */}
        <div>
          {/* Active Job Progress Bar */}
          {activeJob && activeJob.status === 'processing' && (
            <div className="card" style={{ marginBottom: 16, border: '1px solid var(--brand)', background: 'rgba(79,70,229,0.03)' }}>
              <div className="cb">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className="dot" style={{ animation: 'pulse 1s infinite' }} />
                    <span style={{ fontWeight: 700, fontSize: 14 }}>
                      {activeJob.currentStep || 'Rendering Educational Video Lecture...'}
                    </span>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--brand)' }}>
                    {activeJob.progress || 10}%
                  </span>
                </div>
                <div style={{ width: '100%', height: 8, background: 'var(--bg2)', borderRadius: 4, overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${activeJob.progress || 10}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #4F46E5, #10B981)',
                      transition: 'width 0.4s ease'
                    }}
                  />
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 8, textAlign: 'center' }}>
                  Compiling scenes, generating Devanagari text overlays, and mixing educational voiceover...
                </div>
              </div>
            </div>
          )}

          {/* Completed Video Player */}
          {activeJob && activeJob.status === 'completed' && activeJob.finalVideoUrl && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="ch">
                <div className="ct">🎥 Generated Educational Video</div>
                <span className="chip" style={{ background: '#10B981', color: '#fff' }}>
                  {activeJob.engine === 'google_veo' ? 'Google Veo AI' : 'Real Motion Engine'}
                </span>
              </div>
              <div className="cb">
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 16 }}>
                  <video
                    controls
                    playsInline
                    preload="auto"
                    src={getMediaUrlWithToken(activeJob.finalVideoUrl)}
                    key={activeJob.finalVideoUrl}
                    style={{
                      maxWidth: '100%',
                      width: activeJob.aspectRatio === '9:16' ? 360 : 700,
                      aspectRatio: activeJob.aspectRatio === '9:16' ? '9 / 16' : '16 / 9',
                      borderRadius: 14,
                      background: '#0F172A',
                      boxShadow: '0 12px 32px rgba(0,0,0,0.25)'
                    }}
                  >
                    <source src={getMediaUrlWithToken(activeJob.finalVideoUrl)} type="video/mp4" />
                    Your browser does not support HTML5 video playback.
                  </video>
                  <div style={{ fontSize: 12, color: 'var(--ink3)', marginTop: 8 }}>
                    🎓 Synchronized voiceover narration with subtitle track ({activeJob.language || 'English'}).
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <a
                    href={getMediaUrlWithToken(activeJob.finalVideoUrl)}
                    download={`${activeJob.topic || 'notivexa_lecture'}.mp4`}
                    className="btn btn-p"
                    style={{ textDecoration: 'none' }}
                  >
                    ⬇️ Download MP4 ({((activeJob.fileSize || 0) / (1024 * 1024)).toFixed(1)} MB)
                  </a>
                  <a
                    href={getMediaUrlWithToken(activeJob.finalVideoUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-s"
                    style={{ textDecoration: 'none' }}
                  >
                    ↗️ Open Fullscreen
                  </a>
                  <button
                    type="button"
                    className="btn btn-s"
                    onClick={handleStartGeneration}
                  >
                    🔄 Regenerate Video
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Interactive Storyboard Card */}
          {storyboard && storyboard.scenes && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="ch">
                <div className="ct">📋 Course Storyboard & Scene Direction</div>
                <span className="chip">{storyboard.scenes.length} Scenes</span>
              </div>
              <div className="cb">
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink1)', marginBottom: 4 }}>
                    {storyboard.topic || 'Core Academic Topic'}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink3)' }}>
                    🎯 Objective: {storyboard.learningObjective || 'Foundational syllabus mastery'}
                  </div>
                </div>

                {/* Scene Tabs */}
                <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid var(--bdr)', paddingBottom: 8, marginBottom: 14 }}>
                  {storyboard.scenes.map((s, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setActiveSceneTab(idx)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 6,
                        border: activeSceneTab === idx ? '1px solid var(--brand)' : '1px solid var(--bdr)',
                        background: activeSceneTab === idx ? 'var(--brand)' : 'var(--bg2)',
                        color: activeSceneTab === idx ? '#fff' : 'var(--ink2)',
                        fontWeight: 600,
                        fontSize: 12,
                        cursor: 'pointer'
                      }}
                    >
                      Scene {s.sceneNumber || idx + 1} ({s.duration || 6}s)
                    </button>
                  ))}
                </div>

                {/* Active Scene Content */}
                {storyboard.scenes[activeSceneTab] && (() => {
                  const s = storyboard.scenes[activeSceneTab]
                  return (
                    <div>
                      <div className="fg">
                        <label className="fl">🎯 Learning Objective</label>
                        <input
                          type="text"
                          className="fi"
                          value={s.learningObjective || ''}
                          onChange={e => handleSceneEdit(activeSceneTab, 'learningObjective', e.target.value)}
                        />
                      </div>
                      <div className="fg">
                        <label className="fl">🎬 Visual Prompt (Veo / Camera Motion Direction)</label>
                        <textarea
                          className="fi"
                          rows={3}
                          value={s.visualPrompt || ''}
                          onChange={e => handleSceneEdit(activeSceneTab, 'visualPrompt', e.target.value)}
                        />
                      </div>
                      <div className="fg">
                        <label className="fl">🎙️ Spoken Narration Script ({storyboard.language || 'Target Language'})</label>
                        <textarea
                          className="fi"
                          rows={3}
                          value={s.narrationScript || ''}
                          onChange={e => handleSceneEdit(activeSceneTab, 'narrationScript', e.target.value)}
                        />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div className="fg">
                          <label className="fl">📝 On-Screen Text</label>
                          <input
                            type="text"
                            className="fi"
                            value={s.onScreenText || ''}
                            onChange={e => handleSceneEdit(activeSceneTab, 'onScreenText', e.target.value)}
                          />
                        </div>
                        <div className="fg">
                          <label className="fl">🎥 Camera Direction</label>
                          <input
                            type="text"
                            className="fi"
                            value={s.cameraDirection || ''}
                            onChange={e => handleSceneEdit(activeSceneTab, 'cameraDirection', e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>
          )}

          {/* Past Video Jobs History */}
          <div className="card">
            <div className="ch">
              <div className="ct">🕒 Generation History</div>
              <span className="chip">{historyJobs.length} Videos</span>
            </div>
            <div className="cb">
              {historyJobs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--ink3)', fontSize: 13 }}>
                  No video lectures generated yet. Select a document on the left to start!
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {historyJobs.map(j => (
                    <div
                      key={j.jobId}
                      style={{
                        padding: 12,
                        borderRadius: 10,
                        border: '1px solid var(--bdr)',
                        background: activeJob?.jobId === j.jobId ? 'rgba(79,70,229,0.05)' : 'transparent',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        cursor: 'pointer'
                      }}
                      onClick={() => setActiveJob(j)}
                    >
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--ink1)' }}>
                          {j.topic || j.docTitle || 'Educational Video'}
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink3)', marginTop: 2 }}>
                          {j.duration || 18}s • {j.language || 'English'} • {j.visualStyle?.replace('_', ' ')} • {new Date(j.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span
                          className="chip"
                          style={{
                            background: j.status === 'completed' ? '#10B981' : j.status === 'failed' ? '#EF4444' : '#F59E0B',
                            color: '#fff',
                            fontSize: 10
                          }}
                        >
                          {j.status}
                        </span>
                        <button
                          type="button"
                          className="btn btn-s btn-sm"
                          style={{ color: '#EF4444', padding: '4px 8px' }}
                          onClick={(e) => handleDeleteJob(j.jobId, e)}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

