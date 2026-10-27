const fs = require('fs');
const JSZip = require('jszip');

async function extractDocxText(filePathOrBuffer) {
  const buf = Buffer.isBuffer(filePathOrBuffer) ? filePathOrBuffer : fs.readFileSync(filePathOrBuffer);
  const zip = await JSZip.loadAsync(buf);
  const docXmlFile = zip.file('word/document.xml');
  if (!docXmlFile) {
    throw new Error('Invalid DOCX: missing word/document.xml');
  }

  const xml = await docXmlFile.async('string');

  const bodyMatch = /<w:body(?:\s+[^>]*)?>([\s\S]*?)<\/w:body>/.exec(xml);
  let contentXml = bodyMatch ? bodyMatch[1] : xml;

  // Extract and format tables <w:tbl> ... </w:tbl> first to avoid mixing cell paragraphs with body
  const tblRegex = /<w:tbl(?:\s+[^>]*)?>([\s\S]*?)<\/w:tbl>/g;
  const tables = [];
  const tableMarkdownBlocks = [];

  let tblMatch;
  while ((tblMatch = tblRegex.exec(contentXml)) !== null) {
    const tblContent = tblMatch[1];
    const rowRegex = /<w:tr(?:\s+[^>]*)?>([\s\S]*?)<\/w:tr>/g;
    let rowMatch;
    const tableData = [];

    while ((rowMatch = rowRegex.exec(tblContent)) !== null) {
      const rowContent = rowMatch[1];
      const cellRegex = /<w:tc(?:\s+[^>]*)?>([\s\S]*?)<\/w:tc>/g;
      let cellMatch;
      const rowCells = [];

      while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
        const cellContent = cellMatch[1];
        const tRegex = /<w:t(?:\s+[^>]*)?>([^<]*)<\/w:t>/g;
        let cText = '';
        let tMatch;
        while ((tMatch = tRegex.exec(cellContent)) !== null) {
          cText += tMatch[1];
        }
        rowCells.push(cText.trim());
      }
      if (rowCells.length > 0) tableData.push(rowCells);
    }

    if (tableData.length > 0) {
      tables.push(tableData);
      const header = tableData[0];
      const mdRows = [];
      mdRows.push(`| ${header.join(' | ')} |`);
      mdRows.push(`| ${header.map(() => '---').join(' | ')} |`);
      for (let r = 1; r < tableData.length; r++) {
        mdRows.push(`| ${tableData[r].join(' | ')} |`);
      }
      tableMarkdownBlocks.push(mdRows.join('\n'));
    } else {
      tableMarkdownBlocks.push('');
    }
  }

  // Replace tables in content with token placeholders
  let tableIdx = 0;
  contentXml = contentXml.replace(/<w:tbl(?:\s+[^>]*)?>[\s\S]*?<\/w:tbl>/g, () => {
    return `<w:p><w:r><w:t>___DOCX_TABLE_${tableIdx++}___</w:t></w:r></w:p>`;
  });

  // Parse paragraphs <w:p>
  const paragraphs = [];
  const headings = [];
  const lines = [];

  const pRegex = /<w:p(?:\s+[^>]*)?>([\s\S]*?)<\/w:p>/g;
  let pMatch;

  while ((pMatch = pRegex.exec(contentXml)) !== null) {
    const pContent = pMatch[1];

    // Check heading style: e.g. <w:pStyle w:val="Heading1"/>
    const isHeading1 = /<w:pStyle\s+[^>]*w:val=["']Heading1["']/i.test(pContent);
    const isHeading2 = /<w:pStyle\s+[^>]*w:val=["']Heading2["']/i.test(pContent);
    const isHeading3 = /<w:pStyle\s+[^>]*w:val=["']Heading3["']/i.test(pContent);
    const isBullet = /<w:numPr>/i.test(pContent);

    // Extract all text inside <w:t ...>text</w:t>
    const tRegex = /<w:t(?:\s+[^>]*)?>([^<]*)<\/w:t>/g;
    let tMatch;
    let pText = '';
    while ((tMatch = tRegex.exec(pContent)) !== null) {
      pText += tMatch[1];
    }

    pText = pText.trim();
    if (!pText) continue;

    // Check if this paragraph is a table placeholder
    const tablePlaceholderMatch = pText.match(/^___DOCX_TABLE_(\d+)___$/);
    if (tablePlaceholderMatch) {
      const idx = parseInt(tablePlaceholderMatch[1], 10);
      const mdTable = tableMarkdownBlocks[idx];
      if (mdTable) {
        lines.push('');
        lines.push(mdTable);
        lines.push('');
      }
      continue;
    }

    if (isHeading1) {
      lines.push(`\n# ${pText}\n`);
      headings.push(pText);
    } else if (isHeading2) {
      lines.push(`\n## ${pText}\n`);
      headings.push(pText);
    } else if (isHeading3) {
      lines.push(`\n### ${pText}\n`);
      headings.push(pText);
    } else if (isBullet) {
      lines.push(`- ${pText}`);
    } else {
      lines.push(pText);
    }
    paragraphs.push(pText);
  }

  const fullText = lines.join('\n');
  const words = fullText.split(/\s+/).filter(Boolean).length;
  const estimatedPages = Math.max(1, Math.ceil(words / 400));

  return {
    text: fullText,
    paragraphs,
    headings,
    sections: headings.length > 0 ? headings : ['Document Overview'],
    tables,
    words,
    wordCount: words,
    pageCount: estimatedPages
  };
}

module.exports = {
  extractDocxText
};

