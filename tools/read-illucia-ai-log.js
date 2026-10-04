// Reads the production log of Illucia's AI questions (D1 table illucia_ai_log, migration 0009)
// and prints a summary per model setting. The full rows are saved, as JSON and CSV, to ignored
// tools/output/. Read-only: it never changes the log. Uses the server's Wrangler login.
//
//   node read-illucia-ai-log.js [--since 2026-10-04]
import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const median = values => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null;
};
const count = (rows, key) => rows.reduce((counts, row) => ({ ...counts, [row[key] ?? '-']: (counts[row[key] ?? '-'] ?? 0) + 1 }), {});

// Per model setting: attempts, outcomes, speed, cost, answers, and how often the model's sort
// put the hidden word on the side the player answered.
export function summarize(rows) {
  const groups = {};
  for (const row of rows) (groups[row.model_key ?? '-'] ??= []).push(row);
  return Object.fromEntries(Object.entries(groups).map(([model, list]) => {
    const accepted = list.filter(row => row.outcome === 'accepted');
    const answered = accepted.filter(row => row.answer === 'yes' || row.answer === 'no');
    const checkable = answered.filter(row => row.word_side);
    return [model, {
      attempts: list.length,
      outcomes: count(list, 'outcome'),
      accepted: accepted.length,
      acceptedRate: list.length ? Math.round(accepted.length / list.length * 100) / 100 : null,
      medianMs: { invent: median(list.map(row => row.invent_ms)), sort: median(list.map(row => row.sort_ms)),
        total: median(list.map(row => row.total_ms)) },
      medianCandidates: median(list.map(row => row.candidate_count)),
      medianYesShare: median(accepted.map(row => row.yes_share)),
      answers: count(accepted, 'answer'),
      // The player's answer about their own word against the side the sort put it on.
      sortMatchesPlayer: checkable.length ? `${checkable.filter(row => row.answer === row.word_side).length}/${checkable.length}` : null,
      neurons: Math.round(list.reduce((sum, row) => sum + (row.invent_neurons ?? 0) + (row.sort_neurons ?? 0), 0)),
      byTier: count(list, 'tier'),
    }];
  }));
}

export function toCsv(rows) {
  if (!rows.length) return '';
  const columns = Object.keys(rows[0]);
  const cell = value => (value === null || value === undefined ? '' : /[",\n]/.test(String(value)) ? `"${String(value).replace(/"/g, '""')}"` : String(value));
  return [columns.join(','), ...rows.map(row => columns.map(column => cell(row[column])).join(','))].join('\n') + '\n';
}

async function main() {
  const args = process.argv.slice(2);
  const since = args.includes('--since') ? args[args.indexOf('--since') + 1] : null;
  if (since !== null && !/^\d{4}-\d{2}-\d{2}$/.test(since)) throw new Error('--since takes a date like 2026-10-04.');
  const from = since ? Date.parse(`${since}T00:00:00Z`) : 0;
  const { stdout } = await promisify(execFile)(process.execPath,
    [resolve(ROOT, 'server/node_modules/wrangler/bin/wrangler.js'), 'd1', 'execute', 'DB', '--remote', '--json',
      '--command', `SELECT * FROM illucia_ai_log WHERE created_at >= ${from} ORDER BY created_at`],
    { cwd: resolve(ROOT, 'server'), windowsHide: true, timeout: 120000, maxBuffer: 256 * 1024 * 1024 });
  const rows = JSON.parse(stdout)[0].results.map(row => ({ ...row, created: new Date(row.created_at).toISOString() }));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = resolve(ROOT, `tools/output/illucia-ai-log-${stamp}`);
  await mkdir(resolve(ROOT, 'tools/output'), { recursive: true });
  await writeFile(`${base}.json`, JSON.stringify(rows, null, 2) + '\n');
  await writeFile(`${base}.csv`, toCsv(rows));
  console.log(`${rows.length} rows${since ? ` since ${since}` : ''}. Saved ${base}.json and .csv`);
  console.log(JSON.stringify(summarize(rows), null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
