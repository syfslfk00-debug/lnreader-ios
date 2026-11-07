import { useCallback, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { BottomSheetModal } from '@gorhom/bottom-sheet';

import { ErrorScreenV2 } from '@components';
import { getString } from '@i18n/translations';
import { ChapterScreenProps } from '@navigators/types';

import { useChapterContext } from '../ChapterContext';
import ChapterLoadingScreen from '../ChapterLoadingScreen/ChapterLoadingScreen';
import { WorTtsSheet } from './WorTtsSheet';
import { WorWebViewReader, WorWebViewReaderHandle } from './WorWebViewReader';

/**
 * Screen body for the ported New-moon-2 reader.
 *
 * The reader renders WITHOUT the classic LNReader chrome (appbar / footer /
 * drawer / bottom sheet): the ported engine brings its own dock, panels,
 * chapters sheet and words sheet — that IS the New-moon-2 experience. The
 * screen only wires the shell's navigation events to the RN stack and hosts
 * the minimal TTS sheet.
 */
export const WorReaderScreen = ({ navigation }: ChapterScreenProps) => {
  const { novel, chapter, loading, error, refetch } = useChapterContext();
  const readerRef = useRef<WorWebViewReaderHandle>(null);
  const ttsSheetRef = useRef<BottomSheetModal>(null);
  const speechQueueRef = useRef<string[]>([]);

  const openTts = useCallback(() => {
    speechQueueRef.current = readerRef.current?.getSpeechQueue() ?? [];
    ttsSheetRef.current?.present();
  }, []);

  const closeTts = useCallback(() => {
    speechQueueRef.current = [];
  }, []);

  const goBack = useCallback(() => navigation.goBack(), [navigation]);

  const openNovelPage = useCallback(() => {
    navigation.replace('Novel', {
      path: novel.path,
      pluginId: novel.pluginId,
      name: novel.name,
      cover: novel.cover ?? '',
    });
  }, [navigation, novel.cover, novel.name, novel.path, novel.pluginId]);
  if (error) {
    return (
      <ErrorScreenV2
        error={error}
        actions={[
          {
            iconName: 'refresh',
            title: getString('common.retry'),
            onPress: refetch,
          },
        ]}
      />
    );
  }

  return (
    <View style={styles.container}>
      {loading ? (
        <ChapterLoadingScreen />
      ) : (
        <WorWebViewReader
          ref={readerRef}
          onOpenTts={openTts}
          onDockChange={() => {}}
          onExit={goBack}
          onNovelPage={openNovelPage}
        />
      )}
      <WorTtsSheet
        bottomSheetRef={ttsSheetRef}
        novelName={novel.name}
        chapterName={chapter.name}
        coverUri={novel.cover}
        speechQueue={speechQueueRef.current}
        onClose={closeTts}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
