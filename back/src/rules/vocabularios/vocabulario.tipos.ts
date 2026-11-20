/**
 * Vocabulários admitidos na baseline (RN02, ADR-009): somente CID-10 no MVP. TUSS depende de
 * disponibilidade e licença comprovadas e não pode ser importado sem decisão documentada.
 */
export const VOCABULARIOS_ADMITIDOS: readonly string[] = ['CID-10'];

export interface VocabularioRegistro {
  id: string;
  nome: string;
  origem: string;
  versao: string;
  licenca: string;
  hash_arquivo: string;
  total_codigos: number;
  importado_em: Date;
}

export interface VocabularioDto {
  id: string;
  nome: string;
  origem: string;
  versao: string;
  licenca: string;
  hashArquivo: string;
  totalCodigos: number;
  importadoEm: string;
}

export function paraVocabularioDto(v: VocabularioRegistro): VocabularioDto {
  return {
    id: v.id,
    nome: v.nome,
    origem: v.origem,
    versao: v.versao,
    licenca: v.licenca,
    hashArquivo: v.hash_arquivo,
    totalCodigos: v.total_codigos,
    importadoEm: new Date(v.importado_em).toISOString(),
  };
}

export interface MetadadosVocabulario {
  nome: string;
  origem: string;
  versao: string;
  licenca: string;
}
