const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle, Table, TableRow, TableCell, WidthType, VerticalAlign } = require('docx');
const PptxGenJS = require('pptxgenjs');

const OUT = path.join(__dirname, '..', 'uploads', 'generated');
function ensureDir() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
}

// ==========================================
// 1. PPT Themes & Generator
// ==========================================
const PPT_THEMES = {
  indigo: {
    id: 'indigo',
    name: 'Academic Indigo',
    bg: '0F172A',
    headerBg: '4F46E5',
    text: 'E2E8F0',
    titleText: 'FFFFFF',
    accent: '818CF8',
    cardBg: '1E293B',
    isDark: true
  },
  light: {
    id: 'light',
    name: 'Clean Light',
    bg: 'F8FAFC',
    headerBg: '2563EB',
    text: '334155',
    titleText: '0F172A',
    accent: '2563EB',
    cardBg: 'FFFFFF',
    isDark: false
  },
  emerald: {
    id: 'emerald',
    name: 'Emerald Forest',
    bg: '064E3B',
    headerBg: '059669',
    text: 'D1FAE5',
    titleText: 'FFFFFF',
    accent: '34D399',
    cardBg: '065F46',
    isDark: true
  },
  sunset: {
    id: 'sunset',
    name: 'Sunset Crimson',
    bg: '4C0519',
    headerBg: 'E11D48',
    text: 'FFE4E6',
    titleText: 'FFFFFF',
    accent: 'FB7185',
    cardBg: '881337',
    isDark: true
  },
  cyber: {
    id: 'cyber',
    name: 'Cyber Purple',
    bg: '180828',
    headerBg: '9333EA',
    text: 'F3E8FF',
    titleText: 'FFFFFF',
    accent: 'C084FC',
    cardBg: '2E1065',
    isDark: true
  }
};

async function generatePPTX(slidesInput, { title = 'Presentation', subject = 'Academic Lecture', theme = 'indigo' } = {}) {
  ensureDir();
  const themeObj = PPT_THEMES[theme] || PPT_THEMES.indigo;
  const slides = Array.isArray(slidesInput) ? slidesInput : (slidesInput?.slides || []);
  if (!slides || slides.length === 0) throw new Error('No slides to generate');

  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_16x9';

  // --- Title / Cover Slide ---
  const cover = pres.addSlide();
  cover.background = { color: themeObj.bg };

  // Top accent bar
  cover.addShape(pres.ShapeType.rect, {
    x: 0, y: 0, w: '100%', h: 0.15,
    fill: { color: themeObj.accent }
  });

  // Notivexa brand tag
  cover.addText('NOTIVEXA ACADEMIC INTELLIGENCE', {
    x: 1.0, y: 1.5, w: 8.0, h: 0.4,
    fontSize: 12, bold: true, color: themeObj.accent,
    letterSpacing: 2
  });

  // Main presentation title
  cover.addText(title, {
    x: 1.0, y: 2.1, w: 10.5, h: 1.8,
    fontSize: 36, bold: true, color: themeObj.titleText,
    fontFace: 'Segoe UI'
  });

  // Subject and subtitle
  cover.addText(`Topic: ${subject} • ${slides.length} Comprehensive Slides`, {
    x: 1.0, y: 4.2, w: 9.0, h: 0.6,
    fontSize: 16, color: themeObj.text,
    fontFace: 'Segoe UI'
  });

  // --- Content Slides ---
  slides.forEach((s, idx) => {
    const slide = pres.addSlide();
    slide.background = { color: themeObj.bg };

    // Slide header card
    slide.addShape(pres.ShapeType.rect, {
      x: 0.8, y: 0.5, w: 11.7, h: 1.0,
      fill: { color: themeObj.cardBg },
      line: { color: themeObj.headerBg, width: 1.5 },
      rectRadius: 0.1
    });

    // Slide category / tag
    slide.addText(`SLIDE ${s.slideNumber || idx + 1} OF ${slides.length}`, {
      x: 1.0, y: 0.6, w: 4.0, h: 0.25,
      fontSize: 9, bold: true, color: themeObj.accent,
      letterSpacing: 1
    });

    // Slide title
    slide.addText(s.title || `Slide ${idx + 1}`, {
      x: 1.0, y: 0.85, w: 11.0, h: 0.55,
      fontSize: 20, bold: true, color: themeObj.titleText,
      fontFace: 'Segoe UI'
    });

    // Bullet points card
    const bullets = Array.isArray(s.bullets) ? s.bullets : [];
    if (bullets.length > 0) {
      slide.addShape(pres.ShapeType.rect, {
        x: 0.8, y: 1.7, w: 11.7, h: 4.8,
        fill: { color: themeObj.cardBg },
        rectRadius: 0.1
      });

      const bulletItems = bullets.map(b => ({
        text: b.trim(),
        options: {
          bullet: { type: 'bullet', code: '2022' },
          color: themeObj.text,
          fontSize: 15,
          fontFace: 'Segoe UI',
          paraSpaceAfter: 12,
          lineSpacingMultiple: 1.2
        }
      }));

      slide.addText(bulletItems, {
        x: 1.2, y: 2.0, w: 10.9, h: 4.2
      });
    }

    // Speaker notes
    if (s.speakerNotes) {
      slide.addNotes(s.speakerNotes);
    }
  });

  const fileName = `ppt_${uuidv4()}.pptx`;
  const filePath = path.join(OUT, fileName);
  const buffer = await pres.write({ outputType: 'nodebuffer' });
  fs.writeFileSync(filePath, buffer);

  return { filePath, fileName, fileSize: buffer.length };
}

