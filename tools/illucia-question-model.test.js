import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INVENT_PROMPT, SORT_PROMPT, questionInput, extractJson, questionProblems, validateReply,
  scoreSort, answerPlacement, controlCategory, normalizeQuestionResult, questionVocabularyProblems,
} from './lib/illucia-question-model.js';
import { BenchmarkStop } from './lib/illucia-model.js';

const candidates = ['crane', 'eagle', 'hammer', 'robin', 'table', 'tiger'];
const reply = (yes, no, question = 'Can your word mean a bird?') => JSON.stringify({ question, yes, no });
const labels = new Map([['crane', 'bcoM'], ['eagle', 'bc'], ['hammer', 'nop'], ['robin', 'bca'], ['table', 'ot'], ['tiger', 'bd']]);

test('request carries the candidate list only, in a fixed shape', () => {
  const input = questionInput('invent', candidates, { maxTokens: 900 });
  assert.equal(input.messages[0].content, INVENT_PROMPT);
  assert.deepEqual(JSON.parse(input.messages[1].content), { count: 6, candidates });
  assert.equal(input.temperature, 0);
  assert.equal(input.max_tokens, 900);
  const sort = questionInput('sort', candidates, { question: 'Can your word mean a bird?', maxTokens: 900,
    options: { reasoning_effort: 'low' } });
  assert.equal(sort.messages[0].content, SORT_PROMPT);
  assert.equal(JSON.parse(sort.messages[1].content).question, 'Can your word mean a bird?');
  assert.equal(sort.reasoning_effort, 'low');
  // The same candidates give byte-identical requests, whatever the secret word is: nothing else goes in.
  assert.equal(JSON.stringify(questionInput('invent', [...candidates], { maxTokens: 900 })), JSON.stringify(input));
  assert.throws(() => questionInput('invent', ['tiger', 'crane'], { maxTokens: 9 }), /sorted/);
  assert.throws(() => questionInput('invent', ['crane', 'crane'], { maxTokens: 9 }), /sorted/);
  assert.throws(() => questionInput('invent', ['Crane', 'eagle'], { maxTokens: 9 }), /lowercase/);
  assert.throws(() => questionInput('invent', Array.from({ length: 81 }, (_, i) => `w${'a'.repeat(3)}${String.fromCharCode(97 + (i % 26))}`), { maxTokens: 9 }), /2–80/);
  assert.throws(() => questionInput('sort', candidates, { maxTokens: 9 }), /needs a question/);
  assert.throws(() => questionInput('guess', candidates, { maxTokens: 9 }), /Unknown/);
});

test('JSON-ish extraction separates strict replies from fenced or chatty ones', () => {
  assert.deepEqual(extractJson(' {"a":1} '), { value: { a: 1 }, strict: true });
  assert.deepEqual(extractJson('Sure!\n```json\n{"a":1}\n```'), { value: { a: 1 }, strict: false });
  assert.equal(extractJson('no json here'), null);
  assert.equal(extractJson('{"a":'), null);
  assert.equal(extractJson(null), null);
  assert.equal(extractJson(' '.repeat(6001)), null);
});

