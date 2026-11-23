import { useState, useEffect, useRef } from 'react'

const PAPER_STYLES = {
  graph_paper: {
    name: 'Off-White Graph Paper',
    bg: '#FAF9F5',
    gridColor: 'rgba(203, 213, 225, 0.45)',
    gridSize: 28,
    marginColor: 'rgba(239, 68, 68, 0.65)',
    headerBg: '#F1EFEA',
    headerBorder: '#CBD5E1',
    headerText: '#0F172A',
    inkDefault: '#1D4ED8',
    accentDefault: '#DC2626'
  },
  ruled: {
    name: 'College Ruled Notebook',
    bg: '#FFFDF7',
    gridColor: 'rgba(203, 213, 225, 0.45)',
    gridSize: 32,
    marginColor: 'rgba(239, 68, 68, 0.65)',
    headerBg: '#F8F5EE',
    headerBorder: '#E2E8F0',
    headerText: '#0F172A',
    inkDefault: '#1D4ED8',
    accentDefault: '#DC2626'
  },
  whiteboard: {
    name: 'Clean Whiteboard',
    bg: '#FFFFFF',
    gridColor: 'rgba(241, 245, 249, 0.5)',
    gridSize: 36,
    marginColor: 'rgba(226, 232, 240, 0.5)',
    headerBg: '#F8FAFC',
    headerBorder: '#E2E8F0',
    headerText: '#0F172A',
    inkDefault: '#1E40AF',
    accentDefault: '#EF4444'
  },
  chalkboard: {
    name: 'Dark Chalkboard',
    bg: '#0D1F18',
    gridColor: 'rgba(45, 78, 62, 0.35)',
    gridSize: 32,
    marginColor: 'rgba(45, 78, 62, 0.6)',
    headerBg: '#08140F',
    headerBorder: '#1A3328',
    headerText: '#FEFFAF',
    inkDefault: '#F8FAFC',
    accentDefault: '#FEFFAF'
  }
}