// ==========================================
// 2. Word (.docx) Generator
// ==========================================
function parseMarkdownToDocx(rawContent, title, subject) {
  const children = [];

  // Header Title
  children.push(
    new Paragraph({
      text: title || 'Notivexa Academic Notes',
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 }
    })
  );

  if (subject) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'Subject / Topic: ', bold: true, color: '4F46E5' }),
          new TextRun({ text: subject, italics: true, color: '334155' })
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 240 }
      })
    );
  }

  // Divider line
  children.push(
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: '4F46E5' } },
      spacing: { after: 240 }
    })
  );

  // Parse lines
  const lines = (rawContent || '').split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Heading 1 (# ...)
    if (line.startsWith('# ')) {
      children.push(
        new Paragraph({
          text: line.replace(/^#\s+/, ''),
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 240, after: 120 }
        })
      );
    }
    // Heading 2 (## ...)
    else if (line.startsWith('## ')) {
      children.push(
        new Paragraph({
          text: line.replace(/^##\s+/, ''),
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 100 }
        })
      );
    }
    // Heading 3 (### ...)
    else if (line.startsWith('### ')) {
      children.push(
        new Paragraph({
          text: line.replace(/^###\s+/, ''),
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 160, after: 80 }
        })
      );
    }
    // Bullet item (- or * )
    else if (/^[-*]\s+/.test(line)) {
      const bulletText = line.replace(/^[-*]\s+/, '');
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          children: parseInlineRuns(bulletText),
          spacing: { after: 80 }
        })
      );
    }
    // Numbered item (1. 2. )
    else if (/^\d+\.\s+/.test(line)) {
      const numText = line.replace(/^\d+\.\s+/, '');
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          children: parseInlineRuns(numText),
          spacing: { after: 80 }
        })
      );
    }
    // Standard Paragraph
    else {
      children.push(
        new Paragraph({
          children: parseInlineRuns(line),
          spacing: { after: 140 }
        })
      );
    }
  }

  return children;
}

// Helper to convert markdown bold **text** and italic *text* into TextRun elements
function parseInlineRuns(str) {
  const runs = [];
  const parts = str.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g);

  for (const p of parts) {
    if (!p) continue;
    if (p.startsWith('**') && p.endsWith('**')) {
      runs.push(new TextRun({ text: p.slice(2, -2), bold: true }));
    } else if (p.startsWith('*') && p.endsWith('*')) {
      runs.push(new TextRun({ text: p.slice(1, -1), italics: true }));
    } else if (p.startsWith('`') && p.endsWith('`')) {
      runs.push(new TextRun({ text: p.slice(1, -1), font: 'Consolas', color: '4F46E5' }));
    } else {
      runs.push(new TextRun({ text: p }));
    }
  }

  return runs;
}

