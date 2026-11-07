const { withAppDelegate, withInfoPlist } = require('@expo/config-plugins');

/**
 * LNReader iOS RTL plugin.
 *
 * Problem
 * -------
 * `I18nManager.getConstants().isRTL` is snapshotted by the JS bundle the
 * moment `react-native` is evaluated — BEFORE `index.js` gets a chance to
 * call `I18nManager.forceRTL()` for the current app language. react-native-
 * tab-view derives its page order AND indicator math from that frozen
 * snapshot, while every real view is mirrored LIVE by the native layer.
 * A stale snapshot is what put the browse/library tab indicators on the
 * wrong tab in Arabic.
 *
 * Fix
 * ---
 * Re-apply the persisted RCTI18nUtil decision inside
 * `application:didFinishLaunchingWithOptions:` — i.e. before the bridge
 * evaluates the JS bundle — so the snapshot and the live mirroring are the
 * same value from the very first frame.
 *
 * The patch is intentionally tolerant: if the expected anchor cannot be
 * found (Expo changes the template), the mod is a no-op instead of failing
 * the prebuild; index.js carries an equivalent JS-side self-heal.
 */

const DID_FINISH_LAUNCHING_ANCHOR =
  'override func application(\n    _ application: UIApplication,\n    didFinishLaunchingWithOptions launchOptions';

const RTL_BOOTSTRAP = `
        // LNReader RTL bootstrap (added by plugins/withIosRTL.js):
        // re-apply the persisted RTL decision BEFORE the JS bundle is
        // evaluated so I18nManager.getConstants().isRTL (snapshotted during
        // bundle evaluation) matches the actual view mirroring from frame 1.
        let lnreaderDefaults = UserDefaults.standard
        if lnreaderDefaults.object(forKey: "RCTI18nUtil_forceRTL") != nil
            || lnreaderDefaults.object(forKey: "RCTI18nUtil_allowRTL") != nil {
            let lnreaderForced = lnreaderDefaults.bool(forKey: "RCTI18nUtil_forceRTL")
            let lnreaderAllowed = lnreaderDefaults.bool(forKey: "RCTI18nUtil_allowRTL")
            if let lnreaderI18nUtil = RCTI18nUtil.sharedInstance() {
                lnreaderI18nUtil.allowRTL(lnreaderAllowed)
                lnreaderI18nUtil.forceRTL(lnreaderForced)
            }
        }
`;

const withIosRTL = config => {
  config = withAppDelegate(config, config => {
    const contents = config.modResults.contents;

    if (contents.includes('LNReader RTL bootstrap')) {
      return config;
    }

    const anchorIndex = contents.indexOf(DID_FINISH_LAUNCHING_ANCHOR);
    if (anchorIndex === -1) {
      console.warn(
        '[withIosRTL] didFinishLaunching anchor not found in AppDelegate.swift — skipping (JS self-heal in index.js remains active).',
      );
      return config;
    }

    const bodyStart = contents.indexOf('{', anchorIndex);
    if (bodyStart === -1) {
      console.warn(
        '[withIosRTL] didFinishLaunching body not found in AppDelegate.swift — skipping.',
      );
      return config;
    }

    config.modResults.contents =
      contents.slice(0, bodyStart + 1) +
      RTL_BOOTSTRAP +
      contents.slice(bodyStart + 1);

    return config;
  });

  // RCTI18nUtil is a public React header; nothing extra to link, but the
  // plugin keeps an InfoPlist mod hook so future RTL keys (e.g. custom
  // development-region overrides) have an obvious home.
  config = withInfoPlist(config, config => config);

  return config;
};

module.exports = withIosRTL;
