import { useState, useEffect, useRef } from 'react'
import SpeechRecognitionService from '../services/voice/SpeechRecognitionService'
import TextToSpeechService from '../services/voice/TextToSpeechService'
import AudioPlaybackManager from '../services/voice/AudioPlaybackManager'
import VoiceSessionManager from '../services/voice/VoiceSessionManager'
import api from '../utils/api'
import toast from 'react-hot-toast'

export default function VoiceChatModal({
  isOpen,
  onClose,
  selectedDoc,
  docId,
  sessId,
  strictGrounded,
  chatLang = 'auto',
  onMessageSent,
  history = []
}) {
  const [voiceState, setVoiceState] = useState('idle') // 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking' | 'interrupted' | 'error'
  const [transcript, setTranscript] = useState('')
  const [liveSentence, setLiveSentence] = useState('')
  const [activeSpeechText, setActiveSpeechText] = useState('')
  const [activeCitations, setActiveCitations] = useState([])
  const [elapsedTime, setElapsedTime] = useState('00:00')
  const [volumeLevel, setVolumeLevel] = useState(0) // 0.0 to 1.0
  const [continuousMode, setContinuousMode] = useState(true)
  const [speakingSpeed, setSpeakingSpeed] = useState(1.0)
  const [voiceEngine, setVoiceEngine] = useState('browser') // 'browser' | 'neural_hd'
  const [selectedVoiceName, setSelectedVoiceName] = useState('')
  const [availableVoices, setAvailableVoices] = useState([])
  const [showSettings, setShowSettings] = useState(false)
  const [showTranscriptDrawer, setShowTranscriptDrawer] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const sessionRef = useRef(null)

  // Format seconds to MM:SS
  const formatTime = (secs) => {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  // Subscribe to VoiceSessionManager
  useEffect(() => {
    if (!isOpen) return

    VoiceSessionManager.startSession()
    VoiceSessionManager.continuous = continuousMode

    const unsub = VoiceSessionManager.subscribe((data) => {
      if (data.state) setVoiceState(data.state)
      if (data.elapsedSeconds !== undefined) setElapsedTime(formatTime(data.elapsedSeconds))
      if (data.type === 'volume') setVolumeLevel(data.volume || 0)
      if (data.transcript !== undefined) setTranscript(data.transcript)
      if (data.type === 'sentence') setLiveSentence(data.sentence || '')
      if (data.error) setErrorMessage(data.error)
    })

    const voices = TextToSpeechService.getAvailableVoices()
    setAvailableVoices(voices)

    // Automatically prompt listening when modal opens
    setTimeout(() => {
      startListening()
    }, 400)

    return () => {
      unsub()
      VoiceSessionManager.endSession()
    }
  }, [isOpen])

  // Sync continuous mode preference
  useEffect(() => {
    VoiceSessionManager.continuous = continuousMode
  }, [continuousMode])

  if (!isOpen) return null

  // Handle Speech Recognition Input
  const startListening = () => {
    setErrorMessage('')
    setTranscript('')
    setLiveSentence('')

    VoiceSessionManager.startListening({
      language: chatLang,
      onTranscription: (interim) => {
        setTranscript(interim)
      },
      onFinalSpeech: async (finalText) => {
        setTranscript(finalText)
        await handleSendQuestion(finalText)
      },
      onError: (err) => {
        setErrorMessage(err.message || 'Microphone error')
      }
    })
  }

  // Send recognized voice question to existing RAG Chatbot API
  const handleSendQuestion = async (userQuestion) => {
    const q = (userQuestion || transcript).trim()
    if (!q) {
      VoiceSessionManager.setState('idle')
      return
    }

    VoiceSessionManager.setState('thinking')

    try {
      const res = await api.post('/chatbot/message', {
        message: q,
        documentId: docId || undefined,
        sessionId: sessId,
        outputLanguage: chatLang,
        allowGeneralKnowledge: !strictGrounded
      })

      const reply = res.data?.reply || 'I am ready to assist with your next academic inquiry.'
      const citations = res.data?.citations || []

      setActiveSpeechText(reply)
      setActiveCitations(citations)

      // Notify parent to append to main chat history
      if (typeof onMessageSent === 'function') {
        onMessageSent({
          userQuestion: q,
          assistantReply: reply,
          citations,
          passages: res.data?.passages || [],
          sessionId: res.data?.sessionId
        })
      }

      // If Neural HD Voice engine is selected, fetch server audio
      if (voiceEngine === 'neural_hd') {
        try {
          const ttsRes = await api.post('/chatbot/tts', {
            text: reply,
            language: chatLang,
            speed: speakingSpeed
          })

          if (ttsRes.data?.audioUrl) {
            VoiceSessionManager.setState('speaking')
            await AudioPlaybackManager.playUrl(ttsRes.data.audioUrl, {
              onEnd: () => {
                if (continuousMode) {
                  setTimeout(() => startListening(), 500)
                } else {
                  VoiceSessionManager.setState('idle')
                }
              },
              onError: () => {
                // Fallback to browser SpeechSynthesis
                speakWithBrowser(reply)
              }
            })
            return
          }
        } catch (neuralErr) {
          console.warn('[Neural HD Voice Fallback to Browser]:', neuralErr.message)
        }
      }

      // Speak using Browser Web Speech API
      speakWithBrowser(reply)
    } catch (err) {
      setErrorMessage('Failed to retrieve answer from knowledge base. Please try again.')
      VoiceSessionManager.setState('error')
    }
  }

  const speakWithBrowser = (replyText) => {
    VoiceSessionManager.speakResponse(replyText, {
      language: chatLang,
      rate: speakingSpeed,
      voiceName: selectedVoiceName || null,
      onSentenceStart: ({ sentence }) => {
        setLiveSentence(sentence)
      },
      onComplete: ({ autoListen }) => {
        if (autoListen && continuousMode) {
          startListening()
        }
      }
    })
  }

  // Interrupt AI Speech
  const handleInterrupt = () => {
    VoiceSessionManager.interrupt()
    setLiveSentence('')
    toast('Audio interrupted', { icon: '⏹️' })
    if (continuousMode) {
      setTimeout(() => startListening(), 300)
    }
  }

  // Status Badge Label & Color
  const getStatusBadge = () => {
    switch (voiceState) {
      case 'listening':
        return { label: 'Listening...', color: '#10B981', bg: 'rgba(16, 185, 129, 0.2)' }
      case 'transcribing':
        return { label: 'Hearing You...', color: '#34D399', bg: 'rgba(52, 211, 153, 0.2)' }
      case 'thinking':
        return { label: 'Retrieving Textbook Knowledge...', color: '#FEFFAF', bg: 'rgba(254, 255, 175, 0.15)' }
      case 'speaking':
        return { label: 'Notivexa Speaking', color: '#78A2D2', bg: 'rgba(120, 162, 210, 0.2)' }
      case 'interrupted':
        return { label: 'Interrupted', color: '#F87171', bg: 'rgba(239, 68, 68, 0.15)' }
      case 'error':
        return { label: 'Notice', color: '#EF4444', bg: 'rgba(239, 68, 68, 0.2)' }
      default:
        return { label: 'Ready • Tap Mic to Speak', color: '#94A3B8', bg: 'rgba(148, 163, 184, 0.15)' }
    }
  }

  const status = getStatusBadge()

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(6, 18, 13, 0.94)',
        backdropFilter: 'blur(16px)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '20px 24px',
        color: '#F8FAFC',
        fontFamily: 'Inter, sans-serif'
      }}
    >
      {/* Top Header Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          maxWidth: 960,
          margin: '0 auto',
          width: '100%'
        }}
      >
        {/* Left: Document Grounding Pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              background: 'linear-gradient(135deg, #10B981, #047857)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)'
            }}
          >
            🎓
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, color: '#F8FAFC', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>Notivexa Voice Tutor</span>
              <span
                style={{
                  fontSize: 11,
                  background: status.bg,
                  color: status.color,
                  border: `1px solid ${status.color}`,
                  borderRadius: 12,
                  padding: '2px 8px',
                  fontWeight: 700
                }}
              >
                {status.label}
              </span>
            </div>
            <div style={{ fontSize: 12, color: '#A7F3D0', marginTop: 2 }}>
              {selectedDoc ? `📖 ${selectedDoc.title}` : '🌐 General Academic Knowledge'}
              {strictGrounded && ' • 🛡️ Strict Anti-Hallucination'}
            </div>
          </div>
        </div>

        {/* Right: Timer & Header Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: 20,
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 700,
              color: '#CBD5E1',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: voiceState === 'listening' ? '#10B981' : '#64748B' }} />
            ⏱️ {elapsedTime}
          </div>

          <button
            type="button"
            className="btn btn-s btn-sm"
            onClick={() => setShowTranscriptDrawer(!showTranscriptDrawer)}
            style={{ background: 'rgba(255, 255, 255, 0.08)', color: '#F8FAFC', border: '1px solid rgba(255, 255, 255, 0.2)' }}
            title="View recent conversation history"
          >
            💬 Transcript
          </button>

          <button
            type="button"
            className="btn btn-s btn-sm"
            onClick={() => setShowSettings(!showSettings)}
            style={{ background: 'rgba(255, 255, 255, 0.08)', color: '#F8FAFC', border: '1px solid rgba(255, 255, 255, 0.2)' }}
            title="Voice & Language Settings"
          >
            ⚙️ Settings
          </button>

          <button
            type="button"
            className="btn btn-s btn-sm"
            onClick={onClose}
            style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#FCA5A5', border: '1px solid rgba(239, 68, 68, 0.4)', fontWeight: 700 }}
          >
            ✕ End Session
          </button>
        </div>
      </div>

      {/* Center Stage: Animated Voice Orb & Reactive Waveform */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          maxWidth: 680,
          margin: '0 auto',
          width: '100%',
          textAlign: 'center',
          padding: '20px 0'
        }}
      >
        {/* Animated Central Voice Orb */}
        <div
          style={{
            position: 'relative',
            width: 180,
            height: 180,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 28
          }}
        >
          {/* Outer Pulsing Glow Rings */}
          <div
            style={{
              position: 'absolute',
              inset: -15 - (volumeLevel * 30),
              borderRadius: '50%',
              background: voiceState === 'listening'
                ? 'radial-gradient(circle, rgba(16, 185, 129, 0.35) 0%, rgba(16, 185, 129, 0) 70%)'
                : (voiceState === 'speaking'
                  ? 'radial-gradient(circle, rgba(120, 162, 210, 0.4) 0%, rgba(120, 162, 210, 0) 70%)'
                  : 'radial-gradient(circle, rgba(16, 185, 129, 0.15) 0%, rgba(16, 185, 129, 0) 70%)'),
              transition: 'all 0.15s ease',
              animation: voiceState === 'thinking' ? 'spin 3s linear infinite' : 'pulse 2.2s infinite'
            }}
          />

          {/* Secondary Concentric Ripple */}
          <div
            style={{
              position: 'absolute',
              inset: -6 - (volumeLevel * 15),
              borderRadius: '50%',
              border: `2px solid ${voiceState === 'listening' ? 'rgba(52, 211, 153, 0.6)' : (voiceState === 'speaking' ? 'rgba(120, 162, 210, 0.5)' : 'rgba(16, 185, 129, 0.25)')}`,
              transition: 'all 0.15s ease'
            }}
          />

          {/* Central Core Orb */}
          <div
            onClick={() => {
              if (voiceState === 'speaking') {
                handleInterrupt()
              } else if (voiceState === 'listening') {
                SpeechRecognitionService.stop()
                VoiceSessionManager.setState('idle')
              } else {
                startListening()
              }
            }}
            style={{
              width: 140,
              height: 140,
              borderRadius: '50%',
              background: voiceState === 'listening'
                ? 'linear-gradient(135deg, #10B981, #059669)'
                : (voiceState === 'speaking'
                  ? 'linear-gradient(135deg, #5885BA, #78A2D2)'
                  : (voiceState === 'thinking'
                    ? 'linear-gradient(135deg, #059669, #FEFFAF)'
                    : 'linear-gradient(135deg, #064E3B, #065F46)')),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 48,
              cursor: 'pointer',
              boxShadow: '0 10px 32px rgba(0,0,0,0.4)',
              transition: 'all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
              transform: `scale(${1.0 + (volumeLevel * 0.18)})`,
              userSelect: 'none'
            }}
            title={voiceState === 'speaking' ? 'Tap to Interrupt' : (voiceState === 'listening' ? 'Tap to Stop' : 'Tap to Speak')}
          >
            {voiceState === 'listening' && '🎙️'}
            {voiceState === 'transcribing' && '👂'}
            {voiceState === 'thinking' && '🧠'}
            {voiceState === 'speaking' && '🔊'}
            {voiceState === 'interrupted' && '⏹️'}
            {voiceState === 'error' && '⚠️'}
            {voiceState === 'idle' && '🎙️'}
          </div>
        </div>

        {/* Live Audio Reactive Frequency Waveform */}
        {voiceState === 'listening' && (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center', height: 28, marginBottom: 16 }}>
            {[0.4, 0.7, 1.0, 0.8, 0.5, 0.9, 0.6, 0.3].map((f, i) => (
              <span
                key={i}
                style={{
                  width: 4,
                  height: Math.max(6, Math.min(28, (volumeLevel * 45 * f))),
                  background: '#34D399',
                  borderRadius: 2,
                  transition: 'height 0.08s ease'
                }}
              />
            ))}
          </div>
        )}

        {/* Live Speech Recognition Transcript Card */}
        {transcript && (
          <div
            style={{
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: 12,
              padding: '10px 18px',
              fontSize: 15,
              fontWeight: 600,
              color: '#A7F3D0',
              marginBottom: 14,
              maxWidth: 580,
              lineHeight: 1.5,
              animation: 'fadeIn 0.2s ease'
            }}
          >
            <span style={{ color: '#FEFFAF', marginRight: 6 }}>You:</span>
            <span>"{transcript}"</span>
          </div>
        )}

        {/* Current Spoken AI Sentence & Highlighting */}
        {voiceState === 'speaking' && liveSentence && (
          <div
            style={{
              background: 'rgba(120, 162, 210, 0.12)',
              border: '1px solid rgba(120, 162, 210, 0.35)',
              borderRadius: 14,
              padding: '14px 20px',
              fontSize: 16,
              lineHeight: 1.6,
              color: '#F8FAFC',
              marginBottom: 14,
              maxWidth: 620,
              boxShadow: '0 4px 20px rgba(0,0,0,0.25)'
            }}
          >
            <span style={{ color: '#78A2D2', fontWeight: 800, marginRight: 8 }}>🎓 Notivexa:</span>
            <span>{liveSentence}</span>

            {/* Source Citations Badges */}
            {activeCitations && activeCitations.length > 0 && (
              <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: '#A5B4FC', fontWeight: 700 }}>📍 Sources:</span>
                {activeCitations.map((c, i) => (
                  <span
                    key={i}
                    style={{
                      fontSize: 11,
                      background: '#FEFFAF',
                      color: '#202B00',
                      fontWeight: 800,
                      borderRadius: 6,
                      padding: '1px 6px'
                    }}
                  >
                    Page {c.page}{c.chapter ? ` · ${c.chapter}` : ''}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Error Notification */}
        {errorMessage && (
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: 10,
              padding: '8px 16px',
              color: '#FCA5A5',
              fontSize: 13,
              marginBottom: 12,
              maxWidth: 520
            }}
          >
            ⚠️ {errorMessage}
            <div style={{ marginTop: 4 }}>
              <button
                type="button"
                className="btn btn-g btn-sm"
                onClick={startListening}
                style={{ fontSize: 11.5, padding: '2px 8px', color: '#fff' }}
              >
                🔄 Try Again
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Action Controls Bar */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 14,
          maxWidth: 600,
          margin: '0 auto',
          width: '100%'
        }}
      >
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
          {/* Main Mic Button */}
          <button
            type="button"
            className="btn btn-p"
            onClick={() => {
              if (voiceState === 'listening') {
                SpeechRecognitionService.stop()
                VoiceSessionManager.setState('idle')
              } else {
                startListening()
              }
            }}
            style={{
              background: voiceState === 'listening' ? '#EF4444' : 'linear-gradient(135deg, #10B981, #059669)',
              color: '#fff',
              fontWeight: 700,
              padding: '10px 22px',
              borderRadius: 24,
              fontSize: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 4px 16px rgba(16, 185, 129, 0.4)'
            }}
          >
            <span>{voiceState === 'listening' ? '🛑 Stop Listening' : '🎙️ Tap to Speak'}</span>
          </button>

          {/* Interrupt Button (Visible during speech) */}
          {voiceState === 'speaking' && (
            <button
              type="button"
              className="btn btn-s"
              onClick={handleInterrupt}
              style={{
                background: 'rgba(239, 68, 68, 0.25)',
                color: '#FCA5A5',
                border: '1px solid rgba(239, 68, 68, 0.5)',
                fontWeight: 700,
                borderRadius: 24,
                padding: '10px 18px',
                fontSize: 14
              }}
            >
              ⏹ Interrupt AI
            </button>
          )}

          {/* Continuous Mode Toggle */}
          <button
            type="button"
            className="btn btn-s"
            onClick={() => {
              setContinuousMode(!continuousMode)
              toast(continuousMode ? 'Continuous mode disabled' : 'Continuous mode enabled: Notivexa will auto-listen after each response', { icon: '🔄' })
            }}
            style={{
              background: continuousMode ? 'rgba(16, 185, 129, 0.18)' : 'rgba(255, 255, 255, 0.08)',
              color: continuousMode ? '#34D399' : '#94A3B8',
              border: `1px solid ${continuousMode ? '#10B981' : 'rgba(255, 255, 255, 0.15)'}`,
              borderRadius: 20,
              fontSize: 12.5,
              padding: '8px 14px',
              fontWeight: 600
            }}
            title="Automatically listen for next question when AI finishes speaking"
          >
            🔄 Continuous Chat: {continuousMode ? 'ON' : 'OFF'}
          </button>
        </div>

        <div style={{ fontSize: 11.5, color: '#64748B' }}>
          Speak clearly • Interrupt at any point • All dialogue is saved to your study notes
        </div>
      </div>

      {/* Slide-over Voice Settings Drawer */}
      {showSettings && (
        <div
          style={{
            position: 'absolute',
            top: 70,
            right: 24,
            width: 320,
            background: '#0E1F18',
            border: '1.5px solid #10B981',
            borderRadius: 16,
            padding: 18,
            boxShadow: '0 12px 36px rgba(0,0,0,0.6)',
            zIndex: 10001
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: '#FEFFAF' }}>⚙️ Voice Chat Settings</div>
            <button
              type="button"
              onClick={() => setShowSettings(false)}
              style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: 16 }}
            >
              ✕
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11.5, color: '#A7F3D0', fontWeight: 700, display: 'block', marginBottom: 4 }}>
                Voice Synthesis Engine
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <button
                  type="button"
                  className={`btn btn-sm ${voiceEngine === 'browser' ? 'btn-p' : 'btn-s'}`}
                  style={{ fontSize: 11, padding: '4px 8px' }}
                  onClick={() => setVoiceEngine('browser')}
                >
                  ⚡ Fast (Browser)
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${voiceEngine === 'neural_hd' ? 'btn-p' : 'btn-s'}`}
                  style={{ fontSize: 11, padding: '4px 8px' }}
                  onClick={() => setVoiceEngine('neural_hd')}
                >
                  🎧 Studio Neural HD
                </button>
              </div>
            </div>

            <div>
              <label style={{ fontSize: 11.5, color: '#A7F3D0', fontWeight: 700, display: 'block', marginBottom: 4 }}>
                Speech Playback Speed ({speakingSpeed}x)
              </label>
              <input
                type="range"
                min={0.8}
                max={1.5}
                step={0.1}
                value={speakingSpeed}
                onChange={e => setSpeakingSpeed(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: '#10B981' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#64748B' }}>
                <span>0.8x</span><span>1.0x (Normal)</span><span>1.5x</span>
              </div>
            </div>

            {availableVoices.length > 0 && voiceEngine === 'browser' && (
              <div>
                <label style={{ fontSize: 11.5, color: '#A7F3D0', fontWeight: 700, display: 'block', marginBottom: 4 }}>
                  Select Browser Voice
                </label>
                <select
                  className="fi"
                  style={{ fontSize: 11.5, padding: '4px 8px' }}
                  value={selectedVoiceName}
                  onChange={e => setSelectedVoiceName(e.target.value)}
                >
                  <option value="">Auto-select based on language</option>
                  {availableVoices.map(v => (
                    <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Slide-over Conversation Transcript Drawer */}
      {showTranscriptDrawer && (
        <div
          style={{
            position: 'absolute',
            top: 70,
            left: 24,
            width: 380,
            maxHeight: 'calc(100vh - 140px)',
            background: '#0E1F18',
            border: '1.5px solid rgba(16, 185, 129, 0.4)',
            borderRadius: 16,
            padding: 16,
            boxShadow: '0 12px 36px rgba(0,0,0,0.6)',
            zIndex: 10001,
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontWeight: 800, fontSize: 13.5, color: '#FEFFAF' }}>
              📜 Conversation Dialogue Log
            </div>
            <button
              type="button"
              onClick={() => setShowTranscriptDrawer(false)}
              style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: 16 }}
            >
              ✕
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 4 }}>
            {history.slice(-10).map((m, idx) => (
              <div
                key={idx}
                style={{
                  background: m.role === 'user' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                  border: `1px solid ${m.role === 'user' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255, 255, 255, 0.1)'}`,
                  borderRadius: 10,
                  padding: '8px 12px',
                  fontSize: 12.5,
                  lineHeight: 1.4
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 11, color: m.role === 'user' ? '#34D399' : '#78A2D2', marginBottom: 2 }}>
                  {m.role === 'user' ? '👤 You (Voice)' : '🎓 Notivexa Tutor'}
                </div>
                <div>{m.content}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
