import { ChapterInfo, NovelInfo } from '@database/types';
import { parseChapterNumber } from '@utils/parseChapterNumber';

import {
  buildColoredRegexSources,
  buildColoredTerms,
  effectiveTerms,
  replaceTermsInText,
} from './worSettings';
import type { WorWordsStore } from './types';
import {
  buildWorSectionHTML,
  WOR_IMAGE_LINE_PREFIX,
  WorSectionInput,
  WorSectionSettings,
} from './sections';

export { WOR_IMAGE_LINE_PREFIX };

/**
 * LNReader -> wor data adapter.
 *
 * The New-moon-2 reader consumes PLAIN TEXT chapters (its single-pass line
 * formatter escapes and decorates every line itself). LNReader chapters are
 * sanitized HTML (plugins can embed images/formatting). This adapter bridges
 * the two worlds without changing either side:
 *
 *   sanitized HTML -> lines -> wor section HTML
 *
 * Images survive as `wor-img:<src>` marker lines, rendered by the section
 * builder extension below (a documented, minimal port adaptation).
 */

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

const decodeEntities = (value: string): string =>
  value.replace(/&(?:amp|lt|gt|quot|#39|apos|nbsp);/g, match => ENTITIES[match] ?? match);

/**
 * Converts sanitized chapter HTML into plain text lines for the wor
 * formatter. Block boundaries become line breaks; images become marker
 * lines; every other tag is stripped.
 */
export const htmlToWorLines = (html: string): string => {
  if (!html) {
    return '';
  }
  let text = html;

  // Images -> marker lines (protocol-relative srcs get https:).
  text = text.replace(/<img\b[^>]*?src\s*=\s*("([^"]*)"|'([^']*)')[^>]*>/gi, (_m, _q, dq, sq) => {
    let src = (dq ?? sq ?? '').trim();
    if (src.startsWith('//')) {
      src = `https:${src}`;
    }
    return `\n${WOR_IMAGE_LINE_PREFIX}${src}\n`;
  });

  // Block/heading boundaries -> line breaks.
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/(p|div|h[1-6]|li|tr|blockquote|section|article)>/gi, '\n');
  text = text.replace(/<hr\s*\/?>/gi, '\n');

  // Strip everything that is left, then decode entities (the formatter
  // re-escapes when building the section HTML).
  text = text.replace(/<[^>]+>/g, '');
  text = decodeEntities(text);
  text = text.replace(/[ \t]+\n/g, '\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
};

/** Lines safe for TTS: marker lines and separators are dropped. */
export const worLinesToSpeechQueue = (plainText: string): string[] =>
  plainText
    .split('\n')
    .map(line => line.trim())
    .filter(
      line =>
        line.length > 0 &&
        !line.startsWith(WOR_IMAGE_LINE_PREFIX) &&
        !/^[◆*_\s—_.]+$/.test(line),
    );

/**
 * Stable numeric chapter identity for the shell. LNReader chapters have
 * database ids, source paths and optional parsed numbers; the shell only
 * understands numbers (`data-ch`, goto, scroll anchors). The mapping is
 * computed ONCE per novel and used consistently for both directions
 * (chapter -> number for rendering, number -> chapter for goto).
 */
export const buildWorChapterNumberMap = (
  chapters: ChapterInfo[],
  novel: NovelInfo,
): { numbers: Map<number, number>; byNumber: Map<number, ChapterInfo> } => {
  const numbers = new Map<number, number>();
  const byNumber = new Map<number, ChapterInfo>();
  const used = new Set<number>();

  chapters.forEach((chapter, index) => {
    // parseChapterNumber returns -1 when the name carries no number.
    const parsed = parseChapterNumber(novel.name, chapter.name);
    let number =
      chapter.chapterNumber ??
      (parsed > 0 ? parsed : (chapter.position ?? index) + 1);
    number = Math.round(number);
    // De-duplicate: some sources emit several "chapter 12" rows.
    while (used.has(number)) {
      number += 1;
    }
    used.add(number);
    numbers.set(chapter.id, number);
    if (!byNumber.has(number)) {
      byNumber.set(number, chapter);
    }
  });

  return { numbers, byNumber };
};

export interface WorChapterView {
  chapter: ChapterInfo;
  number: number;
  index: number;
  total: number;
  percentValue: number;
}

/**
 * Computes the view for one chapter. `batchOffset` is the number of chapters
 * loaded in earlier store batches (LNReader loads 1000-chapter batches), so
 * the dock's "n/total" and percent reflect the WHOLE novel, not the batch.
 */
export const getWorChapterView = (
  chapters: ChapterInfo[],
  numbers: Map<number, number>,
  chapter: ChapterInfo,
  batchOffset = 0,
  totalChapters = 0,
): WorChapterView | undefined => {
  const number = numbers.get(chapter.id);
  if (number === undefined) {
    return undefined;
  }
  const index = chapters.findIndex(item => item.id === chapter.id);
  const globalIndex = Math.max(0, index) + batchOffset;
  const total = totalChapters > 0 ? totalChapters : chapters.length || 1;
  return {
    chapter,
    number,
    index: globalIndex,
    total,
    percentValue: Math.round((globalIndex / Math.max(1, total - 1)) * 100),
  };
};

/**
 * Applies the words store (replacements + coloring) and builds the section
 * settings — the exact pipeline the original WorReader.tsx ran before
 * calling buildWorSectionHTML.
 */
export const prepareWorContent = (
  sanitizedHtml: string,
  novelId: number,
  wordsStore: WorWordsStore,
): { plainText: string; sectionSettings: WorSectionSettings } => {
  const terms = effectiveTerms(wordsStore, novelId);
  const withReplacements = replaceTermsInText(
    htmlToWorLines(sanitizedHtml),
    terms,
  );
  const sectionSettings: WorSectionSettings = {
    enableSeparator: true,
    selectedQuoteStyle: 'all',
    selectedBracketStyle: 'all',
    selectedMarkdownStyle: 'all',
    colored: buildColoredRegexSources(
      buildColoredTerms(terms) as { term: string; color: string }[],
    ),
  };
  return { plainText: withReplacements, sectionSettings };
};

/**
 * Builds the `chapter` message HTML for one LNReader chapter (single-chapter
 * mode). `idx` is always 0 here — in continuous mode appends use
 * buildWorSectionHTML directly with an increasing idx.
 */
export const buildWorChapterSectionHtml = (
  section: WorSectionInput,
  settings: WorSectionSettings,
): string => buildWorSectionHTML(section, 0, settings);
