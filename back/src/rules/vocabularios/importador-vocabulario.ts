import { calcularSha256 } from '../../datasets/armazenamento-arquivos.service';
import { lerCsv } from '../../datasets/leitor-csv';
import { Separador } from '../../datasets/limites-csv';
import { ValidadorCsv } from '../../datasets/validador-csv';
import { MetadadosVocabulario, VOCABULARIOS_ADMITIDOS } from './vocabulario.tipos';

export interface VocabularioPreparado {
  metadados: MetadadosVocabulario;
  hashArquivo: string;
  codigos: { codigo: string; descricao: string | null }[];
}

export class ErroImportacaoVocabulario extends Error {}

/**
 * Prepara a importação de um arquivo de vocabulário (ADR-009): exige origem, versão e licença,
 * restringe o nome aos vocabulários admitidos e valida a lista de códigos (texto, sem repetição).
 */
export async function prepararVocabulario(
  conteudo: Buffer,
  metadados: MetadadosVocabulario,
  opcoes: { separador?: Separador; colunaCodigo?: string; colunaDescricao?: string } = {},
): Promise<VocabularioPreparado> {
  const normalizados: MetadadosVocabulario = {
    nome: metadados.nome?.trim() ?? '',
    origem: metadados.origem?.trim() ?? '',
    versao: metadados.versao?.trim() ?? '',
    licenca: metadados.licenca?.trim() ?? '',
  };
  for (const campo of ['nome', 'origem', 'versao', 'licenca'] as const) {
    if (!normalizados[campo]) {
      throw new ErroImportacaoVocabulario(
        `Informe ${campo} do vocabulário: sem ele o vocabulário não pode ser usado.`,
      );
    }
  }
  if (!VOCABULARIOS_ADMITIDOS.includes(normalizados.nome)) {
    throw new ErroImportacaoVocabulario(
      `Vocabulário "${normalizados.nome}" fora da baseline (admitidos: ${VOCABULARIOS_ADMITIDOS.join(', ')}).`,
    );
  }
  const separador = opcoes.separador ?? ',';
  const validacao = await new ValidadorCsv().validar(conteudo, { separador });
  if (!validacao.valido) {
    throw new ErroImportacaoVocabulario(`Arquivo de vocabulário inválido: ${validacao.mensagem}`);
  }
  const { colunas, registros } = await lerCsv(conteudo, separador);
  const indiceCodigo = colunas.indexOf(opcoes.colunaCodigo ?? 'codigo');
  const indiceDescricao = colunas.indexOf(opcoes.colunaDescricao ?? 'descricao');
  if (indiceCodigo < 0) {
    throw new ErroImportacaoVocabulario(
      `Coluna de código "${opcoes.colunaCodigo ?? 'codigo'}" não encontrada.`,
    );
  }
  const vistos = new Set<string>();
  const codigos = registros.map((registro, i) => {
    const codigo = registro[indiceCodigo].trim();
    if (!codigo) {
      throw new ErroImportacaoVocabulario(`Código vazio na linha de dados ${i + 1}.`);
    }
    if (vistos.has(codigo)) {
      throw new ErroImportacaoVocabulario(`Código repetido "${codigo}" na linha de dados ${i + 1}.`);
    }
    vistos.add(codigo);
    const descricao = indiceDescricao >= 0 ? registro[indiceDescricao].trim() || null : null;
    return { codigo, descricao };
  });
  return { metadados: normalizados, hashArquivo: calcularSha256(conteudo), codigos };
}
