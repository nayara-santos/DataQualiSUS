import { MATRIZ_PERMISSOES, Operacao, operacoesDoPapel, verificarPermissao } from './matriz-permissoes';
import { PapelUsuario } from './papel-usuario';

const { ANALISTA, GESTOR, EQUIPE_TECNICA } = PapelUsuario;

describe('Matriz perfil × operação (P1, seção 8.3)', () => {
  const operacoesRf001aRf004 = Object.values(Operacao).filter(
    (op) => !op.startsWith('DIAGNOSTICO_') && !op.startsWith('AUDITORIA_') && op !== Operacao.SESSAO_PROPRIA,
  );

  it('declara permissões para todas as operações', () => {
    for (const operacao of Object.values(Operacao)) {
      expect(MATRIZ_PERMISSOES[operacao].length).toBeGreaterThan(0);
    }
  });

  it('concede RF001–RF004 somente ao analista', () => {
    for (const operacao of operacoesRf001aRf004) {
      expect(MATRIZ_PERMISSOES[operacao]).toEqual([ANALISTA]);
    }
  });

  it('concede o diagnóstico (RF005) ao analista e ao gestor, não à equipe técnica', () => {
    for (const operacao of [Operacao.DIAGNOSTICO_CONSULTAR, Operacao.DIAGNOSTICO_EXPORTAR]) {
      expect(verificarPermissao(ANALISTA, operacao)).toBe(true);
      expect(verificarPermissao(GESTOR, operacao)).toBe(true);
      expect(verificarPermissao(EQUIPE_TECNICA, operacao)).toBe(false);
    }
  });

  it('concede a auditoria (RF006) e a sessão (RF007) aos três perfis', () => {
    for (const operacao of [
      Operacao.AUDITORIA_CONSULTAR,
      Operacao.AUDITORIA_EXPORTAR,
      Operacao.SESSAO_PROPRIA,
    ]) {
      for (const papel of [ANALISTA, GESTOR, EQUIPE_TECNICA]) {
        expect(verificarPermissao(papel, operacao)).toBe(true);
      }
    }
  });

  it('nega operação não declarada ou desconhecida', () => {
    expect(verificarPermissao(ANALISTA, undefined)).toBe(false);
    expect(verificarPermissao(ANALISTA, 'INEXISTENTE' as Operacao)).toBe(false);
  });

  it('lista as operações de cada perfil conforme a matriz', () => {
    expect(operacoesDoPapel(EQUIPE_TECNICA).sort()).toEqual(
      [Operacao.AUDITORIA_CONSULTAR, Operacao.AUDITORIA_EXPORTAR, Operacao.SESSAO_PROPRIA].sort(),
    );
    expect(operacoesDoPapel(GESTOR)).toEqual(expect.arrayContaining([Operacao.DIAGNOSTICO_CONSULTAR]));
    expect(operacoesDoPapel(GESTOR)).not.toContain(Operacao.DATASET_IMPORTAR);
    expect(operacoesDoPapel(ANALISTA)).toHaveLength(Object.values(Operacao).length);
  });
});