function generateQuestionPaperDocx(paperData, { title = 'Question Paper', subject = 'General' } = {}) {
  const children = [];
  const borders = {
    top: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
    left: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
    right: { style: BorderStyle.SINGLE, size: 4, color: '000000' }
  };

  // 1. Centered Header Lines
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: paperData.institution || "Mahatma Education Society's", size: 20 })],
      spacing: { after: 40 }
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: paperData.college || "Pillai HOC College of Engineering and Technology, Rasayani.", bold: true, size: 23 })],
      spacing: { after: 40 }
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: paperData.status || "(Autonomous)", bold: true, size: 19 })],
      spacing: { after: 40 }
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: paperData.department || "Department of Computer Application", bold: true, size: 19 })],
      spacing: { after: 40 }
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: paperData.examType || "Internal Assessment- I OSAY 2026-2027", bold: true, size: 19 })],
      spacing: { after: 120 }
    })
  );

  // 2. Metadata Two Rows (Using clean borders-free table or aligned paragraphs)
  const metaRows = [
    new TableRow({
      children: [
        new TableCell({
          borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
          width: { size: 70, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [new TextRun({ text: `Subject: ${paperData.subject || subject}`, bold: true, size: 19 })] })]
        }),
        new TableCell({
          borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
          width: { size: 30, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `Class: ${paperData.class || 'SY-MCA'}`, bold: true, size: 19 })] })]
        })
      ]
    }),
    new TableRow({
      children: [
        new TableCell({
          borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
          width: { size: 70, type: WidthType.PERCENTAGE },
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: `Date: ${paperData.date || '22/8/2026'}        `, bold: true, size: 18 }),
                new TextRun({ text: `Time: ${paperData.time || '10.30am - 11.30am'}`, bold: true, size: 18 })
              ]
            })
          ]
        }),
        new TableCell({
          borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
          width: { size: 30, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `Duration: ${paperData.duration || '1Hr'}  Marks: ${paperData.marks || '20'}`, bold: true, size: 18 })] })]
        })
      ]
    })
  ];

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: metaRows
    })
  );

  children.push(new Paragraph({ spacing: { after: 100 } }));

  // 3. Exam Grid Table with exact 5 columns
  const examRows = [];

  // Top Note Row
  examRows.push(
    new TableRow({
      children: [
        new TableCell({
          columnSpan: 3,
          borders,
          children: [new Paragraph({ children: [new TextRun({ text: paperData.note || 'Note: Assume suitable data wherever necessary.', bold: true, size: 17 })] })]
        }),
        new TableCell({
          borders,
          children: [
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Course', bold: true, size: 16 })] }),
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Outcome', bold: true, size: 16 })] })
          ]
        }),
        new TableCell({
          borders,
          children: [
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Bloom's", bold: true, size: 16 })] }),
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Level', bold: true, size: 16 })] })
          ]
        })
      ]
    })
  );

  // Sections & Questions
  const sections = Array.isArray(paperData.sections) ? paperData.sections : [];
  sections.forEach(sec => {
    // Section Header row: [ 1 ] | Attempt Any Five out of Six | CO | BL
    examRows.push(
      new TableRow({
        children: [
          new TableCell({
            borders,
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `[ ${sec.qNum} ]`, bold: true, size: 18 })] })]
          }),
          new TableCell({
            columnSpan: 2,
            borders,
            children: [new Paragraph({ children: [new TextRun({ text: sec.instruction || 'Attempt Any Five out of Six', bold: true, size: 18 })] })]
          }),
          new TableCell({
            borders,
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'CO', bold: true, size: 17 })] })]
          }),
          new TableCell({
            borders,
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'BL', bold: true, size: 17 })] })]
          })
        ]
      })
    );

    // Question sub-rows: A. | Question text | [ 02 ] | CO3 | L2
    const questions = Array.isArray(sec.questions) ? sec.questions : [];
    questions.forEach(q => {
      examRows.push(
        new TableRow({
          children: [
            new TableCell({
              borders,
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: q.id || '', bold: true, size: 18 })] })]
            }),
            new TableCell({
              borders,
              children: [new Paragraph({ children: [new TextRun({ text: q.text || '', size: 18 })] })]
            }),
            new TableCell({
              borders,
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: q.marks || '', bold: true, size: 18 })] })]
            }),
            new TableCell({
              borders,
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: q.co || '', size: 17 })] })]
            }),
            new TableCell({
              borders,
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: q.bl || '', size: 17 })] })]
            })
          ]
        })
      );
    });
  });

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: examRows
    })
  );

  return children;
}

async function generateDocx(rawContent, { title = 'Academic Notes', subject = 'General' } = {}) {
  ensureDir();

  let isPaper = false;
  let paperData = null;

  if (typeof rawContent === 'object' && rawContent !== null && rawContent.sections) {
    isPaper = true;
    paperData = rawContent;
  } else if (typeof rawContent === 'string' && (rawContent.includes('"sections"') || rawContent.includes('"institution"'))) {
    try {
      paperData = JSON.parse(rawContent.replace(/```json\n?|\n?```/g, '').trim());
      if (paperData && Array.isArray(paperData.sections)) isPaper = true;
    } catch(e) {}
  }

  const children = isPaper
    ? generateQuestionPaperDocx(paperData, { title, subject })
    : parseMarkdownToDocx(rawContent, title, subject);

  const doc = new Document({
    creator: 'Notivexa Academic Intelligence',
    title: title,
    description: `Academic materials for ${subject}`,
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, bottom: 720, left: 720, right: 720 } // 0.5 inch margin in twips
          }
        },
        children
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  const fileName = `doc_${uuidv4()}.docx`;
  const filePath = path.join(OUT, fileName);
  fs.writeFileSync(filePath, buffer);

  return { filePath, fileName, fileSize: buffer.length };
}

module.exports = {
  PPT_THEMES,
  generatePPTX,
  generateDocx
};

