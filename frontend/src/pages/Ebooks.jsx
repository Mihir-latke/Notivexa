import { useState, useEffect } from 'react'
import api from '../utils/api'

const LINKS = [
  {name:'NCERT Official',url:'https://ncert.nic.in',icon:'📗',desc:'Free NCERT textbooks'},
  {name:'Internet Archive',url:'https://archive.org',icon:'📦',desc:'Millions of free books'},
  {name:'Khan Academy',url:'https://khanacademy.org',icon:'🎓',desc:'Free video lessons'},
  {name:'NPTEL',url:'https://nptel.ac.in',icon:'🎯',desc:'IIT video lectures'},
  {name:'Vedantu',url:'https://vedantu.com',icon:'📺',desc:'Live online classes'},
  {name:'Physics Wallah',url:'https://pw.live',icon:'⚡',desc:'Affordable coaching'},
  {name:'GeeksforGeeks',url:'https://geeksforgeeks.org',icon:'💻',desc:'CS & MCA resources'},
  {name:'MIT OpenCourseWare',url:'https://ocw.mit.edu',icon:'🏛️',desc:'Free MIT courses'},
]

const MCA_YOUTUBE = [
  { title:'Data Structures & Algorithms', channel:'Jenny\'s Lectures CS IT', url:'https://www.youtube.com/@JennyslecturesCSIT', icon:'🗂️', desc:'Full DSA playlist — arrays, trees, graphs, sorting', views:'4.2M' },
  { title:'DBMS Full Course', channel:'Gate Smashers', url:'https://www.youtube.com/@GateSmashers', icon:'🗄️', desc:'Complete DBMS — ER diagrams, SQL, normalization, transactions', views:'3.8M' },
  { title:'Operating System', channel:'Neso Academy', url:'https://www.youtube.com/@nesoacademy', icon:'💻', desc:'OS concepts — process, memory management, deadlock, scheduling', views:'5.1M' },
  { title:'Computer Networks', channel:'Gate Smashers', url:'https://www.youtube.com/@GateSmashers', icon:'🌐', desc:'Networking — OSI model, TCP/IP, routing, protocols', views:'2.9M' },
  { title:'C Programming Full Course', channel:'CodeWithHarry', url:'https://www.youtube.com/@CodeWithHarry', icon:'🔤', desc:'Complete C language from basics to pointers and structures', views:'6.5M' },
  { title:'Java Full Course', channel:'Apna College', url:'https://www.youtube.com/@ApnaCollegeOfficial', icon:'☕', desc:'Java OOP, collections, exception handling, JDBC', views:'7.2M' },
  { title:'Python for Beginners', channel:'CodeWithHarry', url:'https://www.youtube.com/@CodeWithHarry', icon:'🐍', desc:'Python basics to advanced — perfect for MCA students', views:'8.1M' },
  { title:'Software Engineering', channel:'Education 4u', url:'https://www.youtube.com/@education4u', icon:'🔧', desc:'SDLC, Agile, UML diagrams, testing methodologies', views:'1.4M' },
  { title:'Theory of Computation', channel:'Neso Academy', url:'https://www.youtube.com/@nesoacademy', icon:'🧮', desc:'Automata, DFA, NFA, CFG, Turing machines', views:'2.1M' },
  { title:'Web Development (HTML/CSS/JS)', channel:'Traversy Media', url:'https://www.youtube.com/@TraversyMedia', icon:'🌍', desc:'Full-stack web dev — HTML, CSS, JavaScript, React', views:'9.3M' },
  { title:'Machine Learning', channel:'Krish Naik', url:'https://www.youtube.com/@krishnaik06', icon:'🤖', desc:'ML algorithms, Python sklearn, projects for MCA', views:'3.5M' },
  { title:'Computer Organization & Architecture', channel:'Gate Smashers', url:'https://www.youtube.com/@GateSmashers', icon:'🖥️', desc:'COA — number systems, ALU, memory hierarchy, pipeline', views:'1.8M' },
]

