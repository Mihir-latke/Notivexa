import { useNavigate } from 'react-router-dom'

const FEATURES = [
  {n:'Multi-PDF Knowledge Fusion',i:'🔗',cat:'Core AI',desc:'Upload multiple PDFs and fuse them into unified notes, summaries or question papers. Perfect for combining textbook chapters or lecture notes.',status:'active',endpoint:'/notebook'},
  {n:'Context-Preserved Summarization',i:'📋',cat:'Core AI',desc:'Generates summaries that preserve all key definitions, formulas and context — never loses important details.',status:'active',endpoint:'/notebook'},
  {n:'Handwriting Style Learning',i:'✍️',cat:'Output',desc:'4 distinct handwritten paper styles: Yellow Notebook, White Paper, Cream Vintage, Blue Ruled. Each generates real-looking handwritten PDFs.',status:'active',endpoint:'/notebook'},
  {n:'Handwritten Diagram Generator',i:'🖊️',cat:'Output',desc:'AI describes diagrams in the uploaded images for handwritten-style explanation.',status:'active',endpoint:'/upload'},
  {n:'AI Concept Linking',i:'🕸️',cat:'AI Tools',desc:'AI Tutor connects related concepts across your document and explains how topics link to each other.',status:'active',endpoint:'/chatbot'},
  {n:'Dynamic Question Generator',i:'❓',cat:'Assessment',desc:'Generates MCQ, fill-in-blanks, short answer, long answer, case study questions — all from your PDF.',status:'active',endpoint:'/notebook'},
  {n:"Bloom's Taxonomy Mapping",i:'🎯',cat:'Assessment',desc:'Every question is tagged BT1 (Remember) through BT5 (Evaluate) for structured assessment.',status:'active',endpoint:'/notebook'},
  {n:'CO Mapping System',i:'📊',cat:'Assessment',desc:'Course Outcomes (CO1-CO5) mapped to every question: Basics → Concepts → Application → Analysis → Advanced.',status:'active',endpoint:'/notebook'},
  {n:'Exam Pattern Prediction',i:'🔮',cat:'Assessment',desc:'Analyzes your PDF to predict the most likely exam questions based on content importance.',status:'active',endpoint:'/planner'},
  {n:'Smart Revision Mode',i:'🔄',cat:'Learning',desc:'Spaced repetition flashcard system — cards you miss appear more often. Track mastered vs remaining.',status:'active',endpoint:'/flashcards'},
  {n:'3D Knowledge Dashboard',i:'🌐',cat:'Analytics',desc:'Visual performance charts showing progress across subjects and flashcard accuracy over time.',status:'active',endpoint:'/performance'},
  {n:'Concept Graph Explorer',i:'🗺️',cat:'Visual',desc:'Interactive mind map showing topic relationships from your uploaded PDF.',status:'active',endpoint:'/notebook'},
  {n:'Interactive Flashcards',i:'🃏',cat:'Learning',desc:'3D flip animation cards with Study Mode, progress tracking and "Got It / Again" system.',status:'active',endpoint:'/flashcards'},
  {n:'Diagram Detection',i:'🖼️',cat:'AI Tools',desc:'Upload image/photo of textbook — AI reads text, explains diagrams, identifies formulas.',status:'active',endpoint:'/upload'},
  {n:'Flowchart Generator',i:'🗺️',cat:'Visual',desc:'Generates visual mind maps and concept flowcharts from document structure.',status:'active',endpoint:'/notebook'},
  {n:'Podcast Generator',i:'🎙️',cat:'Audio',desc:'8-10 minute audio lecture script with real MP3 using Google TTS or ElevenLabs.',status:'active',endpoint:'/podcast'},
  {n:'Video Generator',i:'🎬',cat:'Video',desc:'Full 20-minute lecture: complete script + 12-slide PDF + narration audio file.',status:'active',endpoint:'/notebook'},
  {n:'Indian Accent Voice',i:'🇮🇳',cat:'Audio',desc:'Indian English Neural2 voices (male/female) via Google TTS. Supports Hindi, Marathi, Tamil, Telugu.',status:'active',endpoint:'/podcast'},
  {n:'Lecture to Notes',i:'📝',cat:'Core AI',desc:'Converts any uploaded document into comprehensive study notes with headings and bullet points.',status:'active',endpoint:'/notebook'},
  {n:'Multi-language Support',i:'🌐',cat:'Languages',desc:'25+ languages: Hindi, Marathi, Bengali, Tamil, Telugu, French, German, Japanese, Arabic and more.',status:'active',endpoint:'/notebook'},
  {n:'Indian English Meaning',i:'💬',cat:'Languages',desc:'Technical terms explained in simple Hindi in [brackets] throughout all generated content.',status:'active',endpoint:'/chatbot'},
  {n:'Offline Study Pack',i:'📦',cat:'Downloads',desc:'Download all generated content as PDFs to study offline. All files saved in My Library.',status:'active',endpoint:'/library'},
  {n:'Lesson Plan Generator',i:'📅',cat:'Teacher Tools',desc:'Multi-week lesson plans with sessions, objectives, activities and assessment plan.',status:'active',endpoint:'/notebook'},
  {n:'Assignment Generator',i:'📝',cat:'Teacher Tools',desc:'Complete student assignments with Part A/B questions, instructions and marks breakdown.',status:'active',endpoint:'/notebook'},
  {n:'Plagiarism Detection',i:'🔍',cat:'Validation',desc:'Verifies that generated content matches the uploaded document — no external content added.',status:'active',endpoint:'/notebook'},
  {n:'Performance Analyzer',i:'📈',cat:'Analytics',desc:'Track flashcard scores, session history, accuracy rates and subject-wise performance.',status:'active',endpoint:'/performance'},
  {n:'E-Book Search',i:'📚',cat:'Resources',desc:'12 MCA textbooks, NCERT, HCV, Irodov + 12 YouTube lecture playlists from top educators.',status:'active',endpoint:'/ebooks'},
  {n:'Content Validation',i:'✅',cat:'Validation',desc:'AI ensures all outputs are sourced ONLY from your uploaded PDF — no hallucination.',status:'active',endpoint:'/notebook'},
  {n:'Smart Library',i:'🗄️',cat:'Management',desc:'Organized repository of all uploads and generated files with search and filter.',status:'active',endpoint:'/library'},
  {n:'AI Tutor',i:'🤖',cat:'AI Tools',desc:'Detailed 150-200 word answers from your PDF with examples, formulas and exam tips.',status:'active',endpoint:'/chatbot'},
]

