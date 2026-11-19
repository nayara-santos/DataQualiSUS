import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Request } from 'express';
import { UsuarioAutenticado } from './papel-usuario';

export const CHAVE_ROTA_PUBLICA = 'dataqualisus:rota-publica';

/** Marca rotas que não exigem sessão (somente entrada e verificação de saúde). */
export const Publica = (): MethodDecorator & ClassDecorator => SetMetadata(CHAVE_ROTA_PUBLICA, true);

export interface RequisicaoAutenticada extends Request {
  usuario?: UsuarioAutenticado;
}

/** Injeta o usuário da sessão validada pelo AutorizacaoGuard. */
export const UsuarioAtual = createParamDecorator((_dado: unknown, contexto: ExecutionContext) => {
  const requisicao = contexto.switchToHttp().getRequest<RequisicaoAutenticada>();
  return requisicao.usuario;
});
