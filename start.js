// Railway/production entry point
const path = require('path');

require('ts-node').register({
  skipProject: true,
  compilerOptions: {
    module: 'commonjs',
    moduleResolution: 'node',
    esModuleInterop: true,
    strict: false,
    skipLibCheck: true,
    resolveJsonModule: true,
    baseUrl: '.',
    paths: {
      '@k12-ai/*': ['packages/*/src'],
    },
  },
});

// Register path alias resolver for runtime
const Module = require('module');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@k12-ai/')) {
    const pkgName = request.replace('@k12-ai/', '');
    const resolved = path.join(__dirname, 'packages', pkgName, 'src', 'index.ts');
    try {
      require('fs').accessSync(resolved);
      return originalResolve.call(this, resolved, parent, isMain, options);
    } catch {}
    // Try without /src/index.ts (for sub-paths like @k12-ai/shared/config)
    const subPath = path.join(__dirname, 'packages', pkgName + '.ts');
    try {
      require('fs').accessSync(subPath);
      return originalResolve.call(this, subPath, parent, isMain, options);
    } catch {}
  }
  return originalResolve.call(this, request, parent, isMain, options);
};

try {
  require('./packages/demo-server/src/server.ts');
} catch (err) {
  console.error('Failed to start server:', err.message || err);
  process.exit(1);
}
