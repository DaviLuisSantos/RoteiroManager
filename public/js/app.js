// ── CONSTANTS ─────────────────────────────────────────────────────
const FONT_SIZES = [13, 14, 16, 18, 20, 22, 24];

// ── PERSISTENT STATE (localStorage) ───────────────────────────────
function lsGet(key, fallback) {
  try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function lsSet(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }

let fontIdx = Math.min(Math.max(0, lsGet('rm_fontIdx', 2)), FONT_SIZES.length - 1);

// ── STATE ─────────────────────────────────────────────────────────
const state = {
  roteiros:    [],
  current:     null,   // { name, content }
  activePanel: 'viewer',
  isDirty:     false,
  tp: {
    running:       false,
    counting:      false,
    speed:         lsGet('rm_tpSpeed', 40),
    pos:           0,
    raf:           null,
    lastTs:        null,
    fontSize:      lsGet('rm_tpFontSize', 36),
    mirrored:      lsGet('rm_tpMirrored', false),
    timerStart:    0,
    timerElapsed:  0,
    timerInterval: null,
  }
};

// ── DOM REFS ──────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const sidebar        = $('sidebar');
const rotList        = $('roteiro-list');
const searchInput    = $('search-input');
const topbarTitle    = $('topbar-title');
const viewerPanel    = $('viewer-panel');
const viewerContent  = $('viewer-content');
const tpPanel        = $('teleprompter-panel');
const tpTrack        = $('tp-track');
const tpText         = $('tp-text');
const editorPanel    = $('editor-panel');
const editorArea     = $('editor-area');
const editorFilename = $('editor-filename');
const emptyState     = $('empty-state');
const progress       = $('progress-bar');
const scrolltop      = $('scrolltop-btn');
const fsDisplay      = $('fs-display');
const toast          = $('toast');

// Init persistent UI state
fsDisplay.textContent = FONT_SIZES[fontIdx] + 'px';
$('tp-speed').value       = state.tp.speed;
$('tp-speed-val').textContent = state.tp.speed;

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

// ── GENERIC MODAL ─────────────────────────────────────────────────
const modalState = { onConfirm: null, onCancel: null };

function openModal({ title, message = '', inputValue = null, placeholder = '',
                     confirmText = 'Confirmar', confirmClass = 'modal-btn primary',
                     onConfirm, onCancel }) {
  const overlay = $('modal-overlay');
  const inp     = $('modal-input');
  const msg     = $('modal-message');

  $('modal-title').textContent    = title;
  $('modal-confirm').textContent  = confirmText;
  $('modal-confirm').className    = confirmClass;

  if (message) { msg.textContent = message; msg.style.display = 'block'; }
  else          { msg.style.display = 'none'; }

  if (inputValue !== null) {
    inp.value       = inputValue;
    inp.placeholder = placeholder;
    inp.style.display = '';
    setTimeout(() => { inp.focus(); inp.select(); }, 60);
  } else {
    inp.style.display = 'none';
  }

  modalState.onConfirm = onConfirm || null;
  modalState.onCancel  = onCancel  || null;
  overlay.classList.add('open');
}

function closeModal() {
  $('modal-overlay').classList.remove('open');
  modalState.onConfirm = null;
  modalState.onCancel  = null;
}

$('modal-confirm').addEventListener('click', () => {
  const inp = $('modal-input');
  const val = inp.style.display !== 'none' ? inp.value.trim() : null;
  const cb  = modalState.onConfirm;
  closeModal();
  if (cb) cb(val);
});

$('modal-cancel').addEventListener('click', () => {
  const cb = modalState.onCancel;
  closeModal();
  if (cb) cb();
});

$('modal-overlay').addEventListener('click', e => {
  if (e.target !== $('modal-overlay')) return;
  const cb = modalState.onCancel;
  closeModal();
  if (cb) cb();
});

$('modal-input').addEventListener('keydown', e => {
  if (e.key === 'Enter')  $('modal-confirm').click();
  if (e.key === 'Escape') $('modal-cancel').click();
});

// ── RENAME MODAL ──────────────────────────────────────────────────
function openRenameModal(name) {
  const display = name.replace(/\.md$/i, '');
  openModal({
    title: 'Renomear roteiro',
    inputValue: display,
    placeholder: 'nome-do-roteiro',
    confirmText: 'Renomear',
    onConfirm: async (val) => {
      const newName = (val || display).replace(/\.md$/i, '') + '.md';
      if (!val || newName === name) return;
      try {
        await api('POST', `/api/roteiros/${name}/rename`, { newName });
        const wasCurrent = state.current?.name === name;
        await loadList();
        if (wasCurrent) await openRoteiro(newName);
        showToast('Renomeado com sucesso', 'success');
      } catch (e) { showToast(e.message, 'error'); }
    }
  });
}

// ── DELETE MODAL ──────────────────────────────────────────────────
function openDeleteModal(name) {
  const display = name.replace(/\.md$/i, '');
  openModal({
    title: `Excluir "${display}"?`,
    message: 'Esta ação não pode ser desfeita.',
    confirmText: 'Excluir',
    confirmClass: 'modal-btn danger',
    onConfirm: async () => {
      try {
        await api('DELETE', `/api/roteiros/${name}`);
        if (state.current?.name === name) { state.current = null; state.isDirty = false; showEmptyState(); }
        await loadList();
        showToast('Roteiro excluído', 'success');
      } catch (e) { showToast(e.message, 'error'); }
    }
  });
}

// ── NEW ROTEIRO MODAL ─────────────────────────────────────────────
function openNewModal() {
  openModal({
    title: 'Novo roteiro',
    inputValue: '',
    placeholder: 'nome-do-roteiro',
    confirmText: 'Criar',
    onConfirm: async (val) => {
      const rawName = (val || 'novo_roteiro').replace(/\.md$/i, '').replace(/[\\/:*?"<>|]/g, '_');
      const name    = rawName + '.md';
      const content = `# ${rawName.replace(/_/g, ' ')}\n\n---\n\n## Hook — Título do hook\n\n> Fala de abertura aqui.\n\n---\n\n## Bloco 1 — Título\n\n1. Primeiro ponto.\n`;
      try {
        await api('PUT', `/api/roteiros/${name}`, { content });
        await loadList(name);
        switchPanel('editor');
        showToast('Novo roteiro criado!', 'success');
      } catch (e) { showToast(e.message, 'error'); }
    }
  });
}

// ── CONFIRM DISCARD ───────────────────────────────────────────────
function confirmDiscard(callback) {
  if (!state.isDirty) { callback(); return; }
  openModal({
    title: 'Alterações não salvas',
    message: 'Você tem edições não salvas. Descartar e continuar?',
    confirmText: 'Descartar',
    confirmClass: 'modal-btn danger',
    onConfirm: () => {
      state.isDirty = false;
      updateDirtyIndicator();
      clearTimeout(autosaveTimer);
      callback();
    },
    onCancel: () => {}
  });
}

// ── DIRTY INDICATOR ───────────────────────────────────────────────
function updateDirtyIndicator() {
  const dot = $('dirty-dot');
  const btn = $('editor-save-btn');
  if (state.isDirty) {
    dot.style.display = '';
    if (!btn.classList.contains('saved')) btn.className = 'editor-save-btn dirty';
  } else {
    dot.style.display = 'none';
    if (!btn.classList.contains('saved')) btn.className = 'editor-save-btn';
  }
}

// ── AUTOSAVE ──────────────────────────────────────────────────────
let autosaveTimer;
function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(async () => {
    if (state.isDirty && state.activePanel === 'editor' && state.current) {
      await saveEditor(true);
    }
  }, 30000); // 30s de inatividade
}

// ── WORD COUNT / READING TIME ─────────────────────────────────────
function countWords(md) {
  const text = md
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/^>+\s?/gm, '')
    .replace(/^---+$/gm, '')
    .replace(/^\d+\.\s+/gm, '');
  return text.split(/\s+/).filter(w => w.length > 1).length;
}

function buildStatsHtml(md) {
  const words   = countWords(md);
  const minutes = Math.max(1, Math.round(words / 130)); // ~130 WPM falado
  return `<div class="viewer-stats">${words.toLocaleString('pt-BR')} palavras&nbsp;·&nbsp;~${minutes} min de fala</div>`;
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

// Content search debounce
let searchTimer;
let searchResults = null; // null = usa state.roteiros; array = resultados de conteúdo

function renderList(filter) {
  const q     = (filter ?? searchInput.value).toLowerCase().trim();
  const items = searchResults !== null
    ? searchResults
    : (q ? state.roteiros.filter(r => r.name.toLowerCase().includes(q)) : state.roteiros);

  if (!items.length) {
    rotList.innerHTML = `<div class="empty-list">${q ? 'Nenhum resultado.' : 'Pasta roteiros/ vazia.<br>Faça upload de um .md!'}</div>`;
    return;
  }

  rotList.innerHTML = items.map(r => {
    const display  = r.name.replace(/\.md$/i, '').replace(/_/g, ' ');
    const date     = new Date(r.modified).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    const active   = state.current?.name === r.name ? 'active' : '';
    const preview  = r.preview
      ? `<span class="roteiro-item-preview">${escHtml(r.preview)}</span>`
      : '';
    return `
      <div class="roteiro-item ${active}" data-name="${r.name}">
        <div class="roteiro-item-main">
          <span class="roteiro-item-name" title="${r.name}">${display}</span>
          <span class="roteiro-item-date">${date}</span>
          <button class="roteiro-item-menu" data-menu="${r.name}" title="Opções">⋮</button>
        </div>
        ${preview}
      </div>`;
  }).join('');

  rotList.querySelectorAll('.roteiro-item').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.classList.contains('roteiro-item-menu')) return;
      const name = el.dataset.name;
      if (state.isDirty && state.activePanel === 'editor') {
        confirmDiscard(() => openRoteiro(name));
      } else {
        openRoteiro(name);
      }
    });
  });
  rotList.querySelectorAll('.roteiro-item-menu').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      showContextMenu(btn.dataset.menu, btn);
    });
  });
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── SEARCH ────────────────────────────────────────────────────────
searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim();
  clearTimeout(searchTimer);
  searchResults = null;

  if (q.length >= 3) {
    // Renderiza filtro local imediato, depois substitui com busca de conteúdo
    renderList(q);
    searchTimer = setTimeout(async () => {
      try {
        searchResults = await api('GET', `/api/search?q=${encodeURIComponent(q)}`);
        renderList(q);
      } catch { /* mantém filtro por nome */ }
    }, 280);
  } else {
    renderList(q);
  }
});

