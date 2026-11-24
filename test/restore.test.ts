import { describe, expect, it } from 'vitest';
import { VIEW_FRESH_MS, viewsToRestore } from '../src/core/restore';

describe('viewsToRestore', () => {
  const now = 1_000_000;
  it('reopens logs whose viewers were open moments ago', () => {
    expect(
      viewsToRestore(
        {
          'openView:a': { src: 'https://x.dev/b.log', seen: now - 5_000 },
          'openView:b': { src: 'file:///var/log/a.log', seen: now - 15_000 },
        },
        now,
      ),
    ).toEqual(['file:///var/log/a.log', 'https://x.dev/b.log']);
  });
  it('skips tabs closed long ago, repeats, junk and other keys', () => {
    expect(
      viewsToRestore(
        {
          'openView:old': { src: 'https://x.dev/old.log', seen: now - VIEW_FRESH_MS - 1 },
          'openView:a': { src: 'https://x.dev/a.log', seen: now - 1_000 },
          'openView:b': { src: 'https://x.dev/a.log', seen: now - 2_000 },
          'openView:bad': { src: 'javascript:alert(1)', seen: now },
          'openView:junk': 'nope',
          recent: [{ url: 'https://x.dev/r.log' }],
        },
        now,
      ),
    ).toEqual(['https://x.dev/a.log']);
  });
});
