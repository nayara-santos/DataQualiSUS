import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ExigeOperacao, UsuarioAtual } from '../auth/decoradores';
import { Operacao } from '../auth/matriz-permissoes';
import { UsuarioAutenticado } from '../auth/papel-usuario';
import { descreverCatalogo } from './catalogo';
import { ConjuntoService } from './conjunto.service';
import { AtualizarConjuntoDto, AtualizarRegraDto, CriarConjuntoDto, CriarRegraDto } from './dto/regra.dto';
import { RegraService } from './regra.service';
import { ConjuntoDto, RegraDto } from './regras.tipos';

const uuid = new ParseUUIDPipe();

/** UC-02 — Configurar regras visuais (telas T02 e T03). */
@Controller()
export class RegrasController {
  constructor(
    private readonly regras: RegraService,
    private readonly conjuntos: ConjuntoService,
  ) {}

  @ExigeOperacao(Operacao.REGRA_CONSULTAR)
  @Get('catalogo')
  catalogo() {
    return descreverCatalogo();
  }

  @ExigeOperacao(Operacao.REGRA_MANTER)
  @Post('regras')
  @HttpCode(HttpStatus.CREATED)
  criarRegra(@Body() dto: CriarRegraDto, @UsuarioAtual() usuario: UsuarioAutenticado): Promise<RegraDto> {
    return this.regras.criar(dto, usuario.id);
  }

  @ExigeOperacao(Operacao.REGRA_CONSULTAR)
  @Get('regras')
  listarRegras(): Promise<RegraDto[]> {
    return this.regras.listar();
  }

  @ExigeOperacao(Operacao.REGRA_CONSULTAR)
  @Get('regras/:id')
  obterRegra(@Param('id', uuid) id: string): Promise<RegraDto> {
    return this.regras.obter(id);
  }

  @ExigeOperacao(Operacao.REGRA_CONSULTAR)
  @Get('regras/:id/revisoes')
  revisoesRegra(@Param('id', uuid) id: string) {
    return this.regras.listarRevisoes(id);
  }

  @ExigeOperacao(Operacao.REGRA_MANTER)
  @Put('regras/:id')
  atualizarRegra(
    @Param('id', uuid) id: string,
    @Body() dto: AtualizarRegraDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<RegraDto> {
    return this.regras.atualizar(id, dto, usuario.id);
  }

  @ExigeOperacao(Operacao.REGRA_MANTER)
  @Delete('regras/:id')
  excluirRegra(@Param('id', uuid) id: string): Promise<RegraDto> {
    return this.regras.excluir(id);
  }

  @ExigeOperacao(Operacao.CONJUNTO_MANTER)
  @Post('conjuntos')
  @HttpCode(HttpStatus.CREATED)
  criarConjunto(
    @Body() dto: CriarConjuntoDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<ConjuntoDto> {
    return this.conjuntos.criar(dto, usuario.id);
  }

  @ExigeOperacao(Operacao.CONJUNTO_CONSULTAR)
  @Get('conjuntos')
  listarConjuntos(): Promise<ConjuntoDto[]> {
    return this.conjuntos.listar();
  }

  @ExigeOperacao(Operacao.CONJUNTO_CONSULTAR)
  @Get('conjuntos/:id')
  obterConjunto(@Param('id', uuid) id: string): Promise<ConjuntoDto> {
    return this.conjuntos.obter(id);
  }

  @ExigeOperacao(Operacao.CONJUNTO_CONSULTAR)
  @Get('conjuntos/:id/revisoes')
  revisoesConjunto(@Param('id', uuid) id: string) {
    return this.conjuntos.listarRevisoes(id);
  }

  @ExigeOperacao(Operacao.CONJUNTO_MANTER)
  @Put('conjuntos/:id')
  atualizarConjunto(
    @Param('id', uuid) id: string,
    @Body() dto: AtualizarConjuntoDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<ConjuntoDto> {
    return this.conjuntos.atualizar(id, dto, usuario.id);
  }

  @ExigeOperacao(Operacao.CONJUNTO_MANTER)
  @Delete('conjuntos/:id')
  excluirConjunto(@Param('id', uuid) id: string): Promise<ConjuntoDto> {
    return this.conjuntos.excluir(id);
  }

  @ExigeOperacao(Operacao.CONJUNTO_ASSOCIAR)
  @Put('conjuntos/:id/datasets/:datasetId')
  associar(
    @Param('id', uuid) id: string,
    @Param('datasetId', uuid) datasetId: string,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<ConjuntoDto> {
    return this.conjuntos.associar(id, datasetId, usuario.id);
  }

  @ExigeOperacao(Operacao.CONJUNTO_ASSOCIAR)
  @Delete('conjuntos/:id/datasets/:datasetId')
  desassociar(
    @Param('id', uuid) id: string,
    @Param('datasetId', uuid) datasetId: string,
  ): Promise<ConjuntoDto> {
    return this.conjuntos.desassociar(id, datasetId);
  }
}
