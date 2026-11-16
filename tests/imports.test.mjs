// Static sanity check (Phaser can't run in Node): every relative import must
// resolve to a file, and every named import must be exported by that file.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../src');
const files = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p);
    else if (p.endsWith('.js')) files.push(p);
  }
})(root);

function exportsOf(src) {
  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z0-9_$]+)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]+)\}/g)) m[1].split(',').forEach((n) => names.add(n.trim().split(/\s+as\s+/).pop()));
  if (/export\s+default/.test(src)) names.add('default');
  return names;
}

test('relative imports resolve and named exports exist', () => {
  const problems = [];
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/import\s+([^;]*?)\s+from\s+'(\.[^']+)'/g)) {
      const target = path.resolve(path.dirname(file), m[2]);
      if (!fs.existsSync(target)) { problems.push(`${path.relative(root, file)}: missing ${m[2]}`); continue; }
      if (!target.endsWith('.js')) continue;
      const ex = exportsOf(fs.readFileSync(target, 'utf8'));
      const clause = m[1];
      const def = clause.match(/^([A-Za-z0-9_$]+)\s*(,|$)/);
      if (def && !ex.has('default')) problems.push(`${path.relative(root, file)}: ${m[2]} has no default export`);
      const named = clause.match(/\{([^}]*)\}/);
      if (named) {
        for (const n of named[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean)) {
          if (!ex.has(n)) problems.push(`${path.relative(root, file)}: ${m[2]} does not export ${n}`);
        }
      }
    }
  }
  assert.deepEqual(problems, []);
});

test('every scene key used in scene.start/restart is registered', () => {
  const registered = new Set();
  const used = new Set();
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/super\('([A-Za-z]+)'\)/g)) registered.add(m[1]);
    for (const m of src.matchAll(/scene\.start\('([A-Za-z]+)'/g)) used.add(m[1]);
  }
  for (const k of used) assert.ok(registered.has(k), `unknown scene ${k}`);
});
