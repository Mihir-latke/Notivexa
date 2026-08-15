/**
 * pdfGenerator.js — Notivexa v3
 * Generates: notes PDF, 4 handwritten styles, university question papers, slides
 */
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const OUT = path.join(__dirname, '../uploads/generated');
const mkOut = () => fs.mkdirSync(OUT, { recursive: true });

// ── HELPER: write text with automatic page breaks ─────────
function writePaged(doc, content, startY, opts = {}) {
  const { leftMargin = 65, rightMargin = 60, fontSize = 11.5, lineGap = 3, headingColor = '#4F46E5' } = opts;
  const W = doc.page.width;
  let y = startY;

  const newPage = () => {
    doc.addPage();
    y = 60;
    // footer on new page
    doc.fillColor('#9CA3AF').fontSize(8)
       .text('Notivexa AI Notes', 0, doc.page.height - 22, { align: 'center', width: W });
  };

  const lines = content.split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (y > doc.page.height - 80) newPage();

    if (!line.trim()) { y += 8; continue; }

    if (line.startsWith('# ')) {
      if (y > doc.page.height - 100) newPage();
      doc.fillColor(headingColor).font('Helvetica-Bold').fontSize(17)
         .text(line.slice(2), leftMargin, y, { width: W - leftMargin - rightMargin });
      y += 24; continue;
    }
    if (line.startsWith('## ')) {
      if (y > doc.page.height - 80) newPage();
      doc.fillColor(headingColor).font('Helvetica-Bold').fontSize(14)
         .text(line.slice(3), leftMargin, y, { width: W - leftMargin - rightMargin });
      y += 20; continue;
    }
    if (line.startsWith('### ')) {
      doc.fillColor('#047857').font('Helvetica-Bold').fontSize(12)
         .text(line.slice(4), leftMargin, y, { width: W - leftMargin - rightMargin });
      y += 18; continue;
    }
    if (line.startsWith('> ')) {
      doc.fillColor('#1D4ED8').font('Helvetica').fontSize(11.5)
         .rect(leftMargin - 4, y - 2, 3, 16).fill('#4F46E5');
      doc.fillColor('#1E3A8A').text(line.slice(2), leftMargin + 8, y, { width: W - leftMargin - rightMargin - 10 });
      y += 18; continue;
    }
    if (line.startsWith('• ') || line.startsWith('- ')) {
      doc.fillColor('#4F46E5').fontSize(13).text('•', leftMargin, y);
      doc.fillColor('#1F2937').font('Helvetica').fontSize(fontSize)
         .text(line.slice(2).trim(), leftMargin + 13, y, { width: W - leftMargin - rightMargin - 15 });
      const h = Math.max(18, doc.heightOfString(line.slice(2), { width: W - leftMargin - rightMargin - 15 }) + 4);
      y += h; continue;
    }
    if (line.startsWith('**') && line.endsWith('**')) {
      doc.fillColor('#92400E').font('Helvetica-Bold').fontSize(fontSize)
         .text(line.slice(2, -2), leftMargin, y, { width: W - leftMargin - rightMargin });
      y += 18; continue;
    }
    if (line.includes('**')) {
      // mixed bold
      doc.fillColor('#111827').font('Helvetica').fontSize(fontSize)
         .text(line.replace(/\*\*/g, ''), leftMargin, y, { width: W - leftMargin - rightMargin });
      y += 16; continue;
    }
    // normal
    const isHL = /formula|important|key|theorem|law|★/i.test(line);
    doc.fillColor(isHL ? '#7C2D12' : '#374151').font('Helvetica').fontSize(fontSize)
       .text(line, leftMargin, y, { width: W - leftMargin - rightMargin });
    const h2 = Math.max(16, doc.heightOfString(line, { width: W - leftMargin - rightMargin }) + 3);
    y += h2;
  }
  return y;
}

// ── 1. STANDARD NOTES PDF ─────────────────────────────────
async function notesPDF(content, { title = 'Notes', subject = 'General' } = {}) {
  mkOut();
  const fileName = `notes_${uuidv4()}.pdf`;
  const filePath = path.join(OUT, fileName);
  return new Promise((res, rej) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 80, bottom: 55, left: 65, right: 60 } });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);
    const W = doc.page.width;
    // Header
    doc.rect(0, 0, W, 75).fill('#4F46E5');
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(18).text(title, 65, 16, { width: W - 130 });
    doc.fillColor('rgba(255,255,255,0.75)').font('Helvetica').fontSize(11).text(`${subject}  ·  Notivexa AI  ·  ${new Date().toLocaleDateString('en-IN')}`, 65, 48);
    writePaged(doc, content, 90, { headingColor: '#4F46E5' });
    doc.end();
    stream.on('finish', () => res({ filePath, fileName, fileSize: fs.statSync(filePath).size }));
    stream.on('error', rej);
  });
}

