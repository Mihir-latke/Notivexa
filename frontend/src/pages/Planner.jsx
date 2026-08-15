import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import api from '../utils/api'

const PC={high:'#FEE2E2',medium:'#FEF9C3',low:'#DCFCE7'}
const PT={high:'#991B1B',medium:'#854D0E',low:'#166534'}
const SI={Physics:'⚛️',Chemistry:'⚗️',Maths:'📐',Biology:'🧬',History:'🏛️',DSA:'🌳',DBMS:'🗄️',OS:'💻',Java:'☕',Python:'🐍',General:'📚',Revision:'🔄',Networks:'🌐'}

export default function Planner() {
  const [plans,setPlans]=useState([])
  const [active,setActive]=useState(null)
  const [docs,setDocs]=useState([])
  const [form,setForm]=useState({subjects:[],examDate:'',dailyHours:6,title:'My Study Plan',documentId:'',syllabus:''})
  const [loading,setLoading]=useState(false)
  const [impQ,setImpQ]=useState(null)
  const [tab,setTab]=useState('plan')

  useEffect(()=>{
    api.get('/planner').then(r=>{const p=r.data.plans||[];setPlans(p);if(p.length>0)setActive(p[0])}).catch(()=>{})
    api.get('/documents?status=ready').then(r=>setDocs(r.data.documents||[])).catch(()=>{})
  },[])

  const set=(k,v)=>setForm(f=>({...f,[k]:v}))
  const toggleSub=(s)=>set('subjects',form.subjects.includes(s)?form.subjects.filter(x=>x!==s):[...form.subjects,s])

  const generate=async()=>{
    if(!form.subjects.length){toast.error('Select at least one subject');return}
    setLoading(true)
    try{
      const res=await api.post('/planner/generate',form)
      setActive(res.data.plan);setPlans(p=>[res.data.plan,...p])
      toast.success('Study plan generated!')
    }catch{toast.error('Failed')}finally{setLoading(false)}
  }

  const getImportant=async()=>{
    const docId=active?.tasks?.[0]?.subject&&docs.length>0?docs[0]._id:null
    if(!docId&&!form.documentId){toast.error('Select a document to get important questions');return}
    try{
      const res=await api.post('/generate/important-questions',{documentId:form.documentId||docId,examDate:form.examDate||active?.examDate})
      setImpQ(res.data);setTab('important')
      toast.success('Important questions extracted!')
    }catch{toast.error('Failed to get important questions')}
  }

  const toggle=async(taskId)=>{
    if(!active)return
    const task=active.tasks.find(t=>t._id===taskId)
    try{
      const res=await api.patch(`/planner/${active._id}/tasks/${taskId}`,{completed:!task.completed})
      setActive(res.data.plan)
    }catch{setActive(p=>({...p,tasks:p.tasks.map(t=>t._id===taskId?{...t,completed:!t.completed}:t)}))}
  }

  const tasks=active?.tasks||[]
  const done=tasks.filter(t=>t.completed).length
  const daysLeft=active?.examDate?Math.max(0,Math.ceil((new Date(active.examDate)-new Date())/86400000)):null

  const grouped=tasks.reduce((acc,t)=>{const k=t.day||'General';if(!acc[k])acc[k]=[];acc[k].push(t);return acc},{})

  return(
    <div className="tc" style={{alignItems:'start'}}>
      <div>
        {/* Tab bar */}
        <div className="tbr" style={{marginBottom:16}}>
          <div className={`tab${tab==='plan'?' on':''}`} onClick={()=>setTab('plan')}>📅 Study Plan</div>
          <div className={`tab${tab==='important'?' on':''}`} onClick={()=>setTab('important')}>⭐ Important Questions</div>
        </div>

        {tab==='plan'&&<>
          {/* Plan stats */}
          {active&&(
            <div style={{marginBottom:16}}>
              <div className="card" style={{marginBottom:12}}>
                <div className="ch"><div className="ct">📊 Progress</div>
                  {daysLeft!==null&&<span style={{background:'#FEE2E2',color:'#991B1B',padding:'3px 10px',borderRadius:20,fontSize:12,fontWeight:700}}>⏰ {daysLeft} days left</span>}
                </div>
                <div className="cb">
                  <div className="ptr" style={{height:10,marginBottom:8}}>
                    <div className="pf" style={{width:`${tasks.length?done/tasks.length*100:0}%`,background:'linear-gradient(90deg,var(--brand),var(--brand2))'}}/>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:12.5,color:'var(--ink3)'}}>
                    <span>{done}/{tasks.length} tasks done</span>
                    <span style={{fontWeight:700,color:'var(--brand)'}}>{tasks.length?Math.round(done/tasks.length*100):0}%</span>
                  </div>
                  {active.examDate&&(
                    <div style={{fontSize:12,color:'var(--ink3)',marginTop:8,padding:'8px 0',borderTop:'1px solid var(--bdr)'}}>
                      📅 Exam Date: <strong>{new Date(active.examDate).toLocaleDateString('en-IN',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</strong>
                    </div>
                  )}
                </div>
              </div>

              {/* Task list */}
              <div style={{maxHeight:'60vh',overflowY:'auto'}}>
                {Object.entries(grouped).map(([day,dt])=>(
                  <div key={day} style={{background:'var(--card)',border:'1px solid var(--bdr)',borderRadius:11,padding:'12px 14px',marginBottom:10}}>
                    <div style={{fontSize:13,fontWeight:700,marginBottom:8,display:'flex',alignItems:'center',gap:8}}>
                      📅 {day}
                      <span style={{fontSize:11,fontWeight:400,color:'var(--ink3)',marginLeft:'auto'}}>{dt.filter(t=>t.completed).length}/{dt.length} done</span>
                    </div>
                    {dt.map(t=>(
                      <div key={t._id} style={{display:'flex',alignItems:'flex-start',gap:9,padding:'7px 0',borderBottom:'1px solid var(--bg2)',fontSize:12.5}}>
                        <div onClick={()=>toggle(t._id)} style={{width:17,height:17,borderRadius:4,border:`1.5px solid ${t.completed?'var(--grn)':'var(--bg3)'}`,background:t.completed?'var(--grn)':'transparent',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:'#fff',fontSize:10,flexShrink:0,marginTop:2}}>{t.completed?'✓':''}</div>
                        <span style={{fontSize:16,flexShrink:0}}>{SI[t.subject]||'📚'}</span>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{textDecoration:t.completed?'line-through':'none',color:t.completed?'var(--ink3)':'var(--ink2)',fontWeight:500}}>{t.task}</div>
                          {t.importantQuestions?.length>0&&(
                            <div style={{fontSize:11,color:'var(--brand)',marginTop:3}}>
                              ⭐ {t.importantQuestions.join(' · ').slice(0,80)}
                            </div>
                          )}
                          <div style={{fontSize:11,color:'var(--ink3)',marginTop:2}}>⏱️ {t.duration} min</div>
                        </div>
                        <span style={{background:PC[t.priority||'medium'],color:PT[t.priority||'medium'],fontSize:9.5,padding:'1.5px 7px',borderRadius:20,fontWeight:700,flexShrink:0}}>{t.priority||'med'}</span>
                      </div>
                    ))}
                  </div>
                ))}
                {tasks.length===0&&<div style={{textAlign:'center',padding:'30px',color:'var(--ink3)'}}>Generate a plan to see your schedule</div>}
              </div>
            </div>
          )}
          {!active&&<div className="card"><div className="cb" style={{textAlign:'center',padding:'40px'}}><div style={{fontSize:40,marginBottom:10}}>📅</div><div style={{fontSize:15,fontWeight:700}}>Generate your study plan →</div></div></div>}
        </>}

        {tab==='important'&&impQ&&(
          <div>
            <div className="card" style={{marginBottom:14}}>
              <div className="ch"><div className="ct">⭐ Must Revise</div></div>
              <div className="cb">
                {impQ.mustRevise?.map((t,i)=>(
                  <div key={i} style={{display:'flex',gap:9,padding:'7px 0',borderBottom:'1px solid var(--bdr)',fontSize:13}}>
                    <span style={{color:'var(--gold)',fontSize:14}}>★</span>
                    <span style={{color:'var(--ink2)'}}>{t}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="card" style={{marginBottom:14}}>
              <div className="ch"><div className="ct">❓ Likely Exam Questions</div></div>
              <div className="cb">
                {impQ.likelyQuestions?.map((q,i)=>(
                  <div key={i} style={{padding:'10px 0',borderBottom:'1px solid var(--bdr)'}}>
                    <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:4}}>
                      <span style={{background:q.priority==='high'?'#FEE2E2':'#FEF9C3',color:q.priority==='high'?'#991B1B':'#854D0E',fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:20}}>{q.priority||'medium'} · {q.marks||5}M</span>
                    </div>
                    <div style={{fontSize:13.5,fontWeight:600,color:'var(--ink)'}}>{q.question}</div>
                  </div>
                ))}
              </div>
            </div>
            {impQ.studyTips?.length>0&&(
              <div className="card"><div className="ch"><div className="ct">💡 Study Tips</div></div>
              <div className="cb">
                {impQ.studyTips.map((t,i)=>(
                  <div key={i} style={{display:'flex',gap:9,padding:'7px 0',borderBottom:i<impQ.studyTips.length-1?'1px solid var(--bdr)':'none',fontSize:13}}>
                    <span>✅</span><span style={{color:'var(--ink2)'}}>{t}</span>
                  </div>
                ))}
              </div></div>
            )}
          </div>
        )}
        {tab==='important'&&!impQ&&(
          <div className="card"><div className="cb" style={{textAlign:'center',padding:'40px'}}>
            <div style={{fontSize:36,marginBottom:10}}>⭐</div>
            <div style={{fontFamily:'Sora,sans-serif',fontSize:15,fontWeight:700,marginBottom:8}}>Get Important Questions</div>
            <div style={{fontSize:13,color:'var(--ink3)',marginBottom:16}}>Select a document below and click "Get Important Questions" to see what to focus on for your exam.</div>
          </div></div>
        )}
      </div>

      {/* Config panel */}
      <div>
        <div className="card" style={{marginBottom:14}}>
          <div className="ch"><div className="ct">🤖 Generate Study Plan</div></div>
          <div className="cb">
            <div className="fg"><label className="fl">Plan Title</label>
              <input className="fi" value={form.title} onChange={e=>set('title',e.target.value)}/>
            </div>
            <div className="fg"><label className="fl">📅 Exam Date</label>
              <input type="date" className="fi" value={form.examDate} onChange={e=>set('examDate',e.target.value)}/>
              {form.examDate&&<div style={{fontSize:12,color:'var(--ink3)',marginTop:4}}>
                Today: {new Date().toLocaleDateString('en-IN')} · Days left: {Math.max(0,Math.ceil((new Date(form.examDate)-new Date())/86400000))}
              </div>}
            </div>
            <div className="fg">
              <label className="fl">Subjects</label>
              <div style={{display:'flex',gap:7,flexWrap:'wrap',marginTop:7}}>
                {['Physics','Chemistry','Maths','Biology','History','DSA','DBMS','OS','Java','Python','Networks'].map(s=>(
                  <div key={s} className={`lp${form.subjects.includes(s)?' on':''}`} onClick={()=>toggleSub(s)}>{SI[s]||'📚'} {s}</div>
                ))}
              </div>
            </div>
            <div className="fg">
              <label className="fl">Syllabus / Topics (optional)</label>
              <textarea className="fi" rows={3} placeholder="Enter specific topics or chapter names to study..." value={form.syllabus} onChange={e=>set('syllabus',e.target.value)} style={{resize:'vertical'}}/>
            </div>
            <div className="fg">
              <label className="fl">PDF Document (for important questions)</label>
              <select className="fi" value={form.documentId} onChange={e=>set('documentId',e.target.value)}>
                <option value="">— Select PDF (optional) —</option>
                {docs.map(d=><option key={d._id} value={d._id}>{d.title}</option>)}
              </select>
            </div>
            <div className="fg"><label className="fl">Daily Study Hours: {form.dailyHours}h</label>
              <input type="range" min={2} max={12} step={1} value={form.dailyHours} onChange={e=>set('dailyHours',+e.target.value)} style={{width:'100%'}}/>
            </div>
            <div style={{display:'flex',gap:10}}>
              <button className="btn btn-p wf" onClick={generate} disabled={loading}>{loading?'⏳ Generating...':'🤖 Generate Plan'}</button>
              <button className="btn btn-s" onClick={getImportant} title="Get important questions from PDF">⭐</button>
            </div>
          </div>
        </div>

        {/* Today stats */}
        <div className="card">
          <div className="ch"><div className="ct">📊 Today</div></div>
          <div className="cb">
            <div style={{fontSize:12,color:'var(--ink3)',marginBottom:10}}>{new Date().toLocaleDateString('en-IN',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</div>
            {[['Total Tasks',tasks.length,'📋'],['Completed',done,'✅'],['Remaining',tasks.length-done,'📚'],['Study Hours',`${Math.round(tasks.reduce((a,t)=>a+(t.duration||60),0)/60)}h`,'⏰']].map(([l,v,ic],i)=>(
              <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:i<3?'1px solid var(--bdr)':'none',fontSize:13}}>
                <span style={{color:'var(--ink3)'}}>{ic} {l}</span><span style={{fontWeight:700}}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}