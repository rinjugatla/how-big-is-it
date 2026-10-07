import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { OBJECTS } from './objects.js';

const UNIT_MM = { mm: 1, cm: 10, m: 1000 };
const BOX_COLORS = [0xff7a1a, 0x2f80ed, 0x27ae60, 0x9b59b6, 0xe74c3c, 0x16a085];
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const $ = (id) => document.getElementById(id);

const SIZE_GROUPS = [
  { key: 's', label: '小', note: '手で持てる' },
  { key: 'm', label: '中', note: '家電・カバン' },
  { key: 'l', label: '大', note: '家具・人・車' },
];
let syncTimer = null;
const state = { groupOpen: {}, boxes: [], nextBox: 0, auto: true, selected: new Set(), pos: {}, rot: {}, active: null, items: [] };

// ---------- 表示用フォーマット ----------
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function fmtLen(mm) {
  if (mm >= 1000) return `${+(mm / 1000).toFixed(2)} m`;
  if (mm >= 100) return `${+(mm / 10).toFixed(1)} cm`;
  return `${+mm.toFixed(1)} mm`;
}
// 3辺は最大の辺に合わせて単位を統一する（縦 × 横 × 高さ）
function fmtDims([w, h, d]) {
  const max = Math.max(w, h, d);
  const [div, unit, digits] = max >= 1000 ? [1000, 'm', 2] : max >= 100 ? [10, 'cm', 1] : [1, 'mm', 1];
  const f = (v) => +(v / div).toFixed(digits);
  return `${f(d)} × ${f(w)} × ${f(h)} ${unit}`;
}
function fmtVolume(mm3) {
  const L = mm3 / 1e6;
  if (L >= 1000) return `${+(L / 1000).toFixed(2)} m³`;
  if (L >= 0.1) return `${+L.toFixed(2)} L`;
  return `${+(mm3 / 1000).toFixed(1)} cm³`;
}

// ---------- 入力 ----------
function readBoxes() {
  const list = [];
  for (const b of state.boxes) {
    const card = $(`box-${b.id}`);
    const out = { id: b.id, name: b.name, color: b.color };
    for (const k of ['w', 'd', 'h']) {
      const inp = card.querySelector(`[data-k="${k}"]`), un = card.querySelector('[data-unit]');
      const v = parseFloat(inp.value);
      const mm = v * UNIT_MM[un.value];
      if (!(v > 0) || !isFinite(mm) || mm > 1e6) return null;
      out[k] = { mm, label: `${+v.toFixed(3)}${un.value}` };
    }
    list.push(out);
  }
  return list;
}

// "107x27x52" や "10.7 × 2.7 × 5.2cm"（全角・x/X/×/*区切り、末尾に単位可）を [縦, 横, 高さ] にする
function parseQuickSize(text) {
  const s = text.trim().normalize('NFKC').replace(/[×✕*]/g, 'x').replace(/\s+/g, '').toLowerCase();
  const m = s.match(/^(\d+(?:\.\d+)?|\.\d+)x(\d+(?:\.\d+)?|\.\d+)x(\d+(?:\.\d+)?|\.\d+)(mm|cm|m)?$/);
  if (!m) return null;
  const r = [+m[1], +m[2], +m[3]];
  if (r.some((v) => !(v > 0))) return null;
  r.unit = m[4];
  return r;
}

