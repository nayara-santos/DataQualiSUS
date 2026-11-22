/**
 * Testes de integração (CT001–CT007 e CTN aplicáveis), mantidos em /tests na raiz
 * do repositório, conforme a estrutura definida na P3 (seção 6.1).
 * Exigem PostgreSQL 16 acessível em TEST_DATABASE_URL (ver docker-compose.yml).
 */
const path = require('path');

// O globalSetup é carregado pelo Node fora do resolvedor do Jest; expõe as dependências do backend
// para os arquivos de /tests sem duplicar node_modules na raiz.
const dependenciasBackend = path.resolve(__dirname, 'node_modules');
process.env.NODE_PATH = [dependenciasBackend, process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
require('module').Module._initPaths();

module.exports = {
  rootDir: path.resolve(__dirname, '..'),
  roots: ['<rootDir>/tests/integracao'],
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: '.*\\.e2e-spec\\.ts$',
  modulePaths: [path.resolve(__dirname, 'node_modules')],
  transform: {
    '^.+\\.ts$': [
      require.resolve('ts-jest'),
      { tsconfig: path.resolve(__dirname, 'tsconfig.json') },
    ],
  },
  globalSetup: '<rootDir>/tests/integracao/suporte/preparar-banco.ts',
  testTimeout: 60000,
  collectCoverageFrom: ['<rootDir>/back/src/**/*.ts', '!**/*.spec.ts', '!**/main.ts', '!**/cli/**', '!**/__testes__/**'],
  coverageDirectory: '<rootDir>/back/coverage/integracao',
  coverageReporters: ['text-summary', 'lcov'],
};
