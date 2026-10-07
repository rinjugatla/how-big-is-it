// 多言語対応（日本語 / 英語）。デフォルトは日本語。
export const LANGS = ['ja', 'en'];
export const DEFAULT_LANG = 'ja';

const DICT = {
  ja: {
    title: 'サイズ体感ビューア',
    description: '縦・横・高さを入力して、日常にあるものと並べて大きさを3Dで体感できます。',
    lead: '寸法を入れると3Dの箱が現れ、身近なものと並べて大きさを確かめられます。',
    collapse: 'サイドバーをたたむ',
    expand: 'サイドバーを開く',
    langLabel: '言語',
    addBox: '＋ 箱を追加',
    showDims: '寸法を表示',
    autoRotate: '自動で回す',
    autoSelect: '近いものを自動選択',
    fit: '全体を表示',
    resetLayout: '配置をリセット',
    share: '🔗 共有URLをコピー',
    copied: '✓ コピーしました',
    copyFailed: 'コピーに失敗しました',
    selected: '選択中:',
    selectHint: '（3D上でクリックして選択）',
    rotYaw: '↻ 水平に90°',
    rotPitch: '⤵ 前後に90°倒す',
    rotRoll: '⤴ 左右に90°倒す',
    rotReset: '元に戻す',
    compare: '比べるもの',
    hint: '右ドラッグ: 回転 ／ ホイール(中ボタン)ドラッグ・2本指: 移動 ／ ホイール回転・ピンチ: 拡大縮小 ／ 左ドラッグ: 物を床の上で動かす',
    groupS: '小', groupSNote: '手で持てる',
    groupM: '中', groupMNote: '家電・カバン',
    groupL: '大', groupLNote: '家具・人・車',
    boxDefault: '箱{0}',
    boxNameLabel: '箱の名前',
    unit: '単位',
    del: '削除',
    inputMode: '入力方法',
    modeEach: '個別に入力',
    modeQuick: 'まとめて入力',
    size: 'サイズ',
    quickPlaceholder: '107x27x52（縦x横x高さ）',
    quickErr: '「107x27x52」の形式で入力してください',
    depth: '縦（奥行）',
    width: '横（幅）',
    height: '高さ',
    lblW: '横',
    lblD: '縦',
    lblH: '高さ',
    error: '縦・横・高さに 0 より大きい数値を入力してください。',
    nearest: 'いちばん近いのは',
    volume: '体積',
    about: '約 {0} 倍',
    aboutFrac: '約 1/{0}',
    near: '近い',
    gridNote: '床の目盛り: 1マス = {0}',
  },
  en: {
    title: 'How Big Is It?',
    description: 'Enter length, width and height to see how big something is in 3D, next to everyday objects.',
    lead: 'Enter dimensions to get a 3D box, then compare its size with familiar objects.',
    collapse: 'Collapse sidebar',
    expand: 'Open sidebar',
    langLabel: 'Language',
    addBox: '+ Add box',
    showDims: 'Show dimensions',
    autoRotate: 'Auto-rotate',
    autoSelect: 'Auto-select closest',
    fit: 'Fit to view',
    resetLayout: 'Reset layout',
    share: '🔗 Copy share URL',
    copied: '✓ Copied',
    copyFailed: 'Copy failed',
    selected: 'Selected:',
    selectHint: '(click in 3D to select)',
    rotYaw: '↻ Turn 90° (horizontal)',
    rotPitch: '⤵ Tilt 90° (front/back)',
    rotRoll: '⤴ Tilt 90° (left/right)',
    rotReset: 'Reset',
    compare: 'Compare with',
    hint: 'Right-drag: rotate / Middle-drag or two fingers: pan / Wheel or pinch: zoom / Left-drag: move objects on the floor',
    groupS: 'Small', groupSNote: 'handheld',
    groupM: 'Medium', groupMNote: 'appliances, bags',
    groupL: 'Large', groupLNote: 'furniture, people, cars',
    boxDefault: 'Box {0}',
    boxNameLabel: 'Box name',
    unit: 'Unit',
    del: 'Delete',
    inputMode: 'Input mode',
    modeEach: 'Separate',
    modeQuick: 'Quick',
    size: 'Size',
    quickPlaceholder: '107x27x52 (L x W x H)',
    quickErr: 'Please use the format "107x27x52"',
    depth: 'Length (depth)',
    width: 'Width',
    height: 'Height',
    lblW: 'W',
    lblD: 'L',
    lblH: 'H',
    error: 'Enter numbers greater than 0 for length, width and height.',
    nearest: 'Closest match:',
    volume: 'volume',
    about: '~{0}×',
    aboutFrac: '~1/{0}',
    near: 'Close',
    gridNote: 'Floor grid: 1 square = {0}',
  },
};

let lang = DEFAULT_LANG;
export const getLang = () => lang;
export const isLang = (v) => LANGS.includes(v);
export function setLang(l) {
  if (isLang(l)) lang = l;
}

export function t(key, ...args) {
  const s = DICT[lang][key] ?? DICT[DEFAULT_LANG][key] ?? key;
  return s.replace(/\{(\d+)\}/g, (_, i) => args[i] ?? '');
}

// 比較対象など { ja, en } を持つオブジェクトの表示名
export const nameOf = (o) => o.names?.[lang] ?? o.names?.[DEFAULT_LANG] ?? o.name;

// data-i18n / data-i18n-attr="attr:key;attr:key" を持つ要素を現在の言語で更新する
export function applyStatic() {
  document.documentElement.lang = lang;
  document.title = t('title');
  document.querySelector('meta[name="description"]')?.setAttribute('content', t('description'));
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    for (const pair of el.dataset.i18nAttr.split(';')) {
      const [attr, key] = pair.split(':');
      el.setAttribute(attr, t(key));
    }
  });
}

// 初期言語: URL ?lang → localStorage → 既定（日本語）
export function detectLang() {
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (isLang(q)) return q;
  } catch { /* 無視 */ }
  try {
    const s = localStorage.getItem('lang');
    if (isLang(s)) return s;
  } catch { /* 無視 */ }
  return DEFAULT_LANG;
}
export function saveLang() {
  try { localStorage.setItem('lang', lang); } catch { /* 無視 */ }
}
