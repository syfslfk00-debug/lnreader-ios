import {
  buildWorSectionHTML,
  processLineHTML,
  WOR_IMAGE_LINE_PREFIX,
} from '../sections';

const baseSettings = {
  enableSeparator: true,
  selectedQuoteStyle: 'all',
  selectedBracketStyle: 'all',
  selectedMarkdownStyle: 'all',
};

describe('processLineHTML', () => {
  it('escapes raw HTML so chapter text cannot inject markup', () => {
    const out = processLineHTML('<script>alert(1)</script>', baseSettings);
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });

  it('wraps dialogue quotes in the dialogue classes', () => {
    const out = processLineHTML('قال: «مرحباً» للجميع', baseSettings);
    expect(out).toContain('cm-dialogue-text');
    expect(out).toContain('qmark');
  });

  it('wraps brackets with configurable marks', () => {
    const out = processLineHTML('[صوت الباب]', baseSettings);
    expect(out).toContain('bracket-formatted');
    expect(out).toContain('bmark');
  });

  it('wraps markdown bold', () => {
    const out = processLineHTML('نص **مهم جداً** هنا', baseSettings);
    expect(out).toContain('cm-markdown-bold');
    expect(out).toContain('mmark');
  });

  it('colors replacement terms first', () => {
    const out = processLineHTML('ذهب أحمد إلى السوق', {
      ...baseSettings,
      colored: [{ src: 'أحمد', color: '#ff0000', escaped: 'أحمد' }],
    });
    expect(out).toContain('wor-rep-colored');
    expect(out).toContain('#ff0000');
  });
});

describe('buildWorSectionHTML', () => {
  it('renders one section with data-ch and a title block', () => {
    const html = buildWorSectionHTML(
      { number: 7, title: 'الفصل السابع', content: 'سطر أول\nسطر ثانٍ' },
      0,
      baseSettings,
    );
    expect(html).toContain('<section class="wor-chapter-sec" data-ch="7">');
    expect(html).toContain('الفصل السابع');
    expect(html.match(/<p>/g)?.length).toBe(2);
  });

  it('adds the separator ornament only from the second section on', () => {
    const first = buildWorSectionHTML(
      { number: 1, title: 'أ', content: 'نص' },
      0,
      baseSettings,
    );
    const second = buildWorSectionHTML(
      { number: 2, title: 'ب', content: 'نص' },
      1,
      baseSettings,
    );
    expect(first).not.toContain('wor-chapter-sep');
    expect(second).toContain('wor-chapter-sep');
  });

  it('renders wor-img marker lines as images, not paragraphs', () => {
    const html = buildWorSectionHTML(
      {
        number: 3,
        title: 'ت',
        content: `قبل\n${WOR_IMAGE_LINE_PREFIX}https://example.com/pic.jpg\nبعد`,
      },
      0,
      baseSettings,
    );
    expect(html).toContain('<img src="https://example.com/pic.jpg"');
    expect(html).not.toContain('wor-img:');
  });

  it('keeps the separator text feature', () => {
    const html = buildWorSectionHTML(
      { number: 1, title: 'أ', content: 'نص' },
      0,
      { ...baseSettings, enableSeparator: true, separatorText: '____' },
    );
    expect(html).toContain('wor-custom-sep');
    expect(html).toContain('____');
  });
});
