// ── STATE ─────────────────────────────────────────────────────────
const state = {
  roteiros: [],
  current: null,   // { name, content }
  activePanel: 'viewer',
  fontSize: 16,
  tp: {
    running: false,
    speed: 40,       // px/s
    pos: 0,
    raf: null,
    lastTs: null,
    fontSize: 36
  }
};

const FONT_SIZES = [13, 14, 16, 18, 20, 22, 24];
let fontIdx = 2;

// ── DOM REFS ──────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const sidebar       = $('sidebar');
const rotList       = $('roteiro-list');
const searchInput   = $('search-input');
const topbarTitle   = $('topbar-title');
const viewerPanel   = $('viewer-panel');
const viewerContent = $('viewer-content');
const tpPanel       = $('teleprompter-panel');
const tpTrack       = $('tp-track');
const tpText        = $('tp-text');
const editorPanel   = $('editor-panel');
const editorArea    = $('editor-area');
const editorFilename = $('editor-filename');
const emptyState    = $('empty-state');
const progress      = $('progress-bar');
const scrolltop     = $('scrolltop-btn');
const fsDisplay     = $('fs-display');
const toast         = $('toast');

// ── TOAST ─────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, type = '') {
  toast.textContent = msg;
  toast.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.className = 'toast', 2800);
}

// ── API ───────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(path, opts);
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || r.statusText); }
  return r.json();
}

// ── SIDEBAR LIST ──────────────────────────────────────────────────
async function loadList(selectName) {
  try {
    state.roteiros = await api('GET', '/api/roteiros');
  } catch (e) {
    showToast('Erro ao carregar lista: ' + e.message, 'error'); return;
  }
  renderList();
  if (selectName) {
    const found = state.roteiros.find(r => r.name === selectName);
    if (found) await openRoteiro(found.name);
  }
}

function renderList(filter) {
  const q = (filter ?? searchInput.value).toLowerCase();
  const items = q ? state.roteiros.filter(r => r.name.toLowerCase().includes(q)) : state.roteiros;

  if (!items.length) {
    rotList.innerHTML = `<div class="empty-list">${q ? 'Nenhum resultado.' : 'Pasta roteiros/ vazia.<br>Faça upload de um .md!'}</div>`;
    return;
  }

  rotList.innerHTML = items.map(r => {
    const display = r.name.replace(/\.md$/i,'').replace(/_/g,' ');
    const date = new Date(r.modified).toLocaleDateString('pt-BR', {day:'2-digit',month:'2-digit'});
    const active = state.current?.name === r.name ? 'active' : '';
    return `
      <div class="roteiro-item ${active}" data-name="${r.name}">
        <span class="roteiro-item-name" title="${r.name}">${display}</span>
        <span class="roteiro-item-date">${date}</span>
        <button class="roteiro-item-menu" data-menu="${r.name}" title="Opções">⋮</button>
      </div>`;
  }).join('');

  rotList.querySelectorAll('.roteiro-item').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.classList.contains('roteiro-item-menu')) return;
      openRoteiro(el.dataset.name);
    });
  });
  rotList.querySelectorAll('.roteiro-item-menu').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); showContextMenu(btn.dataset.menu, btn); });
  });
}

// ── CONTEXT MENU ─────────────────────────────────────────────────
let ctxMenu = null;
function showContextMenu(name, anchor) {
  removeContextMenu();
  const menu = document.createElement('div');
  menu.style.cssText = `position:fixed;background:#1e1e1e;border:1px solid #2a2a2a;border-radius:6px;padding:4px 0;z-index:800;min-width:140px;box-shadow:0 8px 24px rgba(0,0,0,0.5);`;
  const rect = anchor.getBoundingClientRect();
  menu.style.top  = (rect.bottom + 4) + 'px';
  menu.style.left = Math.max(8, rect.right - 140) + 'px';

  const items = [
    { label: '✎  Renomear', action: () => openRenameModal(name) },
    { label: '✕  Excluir',  action: () => openDeleteModal(name), danger: true },
  ];
  items.forEach(({ label, action, danger }) => {
    const div = document.createElement('div');
    div.textContent = label;
    div.style.cssText = `padding:7px 16px;font-size:12px;cursor:pointer;color:${danger ? '#c25a4a' : '#9a948c'};font-family:'DM Mono',monospace;`;
    div.addEventListener('mouseenter', () => div.style.background = '#2a2a2a');
    div.addEventListener('mouseleave', () => div.style.background = '');
    div.addEventListener('click', () => { removeContextMenu(); action(); });
    menu.appendChild(div);
  });

  document.body.appendChild(menu);
  ctxMenu = menu;
  setTimeout(() => document.addEventListener('click', removeContextMenu, { once: true }), 0);
}
function removeContextMenu() { ctxMenu?.remove(); ctxMenu = null; }