test('questions must be meaning questions in the game\'s wording', () => {
  assert.deepEqual(questionProblems('Can your word mean a bird?'), []);
  assert.deepEqual(questionProblems('Can your word mean something you wear?'), []);
  assert.ok(questionProblems('Does your word start with a vowel?').includes('wrong-opening'));
  // Broader openings (2026-10-04), with "mean" as the positive control.
  for (const q of ['Can your word be a surname?', 'Can your word refer to a mental health condition?',
    "Can your word describe a person's behavior?", 'Can your word stand for a place?', 'Can your word mean a place?']) {
    assert.deepEqual(questionProblems(q), [], q);
  }
  assert.ok(questionProblems('Can your word sound like a bird?').includes('wrong-opening'));
  // Grammar is rejected under any opening; the same question without grammar is not.
  for (const q of ['Can your word mean a verb?', 'Can your word be a noun that is a type of object?',
    'Can your word mean an adjective or adverb?', 'Can your word be a describing word (an adjective)?']) {
    assert.ok(questionProblems(q).includes('about-grammar'), q);
  }
  assert.deepEqual(questionProblems('Can your word be a type of object?'), []);
  assert.ok(questionProblems('Can your word mean a bird').includes('no-question-mark'));
  for (const q of ['Can your word mean a word with two vowels?', 'Can your word mean something that rhymes with cat?',
    'Can your word mean a word that ends with "s"?', "Can your word mean a word containing 'e'?"]) {
    assert.ok(questionProblems(q).includes('about-letters'), q);
  }
  assert.ok(questionProblems(`Can your word mean ${'a very '.repeat(20)}big thing?`).includes('too-long'));
  assert.ok(questionProblems('Can your word mean a café?').includes('non-ascii'));
  assert.ok(questionProblems('Can your word mean a rude thing?', ['rude thing']).includes('blocked-term'));
  // Whole-word matching only, with a positive control in the same fixture.
  assert.deepEqual(questionProblems('Can your word mean a prudent thing?', ['rude']), []);
  assert.ok(questionProblems('Can your word mean a rude thing?', ['rude']).includes('blocked-term'));
});

test('a correct, even sort is accepted and normalized', () => {
  const result = validateReply(reply(['Robin ', 'crane', 'eagle'], ['hammer', 'table', 'tiger']), candidates, { mode: 'invent' });
  assert.equal(result.outcome, 'accepted');
  assert.equal(result.strictJson, true);
  assert.deepEqual(result.yes, ['crane', 'eagle', 'robin']);
  assert.equal(result.yesShare, 0.5);
  assert.deepEqual(result.extraKeys, []);
});

test('missing, invented and repeated words are caught, each against an otherwise valid reply', () => {
  const yes = ['crane', 'eagle', 'robin'];
  const no = ['hammer', 'table', 'tiger'];
  assert.equal(validateReply(reply(yes, no), candidates, { mode: 'invent' }).outcome, 'accepted');
  const missing = validateReply(reply(yes, ['hammer', 'table']), candidates, { mode: 'invent' });
  assert.equal(missing.outcome, 'wrong-lists');
  assert.deepEqual(missing.sets.missing, ['tiger']);
  const extra = validateReply(reply([...yes, 'heron'], no), candidates, { mode: 'invent' });
  assert.deepEqual(extra.sets.extra, ['heron']);
  assert.equal(extra.outcome, 'wrong-lists');
  const twice = validateReply(reply([...yes, 'tiger'], no), candidates, { mode: 'invent' });
  assert.deepEqual(twice.sets.duplicated, ['tiger']);
  assert.equal(twice.outcome, 'wrong-lists');
  assert.equal(twice.yes, null);
});

test('uneven splits, bad questions, bad shapes and prose are rejected', () => {
  assert.equal(validateReply(reply(['crane'], ['eagle', 'hammer', 'robin', 'table', 'tiger']), candidates, { mode: 'invent' }).outcome, 'uneven');
  assert.equal(validateReply(reply(['crane', 'eagle'], ['hammer', 'robin', 'table', 'tiger']), candidates, { mode: 'invent' }).outcome, 'accepted');
  assert.equal(validateReply(reply(['crane', 'eagle', 'robin'], ['hammer', 'table', 'tiger'], 'Does it have an E?'), candidates, { mode: 'invent' }).outcome, 'rejected-question');
  assert.equal(validateReply(JSON.stringify({ yes: ['crane'], no: [] }), candidates, { mode: 'invent' }).outcome, 'wrong-shape');
  assert.equal(validateReply(JSON.stringify({ question: 'Can your word mean a bird?', yes: 'crane', no: [] }), candidates, { mode: 'invent' }).outcome, 'wrong-shape');
  assert.equal(validateReply(JSON.stringify({ question: 'Can your word mean a bird?', yes: [1], no: [] }), candidates, { mode: 'invent' }).outcome, 'wrong-shape');
  assert.equal(validateReply('I think birds.', candidates, { mode: 'invent' }).outcome, 'unparseable');
  const fenced = validateReply('```json\n' + reply(['crane', 'eagle', 'robin'], ['hammer', 'table', 'tiger']) + '\n```', candidates, { mode: 'invent' });
  assert.equal(fenced.outcome, 'accepted');
  assert.equal(fenced.strictJson, false);
  // Sort mode needs no question and ignores none.
  assert.equal(validateReply(JSON.stringify({ yes: ['crane', 'eagle', 'robin'], no: ['hammer', 'table', 'tiger'] }), candidates, { mode: 'sort' }).outcome, 'accepted');
});

