import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, toCsv } from './read-illucia-ai-log.js';

const row = (fields) => ({ model_key: 'llama-3.3-70b-clef-flash', outcome: 'accepted', tier: 'master', invent_ms: 2000, sort_ms: 600,
  total_ms: 2700, candidate_count: 20, yes_share: 0.4, answer: null, word_side: null, invent_neurons: 30, sort_neurons: 50, ...fields });

test('the summary counts outcomes, answers and whether the sort matched the player', () => {
  const summary = summarize([
    row({ answer: 'yes', word_side: 'yes' }),
    row({ answer: 'no', word_side: 'yes' }),
    row({ answer: 'declined', word_side: 'no' }),
    row({ outcome: 'sort-uneven', yes_share: null }),
    row({ model_key: 'llama-3.3-70b', outcome: 'timeout', sort_ms: null }),
  ])['llama-3.3-70b-clef-flash'];
  assert.equal(summary.attempts, 4);
  assert.deepEqual(summary.outcomes, { accepted: 3, 'sort-uneven': 1 });
  assert.equal(summary.acceptedRate, 0.75);
  assert.deepEqual(summary.answers, { yes: 1, no: 1, declined: 1 });
  // Declined answers say nothing about the sort; one of the two yes/no answers matched.
  assert.equal(summary.sortMatchesPlayer, '1/2');
  assert.equal(summary.neurons, 320);
  assert.deepEqual(summary.medianMs, { invent: 2000, sort: 600, total: 2700 });
});

test('CSV quotes cells that need it', () => {
  assert.equal(toCsv([{ a: 'x', b: 'Can your word mean "a, b"?', c: null }]), 'a,b,c\nx,"Can your word mean ""a, b""?",\n');
  assert.equal(toCsv([]), '');
});

test('the workbook has a readable summary, one readable row per question, and every raw field', async () => {
  const { writeWorkbook, questionRows } = await import('./lib/illucia-ai-log-workbook.js');
  const ExcelJS = (await import('exceljs')).default;
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const rows = [
    row({ created_at: Date.UTC(2026, 9, 4, 19, 5), round_seq: 3, turn: 4, word: 'jazz', pattern: '_azz', missed: 'es',
      question: 'Can your word mean an animal?', yes_share: 0.375, word_side: 'no', answer: 'yes', inventor: 'Llama 3.3 70B', sorter: 'Clef-flash' }),
    row({ outcome: 'sort-uneven', yes_share: null, answer: null }),
  ];
  const [first] = questionRows(rows);
  assert.equal(first['When (UTC)'], '2026-10-04 19:05');
  assert.equal(first['YES %'], 38);
  assert.equal(first['Sort matched player'], 'NO');
  assert.equal(first['Write question (s)'], 2);
  assert.equal(first.Models, 'Llama 3.3 70B + Clef-flash');
  const dir = await mkdtemp(join(tmpdir(), 'illucia-log-'));
  try {
    const path = join(dir, 'log.xlsx');
    await writeWorkbook(path, rows, summarize(rows));
    const book = new ExcelJS.Workbook();
    await book.xlsx.readFile(path);
    assert.deepEqual(book.worksheets.map(sheet => sheet.name), ['Summary', 'Questions', 'All fields']);
    const questions = book.getWorksheet('Questions');
    assert.equal(questions.rowCount, 3);
    assert.equal(questions.getRow(1).getCell(1).value, 'When (UTC)');
    assert.equal(questions.getRow(2).getCell(5).value, 'jazz');
    assert.equal(book.getWorksheet('Summary').getRow(2).getCell(1).value, 'llama-3.3-70b-clef-flash');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