// ── MODALS ────────────────────────────────────────────────────────
function openRenameModal(name) {
  const display = name.replace(/\.md$/i,'');
  const overlay = $('modal-overlay');
  $('modal-title').textContent = 'Renomear roteiro';
  const inp = $('modal-input');
  inp.value = display;
  $('modal-confirm').textContent = 'Renomear';
  $('modal-confirm').className = 'modal-btn primary';
  overlay.classList.add('open');
  inp.focus(); inp.select();

  $('modal-confirm').onclick = async () => {
    const newName = inp.value.trim().replace(/\.md$/i,'') + '.md';
    if (!newName || newName === name) { overlay.classList.remove('open'); return; }
    try {
      await api('POST', `/api/roteiros/${name}/rename`, { newName });
      overlay.classList.remove('open');
      const wasCurrent = state.current?.name === name;
      await loadList();
      if (wasCurrent) await openRoteiro(newName);
      showToast('Renomeado com sucesso', 'success');
    } catch (e) { showToast(e.message, 'error'); }
  };
}

function openDeleteModal(name) {
  const display = name.replace(/\.md$/i,'');
  const overlay = $('modal-overlay');
  $('modal-title').textContent = `Excluir "${display}"?`;
  $('modal-input').style.display = 'none';
  $('modal-confirm').textContent = 'Excluir';
  $('modal-confirm').className = 'modal-btn danger';
  overlay.classList.add('open');

  $('modal-confirm').onclick = async () => {
    try {
      await api('DELETE', `/api/roteiros/${name}`);
      overlay.classList.remove('open');
      $('modal-input').style.display = '';
      if (state.current?.name === name) { state.current = null; showEmptyState(); }
      await loadList();
      showToast('Roteiro excluído', 'success');
    } catch (e) { showToast(e.message, 'error'); }
  };
}

$('modal-cancel').addEventListener('click', () => {
  $('modal-overlay').classList.remove('open');
  $('modal-input').style.display = '';
});
$('modal-overlay').addEventListener('click', e => {
  if (e.target === $('modal-overlay')) {
    $('modal-overlay').classList.remove('open');
    $('modal-input').style.display = '';
  }
});
$('modal-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') $('modal-confirm').click();
  if (e.key === 'Escape') $('modal-cancel').click();
});

// ── OPEN ROTEIRO ──────────────────────────────────────────────────
async function openRoteiro(name) {
  try {
    const data = await api('GET', `/api/roteiros/${name}`);
    state.current = data;
    const display = name.replace(/\.md$/i,'').replace(/_/g,' ');
    topbarTitle.textContent = display;
    renderList();
    renderViewer();
    if (state.activePanel !== 'viewer') switchPanel('viewer');
  } catch (e) {
    showToast('Erro ao abrir roteiro: ' + e.message, 'error');
  }
}

function showEmptyState() {
  topbarTitle.textContent = '—';
  emptyState.style.display = 'flex';
  viewerPanel.classList.remove('active');
  tpPanel.classList.remove('active');
  editorPanel.classList.remove('active');
}

// ── VIEWER ────────────────────────────────────────────────────────
function renderViewer() {
  if (!state.current) return;
  const html = parseRoteiro(state.current.content);
  viewerContent.innerHTML = html;
  viewerContent.style.fontSize = FONT_SIZES[fontIdx] + 'px';
  emptyState.style.display = 'none';
}

