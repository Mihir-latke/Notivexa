export function checkPasswordStrength(password = '') {
  const length = password.length >= 7
  const letterCount = (password.match(/[a-zA-Z]/g) || []).length
  const letters = letterCount >= 4
  const numberCount = (password.match(/\d/g) || []).length
  const numbers = numberCount >= 2
  const special = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(password)

  const score = [length, letters, numbers, special].filter(Boolean).length
  const isValid = length && letters && numbers && special

  return {
    isValid,
    score,
    rules: {
      letters: { valid: letters, label: 'At least 4 letters', count: letterCount, req: 4 },
      numbers: { valid: numbers, label: 'At least 2 numbers', count: numberCount, req: 2 },
      special: { valid: special, label: 'At least 1 special key (!@#$%)' },
      length: { valid: length, label: 'Min 7 characters', count: password.length, req: 7 }
    }
  }
}

export default function PasswordStrengthIndicator({ password = '' }) {
  if (!password) return null

  const { score, rules, isValid } = checkPasswordStrength(password)

  const getBarColor = () => {
    if (score <= 1) return '#EF4444' // Red
    if (score === 2) return '#F59E0B' // Amber
    if (score === 3) return '#6366F1' // Indigo
    return '#10B981' // Emerald
  }

  const getLabel = () => {
    if (score <= 1) return 'Weak password'
    if (score === 2) return 'Fair password'
    if (score === 3) return 'Good password'
    return 'Strong password 🎉'
  }

  return (
    <div style={{ marginTop: 8, padding: '10px 12px', background: '#F8FAFC', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontWeight: 600, color: getBarColor() }}>{getLabel()}</span>
        <span style={{ fontSize: 11, color: '#64748B' }}>{score} of 4 requirements</span>
      </div>

      <div style={{ width: '100%', height: 4, background: '#E2E8F0', borderRadius: 2, overflow: 'hidden', marginBottom: 8 }}>
        <div
          style={{
            width: `${(score / 4) * 100}%`,
            height: '100%',
            background: getBarColor(),
            transition: 'width 0.25s ease'
          }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 8px' }}>
        {Object.entries(rules).map(([key, item]) => (
          <div
            key={key}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              color: item.valid ? '#059669' : '#64748B',
              fontSize: 11.5,
              fontWeight: item.valid ? 600 : 400
            }}
          >
            <span>{item.valid ? '✓' : '○'}</span>
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

