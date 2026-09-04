import { specLista, specNumero, specTexto } from "../specs/validation";

import { avaliarCompatibilidade } from "./engine";
import { estimarConsumo, recomendarFonte } from "./rules";
import type {
  Componente,
  MontagemCandidata,
  ResultadoDeCompatibilidade,
  VerificacaoManual,
} from "./types";

/**
 * Sugestão de montagens a partir do estoque (seção 6).
 *
 * O problema é combinatório: com 50 peças, testar todas as combinações são
 * milhões de avaliações. A abordagem aqui é diferente e proposital:
 *
 * 1. o par **processador + placa-mãe** define a plataforma e elimina de saída
 *    a maior parte do espaço de busca (socket incompatível some);
 * 2. para cada par viável, as demais peças são escolhidas por preferência —
 *    a melhor GPU que cabe, a fonte mais justa que aguenta;
 * 3. cada peça usada sai do estoque disponível, para que duas sugestões nunca
 *    prometam a mesma unidade.
 *
 * Não é busca ótima, e não precisa ser: o objetivo é responder "o que dá para
 * montar hoje", não encontrar a combinação matematicamente perfeita.
 */

export interface EstoqueParaMontagem {
  cpus: Componente[];
  motherboards: Componente[];
  rams: Componente[];
  gpus: Componente[];
  storages: Componente[];
  psus: Componente[];
  cases: Componente[];
  coolers: Componente[];
}

export type NivelDaMaquina =
  | "Básico"
  | "Escritório"
  | "Gamer de entrada"
  | "Gamer intermediário"
  | "Gamer avançado"
  | "Workstation";

export interface MontagemSugerida {
  montagem: MontagemCandidata;
  compatibilidade: ResultadoDeCompatibilidade;
  nivel: NivelDaMaquina;
  usosRecomendados: string[];
  /** Quanto maior, melhor a máquina. Usado só para ordenar. */
  pontuacao: number;
  /** Papéis que faltaram e impediram uma montagem completa. */
  faltando: string[];
}

function vazio(): MontagemCandidata {
  return { ram: [], storage: [] };
}

/** Remove de uma lista as peças já usadas em outra montagem. */
function disponiveis(
  pecas: readonly Componente[],
  usadas: ReadonlySet<string>,
): Componente[] {
  return pecas.filter((peca) => !usadas.has(peca.id));
}

/**
 * Classifica a máquina.
 *
 * Baseada na VRAM da placa de vídeo e nos núcleos do processador — os dois
 * fatores que mais determinam para que serve o computador na prática.
 */
function classificar(montagem: MontagemCandidata): {
  nivel: NivelDaMaquina;
  usos: string[];
} {
  const nucleos = specNumero(montagem.cpu?.specs, "cores") ?? 0;
  const vram = specNumero(montagem.gpu?.specs, "vramGb") ?? 0;
  const temGpu = Boolean(montagem.gpu);
  const memoriaGb = montagem.ram.reduce((soma, pente) => {
    const porModulo = specNumero(pente.specs, "capacityGb") ?? 0;
    return soma + porModulo * (specNumero(pente.specs, "modules") ?? 1);
  }, 0);

  if (!temGpu) {
    return nucleos >= 6
      ? { nivel: "Escritório", usos: ["Escritório", "Estudos", "Programação"] }
      : { nivel: "Básico", usos: ["Computador básico", "Escritório"] };
  }

  if (vram >= 12 && nucleos >= 8 && memoriaGb >= 32) {
    return {
      nivel: "Workstation",
      usos: ["Workstation", "Edição de vídeo", "Programação"],
    };
  }

  if (vram >= 12 || (vram >= 8 && nucleos >= 8)) {
    return {
      nivel: "Gamer avançado",
      usos: ["Gamer avançado", "Edição de vídeo"],
    };
  }

  if (vram >= 8 || nucleos >= 6) {
    return {
      nivel: "Gamer intermediário",
      usos: ["Gamer intermediário", "Programação", "Estudos"],
    };
  }

  return { nivel: "Gamer de entrada", usos: ["Gamer de entrada", "Estudos"] };
}