test('scoring counts false YES and false NO against WordNet labels and skips unknown words', () => {
  const perfect = scoreSort({ yes: ['crane', 'eagle', 'robin'], no: ['hammer', 'table', 'tiger'] }, labels, ['c']);
  assert.deepEqual(perfect, { labelled: 6, unlabelled: 0, correct: 6, falseYes: 0, falseNo: 0, wordnetYes: 3, wordnetNo: 3 });
  const wrong = scoreSort({ yes: ['crane', 'eagle', 'tiger'], no: ['hammer', 'robin', 'table'] }, labels, ['c']);
  assert.equal(wrong.correct, 4);
  assert.equal(wrong.falseYes, 1);
  assert.equal(wrong.falseNo, 1);
  const tooKeen = scoreSort({ yes: ['crane', 'eagle', 'robin', 'tiger', 'table'], no: ['hammer'] }, labels, ['c']);
  assert.deepEqual([tooKeen.correct, tooKeen.falseYes, tooKeen.falseNo], [4, 2, 0]);
  // A union of categories, and an unknown word.
  const union = scoreSort({ yes: ['crane', 'tiger', 'zzzz'], no: ['hammer'] }, labels, ['c', 'd']);
  assert.equal(union.correct, 3);
  assert.equal(union.unlabelled, 1);
  assert.throws(() => scoreSort({ yes: [], no: [] }, labels, []), /codes/);
});

test('answer placement says whether the real word landed on its WordNet side', () => {
  assert.deepEqual(answerPlacement({ yes: ['crane'] }, 'crane', labels, ['c']), { wordnet: true, said: true, misfiled: false });
  assert.deepEqual(answerPlacement({ yes: [] }, 'crane', labels, ['c']), { wordnet: true, said: false, misfiled: true });
  assert.deepEqual(answerPlacement({ yes: ['table'] }, 'table', labels, ['c']), { wordnet: false, said: true, misfiled: true });
  assert.equal(answerPlacement({ yes: [] }, 'zzzz', labels, ['c']), null);
});

test('the control question is the noun category closest to an even split, else any kind', () => {
  const categories = [
    { code: 'b', kind: 'noun', question: 'Can your word mean an animal?' },
    { code: 'c', kind: 'noun', question: 'Can your word mean a bird?' },
    { code: 'M', kind: 'verb', question: 'Can your word mean something your body does?' },
  ];
  // M splits 3/6 too, but a noun that splits well wins.
  const evenLabels = new Map([['crane', 'bcM'], ['eagle', 'bcM'], ['hammer', 'M'], ['robin', 'bc'], ['table', '-'], ['tiger', 'b']]);
  assert.deepEqual(controlCategory(candidates, evenLabels, categories), { code: 'c', kind: 'noun', question: 'Can your word mean a bird?', labelledYesShare: 0.5 });
  // No noun reaches 10%: the verb is used.
  const verbs = new Map(candidates.map((word, i) => [word, i % 2 ? 'M' : '-']));
  assert.equal(controlCategory(candidates, verbs, categories).code, 'M');
  assert.equal(controlCategory(['aaaa', 'bbbb'], evenLabels, categories), null);
});

