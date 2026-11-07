import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { Button } from 'react-native-paper';

import { useTheme } from '@hooks/persisted';
import { getString } from '@i18n/translations';
import { useTtsSession } from '../hooks/useTtsSession';
import type { TtsSettings } from '@modules/nitro-tts';

interface WorTtsSheetProps {
  bottomSheetRef: React.RefObject<BottomSheetModal | null>;
  novelName: string;
  chapterName: string;
  coverUri?: string | null;
  /** Plain-text paragraphs of the current chapter. */
  speechQueue: string[];
  onClose: () => void;
}

const DEFAULT_TTS_SETTINGS: TtsSettings = { rate: 1.0, pitch: 1.0 };

/**
 * Minimal TTS surface for the ported wor reader.
 *
 * The classic LNReader reader keeps its full TTS panel (engine/voice pickers,
 * DOM sync); this sheet keeps the LNReader capability available inside the
 * ported New-moon-2 reader without altering the ported UI: it plays the
 * chapter's plain-text paragraphs through the same native session the classic
 * reader uses, with play/pause/skip controls and progress.
 */
export const WorTtsSheet = memo(
  ({
    bottomSheetRef,
    novelName,
    chapterName,
    coverUri,
    speechQueue,
    onClose,
  }: WorTtsSheetProps) => {
    const theme = useTheme();
    const snapPoints = useMemo(() => ['32%'], []);
    const { state, progress, error, loadAndPlay, command, seekTo } =
      useTtsSession();

    const startedRef = useRef(false);
    const start = useCallback(() => {
      if (!speechQueue.length) {
        return;
      }
      void loadAndPlay(
        speechQueue,
        progress.index || 0,
        { novelName, chapterName, coverUri: coverUri ?? undefined },
        DEFAULT_TTS_SETTINGS,
      );
      startedRef.current = true;
    }, [
      chapterName,
      coverUri,
      loadAndPlay,
      novelName,
      progress.index,
      speechQueue,
    ]);

    const isPlaying = state === 'playing' || state === 'loading';

    useEffect(() => {
      if (
        bottomSheetRef.current &&
        !startedRef.current &&
        speechQueue.length &&
        progress.total === 0
      ) {
        // Preload nothing — playback starts on the explicit play button so
        // merely opening the sheet never speaks.
      }
    }, [bottomSheetRef, progress.total, speechQueue.length]);

    return (
      <BottomSheetModal
        ref={bottomSheetRef}
        index={0}
        snapPoints={snapPoints}
        backgroundStyle={{ backgroundColor: theme.surface }}
        handleIndicatorStyle={{ backgroundColor: theme.onSurfaceVariant }}
        onDismiss={onClose}
      >
        <BottomSheetView style={styles.container}>
          <Text
            numberOfLines={1}
            style={[styles.chapter, { color: theme.onSurface }]}
          >
            {chapterName}
          </Text>
          <Text style={[styles.meta, { color: theme.onSurfaceVariant }]}>
            {progress.total
              ? `${progress.index + 1} / ${progress.total}`
              : getString('readerScreen.ttsIdle')}
          </Text>
          {error ? (
            <Text style={[styles.error, { color: theme.error }]}> {error} </Text>
          ) : null}
          <View style={styles.controls}>
            <Button
              accessibilityLabel={getString('readerScreen.ttsPrevious')}
              compact
              mode="outlined"
              onPress={() => command('previous')}
              style={styles.button}
            >
              ⏮
            </Button>
            <Button
              accessibilityLabel={
                isPlaying
                  ? getString('readerScreen.ttsPause')
                  : getString('readerScreen.ttsPlay')
              }
              mode="contained"
              onPress={() => {
                if (isPlaying) {
                  command('pause');
                } else if (progress.total) {
                  command('play');
                } else {
                  start();
                }
              }}
              style={styles.playButton}
            >
              {isPlaying ? '⏸' : '▶'}
            </Button>
            <Button
              accessibilityLabel={getString('readerScreen.ttsNext')}
              compact
              mode="outlined"
              onPress={() => command('next')}
              style={styles.button}
            >
              ⏭
            </Button>
            <Button
              accessibilityLabel={getString('readerScreen.ttsStop')}
              compact
              mode="text"
              onPress={() => {
                command('stop');
                seekTo(0);
              }}
              style={styles.button}
            >
              ⏹
            </Button>
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);

const styles = StyleSheet.create({
  chapter: {
    fontSize: 16,
    fontWeight: '600',
    paddingHorizontal: 24,
  },
  container: {
    flex: 1,
    gap: 8,
    paddingHorizontal: 24,
    paddingTop: 4,
  },
  controls: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
    marginTop: 8,
  },
  button: {
    minWidth: 56,
  },
  playButton: {
    minWidth: 88,
  },
  meta: {
    fontSize: 13,
  },
  error: {
    fontSize: 12,
  },
});
