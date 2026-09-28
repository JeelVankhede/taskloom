// Bundle budget (gzipped), checked after `vite build`. Raise a budget only with a reason in the
// implementation plan (section 8, Phase 10).
import { readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const BUDGETS_KB = [
  { name: 'main', pattern: /^index-.*\.js$/, max: 330 },
  { name: 'task board (lazy)', pattern: /^TaskBoardPage-.*\.js$/, max: 180 },
];

const dir = new URL('../dist/assets/', import.meta.url);
const files = readdirSync(dir);
let failed = false;
for (const budget of BUDGETS_KB) {
  const matches = files.filter((file) => budget.pattern.test(file));
  if (matches.length !== 1) {
    console.error(
      `${budget.name}: expected one chunk matching ${budget.pattern}, found ${matches.length}`,
    );
    failed = true;
    continue;
  }
  const kb = gzipSync(readFileSync(new URL(matches[0], dir))).length / 1024;
  const ok = kb <= budget.max;
  failed ||= !ok;
  console.log(
    `${ok ? 'ok  ' : 'OVER'} ${budget.name}: ${kb.toFixed(1)} kB gzipped (budget ${budget.max} kB)`,
  );
}
process.exit(failed ? 1 : 0);
