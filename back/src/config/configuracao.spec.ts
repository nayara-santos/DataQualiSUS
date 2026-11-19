import { carregarConfiguracao } from './configuracao';

describe('carregarConfiguracao', () => {
  it('aplica os valores padrão documentados (60 s de simulação, sessão de 8 h)', () => {
    const configuracao = carregarConfiguracao({ DATABASE_URL: 'postgres://u:s@localhost/db' });
    expect(configuracao.simulacaoLimiteMs).toBe(60_000);
    expect(configuracao.sessaoDuracaoMinutos).toBe(480);
    expect(configuracao.bcryptCusto).toBe(12);
    expect(configuracao.porta).toBe(3000);
    expect(configuracao.corsOrigem).toEqual(['http://localhost:5173']);
  });

  it('exige DATABASE_URL', () => {
    expect(() => carregarConfiguracao({})).toThrow('DATABASE_URL');
  });

  it('rejeita valores numéricos inválidos', () => {
    expect(() => carregarConfiguracao({ DATABASE_URL: 'x', SIMULACAO_LIMITE_MS: 'abc' })).toThrow(
      'SIMULACAO_LIMITE_MS',
    );
    expect(() => carregarConfiguracao({ DATABASE_URL: 'x', BCRYPT_CUSTO: '2' })).toThrow('BCRYPT_CUSTO');
  });

  it('aceita múltiplas origens de CORS separadas por vírgula', () => {
    const configuracao = carregarConfiguracao({ DATABASE_URL: 'x', CORS_ORIGEM: 'http://a, http://b' });
    expect(configuracao.corsOrigem).toEqual(['http://a', 'http://b']);
  });
});