const MCA_BOOKS = [
  { id:'m1', title:'Let Us C', author:'Yashavant Kanetkar', emoji:'🔤', color:'#EDE9FE', url:'https://archive.org/search?query=let+us+c+kanetkar', tags:['C','Programming','MCA'] },
  { id:'m2', title:'Introduction to Algorithms (CLRS)', author:'Cormen, Leiserson, Rivest, Stein', emoji:'🗂️', color:'#DCFCE7', url:'https://archive.org/search?query=introduction+to+algorithms+cormen', tags:['Algorithms','DSA','MCA'] },
  { id:'m3', title:'Database System Concepts', author:'Silberschatz, Korth, Sudarshan', emoji:'🗄️', color:'#FEF9C3', url:'https://archive.org/search?query=database+system+concepts+silberschatz', tags:['DBMS','SQL','MCA'] },
  { id:'m4', title:'Operating System Concepts', author:'Galvin, Silberschatz', emoji:'💻', color:'#FEE2E2', url:'https://archive.org/search?query=operating+system+concepts+galvin', tags:['OS','MCA','Systems'] },
  { id:'m5', title:'Computer Networks', author:'Andrew Tanenbaum', emoji:'🌐', color:'#E0F2FE', url:'https://archive.org/search?query=computer+networks+tanenbaum', tags:['Networks','TCP','MCA'] },
  { id:'m6', title:'Object Oriented Programming in Java', author:'E. Balagurusamy', emoji:'☕', color:'#FEF3C7', url:'https://archive.org/search?query=java+balagurusamy', tags:['Java','OOP','MCA'] },
  { id:'m7', title:'Software Engineering', author:'Roger Pressman', emoji:'🔧', color:'#F0FDF4', url:'https://archive.org/search?query=software+engineering+pressman', tags:['SE','SDLC','MCA'] },
  { id:'m8', title:'Discrete Mathematics', author:'Kenneth Rosen', emoji:'🧮', color:'#FDF4FF', url:'https://archive.org/search?query=discrete+mathematics+rosen', tags:['Maths','TOC','MCA'] },
  { id:'m9', title:'Python Programming', author:'Mark Lutz', emoji:'🐍', color:'#ECFDF5', url:'https://archive.org/search?query=learning+python+mark+lutz', tags:['Python','MCA','AI/ML'] },
  { id:'m10', title:'Head First Design Patterns', author:'Freeman & Robson', emoji:'🏗️', color:'#FFF7ED', url:'https://archive.org/search?query=head+first+design+patterns', tags:['Design Patterns','Java','MCA'] },
  { id:'m11', title:'Compiler Design', author:'Alfred Aho (Dragon Book)', emoji:'🐉', color:'#EFF6FF', url:'https://archive.org/search?query=compilers+principles+techniques+aho', tags:['Compiler','TOC','MCA'] },
  { id:'m12', title:'Computer Organization', author:'Carl Hamacher', emoji:'🖥️', color:'#FFF1F2', url:'https://archive.org/search?query=computer+organization+hamacher', tags:['COA','Architecture','MCA'] },
]