/** Pontuação usada só para ordenar as sugestões da melhor para a pior. */
function pontuar(
  montagem: MontagemCandidata,
  compatibilidade: ResultadoDeCompatibilidade,
): number {
  let pontos = 0;

  pontos += (specNumero(montagem.cpu?.specs, "cores") ?? 0) * 8;
  pontos += (specNumero(montagem.gpu?.specs, "vramGb") ?? 0) * 10;
  pontos += montagem.ram.reduce((soma, pente) => {
    const porModulo = specNumero(pente.specs, "capacityGb") ?? 0;
    return soma + porModulo * (specNumero(pente.specs, "modules") ?? 1);
  }, 0);
  pontos += montagem.storage.length * 5;

  // Uma máquina que "precisa verificar" vale menos que uma confirmada: a
  // ordenação precisa colocar o que dá para montar hoje no topo.
  if (compatibilidade.nivel === "NEEDS_VERIFICATION") pontos -= 40;
  if (compatibilidade.nivel === "LIKELY_COMPATIBLE") pontos -= 15;

  return Math.round(pontos);
}

/** Escolhe a melhor peça segundo um critério, entre as que passam num filtro. */
function melhor(
  pecas: readonly Componente[],
  aceita: (peca: Componente) => boolean,
  valor: (peca: Componente) => number,
): Componente | undefined {
  return pecas
    .filter(aceita)
    .sort((a, b) => valor(b) - valor(a))
    .at(0);
}

/**
 * Monta uma máquina em torno de um par processador + placa-mãe.
 *
 * Devolve `null` quando o par sequer é viável (socket diferente), para que o
 * chamador nem gaste avaliação com ele.
 */
function montarEmTornoDe(
  cpu: Componente,
  motherboard: Componente,
  estoque: EstoqueParaMontagem,
): MontagemCandidata | null {
  const socketCpu = specTexto(cpu.specs, "socket");
  const socketPlaca = specTexto(motherboard.specs, "socket");

  // Sem socket cadastrado o par não é descartado: vira uma montagem que o
  // motor marcará como "precisa verificar", que é a resposta honesta.
  if (socketCpu && socketPlaca && socketCpu !== socketPlaca) return null;

  const montagem = vazio();
  montagem.cpu = cpu;
  montagem.motherboard = motherboard;

  const tipoMemoria = specTexto(motherboard.specs, "memoryType");
  const slots = specNumero(motherboard.specs, "ramSlots") ?? 2;

  // Memória: pega os pentes compatíveis, do maior para o menor, até encher os
  // slots. Preferir capacidade grande evita ocupar quatro slots com 4 GB.
  const compativeis = estoque.rams
    .filter((pente) => {
      if (specTexto(pente.specs, "formFactor") === "SO-DIMM") return false;
      const tipo = specTexto(pente.specs, "memoryType");
      return !tipoMemoria || !tipo || tipo === tipoMemoria;
    })
    .sort(
      (a, b) =>
        (specNumero(b.specs, "capacityGb") ?? 0) -
        (specNumero(a.specs, "capacityGb") ?? 0),
    );

  let modulosUsados = 0;
  for (const pente of compativeis) {
    const modulos = specNumero(pente.specs, "modules") ?? 1;
    if (modulosUsados + modulos > slots) continue;
    montagem.ram.push(pente);
    modulosUsados += modulos;
  }

  // Gabinete primeiro: ele limita a GPU e o cooler.
  montagem.case = melhor(
    estoque.cases,
    () => true,
    (gabinete) => specNumero(gabinete.specs, "maxGpuLengthMm") ?? 0,
  );

  const limiteGpu = specNumero(montagem.case?.specs, "maxGpuLengthMm");

  // Só coloca placa de vídeo dedicada se ela couber. Quando o processador tem
  // vídeo integrado, ficar sem GPU é uma máquina válida, não uma incompleta.
  montagem.gpu = melhor(
    estoque.gpus,
    (gpu) => {
      const comprimento = specNumero(gpu.specs, "lengthMm");
      if (limiteGpu === undefined || comprimento === undefined) return true;
      return comprimento <= limiteGpu;
    },
    (gpu) => specNumero(gpu.specs, "vramGb") ?? 0,
  );

  // Sem GPU e sem vídeo integrado a máquina não dá imagem. A montagem é
  // devolvida assim mesmo: o motor aponta exatamente esse problema, e o
  // usuário fica sabendo o que precisa comprar em vez de a sugestão sumir.

  const slotsM2 = specNumero(motherboard.specs, "m2Slots") ?? 1;
  const portasSata = specNumero(motherboard.specs, "sataPorts") ?? 2;
  let nvmeUsados = 0;
  let sataUsados = 0;

  // Armazenamento: SSD antes de HD, e o maior primeiro.
  const discos = [...estoque.storages].sort((a, b) => {
    const tipoA = specTexto(a.specs, "driveType") === "SSD" ? 1 : 0;
    const tipoB = specTexto(b.specs, "driveType") === "SSD" ? 1 : 0;
    if (tipoA !== tipoB) return tipoB - tipoA;
    return (specNumero(b.specs, "capacityGb") ?? 0) - (specNumero(a.specs, "capacityGb") ?? 0);
  });

  for (const disco of discos) {
    const interfaceDisco = specTexto(disco.specs, "interface") ?? "";
    if (interfaceDisco.startsWith("NVMe")) {
      if (nvmeUsados >= slotsM2) continue;
      nvmeUsados += 1;
    } else if (interfaceDisco === "SATA III") {
      if (sataUsados >= portasSata) continue;
      sataUsados += 1;
    } else {
      continue;
    }
    montagem.storage.push(disco);
    // Duas unidades de armazenamento bastam para uma máquina de venda; mais
    // que isso encarece sem agregar.
    if (montagem.storage.length >= 2) break;
  }

  // Cooler: só o que serve no socket e cabe no gabinete.
  const alturaMaxima = specNumero(montagem.case?.specs, "maxCoolerHeightMm");
  montagem.cooler = melhor(
    estoque.coolers,
    (cooler) => {
      const suportados = specLista(cooler.specs, "socketSupport");
      if (socketCpu && suportados.length > 0 && !suportados.includes(socketCpu)) {
        return false;
      }
      const altura = specNumero(cooler.specs, "heightMm");
      if (alturaMaxima !== undefined && altura !== undefined) {
        return altura <= alturaMaxima;
      }
      return true;
    },
    (cooler) => specNumero(cooler.specs, "tdpRatingWatts") ?? 0,
  );

  /*
   * Fonte por último: só aqui o consumo é conhecido.
   *
   * A escolha é a **menor fonte que aguenta com folga**, e não a maior
   * disponível. Guardar a fonte de 750 W para uma máquina que precisa dela
   * vale mais do que colocá-la numa máquina de escritório.
   */
  const consumo = estimarConsumo(montagem);
  const ideal = recomendarFonte(consumo);

  const candidatasFonte = estoque.psus
    .filter((fonte) => {
      const potencia = specNumero(fonte.specs, "wattage");
      return potencia === undefined || potencia >= consumo;
    })
    .sort(
      (a, b) =>
        (specNumero(a.specs, "wattage") ?? 0) - (specNumero(b.specs, "wattage") ?? 0),
    );

  montagem.psu =
    candidatasFonte.find(
      (fonte) => (specNumero(fonte.specs, "wattage") ?? 0) >= ideal,
    ) ?? candidatasFonte.at(0);

  return montagem;
}

