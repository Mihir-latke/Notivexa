const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const OUT = path.join(__dirname, '../uploads/generated');
const ensureDir = () => fs.mkdirSync(OUT, { recursive: true });

// ── Standard Notes PDF ────────────────────────────────────
async function notesPDF(content, { title='Notes', subject='General', imagePaths=[] }={}) {
  ensureDir();
  const fileName = `notes_${uuidv4()}.pdf`;
  const filePath = path.join(OUT, fileName);
  return new Promise((res, rej) => {
    const doc = new PDFDocument({ size:'A4', margins:{top:65,bottom:60,left:70,right:60} });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);
    const W = doc.page.width;
    // Header bar
    doc.rect(0,0,W,72).fill('#4F46E5');
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(18).text(title,70,18,{width:W-140});
    doc.fontSize(11).font('Helvetica').text(`${subject} | Notivexa AI`,70,50);
    // Content
    doc.fillColor('#0F0E1A').font('Helvetica').fontSize(11.5)
       .text(content, 70, 90, { width:W-130, lineGap:3, paragraphGap:6 });

    // Embed authentic diagrams from source document if available
    const validImages = Array.isArray(imagePaths) ? imagePaths.filter(p => fs.existsSync(p)) : [];
    if (validImages.length > 0) {
      doc.addPage();
      const H = doc.page.height;
      doc.rect(0, 0, W, 72).fill('#4F46E5');
      doc.fillColor('#fff').font('Helvetica-Bold').fontSize(18).text(`${title} — Figures & Diagrams`, 70, 18, { width: W - 140 });
      doc.fontSize(11).font('Helvetica').text(`Diagrams extracted directly from source document | Notivexa`, 70, 50);

      let curY = 95;
      validImages.forEach((imgP, idx) => {
        if (curY + 230 > H - 60) {
          doc.addPage();
          curY = 65;
        }
        doc.fillColor('#4338CA').font('Helvetica-Bold').fontSize(11)
           .text(`Figure ${idx + 1}: Extracted from uploaded document`, 70, curY);
        curY += 18;
        try {
          doc.image(imgP, 70, curY, { fit: [W - 140, 200], align: 'center' });
          curY += 215;
        } catch (e) {
          console.warn('[notesPDF image embed]', e.message);
        }
      });
    }

    // Footer
    const range = doc.bufferedPageRange();
    for(let i=0;i<range.count;i++){
      doc.switchToPage(range.start+i);
      doc.fillColor('#9CA3AF').fontSize(9).text(`Page ${i+1} | ${title} | Notivexa`, 0, doc.page.height-28, {align:'center'});
    }
    doc.end();
    stream.on('finish', () => res({ filePath, fileName, fileSize:fs.statSync(filePath).size }));
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
    const pendingImages = Array.isArray(imagePaths) ? [...imagePaths].filter(p => fs.existsSync(p)) : [];
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
        data = {
          institution: institution || "Mahatma Education Society's",
          college: "Pillai HOC College of Engineering and Technology, Rasayani.",
          status: "(Autonomous)",
          department: "Department of Computer Application",
          examType: totalMarks <= 25 ? "Internal Assessment- I OSAY 2026-2027" : "End Semester Examination",
          subject: subject || title || "Big Data Analytics and Visualization",
          class: "SY-MCA",
          date: "22/8/2026",
          time: totalMarks <= 25 ? "10.30am - 11.30am" : "10.30am - 12.30pm",
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
    let y = 32;

    // Centered College Header (Times / Helvetica-Bold)
    doc.font('Helvetica').fontSize(10).text(data.institution || "Mahatma Education Society's", 36, y, { width: 523, align: 'center' });
    y += 14;
    doc.font('Helvetica-Bold').fontSize(11.5).text(data.college || "Pillai HOC College of Engineering and Technology, Rasayani.", 36, y, { width: 523, align: 'center' });
    y += 15;
    doc.font('Helvetica-Bold').fontSize(9.5).text(data.status || "(Autonomous)", 36, y, { width: 523, align: 'center' });
    y += 13;
    doc.font('Helvetica-Bold').fontSize(9.5).text(data.department || "Department of Computer Application", 36, y, { width: 523, align: 'center' });
    y += 13;
    doc.font('Helvetica-Bold').fontSize(9.5).text(data.examType || "Internal Assessment- I OSAY 2026-2027", 36, y, { width: 523, align: 'center' });
    y += 18;

    // Metadata Row 1
    doc.font('Helvetica-Bold').fontSize(9);
    doc.text(`Subject: ${data.subject || subject || 'Big Data Analytics and Visualization'}`, 36, y, { width: 340, lineBreak: false });
    doc.text(`Class: ${data.class || 'SY-MCA'}`, 380, y, { width: 179, align: 'right', lineBreak: false });
    y += 14;

    // Metadata Row 2
    doc.text(`Date: ${data.date || '22/8/2026'}`, 36, y, { width: 120, lineBreak: false });
    doc.text(`Time: ${data.time || '10.30am - 11.30am'}`, 160, y, { width: 190, align: 'center', lineBreak: false });
    doc.text(`Duration: ${data.duration || timeHours + 'Hr'}   Marks: ${data.marks || totalMarks}`, 360, y, { width: 199, align: 'right', lineBreak: false });
    y += 16;

    // Exact Grid Coordinates (width 523 pt)
    const x0 = 36;
    const x1 = 68;  // Col 1 width = 32 (ID)
    const x2 = 439; // Col 2 width = 371 (Question)
    const x3 = 479; // Col 3 width = 40 (Marks)
    const x4 = 519; // Col 4 width = 40 (CO)
    const x5 = 559; // Col 5 width = 40 (BL)

    const drawHLine = (curY) => doc.moveTo(x0, curY).lineTo(x5, curY).lineWidth(0.8).strokeColor('#000').stroke();

    // ── Table Top Row: Note & Headers ──
    const row0H = 26;
    drawHLine(y);
    doc.font('Helvetica-Bold').fontSize(8.5).text(data.note || 'Note: Assume suitable data wherever necessary.', x0 + 6, y + 8, { width: x3 - x0 - 12 });
    doc.font('Helvetica-Bold').fontSize(8).text('Course\nOutcome', x3, y + 4, { width: 40, align: 'center' });
    doc.font('Helvetica-Bold').fontSize(8).text("Bloom's\nLevel", x4, y + 4, { width: 40, align: 'center' });

    doc.moveTo(x0, y).lineTo(x0, y + row0H).stroke();
    doc.moveTo(x3, y).lineTo(x3, y + row0H).stroke();
    doc.moveTo(x4, y).lineTo(x4, y + row0H).stroke();
    doc.moveTo(x5, y).lineTo(x5, y + row0H).stroke();
    y += row0H;
    drawHLine(y);

    // ── Render Sections & Questions ──
    const sections = Array.isArray(data.sections) ? data.sections : [];
    sections.forEach(sec => {
      // Section header row: [ 1 ] | Attempt Any Five out of Six | CO | BL
      const secH = 20;
      if (y + secH > doc.page.height - 36) {
        doc.addPage();
        y = 36;
        drawHLine(y);
      }

      doc.font('Helvetica-Bold').fontSize(9).text(`[ ${sec.qNum} ]`, x0, y + 5, { width: 32, align: 'center' });
      doc.font('Helvetica-Bold').fontSize(9).text(sec.instruction || 'Attempt Any Five out of Six', x1 + 6, y + 5, { width: x3 - x1 - 12 });
      doc.font('Helvetica-Bold').fontSize(8.5).text('CO', x3, y + 5, { width: 40, align: 'center' });
      doc.font('Helvetica-Bold').fontSize(8.5).text('BL', x4, y + 5, { width: 40, align: 'center' });

      doc.moveTo(x0, y).lineTo(x0, y + secH).stroke();
      doc.moveTo(x1, y).lineTo(x1, y + secH).stroke();
      doc.moveTo(x3, y).lineTo(x3, y + secH).stroke();
      doc.moveTo(x4, y).lineTo(x4, y + secH).stroke();
      doc.moveTo(x5, y).lineTo(x5, y + secH).stroke();
      y += secH;
      drawHLine(y);

      // Question sub-rows: A. | Question text | [ 02 ] | CO3 | L2
      const questions = Array.isArray(sec.questions) ? sec.questions : [];
      questions.forEach(q => {
        doc.font('Helvetica').fontSize(8.5);
        const textH = doc.heightOfString(q.text || '', { width: x2 - x1 - 12, lineGap: 1.5 });
        const qRowH = Math.max(textH + 10, 20);

        if (y + qRowH > doc.page.height - 36) {
          doc.addPage();
          y = 36;
          drawHLine(y);
        }

        doc.font('Helvetica-Bold').fontSize(8.5).text(q.id || '', x0, y + 5, { width: 32, align: 'center' });
        doc.font('Helvetica').fontSize(8.5).text(q.text || '', x1 + 6, y + 5, { width: x2 - x1 - 12, lineGap: 1.5 });
        doc.font('Helvetica-Bold').fontSize(8.5).text(q.marks || '', x2, y + 5, { width: 40, align: 'center' });
        doc.font('Helvetica').fontSize(8.5).text(q.co || '', x3, y + 5, { width: 40, align: 'center' });
        doc.font('Helvetica').fontSize(8.5).text(q.bl || '', x4, y + 5, { width: 40, align: 'center' });

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

    doc.end();
    stream.on('finish', () => res({ filePath, fileName, fileSize: fs.statSync(filePath).size }));
    stream.on('error', rej);
  });
}

const THEME_PDF_PALETTES = {
  indigo: { bg: '#0F172A', header: '#4F46E5', text: '#E2E8F0', title: '#FFFFFF', accent: '#818CF8', notesBg: '#1E293B', notesText: '#94A3B8' },
  light:   { bg: '#F8FAFC', header: '#2563EB', text: '#334155', title: '#FFFFFF', accent: '#2563EB', notesBg: '#F1F5F9', notesText: '#64748B' },
  emerald: { bg: '#064E3B', header: '#059669', text: '#D1FAE5', title: '#FFFFFF', accent: '#34D399', notesBg: '#065F46', notesText: '#A7F3D0' },
  sunset:  { bg: '#4C0519', header: '#E11D48', text: '#FFE4E6', title: '#FFFFFF', accent: '#FB7185', notesBg: '#881337', notesText: '#FECDD3' },
  cyber:   { bg: '#180828', header: '#9333EA', text: '#F3E8FF', title: '#FFFFFF', accent: '#C084FC', notesBg: '#2E1065', notesText: '#E9D5FF' },
};

// ── Slide Deck PDF ────────────────────────────────────────
async function slidePDF(data, { title='Presentation', theme='indigo' }={}) {
  ensureDir();
  const slides = (typeof data==='string'?JSON.parse(data):data)?.slides || (Array.isArray(data) ? data : []);
  if(slides.length===0) throw new Error('No slides to generate');
  const palette = THEME_PDF_PALETTES[theme] || THEME_PDF_PALETTES.indigo;
  const fileName = `ppt_${uuidv4()}.pdf`;
  const filePath = path.join(OUT, fileName);
  return new Promise((res, rej) => {
    const doc = new PDFDocument({ size:'A4', layout:'landscape', margins:{top:40,bottom:40,left:50,right:50} });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);
    const W=doc.page.width, H=doc.page.height;
    slides.forEach((slide, idx) => {
      if(idx>0) doc.addPage();
      doc.rect(0,0,W,H).fill(palette.bg);
      doc.rect(0,0,W,72).fill(palette.header);
      doc.fillColor('rgba(255,255,255,0.45)').fontSize(10).text(`${slide.slideNumber||idx+1}/${slides.length}`,W-65,12);
      doc.fillColor(palette.title).font('Helvetica-Bold').fontSize(20).text(slide.title||'',50,18,{width:W-120});
      let y=92;
      (slide.bullets||[]).forEach(b=>{
        doc.fillColor(palette.accent).fontSize(13).text('▶',50,y);
        doc.fillColor(palette.text).font('Helvetica').text(b.slice(0,115),68,y,{width:W-125});
        y+=Math.max(28,doc.heightOfString(b,{width:W-125})+9);
      });
      if(slide.speakerNotes){
        doc.rect(0,H-52,W,52).fill(palette.notesBg);
        doc.fillColor(palette.notesText).font('Helvetica').fontSize(9).text(`Notes: ${slide.speakerNotes}`,50,H-44,{width:W-100});
      }
    });
    doc.end();
    stream.on('finish', () => res({ filePath, fileName, fileSize:fs.statSync(filePath).size }));
    stream.on('error', rej);
  });
}

module.exports = { notesPDF, handwrittenPDF, questionPaperPDF, slidePDF };
