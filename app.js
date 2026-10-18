(() => {
  'use strict';

  /* ---------- 定数 ---------- */

  const MAX_SRC = 1000;      // アップロード画像の長辺の上限(px)
  const DEFAULT_TOL = 20;
  const DRAFT_PX = 420;      // スライダー操作中の画像処理に使う、小さい版の長辺(px)
  const SNAP_ROT = 4;        // 回転がこの角度(°)以内なら 0°・90°… に吸着
  const SNAP_POS_PX = 6;     // 位置がこの距離(px)以内なら整列ガイドに吸着
  const MIN_CROP = 0.05;     // トリミングで最低限残す割合
  const HOODIE_CX = [0.2535, 0.729]; // 正面・背面のパーカーの中心線（ステージ幅に対する割合）
  // 追加時の初期位置（ステージ幅に対する割合）
  const SPAWN = { front: { x: 0.31, y: 0.17 }, back: { x: 0.734, y: 0.22 } };

  // 文字・線の画像は「ステージ幅 = RENDER_W px」の細かさで描く（PNG保存は1949px幅なので、それ以上は不要）
  const RENDER_W = 2000;
  const MAX_PX = 2560;
  const MIN_EXT = 0.004;     // 線の図形の最小サイズ（ステージ幅に対する割合）
  const LW_UNIT = 0.0015;    // 線の太さスライダー1目盛りぶん
  const ER_UNIT = 0.003;     // 消しゴムの大きさスライダー1目盛りぶん
  const HIT_PX = 8;          // 細い線・文字をタップしやすくする余裕(px)
  const HISTORY_MAX = 60;
  const TEXT_REF = 100;      // 文字の配置を計算するときの基準フォントサイズ
  const RECENT_KEY = 'parka-recent-colors';
  const RECENT_MAX = 8;
  const SAVE_DELAY = 700;    // 自動保存までの待ち時間(ms)
  const DB_NAME = 'parka-1i';

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

  // スタンプの図形（100×100 の中に収めた SVG パス）
  const polyPath = (pts) => `M${pts.map((p) => p.join(' ')).join(' L')} Z`;
  const fix = (n) => Math.round(n * 100) / 100;
  const polar = (cx, cy, r, deg) => [fix(cx + r * Math.cos((deg * Math.PI) / 180)), fix(cy + r * Math.sin((deg * Math.PI) / 180))];
  const starPath = (n, R, r, cx = 50, cy = 50) => polyPath(
    Array.from({ length: n * 2 }, (_, i) => polar(cx, cy, i % 2 === 0 ? R : r, (180 * i) / n - 90)),
  );
  const circlePath = (cx, cy, r) => `M${cx - r} ${cy} A${r} ${r} 0 1 0 ${cx + r} ${cy} A${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;
  const sunPath = () => circlePath(50, 50, 24) + Array.from({ length: 8 }, (_, k) => polyPath([
    polar(50, 50, 47, k * 45), polar(50, 50, 33, k * 45 - 10), polar(50, 50, 33, k * 45 + 10),
  ])).join('');
  const flowerPath = () => Array.from({ length: 6 }, (_, k) => {
    const [x, y] = polar(50, 50, 27, k * 60 - 90);
    return circlePath(x, y, 19);
  }).join('') + circlePath(50, 50, 16);

  const STAMPS = [
    { id: 'heart', label: 'ハート', d: 'M50 90 C18 66 6 48 6 31 C6 17 17 7 30 7 C39 7 46 12 50 20 C54 12 61 7 70 7 C83 7 94 17 94 31 C94 48 82 66 50 90 Z' },
    { id: 'star', label: '星', d: starPath(5, 48, 20, 50, 53) },
    { id: 'burst', label: 'バースト', d: starPath(12, 48, 35) },
    { id: 'sparkle', label: 'キラキラ', d: 'M50 4 C54 34 66 46 96 50 C66 54 54 66 50 96 C46 66 34 54 4 50 C34 46 46 34 50 4 Z' },
    { id: 'circle', label: '丸', d: circlePath(50, 50, 44) },
    { id: 'ring', label: 'リング', d: circlePath(50, 50, 44) + circlePath(50, 50, 28), rule: 'evenodd' },
    { id: 'square', label: '四角', d: 'M14 6 H86 A8 8 0 0 1 94 14 V86 A8 8 0 0 1 86 94 H14 A8 8 0 0 1 6 86 V14 A8 8 0 0 1 14 6 Z' },
    { id: 'triangle', label: '三角', d: polyPath([[50, 8], [94, 88], [6, 88]]) },
    { id: 'diamond', label: 'ダイヤ', d: polyPath([[50, 4], [94, 50], [50, 96], [6, 50]]) },
    { id: 'hexagon', label: '六角形', d: polyPath([0, 60, 120, 180, 240, 300].map((a) => polar(50, 50, 46, a))) },
    { id: 'flower', label: '花', d: flowerPath() },
    { id: 'sun', label: '太陽', d: sunPath() },
    { id: 'moon', label: '月', d: 'M58 6 A44 44 0 1 0 94 64 A36 36 0 0 1 58 6 Z' },
    { id: 'cloud', label: '雲', d: 'M26 82 A20 20 0 0 1 22 42 A24 24 0 0 1 66 30 A24 24 0 0 1 78 82 Z' },
    { id: 'bolt', label: 'いなずま', d: polyPath([[58, 4], [18, 56], [46, 56], [38, 96], [84, 38], [54, 38]]) },
    { id: 'crown', label: '王冠', d: polyPath([[8, 82], [8, 26], [30, 50], [50, 18], [70, 50], [92, 26], [92, 82]]) },
    { id: 'bubble', label: '吹き出し', d: 'M50 10 C75 10 94 26 94 45 C94 64 75 80 50 80 C46 80 42 80 38 79 L18 92 L24 74 C13 67 6 56 6 45 C6 26 25 10 50 10 Z' },
    { id: 'bubble2', label: '角の吹き出し', d: 'M14 10 H86 A8 8 0 0 1 94 18 V62 A8 8 0 0 1 86 70 H48 L26 92 L30 70 H14 A8 8 0 0 1 6 62 V18 A8 8 0 0 1 14 10 Z' },
    { id: 'arrow', label: '矢印', d: polyPath([[4, 36], [56, 36], [56, 12], [96, 50], [56, 88], [56, 64], [4, 64]]) },
    { id: 'check', label: 'チェック', d: polyPath([[8, 54], [22, 40], [40, 58], [78, 16], [92, 30], [40, 86]]) },
    { id: 'plus', label: 'プラス', d: polyPath([[38, 6], [62, 6], [62, 38], [94, 38], [94, 62], [62, 62], [62, 94], [38, 94], [38, 62], [6, 62], [6, 38], [38, 38]]) },
    { id: 'note', label: '音符', d: 'M44 8 L54 8 C58 30 84 34 80 58 C76 44 62 42 54 38 V76 A17 13 0 1 1 44 66 Z' },
    { id: 'paw', label: '肉球', d: circlePath(22, 42, 11) + circlePath(40, 24, 11) + circlePath(60, 24, 11) + circlePath(78, 42, 11)
      + 'M50 46 C66 46 80 62 80 76 C80 88 70 92 50 92 C30 92 20 88 20 76 C20 62 34 46 50 46 Z' },
    { id: 'smile', label: 'にっこり', d: circlePath(50, 50, 44) + circlePath(35, 40, 7) + circlePath(65, 40, 7) + 'M25 58 Q50 94 75 58 Q50 76 25 58 Z', rule: 'evenodd' },
  ].map((st) => ({ ...st, path: new Path2D(st.d) }));
  const STAMP_MAP = Object.fromEntries(STAMPS.map((st) => [st.id, st]));

  const EMOJIS = [...'😀😂😍😎🥳🤩😆🥰😜🤗😭😡🥺😴🤔👍👏🙌💪🔥✨💯🎉🎊🏆🥇👑⭐🌟💖❤🧡💛💚💙💜🖤🤍🎵🎶⚽🏀⚾🏐🎨📚✏🎒🍀🌸🌻🌈☀🌙🐶🐱🐼🦁🐰🦊🐯🐻🍎🍕🍔🍰🍦'];

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
    pen: { color: '#111111', width: 6, fill: false },
    eraserSize: 8,
    stampColor: '#e53935',
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

  // 色の変換（h: 0〜360, s・l: 0〜1）
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0, s = 0;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return [h, s, l];
  }

  function hslToRgb(h, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
      : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
  }

  const toHex = (rgb) => `#${rgb.map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('')}`;
  const hexToHsl = (hex) => rgbToHsl(...hexToRgb(hex));

  // 「その他の色」で選んだ色を、あとからワンタップで選べるように覚えておく
  const pickers = [];
  const loadRecent = () => {
    try {
      const a = JSON.parse(localStorage.getItem(RECENT_KEY));
      return Array.isArray(a) ? a.filter((x) => /^#[0-9a-f]{6}$/i.test(x)).slice(0, RECENT_MAX) : [];
    } catch {
      return [];
    }
  };
  let recent = loadRecent();

  function addRecent(hex) {
    const h = hex.toLowerCase();
    recent = [h, ...recent.filter((x) => x !== h)].slice(0, RECENT_MAX);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent)); } catch { /* 保存できなくても困らない */ }
    for (const pk of pickers) pk.refreshRecent();
  }

  // onPick(hex) は、色を選ぶたび（スライダーを動かしている最中も）呼ばれる
  function makeColorPicker(root, onPick) {
    root.classList.add('cp');
    let current = '#e53935';
    let fromSlider = false;
    let recentTimer = 0;

    const swatches = document.createElement('div');
    swatches.className = 'swatches';
    const makeSwatch = (hex, name) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.style.background = hex;
      b.dataset.hex = hex;
      b.title = name;
      b.setAttribute('aria-label', `${name}にする`);
      b.addEventListener('click', () => onPick(hex));
      return b;
    };
    for (const [hex, name] of COLORS) swatches.append(makeSwatch(hex, name));

    const otherBtn = document.createElement('button');
    otherBtn.type = 'button';
    otherBtn.className = 'other-btn';
    otherBtn.setAttribute('aria-expanded', 'false');
    otherBtn.innerHTML = '<i class="rainbow"></i>その他の色';

    const recentRow = document.createElement('div');
    recentRow.className = 'recent';

    const custom = document.createElement('div');
    custom.className = 'cp-custom';
    custom.hidden = true;
    const sliders = {};
    for (const [key, label, max] of [['h', '色合い', 360], ['s', '鮮やかさ', 100], ['l', '明るさ', 100]]) {
      const row = document.createElement('label');
      row.className = 'cp-row';
      const name = document.createElement('span');
      name.textContent = label;
      const input = document.createElement('input');
      input.type = 'range';
      input.min = '0';
      input.max = String(max);
      input.step = '1';
      input.setAttribute('aria-label', label);
      row.append(name, input);
      custom.append(row);
      sliders[key] = input;
    }
    const preview = document.createElement('div');
    preview.className = 'cp-preview';
    const chip = document.createElement('i');
    const code = document.createElement('span');
    preview.append(chip, code);
    custom.append(preview);

    const showCustom = (hex) => {
      const [h, sat, l] = hexToHsl(hex);
      sliders.h.value = String(Math.round(h));
      sliders.s.value = String(Math.round(sat * 100));
      sliders.l.value = String(Math.round(l * 100));
      paintTracks();
      chip.style.background = hex;
      code.textContent = hex;
    };
    const paintTracks = () => {
      const h = Number(sliders.h.value), sat = Number(sliders.s.value), l = Number(sliders.l.value);
      sliders.s.style.background = `linear-gradient(to right, hsl(${h} 0% ${l}%), hsl(${h} 100% ${l}%))`;
      sliders.l.style.background = `linear-gradient(to right, #000, hsl(${h} ${sat}% 50%), #fff)`;
    };
    const fromSliders = () => toHex(hslToRgb(
      Number(sliders.h.value), Number(sliders.s.value) / 100, Number(sliders.l.value) / 100,
    ));

    for (const input of Object.values(sliders)) {
      input.addEventListener('input', () => {
        const hex = fromSliders();
        paintTracks();
        chip.style.background = hex;
        code.textContent = hex;
        fromSlider = true;
        onPick(hex);
        fromSlider = false;
        clearTimeout(recentTimer);
        recentTimer = setTimeout(() => addRecent(hex), 500);
      });
      input.addEventListener('change', () => {
        clearTimeout(recentTimer);
        addRecent(fromSliders());
      });
    }

    otherBtn.addEventListener('click', () => {
      custom.hidden = !custom.hidden;
      otherBtn.setAttribute('aria-expanded', String(!custom.hidden));
      if (!custom.hidden) showCustom(current);
    });

    const refreshRecent = () => {
      recentRow.replaceChildren();
      recentRow.hidden = !recent.length;
      if (!recent.length) return;
      const lbl = document.createElement('span');
      lbl.className = 'lbl';
      lbl.textContent = '最近使った色';
      const list = document.createElement('div');
      list.className = 'swatches';
      for (const hex of recent) list.append(makeSwatch(hex, hex));
      recentRow.append(lbl, list);
      for (const b of list.children) b.classList.toggle('on', b.dataset.hex === current);
    };

    const row = document.createElement('div');
    row.className = 'cp-main';
    row.append(swatches, otherBtn);
    root.append(row, custom, recentRow);

    const picker = {
      refreshRecent,
      set(hex) {
        if (hex) current = hex;
        for (const list of [swatches, recentRow.querySelector('.swatches')]) {
          if (list) for (const b of list.children) b.classList.toggle('on', b.dataset.hex === hex);
        }
        if (hex && !custom.hidden && !fromSlider) showCustom(hex);
      },
    };
    pickers.push(picker);
    refreshRecent();
    return picker;
  }

  /* ---------- 履歴（元に戻す・やり直し） ---------- */

  const history = { stack: [], index: -1 };
  const pathIds = new WeakMap();
  let pathSeq = 0;

  // 入れ子のデータはコピーして持つ（線の点列 paths と画像 upload は変更しない前提なので参照のまま）
  const cloneValue = (v) => (v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v);
  function snapshotOf(item) {
    const out = {};
    for (const [k, v] of Object.entries(item)) {
      if (k === 'el' || k === 'canvas' || k === 'draft') continue;
      out[k] = k === 'paths' || k === 'upload' ? v : cloneValue(v);
    }
    return out;
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
    scheduleSave();
  }

  // 履歴の状態に戻す。変わっていないデザインは作りなおさず、そのまま使う（作りなおしは重いため）
  function restore(snaps) {
    const prevId = state.selected && state.selected.id;
    const old = new Map(state.items.map((it) => [it.id, it]));
    state.items = [];
    state.selected = null;
    for (const snap of snaps) {
      const cur = old.get(snap.id);
      if (cur && signature(snapshotOf(cur)) === signature(snap)) {
        state.items.push(cur);
        old.delete(snap.id);
      } else {
        // 履歴の中身を直接いじらないよう、コピーして使う
        createItem(snapshotOf(snap));
      }
    }
    for (const it of old.values()) it.el.remove();
    for (const it of state.items) stage.insertBefore(it.el, itemAnchor); // HTMLの並びも重なり順に合わせる
    restack();
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

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
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
        blob: await canvasToBlob(canvas), // 自動保存用
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
        scheduleSave();
      });

      wrap.append(btn, x);
      tray.append(wrap);
    }
  }

  /* ---------- 画像デザインの加工（トリミング・背景透明化・色変更） ---------- */

  const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

  function hue2rgb(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }

  // スライダーを動かしている間に使う、小さい版の画像（長辺 DRAFT_PX）
  function draftSource(upload) {
    const src = upload.canvas;
    if (Math.max(src.width, src.height) <= DRAFT_PX) return src;
    if (!upload.small) {
      const k = DRAFT_PX / Math.max(src.width, src.height);
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(src.width * k));
      c.height = Math.max(1, Math.round(src.height * k));
      c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
      upload.small = c;
    }
    return upload.small;
  }

  // 色の処理の順番: 背景を透明に → 特定の色の置き換え → 色味 → 一色に塗る
  // draft が true なら小さい版で素早く処理する（スライダーを動かしている間用。離したら本番の大きさで処理しなおす）
  function processItem(item, draft = false) {
    const src = draft ? draftSource(item.upload) : item.upload.canvas;
    item.draft = draft && src !== item.upload.canvas;
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

    const adj = item.adj;
    const adjOn = adj.h !== 0 || adj.s !== 0 || adj.l !== 0;
    if (!item.bg && !item.tint && !item.swap && !adjOn) return;

    const img = ctx.getImageData(0, 0, c.width, c.height);
    const d = img.data;
    const bg = item.bg;
    const thr = item.tol * 3; // 色距離(0〜441)のしきい値
    const inner = thr * 0.6;  // これ以下は完全に透明、thrまでは境界をなだらかに
    const tint = item.tint ? hexToRgb(item.tint) : null;
    const sw = item.swap;
    const swTo = sw ? hexToRgb(sw.to) : null;
    const swThr = sw ? Math.max(1, sw.tol * 3) : 0;
    const swLum = sw ? Math.max(8, luma(sw.from.r, sw.from.g, sw.from.b)) : 0;
    const dh = adj.h, ds = 1 + adj.s / 100, dl = adj.l;

    for (let i = 0; i < d.length; i += 4) {
      let a = d[i + 3];
      if (a === 0) continue;
      let r = d[i], g = d[i + 1], b = d[i + 2];
      if (bg) {
        const dist = Math.hypot(r - bg.r, g - bg.g, b - bg.b);
        if (dist <= inner) a = 0;
        else if (dist < thr) a = a * (dist - inner) / (thr - inner);
        d[i + 3] = a;
        if (a === 0) continue;
      }
      if (sw) {
        const dist = Math.hypot(r - sw.from.r, g - sw.from.g, b - sw.from.b);
        if (dist < swThr) {
          // 近い色ほど強く置き換える。元の濃淡（かげ）は残す
          const wgt = dist <= swThr * 0.5 ? 1 : 1 - (dist - swThr * 0.5) / (swThr * 0.5);
          const kk = clamp(luma(r, g, b) / swLum, 0.35, 1.8);
          r += (clamp(swTo[0] * kk, 0, 255) - r) * wgt;
          g += (clamp(swTo[1] * kk, 0, 255) - g) * wgt;
          b += (clamp(swTo[2] * kk, 0, 255) - b) * wgt;
        }
      }
      if (adjOn) {
        // RGB → HSL → 調整 → RGB（1画素ごとに配列を作らないよう、手で展開している）
        const rr = r / 255, gg = g / 255, bb = b / 255;
        const mx = Math.max(rr, gg, bb), mn = Math.min(rr, gg, bb);
        let l = (mx + mn) / 2;
        let h = 0, sat = 0;
        if (mx !== mn) {
          const dd = mx - mn;
          sat = l > 0.5 ? dd / (2 - mx - mn) : dd / (mx + mn);
          if (mx === rr) h = (gg - bb) / dd + (gg < bb ? 6 : 0);
          else if (mx === gg) h = (bb - rr) / dd + 2;
          else h = (rr - gg) / dd + 4;
          h /= 6;
        }
        h = (h + dh / 360 + 1) % 1;
        sat = Math.min(1, Math.max(0, sat * ds));
        l = dl >= 0 ? l + (1 - l) * (dl / 100) : l * (1 + dl / 100);
        if (sat === 0) {
          r = g = b = l * 255;
        } else {
          const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat;
          const p = 2 * l - q;
          r = hue2rgb(p, q, h + 1 / 3) * 255;
          g = hue2rgb(p, q, h) * 255;
          b = hue2rgb(p, q, h - 1 / 3) * 255;
        }
      }
      if (tint) { r = tint[0]; g = tint[1]; b = tint[2]; }
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
    }
    ctx.putImageData(img, 0, 0);
  }

  const pending = new Set();
  function scheduleProcess(item) {
    if (pending.has(item)) return;
    pending.add(item);
    requestAnimationFrame(() => {
      if (pending.delete(item)) processItem(item, true);
    });
  }

  // スライダーを離したときなど、小さい版で処理した画像を本番の大きさで処理しなおす
  function finishDrafts() {
    const waiting = [...pending];
    pending.clear();
    for (const it of waiting) processItem(it);
    for (const it of state.items) if (it.kind === 'image' && it.draft) processItem(it);
  }

  /* ---------- テキストの描画 ---------- */

  const measureCtx = document.createElement('canvas').getContext('2d');
  const fontSpec = (item, size) => `${item.bold ? 700 : 400} ${size}px "${item.font}", "Hiragino Sans", "Yu Gothic", sans-serif`;

  // フォントは Google Fonts から、使う文字だけを必要になったときに読み込む
  // （全部入りのスタイルシートは約2MBあり、読み込みも解析も重いため）
  const BOLD_FONTS = new Set(['Noto Sans JP', 'Noto Serif JP', 'Zen Maru Gothic', 'M PLUS Rounded 1c']); // 太字がある
  const fontChars = new Map();  // フォント名 → これまでに頼んだ文字
  const fontLoads = new Map();  // フォント名 → { link, ready }
  const fontTimers = new Map();

  // family の text に含まれる文字を使えるようにする。頼んだ文字は積み重ねる（あとの定義が前の定義を置き換えるため）
  function loadFontChars(family, text) {
    let chars = fontChars.get(family);
    if (!chars) { chars = new Set(); fontChars.set(family, chars); }
    const before = chars.size;
    for (const ch of text) if (ch.trim()) chars.add(ch);
    const cur = fontLoads.get(family);
    if (cur && chars.size === before) return cur.ready;
    if (!chars.size) return Promise.resolve();
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.crossOrigin = 'anonymous';
    link.href = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}${BOLD_FONTS.has(family) ? ':wght@400;700' : ''}`
      + `&text=${encodeURIComponent([...chars].join(''))}&display=swap`;
    const ready = new Promise((resolve) => { link.onload = resolve; link.onerror = resolve; });
    document.head.append(link);
    fontLoads.set(family, { link, ready });
    if (cur) ready.then(() => cur.link.remove());
    return ready;
  }

  // 使うフォント・文字がまだ読み込まれていなければ、少し待ってから（入力中は何度も頼まないよう）読み込み、描きなおす
  function ensureFont(item) {
    const family = item.font;
    const chars = fontChars.get(family);
    if (chars && fontLoads.has(family) && [...item.text].every((ch) => !ch.trim() || chars.has(ch))) return;
    clearTimeout(fontTimers.get(family));
    fontTimers.set(family, setTimeout(async () => {
      const users = state.items.filter((it) => it.kind === 'text' && it.font === family);
      await loadFontChars(family, users.map((it) => it.text).join(''));
      try { await document.fonts.load(fontSpec(item, TEXT_REF), item.text || 'あ'); } catch { /* 読めなければ端末のフォントで描く */ }
      for (const it of users) if (state.items.includes(it)) refresh(it);
      if (state.selected) syncSliders();
    }, 150));
  }

  // 基準サイズ(TEXT_REF)でのレイアウト。大きさ nw×nh と、描く関数 draw(ctx, k) を返す。
  // k は「基準サイズ1あたりの実際のピクセル数」（影のぼかし・ずらしはこの倍率で決める）
  function layoutText(item) {
    const F = TEXT_REF;
    const lines = (item.text || '').split('\n');
    const ot = item.outline.on ? (item.outline.width / 100) * F : 0; // 縁取りの見える太さ
    const sh = item.shadow.on ? item.shadow : null;
    const shDist = sh ? (sh.dist / 100) * F : 0;
    const shBlur = sh ? (sh.blur / 100) * F : 0;
    const pad = ot + F * 0.08 + (sh ? shDist + shBlur * 1.5 : 0);
    measureCtx.font = fontSpec(item, F);

    // 縁取りがあれば縁取りに、なければ文字に影をつけて重ねる
    const paint = (c, str, x, y, k) => {
      const withShadow = () => {
        if (!sh) return;
        c.shadowColor = sh.color;
        c.shadowBlur = shBlur * k;
        c.shadowOffsetX = shDist * k * 0.7071;
        c.shadowOffsetY = shDist * k * 0.7071;
      };
      const noShadow = () => {
        c.shadowColor = 'rgba(0, 0, 0, 0)';
        c.shadowBlur = 0;
        c.shadowOffsetX = 0;
        c.shadowOffsetY = 0;
      };
      if (ot > 0) {
        c.lineJoin = 'round';
        c.lineWidth = ot * 2;
        c.strokeStyle = item.outline.color;
        withShadow();
        c.strokeText(str, x, y);
        noShadow();
        c.fillStyle = item.color;
        c.fillText(str, x, y);
      } else {
        c.fillStyle = item.color;
        withShadow();
        c.fillText(str, x, y);
        noShadow();
      }
    };

    // アーチ（文字を円の上・下に沿って並べる）
    if (!item.vertical && Math.abs(item.arch) >= 2) {
      const lh = F * 1.3;
      const up = item.arch > 0; // 正: 虹のように上にふくらむ / 負: 笑った口のように下にふくらむ
      const widths = lines.map((l) => measureCtx.measureText(l).width);
      const maxW = Math.max(F * 0.5, ...widths);
      const R0 = maxW / toRad(Math.abs(item.arch));
      const glyphs = [];
      lines.forEach((line, i) => {
        const R = up ? Math.max(R0 - i * lh, lh * 0.4) : R0 + i * lh;
        const chars = Array.from(line);
        const ws = chars.map((ch) => measureCtx.measureText(ch).width);
        let at = -ws.reduce((x, y) => x + y, 0) / 2;
        chars.forEach((ch, j) => {
          const phi = (at + ws[j] / 2) / R;
          at += ws[j];
          glyphs.push({
            ch, w: ws[j],
            x: R * Math.sin(phi), y: up ? -R * Math.cos(phi) : R * Math.cos(phi), rot: up ? phi : -phi,
          });
        });
      });
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const g of glyphs) {
        const cs = Math.cos(g.rot), sn = Math.sin(g.rot);
        for (const [px, py] of [[-g.w / 2, -F * 0.65], [g.w / 2, -F * 0.65], [-g.w / 2, F * 0.65], [g.w / 2, F * 0.65]]) {
          const X = g.x + px * cs - py * sn, Y = g.y + px * sn + py * cs;
          minX = Math.min(minX, X); maxX = Math.max(maxX, X);
          minY = Math.min(minY, Y); maxY = Math.max(maxY, Y);
        }
      }
      if (!glyphs.length) { minX = minY = 0; maxX = maxY = F; }
      return {
        nw: maxX - minX + pad * 2,
        nh: maxY - minY + pad * 2,
        draw(c, k) {
          c.font = fontSpec(item, F);
          c.textBaseline = 'middle';
          c.textAlign = 'center';
          for (const g of glyphs) {
            c.save();
            c.translate(pad - minX + g.x, pad - minY + g.y);
            c.rotate(g.rot);
            paint(c, g.ch, 0, 0, k);
            c.restore();
          }
        },
      };
    }

    if (!item.vertical) {
      const lh = F * 1.3;
      const widths = lines.map((l) => measureCtx.measureText(l).width);
      const maxW = Math.max(F * 0.5, ...widths);
      return {
        nw: maxW + pad * 2,
        nh: lines.length * lh + pad * 2,
        draw(c, k) {
          c.font = fontSpec(item, F);
          c.textBaseline = 'middle';
          c.textAlign = 'left';
          lines.forEach((line, i) => {
            const free = maxW - widths[i];
            const dx = item.align === 'left' ? 0 : item.align === 'right' ? free : free / 2;
            paint(c, line, pad + dx, pad + (i + 0.5) * lh, k);
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
      draw(c, k) {
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
            paint(c, ch, 0, 0, k);
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
    lay.draw(ctx, c.width / lay.nw);
  }

  /* ---------- 手書きの線・スタンプの描画 ---------- */

  // paths: 点の列の配列。map で点を画面上の座標に変換して描く。
  // fill: 塗りの色（塗らないなら null）。lwPx が 0 なら線は描かない
  function drawPaths(ctx, paths, map, lwPx, color, smooth, fill) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = lwPx;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    for (const path of paths) {
      const pts = path.map(map);
      if (pts.length === 1) {
        if (lwPx > 0) {
          ctx.beginPath();
          ctx.arc(pts[0][0], pts[0][1], lwPx / 2, 0, Math.PI * 2);
          ctx.fill();
        }
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
      if (fill && pts.length > 2) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      if (lwPx > 0) ctx.stroke();
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
      item.lineOn ? item.lw * ppS : 0,
      item.color,
      item.shape === 'pen',
      item.fill.on ? item.fill.color : null,
    );
  }

  function drawStamp(ctx, id, size, color) {
    const def = STAMP_MAP[id];
    ctx.save();
    ctx.scale(size / 100, size / 100);
    ctx.fillStyle = color;
    ctx.fill(def.path, def.rule || 'nonzero');
    ctx.restore();
  }

  function renderStamp(item) {
    const c = item.canvas;
    const px = Math.max(1, Math.ceil(item.w * Math.min(RENDER_W, MAX_PX / item.w)));
    c.width = c.height = px;
    drawStamp(c.getContext('2d', { willReadFrequently: true }), item.shape, px, item.color);
  }

  /* ---------- デザイン（画像・文字・線）の共通処理 ---------- */

  const KIND_DEFAULTS = {
    image: () => ({
      tint: null, bg: null, tol: DEFAULT_TOL, crop: { l: 0, t: 0, r: 0, b: 0 },
      adj: { h: 0, s: 0, l: 0 }, swap: null,
    }),
    text: () => ({
      text: 'テキスト', font: 'Noto Sans JP', color: '#111111', bold: false, vertical: false,
      align: 'center', outline: { on: false, color: '#ffffff', width: 8 },
      shadow: { on: false, color: '#000000', blur: 6, dist: 6 }, arch: 0, nw: 0,
    }),
    stroke: () => ({
      shape: 'pen', paths: [], cw: 0.1, ar: 1, lw: 0.009, color: '#111111',
      fill: { on: false, color: '#111111' }, lineOn: true,
    }),
    stamp: () => ({ shape: 'heart', color: '#e53935' }),
  };

  function renderItem(item) {
    if (item.kind === 'image') processItem(item);
    else if (item.kind === 'text') renderText(item);
    else if (item.kind === 'stamp') renderStamp(item);
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

  function addStamp(shape) {
    const p = spawnPoint();
    const item = createItem({ kind: 'stamp', shape, color: state.stampColor, w: 0.12, x: p.x, y: p.y });
    select(item);
    commit();
    say(`${p.face === 'front' ? '正面' : '背面'}にスタンプを追加しました。`);
  }

  // 絵文字は、1文字だけのテキストとして追加する（あとから大きさや影も変えられる）
  function addEmoji(ch) {
    const p = spawnPoint();
    const item = createItem({ kind: 'text', text: ch, w: 0.12, x: p.x, y: p.y });
    select(item);
    commit();
    say(`${p.face === 'front' ? '正面' : '背面'}に絵文字を追加しました。`);
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

  // デザインの上の点 (X, Y)（ステージ幅を1とした座標）の近く（tol 以内）に、色のついた部分があるか
  function itemHit(it, X, Y, tol) {
    const L = toLocal(it, X, Y);
    const hb = it.w * aspectOf(it);
    if (Math.abs(L.x) > it.w / 2 + tol || Math.abs(L.y) > hb / 2 + tol) return false;
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
    for (let k = 3; k < data.length; k += 4) if (data[k] > 30) return true;
    return false;
  }

  // タップした場所にある一番手前のデザインを返す（透明な所は素通り。細い線・文字は少し広めに判定）
  function hitTest(clientX, clientY) {
    const rect = stage.getBoundingClientRect();
    const s = rect.width;
    const X = (clientX - rect.left) / s;
    const Y = (clientY - rect.top) / s;
    for (let i = state.items.length - 1; i >= 0; i--) {
      const it = state.items[i];
      if (itemHit(it, X, Y, (it.kind === 'image' || it.kind === 'stamp' ? 2 : HIT_PX) / s)) return it;
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
    else if (item.kind === 'stamp') syncStampPanel(item);
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
  panel.addEventListener('change', () => {
    finishDrafts();
    commit();
  });
  panel.addEventListener('click', (e) => {
    if (!e.target.closest('button')) return;
    finishDrafts();
    commit();
  });

  /* ---------- 設定パネル（画像） ---------- */

  const tolInput = $('#tol');
  const bgChip = $('#bgChip');
  const adjInputs = { h: $('#adjH'), s: $('#adjS'), l: $('#adjL') };
  const adjOut = { h: $('#adjHOut'), s: $('#adjSOut'), l: $('#adjLOut') };
  const swapPreview = $('#swapPreview');
  const swapChip = $('#swapChip');
  const swapTol = $('#swapTol');
  const tintPicker = makeColorPicker($('#tintPicker'), (hex) => setTint(hex));
  const swapPicker = makeColorPicker($('#swapPicker'), (hex) => {
    const item = state.selected;
    if (!item || item.kind !== 'image') return;
    if (!item.swap) {
      say('先に上の画像をタップして、置き換えたい色を選んでください。');
      return;
    }
    item.swap.to = hex;
    scheduleProcess(item);
    swapPicker.set(hex);
  });

  const colorChip = (label, c) => {
    const el = document.createDocumentFragment();
    el.append(label);
    if (c) {
      const sw = document.createElement('i');
      sw.style.background = `rgb(${c.r}, ${c.g}, ${c.b})`;
      el.append(sw);
    } else {
      el.append('なし');
    }
    return el;
  };

  function drawPreview(canvas, item) {
    const src = item.upload.canvas;
    const k = Math.min(1, 240 / src.width, 160 / src.height);
    canvas.width = Math.max(1, Math.round(src.width * k));
    canvas.height = Math.max(1, Math.round(src.height * k));
    canvas.getContext('2d').drawImage(src, 0, 0, canvas.width, canvas.height);
  }

  function syncImagePanel(item) {
    tolInput.value = String(item.tol);
    tintPicker.set(item.tint);
    bgChip.replaceChildren(colorChip('透明にする色: ', item.bg));
    for (const key of ['h', 's', 'l']) {
      adjInputs[key].value = String(item.adj[key]);
      adjOut[key].textContent = String(item.adj[key]);
    }
    swapChip.replaceChildren(colorChip('置き換える色: ', item.swap && item.swap.from));
    swapTol.value = String(item.swap ? item.swap.tol : DEFAULT_TOL);
    swapPicker.set(item.swap ? item.swap.to : null);
    if (bgPreview.dataset.up !== String(item.upload.id)) {
      // 元画像の見本は、別の画像を選んだときだけ描きなおす
      bgPreview.dataset.up = String(item.upload.id);
      drawPreview(bgPreview, item);
      drawPreview(swapPreview, item);
      drawCrop(item);
    } else {
      updateCropUI(item);
    }
  }

  // プレビュー画像をタップした場所の色を取り出す（もともと透明な所は null）
  function pickColor(canvas, e, item) {
    const r = canvas.getBoundingClientRect();
    const src = item.upload.canvas;
    const x = clamp(Math.floor(((e.clientX - r.left) / r.width) * src.width), 0, src.width - 1);
    const y = clamp(Math.floor(((e.clientY - r.top) / r.height) * src.height), 0, src.height - 1);
    const [pr, pg, pb, pa] = src.getContext('2d').getImageData(x, y, 1, 1).data;
    if (pa < 10) {
      say('そこはもともと透明です。色のついた部分をタップしてください。');
      return null;
    }
    return { r: pr, g: pg, b: pb };
  }

  function setTint(hex) {
    const item = state.selected;
    if (!item || item.kind !== 'image') return;
    // 背景つきの画像(JPGなど)は、背景ごと塗りつぶされないよう先に背景を透明にする
    if (!item.tint && !item.bg && !item.upload.alpha) {
      if (item.upload.corner) {
        item.bg = item.upload.corner;
        say('背景が一色だったので、先に背景を透明にしました（「背景を透明にする」の「解除」で戻せます）。');
      } else {
        say('背景が透明でない画像は、四角ごと塗られます。先に「背景を透明にする」で背景の色を選んでください。');
      }
    }
    item.tint = hex;
    scheduleProcess(item);
    syncImagePanel(item);
  }

  $('#tintReset').addEventListener('click', () => {
    const item = state.selected;
    if (!item) return;
    item.tint = null;
    processItem(item);
    syncImagePanel(item);
  });

  for (const key of ['h', 's', 'l']) {
    adjInputs[key].addEventListener('input', () => {
      const item = state.selected;
      if (!item) return;
      item.adj[key] = Number(adjInputs[key].value);
      adjOut[key].textContent = adjInputs[key].value;
      scheduleProcess(item);
    });
  }
  $('#adjReset').addEventListener('click', () => {
    const item = state.selected;
    if (!item) return;
    item.adj = { h: 0, s: 0, l: 0 };
    processItem(item);
    syncImagePanel(item);
  });

  swapPreview.addEventListener('click', (e) => {
    const item = state.selected;
    if (!item) return;
    const c = pickColor(swapPreview, e, item);
    if (!c) return;
    item.swap = { from: c, to: item.swap ? item.swap.to : '#e53935', tol: item.swap ? item.swap.tol : DEFAULT_TOL };
    processItem(item);
    syncImagePanel(item);
  });
  swapTol.addEventListener('input', () => {
    const item = state.selected;
    if (!item || !item.swap) return;
    item.swap.tol = Number(swapTol.value);
    scheduleProcess(item);
  });
  $('#swapClear').addEventListener('click', () => {
    const item = state.selected;
    if (!item) return;
    item.swap = null;
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
      say('四隅の色がそろっていないため自動で決められません。画像をタップして色を選んでください。');
      return;
    }
    item.bg = item.upload.corner;
    processItem(item);
    syncImagePanel(item);
  });
  bgPreview.addEventListener('click', (e) => {
    const item = state.selected;
    if (!item) return;
    const c = pickColor(bgPreview, e, item);
    if (!c) return;
    item.bg = c;
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
  const archInput = $('#arch');
  const archOut = $('#archOut');
  const archRow = $('#archRow');
  const tShadow = $('#tShadow');
  const shadowOpts = $('#shadowOpts');
  const shadowBlur = $('#shadowBlur');
  const shadowDist = $('#shadowDist');
  const alignBtns = [...document.querySelectorAll('#alignSeg button')];

  const textColor = makeColorPicker($('#textColor'), (hex) => editText((it) => { it.color = hex; }));
  const outlineColor = makeColorPicker($('#outlineColor'), (hex) => editText((it) => { it.outline.color = hex; }));
  const shadowColor = makeColorPicker($('#shadowColor'), (hex) => editText((it) => { it.shadow.color = hex; }));

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

  let chipFontsRequested = false;
  function syncTextPanel(item) {
    if (!chipFontsRequested) {
      // フォント見本の文字だけを、フォントごとに小さく読み込む
      chipFontsRequested = true;
      setTimeout(() => { for (const [family, label] of FONTS) loadFontChars(family, label); }, 300);
    }
    if (textInput.dataset.itemId !== String(item.id) || document.activeElement !== textInput) {
      textInput.value = item.text;
      textInput.dataset.itemId = String(item.id);
    }
    for (const b of fontList.children) b.classList.toggle('on', b.dataset.font === item.font);
    textColor.set(item.color);
    outlineColor.set(item.outline.color);
    shadowColor.set(item.shadow.color);
    tBold.setAttribute('aria-pressed', String(item.bold));
    tVert.setAttribute('aria-pressed', String(item.vertical));
    tOutline.setAttribute('aria-pressed', String(item.outline.on));
    tShadow.setAttribute('aria-pressed', String(item.shadow.on));
    outlineOpts.hidden = !item.outline.on;
    shadowOpts.hidden = !item.shadow.on;
    outlineW.value = String(item.outline.width);
    shadowBlur.value = String(item.shadow.blur);
    shadowDist.value = String(item.shadow.dist);
    archRow.hidden = item.vertical; // アーチは横書きだけ
    archInput.value = String(item.arch);
    archOut.textContent = item.arch === 0 ? 'なし' : item.arch > 0 ? `上にカーブ ${item.arch}°` : `下にカーブ ${-item.arch}°`;
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
  tShadow.addEventListener('click', () => editText((it) => { it.shadow.on = !it.shadow.on; }));
  outlineW.addEventListener('input', () => editText((it) => { it.outline.width = Number(outlineW.value); }));
  shadowBlur.addEventListener('input', () => editText((it) => { it.shadow.blur = Number(shadowBlur.value); }));
  shadowDist.addEventListener('input', () => editText((it) => { it.shadow.dist = Number(shadowDist.value); }));
  archInput.addEventListener('input', () => editText((it) => {
    const v = Number(archInput.value);
    it.arch = Math.abs(v) < 4 ? 0 : v; // 0 付近はまっすぐに吸着
  }));
  $('#archReset').addEventListener('click', () => editText((it) => { it.arch = 0; }));
  for (const b of alignBtns) b.addEventListener('click', () => editText((it) => { it.align = b.dataset.align; }));

  /* ---------- 設定パネル（手書きの線） ---------- */

  const strokeColor = makeColorPicker($('#strokeColor'), (hex) => editStroke((it) => { it.color = hex; }));
  const fillColor = makeColorPicker($('#fillColor'), (hex) => editStroke((it) => { it.fill.color = hex; }));
  const tFill = $('#tFill');
  const tLine = $('#tLine');
  const fillGroup = $('#fillGroup');
  const fillOpts = $('#fillOpts');

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
    fillColor.set(item.fill.color);
    lwInput.value = String(Math.round(item.lw / LW_UNIT));
    const closed = item.shape === 'rect' || item.shape === 'ellipse'; // 塗れるのは四角と丸だけ
    fillGroup.hidden = !closed;
    fillOpts.hidden = !item.fill.on;
    tFill.setAttribute('aria-pressed', String(item.fill.on));
    tLine.setAttribute('aria-pressed', String(item.lineOn));
  }

  lwInput.addEventListener('input', () => editStroke((it) => {
    // 図形の大きさは変えずに、線だけ太く・細くする
    const lw = Number(lwInput.value) * LW_UNIT;
    it.w = it.cw + lw;
    it.lw = lw;
  }));
  tFill.addEventListener('click', () => editStroke((it) => { it.fill.on = !it.fill.on; }));
  tLine.addEventListener('click', () => editStroke((it) => { it.lineOn = !it.lineOn; }));

  /* ---------- 設定パネル（スタンプ） ---------- */

  const stampColor = makeColorPicker($('#stampColor'), (hex) => {
    const item = state.selected;
    if (!item || item.kind !== 'stamp') return;
    item.color = hex;
    state.stampColor = hex; // 次に追加するスタンプも同じ色で出す
    refresh(item);
    syncStampPanel(item);
  });

  function syncStampPanel(item) {
    stampColor.set(item.color);
  }

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
    $('#drawFill').hidden = tool !== 'rect' && tool !== 'ellipse';
    $('#drawWLabel').textContent = tool === 'eraser' ? '消しゴムの大きさ' : '線の太さ';
    drawW.value = String(tool === 'eraser' ? state.eraserSize : state.pen.width);
    updateMode();
  }

  drawW.addEventListener('input', () => {
    if (state.tool === 'eraser') state.eraserSize = Number(drawW.value);
    else state.pen.width = Number(drawW.value);
  });
  for (const b of toolBtns) b.addEventListener('click', () => setTool(b.dataset.tool));
  $('#drawFill').addEventListener('click', (e) => {
    state.pen.fill = !state.pen.fill;
    e.currentTarget.setAttribute('aria-pressed', String(state.pen.fill));
  });

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
  function drawLive(paths, color, lw, smooth, ring, fill) {
    clearLive();
    const k = live.width; // ステージ幅 = live.width px
    drawPaths(liveCtx, paths, ([x, y]) => [x * k, y * k], lw * k, color, smooth, fill);
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
  function strokeProps(paths, shape, color, lw, filled) {
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
      kind: 'stroke', shape, color, lw, fill: { on: filled, color }, lineOn: true,
      paths: paths.map((p) => p.map(([x, y]) => [(x - left) / bw, (y - top) / bw])),
      cw: bw, ar: bh / bw, x: cx, y: cy, w: bw + lw,
    };
  }

  // 消しゴム: 丸い範囲の中にある点を取り除き、線を途中で切る
  // 線（点をつないだもの）が、点 (qx, qy) の半径 rr 以内を通るか。配列を作らずに調べる
  function pathNear(path, qx, qy, rr) {
    const r2 = rr * rr;
    let ax = path[0][0], ay = path[0][1];
    if ((ax - qx) ** 2 + (ay - qy) ** 2 <= r2) return true;
    for (let i = 1; i < path.length; i++) {
      const bx = path[i][0], by = path[i][1];
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy;
      let t = len2 ? ((qx - ax) * dx + (qy - ay) * dy) / len2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = ax + dx * t - qx, py = ay + dy * t - qy;
      if (px * px + py * py <= r2) return true;
      ax = bx;
      ay = by;
    }
    return false;
  }

  function erasePaths(paths, q, rr) {
    const step = rr / 2;
    const out = [];
    let changed = false;
    for (const path of paths) {
      if (!pathNear(path, q[0], q[1], rr)) { out.push(path); continue; }
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
      if (item.fill.on) {
        // 塗りつぶした図形は部分的には消せないので、触れたら丸ごと消す
        if (itemHit(item, p[0], p[1], R)) removeItem(item);
        continue;
      }
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
    const filled = state.pen.fill && (tool === 'rect' || tool === 'ellipse');
    const fillStyle = filled ? color : null;
    const pts = [p0];
    let cur = p0;
    const currentPaths = (ev) => (tool === 'pen' ? [pts] : shapePaths(tool, p0, cur, ev.shiftKey, ev.altKey));
    drawLive(currentPaths(e), color, lw, tool === 'pen', null, fillStyle);
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
      drawLive(currentPaths(ev), color, lw, tool === 'pen', null, fillStyle);
    }, (ev) => {
      const paths = currentPaths(ev);
      clearLive();
      const moved = Math.hypot(cur[0] - p0[0], cur[1] - p0[1]);
      if (tool !== 'pen' && moved < 0.004) return; // 図形は、ほとんど動かしていなければ描かない
      createItem(strokeProps(paths, tool, color, lw, filled));
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
    if (name === 'stamp' && !stampTray.childElementCount) renderStampTray('shape'); // 初めて開くときに作る
    updateMode();
  }
  for (const t of tabBtns) t.addEventListener('click', () => setTab(t.dataset.tab));
  $('#addText').addEventListener('click', addText);

  // スタンプ（図形・絵文字）のタブ
  const stampTray = $('#stampTray');
  const stampKindBtns = [...document.querySelectorAll('#stampKind button')];

  function renderStampTray(kind) {
    for (const b of stampKindBtns) b.setAttribute('aria-pressed', String(b.dataset.kind === kind));
    stampTray.replaceChildren();
    if (kind === 'shape') {
      for (const st of STAMPS) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'thumb-btn stamp-btn';
        b.title = st.label;
        b.setAttribute('aria-label', `${st.label}のスタンプを追加`);
        const c = document.createElement('canvas');
        c.width = c.height = 96;
        drawStamp(c.getContext('2d'), st.id, 96, '#1f2430');
        b.append(c);
        b.addEventListener('click', () => addStamp(st.id));
        stampTray.append(b);
      }
    } else {
      for (const ch of EMOJIS) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'thumb-btn stamp-btn emoji-btn';
        b.textContent = ch;
        b.setAttribute('aria-label', `${ch} を追加`);
        b.addEventListener('click', () => addEmoji(ch));
        stampTray.append(b);
      }
    }
    stampTray.scrollLeft = 0;
  }
  for (const b of stampKindBtns) b.addEventListener('click', () => renderStampTray(b.dataset.kind));

  /* ---------- 画像追加・保存 ---------- */

  $('#file').addEventListener('change', async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    for (const f of files) await addUpload(f);
    renderTray();
    scheduleSave();
    if (files.length) tray.scrollLeft = tray.scrollWidth;
  });

  // 完成イメージ（パーカーと、重ねたデザインすべて）を1枚の画像にする
  function renderDesign() {
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
    return c;
  }

  function download(blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'class-parka-design.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // 「保存」も「共有」も、まず共有画面を開く。
  // iPhone / iPad では共有画面の「画像を保存」で写真アプリに入る。開けない端末ではダウンロードにする
  async function exportImage(mode) {
    finishDrafts();
    let blob;
    try {
      blob = await canvasToBlob(renderDesign());
    } catch {
      say('画像を作れませんでした。ファイルを直接開かず、GitHub Pagesなどのウェブ経由で開いてください。');
      return;
    }
    const file = new File([blob], 'class-parka-design.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      if (mode === 'save') say('共有画面で「画像を保存」を選ぶと、写真アプリに入ります。');
      try {
        await navigator.share({ files: [file], title: '1-Iクラスパーカデザイン' });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return; // 共有画面を閉じただけ
      }
    }
    download(blob);
    say('この端末では共有画面を開けないので、画像ファイルとして保存しました。');
  }

  $('#savePng').addEventListener('click', () => exportImage('save'));
  $('#shareBtn').addEventListener('click', () => exportImage('share'));

  /* ---------- 自動保存（この端末のブラウザの中だけに保存） ---------- */

  const saveState = $('#saveState');
  let dbPromise = null;
  let saveTimer = 0;

  function openDb() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        if (!window.indexedDB) { reject(new Error('indexedDB なし')); return; }
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          req.result.createObjectStore('work');
          req.result.createObjectStore('uploads', { keyPath: 'id' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }

  const idb = (store, mode, fn) => openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req && req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveState.textContent = '保存中…';
    saveTimer = setTimeout(saveNow, SAVE_DELAY);
  }

  async function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = 0;
    try {
      const uploads = new Set(state.uploads);
      for (const it of state.items) if (it.upload) uploads.add(it.upload);
      for (const up of uploads) {
        if (up.stored) continue;
        await idb('uploads', 'readwrite', (st) => st.put({
          id: up.id, name: up.name, blob: up.blob, alpha: up.alpha, corner: up.corner, thumb: up.thumb,
        }));
        up.stored = true;
      }
      const items = state.items.map((it) => {
        const snap = snapshotOf(it);
        if (snap.upload) snap.upload = snap.upload.id;
        return snap;
      });
      await idb('work', 'readwrite', (st) => st.put({
        v: 1,
        items,
        trayIds: state.uploads.map((u) => u.id),
        nextUploadId: state.nextUploadId,
        nextItemId: state.nextItemId,
        side: side(),
        savedAt: Date.now(),
      }, 'work'));
      saveState.textContent = '自動保存しました';
    } catch {
      saveState.textContent = '自動保存できません';
    }
  }

  // 前回の作業があれば、画像・デザインを元に戻す。戻したら true
  async function loadWork() {
    let work;
    try {
      work = await idb('work', 'readonly', (st) => st.get('work'));
    } catch {
      saveState.textContent = '自動保存はこの環境では使えません';
      return false;
    }
    if (!work || work.v !== 1) return false;

    const wanted = new Set([...work.trayIds, ...work.items.map((it) => it.upload).filter(Boolean)]);
    const uploads = new Map();
    for (const id of wanted) {
      try {
        const rec = await idb('uploads', 'readonly', (st) => st.get(id));
        if (!rec) continue;
        const url = URL.createObjectURL(rec.blob);
        try {
          const img = await loadImage(url);
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          canvas.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0);
          uploads.set(id, {
            id, name: rec.name, canvas, blob: rec.blob, alpha: rec.alpha, corner: rec.corner, thumb: rec.thumb, stored: true,
          });
        } finally {
          URL.revokeObjectURL(url);
        }
      } catch { /* 読めなかった画像は飛ばす */ }
    }
    state.uploads = work.trayIds.map((id) => uploads.get(id)).filter(Boolean);
    state.nextUploadId = work.nextUploadId;
    state.nextItemId = work.nextItemId;
    for (const it of work.items) {
      if (it.kind === 'image') {
        it.upload = uploads.get(it.upload);
        if (!it.upload) continue;
      }
      createItem(it);
    }
    const radio = document.querySelector(`input[name="side"][value="${work.side}"]`);
    if (radio) radio.checked = true;
    // どこからも使われていない画像のデータは捨てる
    idb('uploads', 'readonly', (st) => st.getAllKeys())
      .then((keys) => Promise.all(keys.filter((k) => !uploads.has(k)).map((k) => idb('uploads', 'readwrite', (st) => st.delete(k)))))
      .catch(() => {});
    return state.items.length > 0 || state.uploads.length > 0;
  }

  $('#newWork').addEventListener('click', async () => {
    if (!confirm('最初から始めますか？いまのデザインと、追加した画像がすべて消えます。')) return;
    for (const it of [...state.items]) removeItem(it);
    state.uploads = [];
    renderTray();
    history.stack = [];
    history.index = -1;
    try { await idb('uploads', 'readwrite', (st) => st.clear()); } catch { /* 保存できない環境なら何もしない */ }
    commit();
    say('新しく始めました。');
  });

  // 画面を閉じる・アプリを切りかえるときに、待たずに保存する
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && saveTimer) saveNow();
  });
  window.addEventListener('pagehide', () => { if (saveTimer) saveNow(); });

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

  async function start() {
    renderTray();
    setTool('pen');
    setTab('image');
    drawColor.set(state.pen.color);
    const restored = await loadWork();
    renderTray();
    commit();
    if (restored) say('前回の続きから開きました。');
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  }
  start();

  // ホーム画面に追加したあと、オフラインでも開けるようにする
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
})();
