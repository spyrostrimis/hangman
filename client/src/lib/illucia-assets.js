import { parseCategories, parseLabels } from './illucia/questions.js';

// Her question labels for one length (v2 B1), shared by /illucia and /illucia-observatory.
// Static files: only the length is in the request. Questions are optional: if they cannot load,
// this resolves to null and she plays letters only.
export async function loadQuestions(length, options) {
  try {
    const [labelsResponse, categoriesResponse] = await Promise.all([
      fetch(`/illucia/labels/${length}.txt`, options), fetch('/illucia/labels/categories.json', options)]);
    if (!labelsResponse.ok || !categoriesResponse.ok) return null;
    const categories = parseCategories(await categoriesResponse.json());
    return { categories, labels: parseLabels(await labelsResponse.text(), length, categories) };
  } catch {
    return null;
  }
}
