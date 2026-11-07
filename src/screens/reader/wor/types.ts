/**
 * Message protocol of the ported New-moon-2 (wor) reader.
 *
 * The engine (worShell.js) speaks this exact contract:
 *   shell -> host : `window.ReactNativeWebView.postMessage(JSON.stringify(msg))`
 *   host -> shell : `webView.injectJavaScript('window.__wor.receive(<json>)')`
 *
 * The host queues every outbound message until the shell reports `ready`,
 * and validates every inbound message before dispatching (a plugin's
 * custom.js or a partially-written message must never break the bridge).
 */

import { ChapterInfo } from '@database/types';

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export type WorDirection = 'rtl' | 'ltr' | 'center';

export interface WorSettings {
  fontSize: number;
  lineHeight: number;
  wordSpacing: number;
  brightness: number;
  fontWeight: '300' | '400' | '700';
  direction: WorDirection;
  fontValue: string;
  bgColor: string;
  textColor: string;
  accent: string;
  bgPreset: string;
  customColors: boolean;
  enableDialogue: boolean;
  dialogueColor: string;
  dialogueSize: number;
  hideQuotes: boolean;
  selectedQuoteStyle: string;
  enableMarkdown: boolean;
  markdownColor: string;
  markdownSize: number;
  hideMarkdownMarks: boolean;
  selectedMarkdownStyle: string;
  enableBracket: boolean;
  bracketColor: string;
  bracketSize: number;
  hideBracketMarks: boolean;
  selectedBracketStyle: string;
  enableCustom: boolean;
  customOpenMark: string;
  customCloseMark: string;
  customColor: string;
  customSize: number;
  hideCustomMarks: boolean;
  showProgressBar: boolean;
  progressBarColor: string;
  continuousMode: boolean;
  autoScroll: boolean;
  keepAwake: boolean;
  hideTitle: boolean;
  tapToToggle: boolean;
  enableSeparator: boolean;
  separatorText: string;
  dockOpen: boolean;
}

/**
 * Changing one of these requires the chapter HTML to be rebuilt (marks are
 * baked into the HTML by the single-pass line formatter), so the host sends
 * the chapter again with `keepScroll: true`.
 */
export const WOR_STRUCTURAL_KEYS: (keyof WorSettings)[] = [
  'selectedQuoteStyle',
  'selectedMarkdownStyle',
  'selectedBracketStyle',
  'customOpenMark',
  'customCloseMark',
];

// ---------------------------------------------------------------------------
// Shell -> Host (msg.t)
// ---------------------------------------------------------------------------

export interface WorScrollPayload {
  offset: number;
  inOffset: number;
  chapter: number;
  ratio: number;
}

export type WorNavMessage =
  | { t: 'nav'; dir: 'next' | 'prev'; to?: undefined }
  | { t: 'nav'; dir?: undefined; to: string };

export type WorGotoMessage = { t: 'goto'; number: number };

export type WorWordsActionMessage = {
  t: 'words';
  action: 'addRep' | 'updateRep' | 'deleteRep' | 'clearScope';
  scope: 'novel' | 'global';
  id?: string;
  original?: string;
  replacement?: string;
  exact?: boolean;
  color?: string | null;
};

export type WorOutboundMessage =
  | { t: 'ready' }
  | { t: 'scroll' } & WorScrollPayload
  | { t: 'needNext' }
  | WorNavMessage
  | WorGotoMessage
  | { t: 'chaptersLoadMore' }
  | { t: 'chaptersSearch'; q: string }
  | { t: 'novelPage' }
  | { t: 'settings'; patch: Partial<WorSettings> }
  | WorWordsActionMessage
  | { t: 'wordsOpen' }
  | { t: 'themeCycle' }
  | { t: 'exit' }
  | { t: 'dock'; open: boolean }
  | { t: 'error'; message?: string }
  | { t: string; [key: string]: unknown };

// ---------------------------------------------------------------------------
// Host -> Shell (msg.kind)
// ---------------------------------------------------------------------------

export interface WorChapterListItem {
  number: number;
  title: string;
}

export interface WorAuthorCard {
  name: string;
  avatar?: string;
  banner?: string;
}

export interface WorChapterMessage {
  number: number;
  title: string;
  novelTitle: string;
  total: number;
  percent: string;
  percentValue: number;
  hasPrev: boolean;
  hasNext: boolean;
  html: string;
  /** LNReader extras rendered by the shell's author card (unused). */
  commentCount?: number;
  showCommentsButton?: boolean;
  authorCard?: WorAuthorCard | null;
  isFavorite?: boolean;
  /** px offset inside the chapter section to restore (v2 protocol). */
  scrollOffset?: number;
  /** true = do not scroll (chapter HTML rebuilt for a settings change). */
  keepScroll?: boolean;
}

export type WorInboundMessage =
  | { kind: 'settings'; settings: Partial<WorSettings> }
  | { kind: 'chapter' } & WorChapterMessage
  | { kind: 'appendChapter'; number: number; html: string }
  | { kind: 'scrollToChapter'; number: number }
  | { kind: 'endReached' }
  | { kind: 'loadingNext'; value: boolean }
  | { kind: 'chapters'; list: WorChapterListItem[]; total: number }
  | {
      kind: 'chaptersSearchResults';
      q: string;
      results: WorChapterListItem[];
      total: number;
      loadFailed?: boolean;
    }
  | {
      kind: 'words';
      items: { novel: WorWordItem[]; global: WorWordItem[] };
    }
  | {
      kind: 'wordsSaved';
      items: { novel: WorWordItem[]; global: WorWordItem[] };
      toast: string;
    }
  | { kind: 'toast'; text: string }
  | { kind: 'backPress' }
  | { kind: 'scrollTo'; offset: number };

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

export interface WorWordItem {
  id: string;
  original: string;
  replacement: string;
  exact: boolean;
  color: string | null;
}

export interface WorWordsStore {
  novel: Record<string, WorWordItem[]>;
  global: WorWordItem[];
}

// ---------------------------------------------------------------------------
// Host bookkeeping
// ---------------------------------------------------------------------------

export interface WorChapterNumbers {
  /** Stable numeric identity of a chapter for the shell (data-ch). */
  number: number;
  chapter: ChapterInfo;
}
