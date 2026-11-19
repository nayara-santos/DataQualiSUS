import { Body, Controller, Get, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { AutenticacaoService } from './autenticacao.service';
import { NOME_COOKIE_SESSAO, opcoesCookieSessao } from './cookie-sessao';
import { Publica, UsuarioAtual } from './decoradores';
import { EntrarDto } from './dto/entrar.dto';
import { UsuarioAutenticado } from './papel-usuario';

interface SessaoDto {
  usuario: { id: string; nome: string; email: string; papel: string };
  csrfToken: string;
}

function paraSessaoDto(usuario: UsuarioAutenticado): SessaoDto {
  return {
    usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, papel: usuario.papel },
    csrfToken: usuario.csrfToken,
  };
}

/** UC-08 — Autenticar e encerrar sessão (tela T00). */
@Controller('auth')
export class AutenticacaoController {
  constructor(private readonly autenticacao: AutenticacaoService) {}

  @Publica()
  @Post('entrar')
  @HttpCode(HttpStatus.OK)
  async entrar(@Body() dto: EntrarDto, @Res({ passthrough: true }) resposta: Response): Promise<SessaoDto> {
    const resultado = await this.autenticacao.entrar(dto.email, dto.senha);
    resposta.cookie(NOME_COOKIE_SESSAO, resultado.token, opcoesCookieSessao(resultado.expiraEm));
    return paraSessaoDto(resultado.usuario);
  }

  @Get('sessao')
  sessao(@UsuarioAtual() usuario: UsuarioAutenticado): SessaoDto {
    return paraSessaoDto(usuario);
  }

  @Post('sair')
  @HttpCode(HttpStatus.NO_CONTENT)
  async sair(
    @UsuarioAtual() usuario: UsuarioAutenticado,
    @Res({ passthrough: true }) resposta: Response,
  ): Promise<void> {
    await this.autenticacao.invalidar(usuario.sessaoId);
    resposta.clearCookie(NOME_COOKIE_SESSAO, opcoesCookieSessao());
  }
}