// ── 2. HANDWRITTEN NOTES — 4 Styles ───────────────────────
const HW_STYLES = {
  yellow: { bg: '#FEFDE8', line: 'rgba(80,100,200,0.12)', margin: 'rgba(255,100,100,0.28)', ink: '#1a1a2e', heading: '#1D1B8A', label: '📒 Yellow Notebook' },
  white:  { bg: '#FFFFFF', line: 'rgba(100,100,200,0.10)', margin: 'rgba(220,80,80,0.25)',  ink: '#0D0D1A', heading: '#1E3A8A', label: '📄 White Paper' },
  cream:  { bg: '#FEF8EC', line: 'rgba(140,120,80,0.12)',  margin: 'rgba(180,60,60,0.22)',  ink: '#1a1200', heading: '#7C2D12', label: '📜 Cream Paper' },
  blue:   { bg: '#EFF6FF', line: 'rgba(59,130,246,0.12)',  margin: 'rgba(239,68,68,0.25)',  ink: '#0C1B3F', heading: '#1E40AF', label: '🔵 Blue Ruled' }
};

async function handwrittenPDF(content, { title = 'Notes', subject = 'General', style = 'yellow' } = {}) {
  mkOut();
  const st = HW_STYLES[style] || HW_STYLES.yellow;
  const fileName = `hw_${style}_${uuidv4()}.pdf`;
  const filePath = path.join(OUT, fileName);

  return new Promise((res, rej) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 55, bottom: 45, left: 80, right: 55 } });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);
    const W = doc.page.width, H = doc.page.height;

    const drawPageBg = () => {
      doc.rect(0, 0, W, H).fill(st.bg);
      doc.strokeColor(st.line).lineWidth(0.4);
      for (let y = 82; y < H - 35; y += 27) doc.moveTo(0, y).lineTo(W, y).stroke();
      doc.strokeColor(st.margin).lineWidth(1.2).moveTo(70, 0).lineTo(70, H).stroke();
    };

    let y = 55;
    const newPage = () => { doc.addPage(); drawPageBg(); y = 55; };
    const need = (h) => { if (y + h > H - 60) newPage(); };

    drawPageBg();
    // Title
    doc.fillColor(st.heading).font('Helvetica-Bold').fontSize(20).text(title, 80, 18, { width: W - 135 });
    doc.fillColor('#9CA3AF').font('Helvetica').fontSize(10).text(`${subject}  ·  ${new Date().toLocaleDateString('en-IN')}  ·  ${st.label}`, 80, 44);
    y = 65;

    const lines = content.split('\n');
    for (const rawLine of lines) {
      const line = rawLine.trimEnd();
      if (!line.trim()) { y += 14; continue; }

      if (line.startsWith('# ')) {
        need(34); doc.fillColor(st.heading).font('Helvetica-Bold').fontSize(18).text(line.slice(2), 80, y, { width: W - 135 }); y += 28; continue;
      }
      if (line.startsWith('## ')) {
        need(28); doc.fillColor(st.heading).font('Helvetica-Bold').fontSize(15).text(line.slice(3), 80, y, { width: W - 135 }); y += 22; continue;
      }
      if (line.startsWith('### ')) {
        need(22); doc.fillColor('#047857').font('Helvetica-Bold').fontSize(12.5).text(line.slice(4), 80, y, { width: W - 135 }); y += 19; continue;
      }
      if (line.startsWith('• ') || line.startsWith('- ') || line.startsWith('★')) {
        need(24);
        const bullet = line.startsWith('★') ? '★' : '•';
        doc.fillColor('#4F46E5').font('Helvetica-Bold').fontSize(14).text(bullet, 80, y);
        doc.fillColor(st.ink).font('Helvetica').fontSize(13).text(line.replace(/^[•\-★]\s*/, ''), 96, y, { width: W - 176 });
        y += Math.max(22, doc.heightOfString(line.replace(/^[•\-★]\s*/, ''), { width: W - 176 }) + 5); continue;
      }
      if (line.startsWith('**') && line.endsWith('**')) {
        need(22); doc.fillColor('#B45309').font('Helvetica-Bold').fontSize(13).text(line.slice(2, -2), 80, y, { width: W - 135 }); y += 19; continue;
      }
      if (line.startsWith('> ')) {
        need(22);
        doc.rect(80, y - 2, 3, 19).fill('#4F46E5');
        doc.fillColor('#1E3A8A').font('Helvetica').fontSize(13).text(line.slice(2), 90, y, { width: W - 165 }); y += 20; continue;
      }
      need(22);
      doc.fillColor(st.ink).font('Helvetica').fontSize(13).text(line, 80, y, { width: W - 135 });
      y += Math.max(20, doc.heightOfString(line, { width: W - 135 }) + 4);
    }
    doc.end();
    stream.on('finish', () => res({ filePath, fileName, fileSize: fs.statSync(filePath).size, style, label: st.label }));
    stream.on('error', rej);
  });
}

