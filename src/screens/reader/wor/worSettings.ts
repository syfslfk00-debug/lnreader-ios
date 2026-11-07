import { getMMKVObject, setMMKVObject } from '@utils/mmkv/mmkv';

import { DEFAULT_SETTINGS, THEME_CYCLE, WorSectionSettings } from './sections';
import {
  WOR_STRUCTURAL_KEYS,
  WorSettings,
  WorWordItem,
  WorWordsStore,
} from './types';
export type { WorSectionSettings };

/**
 * LNReader-side persistence for the ported New-moon-2 reader.
 *
 * The original persists settings/words in WebView localStorage with keys
 * `@reader_settings_v4` / `@reader_words_v3`. Inside WKWebView a file://
 * origin loses localStorage across reinstalls and cannot share state with
 * the app, so the HOST owns persistence in MMKV and pushes values into the
 * shell over the documented message protocol instead. Same schema, better
 * storage.
 */

const SETTINGS_KEY = 'WOR_READER_SETTINGS_V1';
const WORDS_KEY = 'WOR_WORDS_STORE_V1';

export const loadWorSettings = (): WorSettings => ({
  ...DEFAULT_SETTINGS,
  ...(getMMKVObject<Partial<WorSettings>>(SETTINGS_KEY) ?? {}),
} as WorSettings);

export const saveWorSettings = (settings: WorSettings): void => {
  setMMKVObject(SETTINGS_KEY, settings);
};

/**
 * Merges a validated patch into the current settings and reports whether the
 * chapter HTML must be rebuilt (a structural key changed).
 */
export const applyWorSettingsPatch = (
  patch: Partial<WorSettings>,
): { settings: WorSettings; structuralChanged: boolean } => {
  const current = loadWorSettings();
  const structuralChanged = WOR_STRUCTURAL_KEYS.some(
    key =>
      patch[key] !== undefined &&
      String(patch[key]) !== String(current[key]),
  );
  const settings = { ...current, ...patch };
  saveWorSettings(settings);
  return { settings, structuralChanged };
};

export const nextThemeCycleStep = (settings: WorSettings): Partial<WorSettings> => {
  const index = THEME_CYCLE.findIndex(step => step.bgPreset === settings.bgPreset);
  const next = THEME_CYCLE[(index + 1) % THEME_CYCLE.length] ?? THEME_CYCLE[0];
  if (index === -1) {
    // Custom colors are active: cycle resets to the first preset and clears
    // the custom flag, exactly like the original THEME_CYCLE handler.
    return { ...next, customColors: false };
  }
  return { ...next };
};

// ---------------------------------------------------------------------------
// Words store (port of New-moon-2 src/reader/wordsStore.js — MMKV storage)
// ---------------------------------------------------------------------------

const WORDS_DEFAULT_COLOR = '#0ea5e9';

const rid = (): string =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const HEX_RE = /^#[0-9a-fA-F]{3,8}$/;

export const normalizeWordItem = (raw: Partial<WorWordItem>): WorWordItem => ({
  id: raw && raw.id ? String(raw.id) : rid(),
  original: String((raw && raw.original) || '').trim(),
  replacement: String((raw && raw.replacement) || '').trim(),
  exact: Boolean(raw && raw.exact),
  color:
    raw && typeof raw.color === 'string' && HEX_RE.test(raw.color)
      ? raw.color
      : null,
});

const dedupeWords = (list: WorWordItem[]): WorWordItem[] => {
  const seen = new Set<string>();
  const out: WorWordItem[] = [];
  (list || []).forEach(it => {
    if (!it || !it.original) return;
    const key = it.original.toLowerCase() + '\u0000' + it.replacement;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(it);
  });
  return out;
};

const emptyWordsStore = (): WorWordsStore => ({ novel: {}, global: [] });

const sanitizeWordsStore = (parsed: unknown): WorWordsStore => {
  const store = emptyWordsStore();
  if (parsed && typeof parsed === 'object') {
    const p = parsed as WorWordsStore;
    if (p.novel && typeof p.novel === 'object') {
      Object.keys(p.novel).forEach(k => {
        if (Array.isArray(p.novel[k])) {
          store.novel[k] = dedupeWords(p.novel[k].map(normalizeWordItem));
        }
      });
    }
    if (Array.isArray(p.global)) {
      store.global = dedupeWords(p.global.map(normalizeWordItem));
    }
  }
  return store;
};

export const loadWordsStore = (): WorWordsStore => {
  try {
    return sanitizeWordsStore(getMMKVObject<WorWordsStore>(WORDS_KEY));
  } catch {
    // Corrupt payload: reset instead of breaking every later bridge message.
    return emptyWordsStore();
  }
};

export const saveWordsStore = (store: WorWordsStore): void => {
  setMMKVObject(WORDS_KEY, store && store.novel ? store : emptyWordsStore());
};

export const novelScopeOf = (store: WorWordsStore, novelId: number): WorWordItem[] =>
  store.novel[String(novelId ?? 'unknown')] || [];

