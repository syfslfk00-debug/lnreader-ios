// src/screens/reader/wor/engine/worFonts.js
// PORT of New-moon-2 src/reader/worFonts.js — same 29 reader fonts with the
// same value/name contract. Families now resolve to the LOCAL @font-face
// families declared in fontFaces.js (offline fonts), so the `google` loader
// of the original is gone.

// web/src/reader/worFonts.js
// The 29 reader fonts offered by the Galaxy Novels reader (exact data-value /
// data-name / data-family triples extracted from the original reader markup).
// `google` holds the Google Fonts family used to lazy-load the font inside the
// reader WebView. thmanyah Serif Text is a device-local font on the original
// site (no web file) — it gracefully falls back to Amiri, exactly like there.

export const WOR_FONTS = [
  { value: 'default',            name: 'الخط العادي',           family: 'inherit', google: null },
  { value: 'thmanyah-serif-text',name: 'خط ثمانية للنصوص',      family: '"thmanyah Serif Text", "Thmanyah Serif Text", "Thmanyah", Amiri, Georgia, serif', google: null },
  { value: 'cairo',              name: 'خط كايرو',             family: 'wor-cairo, Tahoma, Arial, sans-serif', google: null },
  { value: 'tajawal',            name: 'خط تجوال',             family: 'wor-tajawal, Tahoma, Arial, sans-serif', google: null },
  { value: 'amiri',              name: 'خط أميري',             family: 'wor-amiri, Georgia, serif', google: null },
  { value: 'noto-naskh-arabic',  name: 'خط نوتو نسخ العربي',    family: 'wor-noto-naskh-arabic, wor-amiri, Georgia, serif', google: null },
  { value: 'readex-pro',         name: 'خط ريدكس برو',          family: 'wor-readex-pro, Tahoma, Arial, sans-serif', google: null },
  { value: 'scheherazade-new',   name: 'خط شهرزاد الجديد',      family: 'wor-scheherazade-new, wor-amiri, Georgia, serif', google: null },
  { value: 'changa',             name: 'خط تشانغا',             family: 'wor-changa, Tahoma, Arial, sans-serif', google: null },
  { value: 'el-messiri',         name: 'خط المسيري',            family: 'wor-el-messiri, Tahoma, Arial, sans-serif', google: null },
  { value: 'harmattan',          name: 'خط هارماتان',           family: 'wor-harmattan, Tahoma, Arial, sans-serif', google: null },
  { value: 'reem-kufi',          name: 'خط ريم كوفي',           family: 'wor-reem-kufi, Tahoma, Arial, sans-serif', google: null },
  { value: 'markazi-text',       name: 'خط مركزي',              family: 'wor-markazi-text, wor-amiri, Georgia, serif', google: null },
  { value: 'lateef',             name: 'خط لطيف',               family: 'wor-lateef, wor-amiri, Georgia, serif', google: null },
  { value: 'mirza',              name: 'خط ميرزا',              family: 'wor-mirza, wor-amiri, Georgia, serif', google: null },
  { value: 'lalezar',            name: 'خط لاليزار',            family: 'wor-lalezar, Tahoma, Arial, sans-serif', google: null },
  { value: 'baloo-bhaijaan-2',   name: 'خط بالو بهيجان',        family: 'wor-baloo-bhaijaan-2, Tahoma, Arial, sans-serif', google: null },
  { value: 'aref-ruqaa',         name: 'خط عارف رقعة',          family: 'wor-aref-ruqaa, wor-amiri, Georgia, serif', google: null },
  { value: 'rakkas',             name: 'خط ركاس',               family: 'wor-rakkas, wor-amiri, Georgia, serif', google: null },
  { value: 'vazirmatn',          name: 'خط وزيرمتن',            family: 'wor-vazirmatn, Tahoma, Arial, sans-serif', google: null },
  { value: 'almarai',            name: 'خط المراعي',            family: 'wor-almarai, Tahoma, Arial, sans-serif', google: null },
  { value: 'changa-one',         name: 'خط تشانغا ون',          family: 'wor-changa-one, Tahoma, Arial, sans-serif', google: null },
  { value: 'katibeh',            name: 'خط كاتبة',              family: 'wor-katibeh, wor-amiri, Georgia, serif', google: null },
  { value: 'kufam',              name: 'خط كوفام',              family: 'wor-kufam, Tahoma, Arial, sans-serif', google: null },
  { value: 'mada',               name: 'خط مدى',                family: 'wor-mada, Tahoma, Arial, sans-serif', google: null },
  { value: 'qahiri',             name: 'خط قاهري',              family: 'wor-qahiri, wor-amiri, Georgia, serif', google: null },
  { value: 'ruwudu',             name: 'خط روودو',                family: 'wor-ruwudu, wor-amiri, Georgia, serif', google: null },
  { value: 'noto-kufi-arabic',   name: 'خط نوتو كوفي العربي',     family: 'wor-noto-kufi-arabic, Tahoma, Arial, sans-serif', google: null },
  { value: 'noto-sans-arabic',   name: 'خط نوتو سانس العربي',   family: 'wor-noto-sans-arabic, Tahoma, Arial, sans-serif', google: null },
];

// PORT: all fonts are bundled locally (see scripts/fetch-wor-fonts.mjs and
// fontFaces.js). Nothing lazy-loads from the network anymore.
export const WOR_PRELOAD_FONTS = [];

export const worFontByValue = (value) => WOR_FONTS.find(f => f.value === value) || WOR_FONTS[0];
