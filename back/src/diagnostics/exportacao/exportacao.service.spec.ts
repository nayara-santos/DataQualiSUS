import { ExtratoDto } from '../../audit/auditoria.tipos';
import { TipoAlteracao } from '../../rules/motor/motor-regras';
import { TipoAcao } from '../../rules/motor/tipos';
import { ExportacaoService, LIMITE_ALTERACOES_PDF } from './exportacao.service';

const extrato: ExtratoDto = {
  id: 'e1',
  operacao: 'TRATAMENTO',
  simulacaoId: 's1',
  dataset: { id: 'd1', nome: '=CMD()', situacao: 'ATIVO' },
  usuarioId: 'u1',
  instanteUtc: '2026-11-10T13:00:00.000Z',
  versaoEntrada: { id: 'v1', numero: 1, hashSha256: 'a'.repeat(64) },
  versaoSaida: { id: 'v2', numero: 2, hashSha256: 'b'.repeat(64) },
  conjunto: { id: 'c1', revisao: 1 },
  revisoesRegras: [{ regraId: 'r1', revisao: 1, nome: 'Aparar', ordem: 1 }],
  acoesAplicadas: [{ ordem: 1, regraId: 'r1', acao: TipoAcao.APARAR_ESPACOS, coluna: 'nome' }],
  totalLinhasAlteradas: 1,
  totalLinhasRemovidas: 0,
  totalLinhasAfetadas: 1,
  totalAlteracoes: LIMITE_ALTERACOES_PDF + 5,
};

describe('ExportacaoService — extrato em PDF (ADR-007)', () => {
  const servico = new ExportacaoService();

  it('gera PDF com páginas e metadados do extrato', async () => {
    const alteracoes = Array.from({ length: LIMITE_ALTERACOES_PDF + 5 }, (_, i) => ({
      linha: i + 1,
      tipo: TipoAlteracao.ATUALIZACAO,
      regraId: 'r1',
      regraRevisao: 1,
      acao: TipoAcao.APARAR_ESPACOS,
      coluna: 'nome',
      valorAnterior: ' x',
      valorNovo: 'x',
      linhaRepresentante: null,
    }));
    const pdf = await servico.exportarExtratoPdf(extrato, alteracoes);
    const texto = pdf.toString('latin1');
    expect(texto.startsWith('%PDF-')).toBe(true);
    expect(texto.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(texto).toContain('Extrato de auditoria e1');
    expect((texto.match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(1);
  });

  it('gera PDF também sem alterações detalhadas', async () => {
    const pdf = await servico.exportarExtratoPdf({ ...extrato, totalAlteracoes: 0 }, []);
    expect(pdf.length).toBeGreaterThan(500);
  });
});
