import { estaVazio } from './conversao';
import { avaliar } from './motor-regras';
import { DefinicaoOperador, REGISTRO_OPERADORES } from './registro-operadores';
import { ConfiguracaoRegra, TipoColuna } from './tipos';
import { validarConfiguracaoRegra } from './validacao-configuracao';

/**
 * Evidência do ponto de extensão do CTN006 (RNF006, ADR-002): um operador acrescentado apenas ao
 * registro passa a ser aceito pela validação e executado pelo motor, sem mudanças em autenticação,
 * importação, auditoria ou contratos de saída. O operador é removido ao final do teste; o ensaio
 * formal em branch com regressão CT001–CT007 segue registrado como pendência no relatório.
 */
describe('CTN006 — extensão do catálogo por registro de operador', () => {
  const novo: DefinicaoOperador = {
    codigo: 'COMECA_COM_TESTE',
    rotulo: 'começa com (operador de teste)',
    tipos: [TipoColuna.TEXTO],
    parametro: 'CONSTANTE',
    avaliar: (valor, _tipo, parametros) =>
      !estaVazio(valor) && valor.startsWith(String(parametros.constante)),
  };
  const registro = REGISTRO_OPERADORES as Record<string, DefinicaoOperador>;

  beforeAll(() => {
    registro[novo.codigo] = novo;
  });
  afterAll(() => {
    delete registro[novo.codigo];
  });

  it('é aceito pela validação e executado pelo motor', () => {
    const configuracao = {
      dimensao: 'VALIDADE',
      combinador: 'E',
      condicoes: [{ coluna: 'cid', tipo: 'TEXTO', operador: 'COMECA_COM_TESTE', valor: 'J' }],
    };
    const validacao = validarConfiguracaoRegra(configuracao, { vocabulariosDisponiveis: new Set() });
    expect(validacao.valida).toBe(true);
    const [resultado] = avaliar(
      ['cid'],
      [['J18.9'], ['I10'], ['']],
      [{ regraId: 'r', revisao: 1, nome: 'r', ordem: 1, configuracao: configuracao as ConfiguracaoRegra }],
    );
    expect(resultado.linhasVioladas).toEqual([2, 3]);
  });
});
