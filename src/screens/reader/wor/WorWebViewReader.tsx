import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import WebView from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import NativeFile from '@modules/native-file';
import { useTheme } from '@hooks/persisted';
import { useNovelActions, useNovelValue } from '@screens/novel/NovelContext';
import { getString } from '@i18n/translations';
import { showToast } from '@utils/showToast';

import { ChapterInfo } from '@database/types';
import {
  useChapterContext,
} from '../ChapterContext';
import {
  fetchChapter,
} from '@services/plugin/fetch';
import { NOVEL_STORAGE } from '@utils/Storages';
import { sanitizeChapterText } from '../utils/sanitizeChapterText';
import { getReaderAssetsPrefix } from '@utils/readerAssets';

import { parseWorMessage, buildReceiveScript, createWorMessageQueue } from './worBridge';
import { buildWorReaderHtml } from './worShellBuilder';
import {
  applyWorSettingsPatch,
  getWorScrollOffset,
  loadWordsStore,
  loadWorSettings,
  nextThemeCycleStep,
  novelScopeOf,
  saveWorLastPos,
  saveWorScroll,
  saveWordsStore,
} from './worSettings';
import {
  buildWorChapterNumberMap,
  buildWorChapterSectionHtml,
  getWorChapterView,
  prepareWorContent,
  worLinesToSpeechQueue,
} from './worChapter';
import { buildWorSectionHTML } from './sections';
import {
  WorChapterListItem,
  WorGotoMessage,
  WorNavMessage,
  WorSettings,
  WorWordItem,
  WorWordsActionMessage,
  WorWordsStore,
} from './types';

export interface WorWebViewReaderHandle {
  /** Plain-text speech queue of the current chapter (TTS integration). */
  getSpeechQueue: () => string[];
  isDockOpen: () => boolean;
}

interface WorWebViewReaderProps {
  /** Opened from the drawer's "قراءة صوتية" action. */
  onOpenTts: () => void;
  onDockChange: (open: boolean) => void;
  /** Shell asked to leave the reader (drawer/exit flow). */
  onExit: () => void;
  /** Shell asked for the novel page (drawer / dock book panel). */
  onNovelPage: () => void;
}

/**
 * Host of the ported New-moon-2 reader engine.
 *
 * Responsibilities mirror the original WorReader.tsx, re-targeted at LNReader:
 *   - build the shell HTML once per screen mount (never rebuilt for settings
 *     changes — everything flows over the message protocol),
 *   - queue host->shell messages until `ready`,
 *   - feed LNReader chapters (SQLite / downloads / plugins) into the shell,
 *   - persist settings + words + scroll position in MMKV,
 *   - map shell navigation events to the RN stack (novel page / exit / TTS).
 *
 * The engine files themselves are a verbatim port — see
 * src/screens/reader/wor/engine/worShell.js for the adaptation list.
 */
const WorWebViewReaderBase = forwardRef<
  WorWebViewReaderHandle,
  WorWebViewReaderProps
