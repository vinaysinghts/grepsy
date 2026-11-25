import { describe, expect, it } from 'vitest';
import { findStructures, mayContainStructure, visibleStructures } from '../src/core/pretty';

describe('findStructures: JSON', () => {
  it('finds a JSON object after the message', () => {
    const line = '09:14:11 ERROR [payments] failed {"order":"A-1182","code":504}';
    const [s] = findStructures(line);
    expect(s?.kind).toBe('json');
    expect(s?.pretty).toBe(JSON.stringify({ order: 'A-1182', code: 504 }, null, 2));
    expect(line.slice(s!.start, s!.end)).toBe('{"order":"A-1182","code":504}');
  });

  it('skips tags, timestamps, empty brackets and non-JSON dumps', () => {
    expect(findStructures('[gateway] [main] [2026-11-16 10:00:00,123] empty {} and [] User{id=7, roles=[a]}')).toEqual([]);
  });

  it('handles brackets and escaped quotes inside strings', () => {
    expect(findStructures('msg {"text":"a } b \\" ]","n":1}')[0]?.kind).toBe('json');
  });

  it('finds every value in a line, with its name', () => {
    const found = findStructures('req={"id":1} resp: {"ok":true} [{"a":1}]');
    expect(found.map((f) => f.name)).toEqual(['req', 'resp', '']);
  });

  it('returns nothing for unclosed brackets', () => {
    expect(findStructures('broken {"a": 1')).toEqual([]);
  });
});

describe('findStructures: XML', () => {
  it('lays out nested elements', () => {
    const [x] = findStructures('got body=<order id="A-1"><item sku="9">pen</item><note/></order> done');
    expect(x?.kind).toBe('xml');
    expect(x?.name).toBe('body');
    expect(x?.pretty).toBe(['<order id="A-1">', '  <item sku="9">pen</item>', '  <note/>', '</order>'].join('\n'));
  });

  it('accepts a single element with attributes', () => {
    expect(findStructures('reply <error code="504">timeout</error>')[0]?.pretty).toBe('<error code="504">timeout</error>');
  });

  it('ignores lone or unbalanced tags and generics', () => {
    expect(findStructures('List<String> and <b>bold</b> and <a><b></a>')).toEqual([]);
  });

  it('keeps comments and CDATA', () => {
    expect(findStructures('<a x="1"><!-- c --><![CDATA[<x>]]></a>')[0]?.pretty).toBe(
      ['<a x="1">', '  <!-- c -->', '  <![CDATA[<x>]]>', '</a>'].join('\n'),
    );
  });
});

describe('mayContainStructure', () => {
  it('looks for JSON or a tag', () => {
    expect(mayContainStructure('plain text')).toBe(false);
    expect(mayContainStructure('[main] started')).toBe(false);
    expect(mayContainStructure('x {"a":1}')).toBe(true);
    expect(mayContainStructure('x <a/>')).toBe(true);
  });

  it('allows spaces after the bracket, as many loggers write JSON', () => {
    for (const line of ['req { "a": 1 }', '{\t"level":"info"}', 'rows=[ {"a":1} ]', 'ids [ "a", "b" ]']) {
      expect(mayContainStructure(line)).toBe(true);
      expect(visibleStructures(line, 5000)).toHaveLength(1);
    }
  });
});

describe('visibleStructures', () => {
  it('finds spaced JSON in a line', () => {
    const [s] = visibleStructures('09:14 INFO sent { "order": "A-1", "items": [ 1, 2 ] }', 5000);
    expect(s?.pretty).toBe(JSON.stringify({ order: 'A-1', items: [1, 2] }, null, 2));
  });

  it('opens a long JSON value in full when the line is cut short on screen', () => {
    const big = JSON.stringify({ rows: Array.from({ length: 2000 }, (_, i) => ({ i })) });
    const line = `INFO dump ${big}`;
    const [s] = visibleStructures(line, 5000);
    expect(s?.start).toBe(10);
    expect(s?.end).toBe(5000);
    expect(JSON.parse(s!.pretty)).toEqual(JSON.parse(big));
  });

  it('skips values that start past the drawn part', () => {
    const line = 'x'.repeat(6000) + ' {"a":1}';
    expect(visibleStructures(line, 5000)).toEqual([]);
  });
});
