import { memo, useCallback, useMemo } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  LegendList,
  LegendListRenderItemProps,
} from '@legendapp/list/react-native';

import { EmptyView, IconButtonV2 } from '@components';
import {
  useBrowseSettings,
  useFilteredInstalledPlugins,
  useLastUsedPluginId,
  usePinnedPlugins,
  usePluginActions,
} from '@hooks/persisted';
import { BrowseScreenProps } from '@navigators/types';
import { PluginItem } from '@plugins/types';
import { getString } from '@i18n/translations';
import { ThemeColors } from '@theme/types';

import DiscoverCard from '../discover/DiscoverCard';
import { buildSourceEntries, SourceEntry } from '../utils/buildBrowseEntries';
import { getPluginDomain } from '../utils/pluginDomain';

interface SourcesTabProps {
  navigation: BrowseScreenProps['navigation'];
  onOpenPlugins: () => void;
  searchText: string;
  theme: ThemeColors;
}

interface SourceCardProps {
  isPinned: boolean;
  onLatestPress: (plugin: PluginItem) => void;
  onPinPress: (plugin: PluginItem) => void;
  onPress: (plugin: PluginItem) => void;
  plugin: PluginItem;
  theme: ThemeColors;
}

/**
 * Source card — visual reference: the Suwayomi browse screen.
 *
 * One consistent card per source:
 *   [icon] Name          [الأحدث chip] [pin]
 *          domain (muted, only when the site field actually parses)
 *
 * The card is fully logical-property based, so in Arabic the icon sits on
 * the right, the text flows next to it and the actions sit on the left —
 * the RTL layout is the design, not a mirror hack. The language is NOT
 * repeated inside the card: language section headers already group the
 * list; the secondary line is the source's real domain (or omitted).
 */
const SourceCard = memo(
  ({
    isPinned,
    onLatestPress,
    onPinPress,
    onPress,
    plugin,
    theme,
  }: SourceCardProps) => {
    const domain = useMemo(() => getPluginDomain(plugin), [plugin]);

    return (
      <View
        testID="browse-source-card"
        accessibilityLabel={`${plugin.name}`}
        style={[
          styles.card,
          {
            backgroundColor: theme.surface,
            borderColor: theme.outlineVariant,
          },
        ]}
      >
        <Pressable
          accessibilityLabel={`${getString('browse')} ${plugin.name}`}
          accessibilityRole="button"
          style={styles.cardAction}
          android_ripple={{ color: theme.rippleColor }}
          onPress={() => onPress(plugin)}
        />
        <View pointerEvents="none" style={styles.cardMainContent}>
          <Image
            source={{ uri: plugin.iconUrl }}
            style={[styles.icon, { backgroundColor: theme.surfaceVariant }]}
          />
          <View style={styles.details}>
            <Text
              numberOfLines={1}
              style={[styles.name, { color: theme.onSurface }]}
            >
              {plugin.name}
            </Text>
            {domain ? (
              <Text
                numberOfLines={1}
                style={[styles.domain, { color: theme.onSurfaceVariant }]}
              >
                {domain}
              </Text>
            ) : null}
          </View>
        </View>
        <Pressable
          accessibilityLabel={`${getString('browseScreen.latest')} ${
            plugin.name
          }`}
          accessibilityRole="button"
          style={[
            styles.latestChip,
            {
              backgroundColor: theme.primary + '14',
              borderColor: theme.primary + '3D',
            },
          ]}
          hitSlop={6}
          onPress={() => onLatestPress(plugin)}
        >
          <Text style={[styles.latestChipText, { color: theme.primary }]}>
            {getString('browseScreen.latest')}
          </Text>
        </Pressable>
        <IconButtonV2
          accessibilityLabel={
            isPinned
              ? getString('browseScreen.unpinSource', { name: plugin.name })
              : getString('browseScreen.pinSource', { name: plugin.name })
          }
          name={isPinned ? 'pin' : 'pin-outline'}
          color={isPinned ? theme.primary : theme.onSurfaceVariant}
          onPress={() => onPinPress(plugin)}
          theme={theme}
        />
      </View>
    );
  },
);

