/**
 * videoScriptService.js
 * Generates structured, document-grounded educational scripts for animated video lectures.
 * Supports Multi-language: English, Marathi, Hindi, Gujarati, Bengali, Tamil, etc.
 */

const { callAI, callGeminiFlash, callGroq } = require('./aiService');
const { resolveOutputLanguage } = require('./ocr/languageDetectionService');

function extractKeySentences(text, maxSentences = 8) {
  if (!text) return [];
  const clean = text
    .replace(/[#*`_\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const sentences = clean.split(/(?<=[.?!।\n]+)\s+/).filter(s => s.length > 25 && s.length < 200);
  return sentences.slice(0, maxSentences);
}

function extractKeyTerms(text, maxTerms = 6) {
  if (!text) return [];
  const words = text.match(/\b[A-Za-z\u0900-\u097F]{4,}\b/g) || [];
  const freq = {};
  for (const w of words) {
    const l = w.toLowerCase();
    if (['this', 'that', 'with', 'from', 'have', 'were', 'which', 'about', 'there', 'their'].includes(l)) continue;
    freq[w] = (freq[w] || 0) + 1;
  }
  return Object.keys(freq).sort((a, b) => freq[b] - freq[a]).slice(0, maxTerms);
}

/**
 * Offline grounded script builder fallback when AI APIs are unreachable or offline.
 */
function buildOfflineGroundedScript(content, title, subject, language = 'English') {
  const sentences = extractKeySentences(content, 6);
  const terms = extractKeyTerms(content, 4);
  const coreTopic = terms[0] || title || 'Academic Concept';

  const isDev = ['Marathi', 'Hindi'].includes(language);
  const isMarathi = language === 'Marathi';

  const s1Title = isMarathi ? `परिचय: ${coreTopic}` : (isDev ? `परिचय: ${coreTopic}` : `Introduction to ${coreTopic}`);
  const s2Title = isMarathi ? `मूलभूत संकल्पना आणि कार्यपद्धती` : (isDev ? `मुख्य अवधारणा एवं कार्यप्रणाली` : `Core Concept & Working Mechanism`);
  const s3Title = isMarathi ? `अभ्यासक्रम सारांश आणि प्रश्न` : (isDev ? `निष्कर्ष एवं पुनरावृत्ती प्रश्न` : `Summary & Key Takeaways`);

  const p1 = sentences[0] || (isMarathi ? `${coreTopic} हा संगणक शास्त्रातील अत्यंत महत्त्वाचा घटक आहे.` : `${coreTopic} forms a core foundational pillar in academic syllabus.`);
  const p2 = sentences[1] || (isMarathi ? `या प्रक्रियेमुळे प्रणालीची कार्यक्षमता आणि अचूकता वाढते.` : `It ensures structured workflow and high execution efficiency.`);
  const p3 = sentences[2] || (isMarathi ? `परीक्षेच्या दृष्टीने या संकल्पनेचे प्रमुख नियम लक्षात ठेवा.` : `Understanding these rules is essential for syllabus mastery.`);

  return {
    title: `${title || coreTopic}`,
    subject: subject || 'General Studies',
    language,
    overview: isMarathi ? `${coreTopic} वरील संवादात्मक शैक्षणिक व्याख्यान.` : `Interactive educational lecture on ${coreTopic}.`,
    scenes: [
      {
        sceneNumber: 1,
        type: 'intro',
        title: s1Title,
        objective: isMarathi ? `विषयाची तोंडओळख करून देणे` : `Introduce core concept`,
        narration: isMarathi 
          ? `नमस्कार! आज आपण ${coreTopic} या महत्त्वाच्या विषयाचा सविस्तर अभ्यास करणार आहोत. लक्षपूर्वक ऐका आणि समजून घ्या.`
          : (isDev 
            ? `नमस्कार! आज हम ${coreTopic} के महत्वपूर्ण विषय का अध्ययन करने जा रहे हैं।`
            : `Welcome students! Today we are exploring the key principles of ${coreTopic}.`),
        visualPrompt: `Educational whiteboard with header "${coreTopic}" and vibrant focus banner`,
        boardPoints: [
          isMarathi ? `१. विषयाची मूलभूत व्याख्या` : `1. Core Academic Definition`,
          isMarathi ? `२. अभ्यासक्रमातील महत्त्व` : `2. Syllabus Scope & Importance`
        ],
        diagram: {
          type: 'hierarchy',
          nodes: [
            { id: '1', label: coreTopic, color: '#10b981' },
            { id: '2', label: terms[1] || 'Principle A', color: '#6366f1' },
            { id: '3', label: terms[2] || 'Principle B', color: '#06b6d4' }
          ],
          edges: [
            { from: '1', to: '2', label: 'Includes' },
            { from: '1', to: '3', label: 'Governs' }
          ]
        },
        estimatedDuration: 7
      },
      {
        sceneNumber: 2,
        type: 'explanation',
        title: s2Title,
        objective: isMarathi ? `कार्यपद्धती स्पष्ट करणे` : `Explain detailed working mechanism`,
        narration: isMarathi
          ? `${p1} ही रचना समजून घेणे अत्यंत सोपे आहे. ${p2} यामुळे अचूक परिणाम साध्य होतात.`
          : (isDev
            ? `${p1} इसे समझना अत्यंत सहज है। ${p2}`
            : `${p1} Notice how this operates systematically. ${p2}`),
        visualPrompt: `Step by step flowchart demonstrating flow from input to structured output`,
        boardPoints: [
          isMarathi ? `• पायरी १: माहितीचे संकलन` : `• Step 1: Input & Data Preparation`,
          isMarathi ? `• पायरी २: प्रक्रियेचे नियोजन` : `• Step 2: System Processing`,
          isMarathi ? `• पायरी ३: अचूक निष्कर्ष` : `• Step 3: Verified Output`
        ],
        diagram: {
          type: 'flowchart',
          nodes: [
            { id: 'in', label: 'Input / Start', color: '#3b82f6' },
            { id: 'proc', label: coreTopic, color: '#10b981' },
            { id: 'out', label: 'Target Result', color: '#8b5cf6' }
          ],
          edges: [
            { from: 'in', to: 'proc', label: 'Pass' },
            { from: 'proc', to: 'out', label: 'Generate' }
          ]
        },
        estimatedDuration: 9
      },
      {
        sceneNumber: 3,
        type: 'conclusion',
        title: s3Title,
        objective: isMarathi ? `महत्त्वाचे मुद्दे व प्रश्न` : `Consolidate takeaways and review questions`,
        narration: isMarathi
          ? `थोडक्यात सांगायचे तर, ${p3} हे मुद्दे नीट लक्षात ठेवा. धन्यवाद आणि पुढील अभ्यासासाठी शुभेच्छा!`
          : (isDev
            ? `संक्षेप में, ${p3} इन मुख्य बिंदुओं को याद रखें। धन्यवाद!`
            : `To summarize, ${p3} Keep these core principles ready for your exams. Thank you!`),
        visualPrompt: `Review blackboard showing summary tick points and key equation card`,
        boardPoints: [
          isMarathi ? `✔ मुख्य निष्कर्ष नोंदवा` : `✔ Key Principles Mastered`,
          isMarathi ? `✔ परीक्षेसाठी उजळणी करा` : `✔ Ready for Assessment`
        ],
        diagram: {
          type: 'formula',
          formula: `${coreTopic} = Method + Execution -> Success`,
          nodes: [
            { id: 'm', label: 'Methodology', color: '#10b981' },
            { id: 'e', label: 'Efficiency', color: '#f59e0b' }
          ],
          edges: [{ from: 'm', to: 'e', label: 'Ensures' }]
        },
        estimatedDuration: 6
      }
    ],
    quiz: [
      {
        question: isMarathi ? `${coreTopic} चा मुख्य उद्देश काय आहे?` : `What is the primary function of ${coreTopic}?`,
        answer: isMarathi ? p1 : p1
      }
    ]
  };
}

/**
 * Generate Structured Educational Script from document content.
 */
async function generateEducationalScript({
  content,
  title = 'Academic Topic',
  subject = 'General Studies',
  language = 'English',
  difficulty = 'intermediate',
  sceneCount = 3,
  docPrimaryLang = 'eng'
}) {
  const normLang = resolveOutputLanguage(language, docPrimaryLang).name;
  const clampedScenes = Math.min(Math.max(Number(sceneCount) || 3, 2), 5);

  const cleanContent = (content || '').slice(0, 10000);
  if (!cleanContent.trim()) {
    return buildOfflineGroundedScript(content, title, subject, normLang);
  }

  const isMarathi = normLang === 'Marathi';
  const isDev = ['Marathi', 'Hindi'].includes(normLang);

  const sysPrompt = `You are a master educational curriculum architect and AI animated lecture scriptwriter for Notivexa.
Your role: Write a highly engaging, document-grounded, scene-by-scene educational lecture script.

CRITICAL RULES:
1. STRICT DOCUMENT GROUNDING: Base all points and explanations ONLY on facts, terms, and logic from the provided document. Do NOT hallucinate external trivia.
2. TARGET LANGUAGE: Write all titles, narration, boardPoints, objective, and quiz in ${normLang}.
${isMarathi ? 'IMPORTANT: Use natural, authentic Marathi (मराठी) grammar and educational vocabulary (उदा. व्याख्या, संकल्पना, पायऱ्या, निष्कर्ष, प्रश्न).' : ''}
3. SCENE BREAKDOWN: Produce exactly ${clampedScenes} logical scenes:
   - Scene 1: Concept introduction & motivating hook.
   - Scene 2..${clampedScenes - 1}: Deep explanation, working mechanism, diagram/flowchart steps.
   - Scene ${clampedScenes}: Practical takeaway, exam review & revision question.
4. NARRATION DURATION: Each scene's spoken narration must be concise (25-45 words per scene) so speech is clean, clear, and perfectly paced (6 to 10 seconds per scene).
5. DIAGRAM DATA: For each scene, specify diagram type ("flowchart" | "hierarchy" | "formula" | "cycle") with labeled nodes and edges so the animation engine can render it.

RETURN ONLY VALID JSON matching this schema (no markdown fences, no extra text):
{
  "title": "${title}",
  "subject": "${subject}",
  "language": "${normLang}",
  "overview": "Brief 1-sentence summary in ${normLang}",
  "scenes": [
    {
      "sceneNumber": 1,
      "type": "intro",
      "title": "Scene title in ${normLang}",
      "objective": "Learning objective in ${normLang}",
      "narration": "Spoken teacher voiceover script in ${normLang} (30-40 words)",
      "visualPrompt": "Visual animation instructions",
      "boardPoints": ["Point 1 in ${normLang}", "Point 2 in ${normLang}"],
      "diagram": {
        "type": "flowchart",
        "nodes": [
          { "id": "1", "label": "Node label", "color": "#10b981" },
          { "id": "2", "label": "Node label", "color": "#6366f1" }
        ],
        "edges": [
          { "from": "1", "to": "2", "label": "Relationship" }
        ],
        "formula": "optional formula or equation"
      },
      "estimatedDuration": 8
    }
  ],
  "quiz": [
    {
      "question": "Question in ${normLang}",
      "answer": "Answer grounded in document in ${normLang}"
    }
  ]
}`;

  const userPrompt = `Document Title: ${title}
Subject: ${subject}
Target Language: ${normLang}
Difficulty: ${difficulty}
Required Scenes: ${clampedScenes}

Source Document Extract:
${cleanContent}`;

  try {
    let raw = await callAI(sysPrompt, userPrompt, 6000);
    raw = (raw || '').trim().replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();

    const jsonStart = raw.indexOf('{');
    const jsonEnd = raw.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
      if (parsed && Array.isArray(parsed.scenes) && parsed.scenes.length > 0) {
        parsed.language = normLang;
        parsed.title = parsed.title || title;
        parsed.subject = parsed.subject || subject;
        return parsed;
      }
    }
  } catch (err) {
    console.warn('[VideoScriptService AI Fallback]:', err.message);
  }

  // Fallback to grounded offline generator
  return buildOfflineGroundedScript(content, title, subject, normLang);
}

module.exports = {
  generateEducationalScript,
  buildOfflineGroundedScript
};