test('envelopes: text, chat choices, Responses output, inline think blocks; unknown stops', () => {
  const usage = { prompt_tokens: 10, completion_tokens: 30, completion_tokens_details: { reasoning_tokens: 20 } };
  assert.deepEqual(normalizeQuestionResult({ response: '{"a":1}', usage: { prompt_tokens: 1, completion_tokens: 2 } }, BenchmarkStop), {
    response: '{"a":1}', envelope: 'response', finishReason: null, reasoningChars: 0, providerModel: null,
    usage: { prompt_tokens: 1, completion_tokens: 2, reasoning_tokens: null } });
  const chat = normalizeQuestionResult({ response: { a: 1 }, model: 'm', usage,
    choices: [{ finish_reason: 'stop', message: { content: '{"a":1}', reasoning_content: 'hmm' } }] }, BenchmarkStop);
  assert.equal(chat.response, '{"a":1}');
  assert.equal(chat.envelope, 'choices');
  assert.equal(chat.reasoningChars, 3);
  assert.equal(chat.usage.reasoning_tokens, 20);
  const cut = normalizeQuestionResult({ choices: [{ finish_reason: 'length', message: { content: null, reasoning_content: 'thinking...' } }], usage }, BenchmarkStop);
  assert.equal(cut.response, '');
  assert.equal(cut.finishReason, 'length');
  assert.equal(cut.reasoningChars, 11);
  // Reasoning off: the reply arrives in the reasoning field after a normal stop.
  const moved = normalizeQuestionResult({ choices: [{ finish_reason: 'stop', message: { content: null, reasoning: '{"a":1}', reasoning_content: '{"a":1}' } }], usage }, BenchmarkStop);
  assert.deepEqual([moved.response, moved.envelope, moved.reasoningChars], ['{"a":1}', 'choices-reasoning-field', 0]);
  const output = normalizeQuestionResult({ status: 'completed', usage: { input_tokens: 5, output_tokens: 9, output_tokens_details: { reasoning_tokens: 4 } },
    output: [{ type: 'reasoning', content: [{ type: 'reasoning_text', text: 'abcd' }] },
      { type: 'message', content: [{ type: 'output_text', text: '{"a":' }, { type: 'output_text', text: '1}' }] }] }, BenchmarkStop);
  assert.equal(output.response, '{"a":1}');
  assert.equal(output.reasoningChars, 4);
  assert.deepEqual(output.usage, { prompt_tokens: 5, completion_tokens: 9, reasoning_tokens: 4 });
  const think = normalizeQuestionResult({ response: '<think>{x}</think>\n{"a":1}' }, BenchmarkStop);
  assert.equal(think.response, '\n{"a":1}');
  assert.equal(think.reasoningChars, 10);
  assert.equal(think.usage, null);
  assert.throws(() => normalizeQuestionResult({ response: { a: 1 } }, BenchmarkStop), error => error instanceof BenchmarkStop);
});

test('question vocabulary: short words from the allowlist, longer ones must be known words', () => {
  const known = new Set(['mean', 'word', 'bird', 'person', 'name', 'something']);
  const isKnown = word => known.has(word);
  assert.deepEqual(questionVocabularyProblems('Can your word mean a bird?', w => w === 'your' || isKnown(w)), []);
  assert.deepEqual(questionVocabularyProblems("Can your word mean a person's name?", w => w === 'your' || isKnown(w)), []);
  // An unknown long word and an unlisted short word are both reported; the known ones are not.
  assert.deepEqual(questionVocabularyProblems('Can your word mean a zorbx or xyz?', w => w === 'your' || isKnown(w)), ['zorbx', 'xyz']);
  assert.deepEqual(questionVocabularyProblems('Can your word mean a bird?', () => false), ['your', 'word', 'mean', 'bird']);
});
