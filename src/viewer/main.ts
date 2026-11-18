import { summarize } from '../core/summarize';

// Placeholder start screen: proves the file -> stream -> parse path end to end.
// The real viewer (virtual scrolling, search, highlights) lands in later PRs.

const input = document.querySelector<HTMLInputElement>('#file')!;
const drop = document.querySelector<HTMLLabelElement>('#drop')!;
const output = document.querySelector<HTMLOutputElement>('#summary')!;

async function open(file: File): Promise<void> {
  output.textContent = `Reading ${file.name}…`;
  const started = performance.now();
  const s = await summarize(file);
  const ms = Math.round(performance.now() - started);
  output.textContent =
    `${file.name}: ${s.lines.toLocaleString()} lines in ${ms} ms · ` +
    `${s.levels.ERROR.toLocaleString()} errors · ${s.levels.WARN.toLocaleString()} warnings`;
}

input.addEventListener('change', () => {
  const file = input.files?.[0];
  if (file) void open(file);
});

drop.addEventListener('dragover', (e) => {
  e.preventDefault();
  drop.classList.add('over');
});
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('over');
  const file = e.dataTransfer?.files[0];
  if (file) void open(file);
});
