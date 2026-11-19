/**
 * Testes unitários: arquivos *.spec.ts ao lado do código em src/.
 * Não dependem de banco de dados nem de rede.
 */
module.exports = {
  rootDir: 'src',
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }],
  },
  collectCoverageFrom: ['**/*.ts', '!**/*.spec.ts', '!main.ts', '!cli/**', '!**/*.module.ts', '!**/__testes__/**'],
  coverageDirectory: '../coverage/unit',
  coverageReporters: ['text-summary', 'text', 'lcov'],
};
