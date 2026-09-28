import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('Illucia build-tool and committed vocabulary contract', () => {
  execFileSync(process.env.PYTHON || 'python', ['-m', 'unittest', '-v', 'test_illucia_words.py'], {
    cwd: fileURLToPath(new URL('.', import.meta.url)),
    stdio: 'pipe',
  });
});
