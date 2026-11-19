import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { PapelUsuario } from './papel-usuario';

export interface SessaoValida {
  sessao_id: string;
  csrf_token: string;
  usuario_id: string;
  nome: string;
  email: string;
  papel: PapelUsuario;
}

/** Persistência das sessões no PostgreSQL (ADR-006). */
@Injectable()
export class SessaoRepository {
  constructor(private readonly banco: DatabaseService) {}

  async criar(dados: {
    tokenHash: string;
    usuarioId: string;
    papel: PapelUsuario;
    csrfToken: string;
    expiraEm: Date;
  }): Promise<string> {
    const linha = await this.banco.consultarUm<{ id: string }>(
      `INSERT INTO sessao (token_hash, usuario_id, papel, csrf_token, expira_em)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [dados.tokenHash, dados.usuarioId, dados.papel, dados.csrfToken, dados.expiraEm],
    );
    return (linha as { id: string }).id;
  }

  /**
   * Retorna a sessão somente se não estiver encerrada nem expirada e se o usuário seguir ativo.
   * O acesso também atualiza o instante do último uso.
   */
  buscarValida(tokenHash: string): Promise<SessaoValida | null> {
    return this.banco.consultarUm<SessaoValida>(
      `UPDATE sessao s SET ultimo_acesso_em = now()
         FROM usuario u
        WHERE s.token_hash = $1
          AND s.usuario_id = u.id
          AND u.ativo
          AND s.encerrada_em IS NULL
          AND s.expira_em > now()
       RETURNING s.id AS sessao_id, s.csrf_token, u.id AS usuario_id, u.nome, u.email, s.papel`,
      [tokenHash],
    );
  }

  async encerrar(sessaoId: string): Promise<void> {
    await this.banco.consultar(
      'UPDATE sessao SET encerrada_em = now() WHERE id = $1 AND encerrada_em IS NULL',
      [sessaoId],
    );
  }
}