export interface OpcoesDeSugestao {
  /** Quantas montagens sugerir, no máximo. */
  maximo?: number;
  /** Incluir montagens que o motor reprovou, para mostrar o que falta. */
  incluirIncompativeis?: boolean;
  /**
   * Conferências já feitas por pessoas, para não repetir avisos resolvidos.
   * Ver `VerificacaoManual`.
   */
  verificacoes?: ReadonlyMap<string, VerificacaoManual>;
}

export function sugerirMontagens(
  estoque: EstoqueParaMontagem,
  opcoes: OpcoesDeSugestao = {},
): MontagemSugerida[] {
  const maximo = opcoes.maximo ?? 10;
  const usadas = new Set<string>();
  const sugestoes: MontagemSugerida[] = [];

  // Processadores mais fortes primeiro: a primeira sugestão deve ser a melhor
  // máquina possível, não uma qualquer.
  const cpusOrdenadas = [...estoque.cpus].sort(
    (a, b) => (specNumero(b.specs, "cores") ?? 0) - (specNumero(a.specs, "cores") ?? 0),
  );

  for (const cpu of cpusOrdenadas) {
    if (sugestoes.length >= maximo) break;
    if (usadas.has(cpu.id)) continue;

    const placasLivres = disponiveis(estoque.motherboards, usadas);

    for (const motherboard of placasLivres) {
      if (usadas.has(cpu.id)) break;

      const restante: EstoqueParaMontagem = {
        cpus: [],
        motherboards: [],
        rams: disponiveis(estoque.rams, usadas),
        gpus: disponiveis(estoque.gpus, usadas),
        storages: disponiveis(estoque.storages, usadas),
        psus: disponiveis(estoque.psus, usadas),
        cases: disponiveis(estoque.cases, usadas),
        coolers: disponiveis(estoque.coolers, usadas),
      };

      const montagem = montarEmTornoDe(cpu, motherboard, restante);
      if (!montagem) continue;

      const compatibilidade = avaliarCompatibilidade(
        montagem,
        opcoes.verificacoes,
      );

      if (
        compatibilidade.nivel === "INCOMPATIBLE" &&
        !opcoes.incluirIncompativeis
      ) {
        continue;
      }

      const { nivel, usos } = classificar(montagem);

      sugestoes.push({
        montagem,
        compatibilidade,
        nivel,
        usosRecomendados: usos,
        pontuacao: pontuar(montagem, compatibilidade),
        faltando: compatibilidade.pecasFaltando,
      });

      // As peças desta montagem saem do estoque: a próxima sugestão precisa
      // ser montável ao mesmo tempo que esta, não em vez dela.
      for (const peca of [
        montagem.cpu,
        montagem.motherboard,
        montagem.gpu,
        montagem.psu,
        montagem.case,
        montagem.cooler,
        ...montagem.ram,
        ...montagem.storage,
      ]) {
        if (peca) usadas.add(peca.id);
      }

      break;
    }
  }

  return sugestoes.sort((a, b) => b.pontuacao - a.pontuacao);
}