function addBox(init = {}) {
  const idx = init.idx ?? state.nextBox;
  state.nextBox = Math.max(state.nextBox, idx + 1);
  const defName = `箱${String.fromCharCode(65 + (idx % 26))}`;
  const b = { id: `box${idx}`, name: defName, color: BOX_COLORS[idx % BOX_COLORS.length] };
  state.boxes.push(b);
  const card = document.createElement('div');
  card.className = 'boxcard';
  card.id = `box-${b.id}`;
  card.style.setProperty('--c', hex(b.color));
  const row = (k, label, val) => `<div class="row"><label>${label}</label>
    <input data-k="${k}" type="number" inputmode="decimal" min="0" step="any" value="${val}">
</div>`;
  card.innerHTML = `<div class="boxhead"><input data-name class="name" type="text" maxlength="20" value="${defName}" aria-label="箱の名前"><span class="unit">単位 <select data-unit><option>mm</option><option selected>cm</option><option>m</option></select></span><button type="button" data-del>削除</button></div>` +
    '<div class="seg" role="group" aria-label="入力方法"><button type="button" data-mode="each">個別に入力</button><button type="button" data-mode="quick">まとめて入力</button></div>' +
    '<div data-quick-wrap hidden><div class="row quick"><label>サイズ</label><input data-quick type="text" autocomplete="off" placeholder="107x27x52（縦x横x高さ）"></div><p class="quick-err" data-quick-err hidden>「107x27x52」の形式で入力してください</p></div>' +
    '<div data-each-wrap>' + row('d', '縦（奥行）', +init.d || 30) + row('w', '横（幅）', +init.w || 20) + row('h', '高さ', +init.h || 10) + '</div>';
  // 共有URLからの復元値は HTML に埋め込まず、プロパティで設定する
  if (init.restore) {
    const r = init.restore;
    if (typeof r.n === 'string') { b.name = r.n.slice(0, 20).trim() || defName; card.querySelector('[data-name]').value = r.n.slice(0, 20); }
    if (r.u in UNIT_MM) card.querySelector('[data-unit]').value = r.u;
    for (const k of ['d', 'w', 'h']) if (typeof r[k] === 'string') card.querySelector(`[data-k="${k}"]`).value = r[k].slice(0, 20);
  }
  card.querySelector('[data-name]').addEventListener('input', (e) => { b.name = e.target.value.trim() || defName; });
  // 入力方法の切り替え。表示するのは片方だけにして、切り替え時に値を同期する
  const setMode = (mode) => {
    card.dataset.mode = mode;
    card.querySelectorAll('[data-mode]').forEach((btn) => btn.setAttribute('aria-pressed', String(btn.dataset.mode === mode)));
    card.querySelector('[data-quick-wrap]').hidden = mode !== 'quick';
    card.querySelector('[data-each-wrap]').hidden = mode === 'quick';
    if (mode === 'quick') {
      const v = (k) => card.querySelector(`[data-k="${k}"]`).value.trim();
      card.querySelector('[data-quick]').value = [v('d'), v('w'), v('h')].every(Boolean) ? `${v('d')}x${v('w')}x${v('h')}` : '';
      card.querySelector('[data-quick-err]').hidden = true;
    }
    scheduleSync();
  };
  card.querySelectorAll('[data-mode]').forEach((btn) => btn.addEventListener('click', () => setMode(btn.dataset.mode)));
  setMode(init.restore?.q ? 'quick' : 'each');
  const quick = card.querySelector('[data-quick]'), quickErr = card.querySelector('[data-quick-err]');
  quick.addEventListener('input', (e) => {
    e.stopPropagation();
    const r = parseQuickSize(quick.value);
    quickErr.hidden = !quick.value.trim() || !!r;
    if (!r) return;
    card.querySelector('[data-k="d"]').value = r[0];
    card.querySelector('[data-k="w"]').value = r[1];
    card.querySelector('[data-k="h"]').value = r[2];
    if (r.unit) card.querySelector('[data-unit]').value = r.unit;
    update();
  });
  card.addEventListener('input', () => update());
  card.addEventListener('input', () => update());
  card.addEventListener('change', () => update());
  card.querySelector('[data-del]').addEventListener('click', () => {
    if (state.boxes.length <= 1) return;
    state.boxes = state.boxes.filter((x) => x !== b);
    delete state.pos[b.id]; delete state.rot[b.id];
    card.remove();
    $('boxes').querySelectorAll('[data-del]').forEach((d) => (d.hidden = state.boxes.length <= 1));
    update();
  });
  $('boxes').append(card);
  $('boxes').querySelectorAll('[data-del]').forEach((d) => (d.hidden = state.boxes.length <= 1));
}
const boxVolume = (dims) => dims[0] * dims[1] * dims[2];

