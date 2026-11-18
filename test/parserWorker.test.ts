import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from '../src/worker/protocol';

// Runs the worker module in-process with a fake `self`, so its message
// handling can be tested without a browser.
async function loadWorker() {
  const posted: Response[] = [];
  const fakeSelf = {
    postMessage: (m: Response) => posted.push(m),
    onmessage: null as ((e: MessageEvent<Request>) => void) | null,
  };
  vi.stubGlobal('self', fakeSelf);
  vi.resetModules();
  await import('../src/worker/parser.worker');
  const send = (m: Request) => fakeSelf.onmessage!({ data: m } as MessageEvent<Request>);
  return { posted, send };
}

/** A file that yields its text in small chunks, so loads interleave. */
function slowFile(text: string): File {
  const enc = new TextEncoder();
  const chunks = text.match(/[\s\S]{1,8}/g) ?? [];
  const stream = () =>
    new ReadableStream<Uint8Array>({
      async pull(c) {
        await new Promise((r) => setTimeout(r, 1));
        const next = chunks.shift();
        if (next === undefined) c.close();
        else c.enqueue(enc.encode(next));
      },
    });
  return { size: text.length, stream } as unknown as File;
}

const until = async (cond: () => boolean) => {
  for (let i = 0; i < 500 && !cond(); i++) await new Promise((r) => setTimeout(r, 2));
};

afterEach(() => vi.unstubAllGlobals());

describe('parser worker', () => {
  it('shows only the newest file when a second one is opened mid-load', async () => {
    const { posted, send } = await loadWorker();
    const first = Array.from({ length: 50 }, (_, i) => `09:00 INFO first ${i}`).join('\n');
    send({ type: 'open', file: slowFile(first) });
    await new Promise((r) => setTimeout(r, 10));
    send({ type: 'open', file: slowFile('09:00 ERROR second a\n09:01 WARN second b\n') });

    await until(() => posted.some((m) => m.type === 'loaded'));
    await new Promise((r) => setTimeout(r, 300));

    const loaded = posted.filter((m) => m.type === 'loaded');
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toMatchObject({ lines: 2 });

    send({ type: 'view', id: 1, query: { text: '', caseSensitive: false, regex: false, filter: false, context: 0, levels: [0, 1, 2, 3, 4, 5] } });
    send({ type: 'rows', id: 1, start: 0, count: 10 });
    const rows = posted.find((m) => m.type === 'rows');
    expect(rows && rows.type === 'rows' && rows.rows.map((r) => r.kind === 'line' && r.text)).toEqual([
      '09:00 ERROR second a',
      '09:01 WARN second b',
    ]);
  });
});
