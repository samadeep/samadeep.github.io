// Runs a lab's Python file with Pyodide (CPython compiled to WebAssembly), off the main thread.
// Message in:  { base, code, argv }   base = URL of the Pyodide distribution
// Messages out: { status } | { out } | { err } | { done: ms }
let py;

self.onmessage = async ({ data: { base, code, argv } }) => {
  try {
    if (!py) {
      postMessage({ status: 'Loading Python in your browser (about 13 MB, first run only)...' });
      const { loadPyodide } = await import(base + 'pyodide.mjs');
      py = await loadPyodide({ indexURL: base });
    }
    // packages the lab imports (numpy, ...) come from the same Pyodide distribution, once per page
    await py.loadPackagesFromImports(code, { messageCallback: (m) => postMessage({ status: m }) });
    py.setStdout({ batched: (s) => postMessage({ out: s }) });
    py.setStderr({ batched: (s) => postMessage({ err: s }) });
    py.globals.set('LAB_ARGV', argv);
    py.runPython('import sys; sys.argv = LAB_ARGV.to_py()');
    const g = py.globals.get('dict')();
    g.set('__name__', '__main__');
    const t0 = performance.now();
    try {
      py.runPython(code, { globals: g });
    } catch (e) {
      const msg = String(e.message || e);
      if (!/SystemExit: 0/.test(msg)) postMessage({ err: msg.split('\n').slice(-6).join('\n') });
    }
    g.destroy();
    postMessage({ done: Math.round(performance.now() - t0) });
  } catch (e) {
    postMessage({ err: 'Could not start Python: ' + (e.message || e) });
    postMessage({ done: -1 });
  }
};
