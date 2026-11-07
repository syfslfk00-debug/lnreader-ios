const mockStore = new Map<string, string>();

jest.mock('@utils/mmkv/mmkv', () => ({
  MMKVStorage: {
    getString: (key: string) => mockStore.get(key),
    set: (key: string, value: string) => mockStore.set(key, value),
  },
  getMMKVObject: (key: string) => {
    const data = mockStore.get(key);
    return data ? JSON.parse(data) : undefined;
  },
  setMMKVObject: (key: string, value: unknown) =>
    mockStore.set(key, JSON.stringify(value)),
}));

import { loadWordsStore, saveWordsStore, novelScopeOf } from '../worSettings';

describe('worSettings persistence', () => {
  beforeEach(() => mockStore.clear());

  it('round-trips the words store through MMKV', () => {
    saveWordsStore({
      novel: {
        '42': [
          { id: 'a', original: 'قديم', replacement: 'جديد', exact: false, color: null },
        ],
      },
      global: [
        { id: 'b', original: 'عالمي', replacement: 'مُعدَّل', exact: true, color: null },
      ],
    });
    const loaded = loadWordsStore();
    expect(novelScopeOf(loaded, 42)).toHaveLength(1);
    expect(loaded.global).toHaveLength(1);
  });

  it('sanitizes garbage into an empty store instead of throwing', () => {
    mockStore.set('WOR_WORDS_STORE_V1', '{{{not json');
    expect(loadWordsStore()).toEqual({ novel: {}, global: [] });
    mockStore.set('WOR_WORDS_STORE_V1', JSON.stringify({ novel: 'oops' }));
    expect(loadWordsStore()).toEqual({ novel: {}, global: [] });
  });
});