// 並べ替えた3辺の対数比の合計で「大きさの近さ」を測る
function distance(a, b) {
  const x = [...a].sort((p, q) => p - q), y = [...b].sort((p, q) => p - q);
  return x.reduce((s, v, i) => s + Math.abs(Math.log(v / y[i])), 0);
}

// ---------- three.js 基本 ----------
const stage = $('stage');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.001, 100);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
stage.appendChild(renderer.domElement);
const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
stage.appendChild(labelRenderer.domElement);

scene.add(new THREE.HemisphereLight(0xffffff, 0x8890a0, 1.4));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(3, 6, 4);
scene.add(sun);

// ドラッグ判定は OrbitControls より先に登録する
const canvas = renderer.domElement;
const ray = new THREE.Raycaster();
ray.params.Line.threshold = 0; // 枠線の判定が広すぎて空をクリックしても箱を掴むため
const ndc = new THREE.Vector2();
const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let drag = null;

function pick(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(state.items.map((i) => i.group), true);
  if (!hits.length) return null;
  let o = hits[0].object;
  while (o && !o.userData.itemId) o = o.parent;
  return o ? state.items.find((i) => i.group === o) : null;
}
function floorPoint() {
  const p = new THREE.Vector3();
  return ray.ray.intersectPlane(floor, p) ? p : null;
}
canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const item = pick(e);
  if (item) setActive(item.id);
  const p = item && floorPoint();
  if (!p) return;
  drag = { item, offset: item.group.position.clone().sub(p) };
  controls.enabled = false;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (drag) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const p = floorPoint();
    if (p) {
      const g = drag.item.group;
      g.position.x = p.x + drag.offset.x;
      g.position.z = p.z + drag.offset.z;
      state.pos[drag.item.id] = { x: g.position.x, z: g.position.z };
    }
  } else if (e.pointerType === 'mouse') {
    canvas.style.cursor = pick(e) ? 'grab' : 'default';
  }
});
const endDrag = () => { if (drag) { drag = null; controls.enabled = true; scheduleSync(); } };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE }; // 左は物のドラッグ用
controls.maxPolarAngle = Math.PI * 0.499; // 床の下に潜らない
controls.autoRotateSpeed = 2;
controls.addEventListener('change', () => scheduleSync());

function resize() {
  const { clientWidth: w, clientHeight: h } = stage;
  if (!w || !h) return;
  renderer.setSize(w, h);
  labelRenderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
});

// ---------- モデル生成（寸法 mm → シーン単位 m、原点は底面中央） ----------
const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, ...extra });

function roundedBox(w, h, d, color) {
  const r = Math.min(Math.min(w, h, d) * 0.4, 0.008);
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat(color));
  m.position.y = h / 2;
  return m;
}

function buildModel(o) {
  const [w, h, d] = o.dims.map((v) => v / 1000);
  const g = new THREE.Group();
  switch (o.type) {
    case 'cylinder': {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, h, 32), mat(o.color));
      m.position.y = h / 2;
      g.add(m);
      break;
    }
    case 'sphere': {
      const m = new THREE.Mesh(new THREE.SphereGeometry(w / 2, 32, 20), mat(o.color));
      m.position.y = h / 2;
      g.add(m);
      break;
    }
    case 'human': {
      const bodyH = h * 0.84, r = h * 0.11;
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(r, bodyH - 2 * r, 6, 16), mat(0x34495e));
      body.scale.z = 0.6;
      body.position.y = bodyH / 2;
      const head = new THREE.Mesh(new THREE.SphereGeometry(h * 0.075, 20, 14), mat(o.color));
      head.position.y = h * 0.925;
      g.add(body, head);
      break;
    }
    case 'car': {
      const wr = h * 0.2, base = wr * 0.7, h1 = h * 0.42, h2 = h - base - h1;
      const body = roundedBox(w, h1, d, o.color); body.position.y = base + h1 / 2;
      const cabin = roundedBox(w * 0.9, h2, d * 0.5, 0xcfe8f5); cabin.position.set(0, base + h1 + h2 / 2, -d * 0.04);
      g.add(body, cabin);
      const wheelGeo = new THREE.CylinderGeometry(wr, wr, w * 0.12, 20);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const wh = new THREE.Mesh(wheelGeo, mat(0x222222));
        wh.rotation.z = Math.PI / 2;
        wh.position.set(sx * (w / 2 - w * 0.06), wr, sz * d * 0.3);
        g.add(wh);
      }
      break;
    }
    default:
      g.add(roundedBox(w, h, d, o.color));
  }
  return g;
}