// ── PANELS ────────────────────────────────────────────────────────
function switchPanel(name) {
  state.activePanel = name;
  emptyState.style.display = 'none';

  viewerPanel.classList.toggle('active', name === 'viewer');
  tpPanel.classList.toggle('active', name === 'teleprompter');
  editorPanel.classList.toggle('active', name === 'editor');

  document.querySelectorAll('.tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.panel === name));

  if (name === 'teleprompter') initTeleprompter();
  if (name === 'editor')       initEditor();
  if (name === 'viewer')       renderViewer();
}

// ── FONT SIZE ─────────────────────────────────────────────────────
function changeFont(dir) {
  fontIdx = Math.max(0, Math.min(FONT_SIZES.length - 1, fontIdx + dir));
  fsDisplay.textContent = FONT_SIZES[fontIdx] + 'px';
  if (state.current) {
    viewerContent.style.fontSize = FONT_SIZES[fontIdx] + 'px';
  }
}

// ── TELEPROMPTER ──────────────────────────────────────────────────
function initTeleprompter() {
  if (!state.current) { switchPanel('viewer'); return; }
  tpText.innerHTML = buildTeleprompterHtml(state.current.content);
  tpText.style.fontSize = state.tp.fontSize + 'px';

  // Padding vertical = metade da altura do painel → primeiro texto começa no centro.
  // O painel já tem dimensões corretas aqui pois .active foi adicionado em switchPanel()
  // antes desta chamada. Acessar offsetHeight força o reflow imediato.
  const halfH = tpPanel.offsetHeight / 2;
  tpTrack.style.paddingTop    = halfH + 'px';
  tpTrack.style.paddingBottom = halfH + 'px';

  state.tp.pos = 0;
  tpTrack.style.transform = 'translateY(0)';
  if (state.tp.running) stopTeleprompter();
  updateTpBtn();
}

function updateTpBtn() {
  const btn = $('tp-play-btn');
  btn.textContent = state.tp.running ? '⏸ Pausar' : '▶ Iniciar';
  btn.className = state.tp.running ? 'tp-btn' : 'tp-btn primary';
}

function startTeleprompter() {
  state.tp.running = true;
  state.tp.lastTs = null;
  updateTpBtn();
  function tick(ts) {
    if (!state.tp.running) return;
    if (state.tp.lastTs !== null) {
      const dt = (ts - state.tp.lastTs) / 1000;
      state.tp.pos += state.tp.speed * dt;
      // maxScroll: percorre do início até o último texto ficar no centro
      // = altura total do track − altura do painel
      const maxScroll = Math.max(0, tpTrack.offsetHeight - tpPanel.offsetHeight);
      if (state.tp.pos >= maxScroll) {
        state.tp.pos = maxScroll;
        tpTrack.style.transform = `translateY(-${state.tp.pos}px)`;
        stopTeleprompter();
        return;
      }
      tpTrack.style.transform = `translateY(-${state.tp.pos}px)`;
    }
    state.tp.lastTs = ts;
    state.tp.raf = requestAnimationFrame(tick);
  }
  state.tp.raf = requestAnimationFrame(tick);
}

function stopTeleprompter() {
  state.tp.running = false;
  if (state.tp.raf) { cancelAnimationFrame(state.tp.raf); state.tp.raf = null; }
  updateTpBtn();
}

function resetTeleprompter() {
  stopTeleprompter();
  state.tp.pos = 0;
  tpTrack.style.transform = 'translateY(0)';
  updateTpBtn();
}

// ── EDITOR ────────────────────────────────────────────────────────
function initEditor() {
  if (!state.current) { switchPanel('viewer'); return; }
  editorArea.value = state.current.content;
  editorFilename.value = state.current.name.replace(/\.md$/i,'');
  $('editor-save-btn').className = 'editor-save-btn';
}

async function saveEditor() {
  if (!state.current) return;
  const content = editorArea.value;
  const rawName = editorFilename.value.trim();
  const newName = (rawName || state.current.name.replace(/\.md$/i,'')).replace(/\.md$/i,'') + '.md';
  const oldName = state.current.name;

  try {
    // Save content first
    await api('PUT', `/api/roteiros/${oldName}`, { content });
    // Rename if needed
    if (newName !== oldName) {
      await api('POST', `/api/roteiros/${oldName}/rename`, { newName });
    }
    state.current = { name: newName, content };
    await loadList();
    renderList();
    topbarTitle.textContent = newName.replace(/\.md$/i,'').replace(/_/g,' ');
    const btn = $('editor-save-btn');
    btn.textContent = '✓ Salvo';
    btn.className = 'editor-save-btn saved';
    setTimeout(() => { btn.textContent = 'Salvar'; btn.className = 'editor-save-btn'; }, 2000);
  } catch (e) {
    showToast('Erro ao salvar: ' + e.message, 'error');
  }
}

// Editor toolbar helpers
function wrapSelection(before, after) {
  const start = editorArea.selectionStart;
  const end   = editorArea.selectionEnd;
  const sel   = editorArea.value.slice(start, end);
  const replacement = before + sel + after;
  editorArea.setRangeText(replacement, start, end, 'select');
  editorArea.focus();
}

// ── UPLOAD ────────────────────────────────────────────────────────
async function handleUpload(file) {
  if (!file || !file.name.match(/\.md$/i)) { showToast('Envie um arquivo .md', 'error'); return; }
  const content = await file.text();
  const name = file.name;
  try {
    await api('PUT', `/api/roteiros/${name}`, { content });
    await loadList(name);
    showToast('Roteiro importado!', 'success');
  } catch (e) {
    showToast('Erro ao importar: ' + e.message, 'error');
  }
}

// ── NEW ROTEIRO ───────────────────────────────────────────────────
async function newRoteiro() {
  const name = 'novo_roteiro_' + Date.now() + '.md';
  const content = `# Novo Roteiro\n\n---\n\n## Hook — Título do hook\n\n> Fala de abertura aqui.\n\n---\n\n## Bloco 1 — Título\n\n1. Primeiro ponto.\n`;
  try {
    await api('PUT', `/api/roteiros/${name}`, { content });
    await loadList(name);
    switchPanel('editor');
    showToast('Novo roteiro criado!', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ── EXPORT PDF ────────────────────────────────────────────────────
function exportPdf() {
  if (!state.current) return;
  switchPanel('viewer');
  setTimeout(() => window.print(), 200);
}

// ── SCROLL / PROGRESS ────────────────────────────────────────────
viewerPanel.addEventListener('scroll', () => {
  const total = viewerPanel.scrollHeight - viewerPanel.clientHeight;
  progress.style.width = (total > 0 ? (viewerPanel.scrollTop / total) * 100 : 0) + '%';
  scrolltop.classList.toggle('visible', viewerPanel.scrollTop > 300);
});

scrolltop.addEventListener('click', () =>
  viewerPanel.scrollTo({ top: 0, behavior: 'smooth' }));

// ── SIDEBAR TOGGLE ────────────────────────────────────────────────
$('toggle-sidebar').addEventListener('click', () =>
  sidebar.classList.toggle('collapsed'));

// ── SEARCH ────────────────────────────────────────────────────────
searchInput.addEventListener('input', () => renderList(searchInput.value));

// ── TABS ──────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!state.current) return;
    switchPanel(btn.dataset.panel);
  });
});

