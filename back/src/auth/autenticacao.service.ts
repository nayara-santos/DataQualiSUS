import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { CONFIGURACAO, Configuracao } from '../config/configuracao';
import { UsuarioAutenticado } from './papel-usuario';
import { SenhaService } from './senha.service';
import { SessaoRepository } from './sessao.repository';
import { UsuarioRepository } from './usuario.repository';

export const MENSAGEM_CREDENCIAIS_INVALIDAS = 'Credenciais inválidas.';

export interface ResultadoEntrada {
  token: string;
  expiraEm: Date;
  usuario: UsuarioAutenticado;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** AutenticacaoService da P2 (seção 2): entrar, criarSessao, validar e invalidar sessões. */
@Injectable()
export class AutenticacaoService {
  constructor(
    private readonly usuarios: UsuarioRepository,
    private readonly sessoes: SessaoRepository,
    private readonly senhas: SenhaService,
    @Inject(CONFIGURACAO) private readonly configuracao: Configuracao,
  ) {}

  /** UC-08, passos 1 a 3. Credenciais inválidas recebem mensagem genérica (fluxo 2a). */
  async entrar(email: string, senha: string): Promise<ResultadoEntrada> {
    const usuario = await this.usuarios.buscarPorEmail(email.trim());
    if (!usuario || !usuario.ativo) {
      await this.senhas.compararComReferencia(senha);
      throw new UnauthorizedException({
        erro: 'CREDENCIAIS_INVALIDAS',
        mensagem: MENSAGEM_CREDENCIAIS_INVALIDAS,
      });
    }
    const senhaConfere = await this.senhas.verificar(senha, usuario.senha_hash);
    if (!senhaConfere) {
      throw new UnauthorizedException({
        erro: 'CREDENCIAIS_INVALIDAS',
        mensagem: MENSAGEM_CREDENCIAIS_INVALIDAS,
      });
    }
    return this.criarSessao(usuario);
  }

  private async criarSessao(usuario: {
    id: string;
    nome: string;
    email: string;
    papel: UsuarioAutenticado['papel'];
  }): Promise<ResultadoEntrada> {
    const token = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(32).toString('base64url');
    const expiraEm = new Date(Date.now() + this.configuracao.sessaoDuracaoMinutos * 60_000);
    const sessaoId = await this.sessoes.criar({
      tokenHash: hashToken(token),
      usuarioId: usuario.id,
      papel: usuario.papel,
      csrfToken,
      expiraEm,
    });
    return {
      token,
      expiraEm,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        papel: usuario.papel,
        sessaoId,
        csrfToken,
      },
    };
  }

  /** validarSessao(cookie): devolve o usuário da sessão ou null se ausente, expirada ou encerrada. */
  async validarSessao(token: string | undefined): Promise<UsuarioAutenticado | null> {
    if (!token || token.length > 200) {
      return null;
    }
    const sessao = await this.sessoes.buscarValida(hashToken(token));
    if (!sessao) {
      return null;
    }
    return {
      id: sessao.usuario_id,
      nome: sessao.nome,
      email: sessao.email,
      papel: sessao.papel,
      sessaoId: sessao.sessao_id,
      csrfToken: sessao.csrf_token,
    };
  }

  /** invalidar(sessão): o logout encerra a sessão no servidor (UC-08, passo 5). */
  invalidar(sessaoId: string): Promise<void> {
    return this.sessoes.encerrar(sessaoId);
  }
}
