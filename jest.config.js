const nextJest = require('next/jest');

const createJestConfig = nextJest({
    dir: './',
});

const customJestConfig = {
    testEnvironment: 'node',
    setupFilesAfterEnv: ['<rootDir>/tests/setup/jest.setup.ts'],
    testMatch: ['<rootDir>/tests/**/*.integration.test.ts'],
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
        '^formidable$': '<rootDir>/tests/mocks/formidable.js',
    },
    collectCoverage: true,
    coverageProvider: 'v8',
    collectCoverageFrom: [
        'src/lib/realtime/socket-manager.ts',
        'src/lib/realtime/socket-client.ts',
        'src/lib/realtime/socket-events.ts',
        'src/lib/realtime/broadcast-counts.ts',
        'src/lib/realtime/online-status.ts',
        'src/app/api/messages/route.ts',
        'src/app/api/client/messages/route.ts',
        'src/app/api/client/unread-counts/refresh/route.ts',
        'src/app/api/realtime/send/route.ts',
        '!**/*.d.ts',
    ],
    coverageReporters: ['text', 'lcov', 'html', 'json-summary', 'cobertura'],
    coverageThreshold: {
        global: {
            branches: 50,
            functions: 50,
            lines: 65,
            statements: 65,
        },
    },
    reporters: [
        'default',
        [
            'jest-junit',
            {
                outputDirectory: 'reports/junit',
                outputName: 'socketio-integration.xml',
                suiteNameTemplate: '{filepath}',
                classNameTemplate: '{classname}',
                titleTemplate: '{title}',
                ancestorSeparator: ' > ',
            },
        ],
    ],
    clearMocks: true,
    restoreMocks: true,
    verbose: true,
    maxWorkers: 1,
    testTimeout: 15000,
};

module.exports = createJestConfig(customJestConfig);