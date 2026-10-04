// The AI question log as an Excel workbook (opens in Excel, imports into Google Sheets):
// Summary (one row per model setting), Questions (one readable row per question) and
// All fields (every raw column). Used by read-illucia-ai-log.js.
import ExcelJS from 'exceljs';

const seconds = ms => (Number.isFinite(ms) ? Math.round(ms / 100) / 10 : null);
const round1 = value => (Number.isFinite(value) ? Math.round(value * 10) / 10 : null);

// One readable row per question, in reading order.
export function questionRows(rows) {
  return rows.map(row => ({
    'When (UTC)': row.created_at ? new Date(row.created_at).toISOString().slice(0, 16).replace('T', ' ') : null,
    Round: row.round_seq,
    Turn: row.turn,
    Level: row.tier,
    'Hidden word': row.word,
    Board: row.pattern,
    Misses: row.missed,
    'Misses left': row.misses_left,
    Candidates: row.candidate_count,
    Question: row.question,
    Outcome: row.outcome,
    'Why rejected': row.question_problems,
    'YES %': Number.isFinite(row.yes_share) ? Math.round(row.yes_share * 100) : null,
    'YES words': row.yes_words,
    'Hidden word sorted': row.word_side,
    'Player answered': row.answer,
    'Sort matched player': row.word_side && (row.answer === 'yes' || row.answer === 'no') ? (row.word_side === row.answer ? 'yes' : 'NO') : null,
    'Write question (s)': seconds(row.invent_ms),
    'Sort (s)': seconds(row.sort_ms),
    'Total (s)': seconds(row.total_ms),
    Neurons: round1((row.invent_neurons ?? 0) + (row.sort_neurons ?? 0)) || null,
    Models: [row.inventor, row.sorter].filter(Boolean).join(' + ') || row.model_key,
  }));
}

// One readable row per model setting, from summarize().
export function summaryRows(summary) {
  return Object.entries(summary).map(([model, s]) => ({
    'Model setting': model,
    Attempts: s.attempts,
    Accepted: s.accepted,
    'Accepted %': s.acceptedRate === null ? null : Math.round(s.acceptedRate * 100),
    Outcomes: Object.entries(s.outcomes).map(([key, value]) => `${key}: ${value}`).join(', '),
    'Median write question (s)': seconds(s.medianMs.invent),
    'Median sort (s)': seconds(s.medianMs.sort),
    'Median total (s)': seconds(s.medianMs.total),
    'Median candidates': s.medianCandidates,
    'Median YES %': s.medianYesShare === null ? null : Math.round(s.medianYesShare * 100),
    Answers: Object.entries(s.answers).map(([key, value]) => `${key}: ${value}`).join(', ') || null,
    'Sort matched player': s.sortMatchesPlayer,
    Neurons: s.neurons,
    Levels: Object.entries(s.byTier).map(([key, value]) => `${key}: ${value}`).join(', '),
  }));
}

const WIDE = new Set(['Question', 'YES words', 'Outcomes', 'Answers', 'Levels', 'Why rejected', 'Models', 'candidates',
  'yes_words', 'probabilities', 'question', 'invent_yes']);

function addSheet(workbook, name, rows) {
  const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  const columns = rows.length ? Object.keys(rows[0]) : ['(no rows yet)'];
  sheet.columns = columns.map(key => ({ header: key, key, width: WIDE.has(key) ? 50 : Math.max(10, key.length + 2) }));
  for (const row of rows) sheet.addRow(row);
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).alignment = { vertical: 'middle', wrapText: true };
  if (rows.length) sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  for (const key of columns.filter(column => WIDE.has(column))) sheet.getColumn(key).alignment = { wrapText: true, vertical: 'top' };
  return sheet;
}

export async function writeWorkbook(path, rows, summary) {
  const workbook = new ExcelJS.Workbook();
  addSheet(workbook, 'Summary', summaryRows(summary));
  addSheet(workbook, 'Questions', questionRows(rows));
  addSheet(workbook, 'All fields', rows);
  await workbook.xlsx.writeFile(path);
}
