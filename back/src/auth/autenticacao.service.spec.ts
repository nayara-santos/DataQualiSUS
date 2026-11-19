import { UnauthorizedException } from '@nestjs/common';
import { Configuracao } from '../config/configuracao';
import { AutenticacaoService, hashToken, MENSAGEM_CREDENCIAIS_INVALIDAS } from './autenticacao.service';
import { PapelUsuario } from './papel-usuario';
import { SenhaService } from './senha.service';
import { SessaoRepository } from './sessao.repository';
import { UsuarioRegistro, UsuarioRepository } from './usuario.repository';

const configuracao = { sessaoDuracaoMinutos: 60, bcryptCusto: 4 } as Configuracao;

describe('AutenticacaoService', () => {
  let usuarios: jest.Mocked<Pick<UsuarioRepository, 'buscarPorEmail'>>;
  let sessoes: jest.Mocked<Pick<SessaoRepository, 'criar' | 'buscarValida' | 'encerrar'>>;
  let senhas: SenhaService;
  let servico: AutenticacaoService;
  let usuario: UsuarioRegistro;

  beforeEach(async () => {
    senhas = new SenhaService(configuracao);
    usuario = {
      id: 'u1',
      nome: 'Ana',
      email: 'ana@teste.local',
      senha_hash: await senhas.gerarHash('senha-correta'),
      papel: PapelUsuario.ANALISTA,
      ativo: true,
    };
    usuarios = { buscarPorEmail: jest.fn() };
    sessoes = { criar: jest.fn().mockResolvedValue('s1'), buscarValida: jest.fn(), encerrar: jest.fn() };
    servico = new AutenticacaoService(
      usuarios as unknown as UsuarioRepository,
      sessoes as unknown as SessaoRepository,
      senhas,
      configuracao,
    );
  });

  it('cria sessão vinculada ao usuário e ao perfil com credenciais válidas', async () => {
    usuarios.buscarPorEmail.mockResolvedValue(usuario);
    const resultado = await servico.entrar(' ana@teste.local ', 'senha-correta');

    expect(usuarios.buscarPorEmail).toHaveBeenCalledWith('ana@teste.local');
    expect(resultado.usuario).toMatchObject({ id: 'u1', papel: PapelUsuario.ANALISTA, sessaoId: 's1' });
    expect(resultado.token).toHaveLength(43);
    const criada = sessoes.criar.mock.calls[0][0];
    // O banco recebe somente o hash do token, nunca o token do cookie.
    expect(criada.tokenHash).toBe(hashToken(resultado.token));
    expect(criada.tokenHash).not.toBe(resultado.token);
    expect(criada.papel).toBe(PapelUsuario.ANALISTA);
    expect(criada.expiraEm.getTime() - Date.now()).toBeGreaterThan(59 * 60_000);
  });

  it('gera tokens de sessão e CSRF distintos a cada entrada', async () => {
    usuarios.buscarPorEmail.mockResolvedValue(usuario);
    const a = await servico.entrar(usuario.email, 'senha-correta');
    const b = await servico.entrar(usuario.email, 'senha-correta');
    expect(a.token).not.toBe(b.token);
    expect(a.usuario.csrfToken).not.toBe(b.usuario.csrfToken);
  });

  it.each([
    ['senha incorreta', true, 'outra-senha'],
    ['e-mail inexistente', false, 'senha-correta'],
  ])('rejeita %s com a mesma mensagem genérica', async (_caso, existe, senha) => {
    usuarios.buscarPorEmail.mockResolvedValue(existe ? usuario : null);
    const erro = await servico.entrar('ana@teste.local', senha).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(UnauthorizedException);
    expect((erro as UnauthorizedException).getResponse()).toEqual({
      erro: 'CREDENCIAIS_INVALIDAS',
      mensagem: MENSAGEM_CREDENCIAIS_INVALIDAS,
    });
    expect(sessoes.criar).not.toHaveBeenCalled();
  });

  it('rejeita conta desativada', async () => {
    usuarios.buscarPorEmail.mockResolvedValue({ ...usuario, ativo: false });
    await expect(servico.entrar(usuario.email, 'senha-correta')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('valida sessão pelo hash do token e devolve o usuário', async () => {
    sessoes.buscarValida.mockResolvedValue({
      sessao_id: 's1',
      csrf_token: 'c',
      usuario_id: 'u1',
      nome: 'Ana',
      email: 'ana@teste.local',
      papel: PapelUsuario.GESTOR,
    });
    const autenticado = await servico.validarSessao('token-abc');
    expect(sessoes.buscarValida).toHaveBeenCalledWith(hashToken('token-abc'));
    expect(autenticado).toEqual({
      id: 'u1',
      nome: 'Ana',
      email: 'ana@teste.local',
      papel: PapelUsuario.GESTOR,
      sessaoId: 's1',
      csrfToken: 'c',
    });
  });

  it.each([undefined, '', 'x'.repeat(201)])(
    'trata token ausente ou anômalo (%p) como sessão inválida',
    async (token) => {
      expect(await servico.validarSessao(token)).toBeNull();
      expect(sessoes.buscarValida).not.toHaveBeenCalled();
    },
  );

  it('devolve null quando a sessão foi encerrada ou expirou', async () => {
    sessoes.buscarValida.mockResolvedValue(null);
    expect(await servico.validarSessao('token')).toBeNull();
  });

  it('invalida a sessão no logout', async () => {
    await servico.invalidar('s1');
    expect(sessoes.encerrar).toHaveBeenCalledWith('s1');
  });
});
