import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
import { AppRegistry, I18nManager } from 'react-native';
import { i18n, isRTLLocale } from './src/i18n/translations';
import { runHeadlessBackgroundTask } from './src/services/backgroundTasks';
import { installJsCrashHandler } from './src/services/crashLogs/installJsCrashHandler';

installJsCrashHandler();

AppRegistry.registerHeadlessTask(
  'LNReaderBackgroundTask',
  () => runHeadlessBackgroundTask,
);

import App from './App';

/**
 * ---------------------------------------------------------------------------
 * RTL decision — the single source of truth for layout direction.
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS (the tab-indicator bug):
 *
 *   `I18nManager.getConstants().isRTL` is snapshotted ONCE when the JS bundle
 *   is evaluated (react-native/Libraries/ReactNative/I18nManager.js keeps it
 *   in a module-scope constant) — BEFORE index.js gets to run. On iOS that
 *   snapshot comes from RCTI18nUtil's persisted state, i.e. the LAST session.
 *   react-native-tab-view derives its page order and indicator math from
 *   that frozen value, while every real view is mirrored LIVE by the native
 *   layer — a stale snapshot puts the browse/library indicators on the wrong
 *   tab in Arabic.
 *
 * THE FIX: decide the direction HERE (before anything mounts) and let the
 * rest of the app read it through src/utils/rtl.ts, which performs a fresh
 * JS->native read AFTER the calls below — so it always matches the mirroring
 * the native layer will actually apply, even on the very first launch with
 * an RTL app language (where the frozen snapshot is still stale). The
 * AppDelegate prebuild patch (plugins/withIosRTL.js) additionally re-applies
 * the persisted decision before the bridge starts, keeping the frozen
 * snapshot correct from the second launch on.
 *
 * No runtime reload is performed: the live read + explicit `direction` props
 * (see TopTabBar / BrowseScreen / LibraryScreen) keep the tab system and the
 * native mirroring in agreement even when the frozen snapshot is stale.
 * ---------------------------------------------------------------------------
 */
const targetRTL = isRTLLocale(i18n.locale);

// Persisted by the native side (RCTI18nUtil) immediately; the AppDelegate
// prebuild patch re-applies them before the bridge starts on every launch.
I18nManager.allowRTL(targetRTL);
I18nManager.forceRTL(targetRTL);

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
