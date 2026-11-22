import ExcelJS from 'exceljs';
import { DimensaoQualidade } from '../../rules/motor/tipos';
import { AVISO_DIAGNOSTICO, DiagnosticoDto, SituacaoIndicador } from '../diagnostico.tipos';
import { ExportacaoService, FormatoExportacao } from './exportacao.service';

const diagnostico: DiagnosticoDto = {
  dataset: { id: 'd1', nome: '=HYPERLINK("http://x")', situacao: 'ATIVO' },
  versao: { id: 'v1', numero: 2, hashSha256: 'a'.repeat(64) },
  simulacaoId: 's1',
  conjunto: { id: 'c1', nome: '+SOMA(1;2)', revisao: 3 },
  avaliadoEm: '2026-11-10T12:00:00.000Z',
  totalLinhas: 24,
  cobertura: { dimensoesAvaliadas: 2, totalDimensoes: 3, situacao: 'PARCIAL' },
  indicadores: [
    {
      dimensao: DimensaoQualidade.UNICIDADE,
      situacao: SituacaoIndicador.NAO_AVALIADA,
      percentual: null,
      numerador: null,
      denominador: null,
      linhasComViolacao: null,
      regras: [],
    },
    {
      dimensao: DimensaoQualidade.COMPLETUDE,
      situacao: SituacaoIndicador.AVALIADA,
      percentual: 87.5,
      numerador: 21,
      denominador: 24,
      linhasComViolacao: 3,
      regras: [{ regraId: 'r1', revisao: 1, nome: '-1+1', colunas: ['@coluna', '=cmd|calc'] }],
    },
    {
      dimensao: DimensaoQualidade.VALIDADE,
      situacao: SituacaoIndicador.AVALIADA,
      percentual: 62.5,
      numerador: 15,
      denominador: 24,
      linhasComViolacao: 9,
      regras: [{ regraId: 'r2', revisao: 2, nome: 'Idade', colunas: ['idade'] }],
    },
  ],
  aviso: AVISO_DIAGNOSTICO,
};

describe('ExportacaoService — diagnóstico (RF005, ADR-007, CTN005)', () => {
  const servico = new ExportacaoService();

  it('gera XLSX com os mesmos dados do DTO e células de texto inertes', async () => {
    const arquivo = await servico.exportarDiagnostico(diagnostico, FormatoExportacao.XLSX);
    expect(arquivo.nomeArquivo).toBe('diagnostico-d1-v2.xlsx');
    expect(arquivo.tipoConteudo).toContain('spreadsheetml');

    const pasta = new ExcelJS.Workbook();
    await pasta.xlsx.load(arquivo.conteudo as never);
    const resumo = pasta.getWorksheet('Diagnóstico')!;
    const todas: ExcelJS.Cell[] = [];
    pasta.eachSheet((folha) => folha.eachRow((linha) => linha.eachCell((celula) => todas.push(celula))));
    for (const celula of todas) {
      expect(celula.type).toBe(ExcelJS.ValueType.String);
      expect(celula.formula).toBeUndefined();
      expect(celula.numFmt).toBe('@');
    }
    expect(resumo.getCell('B1').value).toBe('=HYPERLINK("http://x")');
    expect(resumo.getCell('B6').value).toBe('+SOMA(1;2)');

    const linhas: Record<string, (string | undefined)[]> = {};
    resumo.eachRow((linha) => {
      const valores = (linha.values as (string | undefined)[]).slice(1);
      linhas[String(valores[0])] = valores;
    });
    expect(linhas['Unicidade']).toEqual(['Unicidade', 'Não avaliada', 'Não avaliada', '', '', '', '']);
    expect(linhas['Completude']).toEqual(['Completude', 'Avaliada', '87.50', '21', '24', '3', '-1+1']);
    expect(linhas['Validade']).toEqual(['Validade', 'Avaliada', '62.50', '15', '24', '9', 'Idade']);
    expect(linhas['Cobertura']).toEqual(['Cobertura', 'PARCIAL']);

    const regras = pasta.getWorksheet('Regras')!;
    expect(regras.getRow(2).values).toEqual([
      undefined,
      'Completude',
      '-1+1',
      'r1',
      '1',
      '@coluna, =cmd|calc',
    ]);
  });

  it('gera PDF identificado pela versão avaliada', async () => {
    const arquivo = await servico.exportarDiagnostico(diagnostico, FormatoExportacao.PDF);
    expect(arquivo.nomeArquivo).toBe('diagnostico-d1-v2.pdf');
    expect(arquivo.tipoConteudo).toBe('application/pdf');
    const texto = arquivo.conteudo.toString('latin1');
    expect(texto.startsWith('%PDF-')).toBe(true);
    expect(texto).toContain('/Title');
    expect(texto).toMatch(/\/Type \/Page\b/);
    expect(texto.trimEnd().endsWith('%%EOF')).toBe(true);
  });
});