function makeLabel(text, cls = '') {
  const el = document.createElement('div');
  el.className = `label ${cls}`;
  el.textContent = text;
  return new CSS2DObject(el);
}

function buildUserBox(box) {
  const w = box.w.mm / 1000, h = box.h.mm / 1000, d = box.d.mm / 1000;
  const g = new THREE.Group();
  const geo = new THREE.BoxGeometry(w, h, d);
  const solid = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    color: box.color, transparent: true, opacity: 0.4, roughness: 0.4, depthWrite: false,
  }));
  solid.position.y = h / 2;
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: new THREE.Color(box.color).multiplyScalar(0.6) }));
  edges.position.y = h / 2;
  g.add(solid, edges);

  const lw = makeLabel(`横 ${box.w.label}`, 'dim'); lw.position.set(0, 0, d / 2);
  const ld = makeLabel(`縦 ${box.d.label}`, 'dim'); ld.position.set(w / 2, 0, 0);
  const lh = makeLabel(`高さ ${box.h.label}`, 'dim'); lh.position.set(-w / 2, h / 2, d / 2);
  for (const l of [lw, ld, lh]) l.element.style.background = hex(box.color);
  g.add(lw, ld, lh);
  return g;
}

// ---------- シーン再構築 ----------
let gridHelper = null;
let content = new THREE.Group();
scene.add(content);

function disposeTree(root) {
  root.traverse((o) => {
    o.geometry?.dispose?.();
    if (o.material) [].concat(o.material).forEach((m) => m.dispose());
    if (o.isCSS2DObject) o.element.remove();
  });
}

