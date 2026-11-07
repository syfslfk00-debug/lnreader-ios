import { StyleSheet } from 'react-native';
import { TabBar, type Route, type TabBarProps } from 'react-native-tab-view';

import { getAppDirection } from '@utils/rtl';

/**
 * The direction is resolved from a FRESH native read (see src/utils/rtl.ts)
 * instead of react-native-tab-view's default, which uses the JS-bundle-time
 * snapshot of I18nManager. Overriding after the spread guarantees the tab
 * strip, the pager page order and the indicator math all follow the SAME
 * (live) layout direction — this is the fix for the indicator showing under
 * the wrong tab in RTL.
 */
const TopTabBar = <T extends Route>({
  indicatorStyle,
  ...props
}: TabBarProps<T>) => (
  <TabBar
    {...props}
    direction={getAppDirection()}
    indicatorStyle={[styles.primaryIndicator, indicatorStyle]}
  />
);

const styles = StyleSheet.create({
  primaryIndicator: {
    width: '60%',
    height: 3,
    marginHorizontal: 'auto',
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
});

export default TopTabBar;
