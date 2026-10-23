const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const OUT = path.join(__dirname, '../uploads/generated');
const ensureDir = () => fs.mkdirSync(OUT, { recursive: true });

function resolveLocalPath(p) {
  if (!p || typeof p !== 'string') return null;
  if (fs.existsSync(p)) return p;
  const norm = p.replace(/\\/g, '/');
  const idx = norm.indexOf('uploads/');
  if (idx !== -1) {
    const rel = norm.slice(idx);
    const candidates = [
      path.join(__dirname, '..', rel),
      path.join(process.cwd(), rel),
      path.join(process.cwd(), 'backend', rel),
      path.join(__dirname, '../../', rel)
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
  }
  return null;
}

// ── Standard Notes PDF ── (Full-content, chapter-wise, supports 80-800 pages)
async function notesPDF(content, { title='Notes', subject='General', imagePaths=[] }={}) {
  ensureDir();
  const fileName = `notes_${uuidv4()}.pdf`;
  const filePath = path.join(OUT, fileName);

  return new Promise((res, rej) => {
    const doc = new PDFDocument({ size:'A4', margins:{top:72,bottom:56,left:70,right:55}, bufferPages: true });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);
    const W = doc.page.width;
    const H = doc.page.height;
    const L = 70, R = W - 55, CW = R - L;

    let pageNum = 0;

    const drawHeader = (pn) => {
      if (pn === 1) {
        doc.rect(0, 0, W, 72).fill('#4F46E5');
        doc.fillColor('#fff').font('Helvetica-Bold').fontSize(17).text(title, L, 16, { width: CW });
        doc.font('Helvetica').fontSize(10.5).text(`${subject}  |  Notivexa AI Study Notes`, L, 48, { width: CW });
      } else {
        doc.rect(0, 0, W, 44).fill('#4F46E5');
        doc.fillColor('#fff').font('Helvetica-Bold').fontSize(11).text(title, L, 10, { width: CW - 80 });
        doc.font('Helvetica').fontSize(10).text(`Page ${pn}`, 0, 14, { width: W - 20, align: 'right' });
      }
    };

    // Draw first page header
    pageNum = 1;
    drawHeader(1);

    // ── Content renderer ──────────────────────────────────────────────
    // Parse the full markdown content and render with proper formatting.
    const cleanContent = (content || '')
      .replace(/!\[.*?\]\(.*?\)/g, '')
      .replace(/^\*Figure \d+:.*?\*\s*$/gm, '')
      .replace(/\n{4,}/g, '\n\n\n')
      .trim();

    const lines = cleanContent.split('\n');
    let y = 90;
    const bodyFont = 'Helvetica';
    const boldFont = 'Helvetica-Bold';

    const ensureSpace = (needed) => {
      const bottom = H - 56;
      if (y + needed > bottom) {
        doc.addPage();
        pageNum++;
        drawHeader(pageNum);
        y = pageNum === 1 ? 90 : 58;
      }
    };

    const writePara = (text, opts = {}) => {
      if (!text || !text.trim()) return;
      const fName = opts.bold ? boldFont : bodyFont;
      const fSize = opts.fontSize || 11;
      doc.font(fName).fontSize(fSize);
      const th = doc.heightOfString(text.trim(), { width: CW, lineGap: opts.lineGap || 2 });
      ensureSpace(th + (opts.gap || 4));
      doc.fillColor(opts.color || '#0F0E1A')
         .text(text.trim(), L + (opts.indent || 0), y, { width: CW - (opts.indent || 0), lineGap: opts.lineGap || 2 });
      y += th + (opts.gap || 4);
    };

    for (const rawLine of lines) {
      const line = rawLine.replace(/\*\*/g, '').trim();
      if (!line) { y += 5; continue; }

      if (line.startsWith('# ')) {
        const t = line.slice(2).trim();
        ensureSpace(42);
        doc.rect(L, y, CW, 32).fill('#EEF2FF');
        doc.fillColor('#1E1B4B').font(boldFont).fontSize(16).text(t, L + 10, y + 8, { width: CW - 20 });
        y += 38;

      } else if (line.startsWith('## ')) {
        const t = line.slice(3).trim();
        ensureSpace(36);
        doc.rect(L, y, CW, 27).fill('#E0E7FF');
        doc.fillColor('#1E1B4B').font(boldFont).fontSize(13.5).text(t, L + 10, y + 7, { width: CW - 20 });
        y += 33;

      } else if (line.startsWith('### ')) {
        const t = line.slice(4).trim();
        ensureSpace(28);
        doc.strokeColor('#6366F1').lineWidth(2).moveTo(L, y + 16).lineTo(L + 4, y + 16).stroke();
        doc.fillColor('#312E81').font(boldFont).fontSize(12).text(t, L + 10, y + 8, { width: CW - 10 });
        y += 28;

      } else if (line === '---' || line === '────') {
        ensureSpace(14);
        doc.strokeColor('#C7D2FE').lineWidth(0.8).moveTo(L, y + 5).lineTo(R, y + 5).stroke();
        y += 14;

      } else if (line.startsWith('DEFINITION:')) {
        const t = line.slice(11).trim();
        if (!t) continue;
        doc.font(boldFont).fontSize(10.5);
        const th = doc.heightOfString(t, { width: CW - 20 });
        ensureSpace(th + 30);
        doc.fillColor('#FEF3C7').roundedRect(L, y, CW, th + 18, 5).fill();
        doc.fillColor('#F59E0B').roundedRect(L, y, 4, th + 18, 2).fill();
        doc.font(boldFont).fontSize(9.5).fillColor('#92400E').text('DEFINITION', L + 10, y + 4);
        doc.font(bodyFont).fontSize(11).fillColor('#78350F').text(t, L + 10, y + 16, { width: CW - 20 });
        y += th + 22;

      } else if (line.startsWith('SUMMARY:')) {
        const t = line.slice(8).trim();
        if (!t) continue;
        doc.font(bodyFont).fontSize(11);
        const th = doc.heightOfString(t, { width: CW - 20 });
        ensureSpace(th + 30);
        doc.fillColor('#EFF6FF').roundedRect(L, y, CW, th + 18, 5).fill();
        doc.fillColor('#3B82F6').roundedRect(L, y, 4, th + 18, 2).fill();
        doc.font(boldFont).fontSize(9.5).fillColor('#1D4ED8').text('SUMMARY', L + 10, y + 4);
        doc.font(bodyFont).fontSize(11).fillColor('#1E3A5F').text(t, L + 10, y + 16, { width: CW - 20 });
        y += th + 22;

      } else if (line.startsWith('EXPLANATION:') || line.startsWith('EXPLANATION')) {
        const rest = line.startsWith('EXPLANATION:') ? line.slice(12).trim() : '';
        ensureSpace(22);
        doc.font(boldFont).fontSize(10).fillColor('#4338CA').text('▶ EXPLANATION', L, y);
        y += 16;
        if (rest) writePara(rest, { indent: 16, color: '#1E293B', fontSize: 11 });

      } else if (line.startsWith('EXAMPLE:') || line.startsWith('EXAMPLE')) {
        const rest = line.startsWith('EXAMPLE:') ? line.slice(8).trim() : '';
        ensureSpace(22);
        doc.font(boldFont).fontSize(10).fillColor('#059669').text('▶ EXAMPLES & APPLICATIONS', L, y);
        y += 16;
        if (rest) writePara(rest, { indent: 16, color: '#065F46', fontSize: 11 });

      } else if (line.startsWith('- ') || line.startsWith('• ') || line.startsWith('* ')) {
        const bullet = line.slice(2).trim();
        doc.font(bodyFont).fontSize(11);
        const th = doc.heightOfString(bullet, { width: CW - 22 });
        ensureSpace(th + 6);
        doc.fillColor('#6366F1').circle(L + 6, y + 6, 2.5).fill();
        doc.fillColor('#1E293B').text(bullet, L + 16, y, { width: CW - 22, lineGap: 2 });
        y += th + 5;

      } else if (/^\d+\.\s/.test(line)) {
        const txt = line.replace(/^\d+\.\s/, '').trim();
        const num = line.match(/^(\d+)\./)?.[1];
        doc.font(bodyFont).fontSize(11);
        const th = doc.heightOfString(txt, { width: CW - 24 });
        ensureSpace(th + 6);
        doc.font(boldFont).fontSize(11).fillColor('#4F46E5').text(`${num}.`, L, y);
        doc.font(bodyFont).fillColor('#1E293B').text(txt, L + 20, y, { width: CW - 24, lineGap: 2 });
        y += th + 5;

      } else if (line.startsWith('**') && line.endsWith('**')) {
        writePara(line.slice(2, -2), { bold: true, fontSize: 12, color: '#1E1B4B', gap: 8 });

      } else if (line.startsWith('> ')) {
        const t = line.slice(2).trim();
        doc.font(bodyFont).fontSize(11);
        const th = doc.heightOfString(t, { width: CW - 24 });
        ensureSpace(th + 16);
        doc.fillColor('#F3F4F6').roundedRect(L, y, CW, th + 12, 4).fill();
        doc.fillColor('#4F46E5').roundedRect(L, y, 3, th + 12, 1.5).fill();
        doc.fillColor('#374151').font(bodyFont).fontSize(11).text(t, L + 12, y + 6, { width: CW - 24 });
        y += th + 18;

      } else {
        writePara(line, { color: '#1E293B', fontSize: 11, lineGap: 3, gap: 6 });
      }
    }

    // Authentic diagrams section
    const validImages = Array.isArray(imagePaths)
      ? imagePaths.map(resolveLocalPath).filter(p => p && fs.existsSync(p))
      : [];
    if (validImages.length > 0) {
      doc.addPage();
      pageNum++;
      doc.rect(0, 0, W, 72).fill('#4F46E5');
      doc.fillColor('#fff').font('Helvetica-Bold').fontSize(17).text(`${title} — Figures & Diagrams`, L, 16, { width: CW });
      doc.font('Helvetica').fontSize(10.5).text('Extracted directly from source document | Notivexa', L, 48);
      let curY = 90;
      validImages.forEach((imgP, idx) => {
        if (curY + 230 > H - 56) { doc.addPage(); pageNum++; curY = 65; }
        doc.fillColor('#4338CA').font('Helvetica-Bold').fontSize(11)
           .text(`Figure ${idx + 1}: Extracted from source document`, L, curY);
        curY += 18;
        try { doc.image(imgP, L, curY, { fit: [CW, 200], align: 'center' }); curY += 215; }
        catch (e) { console.warn('[notesPDF image]', e.message); }
      });
    }

    // Footers
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      doc.fillColor('#9CA3AF').font('Helvetica').fontSize(8.5)
         .text(`Page ${i + 1} of ${range.count}  •  ${title}  •  Notivexa AI`, 0, H - 26, { align: 'center' });
    }

    doc.flushPages();
    doc.end();
    stream.on('finish', () => res({ filePath, fileName, fileSize: fs.statSync(filePath).size }));
    stream.on('error', rej);
  });
}

