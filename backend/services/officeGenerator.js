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
  light: {
    id: 'light',
    name: 'Clean Academic (Standard)',
    bg: 'FFFFFF',
    categoryColor: 'E11D48',
    titleColor: '0F172A',
    takeawayBg: 'FEF3C7',
    takeawayBorder: 'F59E0B',
    takeawayLabel: 'B45309',
    takeawayText: '78350F',
    bulletLabelColor: '0F172A',
    textColor: '334155',
    analogyBg: 'E0F2FE',
    analogyBorder: '38BDF8',
    analogyLabel: '0369A1',
    analogyText: '0C4A6E',
    numColor: '888888',
    isDark: false
  },
  indigo: {
    id: 'indigo',
    name: 'Academic Indigo',
    bg: '0F172A',
    categoryColor: '818CF8',
    titleColor: 'FFFFFF',
    takeawayBg: '1E293B',
    takeawayBorder: 'F59E0B',
    takeawayLabel: 'FBBF24',
    takeawayText: 'FDE68A',
    bulletLabelColor: 'FFFFFF',
    textColor: 'E2E8F0',
    analogyBg: '0F243A',
    analogyBorder: '38BDF8',
    analogyLabel: '38BDF8',
    analogyText: 'BAE6FD',
    numColor: '64748B',
    isDark: true
  },
  emerald: {
    id: 'emerald',
    name: 'Emerald Forest',
    bg: '064E3B',
    categoryColor: '34D399',
    titleColor: 'FFFFFF',
    takeawayBg: '065F46',
    takeawayBorder: 'F59E0B',
    takeawayLabel: 'FBBF24',
    takeawayText: 'FEF3C7',
    bulletLabelColor: 'FFFFFF',
    textColor: 'D1FAE5',
    analogyBg: '04382B',
    analogyBorder: '38BDF8',
    analogyLabel: '67E8F9',
    analogyText: 'E0F2FE',
    numColor: '059669',
    isDark: true
  },
  sunset: {
    id: 'sunset',
    name: 'Sunset Crimson',
    bg: '4C0519',
    categoryColor: 'FB7185',
    titleColor: 'FFFFFF',
    takeawayBg: '881337',
    takeawayBorder: 'F59E0B',
    takeawayLabel: 'FBBF24',
    takeawayText: 'FEF3C7',
    bulletLabelColor: 'FFFFFF',
    textColor: 'FFE4E6',
    analogyBg: '701A75',
    analogyBorder: '38BDF8',
    analogyLabel: '38BDF8',
    analogyText: 'E0F2FE',
    numColor: '9F1239',
    isDark: true
  },
  cyber: {
    id: 'cyber',
    name: 'Cyber Purple',
    bg: '180828',
    categoryColor: 'C084FC',
    titleColor: 'FFFFFF',
    takeawayBg: '2E1065',
    takeawayBorder: 'F59E0B',
    takeawayLabel: 'FBBF24',
    takeawayText: 'FEF3C7',
    bulletLabelColor: 'FFFFFF',
    textColor: 'F3E8FF',
    analogyBg: '1E1B4B',
    analogyBorder: '38BDF8',
    analogyLabel: '38BDF8',
    analogyText: 'E0F2FE',
    numColor: '7E22CE',
    isDark: true
  }
};

