import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ExigeOperacao, UsuarioAtual } from '../auth/decoradores';
import { Operacao } from '../auth/matriz-permissoes';
import { UsuarioAutenticado } from '../auth/papel-usuario';
import { ArquivoRecebido, DatasetService } from './dataset.service';
import { DatasetDetalheDto, DatasetDto, PaginaRegistrosDto, VersaoDto } from './dataset.tipos';
import { AtualizarMetadadosDto, PaginacaoRegistrosDto } from './dto/atualizar-metadados.dto';
import { ImportarDatasetDto, NovaVersaoDto } from './dto/importar-dataset.dto';
import { LIMITE_BYTES } from './limites-csv';

/**
 * Upload em memória com folga de 1 KiB acima de LIMITE_BYTES: a folga permite que o ValidadorCsv
 * informe o motivo; arquivos maiores são interrompidos pelo próprio multer (413).
 */
export const OPCOES_UPLOAD = {
  storage: memoryStorage(),
  limits: { fileSize: LIMITE_BYTES + 1024, files: 1, fields: 10, fieldSize: 4096 },
};

const uuid = new ParseUUIDPipe();

/** UC-01 — Manter datasets (tela T01). */
@Controller('datasets')
export class DatasetController {
  constructor(private readonly datasets: DatasetService) {}

  @ExigeOperacao(Operacao.DATASET_IMPORTAR)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('arquivo', OPCOES_UPLOAD))
  importar(
    @UploadedFile() arquivo: ArquivoRecebido | undefined,
    @Body() dto: ImportarDatasetDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<DatasetDto> {
    return this.datasets.importar(arquivo, dto, usuario.id);
  }

  @ExigeOperacao(Operacao.DATASET_LISTAR)
  @Get()
  listar(): Promise<DatasetDto[]> {
    return this.datasets.listar();
  }

  @ExigeOperacao(Operacao.DATASET_CONSULTAR)
  @Get(':id')
  consultar(@Param('id', uuid) id: string): Promise<DatasetDetalheDto> {
    return this.datasets.consultar(id);
  }

  @ExigeOperacao(Operacao.DATASET_EDITAR_METADADOS)
  @Patch(':id')
  atualizarMetadados(@Param('id', uuid) id: string, @Body() dto: AtualizarMetadadosDto): Promise<DatasetDto> {
    return this.datasets.atualizarMetadados(id, dto);
  }

  @ExigeOperacao(Operacao.DATASET_EXCLUIR)
  @Delete(':id')
  excluir(@Param('id', uuid) id: string, @UsuarioAtual() usuario: UsuarioAutenticado): Promise<DatasetDto> {
    return this.datasets.excluirLogicamente(id, usuario.id);
  }

  @ExigeOperacao(Operacao.DATASET_NOVA_VERSAO)
  @Post(':id/versoes')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('arquivo', OPCOES_UPLOAD))
  importarNovaVersao(
    @Param('id', uuid) id: string,
    @UploadedFile() arquivo: ArquivoRecebido | undefined,
    @Body() dto: NovaVersaoDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<VersaoDto> {
    return this.datasets.importarNovaVersao(id, arquivo, dto.separador, usuario.id);
  }

  @ExigeOperacao(Operacao.DATASET_CONSULTAR)
  @Get(':id/versoes')
  listarVersoes(@Param('id', uuid) id: string): Promise<VersaoDto[]> {
    return this.datasets.listarVersoes(id);
  }

  @ExigeOperacao(Operacao.DATASET_CONSULTAR)
  @Get(':id/versoes/:versaoId/registros')
  consultarRegistros(
    @Param('id', uuid) id: string,
    @Param('versaoId', uuid) versaoId: string,
    @Query() paginacao: PaginacaoRegistrosDto,
  ): Promise<PaginaRegistrosDto> {
    return this.datasets.consultarRegistros(id, versaoId, paginacao.pagina, paginacao.tamanho);
  }
}
