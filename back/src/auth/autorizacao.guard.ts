import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'crypto';
import { AutenticacaoService } from './autenticacao.service';
import { NOME_COOKIE_SESSAO } from './cookie-sessao';
import { CHAVE_OPERACAO, CHAVE_ROTA_PUBLICA, RequisicaoAutenticada } from './decoradores';
import { Operacao, verificarPermissao } from './matriz-permissoes';

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);
export const CABECALHO_CSRF = 'x-csrf-token';

function tokensIguais(recebido: string | undefined, esperado: string): boolean {
  if (!recebido) {
    return false;
  }
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * AutorizacaoGuard (P2, seção 2 e DS4), aplicado globalmente a todas as rotas:
 * 1. validarSessao(cookie): sessão ausente, expirada ou encerrada → 401;
 * 2. token CSRF obrigatório em métodos que alteram estado → 403;
 * 3. verificarPermissao(perfil, operação) pela matriz da P1, seção 8.3 → 403.
 * Rotas sem operação declarada são negadas (falha fechada), mitigando o risco de rota sem guarda.
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

    if (!METODOS_SEGUROS.has((requisicao.method ?? 'GET').toUpperCase())) {
      const recebido = requisicao.headers?.[CABECALHO_CSRF];
      if (!tokensIguais(Array.isArray(recebido) ? recebido[0] : recebido, usuario.csrfToken)) {
        throw new ForbiddenException({
          erro: 'CSRF_INVALIDO',
          mensagem: 'Token CSRF ausente ou inválido. Recarregue a sessão e tente novamente.',
        });
      }
    }

    const operacao = this.reflector.getAllAndOverride<Operacao | undefined>(CHAVE_OPERACAO, alvos);
    if (!verificarPermissao(usuario.papel, operacao)) {
      throw new ForbiddenException({
        erro: 'OPERACAO_NAO_PERMITIDA',
        mensagem: 'Operação não permitida para o seu perfil.',
      });
    }
    return true;
  }
}
