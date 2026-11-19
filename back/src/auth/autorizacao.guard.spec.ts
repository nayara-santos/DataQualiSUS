import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AutenticacaoService } from './autenticacao.service';
import { AutorizacaoGuard } from './autorizacao.guard';
import { NOME_COOKIE_SESSAO } from './cookie-sessao';
import { PapelUsuario, UsuarioAutenticado } from './papel-usuario';

export function criarContexto(requisicao: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => function rota() {},
    getClass: () => class Controlador {},
    switchToHttp: () => ({ getRequest: () => requisicao }),
  } as unknown as ExecutionContext;
}

describe('AutorizacaoGuard — sessão', () => {
  const usuario: UsuarioAutenticado = {
    id: 'u1',
    nome: 'Ana',
    email: 'a@t',
    papel: PapelUsuario.ANALISTA,
    sessaoId: 's1',
    csrfToken: 'c',
  };
  let reflector: Reflector;
  let autenticacao: jest.Mocked<Pick<AutenticacaoService, 'validarSessao'>>;
  let guard: AutorizacaoGuard;

  beforeEach(() => {
    reflector = new Reflector();
    autenticacao = { validarSessao: jest.fn() };
    guard = new AutorizacaoGuard(reflector, autenticacao as unknown as AutenticacaoService);
  });

  it('libera rota pública sem consultar sessão', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    await expect(guard.canActivate(criarContexto({}))).resolves.toBe(true);
    expect(autenticacao.validarSessao).not.toHaveBeenCalled();
  });

  it('recusa com 401 quando não há cookie de sessão', async () => {
    autenticacao.validarSessao.mockResolvedValue(null);
    await expect(guard.canActivate(criarContexto({ cookies: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('anexa o usuário da sessão válida à requisição', async () => {
    autenticacao.validarSessao.mockResolvedValue(usuario);
    const requisicao: Record<string, unknown> = { cookies: { [NOME_COOKIE_SESSAO]: 'tok' }, method: 'GET' };
    await expect(guard.canActivate(criarContexto(requisicao))).resolves.toBe(true);
    expect(autenticacao.validarSessao).toHaveBeenCalledWith('tok');
    expect(requisicao.usuario).toBe(usuario);
  });
});