// ── Handwritten Style PDF ─────────────────────────────────
async function handwrittenPDF(content, { title='Notes', subject='General', style='yellow', fontName='Caveat', imagePaths=[] }={}) {
  ensureDir();
  const fileName = `hw_${uuidv4()}.pdf`;
  const filePath = path.join(OUT, fileName);

  const paperStyles = {
    yellow: { bg: '#FEFDE8', line: '#EAE6BE', margin: '#FCA5A5' },
    'ruled-white': { bg: '#FFFFFF', line: '#E2E8F0', margin: '#FCA5A5' },
    'grid-paper': { bg: '#F8FAFC', line: '#E2E8F0', margin: '#94A3B8' },
    'plain-paper': { bg: '#FFFDF5', line: null, margin: null },
    'dark-chalk': { bg: '#1E293B', line: '#334155', margin: '#475569' }
  };
  const pStyle = paperStyles[style] || paperStyles.yellow;

  return new Promise((res, rej) => {
    // Zero margins to prevent PDFKit auto-pagination
    const doc = new PDFDocument({ size: 'A4', margins: { top: 0, bottom: 0, left: 0, right: 0 }, bufferPages: true });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const W = doc.page.width, H = doc.page.height;
    const L = 64;          // Left margin for content
    const R = W - 48;      // Right margin for content
    const CW = R - L;      // Content width = 483.28 pt
    const MARGIN_X = 52;   // Red margin line position
    const LINE_H = 25;     // Ruled line spacing

    // ── Font registry: id matches frontend HANDWRITING_FONTS id values ──────
    const fonts = [
      { id: 'caveat',              reg: 'Caveat-Regular.ttf',              bold: 'Caveat-Bold.ttf',              mod: 6  },
      { id: 'kalam',               reg: 'Kalam-Regular.ttf',               bold: 'Kalam-Bold.ttf',               mod: 3  },
      { id: 'indie-flower',        reg: 'IndieFlower-Regular.ttf',         bold: null,                           mod: 4  },
      { id: 'architects-daughter', reg: 'ArchitectsDaughter-Regular.ttf',  bold: null,                           mod: 3  },
      { id: 'patrick-hand',        reg: 'PatrickHand-Regular.ttf',         bold: null,                           mod: 3  },
      { id: 'shadows-into-light',  reg: 'ShadowsIntoLight-Regular.ttf',    bold: null,                           mod: 3  },
      { id: 'gloria-hallelujah',   reg: 'GloriaHallelujah-Regular.ttf',    bold: null,                           mod: 4  },
      { id: 'permanent-marker',    reg: 'PermanentMarker-Regular.ttf',     bold: null,                           mod: 5  },
      { id: 'sacramento',          reg: 'Sacramento-Regular.ttf',          bold: null,                           mod: 6  },
      { id: 'courgette',           reg: 'Courgette-Regular.ttf',           bold: null,                           mod: 4  },
      { id: 'marck-script',        reg: 'MarckScript-Regular.ttf',         bold: null,                           mod: 4  },
      { id: 'nanum-pen',           reg: 'NanumPenScript-Regular.ttf',      bold: null,                           mod: 3  },
      { id: 'reenie-beanie',       reg: 'ReenieBeanie-Regular.ttf',        bold: null,                           mod: 6  },
      { id: 'covered-by-your-grace', reg: 'CoveredByYourGrace-Regular.ttf', bold: null,                          mod: 4  },
      { id: 'rock-salt',           reg: 'RockSalt-Regular.ttf',            bold: null,                           mod: 2  },
    ];

    const normalise = s => (s || '').toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '');
    const selected = fonts.find(f => normalise(f.id) === normalise(fontName))
                  || fonts.find(f => normalise(fontName).includes(normalise(f.id).split('-')[0]))
                  || fonts[0];

    let FONT_REG = 'Helvetica';
    let FONT_BOLD = 'Helvetica-Bold';
    let FS_MOD = selected.mod || 0;

    const regPath  = path.join(__dirname, '..', selected.reg);
    const boldPath = selected.bold ? path.join(__dirname, '..', selected.bold) : null;
    const fontKey  = selected.id;

    if (fs.existsSync(regPath)) {
      doc.registerFont(fontKey, regPath);
      FONT_REG = fontKey;
    }
    if (boldPath && fs.existsSync(boldPath)) {
      doc.registerFont(fontKey + '-Bold', boldPath);
      FONT_BOLD = fontKey + '-Bold';
    } else if (FONT_REG !== 'Helvetica') {
      FONT_BOLD = FONT_REG;
    }

    let y = 115;
    let pageNum = 1;

    // Draw page background, guidelines and headers
    const drawPageBackground = (pNum) => {
      // 1. Page background fill
      doc.rect(0, 0, W, H).fill(pStyle.bg);

      // 2. Red margin line
      if (pStyle.margin) {
        doc.moveTo(MARGIN_X, 0).lineTo(MARGIN_X, H).lineWidth(0.8).strokeColor(pStyle.margin).stroke();
      }

      // 3. Subtle horizontal notebook lines
      if (pStyle.line) {
        doc.strokeColor(pStyle.line).lineWidth(0.3);
        const startY = pNum === 1 ? 115 : 65;
        for (let ly = startY; ly < H - 45; ly += LINE_H) {
          doc.moveTo(MARGIN_X + 2, ly).lineTo(W, ly).stroke();
        }
      }

      // 4. Header area
      if (pNum === 1) {
        // Page 1: Academic Document Header
        const subText = (subject || 'GENERAL').toUpperCase();
        doc.font('Helvetica-Bold').fontSize(8);
        const subW = doc.widthOfString(subText) + 16;
        doc.fillColor('#EDE9FE').roundedRect(L, 26, subW, 16, 4).fill();
        doc.fillColor('#5B21B6').text(subText, L + 8, 30, { lineBreak: false });

        // Date & Branding on right
        doc.fillColor('#64748B').font('Helvetica').fontSize(8.5)
           .text(`${new Date().toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}  •  Notivexa AI`, R - 180, 30, { width: 180, align: 'right', lineBreak: false });

        // Big Document Title
        doc.fillColor('#1E1B4B').font(FONT_BOLD).fontSize(20 + FS_MOD)
           .text(title, L, 50, { width: CW, lineBreak: false });

        // Decorative separator rule
        doc.strokeColor('#4F46E5').lineWidth(1.5).moveTo(L, 95).lineTo(R, 95).stroke();
        doc.strokeColor('#CBD5E1').lineWidth(0.5).moveTo(L, 98).lineTo(R, 98).stroke();
      } else {
        // Page 2+: Running Header
        doc.fillColor('#64748B').font('Helvetica').fontSize(8)
           .text(`${title}  •  ${subject}`, L, 28, { width: CW - 80, lineBreak: false });
        doc.fillColor('#475569').font('Helvetica-Bold').fontSize(8)
           .text(`Page ${pNum}`, R - 60, 28, { width: 60, align: 'right', lineBreak: false });
        doc.strokeColor('#E2E8F0').lineWidth(0.8).moveTo(L, 44).lineTo(R, 44).stroke();
      }
    };

    // First page setup
    drawPageBackground(1);

    const addPage = () => {
      doc.addPage();
      pageNum++;
      drawPageBackground(pageNum);
      y = 65;
    };

    const ensureSpace = (needed) => {
      if (y + needed > H - 55) addPage();
    };

    // ── Helper: Pill Badge (No emojis, razor sharp vector) ──
    const drawBadge = (label, bgCol, textCol, strokeCol = null) => {
      doc.font('Helvetica-Bold').fontSize(8);
      const textW = doc.widthOfString(label) + 16;
      const bH = 15;
      doc.fillColor(bgCol).roundedRect(L, y, textW, bH, 3).fill();
      if (strokeCol) doc.strokeColor(strokeCol).lineWidth(0.5).roundedRect(L, y, textW, bH, 3).stroke();
      doc.fillColor(textCol).text(label, L + 8, y + 3.5, { lineBreak: false });
      y += bH + 6;
    };

    // ── DEFINITION BOX ──────────────────────────────────────
    const drawDefinition = (text) => {
      if (!text || !text.trim()) return;
      doc.font(FONT_REG).fontSize(11.5 + FS_MOD);
      const innerW = CW - 24;
      const textH = doc.heightOfString(text.trim(), { width: innerW, lineGap: 3 });
      const cardH = textH + 18;

      ensureSpace(22 + cardH + 10);
      drawBadge('DEFINITION', '#FEF3C7', '#92400E', '#FDE68A');

      doc.fillColor('#FFFBEB').roundedRect(L, y, CW, cardH, 5).fill();
      doc.strokeColor('#FDE68A').lineWidth(0.8).roundedRect(L, y, CW, cardH, 5).stroke();
      doc.fillColor('#F59E0B').roundedRect(L, y, 4, cardH, 2).fill();

      doc.fillColor('#78350F').font(FONT_REG).fontSize(11.5 + FS_MOD)
         .text(text.trim(), L + 14, y + 9, { width: innerW, lineGap: 3 });
      y += cardH + 12;
    };

    // ── SUMMARY BOX ─────────────────────────────────────────
    const drawSummary = (text) => {
      if (!text || !text.trim()) return;
      doc.font(FONT_REG).fontSize(11 + FS_MOD);
      const innerW = CW - 24;
      const textH = doc.heightOfString(text.trim(), { width: innerW, lineGap: 3 });
      const cardH = textH + 18;

      ensureSpace(22 + cardH + 10);
      drawBadge('KEY SUMMARY', '#E0F2FE', '#0369A1', '#BAE6FD');

      doc.fillColor('#F0F9FF').roundedRect(L, y, CW, cardH, 5).fill();
      doc.strokeColor('#BAE6FD').lineWidth(0.8).roundedRect(L, y, CW, cardH, 5).stroke();
      doc.fillColor('#0284C7').roundedRect(L, y, 4, cardH, 2).fill();

      doc.fillColor('#0C4A6E').font(FONT_REG).fontSize(11 + FS_MOD)
         .text(text.trim(), L + 14, y + 9, { width: innerW, lineGap: 3 });
      y += cardH + 12;
    };

    // Queue of authentic extracted diagrams from the document
    const pendingImages = Array.isArray(imagePaths) 
      ? imagePaths.map(resolveLocalPath).filter(p => p && fs.existsSync(p)) 
      : [];
    let diagramCounter = 1;

    // ── AUTHENTIC DIAGRAM / FIGURE FROM SOURCE DOCUMENT ──
    const drawDocumentImage = (imgPath, caption = null) => {
      if (!imgPath || !fs.existsSync(imgPath)) return false;

      let imgW = CW - 24;
      let imgH = 175;
      try {
        const header = fs.readFileSync(imgPath);
        if (header[0] === 0x89 && header[1] === 0x50) { // PNG
          const origW = header.readUInt32BE(16);
          const origH = header.readUInt32BE(20);
          if (origW > 0 && origH > 0) {
            const maxW = CW - 24;
            const maxH = 210;
            const scale = Math.min(maxW / origW, maxH / origH, 1);
            imgW = Math.max(120, Math.round(origW * scale));
            imgH = Math.max(80, Math.round(origH * scale));
          }
        }
      } catch {}

      const cardH = imgH + 28;
      ensureSpace(22 + cardH + 12);

      drawBadge('FIGURE FROM SOURCE DOCUMENT', '#EDE9FE', '#5B21B6', '#DDD6FE');

      // Card container
      doc.fillColor('#FFFFFF').roundedRect(L, y, CW, cardH, 5).fill();
      doc.strokeColor('#CBD5E1').lineWidth(0.8).roundedRect(L, y, CW, cardH, 5).stroke();

      try {
        const drawX = L + Math.max(12, Math.floor((CW - imgW) / 2));
        doc.image(imgPath, drawX, y + 8, { fit: [imgW, imgH], align: 'center' });
      } catch (err) {
        console.warn('[PDFKit embed image]', err.message);
      }

      // Caption
      const capText = caption || `Figure ${diagramCounter++}: Diagram extracted directly from source document`;
      doc.fillColor('#64748B').font('Helvetica').fontSize(8)
         .text(capText, L + 12, y + cardH - 16, { width: CW - 24, align: 'center', lineBreak: false });

      y += cardH + 12;
      return true;
    };

    // ── DIAGRAM HANDLER ──
    // Prioritizes authentic diagrams extracted from PDF over fake AI text flowcharts
    const drawDiagram = (label) => {
      if (pendingImages.length > 0) {
        const nextImg = pendingImages.shift();
        drawDocumentImage(nextImg);
        return;
      }
      // If no document images are available, do NOT generate artificial flowcharts
      return;
    };

    // ── EXPLANATION SECTION ──
    const drawExplanation = (bullets) => {
      if (!bullets || bullets.length === 0) return;
      ensureSpace(40);
      drawBadge('IN-DEPTH EXPLANATION', '#EEF2FF', '#4338CA', '#C7D2FE');

      for (const bullet of bullets) {
        if (!bullet.trim()) continue;
        const txt = bullet.replace(/^[-•*]\s*/, '').trim();
        if (!txt) continue;

        doc.font(FONT_REG).fontSize(11 + FS_MOD);
        const itemW = CW - 26;
        const bH = doc.heightOfString(txt, { width: itemW, lineGap: 3 });
        ensureSpace(bH + 6);

        doc.fillColor('#4F46E5').circle(L + 8, y + 6, 2.5).fill();
        doc.fillColor('#1E293B').font(FONT_REG).fontSize(11 + FS_MOD)
           .text(txt, L + 20, y, { width: itemW, lineGap: 3 });
        y += bH + 6;
      }
      y += 8;
    };

    // ── EXAMPLE SECTION ──
    const drawExamples = (examples) => {
      if (!examples || examples.length === 0) return;
      ensureSpace(40);
      drawBadge('PRACTICAL EXAMPLES', '#D1FAE5', '#065F46', '#A7F3D0');

      for (const ex of examples) {
        if (!ex.trim()) continue;
        const txt = ex.replace(/^[-•*]\s*/, '').trim();
        if (!txt) continue;

        doc.font(FONT_REG).fontSize(11 + FS_MOD);
        const itemW = CW - 32;
        const bH = doc.heightOfString(txt, { width: itemW, lineGap: 3 });
        const cardH = bH + 14;
        ensureSpace(cardH + 6);

        doc.fillColor('#F0FDF4').roundedRect(L, y, CW, cardH, 4).fill();
        doc.strokeColor('#BBF7D0').lineWidth(0.6).roundedRect(L, y, CW, cardH, 4).stroke();
        doc.fillColor('#10B981').roundedRect(L, y, 3.5, cardH, 1.5).fill();

        doc.strokeColor('#059669').lineWidth(1.2).moveTo(L + 10, y + 10).lineTo(L + 14, y + 10).stroke();
        doc.fillColor('#059669').moveTo(L + 14, y + 8).lineTo(L + 17, y + 10).lineTo(L + 14, y + 12).fill();

        doc.fillColor('#064E3B').font(FONT_REG).fontSize(11 + FS_MOD)
           .text(txt, L + 24, y + 7, { width: itemW, lineGap: 3 });
        y += cardH + 6;
      }
      y += 8;
    };

    // ── TABLE ──
    const drawTable = (rows) => {
      if (!rows || rows.length === 0) return;
      const cols = rows[0].length;
      if (cols === 0) return;
      const cellW = Math.floor(CW / cols);
      const cellH = 24;
      const tableH = rows.length * cellH;
      ensureSpace(tableH + 16);

      rows.forEach((row, ri) => {
        row.forEach((cell, ci) => {
          const cx = L + ci * cellW, cy = y + ri * cellH;
          const isHeader = ri === 0;
          doc.rect(cx, cy, cellW, cellH).strokeColor('#CBD5E1').lineWidth(0.5).stroke();
          if (isHeader) {
            doc.fillColor('#4F46E5').rect(cx, cy, cellW, cellH).fill();
            doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(9);
          } else {
            doc.fillColor(ri % 2 === 0 ? '#F8FAFC' : '#FFFFFF').rect(cx, cy, cellW, cellH).fill();
            doc.fillColor('#1E293B').font(FONT_REG).fontSize(10 + FS_MOD / 3);
          }
          doc.text(String(cell).slice(0, 35), cx + 5, cy + 6, { width: cellW - 10, align: isHeader ? 'center' : 'left', lineBreak: false });
        });
      });
      y += tableH + 12;
    };

    // ── HEADINGS ──
    const drawHeading2 = (headingText) => {
      doc.font(FONT_BOLD).fontSize(13.5 + FS_MOD);
      const textH = doc.heightOfString(headingText, { width: CW - 24 });
      const barH = textH + 14;
      ensureSpace(barH + 12);

      doc.fillColor('#EEF2FF').roundedRect(L, y, CW, barH, 5).fill();
      doc.strokeColor('#C7D2FE').lineWidth(0.8).roundedRect(L, y, CW, barH, 5).stroke();
      doc.fillColor('#4F46E5').roundedRect(L, y, 4, barH, 2).fill();

      doc.fillColor('#1E1B4B').font(FONT_BOLD).fontSize(13.5 + FS_MOD)
         .text(headingText, L + 14, y + 7, { width: CW - 24, lineBreak: false });
      y += barH + 10;
    };

    // ── Parse content lines ──
    const lines = (content || '').split('\n');
    let tableRows = null;
    let mode = null;
    let modeLines = [];

    const flushMode = () => {
      if (!mode) return;
      if (mode === 'explanation') drawExplanation(modeLines);
      else if (mode === 'example') drawExamples(modeLines);
      mode = null;
      modeLines = [];
    };

    for (const line of lines) {
      let t = line.replace(/[\u{1F600}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F300}-\u{1F5FF}\u{1F900}-\u{1F9FF}\u{1F000}-\u{1FAFF}]/gu, '')
                  .replace(/\*\*/g, '')
                  .trim();

      const upper = t.toUpperCase();

      // Markdown image tag: ![Figure 1: Diagram from Document](/uploads/images/extracted/...)
      const imgMatch = t.match(/^!\[(.*?)\]\((.*?)\)/);
      if (imgMatch) {
        flushMode();
        const caption = imgMatch[1];
        const imgUrl = imgMatch[2];
        const localImg = resolveLocalPath(imgUrl) || 
          (imgUrl.startsWith('/') ? path.join(__dirname, '..', imgUrl.slice(1)) : path.join(__dirname, '..', imgUrl));
        if (localImg && fs.existsSync(localImg)) {
          drawDocumentImage(localImg, caption);
          const fn = path.basename(localImg);
          const pIdx = pendingImages.findIndex(p => path.basename(p) === fn);
          if (pIdx !== -1) pendingImages.splice(pIdx, 1);
        }
        continue;
      }

      // Skip caption sub-line if it was part of figure markdown
      if (/^\*Figure \d+:.*?\*$/i.test(t)) {
        continue;
      }

      if (tableRows && !t.includes('|')) {
        drawTable(tableRows);
        tableRows = null;
      }

      if (upper.startsWith('DEFINITION:')) {
        flushMode();
        drawDefinition(t.slice(11).trim());
        continue;
      }
      if (upper.startsWith('SUMMARY:')) {
        flushMode();
        drawSummary(t.slice(8).trim());
        continue;
      }
      if (upper.startsWith('DIAGRAM:')) {
        flushMode();
        drawDiagram(t);
        continue;
      }
      if (upper.startsWith('EXPLANATION:')) {
        flushMode();
        mode = 'explanation';
        const rest = t.slice(12).trim();
        if (rest) modeLines.push(rest);
        continue;
      }
      if (upper.startsWith('EXAMPLE:')) {
        flushMode();
        mode = 'example';
        const rest = t.slice(8).trim();
        if (rest) modeLines.push(rest);
        continue;
      }

      if (mode) {
        if (t.startsWith('#') || upper.startsWith('DEFINITION:') || upper.startsWith('SUMMARY:') || upper.startsWith('DIAGRAM:') || upper.startsWith('---')) {
          flushMode();
        } else {
          modeLines.push(t);
          continue;
        }
      }

      if (!t) {
        y += 6;
        continue;
      }

      if (upper.startsWith('TABLE:')) {
        const header = t.slice(6).trim();
        tableRows = [header.split('|').map(s => s.trim())];
        continue;
      }
      if (tableRows && t.includes('|')) {
        if (!t.replace(/[-|\s]/g, '')) continue;
        tableRows.push(t.split('|').map(s => s.trim()).filter((_, i, a) => i > 0 && i < a.length - 1 || a.length <= 2));
        continue;
      }
      if (!tableRows && t.startsWith('|') && t.endsWith('|')) {
        tableRows = [];
        if (!t.replace(/[-|\s]/g, '')) continue;
        tableRows.push(t.split('|').map(s => s.trim()).filter(Boolean));
        continue;
      }

      if (t === '---' || t === '──────') {
        ensureSpace(20);
        doc.strokeColor('#E2E8F0').lineWidth(0.8).moveTo(L, y + 6).lineTo(R, y + 6).stroke();
        y += 16;
        continue;
      }

      if (t.startsWith('# ')) {
        const hText = t.slice(2).trim();
        const normTitle = (title || '').toLowerCase().replace(/notes|study|academic/g, '').trim();
        const normH = hText.toLowerCase().replace(/notes|study|academic/g, '').trim();
        if (normTitle && normH && (normTitle === normH || normTitle.includes(normH) || normH.includes(normTitle))) continue;
        ensureSpace(34);
        doc.fillColor('#1E1B4B').font(FONT_BOLD).fontSize(16 + FS_MOD).text(hText, L, y, { width: CW });
        y += 26;
      } else if (t.startsWith('## ')) {
        // Embed the next authentic document diagram between major topics
        if (pendingImages.length > 0 && pageNum >= 1 && y > 150) {
          drawDocumentImage(pendingImages.shift());
        }
        drawHeading2(t.slice(3).trim());
      } else if (t.startsWith('### ')) {
        ensureSpace(20);
        doc.fillColor('#047857').font(FONT_BOLD).fontSize(12 + FS_MOD).text(t.slice(4).trim(), L, y, { width: CW });
        y += 18;
      } else if (t.startsWith('- ') || t.startsWith('• ') || t.startsWith('* ')) {
        const bulletText = t.slice(2).trim();
        doc.font(FONT_REG).fontSize(11 + FS_MOD);
        const bH = doc.heightOfString(bulletText, { width: CW - 20 });
        ensureSpace(bH + 6);
        doc.fillColor('#4F46E5').circle(L + 6, y + 6, 2).fill();
        doc.fillColor('#1E293B').text(bulletText, L + 16, y, { width: CW - 20, lineGap: 3 });
        y += bH + 6;
      } else {
        doc.font(FONT_REG).fontSize(11 + FS_MOD);
        const tH = doc.heightOfString(t, { width: CW });
        ensureSpace(tH + 6);
        doc.fillColor('#1E293B').text(t, L, y, { width: CW, lineGap: 3 });
        y += tH + 6;
      }
    }

    flushMode();
    if (tableRows) drawTable(tableRows);

    // Embed any remaining authentic diagrams from document
    if (pendingImages.length > 0) {
      drawHeading2('FIGURES & DIAGRAMS FROM SOURCE DOCUMENT');
      while (pendingImages.length > 0) {
        const nextImg = pendingImages.shift();
        drawDocumentImage(nextImg);
      }
    }

    // Draw all footers cleanly across all buffered pages
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      doc.fillColor('#94A3B8').font('Helvetica').fontSize(8)
         .text(`Page ${i + 1} of ${range.count}  •  Notivexa AI Academic Notes`, L, H - 28, { width: CW, align: 'center', lineBreak: false });
    }

    doc.flushPages();
    doc.end();
    stream.on('finish', () => res({ filePath, fileName, fileSize: fs.statSync(filePath).size }));
    stream.on('error', rej);
  });
}

