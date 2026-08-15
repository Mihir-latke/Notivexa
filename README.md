# Notivexa v3 — 30-Feature AI Academic Platform

## ▶ Quick Start

```bash
# Terminal 1 — Backend
cd backend
npm install
npm run dev
# Runs at http://localhost:5000

# Terminal 2 — Frontend  
cd frontend
npm install
npm run dev
# Runs at http://localhost:3000
```

**Demo Login:** student@demo.com / demo1234
**Teacher Login:** teacher@demo.com / demo1234

---

## 🆓 Free API Keys (Optional — Add to backend/.env)

| API | Free Tier | Get Key At |
|-----|-----------|-----------|
| **Groq AI** | Unlimited free | console.groq.com |
| **Google Gemini** | Unlimited free | aistudio.google.com |
| Google TTS | 1M chars/month | console.cloud.google.com |
| ElevenLabs TTS | 10K chars/month | elevenlabs.io |

Without keys: local PDF engine generates content (still works!)
With keys: Claude/Gemini/Groq generates much better content

---

## ✅ All 30 Features Working

### Dashboard
Click any of the 30 feature cards on the Dashboard.
Select a PDF → select language → click any feature → result appears instantly.

### Feature List
1.  🔗 Multi-PDF Knowledge Fusion — combine 2+ PDFs
2.  📋 Context-Preserved Summarization — smart summary
3.  ✍️ Handwriting Style Notes — 4 paper styles (Yellow/White/Cream/Blue)
4.  🖼️ Diagram Detection — upload image, AI reads and explains
5.  🕸️ AI Concept Linking — connects related topics in chat
6.  ❓ Dynamic Question Generator — MCQ + short + long answers
7.  🎯 Bloom's Taxonomy Mapping — BT1-BT5 on every question
8.  📊 CO Mapping System — CO1-CO5 on every paper
9.  🔮 Exam Pattern Prediction — predicts likely exam questions
10. 🔄 Smart Revision Mode — spaced repetition flashcards
11. 📈 Performance Dashboard — accuracy tracking
12. 🗺️ Concept Graph / Mind Map — visual topic structure
13. 🃏 Interactive 3D Flashcards — flip animation + Study Mode
14. 🖊️ Diagram Recognition — AI reads uploaded images
15. 🎙️ Podcast Generator — Indian English MP3 audio lecture
16. 🎬 Video Lecture — 20-min script + slides PDF + audio
17. 🇮🇳 Indian Accent Voice — Neural2 TTS voices
18. 📝 Lecture to Notes — PDF → comprehensive notes
19. 🌐 25+ Language Support — Hindi, Marathi, French, German...
20. 💬 Indian English Meanings — Hindi in [brackets]
21. 📦 Offline Study Pack — all outputs downloadable
22. 📅 Lesson Plan Generator — multi-week teacher plans
23. 📋 Assignment Generator — student assignments from PDF
24. ✅ Content Validation — output only from uploaded PDF
25. 🗄️ Smart Library — organized file management
26. 🤖 AI Tutor Chat — 150-200 word detailed answers
27. 📚 E-Book Search — 12 MCA books + 12 YouTube playlists
28. 📄 University Question Papers — exact 20M/60M CO+BL format
29. 📊 Slide Deck / PPT — 12-slide presentation PDF
30. 🔤 Vocabulary Glossary — key terms + Hindi meanings

---

## 🐛 Bugs Fixed in This Build

| Error | Cause | Fix |
|-------|-------|-----|
| `Cast to string at path "outputs"` | Mongoose `type` reserved word | Renamed to `kind` in schema |
| `makeNotesPDF is not a function` | Wrong import name | Uses `notesPDF` from pdfGenerator |
| `generateLessonPlan is not a function` | Double module.exports | Single clean export block |
| Flashcard flip not working | CSS class mismatch | Added `card-flip` + `card-face` CSS |
| Video shows only script | Incomplete handler | Now shows audio player + slides |
| Handwritten shows 1 style | Missing allHandwrittenPDFs | Generates all 4 styles |
| Paper format wrong | Old format | Exact 20M/60M table format with CO/BL |

---

## 📁 Project Structure

```
backend/
  controllers/
    authController.js      — Login, register, profile, theme
    documentController.js  — Upload PDF/image, extract text
    generateController.js  — All 16 generation endpoints
    chatController.js      — AI tutor chat sessions
  models/index.js          — All Mongoose schemas (kind not type)
  services/
    aiService.js           — 19 AI functions, free API fallback
    pdfEngine.js           — Local content generator (no API needed)
    pdfGenerator.js        — PDF creation (notes/hw/paper/slides)
  routes/                  — All API routes
  uploads/                 — User files (pdfs/audio/generated)

frontend/src/
  pages/
    Dashboard.jsx          — 30-feature click-to-run panel
    Notebook.jsx           — 11 output types + fuse + lesson plan
    Flashcards.jsx         — 3D flip + Study Mode
    Chatbot.jsx            — AI tutor with session history
    Podcast.jsx            — Audio lecture + real player
    Upload.jsx             — PDF + image with OCR
    Planner.jsx            — Syllabus + exam countdown
    Ebooks.jsx             — MCA books + YouTube
    Library.jsx            — Smart file management
    Performance.jsx        — Analytics + Bloom's breakdown
    Features.jsx           — All 30 features listed
    Settings.jsx           — Theme + API status + profile
    Login.jsx / Register.jsx
  components/Layout/Shell.jsx  — Sidebar with all navigation
  context/AuthContext.jsx       — Auth + theme management
  index.css                     — 3 themes + all component styles
```