function rebuildScene(boxes, refit) {
  scene.remove(content);
  disposeTree(content);
  content = new THREE.Group();
  scene.add(content);
  state.items = [];

  const entries = boxes.map((b) => ({ id: b.id, name: b.name, color: b.color, group: buildUserBox(b) }));
  for (const o of OBJECTS) {
    if (state.selected.has(o.id)) entries.push({ id: o.id, name: o.name, group: buildModel(o) });
  }
  if (!entries.some((e) => e.id === state.active)) state.active = entries[0].id;

  // 回転を適用し、底面が床に接するように置く
  for (const e of entries) {
    const pivot = new THREE.Group();
    pivot.add(...e.group.children);
    e.group.add(pivot);
    const q = state.rot[e.id];
    if (q) pivot.quaternion.copy(q);
    e.group.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(pivot);
    pivot.position.set(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
    e.size = bb.getSize(new THREE.Vector3());
    const label = makeLabel(e.name);
    if (e.color !== undefined) label.element.style.background = hex(e.color);
    if (e.id === state.active) label.element.classList.add('active');
    label.center.set(0.5, 1.2);
    label.position.set(0, e.size.y, 0);
    e.group.add(label);
    e.label = label;
    e.dims = [e.size.x * 1000, e.size.y * 1000, e.size.z * 1000];
  }

  // 横一列に並べる（ドラッグ済みのものは位置を維持）
  const widths = entries.map((e) => e.size.x);
  const gap = Math.max(0.02, Math.max(...widths) * 0.12);
  let x = -(widths.reduce((a, b) => a + b, 0) + gap * (entries.length - 1)) / 2;
  entries.forEach((e, i) => {
    const p = state.pos[e.id];
    e.group.position.set(p ? p.x : x + widths[i] / 2, 0, p ? p.z : 0);
    x += widths[i] + gap;
    e.group.userData.itemId = e.id;
    content.add(e.group);
    state.items.push(e);
  });
  updateToolbar();

  if (refit) fitCamera();
}

function fitCamera() {
  const bb = new THREE.Box3().setFromObject(content);
  const sphere = bb.getBoundingSphere(new THREE.Sphere());
  const r = Math.max(sphere.radius, 0.005);
  const dir = camera.position.clone().sub(controls.target);
  if (dir.lengthSq() < 1e-9) dir.set(0.7, 0.55, 1);
  dir.normalize();
  const dist = (r / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.05;
  controls.target.copy(sphere.center);
  camera.position.copy(sphere.center).addScaledVector(dir, dist);
  camera.near = dist / 500;
  camera.far = dist * 60;
  camera.updateProjectionMatrix();
  controls.minDistance = r * 0.15;
  controls.maxDistance = dist * 8;

  // 目盛りの目安になるグリッド
  const step = Math.pow(10, Math.floor(Math.log10(r / 2)));
  if (gridHelper) { scene.remove(gridHelper); gridHelper.geometry.dispose(); gridHelper.material.dispose(); }
  gridHelper = new THREE.GridHelper(step * 60, 60, 0x8a94a6, 0xb4bccb);
  gridHelper.material.transparent = true;
  gridHelper.material.opacity = 0.5;
  scene.add(gridHelper);
  $('grid-note').textContent = `床の目盛り: 1マス = ${fmtLen(step * 1000)}`;
}

// ---------- 選択・回転 ----------
function setActive(id) {
  if (state.active === id) return;
  state.active = id;
  for (const i of state.items) i.label.element.classList.toggle('active', i.id === id);
  updateToolbar();
  scheduleSync();
}
function updateToolbar() {
  const it = state.items.find((i) => i.id === state.active);
  $('active-name').textContent = it ? it.name : '-';
}
const AXES = { yaw: [0, 1, 0], pitch: [1, 0, 0], roll: [0, 0, 1] };
function rotateActive(kind) {
  const id = state.active;
  if (!id) return;
  if (kind === 'reset') delete state.rot[id];
  else {
    const dq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...AXES[kind]), Math.PI / 2);
    state.rot[id] = dq.multiply(state.rot[id] || new THREE.Quaternion()).normalize();
  }
  update({ refit: false, keepSelection: true });
}
document.querySelectorAll('[data-rot]').forEach((b) => b.addEventListener('click', () => rotateActive(b.dataset.rot)));