// ── Question Paper PDF (Authentic Autonomous College Format) ──
async function questionPaperPDF(content, { title='Exam', subject='General', totalMarks=20, timeHours=1, institution="Mahatma Education Society's" }={}) {
  ensureDir();
  const fileName = `paper_${uuidv4()}.pdf`;
  const filePath = path.join(OUT, fileName);
  return new Promise((res, rej) => {
    const doc = new PDFDocument({ size:'A4', margins:{top:32,bottom:32,left:36,right:36} });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    let data;
    if (typeof content === 'object' && content !== null) {
      data = content;
    } else {
      try {
        data = JSON.parse((content || '').replace(/```json\n?|\n?```/g, '').trim());
      } catch(e) {
        data = null;
      }
    }

    const is60Marks = totalMarks === 60 || data?.marks == '60' || (data?.sections && data.sections.length >= 5);

    if (!data) {
      if (is60Marks) {
        data = {
          institution: institution || "Mahatma Education Society's",
          college: "Pillai HOC College of Engineering and Technology,Rasayani",
          status: "(Autonomous)",
          department: "Department of Computer Application",
          examType: "PRELIM EXAMINATION (Autonomous)",
          branch: "Computer Application (MCA)",
          semester: "Semester: I",
          subject: subject || title || "Software Project Management",
          subjectCode: "MCA104",
          date: "04/12/2025",
          time: "02.00 Hours",
          duration: "02.00 Hours",
          marks: "60",
          nb: [
            "1. Q.1 is compulsory",
            "2. Attempt any Three from the remaining five questions",
            "3. Each Question carry 15 marks."
          ],
          sections: [
            {
              qNum: "Q.1",
              instruction: "Attempt any 3",
              questions: [
                { id: "a)", text: "What is Feasibility Study? Explain Types of Feasibility.", marks: "5", bt: "1", co: "Co3" },
                { id: "b)", text: "Explain the role and responsibilities of project manager", marks: "5", bt: "2", co: "Co1" },
                { id: "c)", text: "Difference between Scrum & Kanban(any 10)", marks: "5", bt: "4", co: "Co2" },
                { id: "d)", text: "Explain six sigma with its characteristics", marks: "5", bt: "2", co: "Co6" },
                { id: "e)", text: "Explain Extreme programming with its Values", marks: "5", bt: "2", co: "Co2" },
                { id: "f)", text: "Design DFD (up to level 1)for Library Management system", marks: "5", bt: "2", co: "Co3" }
              ]
            },
            {
              qNum: "Q.2",
              instruction: "Attempt All",
              questions: [
                { id: "a)", text: "Explain DevOps Model in detail", marks: "8", bt: "2", co: "Co2" },
                { id: "b)", text: "Suppose that a Basic project was estimated to be 400 KLOC. Calculate effort and time for each of the three modes of development. All the constants value provided in the following table\n\n| Software Project | a | b | c | d |\n| :--- | :--- | :--- | :--- | :--- |\n| Organic | 2.4 | 1.05 | 2.5 | 0.38 |\n| Semi detached | 3.0 | 1.12 | 2.5 | 0.35 |\n| Embedded | 3.6 | 1.20 | 2.5 | 0.32 |", marks: "7", bt: "6", co: "Co4" }
              ]
            },
            {
              qNum: "Q.3",
              instruction: "Attempt All",
              questions: [
                { id: "a)", text: "Develop SRS on online student feedback", marks: "8", bt: "6", co: "Co3" },
                { id: "b)", text: "Explain Work Breakdown Structures (WBS)With example", marks: "7", bt: "2", co: "Co5" }
              ]
            },
            {
              qNum: "Q.4",
              instruction: "Attempt All",
              questions: [
                { id: "a)", text: "Determine the earliest event and latest event in respect of all node points and identify critical path for the following network", marks: "10", bt: "5", co: "Co5" },
                { id: "b)", text: "What is LOC explain with example", marks: "5", bt: "1", co: "Co4" }
              ]
            },
            {
              qNum: "Q.5",
              instruction: "Attempt All",
              questions: [
                { id: "a)", text: "Explain in detail Life Cycle of Project", marks: "7", bt: "2", co: "Co1" },
                { id: "b)", text: "A library management system has the following:\n• External Inputs: 8 (Average complexity)\n• External Outputs: 5 (High complexity)\n• External Inquiries: 4 (Low complexity)\n• Internal Logical Files: 3 (Average complexity)\n• External Interface Files: 2 (Low complexity)\nGeneral System Characteristics (14 factors) total = TDI = 32 Calculate the Function Points.\n\nWeight Table:\n| Component | Low | Average | High |\n| :--- | :--- | :--- | :--- |\n| EI | 3 | 4 | 6 |\n| EO | 4 | 5 | 7 |\n| EQ | 3 | 4 | 6 |\n| ILF | 7 | 10 | 15 |\n| EIF | 5 | 7 | 10 |", marks: "8", bt: "2", co: "Co2" }
              ]
            },
            {
              qNum: "Q.6",
              instruction: "Attempt All",
              questions: [
                { id: "a)", text: "Define FTR. explain its objectives and review guidelines", marks: "8", bt: "1", co: "Co6" },
                { id: "b)", text: "What is Use Case diagram? Draw use case diagram on online shopping system", marks: "7", bt: "6", co: "Co3" }
              ]
            }
          ],
          courseOutcomes: [
            { code: "CO1", desc: "Define the key concepts of Software Project Management." },
            { code: "CO2", desc: "Use various SDLC models to implement the projects." },
            { code: "CO3", desc: "Demonstrate understanding of the requirements Analysis and Application UML Models." },
            { code: "CO4", desc: "Make use of estimation logic for estimation of software size as well as cost of software." },
            { code: "CO5", desc: "Analyze the need of scheduling and change management during software development." },
            { code: "CO6", desc: "Assess various factors influencing project management, quality assurance and risk assessment." }
          ],
          btLevels: "1 Remembering, 2 Understanding, 3 Applying, 4 Analyzing, 5 Evaluating, 6 Creating.",
          legend: "M-Marks, BT- Bloom's Taxonomy, CO-Course Outcomes."
        };
      } else {
        data = {
          institution: institution || "Mahatma Education Society's",
          college: "Pillai HOC College of Engineering and Technology, Rasayani.",
          status: "(Autonomous)",
          department: "Department of Computer Application",
          examType: "Internal Assessment- I OSAY 2026-2027",
          subject: subject || title || "Big Data Analytics and Visualization",
          class: "SY-MCA",
          date: "22/8/2026",
          time: "10.30am - 11.30am",
          duration: `${timeHours}Hr`,
          marks: `${totalMarks}`,
          note: "Note: Assume suitable data wherever necessary.",
          sections: [
            {
              qNum: "1",
              instruction: "Attempt Any Five out of Six",
              questions: [
                { id: "A.", text: "Explain advantages of NoSQL(any 4).", marks: "[ 02 ]", co: "CO3", bl: "L2" },
                { id: "B.", text: "What is Rack Awareness in Hadoop HDFS?", marks: "[ 02 ]", co: "CO1", bl: "L1" },
                { id: "C.", text: "Illustrate Partitioner and Combiners MapReduce process.", marks: "[ 02 ]", co: "CO2", bl: "L2" },
                { id: "D.", text: "Elaborate application workflow in Hadoop YARN.", marks: "[ 02 ]", co: "CO1", bl: "L6" },
                { id: "E.", text: "Define Big Data and Explain Big Data characteristics.", marks: "[ 02 ]", co: "CO1", bl: "L2" },
                { id: "F.", text: "Explain Master-Slave Architecture with a suitable diagram.", marks: "[ 02 ]", co: "CO3", bl: "L2" }
              ]
            },
            {
              qNum: "2",
              instruction: "Attempt Any One",
              questions: [
                { id: "A.", text: "Discuss the architecture and components of the Hadoop Ecosystem with a suitable diagram.", marks: "[ 05 ]", co: "CO1", bl: "L2" },
                { id: "B.", text: "What are the different types of NoSQL datastores? Explain each one in short.", marks: "[ 05 ]", co: "CO3", bl: "L2" }
              ]
            },
            {
              qNum: "3",
              instruction: "Attempt Any One",
              questions: [
                { id: "A.", text: "Discuss the structure and working of HBase Architecture with a suitable diagram.", marks: "[ 05 ]", co: "CO3", bl: "L2" },
                { id: "B.", text: "Explain Computing Selection and Projection by Map Reduce algorithm with suitable example.", marks: "[ 05 ]", co: "CO2", bl: "L2" }
              ]
            }
          ]
        };
      }
    }

    doc.fillColor('#000000');
    let y = 30;

    // Centered College Header
    doc.font('Helvetica').fontSize(10).text(data.institution || "Mahatma Education Society's", 36, y, { width: 523, align: 'center' });
    y += 14;
    doc.font('Helvetica-Bold').fontSize(11).text(data.college || "Pillai HOC College of Engineering and Technology,Rasayani", 36, y, { width: 523, align: 'center' });
    y += 14;
    doc.font('Helvetica-Bold').fontSize(9.5).text(data.department || "Department of Computer Application", 36, y, { width: 523, align: 'center' });
    y += 13;
    doc.font('Helvetica-Bold').fontSize(9.5).text(data.examType || (is60Marks ? "PRELIM EXAMINATION (Autonomous)" : "Internal Assessment- I OSAY 2026-2027"), 36, y, { width: 523, align: 'center' });
    y += 16;

    // ── Table Grid Constants ──
    const x0 = 36;
    const x1 = 68;  // Q.No col (width: 32)
    const x2 = 445; // Question description col (width: 377)
    const x3 = 478; // Marks col (width: 33)
    const x4 = 514; // BT col (width: 36)
    const x5 = 559; // CO col (width: 45)

    const drawHLine = (curY) => doc.moveTo(x0, curY).lineTo(x5, curY).lineWidth(0.8).strokeColor('#000').stroke();

    if (is60Marks) {
      // ══════════════════════════════════════════════════════════════
      // 4-ROW BORDERED METADATA BOX (Branch, Semester, Subject, Time, Max Marks, Date, N.B, Code)
      // ══════════════════════════════════════════════════════════════
      const xMid = 390;

      // Row 1: Branch | Semester
      let rH1 = 18;
      drawHLine(y);
      doc.font('Helvetica-Bold').fontSize(8.5).text(`Branch: ${data.branch || data.class || 'Computer Application (MCA)'}`, x0 + 5, y + 5, { width: xMid - x0 - 10 });
      doc.font('Helvetica-Bold').fontSize(8.5).text(data.semester || 'Semester: I', xMid + 5, y + 5, { width: x5 - xMid - 10 });
      doc.moveTo(x0, y).lineTo(x0, y + rH1).stroke();
      doc.moveTo(xMid, y).lineTo(xMid, y + rH1).stroke();
      doc.moveTo(x5, y).lineTo(x5, y + rH1).stroke();
      y += rH1;

      // Row 2: Subject | Time
      let rH2 = 18;
      drawHLine(y);
      doc.font('Helvetica-Bold').fontSize(8.5).text(`Subject: ${data.subject || subject || 'Software Project Management'}`, x0 + 5, y + 5, { width: xMid - x0 - 10 });
      doc.font('Helvetica-Bold').fontSize(8.5).text(`Time: ${data.time || '02.00 Hours'}`, xMid + 5, y + 5, { width: x5 - xMid - 10 });
      doc.moveTo(x0, y).lineTo(x0, y + rH2).stroke();
      doc.moveTo(xMid, y).lineTo(xMid, y + rH2).stroke();
      doc.moveTo(x5, y).lineTo(x5, y + rH2).stroke();
      y += rH2;

      // Row 3: Max. Marks | Date
      let rH3 = 18;
      drawHLine(y);
      doc.font('Helvetica-Bold').fontSize(8.5).text(`Max. Marks: 60`, x0 + 5, y + 5, { width: xMid - x0 - 10 });
      doc.font('Helvetica-Bold').fontSize(8.5).text(`Date: ${data.date || '04/12/2025'}`, xMid + 5, y + 5, { width: x5 - xMid - 10 });
      doc.moveTo(x0, y).lineTo(x0, y + rH3).stroke();
      doc.moveTo(xMid, y).lineTo(xMid, y + rH3).stroke();
      doc.moveTo(x5, y).lineTo(x5, y + rH3).stroke();
      y += rH3;

      // Row 4: N.B 1. Q.1 is compulsory... | Subject Code
      let rH4 = 36;
      drawHLine(y);
      doc.font('Helvetica-Bold').fontSize(8).text(`N.B 1. Q.1 is compulsory`, x0 + 5, y + 4, { width: xMid - x0 - 10 });
      doc.font('Helvetica-Bold').fontSize(8).text(`      2. Attempt any Three from the remaining five questions`, x0 + 5, y + 14, { width: xMid - x0 - 10 });
      doc.font('Helvetica-Bold').fontSize(8).text(`      3. Each Question carry 15 marks.`, x0 + 5, y + 24, { width: xMid - x0 - 10 });

      doc.font('Helvetica-Bold').fontSize(8.5).text(`Subject Code: ${data.subjectCode || 'MCA104'}`, xMid + 5, y + 8, { width: x5 - xMid - 10 });
      doc.moveTo(x0, y).lineTo(x0, y + rH4).stroke();
      doc.moveTo(xMid, y).lineTo(xMid, y + rH4).stroke();
      doc.moveTo(x5, y).lineTo(x5, y + rH4).stroke();
      y += rH4;
      drawHLine(y);

      // ── Questions Table Column Headers: [ ] | [ ] | M | BT | CO ──
      const headerH = 20;
      doc.font('Helvetica-Bold').fontSize(8.5);
      doc.text('M', x2, y + 5, { width: x3 - x2, align: 'center' });
      doc.text('BT', x3, y + 5, { width: x4 - x3, align: 'center' });
      doc.text('CO', x4, y + 5, { width: x5 - x4, align: 'center' });

      doc.moveTo(x0, y).lineTo(x0, y + headerH).stroke();
      doc.moveTo(x2, y).lineTo(x2, y + headerH).stroke();
      doc.moveTo(x3, y).lineTo(x3, y + headerH).stroke();
      doc.moveTo(x4, y).lineTo(x4, y + headerH).stroke();
      doc.moveTo(x5, y).lineTo(x5, y + headerH).stroke();
      y += headerH;
      drawHLine(y);

    } else {
      // ══════════════════════════════════════════════════════════════
      // 20 MARKS INTERNAL ASSESSMENT METADATA & HEADERS
      // ══════════════════════════════════════════════════════════════
      doc.font('Helvetica-Bold').fontSize(9);
      doc.text(`Subject: ${data.subject || subject}`, 36, y, { width: 340, lineBreak: false });
      doc.text(`Class: ${data.class || 'SY-MCA'}`, 380, y, { width: 179, align: 'right', lineBreak: false });
      y += 14;

      doc.text(`Date: ${data.date || '22/8/2026'}`, 36, y, { width: 120, lineBreak: false });
      doc.text(`Time: ${data.time || '10.30am - 11.30am'}`, 160, y, { width: 190, align: 'center', lineBreak: false });
      doc.text(`Duration: ${data.duration || timeHours + 'Hr'}   Marks: ${data.marks || totalMarks}`, 360, y, { width: 199, align: 'right', lineBreak: false });
      y += 16;

      const row0H = 24;
      drawHLine(y);
      doc.font('Helvetica-Bold').fontSize(8.5).text(data.note || 'Note: Assume suitable data wherever necessary.', x0 + 6, y + 7, { width: x2 - x0 - 12 });
      doc.font('Helvetica-Bold').fontSize(8).text('Course\nOutcome', x3, y + 3, { width: 40, align: 'center' });
      doc.font('Helvetica-Bold').fontSize(8).text("Bloom's\nLevel", x4, y + 3, { width: 40, align: 'center' });

      doc.moveTo(x0, y).lineTo(x0, y + row0H).stroke();
      doc.moveTo(x3, y).lineTo(x3, y + row0H).stroke();
      doc.moveTo(x4, y).lineTo(x4, y + row0H).stroke();
      doc.moveTo(x5, y).lineTo(x5, y + row0H).stroke();
      y += row0H;
      drawHLine(y);
    }

    // ── Render Sections & Questions ──
    const sections = Array.isArray(data.sections) ? data.sections : [];
    sections.forEach(sec => {
      // Section header row: Q.1 | Attempt any 3 | | |
      const secH = 18;
      if (y + secH > doc.page.height - 40) {
        doc.addPage();
        y = 36;
        drawHLine(y);
      }

      doc.font('Helvetica-Bold').fontSize(9).text(sec.qNum || '', x0 + 4, y + 4, { width: x1 - x0 - 8 });
      doc.font('Helvetica-Bold').fontSize(9).text(sec.instruction || 'Attempt All', x1 + 6, y + 4, { width: x2 - x1 - 12 });

      doc.moveTo(x0, y).lineTo(x0, y + secH).stroke();
      doc.moveTo(x1, y).lineTo(x1, y + secH).stroke();
      doc.moveTo(x2, y).lineTo(x2, y + secH).stroke();
      doc.moveTo(x3, y).lineTo(x3, y + secH).stroke();
      doc.moveTo(x4, y).lineTo(x4, y + secH).stroke();
      doc.moveTo(x5, y).lineTo(x5, y + secH).stroke();
      y += secH;
      drawHLine(y);

      // Question sub-rows: a) | Question text | 5 | 1 | Co3
      const questions = Array.isArray(sec.questions) ? sec.questions : [];
      questions.forEach(q => {
        doc.font('Helvetica').fontSize(8.5);
        const textH = doc.heightOfString(q.text || '', { width: x2 - x1 - 14, lineGap: 1.5 });
        const qRowH = Math.max(textH + 8, 19);

        if (y + qRowH > doc.page.height - 40) {
          doc.addPage();
          y = 36;
          drawHLine(y);
        }

        doc.font('Helvetica-Bold').fontSize(8.5).text(q.id || '', x0, y + 5, { width: x1 - x0, align: 'center' });
        doc.font('Helvetica').fontSize(8.5).text(q.text || '', x1 + 6, y + 5, { width: x2 - x1 - 14, lineGap: 1.5 });
        doc.font('Helvetica-Bold').fontSize(8.5).text(String(q.marks || '').replace(/[\[\]]/g, '').trim(), x2, y + 5, { width: x3 - x2, align: 'center' });
        doc.font('Helvetica').fontSize(8.5).text(String(q.bt || q.bl || '').replace(/^L/, ''), x3, y + 5, { width: x4 - x3, align: 'center' });
        doc.font('Helvetica').fontSize(8.5).text(String(q.co || ''), x4, y + 5, { width: x5 - x4, align: 'center' });

        doc.moveTo(x0, y).lineTo(x0, y + qRowH).stroke();
        doc.moveTo(x1, y).lineTo(x1, y + qRowH).stroke();
        doc.moveTo(x2, y).lineTo(x2, y + qRowH).stroke();
        doc.moveTo(x3, y).lineTo(x3, y + qRowH).stroke();
        doc.moveTo(x4, y).lineTo(x4, y + qRowH).stroke();
        doc.moveTo(x5, y).lineTo(x5, y + qRowH).stroke();
        y += qRowH;
        drawHLine(y);
      });
    });

    // ── Bottom Course Outcomes & Bloom's Taxonomy Legend (Page 2 bottom) ──
    if (is60Marks) {
      if (y + 110 > doc.page.height - 30) {
        doc.addPage();
        y = 36;
      } else {
        y += 12;
      }

      const cos = data.courseOutcomes || [
        { code: "CO1", desc: `Define the key concepts of ${data.subject || subject}.` },
        { code: "CO2", desc: `Use various SDLC models to implement the projects.` },
        { code: "CO3", desc: `Demonstrate understanding of the requirements Analysis and Application UML Models.` },
        { code: "CO4", desc: `Make use of estimation logic for estimation of software size as well as cost of software.` },
        { code: "CO5", desc: `Analyze the need of scheduling and change management during software development.` },
        { code: "CO6", desc: `Assess various factors influencing project management, quality assurance and risk assessment.` }
      ];

      doc.font('Helvetica').fontSize(7.5);
      cos.forEach(co => {
        doc.font('Helvetica-Bold').text(`${co.code}: `, x0, y, { lineBreak: false });
        doc.font('Helvetica').text(co.desc || '', x0 + 26, y, { width: 497 });
        y += 11;
      });

      y += 2;
      doc.font('Helvetica-Bold').fontSize(7.5).text(data.btLevels || "BT Levels: - 1 Remembering ,2 Understanding, 3 Applying,4 Analyzing, 5 Evaluating, 6 Creating.", x0, y);
      y += 10;
      doc.font('Helvetica').fontSize(7.5).text(data.legend || "M-Marks, BT- Bloom's Taxonomy, CO-Course Outcomes.", x0, y);
    }

    doc.end();
    stream.on('finish', () => res({ filePath, fileName, fileSize: fs.statSync(filePath).size }));
    stream.on('error', rej);
  });
}

