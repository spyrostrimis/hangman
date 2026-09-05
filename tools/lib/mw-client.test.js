import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { collegiateCachePath, fetchCollegiate } from "./mw-client.js";

async function withTempDirectory(run) {
  const directory = await mkdtemp(join(tmpdir(), "hangman-mw-client-"));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function withApiKey(run) {
  const previous = process.env.MW_KEY;
  const apiKey = randomUUID();
  process.env.MW_KEY = apiKey;
  try {
    return await run(apiKey);
  } finally {
    if (previous === undefined) {
      delete process.env.MW_KEY;
    } else {
      process.env.MW_KEY = previous;
    }
  }
}

function jsonResponse(value, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => value,
  };
}

test("cache hit returns a cached suggestion array with zero fetches", async () => {
  await withTempDirectory(async (cacheDir) => {
    const cachePath = collegiateCachePath("Melancholy", { cacheDir });
    await mkdir(cacheDir, { recursive: true });
    await writeFile(cachePath, `${JSON.stringify(["melancholia"])}\n`, "utf8");
    let fetches = 0;

    const result = await fetchCollegiate("Melancholy", {
      cacheDir,
      fetchImpl: async () => {
        fetches += 1;
        throw new Error("network must not be used");
      },
    });

    assert.deepEqual(result, ["melancholia"]);
    assert.equal(fetches, 0);
    assert.equal(cachePath, join(cacheDir, "melancholy.json"));
  });
});

test("cache miss fetches exactly once and atomically creates cache", async () => {
  await withTempDirectory(async (cacheDir) => {
    await withApiKey(async () => {
      const raw = [{ meta: { id: "volume:1" } }];
      let fetches = 0;

      const result = await fetchCollegiate("volume", {
        cacheDir,
        fetchImpl: async () => {
          fetches += 1;
          return jsonResponse(raw);
        },
      });

      assert.strictEqual(result, raw);
      assert.equal(fetches, 1);
      assert.deepEqual(
        JSON.parse(await readFile(collegiateCachePath("volume", { cacheDir }), "utf8")),
        raw,
      );
    });
  });
});

test("refresh bypasses existing cache and fetches once", async () => {
  await withTempDirectory(async (cacheDir) => {
    await withApiKey(async () => {
      const cachePath = collegiateCachePath("volume", { cacheDir });
      await mkdir(cacheDir, { recursive: true });
      await writeFile(cachePath, `${JSON.stringify(["old"])}\n`, "utf8");
      let fetches = 0;

      const result = await fetchCollegiate("volume", {
        cacheDir,
        refresh: true,
        fetchImpl: async () => {
          fetches += 1;
          return jsonResponse(["new"]);
        },
      });

      assert.deepEqual(result, ["new"]);
      assert.equal(fetches, 1);
      assert.deepEqual(JSON.parse(await readFile(cachePath, "utf8")), ["new"]);
    });
  });
});

test("HTTP failure writes no successful-looking cache and leaks no key", async () => {
  await withTempDirectory(async (cacheDir) => {
    await withApiKey(async (apiKey) => {
      const cachePath = collegiateCachePath("volume", { cacheDir });
      await assert.rejects(
        () => fetchCollegiate("volume", {
          cacheDir,
          fetchImpl: async () => jsonResponse(null, 503),
        }),
        (error) => {
          assert.equal(error.message.includes(apiKey), false);
          assert.match(error.message, /HTTP 503/);
          return true;
        },
      );
      await assert.rejects(readFile(cachePath), { code: "ENOENT" });
    });
  });
});

test("wrapper never puts the API key in cache path, content, result, or errors", async () => {
  await withTempDirectory(async (cacheDir) => {
    await withApiKey(async (apiKey) => {
      const raw = [{ meta: { id: "test:1" } }];
      const result = await fetchCollegiate("test", {
        cacheDir,
        fetchImpl: async () => jsonResponse(raw),
      });
      const cachePath = collegiateCachePath("test", { cacheDir });
      const cacheContent = await readFile(cachePath, "utf8");

      assert.equal(cachePath.includes(apiKey), false);
      assert.equal(cacheContent.includes(apiKey), false);
      assert.equal(JSON.stringify(result).includes(apiKey), false);

      await assert.rejects(
        () => fetchCollegiate("other", {
          cacheDir,
          fetchImpl: async () => {
            throw new Error(apiKey);
          },
        }),
        (error) => {
          assert.equal(error.message.includes(apiKey), false);
          return true;
        },
      );
    });
  });
});
