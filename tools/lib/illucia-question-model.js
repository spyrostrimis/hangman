// Track D1 scoring against the B1 WordNet labels. The prompts, request bodies and reply
// validation live in shared/illucia-question.js, which the Worker uses too.
export * from '../../shared/illucia-question.js';

// Labels: Map word -> code string ('-' = known, no category). Absent = unknown, never scored.
// `codes` is the category union the question was judged equivalent to.
export function scoreSort({ yes, no }, labels, codes) {
  if (!Array.isArray(codes) || !codes.length) throw new Error('Scoring needs category codes.');
  const truth = word => {
    const label = labels.get(word);
    return label === undefined ? null : codes.some(code => label.includes(code));
  };
  const rows = [...yes.map(word => [word, true]), ...no.map(word => [word, false])];
  const score = { labelled: 0, unlabelled: 0, correct: 0, falseYes: 0, falseNo: 0, wordnetYes: 0, wordnetNo: 0 };
  for (const [word, said] of rows) {
    const actual = truth(word);
    if (actual === null) { score.unlabelled++; continue; }
    score.labelled++;
    score[actual ? 'wordnetYes' : 'wordnetNo']++;
    if (said === actual) score.correct++;
    else score[said ? 'falseYes' : 'falseNo']++;
  }
  return score;
}

// Where the round's real word landed, against WordNet. null when WordNet doesn't know it.
export function answerPlacement({ yes }, answer, labels, codes) {
  const label = labels.get(answer);
  if (label === undefined) return null;
  const actual = codes.some(code => label.includes(code));
  const said = yes.includes(answer);
  return { wordnet: actual, said, misfiled: actual !== said };
}

// The sort-only control: the noun category (v1 asks nouns only) whose labelled YES share is
// closest to half; ties by category order. If no noun reaches 10–90%, a question every word
// fails tests nothing, so the closest category of any kind (verb, adjective) is used instead.
export function controlCategory(candidates, labels, categories) {
  const labelled = candidates.filter(word => labels.has(word));
  if (!labelled.length) return null;
  const closest = pool => {
    let best = null;
    for (const category of pool) {
      const share = labelled.filter(word => labels.get(word).includes(category.code)).length / labelled.length;
      if (!best || Math.abs(share - 0.5) < Math.abs(best.labelledYesShare - 0.5)) {
        best = { code: category.code, kind: category.kind, question: category.question, labelledYesShare: share };
      }
    }
    return best;
  };
  const noun = closest(categories.filter(c => c.kind === 'noun'));
  return noun.labelledYesShare >= 0.1 && noun.labelledYesShare <= 0.9 ? noun : closest(categories);
}
