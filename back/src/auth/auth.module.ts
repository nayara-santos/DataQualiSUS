import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AutenticacaoController } from './autenticacao.controller';
import { AutenticacaoService } from './autenticacao.service';
import { AutorizacaoGuard } from './autorizacao.guard';
import { SenhaService } from './senha.service';
import { SessaoRepository } from './sessao.repository';
import { UsuarioRepository } from './usuario.repository';

@Module({
  controllers: [AutenticacaoController],
  providers: [
    AutenticacaoService,
    SenhaService,
    SessaoRepository,
    UsuarioRepository,
    { provide: APP_GUARD, useClass: AutorizacaoGuard },
  ],
  exports: [AutenticacaoService, SenhaService, UsuarioRepository],
})
export class AuthModule {}
