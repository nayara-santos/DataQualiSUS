import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { IsUUID } from 'class-validator';
import { ExigeOperacao, UsuarioAtual } from '../auth/decoradores';
import { Operacao } from '../auth/matriz-permissoes';
import { UsuarioAutenticado } from '../auth/papel-usuario';
import { SimulacaoService } from './simulacao.service';
import { SimulacaoDto } from './simulacao.tipos';

export class SolicitarSimulacaoDto {
  @IsUUID('all', { message: 'Selecione a versão do dataset.' })
  versaoId: string;

  @IsUUID('all', { message: 'Selecione o conjunto de regras.' })
  conjuntoId: string;
}

export class FiltroSimulacoesDto {
  @IsUUID('all', { message: 'Informe a versão do dataset.' })
  versaoId: string;
}

/** UC-03 — Validar regra de tratamento (tela T04). */
@Controller('simulacoes')
export class SimulacaoController {
  constructor(private readonly simulacoes: SimulacaoService) {}

  /** 202: a simulação foi aceita e o limite de tempo começou a contar. */
  @ExigeOperacao(Operacao.SIMULACAO_EXECUTAR)
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  simular(
    @Body() dto: SolicitarSimulacaoDto,
    @UsuarioAtual() usuario: UsuarioAutenticado,
  ): Promise<SimulacaoDto> {
    return this.simulacoes.simular(dto.versaoId, dto.conjuntoId, usuario.id);
  }

  @ExigeOperacao(Operacao.SIMULACAO_CONSULTAR)
  @Get()
  listar(@Query() filtro: FiltroSimulacoesDto): Promise<SimulacaoDto[]> {
    return this.simulacoes.listarPorVersao(filtro.versaoId);
  }

  @ExigeOperacao(Operacao.SIMULACAO_CONSULTAR)
  @Get(':id')
  obter(@Param('id', new ParseUUIDPipe()) id: string): Promise<SimulacaoDto> {
    return this.simulacoes.obter(id);
  }
}