export const effectiveTerms = (
  store: WorWordsStore,
  novelId: number,
): WorWordItem[] =>
  [...(store.global || []), ...novelScopeOf(store, novelId)].filter(
    t => t.original,
  );

const escapeRegex = (s: unknown): string =>
  String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const escapeDollar = (s: unknown): string =>
  String(s == null ? '' : s).replace(/\$/g, '$$$$');

// "كلمة مستقلة" — boundary-aware replace (never corrupts neighbouring Arabic words)
const replaceExact = (
  content: string,
  original: string,
  replacement: string,
): string => {
  const escaped = escapeRegex(original);
  const safeRepl = escapeDollar(replacement);
  if (/^[A-Za-z0-9]/.test(original)) {
    try {
      return content.replace(new RegExp('\\b' + escaped + '\\b', 'g'), safeRepl);
    } catch {
      /* fall through */
    }
  }
  try {
    const re = new RegExp(
      '(?<![\\u0600-\\u06FF\\w])' + escaped + '(?![\\u0600-\\u06FF\\w])',
      'g',
    );
    return content.replace(re, safeRepl);
  } catch {
    return content.replace(new RegExp(escaped, 'g'), safeRepl);
  }
};

// "استبدال ذكي" — replace every occurrence of the phrase (regex-escaped, $-safe)
const replaceSmart = (
  content: string,
  original: string,
  replacement: string,
): string => {
  try {
    return content.replace(
      new RegExp(escapeRegex(original), 'g'),
      escapeDollar(replacement),
    );
  } catch {
    return content;
  }
};

// Apply the replacement list to raw chapter text.
export const replaceTermsInText = (
  content: string,
  terms: WorWordItem[],
): string => {
  let out = String(content == null ? '' : content);
  (terms || []).forEach(t => {
    if (!t || !t.original) return;
    const repl = t.replacement == null ? '' : String(t.replacement);
    out = t.exact
      ? replaceExact(out, t.original, repl)
      : replaceSmart(out, t.original, repl);
  });
  return out;
};

// Terms whose replacement should be colored inside the chapter ("تلوين البديل").
// Coloring targets the replacement text as it appears AFTER replacement.
export const buildColoredTerms = (terms: WorWordItem[]) => {
  const map = new Map<string, string>();
  (terms || []).forEach(t => {
    if (!t || !t.color || !t.replacement) return;
    map.set(t.replacement, t.color);
  });
  return Array.from(map.entries()).map(([term, color]) => ({ term, color }));
};

// Escape text for safe embedding in HTML text nodes (same policy as the readers)
export const escapeHtmlWords = (text: unknown): string =>
  String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

// Build { src, color, escaped } list ready for the single-pass line formatter.
// Called AFTER replacements ran, so the colored word is the replacement itself.
export const buildColoredRegexSources = (coloredTerms: { term: string; color: string }[]) =>
  (coloredTerms || [])
    .map(({ term, color }) => ({
      src: escapeRegex(escapeHtmlWords(term)),
      color,
      escaped: escapeHtmlWords(term),
    }))
    .filter(x => x.src.length > 0);

export const sortWordsList = (list: WorWordItem[]): WorWordItem[] =>
  (list || [])
    .slice()
    .sort((a, b) =>
      String(a.original || '').localeCompare(String(b.original || ''), 'ar'),
    );

// ---------------------------------------------------------------------------
// Scroll / position persistence
// ---------------------------------------------------------------------------

const SCROLL_KEY = 'WOR_SCROLL_V1';
const LAST_POS_KEY = 'WOR_LAST_POS_V1';

export interface WorSavedScroll {
  [novelId: string]: { [chapterNumber: string]: number };
}

export interface WorLastPos {
  [novelId: string]: { number: number; offset: number };
}

export const loadWorScrolls = (): WorSavedScroll =>
  getMMKVObject<WorSavedScroll>(SCROLL_KEY) ?? {};

export const saveWorScroll = (
  novelId: number,
  chapterNumber: number,
  offset: number,
): void => {
  const scrolls = loadWorScrolls();
  const novelKey = String(novelId);
  const novelScrolls = { ...(scrolls[novelKey] ?? {}) };
  novelScrolls[String(chapterNumber)] = Math.max(0, Math.round(offset));
  setMMKVObject(SCROLL_KEY, { ...scrolls, [novelKey]: novelScrolls });
};

export const getWorScrollOffset = (
  novelId: number,
  chapterNumber: number,
): number => loadWorScrolls()[String(novelId)]?.[String(chapterNumber)] ?? 0;

export const saveWorLastPos = (
  novelId: number,
  chapterNumber: number,
  offset: number,
): void => {
  const all = getMMKVObject<WorLastPos>(LAST_POS_KEY) ?? {};
  all[String(novelId)] = { number: chapterNumber, offset: Math.max(0, Math.round(offset)) };
  setMMKVObject(LAST_POS_KEY, all);
};

export const getWorLastPos = (novelId: number): { number: number; offset: number } | undefined =>
  getMMKVObject<WorLastPos>(LAST_POS_KEY)?.[String(novelId)];

export { WORDS_DEFAULT_COLOR };