// ---------- UI ----------
function renderList(boxes, ranks) {
  $('summary').innerHTML = boxes.map((box, i) => {
    const top = ranks[i][0].o;
    const vol = boxVolume([box.w.mm, box.h.mm, box.d.mm]);
    const ratio = vol / boxVolume(top.dims);
    const ratioText = ratio >= 1 ? `約 ${ratio.toFixed(ratio >= 10 ? 0 : 1)} 倍` : `約 1/${(1 / ratio).toFixed(1 / ratio >= 10 ? 0 : 1)}`;
    return `<div><span style="color:${hex(box.color)}">■</span> ${esc(box.name)} <b>${fmtDims([box.w.mm, box.h.mm, box.d.mm])}</b>（${fmtVolume(vol)}）<br>` +
      `いちばん近いのは <b>${top.name}</b>（体積 ${ratioText}）</div>`;
  }).join('');
  const score = new Map(OBJECTS.map((o) => [o.id, Math.min(...ranks.map((r) => r.find((x) => x.o === o).s))]));
  const topIds = new Set(ranks.flatMap((r) => r.slice(0, 3).map((x) => x.o.id)));
  const root = $('chips');
  root.replaceChildren();
  for (const g of SIZE_GROUPS) {
    const items = OBJECTS.filter((o) => o.size === g.key).sort((p, q) => score.get(p.id) - score.get(q.id));
    const hasNear = items.some((o) => topIds.has(o.id) || state.selected.has(o.id));
    const det = document.createElement('details');
    det.open = hasNear || state.groupOpen[g.key] === true;
    const sum = document.createElement('summary');
    sum.innerHTML = `<b>${g.label}</b> <small>${g.note}（${items.length}）</small>`;
    sum.addEventListener('click', () => { state.groupOpen[g.key] = !det.open; scheduleSync(); });
    det.append(sum);
    const ul = document.createElement('ul');
    ul.className = 'chips';
    for (const o of items) {
      const li = document.createElement('li');
      const lab = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = state.selected.has(o.id);
      cb.addEventListener('change', () => {
        state.auto = false;
        $('auto').checked = false;
        cb.checked ? state.selected.add(o.id) : state.selected.delete(o.id);
        update({ refit: true, keepSelection: true });
      });
      const txt = document.createElement('span');
      txt.innerHTML = `${o.name}<small>${fmtDims(o.dims)}</small>`;
      lab.append(cb, txt);
      if (topIds.has(o.id)) {
        const b = document.createElement('span');
        b.className = 'badge';
        b.textContent = '近い';
        lab.append(b);
      } else lab.append(document.createElement('span'));
      li.append(lab);
      ul.append(li);
    }
    det.append(ul);
    root.append(det);
  }
}

function update({ refit = true, keepSelection = false } = {}) {
  const boxes = readBoxes();
  const err = $('error');
  if (!boxes) {
    err.hidden = false;
    err.textContent = '縦・横・高さに 0 より大きい数値を入力してください。';
    return;
  }
  err.hidden = true;
  const ranks = boxes.map((b) => {
    const dims = [b.w.mm, b.h.mm, b.d.mm];
    return OBJECTS.map((o) => ({ o, s: distance(dims, o.dims) })).sort((x, y) => x.s - y.s);
  });
  if (state.auto && !keepSelection) {
    state.selected = new Set(ranks.flatMap((r) => r.slice(0, boxes.length > 1 ? 2 : 3).map((x) => x.o.id)));
  }
  renderList(boxes, ranks);
  rebuildScene(boxes, refit);
  scheduleSync();
}

$('add-box').addEventListener('click', () => { addBox({ d: 10, w: 10, h: 10 }); update(); });
$('auto').addEventListener('change', (e) => {
  state.auto = e.target.checked;
  update({ refit: true });
});
$('rotate').addEventListener('change', (e) => { controls.autoRotate = e.target.checked; scheduleSync(); });
$('dims').addEventListener('change', (e) => { stage.classList.toggle('hide-dims', !e.target.checked); scheduleSync(); });
function setCollapsed(on, focus = true) {
  document.querySelector('.app').classList.toggle('collapsed', on);
  $('expand').hidden = !on;
  if (focus) (on ? $('expand') : $('collapse')).focus();
  scheduleSync();
}
$('collapse').addEventListener('click', () => setCollapsed(true));
$('expand').addEventListener('click', () => setCollapsed(false));
$('fit').addEventListener('click', fitCamera);
$('reset').addEventListener('click', () => { state.pos = {}; update({ refit: true, keepSelection: true }); });

// ---------- URL による状態の保存・復元 ----------
const r4 = (v) => +v.toFixed(4);
const sig = (v) => +v.toPrecision(5);

function toBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromBase64Url(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

function serialize() {
  const ids = new Set(state.items.map((i) => i.id));
  const rot = {}, pos = {};
  for (const [id, q] of Object.entries(state.rot)) if (ids.has(id)) rot[id] = [q.x, q.y, q.z, q.w].map(r4);
  for (const [id, p] of Object.entries(state.pos)) if (ids.has(id)) pos[id] = [sig(p.x), sig(p.z)];
  return {
    v: 1,
    b: state.boxes.map((b) => {
      const card = $(`box-${b.id}`);
      const val = (k) => card.querySelector(`[data-k="${k}"]`).value;
      return { i: +b.id.slice(3), n: b.name, u: card.querySelector('[data-unit]').value, q: card.dataset.mode === 'quick' ? 1 : 0, d: val('d'), w: val('w'), h: val('h') };
    }),
    s: [...state.selected],
    a: state.auto ? 1 : 0,
    di: $('dims').checked ? 1 : 0,
    ro: $('rotate').checked ? 1 : 0,
    co: document.querySelector('.app').classList.contains('collapsed') ? 1 : 0,
    ac: state.active,
    go: Object.keys(state.groupOpen).filter((k) => state.groupOpen[k]),
    r: rot,
    p: pos,
    c: [...camera.position.toArray(), ...controls.target.toArray()].map(sig),
  };
}

function shareUrl() {
  const u = new URL(location.href);
  u.search = '';
  u.hash = '';
  u.searchParams.set('s', toBase64Url(JSON.stringify(serialize())));
  return u.toString();
}

function scheduleSync() {
  if (syncTimer) return;
  syncTimer = setTimeout(() => {
    syncTimer = null;
    try { history.replaceState(null, '', shareUrl()); } catch { /* 無視 */ }
  }, 400);
}

function loadShared() {
  try {
    const raw = new URLSearchParams(location.search).get('s');
    if (!raw) return null;
    const d = JSON.parse(fromBase64Url(raw));
    return d && d.v === 1 && Array.isArray(d.b) ? d : null;
  } catch { return null; }
}

function applyShared(d) {
  const finite = (arr, n) => Array.isArray(arr) && arr.length === n && arr.every((x) => Number.isFinite(x));
  const boxes = d.b.filter((b) => b && Number.isInteger(b.i) && b.i >= 0 && b.i < 1000).slice(0, 12);
  for (const b of boxes) addBox({ idx: b.i, restore: b });
  if (!state.boxes.length) addBox();
  const known = new Set([...state.boxes.map((b) => b.id), ...OBJECTS.map((o) => o.id)]);

  state.selected = new Set((d.s || []).filter((id) => OBJECTS.some((o) => o.id === id)));
  state.auto = !!d.a;
  $('auto').checked = state.auto;
  $('dims').checked = d.di !== 0;
  stage.classList.toggle('hide-dims', d.di === 0);
  $('rotate').checked = !!d.ro;
  controls.autoRotate = !!d.ro;
  if (typeof d.ac === 'string') state.active = d.ac;
  for (const k of d.go || []) if (SIZE_GROUPS.some((g) => g.key === k)) state.groupOpen[k] = true;
  for (const [id, q] of Object.entries(d.r || {})) {
    if (known.has(id) && finite(q, 4)) {
      const quat = new THREE.Quaternion(...q);
      if (quat.lengthSq() > 1e-6) state.rot[id] = quat.normalize();
    }
  }
  for (const [id, p] of Object.entries(d.p || {})) if (known.has(id) && finite(p, 2)) state.pos[id] = { x: p[0], z: p[1] };
  if (d.co) setCollapsed(true, false);
}

function restoreCamera(c) {
  if (!Array.isArray(c) || c.length !== 6 || !c.every((x) => Number.isFinite(x))) return;
  camera.position.set(c[0], c[1], c[2]);
  controls.target.set(c[3], c[4], c[5]);
  controls.update();
}

async function copyShareUrl() {
  const url = shareUrl();
  history.replaceState(null, '', url);
  let ok = true;
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = url;
    document.body.append(ta);
    ta.select();
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
  }
  const btn = $('share');
  btn.textContent = ok ? '✓ コピーしました' : 'コピーに失敗しました';
  setTimeout(() => { btn.textContent = '🔗 共有URLをコピー'; }, 1800);
}
$('share').addEventListener('click', copyShareUrl);

resize();
const shared = loadShared();
if (shared) applyShared(shared); else addBox();
update({ refit: true, keepSelection: !!shared });
if (shared) restoreCamera(shared.c);