export default function HandwrittenVideoPlayer({
  storyboard,
  activeSceneIndex = 0,
  onSceneChange,
  aspectRatio = '9:16',
  paperStyle = 'graph_paper',
  inkColor = '#1D4ED8',
  language = 'English',
  onRegenerateScene,
  onExportMp4
}) {
  const canvasRef = useRef(null)
  const animFrameRef = useRef(null)
  const handImgRef = useRef(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackTime, setPlaybackTime] = useState(0) // seconds
  const [duration, setDuration] = useState(7)
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0)
  const [handLoaded, setHandLoaded] = useState(false)
  const [speechActive, setSpeechActive] = useState(false)

  const activeScene = storyboard?.scenes?.[activeSceneIndex] || {
    heading: '1. Binary Search Algorithm',
    handwrittenLines: [
      '• Divides sorted search interval in half',
      '• Eliminates inactive partition efficiently',
      '• Guaranteed logarithmic complexity'
    ],
    formula: 'Time Complexity: O(log2 n)',
    narration: 'Binary search is an efficient divide and conquer algorithm for searching a sorted array.'
  }

  // Load Hand Holding Pen PNG
  useEffect(() => {
    const img = new Image()
    img.src = '/assets/hand_pen.png'
    img.onload = () => {
      handImgRef.current = img
      setHandLoaded(true)
    }
    img.onerror = () => {
      console.warn('Could not load hand_pen.png, using procedural pen marker.')
    }
  }, [])

  // Update duration when scene changes
  useEffect(() => {
    const dur = Math.max(activeScene.durationSeconds || activeScene.estimatedDuration || 7, 5)
    setDuration(dur)
    setPlaybackTime(0)
    setIsPlaying(false)
    if (window.speechSynthesis) window.speechSynthesis.cancel()
  }, [activeSceneIndex, activeScene])

  // Animation Loop
  useEffect(() => {
    let lastTimestamp = performance.now()

    const loop = (now) => {
      const dt = (now - lastTimestamp) / 1000
      lastTimestamp = now

      if (isPlaying) {
        setPlaybackTime(prev => {
          const next = prev + dt * playbackSpeed
          if (next >= duration) {
            setIsPlaying(false)
            if (window.speechSynthesis) window.speechSynthesis.cancel()
            return duration
          }
          return next
        })
      }

      renderCanvas(playbackTime)
      animFrameRef.current = requestAnimationFrame(loop)
    }

    animFrameRef.current = requestAnimationFrame(loop)
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [isPlaying, playbackTime, duration, playbackSpeed, activeScene, paperStyle, inkColor, aspectRatio, handLoaded])

  // Render Canvas
  const renderCanvas = (time) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const dpr = window.devicePixelRatio || 1
    const w = canvas.width / dpr
    const h = canvas.height / dpr

    ctx.save()
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, w, h)

    const theme = PAPER_STYLES[paperStyle] || PAPER_STYLES.graph_paper
    const effectiveInk = paperStyle === 'chalkboard' ? theme.inkDefault : inkColor

    // 1. Paper Background
    ctx.fillStyle = theme.bg
    ctx.fillRect(0, 0, w, h)

    // 2. Notebook Grid
    ctx.strokeStyle = theme.gridColor
    ctx.lineWidth = 1
    const gridSize = theme.gridSize
    for (let y = gridSize; y < h; y += gridSize) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
      ctx.stroke()
    }
    if (paperStyle === 'graph_paper') {
      for (let x = gridSize; x < w; x += gridSize) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, h)
        ctx.stroke()
      }
    }

    // 3. Left Student Red Margin Rule
    const marginX = aspectRatio === '9:16' ? 44 : 52
    ctx.strokeStyle = theme.marginColor
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(marginX, 0)
    ctx.lineTo(marginX, h)
    ctx.stroke()

    // 4. Top Header Rule
    const headerH = aspectRatio === '9:16' ? 52 : 46
    ctx.fillStyle = theme.headerBg
    ctx.fillRect(0, 0, w, headerH)
    ctx.strokeStyle = theme.headerBorder
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(0, headerH)
    ctx.lineTo(w, headerH)
    ctx.stroke()

    // Top Category / Title Text
    ctx.font = '700 12px Sora, Inter, sans-serif'
    ctx.fillStyle = paperStyle === 'chalkboard' ? '#FEFFAF' : '#4F6989'
    ctx.fillText(
      `📚 ${storyboard?.title || 'ACADEMIC LESSON'} • SCENE ${activeScene.sceneNumber || activeSceneIndex + 1}`,
      16,
      30
    )

    // 5. Timeline Math for Writing
    const writeWindow = Math.max(duration - 1.2, 3.0)
    const t_hStart = 0.3
    const hDur = Math.min(1.2, writeWindow * 0.25)
    const t_hEnd = t_hStart + hDur

    const uDur = 0.35
    const t_uStart = t_hEnd + 0.1
    const t_uEnd = t_uStart + uDur

    const lines = Array.isArray(activeScene.handwrittenLines) && activeScene.handwrittenLines.length > 0
      ? activeScene.handwrittenLines
      : (Array.isArray(activeScene.boardPoints) ? activeScene.boardPoints : ['• Key Concept', '• Working Principle'])

    const formula = activeScene.formula || activeScene.diagram?.formula || null
    const remainingTime = Math.max(0.8, writeWindow - (t_uEnd - t_hStart))
    const slots = lines.length + (formula ? 1 : 0)
    const timePerItem = Math.max(0.6, remainingTime / slots)

    const contentX = marginX + 16
    const headingY = headerH + 42
    const headingFontSize = aspectRatio === '9:16' ? 22 : 20
    const bodyFontSize = aspectRatio === '9:16' ? 18 : 17
    const lineSpacing = aspectRatio === '9:16' ? 44 : 36

    let penX = -100
    let penY = -100
    let isPenActive = false

    // 6. Draw Heading Progressively
    const headingText = activeScene.heading || activeScene.title || `Scene ${activeSceneIndex + 1}`
    ctx.font = `700 ${headingFontSize}px "Caveat", "Kalam", "Comic Sans MS", cursive, sans-serif`
    ctx.fillStyle = theme.headerText

    const headingProg = Math.max(0, Math.min(1, (time - t_hStart) / hDur))
    const headingChars = Math.floor(headingProg * headingText.length)
    const revealedHeading = headingText.slice(0, headingChars)

    if (time >= t_hStart) {
      ctx.fillText(revealedHeading, contentX, headingY)
      if (time <= t_hEnd) {
        const textMetrics = ctx.measureText(revealedHeading)
        penX = contentX + textMetrics.width
        penY = headingY - 6 + Math.sin(time * 25) * 2
        isPenActive = true
      }
    }

    // 7. Red Underline under heading
    const fullHeadingWidth = ctx.measureText(headingText).width
    if (time >= t_uStart) {
      const uProg = Math.max(0, Math.min(1, (time - t_uStart) / uDur))
      const uWidth = fullHeadingWidth * uProg
      ctx.strokeStyle = theme.accentDefault
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.moveTo(contentX, headingY + 6)
      ctx.lineTo(contentX + uWidth, headingY + 6)
      ctx.stroke()

      if (time <= t_uEnd) {
        penX = contentX + uWidth
        penY = headingY + 6
        isPenActive = true
      }
    }

    // 8. Draw Body Lines Progressively
    let currTime = t_uEnd + 0.15
    const lineStartY = headingY + 44

    lines.forEach((lineText, idx) => {
      const start = currTime
      const dur = timePerItem * 0.9
      const end = start + dur
      const lineY = lineStartY + idx * lineSpacing

      if (time >= start) {
        const prog = Math.max(0, Math.min(1, (time - start) / dur))
        const chars = Math.floor(prog * lineText.length)
        const visibleText = lineText.slice(0, chars)

        ctx.font = `600 ${bodyFontSize}px "Caveat", "Kalam", "Patrick Hand", cursive, sans-serif`
        ctx.fillStyle = effectiveInk
        ctx.fillText(visibleText, contentX, lineY)

        if (time <= end) {
          const metrics = ctx.measureText(visibleText)
          penX = contentX + metrics.width
          penY = lineY - 4 + Math.sin(time * 25) * 2
          isPenActive = true
        }
      }
      currTime = end + 0.15
    })

    // 9. Draw Formula / Callout Box
    if (formula) {
      const fStart = currTime
      const fDur = timePerItem * 0.85
      const fEnd = fStart + fDur
      const fY = lineStartY + lines.length * lineSpacing + 8

      if (time >= fStart) {
        const fProg = Math.max(0, Math.min(1, (time - fStart) / fDur))
        ctx.font = `700 ${bodyFontSize}px "Caveat", "Kalam", monospace, cursive`
        const fMetrics = ctx.measureText(formula)
        const boxW = Math.min(w - contentX - 20, fMetrics.width + 24) * fProg

        // Amber/Red callout card border
        ctx.strokeStyle = theme.accentDefault
        ctx.lineWidth = 2
        ctx.strokeRect(contentX, fY - 22, boxW, 36)

        if (fProg > 0.2) {
          ctx.fillStyle = theme.headerText
          ctx.fillText(formula, contentX + 12, fY)
        }

        if (time <= fEnd) {
          penX = contentX + boxW
          penY = fY - 4
          isPenActive = true
        }
      }
      currTime = fEnd + 0.15
    }

    // Retract pen gracefully
    if (time > currTime) {
      const retractProg = Math.min(1, (time - currTime) / 0.8)
      penX = (w * 0.7) + retractProg * 250
      penY = (h * 0.8) + retractProg * 250
      isPenActive = retractProg < 0.95
    }

    // 10. Draw Pen & Hand
    if (isPenActive && penX > 0 && penY > 0) {
      const handImg = handImgRef.current
      if (handImg && handImg.complete && handImg.naturalWidth > 0) {
        // Hand scaled height ~240px for web preview
        const scaledH = aspectRatio === '9:16' ? 240 : 210
        const scale = scaledH / 896
        const scaledW = 1200 * scale

        // Pen tip offset in scaled coordinates (original tip at x=328, y=664)
        const tipX = 328 * scale
        const tipY = 664 * scale

        ctx.drawImage(handImg, penX - tipX, penY - tipY, scaledW, scaledH)
      } else {
        // Procedural elegant pen fallback
        ctx.save()
        ctx.translate(penX, penY)
        ctx.rotate(-Math.PI / 4)

        // Pen Nib (Silver)
        ctx.fillStyle = '#94A3B8'
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.lineTo(-4, -14)
        ctx.lineTo(4, -14)
        ctx.closePath()
        ctx.fill()

        // Nib tip dot (Blue)
        ctx.fillStyle = effectiveInk
        ctx.fillRect(-1.5, -2, 3, 3)

        // Pen Body (Royal Blue with Gold Ring)
        ctx.fillStyle = '#1D4ED8'
        ctx.fillRect(-5, -70, 10, 56)

        ctx.fillStyle = '#FEFFAF'
        ctx.fillRect(-5.5, -60, 11, 4)

        ctx.restore()
      }
    }

    ctx.restore()
  }

  // Handle Play / Pause with Speech Synthesis Audio Preview
  const handleTogglePlay = () => {
    if (isPlaying) {
      setIsPlaying(false)
      if (window.speechSynthesis) window.speechSynthesis.cancel()
    } else {
      setIsPlaying(true)
      // If at end, loop to beginning
      if (playbackTime >= duration - 0.2) {
        setPlaybackTime(0)
      }

      // Voice preview in target language
      if ('speechSynthesis' in window && activeScene.narration) {
        window.speechSynthesis.cancel()
        const utter = new SpeechSynthesisUtterance(activeScene.narration)
        utter.rate = playbackSpeed * 0.95

        // Match speech synthesis language
        const langMap = {
          Marathi: 'mr-IN',
          Hindi: 'hi-IN',
          English: 'en-IN',
          Gujarati: 'gu-IN',
          Tamil: 'ta-IN'
        }
        utter.lang = langMap[language] || 'en-IN'

        utter.onend = () => setSpeechActive(false)
        setSpeechActive(true)
        window.speechSynthesis.speak(utter)
      }
    }
  }

  const handleSeek = (e) => {
    const val = parseFloat(e.target.value)
    setPlaybackTime(val)
    if (window.speechSynthesis) window.speechSynthesis.cancel()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Canvas Video Stage */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          background: '#0F172A',
          padding: '16px 12px',
          borderRadius: 16,
          boxShadow: '0 12px 36px rgba(0,0,0,0.3)',
          position: 'relative'
        }}
      >
        <div
          style={{
            position: 'relative',
            width: aspectRatio === '9:16' ? 340 : (aspectRatio === '1:1' ? 440 : 580),
            aspectRatio: aspectRatio === '9:16' ? '9 / 16' : (aspectRatio === '1:1' ? '1 / 1' : '16 / 9'),
            borderRadius: 12,
            overflow: 'hidden',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            border: '2px solid rgba(120, 162, 210, 0.4)'
          }}
        >
          <canvas
            ref={canvasRef}
            width={aspectRatio === '9:16' ? 680 : (aspectRatio === '1:1' ? 880 : 1160)}
            height={aspectRatio === '9:16' ? 1208 : (aspectRatio === '1:1' ? 880 : 652)}
            style={{ width: '100%', height: '100%', display: 'block' }}
          />

          {/* Bottom Subtitle Bar (Synchronized with speech) */}
          <div
            style={{
              position: 'absolute',
              bottom: 12,
              left: 12,
              right: 12,
              background: 'rgba(15, 23, 42, 0.88)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(120, 162, 210, 0.35)',
              borderRadius: 8,
              padding: '6px 10px',
              textAlign: 'center',
              color: '#F8FAFC',
              fontSize: 12,
              lineHeight: 1.4,
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
            }}
          >
            <span style={{ color: '#FEFFAF', fontWeight: 700, marginRight: 6 }}>
              🎙️ Narration:
            </span>
            <span>
              {activeScene.narration || 'Binary search divides the sorted list in half repeatedly.'}
            </span>
          </div>
        </div>
      </div>

      {/* Interactive Playback Controls */}
      <div
        style={{
          background: 'var(--card)',
          border: '1px solid var(--bdr)',
          borderRadius: 14,
          padding: '12px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10
        }}
      >
        {/* Timeline Scrub Slider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, minWidth: 38, color: 'var(--ink2)' }}>
            {playbackTime.toFixed(1)}s
          </span>
          <input
            type="range"
            min={0}
            max={duration}
            step={0.05}
            value={playbackTime}
            onChange={handleSeek}
            style={{ flex: 1, accentColor: 'var(--brand)', cursor: 'pointer' }}
          />
          <span style={{ fontSize: 11.5, fontWeight: 700, minWidth: 38, color: 'var(--ink3)', textAlign: 'right' }}>
            {duration.toFixed(1)}s
          </span>
        </div>

        {/* Buttons Toolbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className="btn btn-p btn-sm"
              onClick={handleTogglePlay}
              style={{
                background: isPlaying ? '#EF4444' : 'linear-gradient(135deg, #78A2D2, #5885BA)',
                color: '#fff',
                fontWeight: 700,
                minWidth: 84
              }}
            >
              {isPlaying ? '⏸ Pause' : '▶ Play'}
            </button>
            <button
              type="button"
              className="btn btn-s btn-sm"
              onClick={() => {
                setPlaybackTime(0)
                setIsPlaying(false)
                if (window.speechSynthesis) window.speechSynthesis.cancel()
              }}
            >
              ⏮ Restart
            </button>
            <select
              className="fi"
              style={{ width: 'auto', padding: '4px 8px', fontSize: 11.5 }}
              value={playbackSpeed}
              onChange={e => setPlaybackSpeed(parseFloat(e.target.value))}
            >
              <option value="0.8">0.8x Speed</option>
              <option value="1.0">1.0x Normal</option>
              <option value="1.2">1.2x Fast</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {onRegenerateScene && (
              <button
                type="button"
                className="btn btn-s btn-sm"
                onClick={() => onRegenerateScene(activeSceneIndex)}
                title="Regenerate this specific scene with updated prompt"
              >
                🔄 Refresh Scene
              </button>
            )}
            {onExportMp4 && (
              <button
                type="button"
                className="btn btn-sm"
                onClick={onExportMp4}
                style={{
                  background: 'linear-gradient(135deg, #10B981, #059669)',
                  color: '#fff',
                  fontWeight: 700
                }}
              >
                ⬇️ Export Full HD MP4
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
