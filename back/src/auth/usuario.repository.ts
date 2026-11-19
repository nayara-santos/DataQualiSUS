import { Injectable } from '@nestjs/common';
import { DatabaseService, Executor } from '../database/database.service';
import { PapelUsuario } from './papel-usuario';

export interface UsuarioRegistro {
  id: string;
  nome: string;
  email: string;
  senha_hash: string;
  papel: PapelUsuario;
  ativo: boolean;
}

@Injectable()
export class UsuarioRepository {
  constructor(private readonly banco: DatabaseService) {}

  buscarPorEmail(email: string, executor?: Executor): Promise<UsuarioRegistro | null> {
    return this.banco.consultarUm<UsuarioRegistro>(
      'SELECT id, nome, email, senha_hash, papel, ativo FROM usuario WHERE lower(email) = lower($1)',
      [email],
      executor,
    );
  }

  async salvar(
    dados: { nome: string; email: string; senhaHash: string; papel: PapelUsuario },
    executor?: Executor,
  ): Promise<UsuarioRegistro> {
    const linha = await this.banco.consultarUm<UsuarioRegistro>(
      `INSERT INTO usuario (nome, email, senha_hash, papel)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (lower(email)) DO UPDATE SET nome = EXCLUDED.nome, senha_hash = EXCLUDED.senha_hash,
         papel = EXCLUDED.papel, ativo = TRUE
       RETURNING id, nome, email, senha_hash, papel, ativo`,
      [dados.nome, dados.email, dados.senhaHash, dados.papel],
      executor,
    );
    return linha as UsuarioRegistro;
  }
}
