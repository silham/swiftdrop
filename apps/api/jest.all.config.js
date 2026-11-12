// Unit + integration tests in ONE run, so coverage is merged into a single report and a single
// threshold. Needs Postgres and RabbitMQ like `make test-int`:  make coverage
// Reports: coverage/merged (html + lcov + a summary in the terminal).
const unit = require('./jest.config.js');
const integration = require('./test/jest-int.config.js');

/** @type {import('jest').Config} */
module.exports = {
  projects: [
    { ...unit, displayName: 'unit', rootDir: __dirname },
    { ...integration, displayName: 'integration', rootDir: __dirname },
  ],
  // Coverage options only count when set here, not inside a project.
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/main.ts',
    '!src/**/*.module.ts',
    '!src/**/index.ts',
    '!src/**/*.dto.ts',
    '!src/**/*.spec.ts',
  ],
  coverageDirectory: 'coverage/merged',
  coverageReporters: ['text-summary', 'html', 'lcov', 'json-summary'],
  coverageThreshold: {
    // A few points under the measured value (lines 92.1, statements 90.6, functions 91.9,
    // branches 80.6; see docs/report/test-report.md). A drop below these fails the run. Raise them as
    // the tests grow.
    global: { lines: 88, statements: 86, functions: 87, branches: 75 },
  },
};