const CATS = [...new Set(FEATURES.map(f=>f.cat))]
const CAT_COLORS = {'Core AI':'#EDE9FE','Output':'#DCFCE7','AI Tools':'#DBEAFE','Assessment':'#FEF9C3','Learning':'#F0FDF4','Analytics':'#FFF7ED','Visual':'#F5F3FF','Audio':'#FFF1F2','Video':'#FEE2E2','Languages':'#E0F2FE','Downloads':'#F0FDF4','Teacher Tools':'#FFFBEB','Validation':'#ECFDF5','Resources':'#FDF4FF','Management':'#F8F7FF'}

export default function Features() {
  const navigate = useNavigate()
  return(
    <div>
      <div style={{background:'linear-gradient(135deg,#4F46E5,#7C3AED)',borderRadius:14,padding:'22px 26px',marginBottom:22,color:'#fff'}}>
        <div style={{fontFamily:'Sora,sans-serif',fontSize:20,fontWeight:800,marginBottom:6}}>✨ All 30 Novel Features</div>
        <div style={{fontSize:13,opacity:.8}}>From the VeriNexis Core Project Document — all implemented in Notivexa v3</div>
      </div>
      {CATS.map(cat=>{
        const items=FEATURES.filter(f=>f.cat===cat)
        const bg=CAT_COLORS[cat]||'#F9F8FF'
        return(
          <div key={cat} style={{marginBottom:24}}>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
              <div style={{background:bg,padding:'4px 12px',borderRadius:20,fontSize:12,fontWeight:700,color:'var(--ink2)'}}>{cat}</div>
              <span style={{fontSize:12,color:'var(--ink3)'}}>{items.length} feature{items.length>1?'s':''}</span>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}>
              {items.map((f,i)=>(
                <div key={i} onClick={()=>navigate(f.endpoint)} style={{background:'var(--card)',border:'1px solid var(--bdr)',borderRadius:11,padding:'14px 15px',cursor:'pointer',transition:'all .2s',position:'relative'}}
                  onMouseOver={e=>{e.currentTarget.style.boxShadow='var(--sh2)';e.currentTarget.style.borderColor='var(--brand)'}}
                  onMouseOut={e=>{e.currentTarget.style.boxShadow='var(--sh)';e.currentTarget.style.borderColor='var(--bdr)'}}>
                  <div style={{position:'absolute',top:10,right:10,background:'#DCFCE7',color:'#166534',fontSize:9,fontWeight:700,padding:'1.5px 6px',borderRadius:20}}>✓ LIVE</div>
                  <div style={{fontSize:22,marginBottom:8}}>{f.i}</div>
                  <div style={{fontSize:13,fontWeight:700,marginBottom:5,paddingRight:40}}>{FEATURES.indexOf(f)+1}. {f.n}</div>
                  <div style={{fontSize:11.5,color:'var(--ink3)',lineHeight:1.6}}>{f.desc}</div>
                  <div style={{marginTop:8,fontSize:11,color:'var(--brand)',fontWeight:600}}>→ {f.endpoint}</div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}