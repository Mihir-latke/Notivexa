import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import api from '../utils/api'

const PC = { high:'#FEE2E2', medium:'#FEF9C3', low:'#DCFCE7' }
const PT = { high:'#B91C1C', medium:'#854D0E', low:'#15803D' }
const SI = { Physics:'⚛️', Chemistry:'⚗️', Maths:'📐', Biology:'🧬', History:'🏛️', General:'📚', Revision:'🔄', Economics:'💹', 'Data Structures':'🗂️', DBMS:'🗄️', 'OS':'💻', 'Networking':'🌐', MCA:'🎓' }

const ALL_SUBJECTS = ['Physics','Chemistry','Maths','Biology','History','Economics','Data Structures','DBMS','OS','Networking','MCA']

const IMPORTANT_QUESTIONS = {
  'Data Structures': ['Explain BFS and DFS with examples','Write pseudocode for Quick Sort','Compare Array vs Linked List','What is a Binary Search Tree?','Explain Hashing and Collision resolution'],
  'DBMS': ['What is Normalization? Explain 1NF, 2NF, 3NF','Write SQL query for JOIN operations','Explain ACID properties','What is an ER Diagram?','Differentiate DDL vs DML'],
  'OS': ['Explain Process Scheduling algorithms','What is Deadlock? How to prevent it?','Explain Virtual Memory and Paging','What is Semaphore?','Compare Multiprogramming vs Multitasking'],
  'Networking': ['Explain OSI Model layers','What is TCP/IP?','Difference between Hub, Switch, Router','What is DNS and how it works?','Explain HTTP vs HTTPS'],
  'Maths': ['Integration by parts formula','Matrix multiplication rules','Differentiation of composite functions','Binomial theorem expansion','Probability basic formulas'],
  'Physics': ['Laws of Thermodynamics','Wave motion equations','Faraday\'s law of electromagnetic induction','Newton\'s laws with applications','Optics — Snell\'s law'],
  'Chemistry': ['Periodic table trends','Balancing redox reactions','Organic reaction mechanisms','Chemical bonding types','Acid-base equilibria'],
  'Biology': ['Cell organelles and functions','DNA replication process','Photosynthesis equation','Mendelian genetics','Ecosystem energy flow'],
}

function daysUntil(dateStr) {
  if (!dateStr) return null
  const exam = new Date(dateStr)
  const today = new Date()
  today.setHours(0,0,0,0)
  exam.setHours(0,0,0,0)
  return Math.ceil((exam - today) / (1000*60*60*24))
}

function todayStr() {
  return new Date().toLocaleDateString('en-IN', { weekday:'long', year:'numeric', month:'long', day:'numeric' })
}

