import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('Illucia WordNet label build and committed label contract', () => {
  execFileSync(process.env.PYTHON || 'python', ['-m', 'unittest', '-v', 'test_illucia_labels.py'], {
    cwd: fileURLToPath(new URL('.', import.meta.url)),
    stdio: 'pipe',
  });
});
