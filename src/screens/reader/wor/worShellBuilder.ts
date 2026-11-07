import buildWorShell, { WOR_BG_PRESETS } from './engine/worShell';
import { WOR_FONTS } from './engine/worFonts';
import { WOR_FONT_FACE_CSS } from './engine/fontFaces';
import { WorSettings } from './types';

/**
 * Builds the self-contained reader HTML from the ported New-moon-2 engine.
 *
 * - Fonts are injected as LOCAL @font-face declarations (no Google-Fonts
 *   network dependency). In dev the font URLs are rewritten to the Metro
 *   asset server; in release they stay relative and resolve next to the
 *   runtime HTML (see worRuntime.ts).
 * - Site-only features (favorites / reports / comments / account card) are
 *   disabled — their buttons are never rendered instead of shipping dead UI.
 *   TTS stays available through the LNReader host.
 */

const WOR_FEATURES = {
  favorite: false,
  report: false,
  comments: false,
  userCard: false,
  tts: true,
} as const;

export const buildWorReaderHtml = ({
  settings,
  novelTitle,
  novelCover,
  safeTop,
  safeBottom,
  fontBaseUrl,
}: {
  settings: WorSettings;
  novelTitle: string;
  novelCover?: string | null;
  safeTop: number;
  safeBottom: number;
  /** Dev-only absolute prefix for the local font files. Empty in release. */
  fontBaseUrl?: string;
}): string => {
  const fontFaceCss = fontBaseUrl
    ? WOR_FONT_FACE_CSS.replaceAll("url('fonts/", `url('${fontBaseUrl}/fonts/`)
    : WOR_FONT_FACE_CSS;

  return buildWorShell({
    safeTop,
    safeBottom,
    novelTitle,
    novelCover: novelCover ?? '',
    initialSettings: { ...settings },
    fontFaceCSS: fontFaceCss,
    features: { ...WOR_FEATURES },
  });
};

export { WOR_BG_PRESETS, WOR_FONTS };
