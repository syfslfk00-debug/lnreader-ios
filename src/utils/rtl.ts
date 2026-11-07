import { I18nManager } from 'react-native';
// Deep import on purpose: `I18nManager.getConstants()` caches the native
// snapshot at JS-module load time (before index.js can call forceRTL), which
// is exactly how the frozen value can disagree with the real view mirroring.
// Reading the TurboModule directly performs a FRESH JS->native call.
import NativeI18nManager from 'react-native/Libraries/ReactNative/NativeI18nManager';

/**
 * The app's authoritative layout direction.
 *
 * Must be resolved AFTER index.js applied `I18nManager.allowRTL/forceRTL`:
 * RCTI18nUtil evaluates `isRTL` live from the persisted preferences, so this
 * value always matches the mirroring the native layer applies to views
 * created from that point on — even on the very first launch with an RTL
 * app language, where the JS-bundle-time snapshot (`I18nManager.getConstants()`)
 * is still stale. react-native-tab-view derives its page order and indicator
 * math from the frozen snapshot by default; every TabView in the app receives
 * `direction` from here explicitly so the tab system can never disagree with
 * the real layout (the "indicator under the wrong tab" bug).
 */
let cachedIsRTL: boolean | null = null;

export const resolveAppIsRTL = (): boolean => {
  if (cachedIsRTL == null) {
    try {
      cachedIsRTL = Boolean(NativeI18nManager?.getConstants?.().isRTL);
    } catch {
      cachedIsRTL = Boolean(I18nManager.getConstants().isRTL);
    }
  }
  return cachedIsRTL;
};

export const getAppDirection = (): 'rtl' | 'ltr' =>
  resolveAppIsRTL() ? 'rtl' : 'ltr';
