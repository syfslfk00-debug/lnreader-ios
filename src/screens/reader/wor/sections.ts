/**
 * PORT of New-moon-2 src/screens/Reader/wor/sections.ts — verbatim logic.
 *
 * Faithful port of the chapter-section builder from the app's
 * web/src/screens/WebReaderScreen.js — one Galaxy-style <section> per chapter,
 * with the single-pass line formatter (brackets / markdown / dialogue /
 * custom marks / colored replacement terms).
 */

// Escape text for safe embedding in HTML text nodes (quotes are intentionally kept).
export const escapeHtmlText = (text: unknown): string =>
  String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

// Quote-mark pairs used by the coloring features (brackets / markdown inner marks)
const STYLE_MARKS: Record<string, string[] | null> = {
  guillemets: ['«', '»'],
  curly: ['“', '”'],
  straight: ['"', '"'],
  single: ['‘', '’'],
  all: null,
};

const escapeRegex = (s: unknown): string =>
  String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Process a single content line: brackets / markdown / dialogue / custom marks.
// SINGLE-PASS: one combined regex runs over the ESCAPED text and every match is
// wrapped exactly once (see the app reader for the full rationale).
export const processLineHTML = (line: string, S: WorSectionSettings): string => {
  const text = escapeHtmlText(line);

  // Dialogue pair pattern (quote marks chosen by the user)
  let dialogueSrc: string;
  if (S.selectedQuoteStyle === 'guillemets') dialogueSrc = '«[^»]*»';
  else if (S.selectedQuoteStyle === 'curly') dialogueSrc = '“[^”]*”';
  else if (S.selectedQuoteStyle === 'straight') dialogueSrc = '"[^"]*"';
  else if (S.selectedQuoteStyle === 'single') dialogueSrc = "['‘][^'’]*['’]";
  else dialogueSrc = '[“"«][^”"»]*[”"»]';

  const alternatives = [
    '\\[[^\\]\\n]*\\]', // brackets [...]
    '\\*\\*[\\s\\S]*?\\*\\*', // markdown bold **...**
    dialogueSrc, // dialogue quote pair
  ];

  // Custom marks are escaped for HTML first (so marks like "<<" work) then for regex
  let customOpen = '',
    customClose = '';
  if (
    S.customOpenMark &&
    S.customOpenMark.trim() &&
    S.customCloseMark &&
    S.customCloseMark.trim()
  ) {
    customOpen = escapeHtmlText(S.customOpenMark.trim());
    customClose = escapeHtmlText(S.customCloseMark.trim());
    alternatives.push(
      escapeRegex(customOpen) + '[\\s\\S]*?' + escapeRegex(customClose),
    );
  }

  // Colored replacement terms ("تلوين البديل") join the SAME single pass
  const colored = Array.isArray(S.colored) ? S.colored : [];
  colored.forEach(c => alternatives.push(c.src));

  let re: RegExp;
  try {
    re = new RegExp(alternatives.join('|'), 'g');
  } catch {
    return text;
  }

  const bracketMarks = STYLE_MARKS[String(S.selectedBracketStyle)] ?? null;
  const markdownMarks = STYLE_MARKS[String(S.selectedMarkdownStyle)] ?? null;

  return text.replace(re, m => {
    // colored replacement term (checked first so it always wins)
    for (let ci = 0; ci < colored.length; ci++) {
      if (m === colored[ci].escaped) {
        return `<span class="wor-rep-colored" style="color:${colored[ci].color}">${m}</span>`;
      }
    }
    // custom marks first (user-chosen delimiters take precedence)
    if (customOpen && m.startsWith(customOpen) && m.endsWith(customClose)) {
      const inner = m.slice(
        customOpen.length,
        m.length - customClose.length,
      );
      return `<span class="custom-formatted"><span class="cmark">${customOpen}</span>${inner}<span class="cmark">${customClose}</span></span>`;
    }
    // brackets [ ... ]
    if (m.charAt(0) === '[' && m.charAt(m.length - 1) === ']') {
      const inner = m.slice(1, -1);
      const innerStart = bracketMarks
        ? `<span class="bq-style">${escapeHtmlText(bracketMarks[0])}</span>`
        : '';
      const innerEnd = bracketMarks
        ? `<span class="bq-style">${escapeHtmlText(bracketMarks[1])}</span>`
        : '';
      return `<span class="bracket-formatted"><span class="bmark">[</span>${innerStart}${inner}${innerEnd}<span class="bmark">]</span></span>`;
    }
    // markdown bold ** ... **
    if (m.startsWith('**') && m.endsWith('**') && m.length > 4) {
      const inner = m.slice(2, -2);
      const qStart = markdownMarks
        ? `<span class="mq-style">${escapeHtmlText(markdownMarks[0])}</span>`
        : '';
      const qEnd = markdownMarks
        ? `<span class="mq-style">${escapeHtmlText(markdownMarks[1])}</span>`
        : '';
      return `<span class="cm-markdown-bold"><span class="mmark">**</span>${qStart}${inner}${qEnd}<span class="mmark">**</span></span>`;
    }
    // dialogue quote pair
    const open = m.charAt(0);
    const close = m.charAt(m.length - 1);
    const inner = m.length > 2 ? m.slice(1, -1) : '';
    return `<span class="cm-dialogue-text"><span class="qmark">${open}</span>${inner}<span class="qmark">${close}</span></span>`;
  });
};

/**
 * Settings subset consumed by the line/section formatters. `colored` carries
 * the prebuilt replacement-term regex sources (see worSettings.ts).
 */
