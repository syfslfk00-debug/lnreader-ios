import buildWorShell from '../engine/worShell';
import { WOR_FONT_FACE_CSS } from '../engine/fontFaces';
import { WOR_FONTS } from '../engine/worFonts';

/**
 * Smoke tests for the PORTED New-moon-2 engine (src/screens/reader/wor/engine).
 * They protect the port: the shell must build a self-contained HTML document
 * with the local font faces and with site-only UI disabled.
 */
describe('ported wor engine shell', () => {
  const shell = buildWorShell({
    novelTitle: 'رواية اختبار',
    novelCover: 'https://example.test/cover.jpg',
    initialSettings: { fontSize: 19 },
    fontFaceCSS: WOR_FONT_FACE_CSS,
    features: { favorite: false, report: false, comments: false, userCard: false, tts: true },
  });

  it('builds a self-contained RTL HTML document', () => {
    expect(shell.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(shell).toContain('dir="rtl"');
    expect(shell).toContain('wor-reader-text-surface');
  });

  it('injects the local @font-face CSS instead of Google Fonts', () => {
    expect(shell).toContain("font-family: 'wor-cairo'");
    expect(shell).not.toContain('fonts.googleapis.com');
    expect(shell).not.toContain('@import');
  });

  it('keeps the original dock/panels/chapters sheet', () => {
    expect(shell).toContain('data-wor-reader-dock');
    expect(shell).toContain('data-wor-reader-panel="book"');
    expect(shell).toContain('data-wor-reader-panel="font"');
    expect(shell).toContain('data-wor-reader-panel="background"');
    expect(shell).toContain('wor-reader-chapters-sheet');
    expect(shell).toContain('wor-reader-words-sheet');
    expect(shell).toContain('قائمة الفصول');
  });

  it('hides site-only features through the flags', () => {
    // Markup-level markers (JS selectors + CSS rules still mention the
    // classes by design — the wrapped template branches never render).
    expect(shell).not.toContain('<strong data-wor-favorite-label>');
    expect(shell).not.toContain('<button class="wor-reader-report-card__button"');
    expect(shell).not.toContain('<span class="wor-drawer-user__avatar">');
    expect(shell).not.toContain('<button class="wor-comments-trigger"');
  });

  it('keeps the TTS drawer entry and the one-tap toggle guard', () => {
    expect(shell).toContain('data-wor-nav="tts"');
    expect(shell).toContain('lastTouchAt');
    expect(shell).toContain("t: 'dock'");
    expect(shell).toContain("t: 'needNext'");
  });

  it('ships the same 29-font registry as the original', () => {
    expect(WOR_FONTS).toHaveLength(29);
    expect(WOR_FONTS.map(f => f.value)).toContain('amiri');
    expect(WOR_FONTS.map(f => f.value)).toContain('cairo');
  });
});
