/**
 * bookUnderstanding.test.js
 * Comprehensive automated test suite for Notivexa Universal Book Understanding & Multilingual Notes Generation.
 */

const {
  classifyDocument,
  detectBookStructure,
  calculateExtractionQuality,
  cleanRunningHeadersAndNoise,
  extractEntitiesAndThemes
} = require('../services/bookUnderstandingService');

const {
  getSentences,
  getTopics,
  makeHandwrittenChapterNotes,
  makeNovelHandwrittenNotes,
  makeHistoryHandwrittenNotes,
  makeResearchHandwrittenNotes,
  makeAcademicHandwrittenNotes
} = require('../services/pdfEngine');

const { extractDocxText } = require('../services/ocr/docxExtractionService');
const { handwrittenPDF } = require('../services/pdfGenerator');
const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');

describe('Universal Book Understanding & Multilingual Notes Generation', () => {

  describe('1. Document Classification Across Multi-Domain Book Types', () => {
    test('Correctly classifies Marathi historical novel (Chhava) as novel_fiction / history', () => {
      const chhavaExcerpt = `
        छावा (कादंबरी)
        लेखक : शिवाजी सावंत
        प्रकरण १ — वादळवाट
        सह्याद्रीच्या उत्तुंग कड्यांवरून वारं घोंगावत सुटलं होतं. छत्रपती संभाजी महाराज रायगडाच्या तटावर उभे होते.
        त्यांच्या डोळ्यांत एक अनामिक धग होती. कवी कलश जवळ आले आणि म्हणाले, "राजे, मोगलांची फौज दक्षिणेकडे कूच करत आहे."
        संभाजीराजांनी तलवारीच्या मुठीवर हात ठेवला. येसूबाईंचे डोळे अश्रूंनी पाणावले होते, पण त्यांच्या चेहऱ्यावर स्वाभिमानाचे तेज होते.
        औरंगजेबाच्या कारवायांना रोखण्यासाठी हंबीरराव मोहिते यांनी सैन्याची नवी फळी उभारली.
        "आम्ही स्वराज्य झुकू देणार नाही," संभाजीराजांचे उद्गार आसमंतात दुमदुमले.
      `;

      const result = classifyDocument(chhavaExcerpt, { title: 'Chhava', filename: 'chhava_novel.pdf', subject: 'General' });
      expect(['novel_fiction', 'history_biography']).toContain(result.type);
      expect(result.type).not.toBe('computer_science');
      expect(result.confidence).toBeGreaterThan(0.65);
    });

    test('Correctly classifies Computer Science textbook', () => {
      const csExcerpt = `
        Database Management Systems and SQL Architecture.
        Chapter 3: Relational Query Optimization and B-Tree Indexing.
        In modern database engines, query execution planners compile declarative SQL queries into relational algebra trees.
        Index structures such as B+ trees provide O(log N) lookup time for primary key range queries.
        ACID transactions ensure Atomicity, Consistency, Isolation, and Durability across concurrent threads.
      `;
      const result = classifyDocument(csExcerpt, { title: 'DBMS Architecture', filename: 'database_textbook.pdf' });
      expect(result.type).toBe('computer_science');
    });

    test('Correctly classifies Academic Research Paper', () => {
      const paperExcerpt = `
        Deep Residual Learning for Image Recognition
        Abstract: We present a residual learning framework to ease the training of networks that are substantially deeper than those used previously.
        1. Introduction and Problem Formulation
        2. Related Work in Convolutional Architectures
        3. Experimental Methodology and Benchmark Datasets on ImageNet
        4. Results and Empirical Ablation Study
        References and Citations
      `;
      const result = classifyDocument(paperExcerpt, { title: 'Deep Residual Learning', filename: 'resnet_paper.pdf' });
      expect(result.type).toBe('research_paper');
    });

    test('Correctly classifies History and Biography', () => {
      const historyExcerpt = `
        The Reign of Emperor Ashoka and the Mauryan Empire.
        Chapter 4: The Kalinga War and the Edicts of Dhamma.
        In the 3rd century BCE, the Mauryan dynasty expanded across the Indian subcontinent.
        Following the devastating battle of Kalinga, Emperor Ashoka renounced warfare, embraced Buddhism,
        and inscribed rock edicts promoting non-violence, civic morality, and religious tolerance.
      `;
      const result = classifyDocument(historyExcerpt, { title: 'Mauryan History', filename: 'ashoka_biography.pdf' });
      expect(result.type).toBe('history_biography');
    });

    test('Correctly classifies Science & Mathematics', () => {
      const sciExcerpt = `
        Principles of Quantum Mechanics and Thermodynamics.
        Theorem 2.1: The Schrödinger wave equation governs non-relativistic wave functions.
        The Hamiltonian operator represents total energy of the physical system.
        Entropy increases asymptotically in isolated systems according to the Second Law of Thermodynamics.
      `;
      const result = classifyDocument(sciExcerpt, { title: 'Quantum Thermodynamics', filename: 'physics.pdf' });
      expect(result.type).toBe('science_mathematics');
    });
  });

  describe('2. Front-Matter, Running Noise & Page Header Filtering', () => {
    test('Strips bare page numbers, ISBNs, and running headers', () => {
      const noisyText = [
        'CHHAWA • General  Page 12',
        'Page 1',
        'ISBN-13: 978-81-7766-000-0',
        'ISBN for Printed Book: 9788177660000',
        '45',
        'छत्रपती संभाजी महाराजांनी रायगडावरून फौजेची पाहणी केली.',
        'Page 13 of 83',
        'त्यांनी हंबीररावांना तातडीने दक्षिणेस रवाना होण्याचे आदेश दिले.'
      ].join('\n');

      const cleaned = cleanRunningHeadersAndNoise(noisyText);
      expect(cleaned).not.toContain('CHHAWA • General  Page 12');
      expect(cleaned).not.toContain('Page 1\n');
      expect(cleaned).not.toContain('ISBN-13');
      expect(cleaned).not.toContain('Page 13 of 83');
      expect(cleaned).toContain('छत्रपती संभाजी महाराजांनी रायगडावरून फौजेची पाहणी केली.');
      expect(cleaned).toContain('त्यांनी हंबीररावांना तातडीने दक्षिणेस रवाना होण्याचे आदेश दिले.');
    });

    test('getTopics filters out bare page numbers and noise lines', () => {
      const text = [
        'Page 1',
        'Page 3',
        'ISBN for Printed Book',
        'Copyright 2026 Notivexa',
        'प्रकरण १ : वादळवाट',
        'प्रकरण २ : रायगडावरील खलबते',
        'Page 4 of 83'
      ].join('\n');

      const topics = getTopics(text);
      expect(topics).not.toContain('Page 1');
      expect(topics).not.toContain('Page 3');
      expect(topics).not.toContain('ISBN for Printed Book');
      expect(topics).toContain('प्रकरण १ : वादळवाट');
      expect(topics).toContain('प्रकरण २ : रायगडावरील खलबते');
    });
  });

  describe('3. Chapter and Structure Detection', () => {
    test('Detects Marathi & Indic chapter headings with numbers/words', () => {
      const book = `
        छावा
        लेखक : शिवाजी सावंत
        प्रकरण १ : वादळवाट
        रायगडावर रात्रीचे वादळ घोंघावत होते. संभाजीराजे विचारमग्न होते.
        प्रकरण २ : राज्याभिषेक
        शके १६०२ मध्ये छत्रपती संभाजी महाराजांचा राज्याभिषेक संपन्न झाला.
      `;

      const structure = detectBookStructure(book, 'novel_fiction');
      expect(structure.chapters.length).toBe(2);
      expect(structure.chapters[0].title).toContain('प्रकरण १');
      expect(structure.chapters[1].title).toContain('प्रकरण २');
      expect(structure.author).toBe('शिवाजी सावंत');
    });

    test('Infers balanced chapters when no explicit chapter headings exist', () => {
      const longEssay = Array(40).fill('हे एक मोठे ऐतिहासिक पुस्तक आहे ज्यात विविध घटनांची नोंद आहे. संभाजी महाराजांच्या जीवनाचा हा इतिहास आहे.').join('\n\n');
      const structure = detectBookStructure(longEssay, 'history_biography');
      expect(structure.chapters.length).toBeGreaterThan(0);
      expect(structure.chapters[0].isInferred).toBe(true);
    });
  });

  describe('4. Sentence Segmentation with Multilingual Indic Punctuation', () => {
    test('Splits sentences ending with Indic danda (।) and double danda (॥)', () => {
      const indicProse = 'संभाजी महाराज हे पराक्रमी राजे होते। त्यांनी मोगलांशी प्रदीर्घ लढा दिला। त्यांच्या सैन्यात अफाट शौर्य होते॥ येसूबाईंनी राज्यकारभारात मोलाची साथ दिली।';
      const sentences = getSentences(indicProse);
      expect(sentences.length).toBeGreaterThanOrEqual(3);
      expect(sentences[0]).toContain('संभाजी महाराज हे पराक्रमी राजे होते');
      expect(sentences[1]).toContain('त्यांनी मोगलांशी प्रदीर्घ लढा दिला');
    });
  });

  describe('5. Notes Generation Groundedness & Complete Removal of CS Boilerplate', () => {
    test('makeNovelHandwrittenNotes outputs narrative notes with NO CS boilerplate', () => {
      const novelText = `
        प्रकरण १ : वादळवाट
        रायगडावर वादळाचे सावट होते. छत्रपती संभाजी महाराज कड्यावर उभे राहून स्वराज्याची सीमा न्याहाळत होते.
        कवी कलश पुढे आले आणि म्हणाले, "राजे, शत्रू चालून येत आहे." संभाजीराजांनी शांतपणे स्मितहास्य केले.
        "कवीराज, जोपर्यंत हातात तलवार आणि मनात निष्ठा आहे, तोपर्यंत मोगल आम्हाला नमवू शकणार नाहीत."
        येसूबाईंनी महालातून हा संवाद ऐकला. त्यांच्या मनात काळजी होती, पण राजांच्या धैर्यावर अढळ विश्वास होता.
      `;

      const notes = makeNovelHandwrittenNotes(novelText, 'Chhava', 'Marathi Literature', 1, 1);
      
      // CRITICAL: Ensure NO generic CS textbook strings exist in novel output
      expect(notes).not.toContain('Fundamental theoretical architecture and practical operation');
      expect(notes).not.toContain('Real-world Application 1: Core enterprise deployment');
      expect(notes).not.toContain('University Exam Tip: Thoroughly memorize the formal definition');
      expect(notes).not.toContain('Distributed & Deterministic');
      expect(notes).not.toContain('Asymptotic Stability');

      // Ensure grounded narrative structure exists
      expect(notes).toContain('Chapter 1:');
      expect(notes).toContain('पात्र / व्यक्ती');
      expect(notes).toContain('संभाजी');
    });

    test('makeHandwrittenChapterNotes dispatches to novel structure when docType is novel_fiction', () => {
      const sample = 'रायगडावर संभाजी महाराज आणि कवी कलश यांची भेट झाली। दोघांनी मोगल आक्रमणाचा मुकाबला करण्याचा निश्चय केला।';
      const notes = makeHandwrittenChapterNotes(sample, 'Chhava', 'General', 1, 1, 'novel_fiction');
      expect(notes).not.toContain('Core enterprise deployment');
      expect(notes).toContain('Literary Narrative & Themes');
    });

    test('makeHandwrittenChapterNotes dispatches to history structure when docType is history_biography', () => {
      const sample = 'In 1681, Chhatrapati Sambhaji was crowned as the second ruler of the Maratha Kingdom. His administration reinforced forts and coastal naval stations.';
      const notes = makeHandwrittenChapterNotes(sample, 'Maratha Empire', 'History', 1, 1, 'history_biography');
      expect(notes).not.toContain('Core enterprise deployment');
      expect(notes).toContain('Historical Analysis & Chronology');
    });
  });

  describe('6. Microsoft Word (.docx) Document Text Extraction', () => {
    test('Extracts paragraphs, headings, and tables from valid OpenXML DOCX', async () => {
      // Create a genuine in-memory DOCX file with document.xml and [Content_Types].xml
      const zip = new JSZip();
      zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>');
      
      const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
          <w:body>
            <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Chapter 1: Introduction to Cloud Architecture</w:t></w:r></w:p>
            <w:p><w:r><w:t>Cloud computing delivers computing services over the internet with elastic scaling.</w:t></w:r></w:p>
            <w:tbl>
              <w:tr>
                <w:tc><w:p><w:r><w:t>Service Model</w:t></w:r></w:p></w:tc>
                <w:tc><w:p><w:r><w:t>Description</w:t></w:r></w:p></w:tc>
              </w:tr>
              <w:tr>
                <w:tc><w:p><w:r><w:t>IaaS</w:t></w:r></w:p></w:tc>
                <w:tc><w:p><w:r><w:t>Infrastructure as a Service</w:t></w:r></w:p></w:tc>
              </w:tr>
            </w:tbl>
          </w:body>
        </w:document>`;
      zip.file('word/document.xml', docXml);

      const buffer = await zip.generateAsync({ type: 'nodebuffer' });
      const tempPath = path.join(__dirname, 'test_temp_doc.docx');
      fs.writeFileSync(tempPath, buffer);

      try {
        const extracted = await extractDocxText(tempPath);
        expect(extracted.text).toContain('Chapter 1: Introduction to Cloud Architecture');
        expect(extracted.text).toContain('Cloud computing delivers computing services');
        expect(extracted.text).toContain('| Service Model | Description |');
        expect(extracted.text).toContain('| IaaS | Infrastructure as a Service |');
        expect(extracted.sections.length).toBeGreaterThan(0);
        expect(extracted.words).toBeGreaterThan(10);
      } finally {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      }
    });
  });

  describe('7. Extraction Quality Assessment', () => {
    test('Calculates high score for clean readable text', () => {
      const clean = 'This is an authentic academic textbook with clear sentences, full punctuation, and coherent paragraphs explaining thermodynamics.';
      const quality = calculateExtractionQuality(clean);
      expect(quality.score).toBeGreaterThanOrEqual(80);
      expect(quality.isLowQuality).toBe(false);
      expect(quality.warning).toBeNull();
    });

    test('Flags low quality score and warning for broken OCR noise', () => {
      const noisy = ' , - . , . , . , - - . . . , , , , , - - - . . . ';
      const quality = calculateExtractionQuality(noisy);
      expect(quality.score).toBeLessThan(40);
      expect(quality.isLowQuality).toBe(true);
      expect(quality.warning).toBeTruthy();
    });
  });

  describe('8. Unicode Font Safety in Handwritten PDF Generation', () => {
    test('Generates handwritten PDF with Marathi / Devanagari text without crashing', async () => {
      const marathiContent = `
# Chapter 1: छत्रपती संभाजी महाराज — छावा
## Topic: वादळवाट
DEFINITION: रायगडाच्या तटावरून सह्याद्रीचे विहंगम दृश्य दिसत होते.
SUMMARY: संभाजी महाराजांनी स्वराज्य रक्षणासाठी असीम शौर्य गाजवले.
### Subtopic: Key Events
EXPLANATION:
- कवी कलश यांच्याशी रणनीतीची चर्चा झाली.
- हंबीरराव मोहिते यांनी सैन्याची तयारी केली.
| पात्र | भूमिका | महत्त्व |
|---|---|---|
| संभाजीराजे | छत्रपती | स्वराज्याचे सार्वभौमत्व |
| येसूबाई | महाराणी | धीरोदात्त सहचारिणी |
EXAMPLE:
- स्वराज्य रक्षणासाठी दिलेले अतुलनीय योगदान.
      `;

      const result = await handwrittenPDF(marathiContent, {
        title: 'छावा — नोट्स',
        subject: 'मराठी साहित्य',
        fontName: 'kalam',
        style: 'yellow'
      });

      expect(result).toBeDefined();
      expect(result.fileName).toBeTruthy();
      expect(fs.existsSync(result.filePath)).toBe(true);
      expect(result.fileSize).toBeGreaterThan(1000);

      // Cleanup generated test PDF
      try { fs.unlinkSync(result.filePath); } catch {}
    });
  });

});
