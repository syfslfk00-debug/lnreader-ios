import { WorOutboundMessage } from './types';

/**
 * Bridge transport for the ported wor reader.
 *
 * shell -> host : JSON strings arriving via WebView onMessage. Every payload
 * is validated here so a malformed message (plugin custom.js, truncated
 * write) can never throw inside the bridge and kill later messages.
 *
 * host -> shell : `window.__wor.receive(<json>)` injected AFTER the shell
 * reported `ready`. Messages emitted earlier are queued and flushed on
 * ready — mirrors the original WorReader.tsx webQueue behaviour.
 */

export const parseWorMessage = (raw: string | undefined): WorOutboundMessage | null => {
  if (!raw || typeof raw !== 'string') {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.t !== 'string') {
      return null;
    }
    return parsed as WorOutboundMessage;
  } catch {
    return null;
  }
};

export interface WorMessageQueue {
  /** Queues a message until `flush` is called (i.e. until `ready`). */
  push: (message: Record<string, unknown>) => void;
  /** Marks the shell ready and returns the queued messages in order. */
  flush: () => Record<string, unknown>[];
  isReady: () => boolean;
  /** Messages sent while ready go straight through (returns them). */
  enqueueOrTake: (message: Record<string, unknown>) => Record<string, unknown>[];
}

export const createWorMessageQueue = (): WorMessageQueue => {
  let ready = false;
  let queue: Record<string, unknown>[] = [];

  return {
    push(message) {
      queue.push(message);
    },
    flush() {
      const drained = queue;
      queue = [];
      ready = true;
      return drained;
    },
    isReady: () => ready,
    enqueueOrTake(message) {
      if (!ready) {
        queue.push(message);
        return [];
      }
      return [message];
    },
  };
};

/**
 * Serializes a payload for injectJavaScript. The shell's own `safeJson`
 * escapes `</` on embedded JSON; on this side we also escape it (plus line
 * separators) so the generated JS string can never terminate the script
 * context inside injectJavaScript.
 */
export const buildReceiveScript = (message: Record<string, unknown>): string => {
  const json = JSON.stringify(message)
    .replace(/<\//g, '<\\/')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
    .replace(/'/g, "\\'");
  return `window.__wor && window.__wor.receive('${json}'); true;`;
};