export default function Ebooks() {
  const [books, setBooks] = useState([])
  const [query, setQuery] = useState('')
  const [subject, setSubject] = useState('All')
  const [tab, setTab] = useState('mca') // mca | general | youtube | resources

  const load = (q='', sub='All') =>
    api.get('/ebooks?q='+encodeURIComponent(q)+'&subject='+(sub==='All'?'':sub))
      .then(r => setBooks(r.data.books||[])).catch(()=>{})

  useEffect(() => { load() }, [])

  const filteredMCA = MCA_BOOKS.filter(b => {
    const q = query.toLowerCase()
    return !q || b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q) || b.tags.some(t => t.toLowerCase().includes(q))
  }).filter(b => subject === 'All' || b.tags.includes(subject))

  return (
    <div>
      <div style={{ display:'flex', gap:10, marginBottom:12 }}>
        <input className="fi" style={{ flex:1 }} placeholder="🔍 Search books, authors, subjects..."
          value={query} onChange={e=>setQuery(e.target.value)}
          onKeyDown={e=>e.key==='Enter'&&(tab==='general'?load(query,subject):null)}/>
        {tab === 'general' && <button className="btn btn-p" onClick={()=>load(query,subject)}>Search</button>}
      </div>

      {/* Main tabs */}
      <div className="tbr" style={{ marginBottom:14 }}>
        <div className={'tab'+(tab==='mca'?' on':'')} onClick={()=>setTab('mca')}>🎓 MCA Books</div>
        <div className={'tab'+(tab==='youtube'?' on':'')} onClick={()=>setTab('youtube')}>▶️ YouTube Lectures</div>
        <div className={'tab'+(tab==='general'?' on':'')} onClick={()=>setTab('general')}>📚 General Library</div>
        <div className={'tab'+(tab==='resources'?' on':'')} onClick={()=>setTab('resources')}>🌐 Online Resources</div>
      </div>

      {/* MCA Books Tab */}
      {tab === 'mca' && (
        <div>
          <div style={{ display:'flex', gap:7, marginBottom:14, flexWrap:'wrap' }}>
            {['All','MCA','DSA','DBMS','OS','Networks','Java','Python','AI/ML','Maths'].map(s => (
              <div key={s} className={'lp'+(subject===s?' on':'')} onClick={()=>setSubject(s)}>{s}</div>
            ))}
          </div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
            <div style={{ fontFamily:'Sora,sans-serif', fontSize:14, fontWeight:700 }}>📚 MCA Recommended Textbooks</div>
            <span className="chip">🎓 {filteredMCA.length} books</span>
          </div>
          <div className="g3">
            {filteredMCA.map(b => (
              <div key={b.id} style={{ background:'var(--card)', border:'1px solid var(--bdr)', borderRadius:12, overflow:'hidden', transition:'all .2s' }}
                onMouseOver={e=>e.currentTarget.style.boxShadow='var(--sh2)'}
                onMouseOut={e=>e.currentTarget.style.boxShadow='var(--sh)'}>
                <div style={{ height:90, background:b.color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:38 }}>{b.emoji}</div>
                <div style={{ padding:'12px 14px' }}>
                  <div style={{ fontSize:13, fontWeight:700, marginBottom:2, lineHeight:1.3 }}>{b.title}</div>
                  <div style={{ fontSize:11.5, color:'var(--ink3)', marginBottom:8 }}>{b.author}</div>
                  <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginBottom:10 }}>
                    {b.tags.map(t => <span key={t} style={{ fontSize:10, padding:'2px 8px', borderRadius:20, background:'var(--bg2)', color:'var(--ink3)', fontWeight:600 }}>{t}</span>)}
                  </div>
                  <a href={b.url} target="_blank" rel="noreferrer" className="btn btn-p btn-sm wf" style={{ textDecoration:'none', justifyContent:'center' }}>📖 Find Free Copy</a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* YouTube Tab */}
      {tab === 'youtube' && (
        <div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
            <div style={{ fontFamily:'Sora,sans-serif', fontSize:14, fontWeight:700 }}>▶️ MCA YouTube Lectures</div>
            <span className="chip">🎓 {MCA_YOUTUBE.length} channels</span>
          </div>
          <div style={{ background:'#FEF9C3', border:'1px solid #E5D87A', borderRadius:10, padding:'10px 14px', marginBottom:14, fontSize:12.5, color:'#854D0E' }}>
            📌 These are curated free YouTube channels for MCA subjects. Click to open on YouTube.
          </div>
          <div className="g2">
            {MCA_YOUTUBE.filter(v => !query || v.title.toLowerCase().includes(query.toLowerCase()) || v.channel.toLowerCase().includes(query.toLowerCase())).map((v,i) => (
              <a key={i} href={v.url} target="_blank" rel="noreferrer"
                style={{ background:'var(--card)', border:'1px solid var(--bdr)', borderRadius:12, padding:'14px 16px', textDecoration:'none', color:'inherit', display:'flex', gap:14, transition:'.15s' }}
                onMouseOver={e=>{e.currentTarget.style.borderColor='var(--brand)';e.currentTarget.style.boxShadow='var(--sh2)'}}
                onMouseOut={e=>{e.currentTarget.style.borderColor='var(--bdr)';e.currentTarget.style.boxShadow='none'}}>
                <div style={{ width:52, height:52, borderRadius:10, background:'#FF0000', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, flexShrink:0 }}>{v.icon}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13.5, fontWeight:700, marginBottom:2, lineHeight:1.3 }}>{v.title}</div>
                  <div style={{ fontSize:11.5, color:'var(--brand)', fontWeight:600, marginBottom:4 }}>📺 {v.channel}</div>
                  <div style={{ fontSize:11.5, color:'var(--ink3)', lineHeight:1.4, marginBottom:6 }}>{v.desc}</div>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <span style={{ fontSize:10, background:'#FEE2E2', color:'#B91C1C', padding:'2px 8px', borderRadius:20, fontWeight:700 }}>▶ YouTube</span>
                    <span style={{ fontSize:10, color:'var(--ink3)' }}>👁 {v.views} views</span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* General Library Tab */}
      {tab === 'general' && (
        <div>
          <div style={{ display:'flex', gap:7, marginBottom:14, flexWrap:'wrap' }}>
            {['All','Physics','Chemistry','Maths','Biology','History'].map(s => (
              <div key={s} className={'lp'+(subject===s?' on':'')} onClick={()=>{setSubject(s);load(query,s)}}>{s}</div>
            ))}
          </div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
            <div style={{ fontFamily:'Sora,sans-serif', fontSize:14, fontWeight:700 }}>📚 General Study Materials</div>
            <span className="chip">🇮🇳 {books.length} books</span>
          </div>
          <div className="g3">
            {books.map(b => (
              <div key={b.id} style={{ background:'var(--card)', border:'1px solid var(--bdr)', borderRadius:12, overflow:'hidden', transition:'all .2s' }}
                onMouseOver={e=>e.currentTarget.style.boxShadow='var(--sh2)'}
                onMouseOut={e=>e.currentTarget.style.boxShadow='var(--sh)'}>
                <div style={{ height:90, background:b.color||'#EDE9FE', display:'flex', alignItems:'center', justifyContent:'center', fontSize:38 }}>{b.emoji}</div>
                <div style={{ padding:'12px 14px' }}>
                  <div style={{ fontSize:13, fontWeight:700, marginBottom:2, lineHeight:1.3 }}>{b.title}</div>
                  <div style={{ fontSize:11.5, color:'var(--ink3)', marginBottom:8 }}>{b.author}</div>
                  <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginBottom:10 }}>
                    {b.tags?.map(t => <span key={t} style={{ fontSize:10, padding:'2px 8px', borderRadius:20, background:'var(--bg2)', color:'var(--ink3)', fontWeight:600 }}>{t}</span>)}
                  </div>
                  <a href={b.url} target="_blank" rel="noreferrer" className="btn btn-p btn-sm wf" style={{ textDecoration:'none', justifyContent:'center' }}>📖 Open Free</a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Resources Tab */}
      {tab === 'resources' && (
        <div>
          <div style={{ fontFamily:'Sora,sans-serif', fontSize:14, fontWeight:700, marginBottom:14 }}>🌐 Online Study Resources</div>
          <div className="g3">
            {LINKS.map(l => (
              <a key={l.name} href={l.url} target="_blank" rel="noreferrer"
                style={{ border:'1px solid var(--bdr)', borderRadius:11, padding:'13px 15px', display:'flex', alignItems:'center', gap:11, textDecoration:'none', color:'inherit', transition:'.15s', background:'var(--card)' }}
                onMouseOver={e=>e.currentTarget.style.borderColor='var(--brand)'}
                onMouseOut={e=>e.currentTarget.style.borderColor='var(--bdr)'}>
                <span style={{ fontSize:22 }}>{l.icon}</span>
                <div>
                  <div style={{ fontSize:13, fontWeight:700 }}>{l.name}</div>
                  <div style={{ fontSize:11.5, color:'var(--ink3)', marginTop:2 }}>{l.desc}</div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
