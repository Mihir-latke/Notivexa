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
// 1. PPT Themes & Generator (Gamma AI Aesthetic)
// ==========================================
const PPT_THEMES = {
  obsidian: {
    id: 'obsidian',
    name: '🌌 Gamma Obsidian (Dark)',
    bg: '090D16',
    cardBg: '121A2D',
    cardBorder: '1E293B',
    accent: '6366F1',
    categoryColor: '818CF8',
    titleColor: 'FFFFFF',
    cardTitle: 'F8FAFC',
    textColor: '94A3B8',
    takeawayBg: '1E1B4B',
    takeawayBorder: '6366F1',
    takeawayLabel: 'A5B4FC',
    takeawayText: 'E0E7FF',
    analogyBg: '0C2A45',
    analogyBorder: '0284C7',
    analogyLabel: '38BDF8',
    analogyText: 'BAE6FD',
    badgeBg: '1E293B',
    numColor: '64748B',
    isDark: true
  },
  light: {
    id: 'light',
    name: '📄 Gamma Clean (Light)',
    bg: 'F8FAFC',
    cardBg: 'FFFFFF',
    cardBorder: 'CBD5E1',
    accent: '4F46E5',
    categoryColor: 'E11D48',
    titleColor: '0F172A',
    cardTitle: '0F172A',
    textColor: '475569',
    takeawayBg: 'FEF3C7',
    takeawayBorder: 'F59E0B',
    takeawayLabel: 'B45309',
    takeawayText: '78350F',
    analogyBg: 'E0F2FE',
    analogyBorder: '38BDF8',
    analogyLabel: '0369A1',
    analogyText: '0C4A6E',
    badgeBg: 'F1F5F9',
    numColor: '888888',
    isDark: false
  },
  cyber: {
    id: 'cyber',
    name: '⚡ Gamma Cyber (Purple)',
    bg: '0F0728',
    cardBg: '1A0C36',
    cardBorder: '3B1D6D',
    accent: 'A855F7',
    categoryColor: 'C084FC',
    titleColor: 'FFFFFF',
    cardTitle: 'FAF5FF',
    textColor: 'D8B4FE',
    takeawayBg: '2E1065',
    takeawayBorder: 'A855F7',
    takeawayLabel: 'E9D5FF',
    takeawayText: 'FAF5FF',
    analogyBg: '280D40',
    analogyBorder: 'EC4899',
    analogyLabel: 'F472B6',
    analogyText: 'FDF2F8',
    badgeBg: '2E1065',
    numColor: '9333EA',
    isDark: true
  },
  emerald: {
    id: 'emerald',
    name: '🌿 Gamma Emerald (Mint)',
    bg: '051B14',
    cardBg: '0B2D22',
    cardBorder: '14532D',
    accent: '10B981',
    categoryColor: '34D399',
    titleColor: 'FFFFFF',
    cardTitle: 'ECFDF5',
    textColor: 'A7F3D0',
    takeawayBg: '064E3B',
    takeawayBorder: 'F59E0B',
    takeawayLabel: 'FBBF24',
    takeawayText: 'FEF3C7',
    analogyBg: '04382B',
    analogyBorder: '38BDF8',
    analogyLabel: '38BDF8',
    analogyText: 'E0F2FE',
    badgeBg: '064E3B',
    numColor: '059669',
    isDark: true
  },
  sunset: {
    id: 'sunset',
    name: '🌅 Gamma Sunset (Rose)',
    bg: '1A091E',
    cardBg: '281030',
    cardBorder: '4C1D4F',
    accent: 'F43F5E',
    categoryColor: 'FB7185',
    titleColor: 'FFFFFF',
    cardTitle: 'FFF1F2',
    textColor: 'FECDD3',
    takeawayBg: '4C0519',
    takeawayBorder: 'F59E0B',
    takeawayLabel: 'FBBF24',
    takeawayText: 'FEF3C7',
    analogyBg: '3B0D2E',
    analogyBorder: 'FB923C',
    analogyLabel: 'FDBA74',
    analogyText: 'FFF7ED',
    badgeBg: '4C0519',
    numColor: 'BE123C',
    isDark: true
  }
};
PPT_THEMES.indigo = PPT_THEMES.obsidian;

function parseBulletToCard(bulletStr, idx) {
  const str = String(bulletStr || '').trim();
  const colonIdx = str.indexOf(': ');
  if (colonIdx > 0 && colonIdx < 45) {
    return {
      num: String(idx + 1).padStart(2, '0'),
      title: str.substring(0, colonIdx).trim(),
      desc: str.substring(colonIdx + 2).trim()
    };
  }
  const dashIdx = str.indexOf(' — ');
  if (dashIdx > 0 && dashIdx < 45) {
    return {
      num: String(idx + 1).padStart(2, '0'),
      title: str.substring(0, dashIdx).trim(),
      desc: str.substring(dashIdx + 3).trim()
    };
  }
  const words = str.split(' ');
  if (words.length > 5) {
    return {
      num: String(idx + 1).padStart(2, '0'),
      title: words.slice(0, 3).join(' '),
      desc: str
    };
  }
  return {
    num: String(idx + 1).padStart(2, '0'),
    title: `Key Aspect ${idx + 1}`,
    desc: str
  };
}