export interface WorSectionSettings {
  enableSeparator?: boolean;
  separatorText?: string;
  selectedQuoteStyle?: string;
  selectedBracketStyle?: string;
  selectedMarkdownStyle?: string;
  customOpenMark?: string;
  customCloseMark?: string;
  colored?: { src: string; color: string; escaped: string }[];
  [key: string]: unknown;
}

export interface WorSectionInput {
  number: number;
  title?: string;
  content: string;
  copyrightStart?: string | null;
  copyrightEnd?: string | null;
  copyrightStyles?: {
    color?: string;
    opacity?: number;
    alignment?: string;
    isBold?: boolean;
    fontSize?: number;
  } | null;
}

// Build one chapter <section> in the Galaxy reading-page style
//
// PORT ADAPTATION (LNReader): a line equal to `wor-img:<src>` renders as an
// image instead of a paragraph. LNReader chapters are sanitized HTML and may
// contain images; the adapter (worChapter.ts) encodes them as marker lines so
// the plain-text formatter can carry them through unchanged.
export const WOR_IMAGE_LINE_PREFIX = 'wor-img:';

export const buildWorSectionHTML = (
  sec: WorSectionInput,
  idx: number,
  S: WorSectionSettings,
): string => {
  const style = sec.copyrightStyles || {};
  const copyrightCSS = `color:${style.color || '#888'};opacity:${
    style.opacity || 1
  };text-align:${style.alignment || 'center'};font-weight:${
    style.isBold ? '700' : '400'
  };font-size:${style.fontSize || 14}px;line-height:1.6`;
  const lines = String(sec.content || '')
    .split('\n')
    .filter(line => line.trim() !== '');
  const paragraphs = lines
    .map(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith(WOR_IMAGE_LINE_PREFIX)) {
        const src = escapeHtmlText(
          trimmed.slice(WOR_IMAGE_LINE_PREFIX.length).trim(),
        );
        if (!src) {
          return '';
        }
        return `<p class="wor-image-para"><img src="${src}" alt="" loading="lazy" decoding="async" /></p>`;
      }
      return `<p>${processLineHTML(line, S)}</p>`;
    })
    .join('');
  const sepHTML =
    idx > 0
      ? `<div class="wor-chapter-sep"><span class="sep-orn">◆</span></div>`
      : '';
  const titleHTML = `<div class="wor-chapter-title-block${
    idx > 0 ? ' wor-chapter-title-block--sub' : ''
  }">${escapeHtmlText(sec.title || '')}</div>`;
  const customSep =
    idx === 0 && S.enableSeparator
      ? `<div class="wor-custom-sep">${escapeHtmlText(S.separatorText)}</div>`
      : '';
  const startHTML = sec.copyrightStart
    ? `<div class="wor-app-copyright" style="${copyrightCSS}">${escapeHtmlText(
        sec.copyrightStart,
      )}</div><div class="wor-chapter-divider"></div>`
    : '';
  const endHTML = sec.copyrightEnd
    ? `<div class="wor-chapter-divider"></div><div class="wor-app-copyright" style="${copyrightCSS}">${escapeHtmlText(
        sec.copyrightEnd,
      )}</div>`
    : '';
  return `<section class="wor-chapter-sec" data-ch="${
    sec.number
  }">${sepHTML}${titleHTML}${customSep}${startHTML}<div>${paragraphs}</div>${endHTML}</section>`;
};

// ----- Default reader settings (Galaxy reader defaults) — identical to the app -----
export const DEFAULT_SETTINGS = {
  fontSize: 18,
  lineHeight: 2.3,
  wordSpacing: 0,
  brightness: 1.05,
  fontWeight: '400',
  direction: 'rtl',
  fontValue: 'default',
  bgColor: '#000000',
  textColor: '#ffffff',
  accent: '#808080',
  bgPreset: 'black',
  customColors: false,
  // advanced formatting
  enableDialogue: false,
  dialogueColor: '#4ade80',
  dialogueSize: 100,
  hideQuotes: false,
  selectedQuoteStyle: 'all',
  enableMarkdown: false,
  markdownColor: '#ffffff',
  markdownSize: 100,
  hideMarkdownMarks: false,
  selectedMarkdownStyle: 'all',
  enableBracket: false,
  bracketColor: '#3b82f6',
  bracketSize: 110,
  hideBracketMarks: false,
  selectedBracketStyle: 'all',
  enableCustom: false,
  customOpenMark: '',
  customCloseMark: '',
  customColor: '#f97316',
  customSize: 105,
  hideCustomMarks: false,
  // tools
  showProgressBar: true,
  progressBarColor: '#00ffff',
  continuousMode: false,
  autoScroll: false,
  keepAwake: false,
  hideTitle: false,
  tapToToggle: true,
  enableSeparator: true,
  separatorText: '________________________________________',
  dockOpen: true,
};

// Theme cycle for the topbar toggle
export const THEME_CYCLE = [
  { bgPreset: 'black', bgColor: '#000000', textColor: '#ffffff' },
  { bgPreset: '__light__', bgColor: '#f3efe7', textColor: '#1c1c1c' },
  { bgPreset: 'soft', bgColor: '#16181d', textColor: '#eef1f6' },
  { bgPreset: 'charcoal', bgColor: '#232323', textColor: '#f3f3f3' },
];

export const isLightColor = (hex: string): boolean => {
  const h = String(hex || '#000000').replace('#', '');
  const full =
    h.length === 3
      ? h
          .split('')
          .map(c => c + c)
          .join('')
      : h;
  const n = parseInt(full || '000000', 16);
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150;
};
