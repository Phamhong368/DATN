function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatCell(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value ?? '';
}

function buildRows(columns, rows) {
  const header = columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('');
  const body = rows
    .map((row) => {
      const cells = columns.map((column) => `<td>${escapeHtml(formatCell(row[column.key]))}</td>`).join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  return `<thead><tr>${header}</tr></thead><tbody>${body}</tbody>`;
}

export function buildExcelHtml({ title, columns, rows }) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      body { font-family: Arial, sans-serif; }
      h1 { font-size: 20px; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #999; padding: 6px 8px; text-align: left; }
      th { background: #eaf2ff; font-weight: 700; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(title)}</h1>
    <p>Exported at: ${new Date().toISOString()}</p>
    <table>${buildRows(columns, rows)}</table>
  </body>
</html>`;
}

function pdfEscape(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7E]/g, '?');
}

function wrapLine(line, maxLength = 92) {
  const normalized = String(line ?? '').replace(/\s+/g, ' ').trim();
  const chunks = [];
  for (let index = 0; index < normalized.length; index += maxLength) {
    chunks.push(normalized.slice(index, index + maxLength));
  }
  return chunks.length ? chunks : [''];
}

export function buildSimplePdf({ title, columns, rows }) {
  const lines = [
    title,
    `Exported at: ${new Date().toISOString()}`,
    '',
    columns.map((column) => column.label).join(' | '),
    '-'.repeat(90)
  ];

  for (const row of rows.slice(0, 250)) {
    const line = columns.map((column) => formatCell(row[column.key])).join(' | ');
    lines.push(...wrapLine(line));
  }

  if (rows.length > 250) {
    lines.push(`... truncated ${rows.length - 250} rows`);
  }

  const content = ['BT', '/F1 10 Tf', '50 790 Td'];
  lines.forEach((line, index) => {
    if (index > 0) {
      content.push('0 -14 Td');
    }
    content.push(`(${pdfEscape(line)}) Tj`);
  });
  content.push('ET');

  const stream = content.join('\n');
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    `5 0 obj << /Length ${Buffer.byteLength(stream)} >> stream\n${stream}\nendstream endobj`
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${object}\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, 'binary');
}