>(({ onOpenTts, onDockChange, onExit, onNovelPage }, ref) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const {
    novel,
    chapter,
    chapterText,
    loading,
    nextChapter,
    prevChapter,
    getChapter,
    saveProgress,
  } = useChapterContext();
  const { updateChapterProgress } = useNovelActions();
  const novelChapters = useNovelValue('chapters');
  const batchInformation = useNovelValue('batchInformation');
  /** Chapters loaded by earlier store batches (LNReader batches = 1000). */
  const batchOffset = (batchInformation?.batch ?? 0) * 1000;
  const novelTotalChapters = batchInformation?.totalChapters ?? 0;

  const webViewRef = useRef<WebView<object>>(null);
  const queueRef = useRef(createWorMessageQueue());
  const settingsRef = useRef<WorSettings>(loadWorSettings());
  const wordsRef = useRef<WorWordsStore>(loadWordsStore());
  const dockOpenRef = useRef(true);
  /** id of the chapter the shell is currently scrolled into (continuous mode). */
  const viewedChapterRef = useRef<ChapterInfo>(chapter);
  /** tail of the continuous document — last appended chapter. */
  const appendedTailRef = useRef<ChapterInfo | null>(null);
  /** how many chapters were appended into the current document. */
  const appendedCountRef = useRef(0);
  /** guards duplicate progress writes per chapter. */
  const markedReadRef = useRef<Set<number>>(new Set());
  /** latest scroll offsets for the debounced persistence writer. */
  const pendingScrollRef = useRef<{ novelId: number; number: number; offset: number } | null>(null);
  const scrollSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const chapterMap = useMemo(
    () => buildWorChapterNumberMap(novelChapters, novel),
    [novelChapters, novel],
  );

  // -------------------------------------------------------------------------
  // shell HTML (built ONCE per mount)
  // -------------------------------------------------------------------------
  const shellHtml = useMemo(() => {
    const fontBaseUrl = __DEV__ ? `${getReaderAssetsPrefix()}/wor` : undefined;
    return buildWorReaderHtml({
      settings: settingsRef.current,
      novelTitle: novel.name,
      novelCover: novel.cover,
      safeTop: insets.top,
      safeBottom: insets.bottom,
      fontBaseUrl,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const webViewSource = useMemo(() => {
    if (__DEV__) {
      // Metro serves the engine fonts; the HTML itself is inline.
      return {
        html: shellHtml,
        baseUrl: `${getReaderAssetsPrefix()}/wor/`,
      };
    }
    return {
      html: shellHtml,
      baseUrl: `file://${NativeFile.BundlePath}/ReaderAssets/wor/`,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shellHtml]);

  // -------------------------------------------------------------------------
  // outbound helpers
  // -------------------------------------------------------------------------
  const postToShell = useCallback((message: Record<string, unknown>) => {
    webViewRef.current?.injectJavaScript(buildReceiveScript(message));
  }, []);

  const sendThroughQueue = useCallback(
    (message: Record<string, unknown>) => {
      const messages = queueRef.current.enqueueOrTake(message);
      messages.forEach(postToShell);
    },
    [postToShell],
  );

  const sendWords = useCallback(
    (toast?: string) => {
      const payload = {
        novel: novelScopeOf(wordsRef.current, novel.id),
        global: wordsRef.current.global,
      };
      sendThroughQueue(
        toast
          ? { kind: 'wordsSaved', items: payload, toast }
          : { kind: 'words', items: payload },
      );
    },
    [novel.id, sendThroughQueue],
  );

  const sendChapters = useCallback(
    (page: number) => {
      const list: WorChapterListItem[] = novelChapters.map(item => {
        const number = chapterMap.numbers.get(item.id) ?? 0;
        return { number, title: item.name };
      });
      const total = list.length;
      const sliced = list.slice(0, Math.max(page, 1) * 100);
      sendThroughQueue({ kind: 'chapters', list: sliced, total });
    },
    [chapterMap, novelChapters, sendThroughQueue],
  );

  const sendChapterMessage = useCallback(
    (opts: { keepScroll?: boolean } = {}) => {
      const view = getWorChapterView(
        novelChapters,
        chapterMap.numbers,
        chapter,
        batchOffset,
        novelTotalChapters,
      );
      if (!view) {
        return;
      }
      const { sectionSettings } = prepareWorContent(
        chapterText,
        novel.id,
        wordsRef.current,
      );
      const html = buildWorChapterSectionHtml(
        {
          number: view.number,
          title: chapter.name,
          content: chapterText,
        },
        sectionSettings,
      );
      sendThroughQueue({
        kind: 'chapter',
        number: view.number,
        title: chapter.name,
        novelTitle: novel.name,
        total: view.total,
        percent: `${view.percentValue}%`,
        percentValue: view.percentValue,
        hasPrev: prevChapter !== null,
        hasNext: nextChapter !== null,
        html,
        commentCount: 0,
        showCommentsButton: false,
        authorCard: null,
        isFavorite: false,
        keepScroll: opts.keepScroll ?? false,
        scrollOffset: getWorScrollOffset(novel.id, view.number),
      });
      viewedChapterRef.current = chapter;
    },
    [
      batchOffset,
      chapter,
      chapterMap,
      chapterText,
      nextChapter,
      novel.id,
      novel.name,
      novelChapters,
      novelTotalChapters,
      prevChapter,
      sendThroughQueue,
    ],
  );

  // -------------------------------------------------------------------------
  // chapter text loader for continuous mode (mirrors useChapter.loadChapterText)
  // -------------------------------------------------------------------------
  const loadChapterHtml = useCallback(
    async (chap: ChapterInfo): Promise<string> => {
      const filePath = `${NOVEL_STORAGE}/${novel.pluginId}/${chap.novelId}/${chap.id}/index.html`;
      try {
        const local = await NativeFile.readFile(filePath);
        return sanitizeChapterText(novel.pluginId, novel.name, chap.name, local);
      } catch {
        const remote = await fetchChapter(novel.pluginId, chap.path);
        return sanitizeChapterText(novel.pluginId, novel.name, chap.name, remote);
      }
    },
    [novel.name, novel.pluginId],
  );

  /**
   * Continuous mode: loads the chapter after the current tail WITHOUT
   * replacing the document (appendChapter), keeping scroll position intact.
   */
  const appendNextChapter = useCallback(async () => {
    const ordered = novelChapters;
    const tail = appendedTailRef.current ?? viewedChapterRef.current;
    const tailIndex = ordered.findIndex(item => item.id === tail.id);
    if (tailIndex === -1 || tailIndex >= ordered.length - 1) {
      return null;
    }
    // The store list is the same ordered list the chapters sheet shows, so
    // "next" here matches what goto/nav resolve to (never number+1 arithmetic).
    const next = ordered[tailIndex + 1];
    try {
      const html = await loadChapterHtml(next);
      appendedTailRef.current = next;
      const number = chapterMap.numbers.get(next.id);
      if (number === undefined) {
        return null;
      }
      const { sectionSettings } = prepareWorContent(
        html,
        novel.id,
        wordsRef.current,
      );
      // idx > 0 renders the ◆ ornament + the sub-title block, exactly like
      // the original continuous appends.
      const idx = 1 + appendedCountRef.current;
      appendedCountRef.current += 1;
      const section = buildWorSectionHTML(
        { number, title: next.name, content: html },
        idx,
        { ...sectionSettings, enableSeparator: true },
      );
      return { next, number, html: section };
    } catch {
      return null;
    }
  }, [chapterMap.numbers, loadChapterHtml, novel.id, novelChapters]);

  // -------------------------------------------------------------------------
  // inbound dispatch
  // -------------------------------------------------------------------------
  const handleSettingsPatch = useCallback(
    (patch: Partial<WorSettings>) => {
      const { settings, structuralChanged } = applyWorSettingsPatch(patch);
      settingsRef.current = settings;
      if (structuralChanged) {
        // Marks are baked into the HTML — rebuild with keepScroll.
        sendChapterMessage({ keepScroll: true });
      }
    },
    [sendChapterMessage],
  );

  const handleWordsAction = useCallback(
    (message: WorWordsActionMessage) => {
      const store = wordsRef.current;
      const scopeKey = message.scope === 'global' ? 'global' : String(novel.id);
      const list: WorWordItem[] =
        message.scope === 'global'
          ? store.global
          : store.novel[scopeKey] ?? [];

      switch (message.action) {
        case 'addRep':
        case 'updateRep': {
          const item = {
            id: message.id,
            original: message.original ?? '',
            replacement: message.replacement ?? '',
            exact: Boolean(message.exact),
            color: message.color ?? null,
          };
          const existing = message.id
            ? list.findIndex(word => word.id === message.id)
            : -1;
          if (existing >= 0) {
            list[existing] = {
              ...list[existing],
              ...item,
              id: list[existing].id,
            };
          } else {
            list.unshift({
              id:
                Date.now().toString(36) +
                Math.random().toString(36).slice(2, 8),
              original: item.original,
              replacement: item.replacement,
              exact: item.exact,
              color: item.color,
            });
          }
          break;
        }
        case 'deleteRep': {
          const index = list.findIndex(word => word.id === message.id);
          if (index >= 0) {
            list.splice(index, 1);
          }
          break;
        }
        case 'clearScope': {
          if (message.scope === 'global') {
            store.global = [];
          } else {
            store.novel[scopeKey] = [];
          }
          break;
        }
      }

      if (message.scope === 'global') {
        store.global = list;
      } else {
        store.novel[scopeKey] = list;
      }
      wordsRef.current = { ...store };
      saveWordsStore(wordsRef.current);

      // Structural: replacement terms are baked into the chapter HTML.
      if (message.action !== 'clearScope') {
        sendChapterMessage({ keepScroll: true });
      }
      sendWords(getString('readerScreen.saved'));
    },
    [novel.id, sendChapterMessage, sendWords],
  );

  const saveViewedScroll = useCallback(
    (number: number, offset: number) => {
      pendingScrollRef.current = { novelId: novel.id, number, offset };
      if (scrollSaveTimer.current) {
        return;
      }
      scrollSaveTimer.current = setTimeout(() => {
        scrollSaveTimer.current = null;
        const pending = pendingScrollRef.current;
        if (!pending) {
          return;
        }
        saveWorScroll(pending.novelId, pending.number, pending.offset);
        saveWorLastPos(pending.novelId, pending.number, pending.offset);
      }, 600);
    },
    [novel.id],
  );

  const handleScroll = useCallback(
    (payload: {
      offset: number;
      inOffset: number;
      chapter: number;
      ratio: number;
    }) => {
      const number = payload.chapter;
      const viewed =
        chapterMap.byNumber.get(number) ?? viewedChapterRef.current;
      viewedChapterRef.current = viewed;
      saveViewedScroll(number, payload.inOffset);

      if (settingsRef.current.continuousMode) {
        // Heights of appended sections are unknown host-side; progress is
        // approximated from the in-section offset and the previous section
        // is completed once the reader moves past it.
        if (payload.inOffset > 400) {
          updateChapterProgress(viewed.id, Math.min(95, Math.round(payload.inOffset / 40)));
        }
      } else {
        saveProgress(Math.round(payload.ratio * 100));
      }
    },
    [chapterMap.byNumber, saveProgress, saveViewedScroll, updateChapterProgress],
  );

  const handleNav = useCallback(
    (message: WorNavMessage) => {
      if (message.dir === 'next') {
        if (nextChapter) {
          appendedTailRef.current = null;
          getChapter(nextChapter);
        } else if (nextChapter === null) {
          showToast(getString('readerScreen.noNextChapter'));
        }
        return;
      }
      if (message.dir === 'prev') {
        if (prevChapter) {
          appendedTailRef.current = null;
          getChapter(prevChapter);
        } else if (prevChapter === null) {
          showToast(getString('readerScreen.noPreviousChapter'));
        }
        return;
      }
      switch (message.to) {
        case 'novel':
          onNovelPage();
          break;
        case 'exit':
          onExit();
          break;
        case 'tts':
          onOpenTts();
          break;
        default:
          break;
      }
    },
    [getChapter, nextChapter, onExit, onNovelPage, onOpenTts, prevChapter],
  );

  const handleGoto = useCallback(
    (message: WorGotoMessage) => {
      const target = chapterMap.byNumber.get(message.number);
      if (target) {
        appendedTailRef.current = null;
        getChapter(target);
      } else {
        showToast(getString('readerScreen.noNextChapter'));
      }
    },
    [chapterMap.byNumber, getChapter],
  );

  const handleNeedNext = useCallback(async () => {
    if (!settingsRef.current.continuousMode) {
      return;
    }
    sendThroughQueue({ kind: 'loadingNext', value: true });
    const appended = await appendNextChapter();
    if (appended) {
      sendThroughQueue({
        kind: 'appendChapter',
        number: appended.number,
        html: appended.html,
      });
      sendThroughQueue({ kind: 'loadingNext', value: false });
    } else {
      sendThroughQueue({ kind: 'loadingNext', value: false });
      sendThroughQueue({ kind: 'endReached' });
    }
  }, [appendNextChapter, sendThroughQueue]);

  const handleMessage = useCallback(
    (event: { nativeEvent: { data?: string } }) => {
      const message = parseWorMessage(event.nativeEvent.data);
      if (!message) {
        return;
      }

      if (message.t === 'ready') {
        queueRef.current.flush().forEach(postToShell);
        sendThroughQueue({ kind: 'settings', settings: settingsRef.current });
        sendChapters(1);
        sendWords();
        sendChapterMessage();
        return;
      }

      switch (message.t) {
        case 'scroll':
          handleScroll(message as never);
          break;
        case 'needNext':
          void handleNeedNext();
          break;
        case 'nav':
          handleNav(message as never);
          break;
        case 'goto':
          handleGoto(message as never);
          break;
        case 'chaptersLoadMore':
          sendChapters(2);
          break;
        case 'chaptersSearch': {
          const q = String((message as { q?: string }).q ?? '').trim().toLowerCase();
          const results = novelChapters
            .filter(item => item.name.toLowerCase().includes(q))
            .slice(0, 100)
            .map(item => ({
              number: chapterMap.numbers.get(item.id) ?? 0,
              title: item.name,
            }));
          sendThroughQueue({
            kind: 'chaptersSearchResults',
            q,
            results,
            total: results.length,
          });
          break;
        }
        case 'novelPage':
          onNovelPage();
          break;
        case 'settings':
          handleSettingsPatch((message as { patch?: Partial<WorSettings> }).patch ?? {});
          break;
        case 'words':
          handleWordsAction(message as never);
          break;
        case 'wordsOpen':
          sendWords();
          break;
        case 'themeCycle': {
          const patch = nextThemeCycleStep(settingsRef.current);
          handleSettingsPatch(patch);
          sendThroughQueue({ kind: 'settings', settings: patch });
          break;
        }
        case 'exit':
          onExit();
          break;
        case 'dock': {
          const open = Boolean((message as { open?: boolean }).open);
          dockOpenRef.current = open;
          StatusBar.setHidden(!open);
          onDockChange(open);
          break;
        }
        case 'error':
          showToast(String((message as { message?: string }).message ?? ''));
          break;
        default:
          break;
      }
    },
    [
      chapterMap.numbers,
      handleGoto,
      handleNav,
      handleNeedNext,
      handleScroll,
      handleSettingsPatch,
      handleWordsAction,
      novelChapters,
      onDockChange,
      onExit,
      onNovelPage,
      postToShell,
      sendChapterMessage,
      sendChapters,
      sendThroughQueue,
      sendWords,
    ],
  );

  // -------------------------------------------------------------------------
  // chapter lifecycle effects
  // -------------------------------------------------------------------------
  // A finished (non-replacing) chapter load sends the full chapter message.
  const lastSentChapterRef = useRef<number>(-1);
  useEffect(() => {
    if (loading || !chapterText) {
      return;
    }
    if (lastSentChapterRef.current === chapter.id) {
      return;
    }
    lastSentChapterRef.current = chapter.id;
    appendedTailRef.current = null;
    appendedCountRef.current = 0;
    sendChapterMessage();
  }, [chapter.id, chapterText, loading, sendChapterMessage]);

  // Mark-as-read for continuous mode (host-managed chapters).
  useEffect(() => {
    if (!settingsRef.current.continuousMode) {
      return;
    }
    const viewed = viewedChapterRef.current;
    if (!viewed || markedReadRef.current.has(viewed.id)) {
      return;
    }
    markedReadRef.current.add(viewed.id);
  }, [chapter.id]);

  // End-of-novel footer once adjacency is resolved.
  useEffect(() => {
    if (!loading && nextChapter === null && queueRef.current.isReady()) {
      sendThroughQueue({ kind: 'endReached' });
    }
  }, [loading, nextChapter, sendThroughQueue]);

  // Show the status bar again when leaving the reader.
  useEffect(
    () => () => {
      StatusBar.setHidden(false);
      if (scrollSaveTimer.current) {
        clearTimeout(scrollSaveTimer.current);
      }
    },
    [],
  );

  useImperativeHandle(
    ref,
    () => ({
      getSpeechQueue: () => {
        const { plainText } = prepareWorContent(
          chapterText,
          novel.id,
          wordsRef.current,
        );
        return worLinesToSpeechQueue(plainText);
      },
      isDockOpen: () => dockOpenRef.current,
    }),
    [chapterText, novel.id],
  );

  if (loading) {
    return null;
  }

  return (
    <View
      style={[styles.container, { backgroundColor: settingsRef.current.bgColor }]}
      testID="wor-reader-host"
    >
      <WebView
        ref={webViewRef}
        source={webViewSource}
        originWhitelist={['file://*', 'http://localhost:*', 'https://*', 'about:*']}
        allowFileAccess
        allowUniversalAccessFromFileURLs
        javaScriptEnabled
        domStorageEnabled
        onMessage={handleMessage}
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
        cacheEnabled
        style={[styles.webview, { backgroundColor: theme.background }]}
        onShouldStartLoadWithRequest={(request: { url: string }) => {
          // The shell is a self-contained document: only the first (blank)
          // navigation is ours, any real http(s) navigation comes from chapter
          // links and is handed to the OS browser.
          if (
            request.url.startsWith('file://') ||
            request.url.startsWith('about:') ||
            (__DEV__ && request.url.includes('localhost:8081'))
          ) {
            return true;
          }
          return false;
        }}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
});

export const WorWebViewReader = memo(WorWebViewReaderBase);
