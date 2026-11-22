import { Controller, Get, Param, ParseUUIDPipe, Query, StreamableFile } from '@nestjs/common';
import { IsUUID } from 'class-validator';
import { ExigeOperacao } from '../auth/decoradores';
import { Operacao } from '../auth/matriz-permissoes';
import { PaginacaoRegistrosDto } from '../datasets/dto/atualizar-metadados.dto';
import { AuditoriaService } from './auditoria.service';
import { ExtratoDetalheDto, ExtratoDto } from './auditoria.tipos';

export class FiltroExtratosDto {
  @IsUUID('all', { message: 'Informe o dataset.' })
  datasetId: string;
}

/** UC-06 — Consultar e exportar extrato de auditoria (tela T07). Não há rotas de edição ou remoção. */
@Controller('auditoria')
export class AuditoriaController {
  constructor(private readonly auditoria: AuditoriaService) {}

  @ExigeOperacao(Operacao.AUDITORIA_CONSULTAR)
  @Get('datasets')
  datasets() {
    return this.auditoria.listarDatasetsAuditados();
  }

  @ExigeOperacao(Operacao.AUDITORIA_CONSULTAR)
  @Get('extratos')
  listar(@Query() filtro: FiltroExtratosDto): Promise<ExtratoDto[]> {
    return this.auditoria.listarExtratos(filtro.datasetId);
  }

  @ExigeOperacao(Operacao.AUDITORIA_CONSULTAR)
  @Get('extratos/:id')
  obter(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() paginacao: PaginacaoRegistrosDto,
  ): Promise<ExtratoDetalheDto> {
    return this.auditoria.obterExtrato(id, paginacao.pagina, paginacao.tamanho);
  }

  @ExigeOperacao(Operacao.AUDITORIA_EXPORTAR)
  @Get('extratos/:id/pdf')
  async exportarPdf(@Param('id', new ParseUUIDPipe()) id: string): Promise<StreamableFile> {
    const arquivo = await this.auditoria.exportarPdf(id);
    return new StreamableFile(arquivo.conteudo, {
      type: 'application/pdf',
      disposition: `attachment; filename="${arquivo.nomeArquivo}"`,
      length: arquivo.conteudo.length,
    });
  }
}
