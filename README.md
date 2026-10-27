# Notivexa v2 — AI Academic Intelligence & Multilingual Study Platform

Notivexa transforms PDFs, scanned textbook pages, handwritten notes, and academic papers into structured study materials: comprehensive notes, interactive flashcards, exam questions, audio lectures, mind maps, video summaries, and presentation slides.

---

## 🌟 Key Capabilities

- **100% Offline Multilingual OCR Pipeline**:
  - Automatically identifies native text or scanned images using fast Unicode script analysis.
  - Supports 17 core languages: English, Hindi, Marathi, Gujarati, Bengali, Tamil, Telugu, Kannada, Urdu, Arabic, Spanish, French, German, Chinese (Simplified), Japanese, Korean, and Russian.
  - Smart Devanagari detection distinguishes Hindi and Marathi via lexical analysis and retroflex consonants (`\u0933`).
  - Automatic RTL detection for Arabic and Urdu.
  - On-demand, dynamic Tesseract `.traineddata` management with local caching in `backend/data/ocr-lang-data/` and graceful offline `eng` fallback.
  - SHA-256 OCR caching isolated by language set (`${contentHash}_${langSet}.json`).
- **Universal Output Language**:
  - Choose between `"english"`, `"original"`, or any specific target language for any AI generation or chatbot conversation.
  - Strict mathematical formula and source code preservation across translations.
- **Multilingual Academic Exports**:
  - **PDF Export**: Unicode TrueType font embedding (`Kalam` for Devanagari, `LiberationSans` for Cyrillic, `NanumPenScript` for Hangul).
  - **Word (DOCX) & PowerPoint (PPTX)**: Fully formatted educational documents and editable presentations with native RTL alignment.
  - **Audio Lectures (Podcast)**: Bundled Edge-TTS neural voices across 17 regional accents and languages.

---

## 🚀 Quickstart

### Prerequisites
- Node.js >= 18.0.0
- MongoDB Atlas or local MongoDB instance (local JSON storage fallback supported in development)

### 1. Backend Setup
```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your JWT_SECRET and database URI
npm run dev
```

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

Visit `http://localhost:3000` in your browser.

---

## 🧪 Automated Testing

Run the full automated test suite (66 tests covering Security, Multi-tenancy, Offline OCR, and Multilingual processing):
```bash
cd backend
npm test
```

Run tests individually:
```bash
npm test -- tests/api.test.js
npm test -- tests/ocr.test.js
npm test -- tests/multilingual.test.js
```

Build verification for production frontend:
```bash
cd frontend
npm run build
```

---

## 🔑 Environment Configuration

| Variable | Description | Default |
|:---|:---|:---|
| `JWT_SECRET` | Cryptographically secure random string (min 16 chars) | **Required in Prod** |
| `MONGODB_URI` | MongoDB Atlas or replica set connection string | **Recommended** |
| `ALLOW_DEMO_MODE` | Allow local JSON store when MongoDB is absent | `false` |
| `OCR_CONCURRENCY` | Maximum concurrent Tesseract worker processes | `2` |
| `GROQ_API_KEY` | Optional AI provider API key | Free tier available |
| `GEMINI_API_KEY` | Optional Google AI Studio key | Free tier available |
| `FRONTEND_URL` | Allowed CORS origin | `http://localhost:3000` |

---

## 📚 Documentation
- [Multilingual Architecture & Script Heuristics](docs/MULTILINGUAL.md)
- [Security Audit & Compliance](docs/SECURITY_AUDIT.md)
- [Deployment Checklist](docs/DEPLOYMENT_CHECKLIST.md)
- [Automated Test Cases](docs/TEST_CASES.md)
