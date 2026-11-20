import { Body, Controller, HttpCode, HttpStatus, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ExigeOperacao, UsuarioAtual } from '../auth/decoradores';
import { Operacao } from '../auth/matriz-permissoes';
import { UsuarioAutenticado } from '../auth/papel-usuario';
import { ArquivoRecebido, DatasetService } from './dataset.service';
import { DatasetDto } from './dataset.tipos';
import { ImportarDatasetDto } from './dto/importar-dataset.dto';
import { LIMITE_BYTES } from './limites-csv';

/**
 * Upload em memória com folga de 1 KiB acima de LIMITE_BYTES: a folga permite que o ValidadorCsv
 * informe o motivo; arquivos maiores são interrompidos pelo próprio multer (413).
 */
export const OPCOES_UPLOAD = {
  storage: memoryStorage(),
  limits: { fileSize: LIMITE_BYTES + 1024, files: 1, fields: 10, fieldSize: 4096 },
};

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
}
