import {
  buildReceiveScript,
  createWorMessageQueue,
  parseWorMessage,
} from '../worBridge';

describe('parseWorMessage', () => {
  it('accepts valid JSON objects with a string t field', () => {
    const message = parseWorMessage('{"t":"ready"}');
    expect(message).toEqual({ t: 'ready' });
  });

  it('rejects malformed payloads instead of throwing', () => {
    expect(parseWorMessage(undefined)).toBeNull();
    expect(parseWorMessage('')).toBeNull();
    expect(parseWorMessage('not json {')).toBeNull();
    expect(parseWorMessage('null')).toBeNull();
    expect(parseWorMessage('42')).toBeNull();
    expect(parseWorMessage('{"noType":true}')).toBeNull();
    expect(parseWorMessage('{"t":123}')).toBeNull();
  });
});

describe('createWorMessageQueue', () => {
  it('holds messages until ready, then drains in order', () => {
    const queue = createWorMessageQueue();
    queue.push({ kind: 'settings' });
    queue.push({ kind: 'chapters' });
    expect(queue.isReady()).toBe(false);
    const drained = queue.flush();
    expect(drained.map(item => item.kind)).toEqual(['settings', 'chapters']);
    expect(queue.isReady()).toBe(true);
  });

  it('passes messages straight through once ready', () => {
    const queue = createWorMessageQueue();
    queue.push({ kind: 'early' });
    queue.flush();
    expect(queue.enqueueOrTake({ kind: 'late' })).toEqual([
      { kind: 'late' },
    ]);
  });
});

describe('buildReceiveScript', () => {
  it('routes payloads through window.__wor.receive', () => {
    const script = buildReceiveScript({ kind: 'chapter', number: 3 });
    expect(script.startsWith('window.__wor && window.__wor.receive(')).toBe(
      true,
    );
    expect(script.endsWith("'); true;")).toBe(true);
  });

  it('escapes sequences that could break out of the injected string', () => {
    const script = buildReceiveScript({
      kind: 'chapter',
      html: '</script><img src=x onerror=1>',
    });
    expect(script).not.toContain('</script>');
    expect(script).toContain('<\\/script>');
  });
});
