/**
 * react-native's NativeI18nManager TurboModule accessor is not part of the
 * public type surface, but it is the only way to read the LIVE RTL state
 * (RCTI18nUtil) instead of the JS-bundle-time snapshot cached inside
 * I18nManager. Used by src/utils/rtl.ts.
 */
declare module 'react-native/Libraries/ReactNative/NativeI18nManager' {
  export interface I18nManagerConstants {
    isRTL: boolean;
    doLeftAndRightSwapInRTL: boolean;
    localeIdentifier?: string;
  }

  const NativeI18nManager: {
    getConstants(): I18nManagerConstants;
    allowRTL(shouldAllow: boolean): void;
    forceRTL(shouldForce: boolean): void;
    swapLeftAndRightInRTL(flipStyles: boolean): void;
  };

  export default NativeI18nManager;
}
