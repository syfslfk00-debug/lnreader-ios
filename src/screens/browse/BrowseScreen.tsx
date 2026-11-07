import { useCallback, useMemo, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { TabView, type TabBarProps } from 'react-native-tab-view';

import { useSearch } from '@hooks';
import { useTheme } from '@hooks/persisted';
import { getString } from '@i18n/translations';
import { getAppDirection } from '@utils/rtl';

import { SafeAreaView, SearchbarV2, TopTabBar } from '@components';
import { BrowseScreenProps } from '@navigators/types';
import { PluginsTab } from './components/PluginsTab';
import { SourcesTab } from './components/SourcesTab';

type BrowseRoute = {
  key: 'sources' | 'plugins';
  title: string;
};

const BrowseScreen = ({ navigation }: BrowseScreenProps) => {
  const theme = useTheme();
  const { searchText, setSearchText, clearSearchbar } = useSearch();
  const layout = useWindowDimensions();

  /**
   * Routes are built inside the component so the tab titles re-resolve
   * through i18n on every render. Module-scope `getString` calls captured a
   * translation frozen at import time, which desynced the visible tab label
   * from the selected-tab state when the language changed.
   */
  const routes = useMemo<BrowseRoute[]>(
    () => [
      { key: 'sources', title: getString('browseScreen.sources') },
      { key: 'plugins', title: getString('browseScreen.plugins') },
    ],
    [],
  );

  const searchbarActions = useMemo(
    () =>
      [
        {
          accessibilityLabel: getString('browseScreen.globalSearch'),
          iconName: 'book-search',
          onPress: () => navigation.navigate('GlobalSearchScreen', {}),
        },
      ] as const,
    [navigation],
  );

  const menuButtons = useMemo(
    () => [
      {
        title: getString('novelScreen.migrate'),
        onPress: () => navigation.navigate('Migration'),
      },
      {
        title: getString('browseScreen.repositories'),
        onPress: () =>
          navigation.navigate('MoreStack', {
            screen: 'SettingsStack',
            params: { screen: 'RespositorySettings' },
          }),
      },
      {
        title: getString('browseSettings'),
        onPress: () => navigation.navigate('BrowseSettings'),
      },
    ],
    [navigation],
  );

  const [index, setIndex] = useState(0);
  const openPlugins = useCallback(() => setIndex(1), []);
  const navigationState = useMemo(() => ({ index, routes }), [index, routes]);
  const initialLayout = useMemo(
    () => ({ width: layout.width }),
    [layout.width],
  );
  const indicatorStyle = useMemo(
    () => ({ backgroundColor: theme.primary, height: 3 }),
    [theme.primary],
  );
  const tabBarStyle = useMemo(
    () => ({
      backgroundColor: theme.surface,
      elevation: 0,
      borderBottomWidth: 1,
      borderBottomColor: theme.outlineVariant,
    }),
    [theme.outlineVariant, theme.surface],
  );
  const androidRipple = useMemo(
    () => ({ color: theme.rippleColor }),
    [theme.rippleColor],
  );

  const renderScene = useCallback(
    ({ route }: { route: BrowseRoute }) => {
      switch (route.key) {
        case 'plugins':
          return (
            <PluginsTab
              navigation={navigation}
              theme={theme}
              searchText={searchText}
            />
          );
        default:
          return (
            <SourcesTab
              navigation={navigation}
              onOpenPlugins={openPlugins}
              theme={theme}
              searchText={searchText}
            />
          );
      }
    },
    [navigation, openPlugins, searchText, theme],
  );

  const renderTabBar = useCallback(
    (props: TabBarProps<BrowseRoute>) => (
      <TopTabBar
        {...props}
        indicatorStyle={indicatorStyle}
        style={tabBarStyle}
        inactiveColor={theme.secondary}
        activeColor={theme.primary}
        android_ripple={androidRipple}
      />
    ),
    [
      androidRipple,
      indicatorStyle,
      tabBarStyle,
      theme.primary,
      theme.secondary,
    ],
  );

  return (
    <SafeAreaView excludeBottom>
      <SearchbarV2
        searchText={searchText}
        placeholder={getString('browseScreen.searchbar')}
        leftIcon="magnify"
        onChangeText={setSearchText}
        clearSearchbar={clearSearchbar}
        theme={theme}
        rightIcons={searchbarActions}
        menuButtons={menuButtons}
      />
      <TabView<BrowseRoute>
        navigationState={navigationState}
        initialLayout={initialLayout}
        renderScene={renderScene}
        onIndexChange={setIndex}
        renderTabBar={renderTabBar}
        direction={getAppDirection()}
        lazy
        lazyPreloadDistance={0}
        swipeEnabled={false}
      />
    </SafeAreaView>
  );
};

export default BrowseScreen;
