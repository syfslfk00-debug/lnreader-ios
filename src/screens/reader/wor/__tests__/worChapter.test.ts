import { ChapterInfo, NovelInfo } from '@database/types';

import {
  buildWorChapterNumberMap,
  getWorChapterView,
  htmlToWorLines,
  prepareWorContent,
  worLinesToSpeechQueue,
} from '../worChapter';
import type { WorWordsStore } from '../types';

const makeChapter = (over: Partial<ChapterInfo>): ChapterInfo =>
  ({
    id: 1,
    novelId: 1,
    path: '/chapter-1',
    name: 'الفصل 1',
    readTime: null,
    bookmark: false,
    unread: true,
    isDownloaded: false,
    updatedTime: null,
    page: '1',
    progress: 0,
    position: 0,
    scanlator: null,
    timeSpent: 0,
    ...over,
  }) as ChapterInfo;

const novel = { name: 'رواية تجريبية', pluginId: 'test' } as NovelInfo;

describe('htmlToWorLines', () => {
  it('converts sanitized HTML paragraphs into plain lines', () => {
    const out = htmlToWorLines('<p>الأول</p><p>الثاني</p>');
    expect(out).toBe('الأول\nالثاني');
  });

  it('turns images into marker lines and keeps their src', () => {
    const out = htmlToWorLines(
      '<p>نص</p><img src="https://x.test/a.jpg" alt="" /><p>آخر</p>',
    );
    expect(out).toContain('wor-img:https://x.test/a.jpg');
    expect(out.split('\n').filter(Boolean)).toHaveLength(3);
  });

  it('upgrades protocol-relative image sources to https', () => {
    const out = htmlToWorLines('<img src="//cdn.test/b.png" />');
    expect(out).toContain('wor-img:https://cdn.test/b.png');
  });

  it('decodes entities once (the formatter re-escapes)', () => {
    const out = htmlToWorLines('<p>قال &quot;مرحباً&quot; &amp; رحل</p>');
    expect(out).toContain('قال "مرحباً" & رحل');
  });

  it('never leaks raw tags into the text', () => {
    const out = htmlToWorLines('<div><b>عريض</b> عادي</div>');
    expect(out).toBe('عريض عادي');
  });
});

describe('worLinesToSpeechQueue', () => {
  it('drops image markers, ornaments and empty lines', () => {
    const queue = worLinesToSpeechQueue(
      [
        'الفصل الأول',
        `${'wor-img:'}https://x.test/a.jpg`,
        '◆',
        '',
        'النص المنطوق',
      ].join('\n'),
    );
    expect(queue).toEqual(['الفصل الأول', 'النص المنطوق']);
  });
});

describe('buildWorChapterNumberMap', () => {
  it('maps chapterNumber first, then parsed names, then positions', () => {
    const chapters = [
      makeChapter({ id: 11, chapterNumber: 5, position: 0 }),
      makeChapter({ id: 12, name: 'الفصل 12', position: 1 }),
      makeChapter({ id: 13, name: 'بدون رقم', position: 2 }),
    ];
    const { numbers, byNumber } = buildWorChapterNumberMap(chapters, novel);
    expect(numbers.get(11)).toBe(5);
    expect(numbers.get(12)).toBe(12);
    expect(numbers.get(13)).toBe(3);
    expect(byNumber.get(12)?.id).toBe(12);
  });

  it('de-duplicates repeated numbers instead of colliding', () => {
    const chapters = [
      makeChapter({ id: 21, chapterNumber: 1, position: 0 }),
      makeChapter({ id: 22, chapterNumber: 1, position: 1 }),
    ];
    const { numbers } = buildWorChapterNumberMap(chapters, novel);
    expect(numbers.get(21)).toBe(1);
    expect(numbers.get(22)).toBe(2);
  });
});

describe('getWorChapterView', () => {
  it('returns position and percent within the novel', () => {
    const chapters = [
      makeChapter({ id: 1, position: 0 }),
      makeChapter({ id: 2, position: 1 }),
      makeChapter({ id: 3, position: 2 }),
    ];
    const { numbers } = buildWorChapterNumberMap(chapters, novel);
    const view = getWorChapterView(chapters, numbers, chapters[2]);
    expect(view?.index).toBe(2);
    expect(view?.total).toBe(3);
    expect(view?.percentValue).toBe(100);
  });
});

describe('prepareWorContent', () => {
  it('applies word replacements from the novel scope', () => {
    const store: WorWordsStore = {
      novel: {
        [String(novel.name ? 7 : 7)]: [
          { id: 'a', original: 'التنين', replacement: 'التّنين', exact: false, color: null },
        ],
      },
      global: [],
    };
    const { plainText } = prepareWorContent('<p>ذهب التنين بعيداً</p>', 7, store);
    expect(plainText).toContain('التّنين');
    expect(plainText).not.toContain('التنين');
  });

  it('builds colored regex sources for colored terms', () => {
    const store: WorWordsStore = {
      novel: {
        '7': [
          {
            id: 'a',
            original: 'التنين',
            replacement: 'التّنين',
            exact: false,
            color: '#00ff00',
          },
        ],
      },
      global: [],
    };
    const { sectionSettings } = prepareWorContent('<p>التنين</p>', 7, store);
    expect(sectionSettings.colored?.[0]?.color).toBe('#00ff00');
  });
});
