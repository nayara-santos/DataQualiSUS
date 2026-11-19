import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AutenticacaoService } from './autenticacao.service';
import { NOME_COOKIE_SESSAO } from './cookie-sessao';
import { CHAVE_ROTA_PUBLICA, RequisicaoAutenticada } from './decoradores';

/**
 * AutorizacaoGuard (P2, seção 2): aplicado globalmente, valida a sessão no servidor em toda
 * rota que não seja explicitamente pública. Sessão ausente, expirada ou encerrada recebe 401.
 */
@Injectable()
export class AutorizacaoGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly autenticacao: AutenticacaoService,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const alvos = [contexto.getHandler(), contexto.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(CHAVE_ROTA_PUBLICA, alvos)) {
      return true;
    }
    const requisicao = contexto.switchToHttp().getRequest<RequisicaoAutenticada>();
    const token = (requisicao.cookies as Record<string, string> | undefined)?.[NOME_COOKIE_SESSAO];
    const usuario = await this.autenticacao.validarSessao(token);
    if (!usuario) {
      throw new UnauthorizedException({
        erro: 'SESSAO_INVALIDA',
        mensagem: 'Sessão ausente ou encerrada. Entre novamente.',
      });
    }
    requisicao.usuario = usuario;
    return true;
  }
}
