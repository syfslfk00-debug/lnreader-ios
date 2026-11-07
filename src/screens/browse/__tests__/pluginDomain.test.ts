import { getPluginDomain } from '../utils/pluginDomain';

describe('getPluginDomain', () => {
  it('extracts a compact domain from full https URLs', () => {
    expect(getPluginDomain({ site: 'https://www.asurascans.com/' })).toBe(
      'asurascans.com',
    );
    expect(
      getPluginDomain({ site: 'https://novelupdates.com/path?query=1' }),
    ).toBe('novelupdates.com');
  });

  it('parses scheme-less and http hosts', () => {
    expect(getPluginDomain({ site: 'example.com' })).toBe('example.com');
    expect(getPluginDomain({ site: 'http://teamxnovel.com' })).toBe(
      'teamxnovel.com',
    );
  });

  it('never invents a domain for unusable values', () => {
    expect(getPluginDomain({ site: '' })).toBeUndefined();
    expect(getPluginDomain({ site: '   ' })).toBeUndefined();
    expect(getPluginDomain({ site: 'not a domain' })).toBeUndefined();
    expect(getPluginDomain({ site: 'javascript:alert(1)' })).toBeUndefined();
    expect(getPluginDomain({ site: 'data:text/html,x' })).toBeUndefined();
    expect(getPluginDomain({ site: undefined as never })).toBeUndefined();
  });

  it('strips www. but keeps other subdomains', () => {
    expect(getPluginDomain({ site: 'https://www.a.b.example.co.uk/x' })).toBe(
      'a.b.example.co.uk',
    );
  });
});
