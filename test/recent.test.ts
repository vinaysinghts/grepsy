import { describe, expect, it } from 'vitest';
import {
  RECENT_KEY,
  addRecent,
  forgetRecent,
  loadRecent,
  parseRecent,
  recentSource,
  rememberRecent,
  removeRecent,
  timeAgo,
  viewerPath,
  type KeyValueStore,
} from '../src/core/recent';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function fakeStore(initial: Record<string, unknown> = {}): KeyValueStore & { data: Record<string, unknown> } {
  const data = { ...initial };
  return {
    data,
    get: async (key) => (key in data ? { [key]: data[key] } : {}),
    set: async (items) => void Object.assign(data, items),
  };
}

describe('recent logs', () => {
  it('puts the newest first and names it from the link', () => {
    const one = addRecent([], 'https://example.com/logs/a.log', 1);
    const two = addRecent(one, 'file:///var/log/b.log', 2);
    expect(two.map((r) => r.name)).toEqual(['b.log', 'a.log']);
    expect(two[0]).toEqual({ url: 'file:///var/log/b.log', name: 'b.log', openedAt: 2 });
  });

  it('moves a reopened log to the front instead of listing it twice', () => {
    let list = addRecent([], 'https://x.dev/a.log', 1);
    list = addRecent(list, 'https://x.dev/b.log', 2);
    list = addRecent(list, 'https://x.dev/a.log', 3);
    expect(list.map((r) => [r.name, r.openedAt])).toEqual([
      ['a.log', 3],
      ['b.log', 2],
    ]);
  });

  it('keeps only the most recent few', () => {
    let list = addRecent([], 'https://x.dev/0.log', 0, 3);
    for (let i = 1; i < 5; i++) list = addRecent(list, `https://x.dev/${i}.log`, i, 3);
    expect(list.map((r) => r.name)).toEqual(['4.log', '3.log', '2.log']);
  });

  it('ignores links the viewer could not reopen', () => {
    expect(addRecent([], 'javascript:alert(1)', 1)).toEqual([]);
    expect(addRecent([], 'chrome://settings', 1)).toEqual([]);
  });

  it('removes one entry', () => {
    const list = addRecent(addRecent([], 'https://x.dev/a.log', 1), 'https://x.dev/b.log', 2);
    expect(removeRecent(list, 'https://x.dev/b.log').map((r) => r.name)).toEqual(['a.log']);
  });

  it('drops malformed or unsafe entries read from storage', () => {
    expect(parseRecent(undefined)).toEqual([]);
    expect(parseRecent('nope')).toEqual([]);
    expect(
      parseRecent([
        { url: 'https://x.dev/a.log', name: 'a.log', openedAt: 1 },
        { url: 'javascript:alert(1)', name: 'x', openedAt: 1 },
        { url: 'https://x.dev/b.log', name: 7, openedAt: 1 },
        null,
      ]),
    ).toEqual([{ url: 'https://x.dev/a.log', name: 'a.log', openedAt: 1 }]);
  });

  it('saves to and reads from storage', async () => {
    const store = fakeStore({ [RECENT_KEY]: 'corrupt' });
    expect(await loadRecent(store)).toEqual([]);
    await rememberRecent(store, 'https://x.dev/a.log', 10);
    await rememberRecent(store, 'https://x.dev/b.log', 20);
    expect((await loadRecent(store)).map((r) => r.name)).toEqual(['b.log', 'a.log']);
    await forgetRecent(store, 'https://x.dev/b.log');
    expect(store.data[RECENT_KEY]).toEqual([{ url: 'https://x.dev/a.log', name: 'a.log', openedAt: 10 }]);
  });
});

describe('recent log labels', () => {
  it('says where a log came from', () => {
    expect(recentSource('https://ci.example.com:8443/a.log')).toBe('ci.example.com:8443');
    expect(recentSource('file:///var/log/a.log')).toBe('local file');
  });

  it('shows short relative times', () => {
    const now = 100 * DAY;
    expect(timeAgo(now - 5_000, now)).toBe('just now');
    expect(timeAgo(now + 5_000, now)).toBe('just now');
    expect(timeAgo(now - 5 * MIN, now)).toBe('5m ago');
    expect(timeAgo(now - 3 * HOUR, now)).toBe('3h ago');
    expect(timeAgo(now - 2 * DAY, now)).toBe('2d ago');
    expect(timeAgo(now - 30 * DAY, now)).not.toMatch(/ago/);
  });
});

describe('viewer paths', () => {
  it('builds the page for each popup action', () => {
    expect(viewerPath()).toBe('viewer.html');
    expect(viewerPath({ paste: true })).toBe('viewer.html?paste=1');
    expect(viewerPath({ src: 'https://x.dev/a b.log?x=1&y=2' })).toBe(
      'viewer.html?src=https%3A%2F%2Fx.dev%2Fa%20b.log%3Fx%3D1%26y%3D2',
    );
  });
});
