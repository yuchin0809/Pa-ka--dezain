(() => {
  'use strict';

  /* ---------- 定数 ---------- */

  const MAX_SRC = 1000;      // アップロード画像の長辺の上限(px)
  const DEFAULT_TOL = 20;
  const SNAP_ROT = 4;        // 回転がこの角度(°)以内なら 0°・90°… に吸着
  const SNAP_POS_PX = 6;     // 位置がこの距離(px)以内なら整列ガイドに吸着
  const MIN_CROP = 0.05;     // トリミングで最低限残す割合
  const HOODIE_CX = [0.2535, 0.729]; // 正面・背面のパーカーの中心線（ステージ幅に対する割合）
  // 追加時の初期位置（ステージ幅に対する割合）
  const SPAWN = { front: { x: 0.31, y: 0.17 }, back: { x: 0.734, y: 0.22 } };

  // 文字・線の画像は「ステージ幅 = RENDER_W px」の細かさで描く（高解像度の画面とPNG保存のため）
  const RENDER_W = 3000;
  const MAX_PX = 4096;
  const MIN_EXT = 0.004;     // 線の図形の最小サイズ（ステージ幅に対する割合）
  const LW_UNIT = 0.0015;    // 線の太さスライダー1目盛りぶん
  const ER_UNIT = 0.003;     // 消しゴムの大きさスライダー1目盛りぶん
  const HIT_PX = 8;          // 細い線・文字をタップしやすくする余裕(px)
  const HISTORY_MAX = 60;
  const TEXT_REF = 100;      // 文字の配置を計算するときの基準フォントサイズ

  const COLORS = [
    ['#ffffff', '白'], ['#111111', '黒'], ['#e53935', '赤'], ['#1e5bd8', '青'],
    ['#2e9e4f', '緑'], ['#f06fa8', 'ピンク'], ['#ff8a1f', 'オレンジ'], ['#7b3fc4', '紫'],
    ['#14213d', '紺'], ['#f7d51d', '黄'],
  ];

  const FONTS = [
    ['Noto Sans JP', 'ゴシック'], ['Noto Serif JP', '明朝'], ['Zen Maru Gothic', '丸ゴシック'],
    ['M PLUS Rounded 1c', 'やわらか丸'], ['Hachi Maru Pop', '手書きポップ'], ['Yusei Magic', '手書き風'],
    ['Potta One', 'ぽってり'], ['Dela Gothic One', '極太'], ['RocknRoll One', 'ロック'],
    ['Reggae One', 'インパクト'], ['DotGothic16', 'ドット'], ['Yuji Syuku', '筆明朝'],
  ];

  // 縦書きで90°回す文字 / 右上に寄せる句読点 / 少し寄せる小さい仮名
  const V_ROTATE = new Set([...'ー―—–-−〜～~…⋯（）()［］[]「」『』【】〈〉《》｛｝{}<>＜＞:：=＝']);
  const V_PUNCT = new Set([...'、。，．,.']);
  const V_SMALL = new Set([...'ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮ']);

  /* ---------- 要素・状態 ---------- */

  const $ = (sel) => document.querySelector(sel);
  const stage = $('#stage');
  const hoodie = $('#hoodie');
  const sel = $('#sel');
  const panel = $('#panel');
  const tray = $('#tray');
  const msgEl = $('#msg');
  const bgPreview = $('#bgPreview');
  const live = $('#live');
  const liveCtx = live.getContext('2d');
  const itemAnchor = $('#guideV'); // デザインはこの要素より前に差し込む

  const state = {
    uploads: [],
    items: [],
    selected: null,
    nextUploadId: 1,
    nextItemId: 1,
    tab: 'image',
    tool: 'pen',
    pen: { color: '#111111', width: 6 },
    eraserSize: 8,
  };

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const stageW = () => stage.clientWidth;
  const stageRatio = () => stage.clientHeight / stage.clientWidth;
  const aspectOf = (item) => item.canvas.height / item.canvas.width;
  const side = () => document.querySelector('input[name="side"]:checked').value;
  const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const toRad = (deg) => (deg * Math.PI) / 180;

  let msgTimer = 0;
  function say(text) {
    msgEl.textContent = text;
    clearTimeout(msgTimer);
    if (text) msgTimer = setTimeout(() => { msgEl.textContent = ''; }, 6000);
  }

  // 一つ押すたびにポインタを追いかける共通処理
  function track(target, e, onMove, onEnd) {
    target.setPointerCapture(e.pointerId);
    const up = (ev) => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      if (onEnd) onEnd(ev);
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  }

  /* ---------- 色えらび（パネル・手書きバー共通） ---------- */

  function makeColorPicker(root, onPick) {
    root.classList.add('cp');
    const swatches = document.createElement('div');
    swatches.className = 'swatches';
    for (const [hex, name] of COLORS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.style.background = hex;
      b.dataset.hex = hex;
      b.title = name;
      b.setAttribute('aria-label', `${name}にする`);
      b.addEventListener('click', () => onPick(hex));
      swatches.append(b);
    }
    const label = document.createElement('label');
    label.className = 'color-pick';
    label.append('好きな色');
    const input = document.createElement('input');
    input.type = 'color';
    input.value = '#e53935';
    input.addEventListener('input', () => onPick(input.value));
    label.append(input);
    root.append(swatches, label);
    return {
      set(hex) {
        for (const b of swatches.children) b.classList.toggle('on', b.dataset.hex === hex);
        if (hex) input.value = hex;
      },
    };
  }

  /* ---------- 履歴（元に戻す・やり直し） ---------- */

  const history = { stack: [], index: -1 };
  const pathIds = new WeakMap();
  let pathSeq = 0;

  function snapshotOf(item) {
    const { el, canvas, ...rest } = item;
    return {
      ...rest,
      crop: rest.crop && { ...rest.crop },
      bg: rest.bg && { ...rest.bg },
      outline: rest.outline && { ...rest.outline },
    };
  }

  // 同じ状態かどうかを比べるための文字列（paths は参照の同一性で比べる）
  function signature(snap) {
    return JSON.stringify(snap, (key, value) => {
      if (key === 'upload') return value.id;
      if (key === 'paths') {
        if (!pathIds.has(value)) pathIds.set(value, ++pathSeq);
        return pathIds.get(value);
      }
      return value;
    });
  }

  function commit() {
    const snap = state.items.map(snapshotOf);
    const sig = signature(snap);
    const cur = history.stack[history.index];
    if (cur && cur.sig === sig) return;
    history.stack.splice(history.index + 1);
    history.stack.push({ snap, sig });
    if (history.stack.length > HISTORY_MAX) history.stack.shift();
    history.index = history.stack.length - 1;
    updateHistoryUI();
  }

  function restore(snap) {
    const prevId = state.selected && state.selected.id;
    for (const it of state.items) it.el.remove();
    state.items = [];
    state.selected = null;
    // 履歴の中身を直接いじらないよう、入れ子のデータはコピーして使う
    for (const s of snap) {
      createItem({
        ...s,
        crop: s.crop && { ...s.crop },
        bg: s.bg && { ...s.bg },
        outline: s.outline && { ...s.outline },
      });
    }
    select(state.items.find((it) => it.id === prevId) || null);
  }

  function undo() {
    if (history.index <= 0) return;
    history.index -= 1;
    restore(history.stack[history.index].snap);
    updateHistoryUI();
  }

  function redo() {
    if (history.index >= history.stack.length - 1) return;
    history.index += 1;
    restore(history.stack[history.index].snap);
    updateHistoryUI();
  }

  function updateHistoryUI() {
    for (const b of document.querySelectorAll('.js-undo')) b.disabled = history.index <= 0;
    for (const b of document.querySelectorAll('.js-redo')) b.disabled = history.index >= history.stack.length - 1;
  }

  for (const b of document.querySelectorAll('.js-undo')) b.addEventListener('click', undo);
  for (const b of document.querySelectorAll('.js-redo')) b.addEventListener('click', redo);

  /* ---------- 画像のアップロード ---------- */

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
        id: state.nextUploadId++,
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
      btn.addEventListener('click', () => addImage(up));

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

  /* ---------- 画像デザインの加工（トリミング・背景透明化・色変更） ---------- */

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

  /* ---------- テキストの描画 ---------- */

  const measureCtx = document.createElement('canvas').getContext('2d');
  const fontsAsked = new Set();

  const fontSpec = (item, size) => `${item.bold ? 700 : 400} ${size}px "${item.font}", "Hiragino Sans", "Yu Gothic", sans-serif`;

  // 使うフォントを読み込んでから描きなおす（読み込み前はほかの字体で描かれてしまうため）
  function ensureFont(item) {
    if (!document.fonts) return;
    const key = `${item.bold}|${item.font}|${item.text}`;
    if (fontsAsked.has(key)) return;
    fontsAsked.add(key);
    document.fonts.load(fontSpec(item, TEXT_REF), item.text || 'あ')
      .catch(() => {})
      .then(() => {
        for (const it of state.items) {
          if (it.kind === 'text' && it.font === item.font) refresh(it);
        }
        if (state.selected) syncSliders();
      });
  }

  // 基準サイズ(TEXT_REF)でのレイアウト。大きさ nw×nh と、描く関数を返す
  function layoutText(item) {
    const F = TEXT_REF;
    const lines = (item.text || '').split('\n');
    const ot = item.outline.on ? (item.outline.width / 100) * F : 0; // 縁取りの見える太さ
    const pad = ot + F * 0.08;
    measureCtx.font = fontSpec(item, F);

    const paint = (c, str, x, y) => {
      if (ot > 0) {
        c.lineJoin = 'round';
        c.lineWidth = ot * 2;
        c.strokeStyle = item.outline.color;
        c.strokeText(str, x, y);
      }
      c.fillStyle = item.color;
      c.fillText(str, x, y);
    };

    if (!item.vertical) {
      const lh = F * 1.3;
      const widths = lines.map((l) => measureCtx.measureText(l).width);
      const maxW = Math.max(F * 0.5, ...widths);
      return {
        nw: maxW + pad * 2,
        nh: lines.length * lh + pad * 2,
        draw(c) {
          c.font = fontSpec(item, F);
          c.textBaseline = 'middle';
          c.textAlign = 'left';
          lines.forEach((line, i) => {
            const free = maxW - widths[i];
            const dx = item.align === 'left' ? 0 : item.align === 'right' ? free : free / 2;
            paint(c, line, pad + dx, pad + (i + 0.5) * lh);
          });
        },
      };
    }

    // 縦書き: 1行ぶんが1列。列は右から左へ並べる
    const cols = lines.map((l) => Array.from(l));
    const cell = F * 1.05;
    const colW = F * 1.3;
    const maxN = Math.max(1, ...cols.map((c) => c.length));
    return {
      nw: cols.length * colW + pad * 2,
      nh: maxN * cell + pad * 2,
      draw(c) {
        c.font = fontSpec(item, F);
        c.textBaseline = 'middle';
        c.textAlign = 'center';
        const nw = cols.length * colW + pad * 2;
        cols.forEach((col, j) => {
          const cx = nw - pad - (j + 0.5) * colW;
          const free = (maxN - col.length) * cell;
          const dy = item.align === 'left' ? 0 : item.align === 'right' ? free : free / 2;
          col.forEach((ch, i) => {
            c.save();
            c.translate(cx, pad + dy + (i + 0.5) * cell);
            if (V_ROTATE.has(ch)) c.rotate(Math.PI / 2);
            else if (V_PUNCT.has(ch)) c.translate(F * 0.55, -F * 0.55);
            else if (V_SMALL.has(ch)) c.translate(F * 0.1, -F * 0.1);
            paint(c, ch, 0, 0);
            c.restore();
          });
        });
      },
    };
  }

  function renderText(item) {
    ensureFont(item);
    const lay = layoutText(item);
    // 文字の大きさ（ステージ幅に対する割合÷基準ピクセル）を保ったまま、箱の大きさを決めなおす
    const k = item.nw ? item.w / item.nw : null;
    item.nw = lay.nw;
    if (k !== null) item.w = clamp(k * lay.nw, 0.03, 1);
    const hStage = (item.w * lay.nh) / lay.nw;
    const ppS = Math.min(RENDER_W, MAX_PX / Math.max(item.w, hStage));
    const c = item.canvas;
    c.width = Math.max(1, Math.ceil(item.w * ppS));
    c.height = Math.max(1, Math.ceil(hStage * ppS));
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.scale(c.width / lay.nw, c.height / lay.nh);
    lay.draw(ctx);
  }

  /* ---------- 手書きの線の描画 ---------- */

  // paths: 点の列の配列。map で点を画面上の座標に変換して描く
  function drawPaths(ctx, paths, map, lwPx, color, smooth) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = lwPx;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    for (const path of paths) {
      const pts = path.map(map);
      if (pts.length === 1) {
        ctx.beginPath();
        ctx.arc(pts[0][0], pts[0][1], lwPx / 2, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      if (smooth && pts.length > 2) {
        for (let i = 1; i < pts.length - 1; i++) {
          ctx.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
        }
        ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
      } else {
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      }
      ctx.stroke();
    }
  }

  // 線の画像: 図形のまわりに線の太さの半分だけ余白をとる。w は余白を含む箱の幅
  function renderStroke(item) {
    item.cw = Math.max(item.w - item.lw, MIN_EXT);
    item.w = item.cw + item.lw;
    const hStage = item.cw * item.ar + item.lw;
    const ppS = Math.min(RENDER_W, MAX_PX / Math.max(item.w, hStage));
    const c = item.canvas;
    c.width = Math.max(1, Math.round(item.w * ppS));
    c.height = Math.max(1, Math.round(hStage * ppS));
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const half = item.lw / 2;
    drawPaths(
      ctx,
      item.paths,
      ([x, y]) => [(half + x * item.cw) * ppS, (half + y * item.cw) * ppS],
      item.lw * ppS,
      item.color,
      item.shape === 'pen',
    );
  }

  /* ---------- デザイン（画像・文字・線）の共通処理 ---------- */

  const KIND_DEFAULTS = {
    image: () => ({ tint: null, bg: null, tol: DEFAULT_TOL, crop: { l: 0, t: 0, r: 0, b: 0 } }),
    text: () => ({
      text: 'テキスト', font: 'Noto Sans JP', color: '#111111', bold: false, vertical: false,
      align: 'center', outline: { on: false, color: '#ffffff', width: 8 }, nw: 0,
    }),
    stroke: () => ({ shape: 'pen', paths: [], cw: 0.1, ar: 1, lw: 0.009, color: '#111111' }),
  };

  function renderItem(item) {
    if (item.kind === 'image') processItem(item);
    else if (item.kind === 'text') renderText(item);
    else renderStroke(item);
  }

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

  function refresh(item) {
    renderItem(item);
    layout(item);
  }

  function restack() {
    state.items.forEach((it, i) => { it.el.style.zIndex = String(i + 1); });
  }

  function createItem(props) {
    const item = {
      id: state.nextItemId,
      x: 0.3, y: 0.17, w: 0.14, rot: 0,
      ...KIND_DEFAULTS[props.kind](),
      ...props,
      canvas: document.createElement('canvas'),
      el: document.createElement('div'),
    };
    state.nextItemId = Math.max(state.nextItemId, item.id) + 1;
    item.el.className = 'item';
    item.el.append(item.canvas);
    stage.insertBefore(item.el, itemAnchor);
    state.items.push(item);
    renderItem(item);
    restack();
    layout(item);
    return item;
  }

  // 追加するときの位置（選んだ面のむね元あたりから、少しずつずらす）
  function spawnPoint() {
    const face = side();
    const n = state.items.filter((it) => (it.x < 0.5) === (face === 'front')).length;
    const off = (n % 6) * 0.014;
    return { face, x: SPAWN[face].x + off, y: SPAWN[face].y + off };
  }

  function addImage(upload) {
    const aspect = upload.canvas.height / upload.canvas.width;
    const p = spawnPoint();
    const item = createItem({
      kind: 'image', upload, w: Math.min(0.14, 0.2 / aspect), x: p.x, y: p.y,
    });
    select(item);
    commit();
    say(`${p.face === 'front' ? '正面' : '背面'}に追加しました。ドラッグで動かせます。`);
  }

  function addText() {
    const p = spawnPoint();
    const item = createItem({ kind: 'text', w: 0.2, x: p.x, y: p.y + 0.03 });
    select(item);
    commit();
    say(`${p.face === 'front' ? '正面' : '背面'}にテキストを追加しました。パネルで文字を書きかえられます。`);
    const input = $('#textInput');
    input.focus();
    input.select();
  }

  function removeItem(item) {
    item.el.remove();
    state.items = state.items.filter((it) => it !== item);
    if (state.selected === item) select(null);
    restack();
  }

  /* ---------- 選択・タップ判定 ---------- */

  function select(item) {
    state.selected = item;
    if (item) layoutBox(sel, item);
    sel.hidden = !item || drawingActive();
    syncPanel();
  }

  // 画面上の点を、デザインの箱の中心からの位置（回転を戻したもの）に直す
  function toLocal(item, X, Y) {
    const dx = X - item.x;
    const dy = Y - item.y;
    const r = toRad(item.rot);
    return { x: dx * Math.cos(r) + dy * Math.sin(r), y: -dx * Math.sin(r) + dy * Math.cos(r) };
  }

  // タップした場所にある一番手前のデザインを返す（透明な所は素通り。細い線・文字は少し広めに判定）
  function hitTest(clientX, clientY) {
    const rect = stage.getBoundingClientRect();
    const s = rect.width;
    const X = (clientX - rect.left) / s;
    const Y = (clientY - rect.top) / s;
    for (let i = state.items.length - 1; i >= 0; i--) {
      const it = state.items[i];
      const L = toLocal(it, X, Y);
      const hb = it.w * aspectOf(it);
      const tol = (it.kind === 'image' ? 2 : HIT_PX) / s;
      if (Math.abs(L.x) > it.w / 2 + tol || Math.abs(L.y) > hb / 2 + tol) continue;
      const c = it.canvas;
      const ppx = c.width / it.w;
      const u = Math.round((L.x + it.w / 2) * ppx);
      const v = Math.round((L.y + hb / 2) * (c.height / hb));
      const r = Math.ceil(tol * ppx);
      const x0 = clamp(u - r, 0, c.width - 1);
      const y0 = clamp(v - r, 0, c.height - 1);
      const x1 = clamp(u + r, 0, c.width - 1);
      const y1 = clamp(v + r, 0, c.height - 1);
      const data = c.getContext('2d', { willReadFrequently: true }).getImageData(x0, y0, x1 - x0 + 1, y1 - y0 + 1).data;
      for (let k = 3; k < data.length; k += 4) if (data[k] > 30) return it;
    }
    return null;
  }

  /* ---------- 整列ガイド・吸着 ---------- */

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
    const r = toRad(item.rot);
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

  /* ---------- 移動・拡大縮小・回転 ---------- */

  function startMove(e, item) {
    e.preventDefault();
    select(item);
    const sx = e.clientX, sy = e.clientY, ox = item.x, oy = item.y;
    track(stage, e, (ev) => {
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
    }, () => {
      hideGuides();
      commit();
    });
  }

  $('#hRot').addEventListener('pointerdown', (e) => {
    const item = state.selected;
    if (!item) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = stage.getBoundingClientRect();
    const cx = rect.left + item.x * stageW();
    const cy = rect.top + item.y * stageW();
    const d0 = Math.max(1, Math.hypot(e.clientX - cx, e.clientY - cy));
    const a0 = Math.atan2(e.clientY - cy, e.clientX - cx);
    const w0 = item.w, r0 = item.rot;
    track(e.currentTarget, e, (ev) => {
      const d = Math.hypot(ev.clientX - cx, ev.clientY - cy);
      const a = Math.atan2(ev.clientY - cy, ev.clientX - cx);
      item.w = clamp((w0 * d) / d0, 0.03, 1);
      let r = r0 + ((a - a0) * 180) / Math.PI;
      r = Math.round(((r + 540) % 360) - 180);
      const m = ev.altKey ? null : snapAngle(r);
      if (m !== null) { r = m; showRotGuide(item, m); } else { guideR.hidden = true; }
      item.rot = r;
      if (item.kind !== 'image') renderItem(item);
      layout(item);
      syncSliders();
    }, () => {
      hideGuides();
      commit();
    });
  });

  $('#hDel').addEventListener('click', () => {
    if (!state.selected) return;
    removeItem(state.selected);
    commit();
  });

  // ステージを触ったとき: 手書き中なら描く。そうでなければデザインを選んで動かす
  stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#sel')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // 入力欄に文字を入れている途中なら、確定させてからデザインを触る
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body) active.blur();
    if (drawingActive()) { startDraw(e); return; }
    const item = hitTest(e.clientX, e.clientY);
    if (item) startMove(e, item);
    else select(null);
  });

  document.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
    } else if (mod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      redo();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && state.selected) {
      e.preventDefault();
      removeItem(state.selected);
      commit();
    }
  });

  /* ---------- 設定パネル（共通） ---------- */

  const sizeInput = $('#size');
  const rotOut = $('#rotOut');
  const rotInput = $('#rot');
  const lwInput = $('#lw');

  function syncSliders() {
    const item = state.selected;
    if (!item) return;
    sizeInput.value = String(Math.round(item.w * 100));
    rotInput.value = String(item.rot);
    rotOut.textContent = `${item.rot}°`;
  }

  function syncPanel() {
    const item = state.selected;
    panel.hidden = !item;
    if (!item) return;
    for (const el of panel.querySelectorAll('[data-kinds]')) {
      el.hidden = !el.dataset.kinds.split(' ').includes(item.kind);
    }
    syncSliders();
    if (item.kind === 'image') syncImagePanel(item);
    else if (item.kind === 'text') syncTextPanel(item);
    else syncStrokePanel(item);
  }

  sizeInput.addEventListener('input', () => {
    const item = state.selected;
    if (!item) return;
    item.w = Number(sizeInput.value) / 100;
    if (item.kind !== 'image') renderItem(item);
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
    const snap = snapshotOf(item);
    delete snap.id;
    select(createItem({
      ...snap,
      x: clamp(item.x + 0.02, 0, 1),
      y: clamp(item.y + 0.02, 0, stageRatio()),
    }));
  });
  $('#del').addEventListener('click', () => state.selected && removeItem(state.selected));

  $('#clearAll').addEventListener('click', () => {
    if (!state.items.length) return;
    if (!confirm('重ねたデザインをすべて消しますか？')) return;
    for (const it of [...state.items]) removeItem(it);
    commit();
  });

  // パネルの操作が終わったら履歴に残す（変化がなければ残らない）
  panel.addEventListener('change', commit);
  panel.addEventListener('click', (e) => {
    if (e.target.closest('button')) commit();
  });

  /* ---------- 設定パネル（画像） ---------- */

  const tolInput = $('#tol');
  const bgChip = $('#bgChip');
  const tintPicker = makeColorPicker($('#tintPicker'), (hex) => setTint(hex));

  function drawBgPreview(item) {
    const src = item.upload.canvas;
    const k = Math.min(1, 240 / src.width, 160 / src.height);
    bgPreview.width = Math.max(1, Math.round(src.width * k));
    bgPreview.height = Math.max(1, Math.round(src.height * k));
    bgPreview.getContext('2d').drawImage(src, 0, 0, bgPreview.width, bgPreview.height);
  }

  function syncImagePanel(item) {
    tolInput.value = String(item.tol);
    tintPicker.set(item.tint);
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

  function setTint(hex) {
    const item = state.selected;
    if (!item || item.kind !== 'image') return;
    // 背景つきの画像(JPGなど)は、背景ごと塗りつぶされないよう先に背景を透明にする
    if (!item.tint && !item.bg && !item.upload.alpha && item.upload.corner) {
      item.bg = item.upload.corner;
      say('背景が一色だったので、先に背景を透明にしました（下の「解除」で戻せます）。');
    }
    item.tint = hex;
    processItem(item);
    syncImagePanel(item);
  }

  $('#tintReset').addEventListener('click', () => {
    const item = state.selected;
    if (!item) return;
    item.tint = null;
    processItem(item);
    syncImagePanel(item);
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
    syncImagePanel(item);
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
    syncImagePanel(item);
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
    syncImagePanel(item);
  });

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
    const r = toRad(item.rot);
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
    const box = cropBox.getBoundingClientRect();
    const start = { ...item.crop };
    const sx = e.clientX, sy = e.clientY;
    track(cropRect, e, (ev) => {
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
    }, commit);
  });

  $('#cropReset').addEventListener('click', () => {
    const item = state.selected;
    if (item) applyCrop(item, { l: 0, t: 0, r: 0, b: 0 });
  });

  /* ---------- 設定パネル（テキスト） ---------- */

  const textInput = $('#textInput');
  const fontList = $('#fontList');
  const tBold = $('#tBold');
  const tVert = $('#tVert');
  const tOutline = $('#tOutline');
  const outlineOpts = $('#outlineOpts');
  const outlineW = $('#outlineW');
  const alignBtns = [...document.querySelectorAll('#alignSeg button')];

  const textColor = makeColorPicker($('#textColor'), (hex) => editText((it) => { it.color = hex; }));
  const outlineColor = makeColorPicker($('#outlineColor'), (hex) => editText((it) => { it.outline.color = hex; }));

  for (const [family, label] of FONTS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'font-chip';
    b.dataset.font = family;
    b.style.fontFamily = `"${family}", sans-serif`;
    b.textContent = label;
    b.addEventListener('click', () => editText((it) => { it.font = family; }));
    fontList.append(b);
  }

  // 文字の設定を変えたあとに、描きなおして画面に反映する
  function editText(change) {
    const item = state.selected;
    if (!item || item.kind !== 'text') return;
    change(item);
    refresh(item);
    syncTextPanel(item);
    syncSliders();
  }

  function syncTextPanel(item) {
    if (textInput.dataset.itemId !== String(item.id) || document.activeElement !== textInput) {
      textInput.value = item.text;
      textInput.dataset.itemId = String(item.id);
    }
    for (const b of fontList.children) b.classList.toggle('on', b.dataset.font === item.font);
    textColor.set(item.color);
    outlineColor.set(item.outline.color);
    tBold.setAttribute('aria-pressed', String(item.bold));
    tVert.setAttribute('aria-pressed', String(item.vertical));
    tOutline.setAttribute('aria-pressed', String(item.outline.on));
    outlineOpts.hidden = !item.outline.on;
    outlineW.value = String(item.outline.width);
    const names = item.vertical ? { left: '上', center: '中央', right: '下' } : { left: '左', center: '中央', right: '右' };
    for (const b of alignBtns) {
      b.textContent = names[b.dataset.align];
      b.setAttribute('aria-pressed', String(b.dataset.align === item.align));
    }
  }

  textInput.addEventListener('input', () => editText((it) => { it.text = textInput.value; }));
  tBold.addEventListener('click', () => editText((it) => { it.bold = !it.bold; }));
  tVert.addEventListener('click', () => editText((it) => { it.vertical = !it.vertical; }));
  tOutline.addEventListener('click', () => editText((it) => { it.outline.on = !it.outline.on; }));
  outlineW.addEventListener('input', () => editText((it) => { it.outline.width = Number(outlineW.value); }));
  for (const b of alignBtns) b.addEventListener('click', () => editText((it) => { it.align = b.dataset.align; }));

  /* ---------- 設定パネル（手書きの線） ---------- */

  const strokeColor = makeColorPicker($('#strokeColor'), (hex) => editStroke((it) => { it.color = hex; }));

  function editStroke(change) {
    const item = state.selected;
    if (!item || item.kind !== 'stroke') return;
    change(item);
    refresh(item);
    syncStrokePanel(item);
    syncSliders();
  }

  function syncStrokePanel(item) {
    strokeColor.set(item.color);
    lwInput.value = String(Math.round(item.lw / LW_UNIT));
  }

  lwInput.addEventListener('input', () => editStroke((it) => {
    // 図形の大きさは変えずに、線だけ太く・細くする
    const lw = Number(lwInput.value) * LW_UNIT;
    it.w = it.cw + lw;
    it.lw = lw;
  }));

  /* ---------- 手書きツール ---------- */

  const drawColor = makeColorPicker($('#drawColor'), (hex) => {
    state.pen.color = hex;
    drawColor.set(hex);
  });
  const drawW = $('#drawW');
  const toolBtns = [...document.querySelectorAll('#tools button')];

  const drawingActive = () => state.tab === 'draw' && state.tool !== 'select';

  function setTool(tool) {
    state.tool = tool;
    for (const b of toolBtns) b.setAttribute('aria-pressed', String(b.dataset.tool === tool));
    $('#drawColor').hidden = tool === 'eraser' || tool === 'select';
    $('#drawWRow').hidden = tool === 'select';
    $('#drawWLabel').textContent = tool === 'eraser' ? '消しゴムの大きさ' : '線の太さ';
    drawW.value = String(tool === 'eraser' ? state.eraserSize : state.pen.width);
    updateMode();
  }

  drawW.addEventListener('input', () => {
    if (state.tool === 'eraser') state.eraserSize = Number(drawW.value);
    else state.pen.width = Number(drawW.value);
  });
  for (const b of toolBtns) b.addEventListener('click', () => setTool(b.dataset.tool));

  // 手書き中は、デザインを選ぶハンドルなどを隠して、ステージ全体で描けるようにする
  function updateMode() {
    const d = drawingActive();
    stage.classList.toggle('drawing', d);
    hideGuides();
    clearLive();
    if (d) select(null);
    else sel.hidden = !state.selected;
  }

  function sizeLive() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    live.width = Math.max(1, Math.round(stage.clientWidth * dpr));
    live.height = Math.max(1, Math.round(stage.clientHeight * dpr));
  }

  function clearLive() {
    liveCtx.clearRect(0, 0, live.width, live.height);
  }

  // 描いている途中のプレビュー（ステージ幅を1とした座標で受け取る）
  function drawLive(paths, color, lw, smooth, ring) {
    clearLive();
    const k = live.width; // ステージ幅 = live.width px
    drawPaths(liveCtx, paths, ([x, y]) => [x * k, y * k], lw * k, color, smooth);
    if (ring) {
      liveCtx.beginPath();
      liveCtx.arc(ring.x * k, ring.y * k, ring.r * k, 0, Math.PI * 2);
      liveCtx.lineWidth = Math.max(1, k / 600);
      liveCtx.strokeStyle = 'rgba(37, 99, 235, 0.9)';
      liveCtx.stroke();
    }
  }

  // ペンの軌跡や図形の2点から、線の点列を作る
  function shapePaths(tool, a, b, shift, free) {
    let [x0, y0] = a;
    let [x1, y1] = b;
    const dx = x1 - x0, dy = y1 - y0;
    if (tool === 'line') {
      const len = Math.hypot(dx, dy);
      const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
      const step = shift ? 45 : 90;
      const m = Math.round(ang / step) * step;
      if (!free && (shift || Math.abs(ang - m) <= SNAP_ROT)) {
        x1 = x0 + len * Math.cos(toRad(m));
        y1 = y0 + len * Math.sin(toRad(m));
      }
      return [[[x0, y0], [x1, y1]]];
    }
    if (shift) {
      const sz = Math.max(Math.abs(dx), Math.abs(dy));
      x1 = x0 + Math.sign(dx || 1) * sz;
      y1 = y0 + Math.sign(dy || 1) * sz;
    }
    if (tool === 'rect') return [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]];
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0) / 2, ry = (y1 - y0) / 2;
    const n = 96;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * Math.PI * 2;
      pts.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
    }
    return [pts];
  }

  // ステージ上の線（ステージ幅を1とした座標）から、線のデザインを作る
  function strokeProps(paths, shape, color, lw) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const path of paths) {
      for (const [x, y] of path) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
    }
    const bw = Math.max(maxX - minX, MIN_EXT);
    const bh = Math.max(maxY - minY, MIN_EXT);
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const left = cx - bw / 2, top = cy - bh / 2;
    return {
      kind: 'stroke', shape, color, lw,
      paths: paths.map((p) => p.map(([x, y]) => [(x - left) / bw, (y - top) / bw])),
      cw: bw, ar: bh / bw, x: cx, y: cy, w: bw + lw,
    };
  }

  // 消しゴム: 丸い範囲の中にある点を取り除き、線を途中で切る
  function erasePaths(paths, q, rr) {
    const step = rr / 2;
    const out = [];
    let changed = false;
    for (const path of paths) {
      const pts = [];
      path.forEach((p, i) => {
        if (i > 0) {
          const [ax, ay] = path[i - 1];
          const n = Math.ceil(Math.hypot(p[0] - ax, p[1] - ay) / step);
          for (let k = 1; k < n; k++) pts.push([ax + ((p[0] - ax) * k) / n, ay + ((p[1] - ay) * k) / n]);
        }
        pts.push(p);
      });
      if (!pts.some((p) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= rr)) { out.push(path); continue; }
      changed = true;
      let cur = [];
      for (const p of pts) {
        if (Math.hypot(p[0] - q[0], p[1] - q[1]) <= rr) {
          if (cur.length > 1) out.push(cur);
          cur = [];
        } else {
          cur.push(p);
        }
      }
      if (cur.length > 1) out.push(cur);
    }
    return changed ? out : paths;
  }

  function eraseDisc(p, R) {
    for (const item of [...state.items]) {
      if (item.kind !== 'stroke') continue;
      const L = toLocal(item, p[0], p[1]);
      const hb = item.w * aspectOf(item);
      const q = [(L.x + item.w / 2 - item.lw / 2) / item.cw, (L.y + hb / 2 - item.lw / 2) / item.cw];
      const rr = (R + item.lw / 2) / item.cw;
      if (q[0] < -rr || q[0] > 1 + rr || q[1] < -rr || q[1] > item.ar + rr) continue;
      const next = erasePaths(item.paths, q, rr);
      if (next === item.paths) continue;
      if (!next.length) {
        removeItem(item);
      } else {
        item.paths = next;
        renderItem(item);
      }
    }
  }

  function startDraw(e) {
    if (!e.isPrimary) return;
    e.preventDefault();
    const tool = state.tool;
    const rect = stage.getBoundingClientRect();
    const ratio = rect.height / rect.width;
    const at = (ev) => [
      clamp((ev.clientX - rect.left) / rect.width, 0, 1),
      clamp((ev.clientY - rect.top) / rect.width, 0, ratio),
    ];
    const p0 = at(e);

    if (tool === 'eraser') {
      const R = state.eraserSize * ER_UNIT;
      let last = p0;
      eraseDisc(p0, R);
      drawLive([], '#000', 0, false, { x: p0[0], y: p0[1], r: R });
      track(stage, e, (ev) => {
        const p = at(ev);
        const n = Math.max(1, Math.ceil(Math.hypot(p[0] - last[0], p[1] - last[1]) / (R / 2)));
        for (let k = 1; k <= n; k++) {
          eraseDisc([last[0] + ((p[0] - last[0]) * k) / n, last[1] + ((p[1] - last[1]) * k) / n], R);
        }
        last = p;
        drawLive([], '#000', 0, false, { x: p[0], y: p[1], r: R });
      }, () => {
        clearLive();
        commit();
      });
      return;
    }

    const lw = state.pen.width * LW_UNIT;
    const color = state.pen.color;
    const pts = [p0];
    let cur = p0;
    const currentPaths = (ev) => (tool === 'pen' ? [pts] : shapePaths(tool, p0, cur, ev.shiftKey, ev.altKey));
    drawLive(currentPaths(e), color, lw, tool === 'pen');
    track(stage, e, (ev) => {
      if (tool === 'pen') {
        for (const ce of ev.getCoalescedEvents ? ev.getCoalescedEvents() : [ev]) {
          const q = at(ce);
          const last = pts[pts.length - 1];
          if (Math.hypot(q[0] - last[0], q[1] - last[1]) >= 0.0012) pts.push(q);
        }
      } else {
        cur = at(ev);
      }
      drawLive(currentPaths(ev), color, lw, tool === 'pen');
    }, (ev) => {
      const paths = currentPaths(ev);
      clearLive();
      const moved = Math.hypot(cur[0] - p0[0], cur[1] - p0[1]);
      if (tool !== 'pen' && moved < 0.004) return; // 図形は、ほとんど動かしていなければ描かない
      createItem(strokeProps(paths, tool, color, lw));
      commit();
    });
  }

  /* ---------- 下のタブ ---------- */

  const tabBtns = [...document.querySelectorAll('.tab')];
  const panes = [...document.querySelectorAll('.tabpane')];

  function setTab(name) {
    state.tab = name;
    for (const t of tabBtns) t.setAttribute('aria-selected', String(t.dataset.tab === name));
    for (const p of panes) p.hidden = p.dataset.pane !== name;
    updateMode();
  }
  for (const t of tabBtns) t.addEventListener('click', () => setTab(t.dataset.tab));
  $('#addText').addEventListener('click', addText);

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
      ctx.rotate(toRad(it.rot));
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
    sizeLive();
    for (const it of state.items) layout(it);
    if (state.selected) layoutBox(sel, state.selected);
  }).observe(stage);

  // 下のバーの高さに合わせて、ページの余白を決める
  const tabbar = $('#tabbar');
  new ResizeObserver(() => {
    document.documentElement.style.setProperty('--bar-h', `${tabbar.offsetHeight}px`);
  }).observe(tabbar);

  renderTray();
  setTool('pen');
  setTab('image');
  drawColor.set(state.pen.color);
  commit();

  // ホーム画面に追加したあと、オフラインでも開けるようにする
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
})();
