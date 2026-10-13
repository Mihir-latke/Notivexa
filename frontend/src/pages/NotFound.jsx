import { Link, useNavigate } from 'react-router-dom'
import SEOHead from '../components/SEOHead'

export default function NotFound() {
  const navigate = useNavigate()

  return (
    <div style={{
      minHeight: '75vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px'
    }}>
      <SEOHead
        title="404: Page Not Found"
        description="The page you requested could not be found. Return to your Notivexa AI study dashboard or explore the notebook and library."
        canonical="/404"
      />
      <div className="card" style={{
        maxWidth: 580,
        width: '100%',
        textAlign: 'center',
        padding: '42px 32px',
        boxShadow: '0 20px 40px -15px rgba(79,70,229,0.12)'
      }}>
        {/* Visual Badge / Icon */}
        <div style={{
          width: 80,
          height: 80,
          borderRadius: 24,
          background: 'linear-gradient(135deg, rgba(79,70,229,0.12), rgba(124,58,237,0.15))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 38,
          margin: '0 auto 20px',
          border: '1.5px solid var(--bdr2)'
        }}>
          🧭
        </div>

        {/* Status Pill */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          background: 'rgba(239,68,68,0.1)',
          color: '#DC2626',
          padding: '4px 12px',
          borderRadius: 20,
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: 0.5,
          marginBottom: 14
        }}>
          <span>⚠️</span> ERROR 404
        </div>

        {/* Exact single H1 for this page */}
        <h1 style={{
          fontFamily: 'Sora, sans-serif',
          fontSize: 26,
          fontWeight: 800,
          color: 'var(--ink)',
          marginBottom: 10,
          lineHeight: 1.3
        }}>
          Page Not Found
        </h1>

        <p style={{
          fontSize: 14,
          color: 'var(--ink3)',
          lineHeight: 1.6,
          marginBottom: 24,
          maxWidth: 440,
          margin: '0 auto 24px'
        }}>
          The page or academic resource you are looking for doesn't exist, has been moved, or the link may be outdated.
        </p>

        {/* Quick Action Buttons */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 28 }}>
          <button
            className="btn btn-p"
            onClick={() => navigate('/dashboard')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 18px' }}
          >
            🏠 Return to Dashboard
          </button>
          <button
            className="btn btn-s"
            onClick={() => navigate(-1)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 18px' }}
          >
            ← Go Back
          </button>
        </div>

        {/* Helpful Internal Links Grid */}
        <div style={{
          borderTop: '1px solid var(--bdr)',
          paddingTop: 20,
          textAlign: 'left'
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Popular Destinations
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            <Link
              to="/notebook"
              className="fc"
              style={{ padding: '10px 12px', textDecoration: 'none', background: 'var(--bg)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>📓</span>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>AI Notebook</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)' }}>Generate handwritten notes &amp; exams</div>
                </div>
              </div>
            </Link>

            <Link
              to="/upload"
              className="fc"
              style={{ padding: '10px 12px', textDecoration: 'none', background: 'var(--bg)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>📤</span>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>Upload Documents</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)' }}>Import PDFs, images or YouTube</div>
                </div>
              </div>
            </Link>

            <Link
              to="/flashcards"
              className="fc"
              style={{ padding: '10px 12px', textDecoration: 'none', background: 'var(--bg)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>🃏</span>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>Flashcard Studio</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)' }}>Quick revision &amp; practice</div>
                </div>
              </div>
            </Link>

            <Link
              to="/library"
              className="fc"
              style={{ padding: '10px 12px', textDecoration: 'none', background: 'var(--bg)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>🗄️</span>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>My Library</div>
                  <div style={{ fontSize: 11, color: 'var(--ink3)' }}>Access previously generated files</div>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

