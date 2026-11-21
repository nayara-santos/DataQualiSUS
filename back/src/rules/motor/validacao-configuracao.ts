import { LIMITE_COLUNAS } from '../../datasets/limites-csv';
import { compativelComTipo, estaVazio } from './conversao';
import { REGISTRO_ACOES } from './registro-acoes';
import { obterOperador } from './registro-operadores';
import {
  ACOES_DE_ESCRITA,
  Caixa,
  colunasDaRegra,
  Combinador,
  ConfiguracaoAcao,
  ConfiguracaoRegra,
  DimensaoQualidade,
  TipoAcao,
  TipoColuna,
} from './tipos';

/** Erro de configuração apontando o campo, para que a interface indique o que corrigir (RF002). */
export interface ErroConfiguracao {
  campo: string;
  mensagem: string;
}

export const LIMITE_CONDICOES = 5;
export const LIMITE_ITENS_LISTA = 500;
export const LIMITE_MARCADORES = 20;
const LIMITE_TEXTO = 500;

export interface ContextoValidacao {
  /** Vocabulários com origem, versão e licença registradas, disponíveis para seleção. */
  vocabulariosDisponiveis: ReadonlySet<string>;
}

type Objeto = Record<string, unknown>;

function ehObjeto(valor: unknown): valor is Objeto {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function ehEnum<T extends string>(enumeracao: Record<string, T>, valor: unknown): valor is T {
  return typeof valor === 'string' && (Object.values(enumeracao) as string[]).includes(valor);
}

function textoValido(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.trim().length > 0 && valor.length <= LIMITE_TEXTO;
}

/** Normaliza constantes numéricas enviadas como número para texto (o CSV é sempre texto). */
function comoTexto(valor: unknown): unknown {
  return typeof valor === 'number' && Number.isFinite(valor) ? String(valor) : valor;
}

class Coletor {
  readonly erros: ErroConfiguracao[] = [];
  add(campo: string, mensagem: string): void {
    this.erros.push({ campo, mensagem });
  }
  chaves(objeto: Objeto, permitidas: string[], prefixo: string): void {
    for (const chave of Object.keys(objeto)) {
      if (!permitidas.includes(chave)) {
        this.add(prefixo ? `${prefixo}.${chave}` : chave, 'Campo não previsto no catálogo de regras.');
      }
    }
  }
}

function validarColunas(coletor: Coletor, colunas: unknown, minimo: number, maximo: number): void {
  if (!Array.isArray(colunas) || colunas.length < minimo) {
    coletor.add('colunas', `Selecione ao menos ${minimo} coluna.`);
    return;
  }
  if (colunas.length > maximo) {
    coletor.add('colunas', `Selecione no máximo ${maximo} colunas.`);
  }
  const nomes = new Set<string>();
  colunas.forEach((coluna, i) => {
    const campo = `colunas[${i}]`;
    if (!ehObjeto(coluna)) {
      coletor.add(campo, 'Coluna inválida.');
      return;
    }
    coletor.chaves(coluna, ['nome', 'tipo'], campo);
    if (!textoValido(coluna.nome)) {
      coletor.add(`${campo}.nome`, 'Informe o nome da coluna.');
    } else if (nomes.has(coluna.nome)) {
      coletor.add(`${campo}.nome`, 'Coluna repetida na regra.');
    } else {
      nomes.add(coluna.nome);
    }
    if (!ehEnum(TipoColuna, coluna.tipo)) {
      coletor.add(`${campo}.tipo`, 'Tipo deve ser TEXTO, DECIMAL ou DATA.');
    }
  });
}

function validarCondicoes(coletor: Coletor, configuracao: Objeto, contexto: ContextoValidacao): void {
  const { condicoes } = configuracao;
  if (!Array.isArray(condicoes) || condicoes.length === 0) {
    coletor.add('condicoes', 'Informe ao menos uma condição.');
    return;
  }
  if (condicoes.length > LIMITE_CONDICOES) {
    coletor.add('condicoes', `Cada regra admite no máximo ${LIMITE_CONDICOES} condições.`);
  }
  if (!ehEnum(Combinador, configuracao.combinador)) {
    coletor.add('combinador', 'Combine as condições exclusivamente por E ou exclusivamente por OU.');
  }
  const tiposPorColuna = new Map<string, unknown>();
  condicoes.forEach((condicao, i) => {
    const campo = `condicoes[${i}]`;
    if (!ehObjeto(condicao)) {
      coletor.add(campo, 'Condição inválida.');
      return;
    }
    coletor.chaves(condicao, ['coluna', 'tipo', 'operador', 'valor', 'valores', 'vocabularioId'], campo);
    if (!textoValido(condicao.coluna)) {
      coletor.add(`${campo}.coluna`, 'Selecione a coluna da condição.');
    }
    if (!ehEnum(TipoColuna, condicao.tipo)) {
      coletor.add(`${campo}.tipo`, 'Tipo deve ser TEXTO, DECIMAL ou DATA.');
      return;
    }
    if (typeof condicao.coluna === 'string') {
      const anterior = tiposPorColuna.get(condicao.coluna);
      if (anterior !== undefined && anterior !== condicao.tipo) {
        coletor.add(`${campo}.tipo`, 'A mesma coluna foi declarada com tipos diferentes.');
      }
      tiposPorColuna.set(condicao.coluna, condicao.tipo);
    }
    const operador = typeof condicao.operador === 'string' ? obterOperador(condicao.operador) : undefined;
    if (!operador) {
      coletor.add(`${campo}.operador`, 'Operador fora do catálogo.');
      return;
    }
    if (!operador.tipos.includes(condicao.tipo)) {
      coletor.add(
        `${campo}.operador`,
        `O operador "${operador.rotulo}" não se aplica ao tipo ${condicao.tipo}.`,
      );
      return;
    }
    const valor = comoTexto(condicao.valor);
    const temValor = valor !== undefined;
    const temValores = condicao.valores !== undefined;
    const temVocabulario = condicao.vocabularioId !== undefined;
    switch (operador.parametro) {
      case 'NENHUM':
        if (temValor || temValores || temVocabulario) {
          coletor.add(campo, `O operador "${operador.rotulo}" não recebe valor.`);
        }
        break;
      case 'CONSTANTE':
        if (typeof valor !== 'string' || estaVazio(valor) || valor.length > LIMITE_TEXTO) {
          coletor.add(`${campo}.valor`, 'Informe o valor de comparação.');
        } else if (!compativelComTipo(valor, condicao.tipo)) {
          coletor.add(`${campo}.valor`, `Valor incompatível com o tipo ${condicao.tipo}.`);
        }
        if (temValores || temVocabulario) {
          coletor.add(campo, 'A condição admite somente um valor constante.');
        }
        break;
      case 'LISTA': {
        const lista = condicao.valores;
        if (!Array.isArray(lista) || lista.length === 0) {
          coletor.add(`${campo}.valores`, 'Informe ao menos um valor da lista.');
        } else if (lista.length > LIMITE_ITENS_LISTA) {
          coletor.add(`${campo}.valores`, `A lista admite no máximo ${LIMITE_ITENS_LISTA} valores.`);
        } else if (
          lista.some((item) => typeof item !== 'string' || estaVazio(item) || item.length > LIMITE_TEXTO)
        ) {
          coletor.add(`${campo}.valores`, 'A lista contém valores vazios ou inválidos.');
        }
        if (temValor || temVocabulario) {
          coletor.add(campo, 'A condição admite somente a lista literal.');
        }
        break;
      }
      case 'VOCABULARIO':
        if (typeof condicao.vocabularioId !== 'string' || !condicao.vocabularioId) {
          coletor.add(`${campo}.vocabularioId`, 'Selecione o vocabulário oficial e a versão.');
        } else if (!contexto.vocabulariosDisponiveis.has(condicao.vocabularioId)) {
          coletor.add(
            `${campo}.vocabularioId`,
            'Vocabulário indisponível ou sem origem, versão e licença registradas: a regra fica bloqueada.',
          );
        }
        if (temValor || temValores) {
          coletor.add(campo, 'A condição de vocabulário não recebe valores literais.');
        }
        break;
    }
  });
}

function validarAcao(coletor: Coletor, acao: unknown, configuracao: Objeto): void {
  if (acao === undefined) {
    return;
  }
  if (!ehObjeto(acao)) {
    coletor.add('acao', 'Ação inválida.');
    return;
  }
  coletor.chaves(acao, ['tipo', 'coluna', 'caixa', 'valor'], 'acao');
  if (!ehEnum(TipoAcao, acao.tipo)) {
    coletor.add('acao.tipo', 'Ação fora do catálogo.');
    return;
  }
  const definicao = REGISTRO_ACOES[acao.tipo];
  const dimensao = configuracao.dimensao as DimensaoQualidade;
  if (!definicao.dimensoes.includes(dimensao)) {
    coletor.add(
      'acao.tipo',
      `A ação "${definicao.rotulo}" não se aplica a regras de ${dimensao.toLowerCase()}.`,
    );
    return;
  }
  if (acao.tipo === TipoAcao.REMOVER_REPETICOES) {
    if (acao.coluna !== undefined || acao.caixa !== undefined || acao.valor !== undefined) {
      coletor.add('acao', 'A remoção de repetições usa a chave da própria regra e não recebe parâmetros.');
    }
    return;
  }
  const colunas = colunasDaRegra(configuracao as unknown as ConfiguracaoRegra);
  const alvo = colunas.find((c) => c.nome === acao.coluna);
  if (!alvo) {
    coletor.add('acao.coluna', 'A ação deve escrever em uma das colunas da regra.');
    return;
  }
  if (!definicao.tiposColuna.includes(alvo.tipo)) {
    coletor.add('acao.coluna', `A ação "${definicao.rotulo}" exige coluna do tipo TEXTO.`);
  }
  if (acao.tipo === TipoAcao.CONVERTER_CAIXA) {
    if (!ehEnum(Caixa, acao.caixa)) {
      coletor.add('acao.caixa', 'Informe MAIUSCULAS ou MINUSCULAS.');
    }
  } else if (acao.caixa !== undefined) {
    coletor.add('acao.caixa', 'Parâmetro não previsto para esta ação.');
  }
  if (acao.tipo === TipoAcao.PREENCHER_VAZIO) {
    const valor = comoTexto(acao.valor);
    if (typeof valor !== 'string' || estaVazio(valor) || valor.length > LIMITE_TEXTO) {
      coletor.add('acao.valor', 'Informe o valor literal de preenchimento.');
    } else if (!compativelComTipo(valor, alvo.tipo)) {
      coletor.add('acao.valor', `O literal deve ser compatível com o tipo ${alvo.tipo}.`);
    } else if (
      Array.isArray(configuracao.marcadoresAusencia) &&
      (configuracao.marcadoresAusencia as unknown[]).includes(valor)
    ) {
      coletor.add('acao.valor', 'O literal não pode ser um marcador de ausência da própria regra.');
    }
  } else if (acao.valor !== undefined) {
    coletor.add('acao.valor', 'Parâmetro não previsto para esta ação.');
  }
}

/**
 * Valida a configuração de uma regra contra o catálogo da P1, seção 8.3 (validarParametros da
 * P2). Não aceita scripts, SQL, expressões regulares livres nem campos fora do esquema.
 * Devolve a configuração normalizada ou a lista de erros por campo.
 */
export function validarConfiguracaoRegra(
  entrada: unknown,
  contexto: ContextoValidacao,
): { valida: true; configuracao: ConfiguracaoRegra } | { valida: false; erros: ErroConfiguracao[] } {
  const coletor = new Coletor();
  if (!ehObjeto(entrada)) {
    return { valida: false, erros: [{ campo: 'configuracao', mensagem: 'Configuração da regra ausente.' }] };
  }
  if (!ehEnum(DimensaoQualidade, entrada.dimensao)) {
    return {
      valida: false,
      erros: [{ campo: 'dimensao', mensagem: 'Dimensão deve ser UNICIDADE, COMPLETUDE ou VALIDADE.' }],
    };
  }
  switch (entrada.dimensao) {
    case DimensaoQualidade.UNICIDADE:
      coletor.chaves(entrada, ['dimensao', 'colunas', 'acao'], '');
      validarColunas(coletor, entrada.colunas, 1, LIMITE_COLUNAS);
      break;
    case DimensaoQualidade.COMPLETUDE: {
      coletor.chaves(entrada, ['dimensao', 'colunas', 'marcadoresAusencia', 'acao'], '');
      validarColunas(coletor, entrada.colunas, 1, LIMITE_CONDICOES);
      const marcadores = entrada.marcadoresAusencia;
      if (marcadores !== undefined) {
        if (!Array.isArray(marcadores) || marcadores.length > LIMITE_MARCADORES) {
          coletor.add('marcadoresAusencia', `Informe até ${LIMITE_MARCADORES} marcadores.`);
        } else if (marcadores.some((m) => !textoValido(m))) {
          coletor.add('marcadoresAusencia', 'Marcadores de ausência devem ser textos não vazios.');
        }
      }
      break;
    }
    case DimensaoQualidade.VALIDADE:
      coletor.chaves(entrada, ['dimensao', 'combinador', 'condicoes', 'acao'], '');
      validarCondicoes(coletor, entrada, contexto);
      break;
  }
  if (coletor.erros.length === 0) {
    validarAcao(coletor, entrada.acao, entrada);
  }
  if (coletor.erros.length > 0) {
    return { valida: false, erros: coletor.erros };
  }
  return { valida: true, configuracao: normalizar(entrada) };
}

function normalizar(entrada: Objeto): ConfiguracaoRegra {
  const copia = JSON.parse(JSON.stringify(entrada)) as Objeto;
  if (Array.isArray(copia.condicoes)) {
    copia.condicoes = (copia.condicoes as Objeto[]).map((c) =>
      c.valor === undefined ? c : { ...c, valor: comoTexto(c.valor) },
    );
  }
  if (ehObjeto(copia.acao) && copia.acao.valor !== undefined) {
    copia.acao = { ...copia.acao, valor: comoTexto(copia.acao.valor) };
  }
  return copia as unknown as ConfiguracaoRegra;
}

export interface RegraDoConjunto {
  regraId: string;
  nome: string;
  configuracao: ConfiguracaoRegra;
}

/**
 * Regras de consistência do conjunto (RF002, UC-02 fluxo 6b): nomes únicos, no máximo uma ação
 * de escrita por coluna e um único tipo declarado por coluna.
 */
export function validarConjunto(regras: RegraDoConjunto[]): ErroConfiguracao[] {
  const erros: ErroConfiguracao[] = [];
  const nomes = new Map<string, string>();
  const escritas = new Map<string, string>();
  const tipos = new Map<string, { tipo: TipoColuna; regra: string }>();
  regras.forEach((regra, i) => {
    const campo = `regras[${i}]`;
    const chaveNome = regra.nome.trim().toLocaleLowerCase('pt-BR');
    if (nomes.has(chaveNome)) {
      erros.push({ campo, mensagem: `Nome de regra duplicado no conjunto: "${regra.nome}".` });
    }
    nomes.set(chaveNome, regra.regraId);
    for (const coluna of colunasDaRegra(regra.configuracao)) {
      const anterior = tipos.get(coluna.nome);
      if (anterior && anterior.tipo !== coluna.tipo) {
        erros.push({
          campo,
          mensagem: `A coluna "${coluna.nome}" está declarada como ${anterior.tipo} em "${anterior.regra}" e como ${coluna.tipo} em "${regra.nome}".`,
        });
      } else if (!anterior) {
        tipos.set(coluna.nome, { tipo: coluna.tipo, regra: regra.nome });
      }
    }
    const acao: ConfiguracaoAcao | undefined = regra.configuracao.acao;
    if (acao && ACOES_DE_ESCRITA.includes(acao.tipo) && acao.coluna) {
      const outra = escritas.get(acao.coluna);
      if (outra) {
        erros.push({
          campo,
          mensagem: `Duas ações de escrita na coluna "${acao.coluna}" ("${outra}" e "${regra.nome}") não são permitidas.`,
        });
      } else {
        escritas.set(acao.coluna, regra.nome);
      }
    }
  });
  return erros;
}

/**
 * Compatibilidade entre as regras e o cabeçalho de uma versão (UC-02/UC-03, fluxo 3a): toda
 * coluna referenciada precisa existir no CSV. Devolve as colunas ausentes por regra.
 */
export function verificarColunas(
  regras: { nome: string; configuracao: ConfiguracaoRegra }[],
  cabecalho: readonly string[],
): ErroConfiguracao[] {
  const existentes = new Set(cabecalho);
  const erros: ErroConfiguracao[] = [];
  for (const regra of regras) {
    for (const coluna of colunasDaRegra(regra.configuracao)) {
      if (!existentes.has(coluna.nome)) {
        erros.push({ campo: regra.nome, mensagem: `Coluna "${coluna.nome}" inexistente no dataset.` });
      }
    }
  }
  return erros;
}