async function generatePPTX(slidesInput, { title = 'Presentation', subject = 'Academic Lecture', theme = 'light' } = {}) {
  ensureDir();
  const themeObj = PPT_THEMES[theme] || PPT_THEMES.light || PPT_THEMES.indigo;
  const rawSlides = Array.isArray(slidesInput) ? slidesInput : (slidesInput?.slides || []);
  if (!rawSlides || rawSlides.length === 0) throw new Error('No slides to generate');

  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_16x9';

  rawSlides.forEach((s, idx) => {
    const slide = pres.addSlide();
    slide.background = { color: themeObj.bg };

    const category = (s.category || (idx === 0 ? 'INTRODUCTION' : idx === rawSlides.length - 1 ? 'QUICK SUMMARY' : 'CORE PRINCIPLE')).toUpperCase();
    const slideTitle = s.title || `Slide ${idx + 1}`;
    const rawTakeaway = s.keyTakeaway || s.takeaway || '';
    const cleanTakeaway = rawTakeaway.replace(/^KEY TAKEAWAY:\s*/i, '').trim();
    const rawAnalogy = s.analogy || s.realWorldAnalogy || '';
    const cleanAnalogy = rawAnalogy.replace(/^(REAL-WORLD ANALOGY|KEY INSIGHT):\s*/i, '').trim();
    const bullets = Array.isArray(s.bullets) ? s.bullets : [];

    // 1. Category Badge (Top)
    slide.addText(category, {
      x: 0.6, y: 0.35, w: 8.8, h: 0.28,
      fontSize: 10, bold: true, color: themeObj.categoryColor,
      fontFace: 'Segoe UI'
    });

    // 2. Slide Title
    slide.addText(slideTitle, {
      x: 0.6, y: 0.62, w: 8.8, h: 0.85,
      fontSize: 26, bold: true, color: themeObj.titleColor,
      fontFace: 'Segoe UI'
    });

    // 3. KEY TAKEAWAY Banner Card
    const hasTakeaway = Boolean(cleanTakeaway);
    if (hasTakeaway) {
      slide.addShape(pres.ShapeType.roundRect, {
        x: 0.6, y: 1.55, w: 8.8, h: 0.48,
        fill: { color: themeObj.takeawayBg },
        line: { color: themeObj.takeawayBorder, width: 1.0 },
        rectRadius: 0.05
      });

      slide.addText([
        { text: 'KEY TAKEAWAY:  ', options: { bold: true, color: themeObj.takeawayLabel, fontSize: 11, fontFace: 'Segoe UI' } },
        { text: cleanTakeaway, options: { bold: false, color: themeObj.takeawayText, fontSize: 11, fontFace: 'Segoe UI' } }
      ], {
        x: 0.75, y: 1.57, w: 8.5, h: 0.44,
        valign: 'middle'
      });
    }

    // 4. Content Bullets Area
    const hasAnalogy = Boolean(cleanAnalogy);
    const bulletY = hasTakeaway ? 2.15 : 1.60;
    const bulletH = hasAnalogy ? 2.30 : (hasTakeaway ? 2.95 : 3.45);

    if (bullets.length > 0) {
      const textRuns = [];
      bullets.forEach((b, bIdx) => {
        const str = String(b).trim();
        const colonIdx = str.indexOf(': ');
        const isLast = bIdx === bullets.length - 1;

        if (colonIdx > 0 && colonIdx < 45) {
          const label = str.substring(0, colonIdx + 2);
          const desc = str.substring(colonIdx + 2);
          textRuns.push(
            { text: label, options: { bold: true, color: themeObj.bulletLabelColor, fontSize: 15, fontFace: 'Segoe UI', bullet: { type: 'bullet', code: '2022' } } },
            { text: desc + (isLast ? '' : '\n'), options: { bold: false, color: themeObj.textColor, fontSize: 15, fontFace: 'Segoe UI', paraSpaceAfter: 12, lineSpacingMultiple: 1.2 } }
          );
        } else {
          textRuns.push({
            text: str + (isLast ? '' : '\n'),
            options: {
              bullet: { type: 'bullet', code: '2022' },
              color: themeObj.textColor,
              fontSize: 15,
              fontFace: 'Segoe UI',
              paraSpaceAfter: 12,
              lineSpacingMultiple: 1.2
            }
          });
        }
      });

      slide.addText(textRuns, {
        x: 0.6, y: bulletY, w: 8.8, h: bulletH
      });
    }

    // 5. REAL-WORLD ANALOGY Banner Card
    if (hasAnalogy) {
      slide.addShape(pres.ShapeType.roundRect, {
        x: 0.6, y: 4.65, w: 8.8, h: 0.48,
        fill: { color: themeObj.analogyBg },
        line: { color: themeObj.analogyBorder, width: 1.0 },
        rectRadius: 0.05
      });

      slide.addText([
        { text: 'REAL-WORLD ANALOGY:  ', options: { bold: true, color: themeObj.analogyLabel, fontSize: 10, fontFace: 'Segoe UI' } },
        { text: cleanAnalogy, options: { bold: false, color: themeObj.analogyText, fontSize: 10, fontFace: 'Segoe UI' } }
      ], {
        x: 0.75, y: 4.67, w: 8.5, h: 0.44,
        valign: 'middle'
      });
    }

    // 6. Slide Number
    slide.addText(String(s.slideNumber || idx + 1), {
      x: 9.3, y: 5.25, w: 0.5, h: 0.3,
      fontSize: 10, color: themeObj.numColor, align: 'right', fontFace: 'Segoe UI'
    });

    // 7. Speaker Notes
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

