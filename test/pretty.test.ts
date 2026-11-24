import { describe, expect, it } from 'vitest';
import { findStructures, mayContainStructure } from '../src/core/pretty';

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
});
