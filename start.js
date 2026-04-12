// Railway/production entry point
// Registers ts-node with skip-project to avoid tsconfig issues,
// then requires the demo server directly.

require('ts-node').register({
  skipProject: true,
  compilerOptions: {
    module: 'commonjs',
    moduleResolution: 'node',
    esModuleInterop: true,
    strict: false,
    skipLibCheck: true,
    resolveJsonModule: true,
  },
});

try {
  require('./packages/demo-server/src/server.ts');
} catch (err) {
  console.error('Failed to start server:', err);
  process.exit(1);
}