/**
 * Identifica os gargalos do estoque.
 *
 * Responde à pergunta da seção 8: "quais peças estão impedindo que eu monte
 * mais computadores?". A conta é simples e por isso confiável: quantas
 * máquinas cada categoria comportaria sozinha, e qual delas é o menor número.
 */
export interface Gargalo {
  papel: string;
  disponiveis: number;
  /**
   * Quantas montagens a mais seriam possíveis ao eliminar **este conjunto** de
   * gargalos.
   *
   * Quando mais de um papel empata no piso, o número é o mesmo para todos: só
   * comprar os dois juntos desbloqueia alguma coisa.
   */
  montagensBloqueadas: number;
  /** Outros papéis empatados no mesmo piso, que precisam ser comprados junto. */
  precisaComprarJunto: string[];
}

/**
 * Identifica os gargalos do estoque.
 *
 * Responde à pergunta da seção 8: "quais peças estão impedindo que eu monte
 * mais computadores?".
 *
 * A conta considera o **conjunto** de papéis empatados no menor número, e não
 * cada um isoladamente. A diferença importa: com 1 processador e 1 fonte
 * contra 5 de tudo o mais, avaliar isoladamente concluiria que comprar
 * processadores não desbloqueia nada (a fonte continuaria travando) e que
 * comprar fontes também não — e o sistema responderia "não há gargalos" tendo
 * dois bem na frente.
 */
export function identificarGargalos(estoque: EstoqueParaMontagem): Gargalo[] {
  const capacidades = [
    { papel: "Processador", disponiveis: estoque.cpus.length },
    { papel: "Placa-mãe", disponiveis: estoque.motherboards.length },
    { papel: "Memória RAM", disponiveis: estoque.rams.length },
    { papel: "Armazenamento", disponiveis: estoque.storages.length },
    { papel: "Fonte", disponiveis: estoque.psus.length },
    { papel: "Gabinete", disponiveis: estoque.cases.length },
  ];

  const piso = Math.min(...capacidades.map((item) => item.disponiveis));
  const noPiso = capacidades.filter((item) => item.disponiveis === piso);
  const acimaDoPiso = capacidades.filter((item) => item.disponiveis > piso);

  // Estoque equilibrado: todos os papéis no mesmo número. Nada trava nada.
  if (acimaDoPiso.length === 0) return [];

  // Até onde daria para chegar resolvendo o piso inteiro: o próximo papel
  // mais escasso passa a ser o limite seguinte.
  const proximoLimite = Math.min(
    ...acimaDoPiso.map((item) => item.disponiveis),
  );

  return noPiso.map((item) => ({
    papel: item.papel,
    disponiveis: item.disponiveis,
    montagensBloqueadas: proximoLimite - piso,
    precisaComprarJunto: noPiso
      .filter((outro) => outro.papel !== item.papel)
      .map((outro) => outro.papel),
  }));
}