// ── FONT CTRL ─────────────────────────────────────────────────────
$('font-down').addEventListener('click', () => changeFont(-1));
$('font-up').addEventListener('click',   () => changeFont(1));

// ── TELEPROMPTER CONTROLS ─────────────────────────────────────────
$('tp-play-btn').addEventListener('click', () => {
  if (state.tp.running) stopTeleprompter(); else startTeleprompter();
});
$('tp-reset-btn').addEventListener('click', resetTeleprompter);
$('tp-speed').addEventListener('input', e => { state.tp.speed = +e.target.value; });
$('tp-font-up').addEventListener('click', () => {
  state.tp.fontSize = Math.min(72, state.tp.fontSize + 4);
  tpText.style.fontSize = state.tp.fontSize + 'px';
});
$('tp-font-down').addEventListener('click', () => {
  state.tp.fontSize = Math.max(20, state.tp.fontSize - 4);
  tpText.style.fontSize = state.tp.fontSize + 'px';
});

// Keyboard: Space = play/pause, R = reset (while in teleprompter)
document.addEventListener('keydown', e => {
  if (state.activePanel !== 'teleprompter') return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.code === 'Space') { e.preventDefault(); $('tp-play-btn').click(); }
  if (e.code === 'KeyR')  { e.preventDefault(); resetTeleprompter(); }
});

// ── EDITOR CONTROLS ───────────────────────────────────────────────
$('editor-save-btn').addEventListener('click', saveEditor);
// Ctrl+S to save
editorArea.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveEditor(); }
});
document.querySelectorAll('.editor-tool-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const action = btn.dataset.action;
    if (action === 'bold')   wrapSelection('**','**');
    if (action === 'italic') wrapSelection('*','*');
    if (action === 'code')   wrapSelection('`','`');
    if (action === 'h2')     wrapSelection('\n## ','');
    if (action === 'quote')  wrapSelection('\n> ','');
  });
});

// ── UPLOAD & NEW ──────────────────────────────────────────────────
$('upload-input').addEventListener('change', e => {
  if (e.target.files[0]) handleUpload(e.target.files[0]);
  e.target.value = '';
});
$('new-btn').addEventListener('click', newRoteiro);
$('export-pdf-btn').addEventListener('click', exportPdf);

// ── DRAG & DROP on sidebar ────────────────────────────────────────
sidebar.addEventListener('dragover', e => { e.preventDefault(); sidebar.style.borderColor = 'var(--accent)'; });
sidebar.addEventListener('dragleave', () => { sidebar.style.borderColor = ''; });
sidebar.addEventListener('drop', e => {
  e.preventDefault(); sidebar.style.borderColor = '';
  if (e.dataTransfer.files[0]) handleUpload(e.dataTransfer.files[0]);
});

// ── INIT ──────────────────────────────────────────────────────────
(async () => {
  await loadList();
  if (state.roteiros.length > 0) {
    await openRoteiro(state.roteiros[0].name);
  } else {
    showEmptyState();
  }
})();
