const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const escope = require('eslint-scope');

const NODE_GLOBALS = new Set([
  'require', 'module', 'exports', '__dirname', '__filename', 'process', 'console',
  'Buffer', 'global', 'globalThis', 'setTimeout', 'setInterval', 'clearTimeout',
  'clearInterval', 'setImmediate', 'clearImmediate', 'queueMicrotask',
  'Array', 'Object', 'Date', 'Math', 'JSON', 'Promise', 'Number', 'String', 'Boolean',
  'RegExp', 'Error', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError',
  'Map', 'Set', 'WeakMap', 'WeakSet', 'Symbol', 'Proxy', 'Reflect', 'Function',
  'Infinity', 'NaN', 'undefined', 'parseInt', 'parseFloat', 'isNaN', 'isFinite',
  'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI',
  'fetch', 'Blob', 'FormData', 'URL', 'URLSearchParams', 'AbortController',
  'structuredClone', 'TextEncoder', 'TextDecoder', 'performance', 'crypto',
]);

function checkFile(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  let ast;
  try {
    ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: 'script', allowReturnOutsideFunction: true, ranges: true, locations: true });
  } catch (e) {
    return [{ error: `PARSE ERROR: ${e.message}` }];
  }
  const scopeManager = escope.analyze(ast, { ecmaVersion: 2022, sourceType: 'script', optimistic: false });
  const globalScope = scopeManager.globalScope;
  const unresolved = globalScope.through
    .map((ref) => ref.identifier.name)
    .filter((name) => !NODE_GLOBALS.has(name));
  const unique = [...new Set(unresolved)];
  return unique;
}

const dir = path.join(__dirname, '..', 'src', 'controller');
const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : fs.readdirSync(dir).filter((f) => f.startsWith('shipment') && f.endsWith('.js') && !f.endsWith('.test.js'));

files.forEach((f) => {
  const full = f.includes('/') ? f : path.join(dir, f);
  const result = checkFile(full);
  console.log(`\n=== ${f} ===`);
  if (result.length === 0) console.log('  clean');
  else console.log(' ', result.join(', '));
});
