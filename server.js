const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const ROTEIROS_DIR = path.join(__dirname, 'roteiros');

// Ensure roteiros directory exists
if (!fs.existsSync(ROTEIROS_DIR)) fs.mkdirSync(ROTEIROS_DIR, { recursive: true });

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── LIST all .md files ──────────────────────────────────────────────
app.get('/api/roteiros', (req, res) => {
  try {
    const files = fs.readdirSync(ROTEIROS_DIR)
      .filter(f => f.match(/\.md$/i))
      .map(f => {
        const stat = fs.statSync(path.join(ROTEIROS_DIR, f));
        return {
          name: f,
          modified: stat.mtime.toISOString(),
          size: stat.size
        };
      })
      .sort((a, b) => new Date(b.modified) - new Date(a.modified));
    res.json(files);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── READ a roteiro ──────────────────────────────────────────────────
app.get('/api/roteiros/:name', (req, res) => {
  const file = path.join(ROTEIROS_DIR, path.basename(req.params.name));
  if (!file.startsWith(ROTEIROS_DIR)) return res.status(403).json({ error: 'Forbidden' });
  try {
    const content = fs.readFileSync(file, 'utf8');
    res.json({ name: req.params.name, content });
  } catch (e) {
    res.status(404).json({ error: 'Roteiro não encontrado' });
  }
});

// ── SAVE / CREATE a roteiro ─────────────────────────────────────────
app.put('/api/roteiros/:name', (req, res) => {
  const file = path.join(ROTEIROS_DIR, path.basename(req.params.name));
  if (!file.startsWith(ROTEIROS_DIR)) return res.status(403).json({ error: 'Forbidden' });
  try {
    fs.writeFileSync(file, req.body.content, 'utf8');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE a roteiro ────────────────────────────────────────────────
app.delete('/api/roteiros/:name', (req, res) => {
  const file = path.join(ROTEIROS_DIR, path.basename(req.params.name));
  if (!file.startsWith(ROTEIROS_DIR)) return res.status(403).json({ error: 'Forbidden' });
  try {
    fs.unlinkSync(file);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── RENAME a roteiro ────────────────────────────────────────────────
app.post('/api/roteiros/:name/rename', (req, res) => {
  const from = path.join(ROTEIROS_DIR, path.basename(req.params.name));
  const to   = path.join(ROTEIROS_DIR, path.basename(req.body.newName));
  if (!from.startsWith(ROTEIROS_DIR) || !to.startsWith(ROTEIROS_DIR))
    return res.status(403).json({ error: 'Forbidden' });
  try {
    fs.renameSync(from, to);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── DUPLICATE a roteiro ─────────────────────────────────────────────
app.post('/api/roteiros/:name/duplicate', (req, res) => {
  const src = path.join(ROTEIROS_DIR, path.basename(req.params.name));
  if (!src.startsWith(ROTEIROS_DIR)) return res.status(403).json({ error: 'Forbidden' });
  try {
    const content = fs.readFileSync(src, 'utf8');
    const base = path.basename(req.params.name).replace(/\.md$/i, '');
    let newName = base + '_copia.md';
    let counter = 1;
    while (fs.existsSync(path.join(ROTEIROS_DIR, newName))) {
      newName = base + `_copia_${++counter}.md`;
    }
    fs.writeFileSync(path.join(ROTEIROS_DIR, newName), content, 'utf8');
    res.json({ ok: true, name: newName });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── SEARCH roteiros (name + content) ────────────────────────────────
app.get('/api/search', (req, res) => {
  const q = (req.query.q || '').toLowerCase().trim();
  if (!q || q.length < 2) return res.json([]);
  try {
    const files = fs.readdirSync(ROTEIROS_DIR).filter(f => f.match(/\.md$/i));
    const results = [];
    for (const file of files) {
      const filePath = path.join(ROTEIROS_DIR, file);
      const content  = fs.readFileSync(filePath, 'utf8');
      const stat     = fs.statSync(filePath);
      const nameMatch    = file.toLowerCase().includes(q);
      const contentMatch = content.toLowerCase().includes(q);
      if (!nameMatch && !contentMatch) continue;

      let preview = '';
      if (contentMatch && !nameMatch) {
        const idx   = content.toLowerCase().indexOf(q);
        const start = Math.max(0, idx - 40);
        const end   = Math.min(content.length, idx + q.length + 60);
        preview = (start > 0 ? '…' : '') +
          content.slice(start, end).replace(/[\n\r]+/g, ' ').trim() +
          (end < content.length ? '…' : '');
      }
      results.push({ name: file, modified: stat.mtime.toISOString(), size: stat.size, preview, nameMatch, contentMatch });
    }
    results.sort((a, b) => new Date(b.modified) - new Date(a.modified));
    res.json(results);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🎬 Roteiro Manager rodando em http://localhost:${PORT}\n`);
});