// Generate all 4 handwritten styles at once
async function allHandwrittenPDFs(content, { title, subject } = {}) {
  const results = [];
  for (const style of Object.keys(HW_STYLES)) {
    const r = await handwrittenPDF(content, { title, subject, style });
    results.push({ style, label: HW_STYLES[style].label, fileName: r.fileName, downloadUrl: `/uploads/generated/${r.fileName}`, fileSize: r.fileSize });
  }
  return results;
}

// ── 3. UNIVERSITY QUESTION PAPER PDF ─────────────────────
async function questionPaperPDF(content, { title = 'Exam', subject = 'General', totalMarks = 60, timeHours = 2, institution = 'University', examType = '60_MARKS' } = {}) {
  mkOut();
  const fileName = `paper_${uuidv4()}.pdf`;
  const filePath = path.join(OUT, fileName);
  return new Promise((res, rej) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 50, left: 60, right: 55 } });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);
    const W = doc.page.width;

    // Header box
    doc.rect(0, 0, W, 110).fill('#1E3A8A');
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(14).text(institution.toUpperCase(), 60, 12, { align: 'center', width: W - 120 });
    doc.fontSize(12).text('QUESTION PAPER', 60, 34, { align: 'center', width: W - 120 });
    doc.fontSize(11).font('Helvetica').text(`Subject: ${subject}`, 60, 58);
    doc.text(`Time: ${timeHours} Hour${timeHours > 1 ? 's' : ''}`, 60, 78);
    doc.text(`Maximum Marks: ${totalMarks}`, W - 200, 78);
    doc.text(new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' }), 60, 94);

    // Content
    doc.fillColor('#111827').font('Helvetica').fontSize(10.5)
       .text(content, 60, 125, { width: W - 115, lineGap: 2.5, paragraphGap: 6 });

    // Footer
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      doc.fillColor('#6B7280').fontSize(8)
         .text(`Page ${i + 1}  ·  ${subject}  ·  Notivexa AI  ·  ${institution}`, 60, doc.page.height - 28, { align: 'center', width: W - 120 });
    }
    doc.end();
    stream.on('finish', () => res({ filePath, fileName, fileSize: fs.statSync(filePath).size }));
    stream.on('error', rej);
  });
}

// ── 4. SLIDE DECK PDF ─────────────────────────────────────
async function slidePDF(data, { title = 'Presentation' } = {}) {
  mkOut();
  const slides = (typeof data === 'string' ? JSON.parse(data) : data)?.slides || [];
  if (slides.length === 0) throw new Error('No slides');
  const fileName = `slides_${uuidv4()}.pdf`;
  const filePath = path.join(OUT, fileName);
  const COLORS = ['#4F46E5', '#7C3AED', '#0891B2', '#059669', '#DC2626', '#D97706'];
  return new Promise((res, rej) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margins: { top: 40, bottom: 40, left: 50, right: 50 } });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);
    const W = doc.page.width, H = doc.page.height;
    slides.forEach((slide, idx) => {
      if (idx > 0) doc.addPage();
      const color = COLORS[idx % COLORS.length];
      doc.rect(0, 0, W, H).fill('#F8F7FF');
      doc.rect(0, 0, W, 70).fill(color);
      doc.fillColor('rgba(255,255,255,0.2)').fontSize(11).text(`${slide.slideNumber || idx + 1} / ${slides.length}`, W - 70, 12);
      doc.fillColor('#fff').font('Helvetica-Bold').fontSize(20).text(slide.title || '', 50, 18, { width: W - 120 });
      let y = 85;
      (slide.bullets || []).forEach(b => {
        if (y > H - 70) return;
        doc.fillColor(color).fontSize(12).text('▶', 50, y);
        doc.fillColor('#111827').font('Helvetica').fontSize(12).text(b.slice(0, 120), 68, y, { width: W - 120 });
        y += Math.max(28, doc.heightOfString(b, { width: W - 120 }) + 10);
      });
      if (slide.speakerNotes) {
        doc.rect(0, H - 52, W, 52).fill('#EDE9FE');
        doc.fillColor('#5B21B6').font('Helvetica').fontSize(9).text(`📝 ${slide.speakerNotes}`, 50, H - 44, { width: W - 100 });
      }
    });
    doc.end();
    stream.on('finish', () => res({ filePath, fileName, fileSize: fs.statSync(filePath).size }));
    stream.on('error', rej);
  });
}

module.exports = { notesPDF, handwrittenPDF, allHandwrittenPDFs, questionPaperPDF, slidePDF };
