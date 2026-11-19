/**
 * Configuração da API lida de variáveis de ambiente.
 * Os valores padrão seguem a seção 8.3 da P1 (limites) e as ADR-006/ADR-008 da P2.
 */
export interface Configuracao {
  porta: number;
  bancoUrl: string;
  armazenamentoDir: string;
  corsOrigem: string[];
  sessaoDuracaoMinutos: number;
  bcryptCusto: number;
  simulacaoLimiteMs: number;
  simulacaoPoolTamanho: number;
}

export const CONFIGURACAO = Symbol('CONFIGURACAO');

function inteiro(valor: string | undefined, padrao: number, nome: string, minimo = 1): number {
  if (valor === undefined || valor.trim() === '') {
    return padrao;
  }
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < minimo) {
    throw new Error(`Variável de ambiente ${nome} inválida: informe um inteiro maior ou igual a ${minimo}.`);
  }
  return numero;
}

export function carregarConfiguracao(env: NodeJS.ProcessEnv = process.env): Configuracao {
  const bancoUrl = env.DATABASE_URL;
  if (!bancoUrl) {
    throw new Error('Variável de ambiente DATABASE_URL não definida.');
  }
  return {
    porta: inteiro(env.PORTA, 3000, 'PORTA'),
    bancoUrl,
    armazenamentoDir: env.ARMAZENAMENTO_DIR?.trim() || './armazenamento',
    corsOrigem: (env.CORS_ORIGEM ?? 'http://localhost:5173')
      .split(',')
      .map((origem) => origem.trim())
      .filter(Boolean),
    sessaoDuracaoMinutos: inteiro(env.SESSAO_DURACAO_MINUTOS, 480, 'SESSAO_DURACAO_MINUTOS'),
    bcryptCusto: inteiro(env.BCRYPT_CUSTO, 12, 'BCRYPT_CUSTO', 4),
    simulacaoLimiteMs: inteiro(env.SIMULACAO_LIMITE_MS, 60_000, 'SIMULACAO_LIMITE_MS'),
    simulacaoPoolTamanho: inteiro(env.SIMULACAO_POOL_TAMANHO, 2, 'SIMULACAO_POOL_TAMANHO'),
  };
}