export default function Planner() {
  const [plans, setPlans] = useState([])
  const [active, setActive] = useState(null)
  const [subjects, setSubjects] = useState(['Data Structures','DBMS','OS'])
  const [examDate, setExamDate] = useState('')
  const [hours, setHours] = useState(6)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState('plan') // plan | questions
  const [selSubject, setSelSubject] = useState('Data Structures')

  useEffect(() => {
    api.get('/planner').then(r => {
      const p = r.data.plans||[]
      setPlans(p)
      if (p.length > 0) setActive(p[0])
    }).catch(()=>{})
  }, [])

  const generate = async () => {
    if (!subjects.length) { toast.error('Select at least one subject'); return }
    if (!examDate) { toast.error('Please set an exam date'); return }
    setLoading(true)
    try {
      const res = await api.post('/planner/generate', { subjects, examDate, dailyHours: hours, title: subjects[0]+' Exam Prep' })
      setActive(res.data.plan)
      setPlans(p => [res.data.plan, ...p])
      toast.success('Study plan generated! 📅')
    } catch { toast.error('Failed to generate plan') } finally { setLoading(false) }
  }

  const toggle = async taskId => {
    if (!active) return
    const task = active.tasks.find(t => t._id === taskId)
    try {
      const res = await api.patch('/planner/'+active._id+'/tasks/'+taskId, { completed: !task.completed })
      setActive(res.data.plan)
    } catch {
      setActive(p => ({ ...p, tasks: p.tasks.map(t => t._id===taskId ? {...t,completed:!t.completed} : t) }))
    }
  }

  const tasks = active?.tasks || []
  const done = tasks.filter(t => t.completed).length
  const grouped = tasks.reduce((acc,t) => { const k=t.day||'General'; if(!acc[k])acc[k]=[]; acc[k].push(t); return acc }, {})
  const days = daysUntil(examDate)
  const iq = IMPORTANT_QUESTIONS[selSubject] || ['Practice previous year papers','Revise key formulas','Focus on high-weightage topics','Attempt mock tests','Review weak areas']

  return (
    <div className="tc" style={{ alignItems:'start' }}>
      {/* Left — schedule */}
      <div>
        {/* Today + Countdown banner */}
        <div style={{ background:'linear-gradient(135deg,var(--brand),var(--brand2))', borderRadius:13, padding:'14px 18px', marginBottom:14, color:'#fff' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <div style={{ fontSize:11, opacity:.7, marginBottom:3 }}>📅 TODAY</div>
              <div style={{ fontSize:13.5, fontWeight:700 }}>{todayStr()}</div>
            </div>
            {days !== null && (
              <div style={{ textAlign:'center', background:'rgba(255,255,255,0.15)', borderRadius:10, padding:'8px 16px' }}>
                <div style={{ fontSize:26, fontWeight:800, lineHeight:1 }}>{days <= 0 ? '🎯' : days}</div>
                <div style={{ fontSize:10, opacity:.8, marginTop:2 }}>{days <= 0 ? 'Exam Day!' : days === 1 ? 'day left' : 'days left'}</div>
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="tbr">
          <div className={'tab'+(tab==='plan'?' on':'')} onClick={()=>setTab('plan')}>📅 Study Plan</div>
          <div className={'tab'+(tab==='questions'?' on':'')} onClick={()=>setTab('questions')}>⭐ Important Questions</div>
        </div>

        {tab === 'questions' && (
          <div>
            <div style={{ display:'flex', gap:7, marginBottom:14, flexWrap:'wrap' }}>
              {Object.keys(IMPORTANT_QUESTIONS).map(s => (
                <div key={s} className={'lp'+(selSubject===s?' on':'')} onClick={()=>setSelSubject(s)}>{SI[s]||'📚'} {s}</div>
              ))}
            </div>
            <div className="card">
              <div className="ch">
                <div className="ct">⭐ Important Questions — {selSubject}</div>
                <span className="chip">Exam Focus</span>
              </div>
              <div className="cb">
                {iq.map((q,i) => (
                  <div key={i} style={{ display:'flex', gap:10, padding:'10px 0', borderBottom:i<iq.length-1?'1px solid var(--bdr)':'none' }}>
                    <span style={{ background:'var(--brand)', color:'#fff', width:22, height:22, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:800, flexShrink:0, marginTop:1 }}>{i+1}</span>
                    <span style={{ fontSize:13.5, color:'var(--ink2)', lineHeight:1.5 }}>{q}</span>
                  </div>
                ))}
                <div style={{ marginTop:14, padding:10, background:'var(--bg)', borderRadius:8, fontSize:12, color:'var(--ink3)' }}>
                  💡 Generate more from your PDF using AI Notebook → Question Papers
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'plan' && <>
          {active && (
            <>
              <div className="card" style={{ marginBottom:14 }}>
                <div className="ch"><div className="ct">📊 Progress</div><span className="chip">{done}/{tasks.length} done</span></div>
                <div className="cb">
                  <div className="ptr" style={{ height:8 }}>
                    <div className="pf" style={{ width:(tasks.length?done/tasks.length*100:0)+'%', background:'linear-gradient(90deg,var(--brand),var(--brand2))' }}/>
                  </div>
                  <div style={{ fontSize:12, color:'var(--ink3)', marginTop:8, textAlign:'center' }}>
                    {tasks.length ? Math.round(done/tasks.length*100) : 0}% complete
                  </div>
                </div>
              </div>
              {Object.entries(grouped).slice(0,10).map(([day,dt]) => (
                <div key={day} style={{ background:'var(--card)', border:'1px solid var(--bdr)', borderRadius:11, padding:'12px 14px', marginBottom:10 }}>
                  <div style={{ fontSize:13, fontWeight:700, marginBottom:8, display:'flex', alignItems:'center', gap:8 }}>
                    📅 {day}
                    <span style={{ fontSize:11, fontWeight:400, color:'var(--ink3)', marginLeft:'auto' }}>{dt.filter(t=>t.completed).length}/{dt.length}</span>
                  </div>
                  {dt.map(t => (
                    <div key={t._id} style={{ display:'flex', alignItems:'center', gap:9, padding:'6px 0', borderBottom:'1px solid var(--bg2)', fontSize:12.5 }}>
                      <div onClick={()=>toggle(t._id)} style={{ width:16, height:16, borderRadius:4, border:'1.5px solid '+(t.completed?'var(--grn)':'var(--bg3)'), background:t.completed?'var(--grn)':'transparent', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'#fff', fontSize:9, flexShrink:0 }}>{t.completed?'✓':''}</div>
                      <span style={{ fontSize:15 }}>{SI[t.subject]||'📚'}</span>
                      <span style={{ flex:1, textDecoration:t.completed?'line-through':'none', color:t.completed?'var(--ink3)':'var(--ink2)' }}>{t.task}</span>
                      <span style={{ background:PC[t.priority||'medium'], color:PT[t.priority||'medium'], fontSize:9.5, padding:'1.5px 7px', borderRadius:20, fontWeight:700 }}>{t.priority||'med'}</span>
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}
          {!active && (
            <div className="card"><div className="cb" style={{ textAlign:'center', padding:'40px 20px' }}>
              <div style={{ fontSize:36, marginBottom:10 }}>📅</div>
              <div style={{ fontFamily:'Sora,sans-serif', fontSize:15, fontWeight:700 }}>Set your exam date and generate a plan</div>
            </div></div>
          )}
        </>}
      </div>

      {/* Right — controls */}
      <div>
        <div className="card" style={{ marginBottom:14 }}>
          <div className="ch"><div className="ct">🤖 Generate Study Plan</div></div>
          <div className="cb">
            <div className="fg">
              <label className="fl">📅 Exam Date</label>
              <input type="date" className="fi" value={examDate} min={new Date().toISOString().split('T')[0]} onChange={e=>setExamDate(e.target.value)}/>
              {days !== null && days > 0 && (
                <div style={{ fontSize:12, color:'var(--brand)', fontWeight:600, marginTop:5 }}>⏰ {days} days until exam</div>
              )}
              {days !== null && days <= 0 && (
                <div style={{ fontSize:12, color:'var(--rose)', fontWeight:600, marginTop:5 }}>⚠️ Exam date is today or has passed!</div>
              )}
            </div>
            <div className="fg">
              <label className="fl">📚 Subjects</label>
              <div style={{ display:'flex', gap:7, flexWrap:'wrap', marginTop:7 }}>
                {ALL_SUBJECTS.map(s => (
                  <div key={s} className={'lp'+(subjects.includes(s)?' on':'')}
                    onClick={()=>setSubjects(p => p.includes(s)?p.filter(x=>x!==s):[...p,s])}>
                    {SI[s]||'📚'} {s}
                  </div>
                ))}
              </div>
            </div>
            <div className="fg">
              <label className="fl">⏱️ Daily Study Hours: {hours}h</label>
              <input type="range" min={2} max={12} step={1} value={hours} onChange={e=>setHours(+e.target.value)} style={{ width:'100%' }}/>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'var(--ink3)', marginTop:3 }}><span>2h</span><span>12h</span></div>
            </div>
            <button className="btn btn-p wf" onClick={generate} disabled={loading}>{loading?'⏳ Generating...':'🤖 Generate AI Plan'}</button>
          </div>
        </div>

        {plans.length > 1 && (
          <div className="card" style={{ marginBottom:14 }}>
            <div className="ch"><div className="ct">📋 Saved Plans</div></div>
            <div className="cb">
              {plans.slice(0,4).map(p => (
                <div key={p._id} onClick={()=>setActive(p)}
                  style={{ padding:'8px 10px', borderRadius:8, cursor:'pointer', background:active?._id===p._id?'var(--bg2)':'transparent', marginBottom:4, fontSize:13 }}>
                  {active?._id===p._id?'▶️ ':''}{p.title || 'Study Plan'}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="card">
          <div className="ch"><div className="ct">💡 Study Tips</div></div>
          <div className="cb">
            {[['⚡','Focus on high-weightage topics first'],['⏰','Study 6–9 AM for peak retention'],['🔄','Revise after 1 day, 3 days, 7 days (spaced repetition)'],['🎯','Practice 20 MCQs daily'],['💤','7–8 hours sleep aids memory consolidation']].map(([ic,t],i)=>(
              <div key={i} style={{ display:'flex', gap:9, padding:'7px 0', borderBottom:i<4?'1px solid var(--bdr)':'none' }}>
                <span style={{ fontSize:16, flexShrink:0 }}>{ic}</span>
                <span style={{ fontSize:12.5, color:'var(--ink2)' }}>{t}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
