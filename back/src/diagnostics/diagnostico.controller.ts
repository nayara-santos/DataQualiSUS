import { Controller, Get, Param, ParseUUIDPipe, Query, StreamableFile } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsEnum } from 'class-validator';
import { ExigeOperacao } from '../auth/decoradores';
import { Operacao } from '../auth/matriz-permissoes';
import { DiagnosticoService } from './diagnostico.service';
import { DiagnosticoDto } from './diagnostico.tipos';
import { FormatoExportacao } from './exportacao/exportacao.service';

export class FormatoDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @IsEnum(FormatoExportacao, { message: 'Formato deve ser PDF ou XLSX.' })
  formato: FormatoExportacao;
}

/** UC-07 — Visualizar dashboard de qualidade (tela T06). */
@Controller('diagnosticos')
export class DiagnosticoController {
  constructor(private readonly diagnosticos: DiagnosticoService) {}

  @ExigeOperacao(Operacao.DIAGNOSTICO_CONSULTAR)
  @Get('versoes')
  versoes() {
    return this.diagnosticos.listarVersoes();
  }

  @ExigeOperacao(Operacao.DIAGNOSTICO_CONSULTAR)
  @Get('versoes/:versaoId')
  obter(@Param('versaoId', new ParseUUIDPipe()) versaoId: string): Promise<DiagnosticoDto> {
    return this.diagnosticos.obterDiagnostico(versaoId);
  }

  @ExigeOperacao(Operacao.DIAGNOSTICO_EXPORTAR)
  @Get('versoes/:versaoId/exportar')
  async exportar(
    @Param('versaoId', new ParseUUIDPipe()) versaoId: string,
    @Query() consulta: FormatoDto,
  ): Promise<StreamableFile> {
    const arquivo = await this.diagnosticos.exportar(versaoId, consulta.formato);
    return new StreamableFile(arquivo.conteudo, {
      type: arquivo.tipoConteudo,
      disposition: `attachment; filename="${arquivo.nomeArquivo}"`,
      length: arquivo.conteudo.length,
    });
  }
}