const THEME_PDF_PALETTES = {
  light: {
    bg: '#FFFFFF',
    category: '#E11D48',
    title: '#0F172A',
    text: '#334155',
    takeawayBg: '#FEF3C7',
    takeawayBorder: '#F59E0B',
    takeawayLabel: '#B45309',
    takeawayText: '#78350F',
    analogyBg: '#E0F2FE',
    analogyBorder: '#38BDF8',
    analogyLabel: '#0369A1',
    analogyText: '#0C4A6E',
    numColor: '#888888',
    notesBg: '#F1F5F9',
    notesText: '#64748B'
  },
  indigo: {
    bg: '#0F172A',
    category: '#818CF8',
    title: '#FFFFFF',
    text: '#E2E8F0',
    takeawayBg: '#1E293B',
    takeawayBorder: '#F59E0B',
    takeawayLabel: '#FBBF24',
    takeawayText: '#FDE68A',
    analogyBg: '#0F243A',
    analogyBorder: '#38BDF8',
    analogyLabel: '#38BDF8',
    analogyText: '#BAE6FD',
    numColor: '#64748B',
    notesBg: '#1E293B',
    notesText: '#94A3B8'
  },
  emerald: {
    bg: '#064E3B',
    category: '#34D399',
    title: '#FFFFFF',
    text: '#D1FAE5',
    takeawayBg: '#065F46',
    takeawayBorder: '#F59E0B',
    takeawayLabel: '#FBBF24',
    takeawayText: '#FEF3C7',
    analogyBg: '#04382B',
    analogyBorder: '#38BDF8',
    analogyLabel: '#67E8F9',
    analogyText: '#E0F2FE',
    numColor: '#059669',
    notesBg: '#065F46',
    notesText: '#A7F3D0'
  },
  sunset: {
    bg: '#4C0519',
    category: '#FB7185',
    title: '#FFFFFF',
    text: '#FFE4E6',
    takeawayBg: '#881337',
    takeawayBorder: '#F59E0B',
    takeawayLabel: '#FBBF24',
    takeawayText: '#FEF3C7',
    analogyBg: '#701A75',
    analogyBorder: '#38BDF8',
    analogyLabel: '#38BDF8',
    analogyText: '#E0F2FE',
    numColor: '#9F1239',
    notesBg: '#881337',
    notesText: '#FECDD3'
  },
  cyber: {
    bg: '#180828',
    category: '#C084FC',
    title: '#FFFFFF',
    text: '#F3E8FF',
    takeawayBg: '#2E1065',
    takeawayBorder: '#F59E0B',
    takeawayLabel: '#FBBF24',
    takeawayText: '#FEF3C7',
    analogyBg: '#1E1B4B',
    analogyBorder: '#38BDF8',
    analogyLabel: '#38BDF8',
    analogyText: '#E0F2FE',
    numColor: '#7E22CE',
    notesBg: '#2E1065',
    notesText: '#E9D5FF'
  }
};

