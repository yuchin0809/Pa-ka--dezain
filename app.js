(() => {
  'use strict';

  const MAX_SRC = 1000; // アップロード画像の長辺の上限(px)
  const DEFAULT_TOL = 20;
  // 追加時の初期位置（ステージ幅に対する割合）
  const SPAWN = { front: { x: 0.31, y: 0.17 }, back: { x: 0.734, y: 0.22 } };
  const PRESETS = [
    ['#ffffff', '白'], ['#111111', '黒'], ['#e53935', '赤'], ['#1e5bd8', '青'],
    ['#2e9e4f', '緑'], ['#f06fa8', 'ピンク'], ['#ff8a1f', 'オレンジ'], ['#7b3fc4', '紫'],
  ];

  const $ = (sel) => document.querySelector(sel);
  const stage = $('#stage');
  const hoodie = $('#hoodie');
  const sel = $('#sel');
  const panel = $('#panel');
  const tray = $('#tray');
  const msgEl = $('#msg');
  const bgPreview = $('#bgPreview');

  const state = { uploads: [], items: [], selected: null, nextId: 1 };

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const stageW = () => stage.clientWidth;
  const stageRatio = () => stage.clientHeight / stage.clientWidth;
  const aspectOf = (item) => item.upload.canvas.height / item.upload.canvas.width;
  const side = () => document.querySelector('input[name="side"]:checked').value;
  const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

  let msgTimer = 0;
  function say(text) {
    msgEl.textContent = text;
    clearTimeout(msgTimer);
    if (text) msgTimer = setTimeout(() => { msgEl.textContent = ''; }, 6000);
  }

  /* ---------- アップロード ---------- */

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

  function hasAlpha(canvas) {
    const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true;
    return false;
  }

  // 四隅の色がそろっていれば、その平均色を背景色とみなす
  function cornerColor(canvas) {
    const ctx = canvas.getContext('2d');
    const { width: w, height: h } = canvas;
    const pts = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]];
    const px = pts.map(([x, y]) => ctx.getImageData(x, y, 1, 1).data);
    if (px.some((p) => p[3] < 250)) return null;
    const avg = [0, 1, 2].map((c) => Math.round(px.reduce((s, p) => s + p[c], 0) / 4));
    const far = px.some((p) => Math.hypot(p[0] - avg[0], p[1] - avg[1], p[2] - avg[2]) > 40);
    return far ? null : { r: avg[0], g: avg[1], b: avg[2] };
  }

  function makeThumb(canvas) {
    const t = document.createElement('canvas');
    t.width = t.height = 128;
    const k = Math.min(128 / canvas.width, 128 / canvas.height);
    const w = canvas.width * k, h = canvas.height * k;
    t.getContext('2d').drawImage(canvas, (128 - w) / 2, (128 - h) / 2, w, h);
    return t.toDataURL('image/png');
  }

  async function addUpload(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      const nw = img.naturalWidth || 512;
      const nh = img.naturalHeight || 512;
      const k = Math.min(1, MAX_SRC / Math.max(nw, nh));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(nw * k));
      canvas.height = Math.max(1, Math.round(nh * k));
      canvas.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0, canvas.width, canvas.height);
      state.uploads.push({
        id: state.nextId++,
        name: file.name,
        canvas,
        alpha: hasAlpha(canvas),
        corner: cornerColor(canvas),
        thumb: makeThumb(canvas),
      });
    } catch {
      say(`「${file.name}」は画像として読み込めませんでした。`);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function renderTray() {
    tray.replaceChildren();
    if (!state.uploads.length) {
      const p = document.createElement('span');
      p.className = 'empty';
      p.textContent = '「＋ 画像を追加」から、パーカーに重ねたい画像を選んでください。';
      tray.append(p);
      return;
    }
    for (const up of state.uploads) {
      const wrap = document.createElement('div');
      wrap.className = 'thumb';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'thumb-btn';
      btn.title = up.name;
      btn.setAttribute('aria-label', `${up.name} をパーカーに重ねる`);
      const img = document.createElement('img');
      img.src = up.thumb;
      img.alt = '';
      btn.append(img);
      btn.addEventListener('click', () => addItem(up));

      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'thumb-x';
      x.textContent = '×';
      x.setAttribute('aria-label', `${up.name} をタブから外す`);
      x.addEventListener('click', () => {
        state.uploads = state.uploads.filter((u) => u !== up);
        renderTray();
      });

      wrap.append(btn, x);
      tray.append(wrap);
    }
  }

  /* ---------- 画像の加工（背景透明化・色変更） ---------- */

  function processItem(item) {
    const src = item.upload.canvas;
    const c = item.canvas;
    c.width = src.width;
    c.height = src.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(src, 0, 0);
    if (!item.bg && !item.tint) return;

    const img = ctx.getImageData(0, 0, c.width, c.height);
    const d = img.data;
    const thr = item.tol * 3; // 色距離(0〜441)のしきい値
    const inner = thr * 0.6;  // これ以下は完全に透明、thrまでは境界をなだらかに
    const tint = item.tint ? hexToRgb(item.tint) : null;

    for (let i = 0; i < d.length; i += 4) {
      let a = d[i + 3];
      if (a === 0) continue;
      if (item.bg) {
        const dist = Math.hypot(d[i] - item.bg.r, d[i + 1] - item.bg.g, d[i + 2] - item.bg.b);
        if (dist <= inner) a = 0;
        else if (dist < thr) a = a * (dist - inner) / (thr - inner);
        d[i + 3] = a;
      }
      if (tint && a > 0) {
        d[i] = tint[0];
        d[i + 1] = tint[1];
        d[i + 2] = tint[2];
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  const pending = new Set();
  function scheduleProcess(item) {
    if (pending.has(item)) return;
    pending.add(item);
    requestAnimationFrame(() => {
      pending.delete(item);
      processItem(item);
    });
  }

  /* ---------- デザイン（重ねた画像） ---------- */

  function layoutBox(el, item) {
    const s = stageW();
    const w = item.w * s;
    el.style.left = `${item.x * s}px`;
    el.style.top = `${item.y * s}px`;
    el.style.width = `${w}px`;
    el.style.height = `${w * aspectOf(item)}px`;
    el.style.transform = `translate(-50%, -50%) rotate(${item.rot}deg)`;
  }

  function layout(item) {
    layoutBox(item.el, item);
    if (state.selected === item) layoutBox(sel, item);
  }

  function restack() {
    state.items.forEach((it, i) => { it.el.style.zIndex = String(i + 1); });
  }

  function createItem(upload, props) {
    const item = {
      upload,
      x: 0.3, y: 0.17, w: 0.14, rot: 0,
      tint: null, bg: null, tol: DEFAULT_TOL,
      canvas: document.createElement('canvas'),
      el: document.createElement('div'),
      ...props,
    };
    item.el.className = 'item';
    item.el.append(item.canvas);
    item.el.addEventListener('pointerdown', (e) => startMove(e, item));
    stage.insertBefore(item.el, sel);
    state.items.push(item);
    processItem(item);
    restack();
    layout(item);
    return item;
  }

  function addItem(upload) {
    const aspect = upload.canvas.height / upload.canvas.width;
    const face = side();
    const n = state.items.filter((it) => (it.x < 0.5) === (face === 'front')).length;
    const off = (n % 6) * 0.014;
    const item = createItem(upload, {
      w: Math.min(0.14, 0.2 / aspect),
      x: SPAWN[face].x + off,
      y: SPAWN[face].y + off,
    });
    select(item);
    say(`${face === 'front' ? '正面' : '背面'}に追加しました。ドラッグで動かせます。`);
  }

  function removeItem(item) {
    item.el.remove();
    state.items = state.items.filter((it) => it !== item);
    if (state.selected === item) select(null);
    restack();
  }

  /* ---------- 選択・ドラッグ・拡大縮小/回転 ---------- */

  function select(item) {
    state.selected = item;
    if (item) layoutBox(sel, item);
    sel.hidden = !item;
    syncPanel();
  }

  function startMove(e, item) {
    e.preventDefault();
    select(item);
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const sx = e.clientX, sy = e.clientY, ox = item.x, oy = item.y;
    const move = (ev) => {
      const s = stageW();
      item.x = clamp(ox + (ev.clientX - sx) / s, 0, 1);
      item.y = clamp(oy + (ev.clientY - sy) / s, 0, stageRatio());
      layout(item);
    };
    const end = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', end);
      el.removeEventListener('pointercancel', end);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  $('#hRot').addEventListener('pointerdown', (e) => {
    const item = state.selected;
    if (!item) return;
    e.preventDefault();
    e.stopPropagation();
    const h = e.currentTarget;
    h.setPointerCapture(e.pointerId);
    const rect = stage.getBoundingClientRect();
    const cx = rect.left + item.x * stageW();
    const cy = rect.top + item.y * stageW();
    const d0 = Math.max(1, Math.hypot(e.clientX - cx, e.clientY - cy));
    const a0 = Math.atan2(e.clientY - cy, e.clientX - cx);
    const w0 = item.w, r0 = item.rot;
    const move = (ev) => {
      const d = Math.hypot(ev.clientX - cx, ev.clientY - cy);
      const a = Math.atan2(ev.clientY - cy, ev.clientX - cx);
      item.w = clamp(w0 * d / d0, 0.03, 1);
      let r = r0 + ((a - a0) * 180) / Math.PI;
      r = ((r + 540) % 360) - 180;
      item.rot = Math.round(r);
      layout(item);
      syncSliders();
    };
    const end = () => {
      h.removeEventListener('pointermove', move);
      h.removeEventListener('pointerup', end);
      h.removeEventListener('pointercancel', end);
    };
    h.addEventListener('pointermove', move);
    h.addEventListener('pointerup', end);
    h.addEventListener('pointercancel', end);
  });

  $('#hDel').addEventListener('click', () => state.selected && removeItem(state.selected));

  // 何もない所を触ったら選択を外す
  stage.addEventListener('pointerdown', (e) => {
    if (e.target === stage || e.target === hoodie) select(null);
  });

  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && state.selected) {
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      removeItem(state.selected);
    }
  });

  /* ---------- 設定パネル ---------- */

  const sizeInput = $('#size');
  const rotInput = $('#rot');
  const tintInput = $('#tint');
  const tolInput = $('#tol');
  const bgChip = $('#bgChip');

  const presetsEl = $('#presets');
  for (const [hex, name] of PRESETS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.style.background = hex;
    b.dataset.hex = hex;
    b.title = name;
    b.setAttribute('aria-label', `${name}にする`);
    b.addEventListener('click', () => setTint(hex));
    presetsEl.append(b);
  }

  function syncSliders() {
    const item = state.selected;
    if (!item) return;
    sizeInput.value = String(Math.round(item.w * 100));
    rotInput.value = String(item.rot);
  }

  function drawBgPreview(item) {
    const src = item.upload.canvas;
    const k = Math.min(1, 240 / src.width, 160 / src.height);
    bgPreview.width = Math.max(1, Math.round(src.width * k));
    bgPreview.height = Math.max(1, Math.round(src.height * k));
    bgPreview.getContext('2d').drawImage(src, 0, 0, bgPreview.width, bgPreview.height);
  }

  function syncPanel() {
    const item = state.selected;
    panel.hidden = !item;
    if (!item) return;
    syncSliders();
    tolInput.value = String(item.tol);
    if (item.tint) tintInput.value = item.tint;
    for (const s of presetsEl.children) s.classList.toggle('on', s.dataset.hex === item.tint);
    bgChip.replaceChildren();
    if (item.bg) {
      const sw = document.createElement('i');
      sw.style.background = `rgb(${item.bg.r}, ${item.bg.g}, ${item.bg.b})`;
      bgChip.append('透明にする色: ', sw);
    } else {
      bgChip.textContent = '透明にする色: なし';
    }
    drawBgPreview(item);
  }

  function setTint(hex) {
    const item = state.selected;
    if (!item) return;
    // 背景つきの画像(JPGなど)は、背景ごと塗りつぶされないよう先に背景を透明にする
    if (!item.tint && !item.bg && !item.upload.alpha && item.upload.corner) {
      item.bg = item.upload.corner;
      say('背景が一色だったので、先に背景を透明にしました（下の「解除」で戻せます）。');
    }
    item.tint = hex;
    processItem(item);
    syncPanel();
  }

  sizeInput.addEventListener('input', () => {
    const item = state.selected;
    if (!item) return;
    item.w = Number(sizeInput.value) / 100;
    layout(item);
  });
  rotInput.addEventListener('input', () => {
    const item = state.selected;
    if (!item) return;
    item.rot = Number(rotInput.value);
    layout(item);
  });
  tintInput.addEventListener('input', () => setTint(tintInput.value));
  $('#tintReset').addEventListener('click', () => {
    const item = state.selected;
    if (!item) return;
    item.tint = null;
    processItem(item);
    syncPanel();
  });

  tolInput.addEventListener('input', () => {
    const item = state.selected;
    if (!item) return;
    item.tol = Number(tolInput.value);
    scheduleProcess(item);
  });
  $('#bgClear').addEventListener('click', () => {
    const item = state.selected;
    if (!item) return;
    item.bg = null;
    processItem(item);
    syncPanel();
  });
  $('#bgAuto').addEventListener('click', () => {
    const item = state.selected;
    if (!item) return;
    if (!item.upload.corner) {
      say('四隅の色がそろっていないため自動で決められません。画像をクリックして色を選んでください。');
      return;
    }
    item.bg = item.upload.corner;
    processItem(item);
    syncPanel();
  });
  bgPreview.addEventListener('click', (e) => {
    const item = state.selected;
    if (!item) return;
    const r = bgPreview.getBoundingClientRect();
    const src = item.upload.canvas;
    const x = clamp(Math.floor(((e.clientX - r.left) / r.width) * src.width), 0, src.width - 1);
    const y = clamp(Math.floor(((e.clientY - r.top) / r.height) * src.height), 0, src.height - 1);
    const [pr, pg, pb, pa] = src.getContext('2d').getImageData(x, y, 1, 1).data;
    if (pa < 10) {
      say('そこはもともと透明です。色のついた部分をクリックしてください。');
      return;
    }
    item.bg = { r: pr, g: pg, b: pb };
    processItem(item);
    syncPanel();
  });

  $('#toFront').addEventListener('click', () => moveLayer(1));
  $('#toBack').addEventListener('click', () => moveLayer(-1));
  function moveLayer(dir) {
    const item = state.selected;
    if (!item) return;
    const i = state.items.indexOf(item);
    const j = i + dir;
    if (j < 0 || j >= state.items.length) return;
    [state.items[i], state.items[j]] = [state.items[j], state.items[i]];
    restack();
  }
  $('#dup').addEventListener('click', () => {
    const item = state.selected;
    if (!item) return;
    const { upload, w, rot, tint, bg, tol } = item;
    select(createItem(upload, {
      w, rot, tint, bg, tol,
      x: clamp(item.x + 0.02, 0, 1),
      y: clamp(item.y + 0.02, 0, stageRatio()),
    }));
  });
  $('#del').addEventListener('click', () => state.selected && removeItem(state.selected));

  $('#clearAll').addEventListener('click', () => {
    if (!state.items.length) return;
    if (!confirm('重ねたデザインをすべて消しますか？')) return;
    for (const it of [...state.items]) removeItem(it);
  });

  /* ---------- 画像追加・保存 ---------- */

  $('#file').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    for (const f of files) await addUpload(f);
    renderTray();
    if (files.length) tray.scrollLeft = tray.scrollWidth;
  });

  $('#savePng').addEventListener('click', () => {
    const W = hoodie.naturalWidth;
    const H = hoodie.naturalHeight;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');
    ctx.drawImage(hoodie, 0, 0);
    for (const it of state.items) {
      const iw = it.w * W;
      const ih = iw * aspectOf(it);
      ctx.save();
      ctx.translate(it.x * W, it.y * W);
      ctx.rotate((it.rot * Math.PI) / 180);
      ctx.drawImage(it.canvas, -iw / 2, -ih / 2, iw, ih);
      ctx.restore();
    }
    try {
      c.toBlob((blob) => {
        if (!blob) { say('画像を作れませんでした。'); return; }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'class-parka-design.png';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }, 'image/png');
    } catch {
      say('保存できませんでした。ファイルを直接開かず、GitHub Pagesなどのウェブ経由で開いてください。');
    }
  });

  /* ---------- 初期化 ---------- */

  new ResizeObserver(() => {
    for (const it of state.items) layout(it);
    if (state.selected) layoutBox(sel, state.selected);
  }).observe(stage);

  renderTray();
})();
