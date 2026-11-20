import { Injectable } from '@nestjs/common';
import { ConflitoEstado, RecursoNaoEncontrado } from '../../common/erros/erro-negocio';
import { DatabaseService } from '../../database/database.service';
import { Separador } from '../../datasets/limites-csv';
import { prepararVocabulario } from './importador-vocabulario';
import { VocabularioRepository } from './vocabulario.repository';
import {
  MetadadosVocabulario,
  paraVocabularioDto,
  VocabularioDto,
  VOCABULARIOS_ADMITIDOS,
} from './vocabulario.tipos';

/** VocabularioService (P2, seção 2): listarDisponiveis(), obter(id, versão) e contem(código). */
@Injectable()
export class VocabularioService {
  constructor(
    private readonly banco: DatabaseService,
    private readonly repositorio: VocabularioRepository,
  ) {}

  /** Somente vocabulários admitidos e com origem, versão e licença registradas aparecem na T03. */
  async listarDisponiveis(): Promise<VocabularioDto[]> {
    return (await this.repositorio.listar())
      .filter((v) => VOCABULARIOS_ADMITIDOS.includes(v.nome) && v.origem && v.versao && v.licenca)
      .map(paraVocabularioDto);
  }

  async obter(id: string): Promise<VocabularioDto> {
    const vocabulario = await this.repositorio.buscarPorId(id);
    if (!vocabulario || !VOCABULARIOS_ADMITIDOS.includes(vocabulario.nome)) {
      throw new RecursoNaoEncontrado('Vocabulário não disponível.');
    }
    return paraVocabularioDto(vocabulario);
  }

  /** Disponibilidade usada pelas regras: vocabulário ausente bloqueia a regra (RN02). */
  async disponiveis(ids: string[]): Promise<Map<string, VocabularioDto>> {
    const encontrados = await this.repositorio.buscarPorIds([...new Set(ids)]);
    return new Map(
      encontrados
        .filter((v) => VOCABULARIOS_ADMITIDOS.includes(v.nome))
        .map((v) => [v.id, paraVocabularioDto(v)]),
    );
  }

  contem(id: string, codigo: string): Promise<boolean> {
    return this.repositorio.contem(id, codigo);
  }

  listarCodigos(id: string): Promise<string[]> {
    return this.repositorio.listarCodigos(id);
  }

  /**
   * Importação pela equipe de desenvolvimento (script, ADR-009). A troca de versão exige nova
   * importação: o mesmo par nome/versão não pode ser sobrescrito.
   */
  async importar(
    conteudo: Buffer,
    metadados: MetadadosVocabulario,
    opcoes: { separador?: Separador; colunaCodigo?: string; colunaDescricao?: string } = {},
  ): Promise<VocabularioDto> {
    const preparado = await prepararVocabulario(conteudo, metadados, opcoes);
    try {
      return paraVocabularioDto(await this.banco.transacao((tx) => this.repositorio.inserir(preparado, tx)));
    } catch (erro) {
      if ((erro as { code?: string }).code === '23505') {
        throw new ConflitoEstado(
          'VOCABULARIO_JA_IMPORTADO',
          `O vocabulário ${preparado.metadados.nome} versão ${preparado.metadados.versao} já foi importado.`,
        );
      }
      throw erro;
    }
  }
}