// ── Slide Deck PDF ────────────────────────────────────────
async function slidePDF(data, { title = 'Presentation', theme = 'light' } = {}) {
  ensureDir();
  const rawSlides = (typeof data === 'string' ? JSON.parse(data) : data)?.slides || (Array.isArray(data) ? data : []);
  if (rawSlides.length === 0) throw new Error('No slides to generate');
  const palette = THEME_PDF_PALETTES[theme] || THEME_PDF_PALETTES.light || THEME_PDF_PALETTES.indigo;
  const fileName = `ppt_${uuidv4()}.pdf`;
  const filePath = path.join(OUT, fileName);

  return new Promise((res, rej) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margins: { top: 30, bottom: 30, left: 45, right: 45 } });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);
    const W = doc.page.width, H = doc.page.height;

    rawSlides.forEach((slide, idx) => {
      if (idx > 0) doc.addPage();
      // Background
      doc.rect(0, 0, W, H).fill(palette.bg);

      const category = (slide.category || (idx === 0 ? 'INTRODUCTION' : idx === rawSlides.length - 1 ? 'QUICK SUMMARY' : 'CORE PRINCIPLE')).toUpperCase();
      const slideTitle = slide.title || `Slide ${idx + 1}`;
      const rawTakeaway = slide.keyTakeaway || slide.takeaway || '';
      const cleanTakeaway = rawTakeaway.replace(/^KEY TAKEAWAY:\s*/i, '').trim();
      const rawAnalogy = slide.analogy || slide.realWorldAnalogy || '';
      const cleanAnalogy = rawAnalogy.replace(/^(REAL-WORLD ANALOGY|KEY INSIGHT):\s*/i, '').trim();
      const bullets = Array.isArray(slide.bullets) ? slide.bullets : [];

      // 1. Category Badge
      doc.fillColor(palette.category).font('Helvetica-Bold').fontSize(11).text(category, 50, 32);

      // 2. Slide Title
      doc.fillColor(palette.title).font('Helvetica-Bold').fontSize(22).text(slideTitle, 50, 52, { width: W - 100 });

      // 3. KEY TAKEAWAY Banner Card
      const hasTakeaway = Boolean(cleanTakeaway);
      if (hasTakeaway) {
        doc.roundedRect(50, 92, W - 100, 42, 6)
          .lineWidth(1)
          .fillAndStroke(palette.takeawayBg, palette.takeawayBorder);

        doc.fillColor(palette.takeawayLabel).font('Helvetica-Bold').fontSize(10.5).text('KEY TAKEAWAY:  ', 64, 105, { continued: true });
        doc.fillColor(palette.takeawayText).font('Helvetica').fontSize(10.5).text(cleanTakeaway, { width: W - 130 });
      }

      // 4. Content Bullets
      let y = hasTakeaway ? 152 : 105;
      const maxY = cleanAnalogy ? H - 100 : H - 50;

      bullets.forEach(b => {
        if (y >= maxY) return;
        const str = String(b).trim();
        const colonIdx = str.indexOf(': ');

        doc.fillColor(palette.category).font('Helvetica-Bold').fontSize(14).text('•', 52, y);

        if (colonIdx > 0 && colonIdx < 45) {
          const label = str.substring(0, colonIdx + 2);
          const desc = str.substring(colonIdx + 2);
          doc.fillColor(palette.title).font('Helvetica-Bold').fontSize(13.5).text(label, 70, y, { continued: true });
          doc.fillColor(palette.text).font('Helvetica').fontSize(13.5).text(desc, { width: W - 130 });
        } else {
          doc.fillColor(palette.text).font('Helvetica').fontSize(13.5).text(str, 70, y, { width: W - 130 });
        }

        y += Math.max(26, doc.heightOfString(str, { width: W - 130 }) + 10);
      });

      // 5. REAL-WORLD ANALOGY Banner Card
      if (cleanAnalogy) {
        doc.roundedRect(50, H - 85, W - 100, 40, 6)
          .lineWidth(1)
          .fillAndStroke(palette.analogyBg, palette.analogyBorder);

        doc.fillColor(palette.analogyLabel).font('Helvetica-Bold').fontSize(10).text('💡 REAL-WORLD ANALOGY:  ', 64, H - 72, { continued: true });
        doc.fillColor(palette.analogyText).font('Helvetica').fontSize(10).text(cleanAnalogy, { width: W - 130 });
      }

      // 6. Slide Number
      doc.fillColor(palette.numColor || '#888888').font('Helvetica').fontSize(10).text(String(slide.slideNumber || idx + 1), W - 80, H - 34, { align: 'right' });
    });

    doc.end();
    stream.on('finish', () => res({ filePath, fileName, fileSize: fs.statSync(filePath).size }));
    stream.on('error', rej);
  });
}

module.exports = { notesPDF, handwrittenPDF, questionPaperPDF, slidePDF };
