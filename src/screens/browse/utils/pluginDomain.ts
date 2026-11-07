import { PluginItem } from '@plugins/types';

/**
 * Extracts a display domain (hostname) from a plugin's `site` field.
 *
 * `plugin.site` is a free-form string provided by plugin authors: it can be
 * `https://www.example.com/`, `http://example.com/novel`, `example.com`, or
 * plain garbage. This helper NEVER invents a domain — when the value cannot
 * be parsed into something that looks like a host, it returns `undefined`
 * and the caller must hide the secondary line instead of showing a
 * fabricated or ugly value.
 */
export const getPluginDomain = (plugin: Pick<PluginItem, 'site'>): string | undefined => {
  const raw = (plugin.site ?? '').trim();
  if (!raw) {
    return undefined;
  }

  // Normalize so `new URL` can parse scheme-less hosts. Only http(s) values
  // are treated as real URLs — anything else (javascript:, data:, ...) is
  // not a site domain and must not be displayed.
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return undefined;
    }
    const hostname = url.hostname.toLowerCase();
    // Reject values that clearly are not hostnames ("not a domain", spaces…).
    if (!hostname.includes('.') || hostname.includes(' ')) {
      return undefined;
    }
    // Strip a leading "www." for a compact, uniform display.
    return hostname.replace(/^www\./, '') || undefined;
  } catch {
    return undefined;
  }
};
