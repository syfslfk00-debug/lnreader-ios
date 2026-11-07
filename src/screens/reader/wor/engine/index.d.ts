/**
 * Type declarations for the ported New-moon-2 reader engine (JS modules).
 * The engine is a VERBATIM port — see worShell.js header for the adaptation
 * list. These declarations only expose what the LNReader host consumes.
 */

declare module './worCSS' {
  const WOR_CSS: string;
  export default WOR_CSS;
}

declare module './worFonts' {
  export interface WorFontDef {
    value: string;
    name: string;
    family: string;
    google: string | null;
  }
  export const WOR_FONTS: WorFontDef[];
  export const WOR_PRELOAD_FONTS: string[];
  export function worFontByValue(value: string): WorFontDef | undefined;
}

declare module './fontFaces' {
  export const WOR_FONT_FACE_CSS: string;
  export const WOR_LOCAL_FONT_FAMILY: Record<string, string>;
}

declare module './worShell' {
  export interface WorShellOptions {
    safeTop?: number;
    safeBottom?: number;
    novelTitle?: string;
    novelCover?: string;
    userName?: string;
    userRole?: string;
    initialSettings?: Record<string, unknown>;
    fontFaceCSS?: string;
    features?: Partial<WorShellFeatures>;
  }

  export interface WorShellFeatures {
    favorite: boolean;
    report: boolean;
    comments: boolean;
    userCard: boolean;
    tts: boolean;
  }

  export const WOR_APP_CSS: string;
  export const WOR_BG_PRESETS: unknown[];
  export function buildWorShell(options?: WorShellOptions): string;
  export default buildWorShell;
}
