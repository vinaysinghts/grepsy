# 3. Stream files instead of reading them whole

Date: 2026-11-18 · Status: accepted

## Context

Multi-GB logs are the main use case. Reading a file into one string needs roughly 2x its size in memory and blocks until the whole file is read.

## Decision

`readLines` streams a `Blob` through `TextDecoderStream` and a `LineSplitter` that handles lines and `\r\n` endings split across chunks. The core (`src/core/`) is plain TypeScript with no DOM or `chrome.*` access, so it is unit tested in Node and can move into a Web Worker unchanged.

## Consequences

- Parsing can show progress and start rendering before the file finishes loading.
- Next step: run the core in a Web Worker and keep a compact line-offset index instead of an array of strings, so memory stays bounded.
