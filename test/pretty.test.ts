import { describe, expect, it } from 'vitest';
import { findStructures, mayContainStructure, prettyLoose } from '../src/core/pretty';

describe('findStructures', () => {
  it('finds a JSON object after the message', () => {
    const line = '09:14:11 ERROR [payments] failed {"order":"A-1182","code":504}';
    const [s] = findStructures(line);
    expect(s?.json).toBe(true);
    expect(s?.pretty).toBe(JSON.stringify({ order: 'A-1182', code: 504 }, null, 2));
    expect(line.slice(s!.start, s!.end)).toBe('{"order":"A-1182","code":504}');
  });

  it('skips tags, timestamps and empty brackets', () => {
    expect(findStructures('[gateway] [main] [2026-11-16 10:00:00,123] empty {} and []')).toEqual([]);
  });

  it('handles brackets and escaped quotes inside strings', () => {
    expect(findStructures('msg {"text":"a } b \\" ]","n":1}')[0]?.json).toBe(true);
  });

  it('finds every value in a line, in order', () => {
    const found = findStructures('req={"id":1} resp={"ok":true} user=User{id=7, name=Bob}');
    expect(found.map((f) => [f.name, f.json])).toEqual([['req', true], ['resp', true], ['User', false]]);
  });

  it('reads Java and Python style dumps', () => {
    const [java] = findStructures('saved User{id=7, roles=[admin, ops], address=Address{city=Pune}}');
    expect(java?.name).toBe('User');
    expect(java?.pretty).toBe(
      ['{', '  id=7,', '  roles=[', '    admin,', '    ops', '  ],', '  address=Address{', '    city=Pune', '  }', '}'].join('\n'),
    );
    const [py] = findStructures("ctx {'user': 'bob, jr', 'n': 2}");
    expect(py?.pretty).toBe(["{", "  'user': 'bob, jr',", "  'n': 2", "}"].join('\n'));
  });

  it('copes with an apostrophe inside a dump', () => {
    expect(findStructures("Event{msg=don't retry, code=5}")[0]?.raw).toBe("{msg=don't retry, code=5}");
  });

  it('returns nothing for unclosed brackets', () => {
    expect(findStructures('broken {"a": 1')).toEqual([]);
  });
});

describe('prettyLoose', () => {
  it('keeps empty brackets on one line', () => {
    expect(prettyLoose('{a=[], b=1}')).toBe('{\n  a=[],\n  b=1\n}');
  });
});

describe('mayContainStructure', () => {
  it('needs a bracket and a separator', () => {
    expect(mayContainStructure('plain text')).toBe(false);
    expect(mayContainStructure('[main] started')).toBe(false);
    expect(mayContainStructure('x={a=1}')).toBe(true);
  });
});