async function generatePPTX(slidesInput, { title = 'Presentation', subject = 'Academic Lecture', theme = 'obsidian' } = {}) {
  ensureDir();
  const themeObj = PPT_THEMES[theme] || PPT_THEMES.obsidian || PPT_THEMES.light;
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

    // --- SLIDE 1: Hero Gamma Title & Cover Slide ---
    if (idx === 0 && (category === 'INTRODUCTION' || !cleanAnalogy)) {
      slide.addShape(pres.ShapeType.rect, {
        x: 0, y: 0, w: '100%', h: 0.14,
        fill: { color: themeObj.accent }
      });

      slide.addShape(pres.ShapeType.roundRect, {
        x: 0.7, y: 0.55, w: 2.8, h: 0.32,
        fill: { color: themeObj.badgeBg || themeObj.cardBg },
        line: { color: themeObj.accent, width: 1.0 },
        rectRadius: 0.05
      });
      slide.addText('⚡ NOTIVEXA • PRESENTATION', {
        x: 0.7, y: 0.55, w: 2.8, h: 0.32,
        fontSize: 9, bold: true, color: themeObj.accent, align: 'center', fontFace: 'Segoe UI'
      });

      slide.addText(slideTitle, {
        x: 0.7, y: 1.00, w: 8.6, h: 1.15,
        fontSize: 32, bold: true, color: themeObj.titleColor, fontFace: 'Segoe UI'
      });

      slide.addText(`Topic: ${subject || title} • Comprehensive Academic Syllabus`, {
        x: 0.7, y: 2.15, w: 8.6, h: 0.35,
        fontSize: 13, color: themeObj.textColor, fontFace: 'Segoe UI'
      });

      if (cleanTakeaway) {
        slide.addShape(pres.ShapeType.roundRect, {
          x: 0.7, y: 2.65, w: 8.6, h: 0.95,
          fill: { color: themeObj.takeawayBg },
          line: { color: themeObj.takeawayBorder, width: 1.2 },
          rectRadius: 0.08
        });

        slide.addText([
          { text: '⚡ KEY TAKEAWAY\n', options: { bold: true, color: themeObj.takeawayLabel, fontSize: 11, fontFace: 'Segoe UI' } },
          { text: cleanTakeaway, options: { bold: false, color: themeObj.takeawayText, fontSize: 12, fontFace: 'Segoe UI' } }
        ], {
          x: 0.9, y: 2.70, w: 8.2, h: 0.85, valign: 'middle'
        });
      }

      const chips = [
        `📚 ${rawSlides.length} Comprehensive Slides`,
        `🎯 ${subject || 'Academic Syllabus'}`,
        '✨ Gamma AI Structured'
      ];
      chips.forEach((ch, cIdx) => {
        const cX = 0.7 + cIdx * 2.95;
        slide.addShape(pres.ShapeType.roundRect, {
          x: cX, y: 4.15, w: 2.75, h: 0.45,
          fill: { color: themeObj.cardBg },
          line: { color: themeObj.cardBorder, width: 1.0 },
          rectRadius: 0.06
        });
        slide.addText(ch, {
          x: cX, y: 4.15, w: 2.75, h: 0.45,
          fontSize: 10, bold: true, color: themeObj.cardTitle, align: 'center', fontFace: 'Segoe UI'
        });
      });

      slide.addText(`01 / ${String(rawSlides.length).padStart(2, '0')}`, {
        x: 8.4, y: 5.15, w: 1.0, h: 0.3,
        fontSize: 10, color: themeObj.numColor, align: 'right', fontFace: 'Segoe UI'
      });

      if (s.speakerNotes) slide.addNotes(s.speakerNotes);
      return;
    }

    // --- CONTENT SLIDES: Gamma Multi-Card Layout ---
    // 1. Category Badge & Counter
    slide.addShape(pres.ShapeType.roundRect, {
      x: 0.6, y: 0.35, w: 2.0, h: 0.28,
      fill: { color: themeObj.badgeBg || themeObj.cardBg },
      line: { color: themeObj.accent, width: 0.8 },
      rectRadius: 0.05
    });
    slide.addText(`✨ ${category}`, {
      x: 0.6, y: 0.35, w: 2.0, h: 0.28,
      fontSize: 8.5, bold: true, color: themeObj.accent, align: 'center', fontFace: 'Segoe UI'
    });

    slide.addText(`${String(s.slideNumber || idx + 1).padStart(2, '0')} / ${String(rawSlides.length).padStart(2, '0')}`, {
      x: 8.2, y: 0.35, w: 1.2, h: 0.28,
      fontSize: 10, bold: true, color: themeObj.numColor, align: 'right', fontFace: 'Segoe UI'
    });

    // 2. Slide Title
    slide.addText(slideTitle, {
      x: 0.6, y: 0.68, w: 8.8, h: 0.62,
      fontSize: 22, bold: true, color: themeObj.titleColor, fontFace: 'Segoe UI'
    });

    // 3. KEY TAKEAWAY Banner Card
    let contentY = 1.35;
    if (cleanTakeaway) {
      slide.addShape(pres.ShapeType.roundRect, {
        x: 0.6, y: 1.35, w: 8.8, h: 0.44,
        fill: { color: themeObj.takeawayBg },
        line: { color: themeObj.takeawayBorder, width: 1.0 },
        rectRadius: 0.06
      });

      slide.addText([
        { text: '⚡ KEY TAKEAWAY:  ', options: { bold: true, color: themeObj.takeawayLabel, fontSize: 10.5, fontFace: 'Segoe UI' } },
        { text: cleanTakeaway, options: { bold: false, color: themeObj.takeawayText, fontSize: 10.5, fontFace: 'Segoe UI' } }
      ], {
        x: 0.75, y: 1.37, w: 8.5, h: 0.40, valign: 'middle'
      });
      contentY = 1.95;
    }

    // 4. Gamma Multi-Card Grid (Side-by-side Cards!)
    const cardItems = bullets.map((b, bIdx) => parseBulletToCard(b, bIdx));
    const N = Math.min(cardItems.length, 4) || 1;
    const hasAnalogy = Boolean(cleanAnalogy);
    const cardH = hasAnalogy ? 2.45 : 3.05;

    let cardW = 8.8;
    let cardGap = 0;
    if (N === 2) { cardW = 4.25; cardGap = 0.30; }
    else if (N === 3) { cardW = 2.76; cardGap = 0.26; }
    else if (N === 4) { cardW = 2.05; cardGap = 0.20; }

    cardItems.slice(0, N).forEach((c, cIdx) => {
      const cardX = 0.6 + cIdx * (cardW + cardGap);

      // Card container
      slide.addShape(pres.ShapeType.roundRect, {
        x: cardX, y: contentY, w: cardW, h: cardH,
        fill: { color: themeObj.cardBg },
        line: { color: themeObj.cardBorder, width: 1.0 },
        rectRadius: 0.08
      });

      // Top colored accent strip
      slide.addShape(pres.ShapeType.roundRect, {
        x: cardX, y: contentY, w: cardW, h: 0.06,
        fill: { color: themeObj.accent },
        rectRadius: 0.02
      });

      // Step number pill badge
      slide.addShape(pres.ShapeType.roundRect, {
        x: cardX + 0.16, y: contentY + 0.16, w: 0.42, h: 0.26,
        fill: { color: themeObj.badgeBg || themeObj.bg },
        line: { color: themeObj.accent, width: 0.8 },
        rectRadius: 0.04
      });
      slide.addText(c.num, {
        x: cardX + 0.16, y: contentY + 0.16, w: 0.42, h: 0.26,
        fontSize: 8.5, bold: true, color: themeObj.accent, align: 'center', fontFace: 'Segoe UI'
      });

      // Card Title
      slide.addText(c.title, {
        x: cardX + 0.16, y: contentY + 0.50, w: cardW - 0.32, h: 0.38,
        fontSize: N === 4 ? 12 : 13.5, bold: true, color: themeObj.cardTitle, fontFace: 'Segoe UI'
      });

      // Card Body
      slide.addText(c.desc, {
        x: cardX + 0.16, y: contentY + 0.90, w: cardW - 0.32, h: cardH - 1.00,
        fontSize: N === 4 ? 10 : 11.5, color: themeObj.textColor, fontFace: 'Segoe UI', lineSpacingMultiple: 1.2
      });
    });

    // 5. REAL-WORLD ANALOGY Bottom Banner Card
    if (hasAnalogy) {
      slide.addShape(pres.ShapeType.roundRect, {
        x: 0.6, y: 4.55, w: 8.8, h: 0.48,
        fill: { color: themeObj.analogyBg },
        line: { color: themeObj.analogyBorder, width: 1.0 },
        rectRadius: 0.06
      });

      slide.addText([
        { text: '💡 REAL-WORLD ANALOGY:  ', options: { bold: true, color: themeObj.analogyLabel, fontSize: 10, fontFace: 'Segoe UI' } },
        { text: cleanAnalogy, options: { bold: false, color: themeObj.analogyText, fontSize: 10, fontFace: 'Segoe UI' } }
      ], {
        x: 0.75, y: 4.57, w: 8.5, h: 0.44, valign: 'middle'
      });
    }

    if (s.speakerNotes) slide.addNotes(s.speakerNotes);
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

