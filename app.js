(() => {
  'use strict';

  const MAX_SRC = 1000; // アップロード画像の長辺の上限(px)
  const DEFAULT_TOL = 20;
  const SNAP_ROT = 4;       // 回転がこの角度(°)以内なら 0°・90°… に吸着
  const SNAP_POS_PX = 6;    // 位置がこの距離(px)以内なら整列ガイドに吸着
  const MIN_CROP = 0.05;    // トリミングで最低限残す割合
  const HOODIE_CX = [0.2535, 0.729]; // 正面・背面のパーカーの中心線（ステージ幅に対する割合）
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
  const aspectOf = (item) => item.canvas.height / item.canvas.width;
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
    const k = item.crop;
    const sx = Math.min(src.width - 1, Math.round(k.l * src.width));
    const sy = Math.min(src.height - 1, Math.round(k.t * src.height));
    const cw = Math.max(1, Math.min(src.width - sx, Math.round((1 - k.l - k.r) * src.width)));
    const ch = Math.max(1, Math.min(src.height - sy, Math.round((1 - k.t - k.b) * src.height)));
    c.width = cw;
    c.height = ch;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(src, sx, sy, cw, ch, 0, 0, cw, ch);
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
      crop: { l: 0, t: 0, r: 0, b: 0 },
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

  /* 整列ガイド */
  const guideV = $('#guideV');
  const guideH = $('#guideH');
  const guideR = $('#guideR');

  function hideGuides() {
    guideV.hidden = guideH.hidden = guideR.hidden = true;
  }

  function showGuides(gx, gy) {
    const s = stageW();
    guideV.hidden = gx === null;
    guideH.hidden = gy === null;
    if (gx !== null) guideV.style.left = `${gx * s}px`;
    if (gy !== null) guideH.style.top = `${gy * s}px`;
  }

  // 水平・垂直に吸着したときに、中心を通る線を出す
  function showRotGuide(item, deg) {
    const s = stageW();
    guideR.hidden = false;
    guideR.style.left = `${item.x * s}px`;
    guideR.style.top = `${item.y * s}px`;
    guideR.style.width = `${s * 3}px`;
    guideR.style.transform = `translate(-50%, -50%) rotate(${deg}deg)`;
  }

  function snapAngle(r) {
    const m = Math.round(r / 90) * 90;
    return Math.abs(r - m) <= SNAP_ROT ? m : null;
  }

  // 回転を含めた外接四角の半分の大きさ（ステージ幅に対する割合）
  function halfExtents(item) {
    const w = item.w;
    const h = item.w * aspectOf(item);
    const r = (item.rot * Math.PI) / 180;
    const c = Math.abs(Math.cos(r));
    const sn = Math.abs(Math.sin(r));
    return { hw: (w * c + h * sn) / 2, hh: (w * sn + h * c) / 2 };
  }

  // edges: 左右(上下)の端と中心を揃える候補 / centers: 中心だけを揃える候補
  function snapAxis(center, half, edges, centers, thr) {
    let best = null;
    const tryLine = (target, offset) => {
      const d = target - (center + offset);
      if (Math.abs(d) <= thr && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, line: target };
    };
    for (const t of edges) for (const off of [-half, 0, half]) tryLine(t, off);
    for (const t of centers) tryLine(t, 0);
    return best;
  }

  function startMove(e, item) {
    e.preventDefault();
    select(item);
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const sx = e.clientX, sy = e.clientY, ox = item.x, oy = item.y;
    const move = (ev) => {
      const s = stageW();
      let nx = clamp(ox + (ev.clientX - sx) / s, 0, 1);
      let ny = clamp(oy + (ev.clientY - sy) / s, 0, stageRatio());
      let gx = null, gy = null;
      if (!ev.altKey) {
        const thr = SNAP_POS_PX / s;
        const { hw, hh } = halfExtents(item);
        const exs = [], eys = [];
        for (const o of state.items) {
          if (o === item) continue;
          const b = halfExtents(o);
          exs.push(o.x - b.hw, o.x, o.x + b.hw);
          eys.push(o.y - b.hh, o.y, o.y + b.hh);
        }
        const bx = snapAxis(nx, hw, exs, HOODIE_CX, thr);
        const by = snapAxis(ny, hh, eys, [], thr);
        if (bx) { nx += bx.d; gx = bx.line; }
        if (by) { ny += by.d; gy = by.line; }
      }
      item.x = nx;
      item.y = ny;
      layout(item);
      showGuides(gx, gy);
    };
    const end = () => {
      hideGuides();
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
      r = Math.round(r);
      const m = ev.altKey ? null : snapAngle(r);
      if (m !== null) { r = m; showRotGuide(item, m); } else { guideR.hidden = true; }
      item.rot = r;
      layout(item);
      syncSliders();
    };
    const end = () => {
      hideGuides();
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
  const rotOut = $('#rotOut');
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
    rotOut.textContent = `${item.rot}°`;
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
    drawCrop(item);
  }

  /* ---------- トリミング ---------- */

  const cropBox = $('#crop');
  const cropImg = $('#cropImg');
  const cropRect = $('#cropRect');

  function drawCrop(item) {
    const src = item.upload.canvas;
    const k = Math.min(280 / src.width, 200 / src.height);
    cropImg.width = Math.max(1, Math.round(src.width * k));
    cropImg.height = Math.max(1, Math.round(src.height * k));
    cropImg.getContext('2d').drawImage(src, 0, 0, cropImg.width, cropImg.height);
    updateCropUI(item);
  }

  function updateCropUI(item) {
    const c = item.crop;
    const pct = (v) => `${v * 100}%`;
    Object.assign(cropRect.style, { left: pct(c.l), top: pct(c.t), right: pct(c.r), bottom: pct(c.b) });
    Object.assign($('#dimT').style, { left: '0', top: '0', right: '0', height: pct(c.t) });
    Object.assign($('#dimB').style, { left: '0', bottom: '0', right: '0', height: pct(c.b) });
    Object.assign($('#dimL').style, { left: '0', top: pct(c.t), bottom: pct(c.b), width: pct(c.l) });
    Object.assign($('#dimR').style, { right: '0', top: pct(c.t), bottom: pct(c.b), width: pct(c.r) });
  }

  // 切り取った後も、残った部分が同じ大きさ・同じ場所に見えるように位置と大きさを直す
  function applyCrop(item, next) {
    const src = item.upload.canvas;
    const a0 = src.height / src.width;
    const o = item.crop;
    const k = item.w / (1 - o.l - o.r); // 元画像の全幅（ステージ幅に対する割合）
    const off = (c) => ({
      x: ((c.l + 1 - c.r) / 2 - 0.5) * k,
      y: ((c.t + 1 - c.b) / 2 - 0.5) * k * a0,
    });
    const p = off(o), q = off(next);
    const dx = q.x - p.x, dy = q.y - p.y;
    const r = (item.rot * Math.PI) / 180;
    item.x += dx * Math.cos(r) - dy * Math.sin(r);
    item.y += dx * Math.sin(r) + dy * Math.cos(r);
    item.w = k * (1 - next.l - next.r);
    item.crop = next;
    processItem(item);
    layout(item);
    syncSliders();
    updateCropUI(item);
  }

  cropRect.addEventListener('pointerdown', (e) => {
    const item = state.selected;
    if (!item) return;
    e.preventDefault();
    const edge = e.target.dataset.e || 'move';
    cropRect.setPointerCapture(e.pointerId);
    const box = cropBox.getBoundingClientRect();
    const start = { ...item.crop };
    const sx = e.clientX, sy = e.clientY;
    const move = (ev) => {
      const dx = (ev.clientX - sx) / box.width;
      const dy = (ev.clientY - sy) / box.height;
      const n = { ...start };
      if (edge === 'move') {
        const w = 1 - start.l - start.r;
        const h = 1 - start.t - start.b;
        n.l = clamp(start.l + dx, 0, 1 - w);
        n.r = 1 - w - n.l;
        n.t = clamp(start.t + dy, 0, 1 - h);
        n.b = 1 - h - n.t;
      } else {
        if (edge.includes('w')) n.l = clamp(start.l + dx, 0, 1 - start.r - MIN_CROP);
        if (edge.includes('e')) n.r = clamp(start.r - dx, 0, 1 - start.l - MIN_CROP);
        if (edge.includes('n')) n.t = clamp(start.t + dy, 0, 1 - start.b - MIN_CROP);
        if (edge.includes('s')) n.b = clamp(start.b - dy, 0, 1 - start.t - MIN_CROP);
      }
      applyCrop(item, n);
    };
    const end = () => {
      cropRect.removeEventListener('pointermove', move);
      cropRect.removeEventListener('pointerup', end);
      cropRect.removeEventListener('pointercancel', end);
    };
    cropRect.addEventListener('pointermove', move);
    cropRect.addEventListener('pointerup', end);
    cropRect.addEventListener('pointercancel', end);
  });

  $('#cropReset').addEventListener('click', () => {
    const item = state.selected;
    if (item) applyCrop(item, { l: 0, t: 0, r: 0, b: 0 });
  });

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
    let r = Number(rotInput.value);
    const m = snapAngle(r);
    if (m !== null) { r = m; rotInput.value = String(m); }
    item.rot = r;
    rotOut.textContent = `${r}°`;
    layout(item);
    if (m !== null) showRotGuide(item, m); else hideGuides();
  });
  rotInput.addEventListener('change', hideGuides);
  $('#level').addEventListener('click', () => {
    const item = state.selected;
    if (!item) return;
    item.rot = 0;
    layout(item);
    syncSliders();
    say('水平にしました。');
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
      crop: { ...item.crop },
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

  // ホーム画面に追加したあと、オフラインでも開けるようにする
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
})();
