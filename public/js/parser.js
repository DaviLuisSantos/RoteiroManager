// ── ROTEIRO MARKDOWN PARSER ──────────────────────────────────────
const SECTION_COLORS = [
  'badge-gray','badge-amber','badge-blue','badge-pink',
  'badge-coral','badge-purple','badge-green','badge-teal','badge-red'
];
const KNOWN_BADGES = {
  'hook':       'badge-gray',
  'abertura':   'badge-gray',
  'bloco 1':    'badge-amber',
  'bloco 2':    'badge-blue',
  'bloco 3':    'badge-pink',
  'bloco 4':    'badge-coral',
  'bloco 5':    'badge-purple',
  'bloco 6':    'badge-green',
  'âncora':     'badge-coral',
  'ancora':     'badge-coral',
  'fechamento': 'badge-purple',
  'cta':        'badge-green',
};

function getBadgeColor(title, idx) {
  const lower = title.toLowerCase();
  for (const [k, v] of Object.entries(KNOWN_BADGES)) {
    if (lower.startsWith(k)) return v;
  }
  return SECTION_COLORS[idx % SECTION_COLORS.length];
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function inline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

function inlineEsc(s) { return inline(s); }

function stripEmoji(s) {
  return s.replace(/[\u{1F000}-\u{1FFFF}]|[☀-➿]|[\uD83C-􏰀-\uDFFF]/gu, '').trim();
}

function isNote(s) { return !s.startsWith('"') && !s.startsWith('“') && s.length < 220; }

function renderBlockquote(bqLines, insidePoint) {
  const paras = [];
  let cur = [];
  for (const l of bqLines) {
    if (!l.trim()) { if (cur.length) { paras.push(cur.join(' ')); cur = []; } }
    else cur.push(l.trim());
  }
  if (cur.length) paras.push(cur.join(' '));
  if (!paras.length) return '';

  if (/^\*\*[^*]+\*\*/.test(paras[0])) {
    const labelMatch = paras[0].match(/^\*\*(.+?)\*\*\s*(.*)/);
    if (labelMatch) {
      const label = labelMatch[1].toLowerCase();
      const rest0 = labelMatch[2];
      const rest = [rest0, ...paras.slice(1)].filter(Boolean);
      const isCta   = label.includes('câmera') || label.includes('camera') || label.includes('cta') || label.includes('olha');
      const isAncora = label.includes('voz') || label.includes('pessoal') || label.includes('direto') || label.includes('fala');
      if (isCta)    return `<div class="cta-box"><div class="cta-label">${esc(labelMatch[1])}</div>${rest.map(p=>`<p>${inlineEsc(p)}</p>`).join('')}</div>`;
      if (isAncora) return `<div class="ancora"><div class="ancora-label">${esc(labelMatch[1])}</div>${rest.map(p=>`<p>${inlineEsc(p)}</p>`).join('')}</div>`;
      return `<div class="hook-box"><div class="hook-label">${esc(labelMatch[1])}</div>${rest.map(p=>`<p>${inlineEsc(p)}</p>`).join('')}</div>`;
    }
  }

  const last = paras[paras.length - 1];
  const isQuote = last.startsWith('—') || last.startsWith('–') || last.startsWith('-');
  if (isQuote && paras.length >= 2) {
    const quoteText = paras.slice(0, -1).join(' ').replace(/^[""]/, '').replace(/[""]$/, '');
    const attr = last.replace(/^[—–-]\s*/, '');
    return `<div class="quote-block"><p>"${inlineEsc(quoteText)}"</p><span>${esc(attr)}</span></div>`;
  }

  const allNote = paras.every(p => isNote(p) && !p.startsWith('"'));
  if (allNote && !insidePoint) {
    return paras.map(p => `<p class="point-note" style="margin:10px 0 10px 10px;border-left:2px solid #2a2a2a;padding-left:10px;">${inlineEsc(p)}</p>`).join('');
  }

  return `<div class="hook-box"><div class="hook-label">fala</div>${paras.map(p=>`<p>${inlineEsc(p)}</p>`).join('')}</div>`;
}

function parseRoteiro(md) {
  const lines = md.split('\n');
  let html = '';
  let sectionIdx = 0;
  let i = 0;
  let inSection = false;
  let inPoints = false;

  function closePoints() {
    if (inPoints) { html += '</div>'; inPoints = false; }
  }
  function closeSection() {
    closePoints();
    if (inSection) { html += '</div>'; inSection = false; }
  }

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trimEnd();

    if (/^# /.test(line)) {
      closeSection();
      const title = stripEmoji(line.slice(2).trim());
      html += `<div class="doc-title"><span>${esc(title)}</span></div>`;
      i++; continue;
    }

    if (/^---+$/.test(line.trim())) {
      closeSection();
      if (inSection || sectionIdx > 0) html += '<hr class="divider">';
      i++; continue;
    }

    if (/^## /.test(line)) {
      closeSection();
      const raw2 = stripEmoji(line.slice(3).trim());
      const sep = raw2.match(/^(.+?)\s[—–-]\s(.+)$/);
      let badge = '', title = '';
      if (sep) { badge = sep[1].trim(); title = sep[2].trim(); }
      else { badge = raw2; title = ''; }
      const color = getBadgeColor(badge, sectionIdx++);
      html += `<div class="section"><div class="section-header">`;
      html += `<span class="badge ${color}">${esc(badge)}</span>`;
      if (title) html += `<span class="section-title">${esc(title)}</span>`;
      html += `</div>`;
      inSection = true;
      i++; continue;
    }

    if (/^\d+\. /.test(line)) {
      if (!inPoints) { html += '<div class="points">'; inPoints = true; }
      const num = line.match(/^(\d+)\. /)[1];
      const text = line.replace(/^\d+\. /, '');
      html += `<div class="point"><span class="point-num">${num}</span><div class="point-body">`;
      html += `<p class="point-text">${inline(text)}</p>`;
      i++;
      while (i < lines.length) {
        const next = lines[i].trimEnd();
        if (!next.trim()) { i++; continue; }
        if (/^> /.test(next) || /^>$/.test(next)) {
          const bqLines = [];
          while (i < lines.length && (/^>/.test(lines[i]) || !lines[i].trim())) {
            if (!lines[i].trim()) { i++; break; }
            bqLines.push(lines[i].replace(/^>\s?/, ''));
            i++;
          }
          html += renderBlockquote(bqLines, true);
          continue;
        }
        if (/^\*[^*]/.test(next) && next.endsWith('*')) {
          html += `<p class="point-note">${inline(next.slice(1,-1))}</p>`;
          i++; continue;
        }
        if (/^\*\*[^*]+\*\*:?/.test(next)) {
          const lm = next.match(/^\*\*(.+?)\*\*:?\s*(.*)/);
          if (lm) {
            html += `<div class="ret-box"><div class="ret-label">${esc(lm[1])}</div><p>${inline(lm[2])}</p></div>`;
            i++; continue;
          }
        }
        break;
      }
      html += `</div></div>`;
      continue;
    }

    if (/^>/.test(line)) {
      closePoints();
      const bqLines = [];
      while (i < lines.length && (/^>/.test(lines[i]) || !lines[i].trim())) {
        if (!lines[i].trim()) { i++; break; }
        bqLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      html += renderBlockquote(bqLines, false);
      continue;
    }

    if (/^\*[^*]/.test(line) && line.trimEnd().endsWith('*')) {
      closePoints();
      html += `<p class="point-note" style="margin:10px 0 10px 10px;border-left:2px solid #2a2a2a;padding-left:10px;">${inline(line.slice(1,-1))}</p>`;
      i++; continue;
    }

    if (line.trim()) {
      closePoints();
      html += `<p style="margin:0.75rem 0;color:var(--text);">${inline(line.trim())}</p>`;
    }
    i++;
  }

  closeSection();
  return html;
}

// ── TELEPROMPTER HTML BUILDER ─────────────────────────────────────
// Converte MD em HTML estilizado para o teleprompter:
//   • Títulos (H1/H2) → badges pequenos e coloridos, claramente "não leia"
//   • Notas de direção (*texto*) → muito discretas / quase invisíveis
//   • Texto falado (pontos numerados, blockquotes) → grande e branco

function renderTpBlockquote(bqLines) {
  const paras = [];
  let cur = [];
  for (const l of bqLines) {
    if (!l.trim()) { if (cur.length) { paras.push(cur.join(' ')); cur = []; } }
    else cur.push(l.trim());
  }
  if (cur.length) paras.push(cur.join(' '));
  if (!paras.length) return '';

  let out = '';

  // **Label** no início → label é marcador "não leia", resto é texto falado
  if (/^\*\*[^*]+\*\*/.test(paras[0])) {
    const lm = paras[0].match(/^\*\*(.+?)\*\*\s*(.*)/);
    if (lm) {
      out += `<p class="tp-label">${esc(lm[1])}</p>`;
      const rest = [lm[2], ...paras.slice(1)].filter(Boolean);
      for (const p of rest) out += `<p class="tp-spoken">${inlineEsc(p)}</p>`;
      return out;
    }
  }

  // Linha de atribuição (— Autor) → discreta
  const last = paras[paras.length - 1];
  const hasAttr = /^[—–-]/.test(last);
  const quoteParas = hasAttr ? paras.slice(0, -1) : paras;
  for (const p of quoteParas) out += `<p class="tp-spoken">${inlineEsc(p)}</p>`;
  if (hasAttr) out += `<p class="tp-attr">${esc(last.replace(/^[—–-]\s*/, '— '))}</p>`;
  return out;
}

function buildTeleprompterHtml(md) {
  const lines = md.split('\n');
  let html = '';
  let sectionIdx = 0;
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trimEnd();

    // H1: título do documento — pequeno e muted
    if (/^# /.test(line)) {
      const title = stripEmoji(line.slice(2).trim());
      html += `<div class="tp-doc-title">${esc(title)}</div>`;
      i++; continue;
    }

    // Divisor ---
    if (/^---+$/.test(line.trim())) {
      html += '<div class="tp-divider"></div>';
      i++; continue;
    }

    // H2: badge de seção — igual ao visualizador mas centralizado
    if (/^## /.test(line)) {
      const raw2 = stripEmoji(line.slice(3).trim());
      const sep = raw2.match(/^(.+?)\s[—–-]\s(.+)$/);
      let badge = '', title = '';
      if (sep) { badge = sep[1].trim(); title = sep[2].trim(); }
      else { badge = raw2; title = ''; }
      const color = getBadgeColor(badge, sectionIdx++);
      html += `<div class="tp-section-head">`;
      html += `<span class="badge ${color}">${esc(badge)}</span>`;
      if (title) html += `<span class="tp-section-title">${esc(title)}</span>`;
      html += `</div>`;
      i++; continue;
    }

    // Ponto numerado: texto falado principal
    if (/^\d+\. /.test(line)) {
      const text = line.replace(/^\d+\. /, '');
      html += `<p class="tp-spoken">${inline(text)}</p>`;
      i++;
      // Sub-conteúdo do ponto (blockquotes, notas, ret-boxes)
      while (i < lines.length) {
        const next = lines[i].trimEnd();
        if (!next.trim()) { i++; continue; }
        if (/^> /.test(next) || /^>$/.test(next)) {
          const bqLines = [];
          while (i < lines.length && (/^>/.test(lines[i]) || !lines[i].trim())) {
            if (!lines[i].trim()) { i++; break; }
            bqLines.push(lines[i].replace(/^>\s?/, ''));
            i++;
          }
          html += renderTpBlockquote(bqLines);
          continue;
        }
        if (/^\*[^*]/.test(next) && next.endsWith('*')) {
          html += `<p class="tp-note">${esc(next.slice(1, -1))}</p>`;
          i++; continue;
        }
        if (/^\*\*[^*]+\*\*:?/.test(next)) {
          const lm = next.match(/^\*\*(.+?)\*\*:?\s*(.*)/);
          if (lm) {
            html += `<p class="tp-label">${esc(lm[1])}</p>`;
            if (lm[2]) html += `<p class="tp-spoken">${inline(lm[2])}</p>`;
            i++; continue;
          }
        }
        break;
      }
      continue;
    }

    // Blockquote fora de pontos
    if (/^>/.test(line)) {
      const bqLines = [];
      while (i < lines.length && (/^>/.test(lines[i]) || !lines[i].trim())) {
        if (!lines[i].trim()) { i++; break; }
        bqLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      html += renderTpBlockquote(bqLines);
      continue;
    }

    // Nota de direção (*itálico*): muito discreta
    if (/^\*[^*]/.test(line) && line.trimEnd().endsWith('*')) {
      html += `<p class="tp-note">${esc(line.slice(1, -1))}</p>`;
      i++; continue;
    }

    // Parágrafo comum
    if (line.trim()) {
      html += `<p class="tp-spoken">${inline(line.trim())}</p>`;
    }
    i++;
  }

  return html;
}