// ── CONTEXT MENU ─────────────────────────────────────────────────
let ctxMenu = null;
function showContextMenu(name, anchor) {
  removeContextMenu();
  const menu = document.createElement('div');
  menu.style.cssText = `position:fixed;background:#1e1e1e;border:1px solid #2a2a2a;border-radius:6px;padding:4px 0;z-index:800;min-width:150px;box-shadow:0 8px 24px rgba(0,0,0,0.5);`;
  const rect = anchor.getBoundingClientRect();
  menu.style.top  = (rect.bottom + 4) + 'px';
  menu.style.left = Math.max(8, rect.right - 150) + 'px';

  const items = [
    { label: '✎  Renomear',  action: () => openRenameModal(name)   },
    { label: '⧉  Duplicar',  action: () => duplicateRoteiro(name)  },
    { label: '✕  Excluir',   action: () => openDeleteModal(name), danger: true },
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

// ── DUPLICATE ────────────────────────────────────────────────────
async function duplicateRoteiro(name) {
  try {
    const data = await api('POST', `/api/roteiros/${name}/duplicate`);
    await loadList(data.name);
    showToast('Roteiro duplicado!', 'success');
  } catch (e) {
    showToast('Erro ao duplicar: ' + e.message, 'error');
  }
}

// ── OPEN ROTEIRO ──────────────────────────────────────────────────
async function openRoteiro(name) {
  try {
    const data = await api('GET', `/api/roteiros/${name}`);
    state.current = data;
    state.isDirty = false;
    clearTimeout(autosaveTimer);
    const display = name.replace(/\.md$/i, '').replace(/_/g, ' ');
    topbarTitle.textContent = display;
    lsSet('rm_lastRoteiro', name);
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
  const statsHtml = buildStatsHtml(state.current.content);
  const bodyHtml  = parseRoteiro(state.current.content);
  viewerContent.innerHTML = statsHtml + bodyHtml;
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
  lsSet('rm_fontIdx', fontIdx);
  if (state.current) viewerContent.style.fontSize = FONT_SIZES[fontIdx] + 'px';
}

// ── TIME HELPERS ──────────────────────────────────────────────────
function fmtTime(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Calcula o tempo total estimado em segundos (maxScroll ÷ velocidade)
// Só é preciso quando o painel está ativo e o padding já foi calculado
function calcTotalSecs(speed) {
  const max = Math.max(1, tpTrack.offsetHeight - tpPanel.offsetHeight);
  return Math.round(max / (speed || state.tp.speed));
}

// Atualiza o display do timer:
//   • Antes de iniciar:  "~45:06"
//   • Com tempo decorrido: "2:30 / ~43:00"  (total recalculado pela velocidade atual)
function updateTpDuration() {
  const total   = calcTotalSecs(state.tp.speed);
  const elapsed = state.tp.timerElapsed;
  $('tp-timer').textContent = elapsed > 0
    ? `${fmtTime(elapsed)} / ~${fmtTime(total)}`
    : `~${fmtTime(total)}`;
}

// ── TELEPROMPTER ──────────────────────────────────────────────────
function initTeleprompter() {
  if (!state.current) { switchPanel('viewer'); return; }
  tpText.innerHTML       = buildTeleprompterHtml(state.current.content);
  tpText.style.fontSize  = state.tp.fontSize + 'px';
  $('tp-speed').value    = state.tp.speed;
  $('tp-speed-val').textContent = state.tp.speed;

  recalcTpPadding();
  resetTeleprompter();   // ← chama resetTimer() → updateTpDuration()

  // Aplica estado do espelho se estava ativo
  $('tp-content').classList.toggle('mirrored', !!state.tp.mirrored);
  $('tp-mirror-btn').classList.toggle('active', !!state.tp.mirrored);
}

function recalcTpPadding() {
  const halfH = tpPanel.offsetHeight / 2;
  tpTrack.style.paddingTop    = halfH + 'px';
  tpTrack.style.paddingBottom = halfH + 'px';
}

// ── COUNTDOWN ────────────────────────────────────────────────────
function startCountdown() {
  return new Promise(resolve => {
    const overlay = $('tp-countdown');
    const numEl   = $('tp-countdown-num');
    overlay.style.display = 'flex';

    function showNum(n, cb) {
      numEl.textContent = n;
      numEl.className   = '';         // reset animação
      void numEl.offsetWidth;         // reflow
      numEl.className   = 'tp-count-in';
      setTimeout(() => {
        if (!state.tp.counting) { overlay.style.display = 'none'; resolve(); }
        else cb();
      }, 950);
    }

    showNum(3, () => showNum(2, () => showNum(1, () => {
      overlay.style.display = 'none';
      resolve();
    })));
  });
}

// ── TIMER ────────────────────────────────────────────────────────
function startTimer() {
  state.tp.timerStart    = Date.now() - (state.tp.timerElapsed * 1000);
  clearInterval(state.tp.timerInterval);
  state.tp.timerInterval = setInterval(() => {
    state.tp.timerElapsed = Math.floor((Date.now() - state.tp.timerStart) / 1000);
    updateTpDuration();   // atualiza "elapsed / ~total" — total varia se velocidade mudar
  }, 500);
}

function stopTimer() {
  if (state.tp.timerInterval) {
    clearInterval(state.tp.timerInterval);
    state.tp.timerInterval = null;
    state.tp.timerElapsed  = Math.floor((Date.now() - state.tp.timerStart) / 1000);
  }
}

function resetTimer() {
  stopTimer();
  state.tp.timerElapsed = 0;
  updateTpDuration();   // mostra "~total" sem elapsed
}

// ── TP PLAY BUTTON STATE ─────────────────────────────────────────
function updateTpBtn() {
  const btn = $('tp-play-btn');
  if (state.tp.counting) {
    btn.textContent = '✕ Cancelar';
    btn.className   = 'tp-btn';
  } else if (state.tp.running) {
    btn.textContent = '⏸ Pausar';
    btn.className   = 'tp-btn';
  } else {
    btn.textContent = '▶ Iniciar';
    btn.className   = 'tp-btn primary';
  }
}

// ── SCROLL LOOP (reutilizado pelo start e pelo click-to-resume) ───
function runScrollLoop() {
  const progressFill = $('tp-progress-fill');
  function tick(ts) {
    if (!state.tp.running) return;
    if (state.tp.lastTs !== null) {
      const dt        = (ts - state.tp.lastTs) / 1000;
      state.tp.pos   += state.tp.speed * dt;
      const maxScroll = Math.max(1, tpTrack.offsetHeight - tpPanel.offsetHeight);
      progressFill.style.width = Math.min(100, state.tp.pos / maxScroll * 100) + '%';
      if (state.tp.pos >= maxScroll) {
        state.tp.pos = maxScroll;
        tpTrack.style.transform = `translateY(-${state.tp.pos}px)`;
        progressFill.style.width = '100%';
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

// ── START / STOP / RESET ─────────────────────────────────────────
async function startTeleprompter() {
  // Início do zero → contagem regressiva
  if (state.tp.pos === 0) {
    state.tp.counting = true;
    updateTpBtn();
    await startCountdown();
    // Se foi cancelado durante o countdown, state.tp.counting já é false
    if (!state.tp.counting) { updateTpBtn(); return; }
    state.tp.counting = false;
    updateTpBtn();
  }
  // Inicia (ou retoma) o scroll
  state.tp.running = true;
  state.tp.lastTs  = null;
  startTimer();
  updateTpBtn();
  runScrollLoop();
}

function stopTeleprompter() {
  state.tp.running  = false;
  state.tp.counting = false;
  $('tp-countdown').style.display = 'none';
  if (state.tp.raf) { cancelAnimationFrame(state.tp.raf); state.tp.raf = null; }
  stopTimer();
  updateTpBtn();
}

function resetTeleprompter() {
  stopTeleprompter();
  state.tp.pos = 0;
  tpTrack.style.transform = 'translateY(0)';
  $('tp-progress-fill').style.width = '0%';
  resetTimer();
  updateTpBtn();
}

// ── ESPELHO ──────────────────────────────────────────────────────
function toggleMirror() {
  state.tp.mirrored = !state.tp.mirrored;
  $('tp-content').classList.toggle('mirrored', state.tp.mirrored);
  $('tp-mirror-btn').classList.toggle('active', state.tp.mirrored);
  lsSet('rm_tpMirrored', state.tp.mirrored);
}

// ── TELA CHEIA ───────────────────────────────────────────────────
async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await tpPanel.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch (e) { /* navegador sem suporte */ }
}

document.addEventListener('fullscreenchange', () => {
  const inFs = !!document.fullscreenElement;
  $('tp-fullscreen-btn').textContent = inFs ? '✕' : '⛶';
  $('tp-fullscreen-btn').classList.toggle('active', inFs);
  if (state.activePanel === 'teleprompter') {
    // Recalcula padding pois altura mudou
    setTimeout(recalcTpPadding, 100);
  }
});

// ── EDITOR ────────────────────────────────────────────────────────
function initEditor() {
  if (!state.current) { switchPanel('viewer'); return; }
  editorArea.value       = state.current.content;
  editorFilename.value   = state.current.name.replace(/\.md$/i, '');
  state.isDirty = false;
  updateDirtyIndicator();
}

async function saveEditor(silent = false) {
  if (!state.current) return;
  const content = editorArea.value;
  const rawName = editorFilename.value.trim();
  const newName = (rawName || state.current.name.replace(/\.md$/i, '')).replace(/\.md$/i, '') + '.md';
  const oldName = state.current.name;

  try {
    await api('PUT', `/api/roteiros/${oldName}`, { content });
    if (newName !== oldName) {
      await api('POST', `/api/roteiros/${oldName}/rename`, { newName });
    }
    state.current = { name: newName, content };
    state.isDirty = false;
    clearTimeout(autosaveTimer);
    updateDirtyIndicator();
    await loadList();
    topbarTitle.textContent = newName.replace(/\.md$/i, '').replace(/_/g, ' ');
    lsSet('rm_lastRoteiro', newName);

    if (!silent) {
      const btn = $('editor-save-btn');
      btn.textContent = '✓ Salvo';
      btn.className   = 'editor-save-btn saved';
      setTimeout(() => { btn.textContent = 'Salvar'; btn.className = 'editor-save-btn'; }, 2000);
    } else {
      showToast('Salvo automaticamente', 'success');
    }
  } catch (e) {
    showToast('Erro ao salvar: ' + e.message, 'error');
  }
}

function wrapSelection(before, after) {
  const start = editorArea.selectionStart;
  const end   = editorArea.selectionEnd;
  const sel   = editorArea.value.slice(start, end);
  editorArea.setRangeText(before + sel + after, start, end, 'select');
  editorArea.focus();
}

// ── UPLOAD ────────────────────────────────────────────────────────
async function handleUpload(file) {
  if (!file || !file.name.match(/\.md$/i)) { showToast('Envie um arquivo .md', 'error'); return; }
  const content = await file.text();
  try {
    await api('PUT', `/api/roteiros/${file.name}`, { content });
    await loadList(file.name);
    showToast('Roteiro importado!', 'success');
  } catch (e) {
    showToast('Erro ao importar: ' + e.message, 'error');
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

// ── TABS ──────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!state.current) return;
    const target = btn.dataset.panel;
    if (state.isDirty && state.activePanel === 'editor' && target !== 'editor') {
      confirmDiscard(() => switchPanel(target));
    } else {
      switchPanel(target);
    }
  });
});

// ── FONT CTRL ─────────────────────────────────────────────────────
$('font-down').addEventListener('click', () => changeFont(-1));
$('font-up').addEventListener('click',   () => changeFont(1));

// ── TELEPROMPTER CONTROLS ─────────────────────────────────────────
$('tp-play-btn').addEventListener('click', () => {
  if (state.tp.counting) {
    // Cancela contagem
    state.tp.counting = false;
    $('tp-countdown').style.display = 'none';
    updateTpBtn();
  } else if (state.tp.running) {
    stopTeleprompter();
  } else {
    startTeleprompter();
  }
});

$('tp-reset-btn').addEventListener('click', resetTeleprompter);

$('tp-speed').addEventListener('input', e => {
  state.tp.speed = +e.target.value;
  $('tp-speed-val').textContent = state.tp.speed;
  lsSet('rm_tpSpeed', state.tp.speed);
  updateTpDuration();   // recalcula total imediatamente ao arrastar o slider
});

$('tp-font-up').addEventListener('click', () => {
  state.tp.fontSize = Math.min(72, state.tp.fontSize + 4);
  tpText.style.fontSize = state.tp.fontSize + 'px';
  lsSet('rm_tpFontSize', state.tp.fontSize);
  recalcTpPadding();
  updateTpDuration();
});
$('tp-font-down').addEventListener('click', () => {
  state.tp.fontSize = Math.max(20, state.tp.fontSize - 4);
  tpText.style.fontSize = state.tp.fontSize + 'px';
  lsSet('rm_tpFontSize', state.tp.fontSize);
  recalcTpPadding();
  updateTpDuration();
});

$('tp-mirror-btn').addEventListener('click', toggleMirror);
$('tp-fullscreen-btn').addEventListener('click', toggleFullscreen);

// Click no conteúdo: pausa / retoma (sem countdown ao retomar)
$('tp-content').addEventListener('click', () => {
  if (state.tp.counting) return;
  if (state.tp.running) {
    stopTeleprompter();
  } else if (state.tp.pos > 0) {
    state.tp.running = true;
    state.tp.lastTs  = null;
    startTimer();
    updateTpBtn();
    runScrollLoop();
  }
});

// Keyboard: Space, R, ↑↓ velocidade, M espelho, F tela cheia
document.addEventListener('keydown', e => {
  if (state.activePanel !== 'teleprompter') return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  if (e.code === 'Space') { e.preventDefault(); $('tp-play-btn').click(); }
  if (e.code === 'KeyR')  { e.preventDefault(); resetTeleprompter(); }
  if (e.code === 'KeyM')  { e.preventDefault(); toggleMirror(); }
  if (e.code === 'KeyF')  { e.preventDefault(); toggleFullscreen(); }

  if (e.code === 'ArrowUp') {
    e.preventDefault();
    state.tp.speed = Math.min(150, state.tp.speed + 5);
    $('tp-speed').value = state.tp.speed;
    $('tp-speed-val').textContent = state.tp.speed;
    lsSet('rm_tpSpeed', state.tp.speed);
    updateTpDuration();
  }
  if (e.code === 'ArrowDown') {
    e.preventDefault();
    state.tp.speed = Math.max(10, state.tp.speed - 5);
    $('tp-speed').value = state.tp.speed;
    $('tp-speed-val').textContent = state.tp.speed;
    lsSet('rm_tpSpeed', state.tp.speed);
    updateTpDuration();
  }
});

// ── EDITOR CONTROLS ───────────────────────────────────────────────
$('editor-save-btn').addEventListener('click', () => saveEditor(false));

editorArea.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveEditor(false); }
});

editorArea.addEventListener('input', () => {
  if (!state.isDirty) {
    state.isDirty = true;
    updateDirtyIndicator();
  }
  scheduleAutosave();
});

document.querySelectorAll('.editor-tool-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const action = btn.dataset.action;
    if (action === 'bold')   wrapSelection('**', '**');
    if (action === 'italic') wrapSelection('*', '*');
    if (action === 'code')   wrapSelection('`', '`');
    if (action === 'h2')     wrapSelection('\n## ', '');
    if (action === 'quote')  wrapSelection('\n> ', '');
  });
});

// ── UPLOAD & NEW ──────────────────────────────────────────────────
$('upload-input').addEventListener('change', e => {
  if (e.target.files[0]) handleUpload(e.target.files[0]);
  e.target.value = '';
});

$('new-btn').addEventListener('click', () => confirmDiscard(openNewModal));
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
  const lastRoteiro = lsGet('rm_lastRoteiro', null);
  const toOpen = (lastRoteiro && state.roteiros.find(r => r.name === lastRoteiro))
    ? lastRoteiro
    : (state.roteiros.length > 0 ? state.roteiros[0].name : null);

  if (toOpen) {
    await openRoteiro(toOpen);
  } else {
    showEmptyState();
  }
})();