export const SourcesTab = memo(
  ({ navigation, onOpenPlugins, searchText, theme }: SourcesTabProps) => {
    const installedPlugins = useFilteredInstalledPlugins();
    const lastUsedPluginId = useLastUsedPluginId();
    const pinnedPlugins = usePinnedPlugins();
    const { setLastUsedPluginId, togglePinPlugin } = usePluginActions();
    const { showMyAnimeList, showAniList } = useBrowseSettings();
    const { width: windowWidth } = useWindowDimensions();

    /**
     * Tablet/iPad refinement: cards stretch on phones, but get a readable
     * maximum width and stay centered on wide screens instead of the text
     * lines stretching across the whole 10-inch row.
     */
    const listPaddingHorizontal = useMemo(() => {
      if (windowWidth >= 1024) {
        return Math.round((windowWidth - 640) / 2);
      }
      if (windowWidth >= 768) {
        return Math.round((windowWidth - 560) / 2);
      }
      return 12;
    }, [windowWidth]);

    const navigateToSource = useCallback(
      (plugin: PluginItem, showLatestNovels?: boolean) => {
        navigation.navigate('SourceScreen', {
          pluginId: plugin.id,
          pluginName: plugin.name,
          site: plugin.site,
          showLatestNovels,
        });
        setLastUsedPluginId(plugin.id);
      },
      [navigation, setLastUsedPluginId],
    );

    const openSource = useCallback(
      (plugin: PluginItem) => navigateToSource(plugin),
      [navigateToSource],
    );

    const openLatest = useCallback(
      (plugin: PluginItem) => navigateToSource(plugin, true),
      [navigateToSource],
    );

    const togglePin = useCallback(
      (plugin: PluginItem) => {
        togglePinPlugin(plugin.id);
      },
      [togglePinPlugin],
    );

    const entries = useMemo(() => {
      return buildSourceEntries({
        installedPlugins,
        lastUsedPluginId,
        pinnedPluginIds: pinnedPlugins,
        searchText,
        showAniList,
        showMyAnimeList,
      });
    }, [
      installedPlugins,
      lastUsedPluginId,
      pinnedPlugins,
      searchText,
      showAniList,
      showMyAnimeList,
    ]);

    const renderItem = useCallback(
      ({ item }: LegendListRenderItemProps<SourceEntry>) => {
        if (item.type === 'header') {
          return (
            <View
              style={[
                styles.sectionHeaderRow,
                { paddingHorizontal: listPaddingHorizontal + 4 },
              ]}
            >
              <Text
                style={[styles.sectionHeader, { color: theme.onSurfaceVariant }]}
              >
                {item.title}
              </Text>
              <View
                style={[styles.sectionHeaderRule, { borderColor: theme.outlineVariant }]}
              />
            </View>
          );
        }

        if (item.type === 'discover') {
          const isAniList = item.tracker === 'AniList';
          return (
            <View
              style={{ paddingHorizontal: listPaddingHorizontal }}
            >
              <DiscoverCard
                theme={theme}
                icon={
                  isAniList
                    ? require('../../../../assets/anilist.png')
                    : require('../../../../assets/mal.png')
                }
                trackerName={item.tracker}
                onPress={() =>
                  navigation.navigate(isAniList ? 'BrowseAL' : 'BrowseMal')
                }
              />
            </View>
          );
        }

        if (item.type === 'empty') {
          return (
            <View style={styles.inlineEmpty}>
              <EmptyView
                description={getString('browseScreen.noSources')}
                actions={[
                  {
                    iconName: 'puzzle-outline',
                    onPress: onOpenPlugins,
                    title: getString('browseScreen.plugins'),
                  },
                ]}
                theme={theme}
              />
            </View>
          );
        }

        return (
          <View style={{ paddingHorizontal: listPaddingHorizontal }}>
            <SourceCard
              plugin={item.plugin}
              isPinned={item.isPinned}
              onPress={openSource}
              onLatestPress={openLatest}
              onPinPress={togglePin}
              theme={theme}
            />
          </View>
        );
      },
      [
        listPaddingHorizontal,
        navigation,
        onOpenPlugins,
        openLatest,
        openSource,
        theme,
        togglePin,
      ],
    );

    return (
      <LegendList
        data={entries}
        estimatedItemSize={88}
        getItemType={item => item.type}
        keyExtractor={item => item.key}
        ListEmptyComponent={
          <EmptyView
            description={getString('browseScreen.noSearchResults')}
            theme={theme}
          />
        }
        contentContainerStyle={
          !entries.length ? styles.emptyList : { paddingBottom: 24 }
        }
        recycleItems
        renderItem={renderItem}
        showsVerticalScrollIndicator={false}
      />
    );
  },
);

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 76,
    marginBottom: 10,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 10,
    position: 'relative',
  },
  cardAction: {
    bottom: 0,
    start: 0,
    end: 0,
    top: 0,
    position: 'absolute',
  },
  cardMainContent: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
  },
  details: {
    flex: 1,
    marginStart: 14,
  },
  domain: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
    opacity: 0.85,
  },
  emptyList: {
    flexGrow: 1,
  },
  icon: {
    borderRadius: 10,
    height: 48,
    width: 48,
  },
  inlineEmpty: {
    height: 240,
  },
  latestChip: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    marginStart: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  latestChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
    paddingVertical: 12,
  },
  sectionHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  sectionHeaderRule: {
    borderTopWidth: StyleSheet.hairlineWidth,
    flex: 1,
  },
});
