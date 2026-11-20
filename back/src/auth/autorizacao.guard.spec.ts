import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AutenticacaoService } from './autenticacao.service';
import { AutorizacaoGuard } from './autorizacao.guard';
import { NOME_COOKIE_SESSAO } from './cookie-sessao';
import { CHAVE_OPERACAO, CHAVE_ROTA_PUBLICA } from './decoradores';
import { Operacao } from './matriz-permissoes';
import { PapelUsuario, UsuarioAutenticado } from './papel-usuario';

function criarContexto(requisicao: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => function rota() {},
    getClass: () => class Controlador {},
    switchToHttp: () => ({ getRequest: () => requisicao }),
  } as unknown as ExecutionContext;
}

function usuarioCom(papel: PapelUsuario): UsuarioAutenticado {
  return { id: 'u1', nome: 'Ana', email: 'a@t', papel, sessaoId: 's1', csrfToken: 'csrf-correto' };
}

describe('AutorizacaoGuard', () => {
  let reflector: Reflector;
  let metadados: Record<string, unknown>;
  let autenticacao: jest.Mocked<Pick<AutenticacaoService, 'validarSessao'>>;
  let guard: AutorizacaoGuard;

  const requisicao = (metodo: string, csrf?: string): Record<string, unknown> => ({
    method: metodo,
    cookies: { [NOME_COOKIE_SESSAO]: 'tok' },
    headers: csrf ? { 'x-csrf-token': csrf } : {},
  });

  beforeEach(() => {
    metadados = {};
    reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((chave) => metadados[chave as string]);
    autenticacao = { validarSessao: jest.fn() };
    guard = new AutorizacaoGuard(reflector, autenticacao as unknown as AutenticacaoService);
  });

  it('libera rota pública sem consultar sessão', async () => {
    metadados[CHAVE_ROTA_PUBLICA] = true;
    await expect(guard.canActivate(criarContexto({}))).resolves.toBe(true);
    expect(autenticacao.validarSessao).not.toHaveBeenCalled();
  });

  it('recusa com 401 quando não há sessão válida', async () => {
    metadados[CHAVE_OPERACAO] = Operacao.DATASET_LISTAR;
    autenticacao.validarSessao.mockResolvedValue(null);
    await expect(guard.canActivate(criarContexto({ cookies: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('autoriza operação permitida ao perfil e anexa o usuário', async () => {
    metadados[CHAVE_OPERACAO] = Operacao.DATASET_LISTAR;
    const usuario = usuarioCom(PapelUsuario.ANALISTA);
    autenticacao.validarSessao.mockResolvedValue(usuario);
    const req = requisicao('GET');
    await expect(guard.canActivate(criarContexto(req))).resolves.toBe(true);
    expect(req.usuario).toBe(usuario);
  });

  it('recusa com 403 operação vedada ao perfil', async () => {
    metadados[CHAVE_OPERACAO] = Operacao.TRATAMENTO_APLICAR;
    autenticacao.validarSessao.mockResolvedValue(usuarioCom(PapelUsuario.GESTOR));
    const erro = await guard.canActivate(criarContexto(requisicao('POST', 'csrf-correto'))).catch((e) => e);
    expect(erro).toBeInstanceOf(ForbiddenException);
    expect(erro.getResponse().erro).toBe('OPERACAO_NAO_PERMITIDA');
  });

  it('nega por padrão rota protegida sem operação declarada', async () => {
    autenticacao.validarSessao.mockResolvedValue(usuarioCom(PapelUsuario.ANALISTA));
    await expect(guard.canActivate(criarContexto(requisicao('GET')))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('exige token CSRF correto em %s', async (metodo) => {
    metadados[CHAVE_OPERACAO] = Operacao.DATASET_IMPORTAR;
    autenticacao.validarSessao.mockResolvedValue(usuarioCom(PapelUsuario.ANALISTA));
    for (const csrf of [undefined, 'csrf-errado', 'csrf-corret']) {
      const erro = await guard.canActivate(criarContexto(requisicao(metodo, csrf))).catch((e) => e);
      expect(erro).toBeInstanceOf(ForbiddenException);
      expect(erro.getResponse().erro).toBe('CSRF_INVALIDO');
    }
    await expect(guard.canActivate(criarContexto(requisicao(metodo, 'csrf-correto')))).resolves.toBe(true);
  });

  it('não exige CSRF em GET', async () => {
    metadados[CHAVE_OPERACAO] = Operacao.AUDITORIA_CONSULTAR;
    autenticacao.validarSessao.mockResolvedValue(usuarioCom(PapelUsuario.EQUIPE_TECNICA));
    await expect(guard.canActivate(criarContexto(requisicao('GET')))).resolves.toBe(true);
  });
});
