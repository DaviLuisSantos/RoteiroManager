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

app.listen(PORT, () => {
  console.log(`\n🎬 Roteiro Manager rodando em http://localhost:${PORT}\n`);
});
