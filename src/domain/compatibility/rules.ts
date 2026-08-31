import { FORMATOS_PLACA_MAE } from "../specs/default-catalog";
import {
  specBooleano,
  specLista,
  specNumero,
  specTexto,
} from "../specs/validation";

import type { Componente, MontagemCandidata, Regra, ResultadoDeRegra } from "./types";

/**
 * Regras determinísticas de compatibilidade (seções 6 e 25).
 *
 * A regra de ouro, aplicada sem exceção: **dado ausente nunca produz
 * `COMPATIBLE`**. Produz `NEEDS_VERIFICATION`, sempre, informando qual campo
 * falta. Uma regra que "assume" o valor mais comum acerta na maioria e erra
 * exatamente nos casos em que alguém precisava do aviso.
 *
 * A IA não participa daqui. Ela recebe estes vereditos prontos e apenas os
 * traduz para linguagem natural — nunca os altera.
 */

function faltando(
  regra: string,
  titulo: string,
  campos: string[],
  oQueImpede: string,
): ResultadoDeRegra {
  return {
    regra,
    titulo,
    nivel: "NEEDS_VERIFICATION",
    mensagem: `${oQueImpede} Preencha ${campos.length === 1 ? "o campo" : "os campos"}: ${campos.join(", ")}.`,
    camposFaltando: campos,
  };
}

// ---------------------------------------------------------------------------
// Processador x placa-mãe
// ---------------------------------------------------------------------------

export const socketDoProcessador: Regra = ({ cpu, motherboard }) => {
  if (!cpu || !motherboard) return null;

  const socketCpu = specTexto(cpu.specs, "socket");
  const socketPlaca = specTexto(motherboard.specs, "socket");

  if (!socketCpu || !socketPlaca) {
    const campos: string[] = [];
    if (!socketCpu) campos.push(`socket do ${cpu.nome}`);
    if (!socketPlaca) campos.push(`socket da ${motherboard.nome}`);
    return faltando(
      "socket-cpu-placa",
      "Socket",
      campos,
      "Não dá para confirmar se o processador encaixa na placa-mãe.",
    );
  }

  if (socketCpu !== socketPlaca) {
    return {
      regra: "socket-cpu-placa",
      titulo: "Socket",
      nivel: "INCOMPATIBLE",
      mensagem: `O ${cpu.nome} é ${socketCpu} e a ${motherboard.nome} é ${socketPlaca}. Sockets diferentes não encaixam — não há adaptador.`,
    };
  }

  return {
    regra: "socket-cpu-placa",
    titulo: "Socket",
    nivel: "COMPATIBLE",
    mensagem: `Processador e placa-mãe são ${socketCpu}.`,
  };
};

/**
 * BIOS desatualizada.
 *
 * O caso clássico: uma B450 aceita Ryzen 5000, mas só depois de atualizar a
 * BIOS — e atualizar exige um processador mais antigo para dar boot. Dizer
 * "compatível" aqui faria alguém montar e não ligar. Dizer "incompatível"
 * também seria falso.
 */
export const biosDaPlaca: Regra = ({ cpu, motherboard }) => {
  if (!cpu || !motherboard) return null;

  const exigencia = specTexto(motherboard.specs, "biosUpdateNeededFor");
  if (!exigencia) return null;

  const geracao = specTexto(cpu.specs, "generation") ?? "";
  const nome = `${cpu.nome} ${geracao}`.toLowerCase();
  const alvo = exigencia.toLowerCase();

  /*
   * O casamento é feito pela **família numérica**, não pela marca.
   *
   * "Ryzen 5000" contra "Ryzen 5 2600": casar pela palavra "ryzen" daria
   * positivo, e o sistema alertaria sobre uma BIOS que não tem nada a ver com
   * este processador. Falso alarme repetido faz o operador aprender a ignorar
   * o aviso — inclusive quando ele for verdadeiro.
   *
   * "5000" identifica a família: casa com 5600 e 5700X, não com 2600.
   */
  const familia = alvo.match(/(\d)000\b/)?.[1];

  const pareceAfetado = familia
    ? new RegExp(`\\b${familia}\\d{3}`).test(nome)
    : // Sem número na exigência, sobra o texto: exige uma expressão de pelo
      // menos duas palavras, para não casar por "ryzen" ou "intel" sozinhos.
      alvo.split(/\s+/).length > 1 && nome.includes(alvo);

  if (!pareceAfetado) return null;

  return {
    regra: "bios-placa",
    titulo: "Versão da BIOS",
    nivel: "NEEDS_VERIFICATION",
    mensagem: `A ${motherboard.nome} só aceita ${exigencia} com a BIOS atualizada. Confirme a versão gravada nesta placa antes de montar — atualizar depois costuma exigir um processador mais antigo para dar boot.`,
    camposFaltando: ["versão da BIOS da placa"],
  };
};

// ---------------------------------------------------------------------------
// Memória
// ---------------------------------------------------------------------------

export const tipoDeMemoria: Regra = ({ ram, motherboard }) => {
  if (!motherboard || ram.length === 0) return null;

  const tipoPlaca = specTexto(motherboard.specs, "memoryType");
  if (!tipoPlaca) {
    return faltando(
      "tipo-memoria",
      "Tipo de memória",
      [`tipo de memória da ${motherboard.nome}`],
      "Não dá para confirmar se a memória serve nesta placa.",
    );
  }

  const semTipo = ram.filter((pente) => !specTexto(pente.specs, "memoryType"));
  if (semTipo.length > 0) {
    return faltando(
      "tipo-memoria",
      "Tipo de memória",
      semTipo.map((pente) => `tipo de memória do ${pente.nome}`),
      "Não dá para confirmar se a memória serve nesta placa.",
    );
  }

  const incompativel = ram.find(
    (pente) => specTexto(pente.specs, "memoryType") !== tipoPlaca,
  );

  if (incompativel) {
    return {
      regra: "tipo-memoria",
      titulo: "Tipo de memória",
      nivel: "INCOMPATIBLE",
      mensagem: `A ${motherboard.nome} usa ${tipoPlaca} e o ${incompativel.nome} é ${specTexto(incompativel.specs, "memoryType")}. Os slots são fisicamente diferentes.`,
    };
  }

  // SO-DIMM é de notebook e não entra em placa de desktop, mesmo sendo do
  // mesmo DDR.
  const soDimm = ram.find(
    (pente) => specTexto(pente.specs, "formFactor") === "SO-DIMM",
  );
  if (soDimm) {
    return {
      regra: "tipo-memoria",
      titulo: "Tipo de memória",
      nivel: "INCOMPATIBLE",
      mensagem: `O ${soDimm.nome} é SO-DIMM, formato de notebook, e não encaixa em placa de desktop.`,
    };
  }

  return {
    regra: "tipo-memoria",
    titulo: "Tipo de memória",
    nivel: "COMPATIBLE",
    mensagem: `Memória ${tipoPlaca}, como a placa exige.`,
  };
};

export const slotsDeMemoria: Regra = ({ ram, motherboard }) => {
  if (!motherboard || ram.length === 0) return null;

  const slots = specNumero(motherboard.specs, "ramSlots");
  if (slots === undefined) {
    return faltando(
      "slots-memoria",
      "Slots de memória",
      [`quantidade de slots da ${motherboard.nome}`],
      "Não dá para confirmar se toda a memória cabe na placa.",
    );
  }

  const modulos = ram.reduce(
    (soma, pente) => soma + (specNumero(pente.specs, "modules") ?? 1),
    0,
  );

  if (modulos > slots) {
    return {
      regra: "slots-memoria",
      titulo: "Slots de memória",
      nivel: "INCOMPATIBLE",
      mensagem: `A montagem usa ${modulos} módulos e a ${motherboard.nome} tem ${slots} slots.`,
    };
  }

  return {
    regra: "slots-memoria",
    titulo: "Slots de memória",
    nivel: "COMPATIBLE",
    mensagem: `${modulos} de ${slots} slots ocupados.`,
  };
};

export const capacidadeDeMemoria: Regra = ({ ram, motherboard }) => {
  if (!motherboard || ram.length === 0) return null;

  const maximo = specNumero(motherboard.specs, "maxRamGb");
  if (maximo === undefined) return null;

  const total = ram.reduce((soma, pente) => {
    const porModulo = specNumero(pente.specs, "capacityGb");
    const modulos = specNumero(pente.specs, "modules") ?? 1;
    return soma + (porModulo ?? 0) * modulos;
  }, 0);

  if (total === 0) return null;

  if (total > maximo) {
    return {
      regra: "capacidade-memoria",
      titulo: "Capacidade de memória",
      nivel: "INCOMPATIBLE",
      mensagem: `A montagem soma ${total} GB e a ${motherboard.nome} suporta no máximo ${maximo} GB.`,
    };
  }

  return {
    regra: "capacidade-memoria",
    titulo: "Capacidade de memória",
    nivel: "COMPATIBLE",
    mensagem: `${total} GB, dentro do limite de ${maximo} GB da placa.`,
  };
};

// ---------------------------------------------------------------------------
// Gabinete
// ---------------------------------------------------------------------------

export const placaNoGabinete: Regra = ({ motherboard, case: gabinete }) => {
  if (!motherboard || !gabinete) return null;

  const formatoPlaca = specTexto(motherboard.specs, "formFactor");
  const formatoMaximo = specTexto(gabinete.specs, "maxMotherboardFormFactor");

  if (!formatoPlaca || !formatoMaximo) {
    const campos: string[] = [];
    if (!formatoPlaca) campos.push(`formato da ${motherboard.nome}`);
    if (!formatoMaximo) campos.push(`maior placa suportada pelo ${gabinete.nome}`);
    return faltando(
      "placa-gabinete",
      "Placa no gabinete",
      campos,
      "Não dá para confirmar se a placa-mãe cabe no gabinete.",
    );
  }

  // A lista está ordenada do menor para o maior: um gabinete que aceita ATX
  // aceita tudo abaixo dela.
  const indicePlaca = FORMATOS_PLACA_MAE.indexOf(
    formatoPlaca as (typeof FORMATOS_PLACA_MAE)[number],
  );
  const indiceMaximo = FORMATOS_PLACA_MAE.indexOf(
    formatoMaximo as (typeof FORMATOS_PLACA_MAE)[number],
  );

  if (indicePlaca < 0 || indiceMaximo < 0) return null;

  if (indicePlaca > indiceMaximo) {
    return {
      regra: "placa-gabinete",
      titulo: "Placa no gabinete",
      nivel: "INCOMPATIBLE",
      mensagem: `A ${motherboard.nome} é ${formatoPlaca} e o ${gabinete.nome} aceita no máximo ${formatoMaximo}.`,
    };
  }

  return {
    regra: "placa-gabinete",
    titulo: "Placa no gabinete",
    nivel: "COMPATIBLE",
    mensagem: `Placa ${formatoPlaca} cabe em gabinete até ${formatoMaximo}.`,
  };
};

export const gpuNoGabinete: Regra = ({ gpu, case: gabinete }) => {
  if (!gpu || !gabinete) return null;

  const comprimento = specNumero(gpu.specs, "lengthMm");
  const limite = specNumero(gabinete.specs, "maxGpuLengthMm");

  if (comprimento === undefined || limite === undefined) {
    const campos: string[] = [];
    if (comprimento === undefined) campos.push(`comprimento da ${gpu.nome}`);
    if (limite === undefined) campos.push(`GPU máxima do ${gabinete.nome}`);
    return faltando(
      "gpu-gabinete",
      "Placa de vídeo no gabinete",
      campos,
      "Não dá para confirmar se a placa de vídeo cabe no gabinete.",
    );
  }

  if (comprimento > limite) {
    return {
      regra: "gpu-gabinete",
      titulo: "Placa de vídeo no gabinete",
      nivel: "INCOMPATIBLE",
      mensagem: `A ${gpu.nome} tem ${comprimento} mm e o ${gabinete.nome} aceita até ${limite} mm.`,
    };
  }

  const folga = limite - comprimento;
  if (folga < 10) {
    return {
      regra: "gpu-gabinete",
      titulo: "Placa de vídeo no gabinete",
      nivel: "LIKELY_COMPATIBLE",
      mensagem: `Cabe, mas com apenas ${folga} mm de folga. Confira se não há gaiola de discos ou cabo no caminho.`,
    };
  }

  return {
    regra: "gpu-gabinete",
    titulo: "Placa de vídeo no gabinete",
    nivel: "COMPATIBLE",
    mensagem: `${comprimento} mm em um gabinete que aceita ${limite} mm.`,
  };
};

export const coolerNoGabinete: Regra = ({ cooler, case: gabinete }) => {
  if (!cooler || !gabinete) return null;

  const tipo = specTexto(cooler.specs, "coolerType");
  // Water cooler não tem altura sobre o processador; o que importa nele é o
  // radiador, verificado em outra regra.
  if (tipo === "Water cooler (AIO)") return null;

  const altura = specNumero(cooler.specs, "heightMm");
  const limite = specNumero(gabinete.specs, "maxCoolerHeightMm");

  if (altura === undefined || limite === undefined) {
    const campos: string[] = [];
    if (altura === undefined) campos.push(`altura do ${cooler.nome}`);
    if (limite === undefined) campos.push(`cooler máximo do ${gabinete.nome}`);
    return faltando(
      "cooler-gabinete",
      "Cooler no gabinete",
      campos,
      "Não dá para confirmar se o cooler cabe no gabinete.",
    );
  }

  if (altura > limite) {
    return {
      regra: "cooler-gabinete",
      titulo: "Cooler no gabinete",
      nivel: "INCOMPATIBLE",
      mensagem: `O ${cooler.nome} tem ${altura} mm de altura e o ${gabinete.nome} aceita até ${limite} mm. A tampa lateral não fecha.`,
    };
  }

  return {
    regra: "cooler-gabinete",
    titulo: "Cooler no gabinete",
    nivel: "COMPATIBLE",
    mensagem: `${altura} mm de altura, dentro dos ${limite} mm do gabinete.`,
  };
};

export const radiadorNoGabinete: Regra = ({ cooler, case: gabinete }) => {
  if (!cooler || !gabinete) return null;
  if (specTexto(cooler.specs, "coolerType") !== "Water cooler (AIO)") return null;

  const radiador = specTexto(cooler.specs, "radiatorSizeMm");
  const suportados = specLista(gabinete.specs, "radiatorSupportMm");

  if (!radiador || suportados.length === 0) {
    const campos: string[] = [];
    if (!radiador) campos.push(`tamanho do radiador do ${cooler.nome}`);
    if (suportados.length === 0) {
      campos.push(`radiadores suportados pelo ${gabinete.nome}`);
    }
    return faltando(
      "radiador-gabinete",
      "Radiador no gabinete",
      campos,
      "Não dá para confirmar se o water cooler cabe no gabinete.",
    );
  }

  if (!suportados.includes(radiador)) {
    return {
      regra: "radiador-gabinete",
      titulo: "Radiador no gabinete",
      nivel: "INCOMPATIBLE",
      mensagem: `O ${cooler.nome} usa radiador de ${radiador} e o ${gabinete.nome} aceita ${suportados.join(", ")}.`,
    };
  }

  return {
    regra: "radiador-gabinete",
    titulo: "Radiador no gabinete",
    nivel: "COMPATIBLE",
    mensagem: `Radiador de ${radiador} suportado pelo gabinete.`,
  };
};

// ---------------------------------------------------------------------------
// Cooler x processador
// ---------------------------------------------------------------------------

export const socketDoCooler: Regra = ({ cooler, cpu }) => {
  if (!cooler || !cpu) return null;

  const socketCpu = specTexto(cpu.specs, "socket");
  const suportados = specLista(cooler.specs, "socketSupport");

  if (!socketCpu || suportados.length === 0) {
    const campos: string[] = [];
    if (!socketCpu) campos.push(`socket do ${cpu.nome}`);
    if (suportados.length === 0) campos.push(`sockets suportados pelo ${cooler.nome}`);
    return faltando(
      "socket-cooler",
      "Cooler no processador",
      campos,
      "Não dá para confirmar se o cooler serve neste processador.",
    );
  }

  if (!suportados.includes(socketCpu)) {
    return {
      regra: "socket-cooler",
      titulo: "Cooler no processador",
      nivel: "INCOMPATIBLE",
      mensagem: `O ${cooler.nome} não suporta socket ${socketCpu}. Ele serve para ${suportados.join(", ")}.`,
    };
  }

  return {
    regra: "socket-cooler",
    titulo: "Cooler no processador",
    nivel: "COMPATIBLE",
    mensagem: `O cooler suporta socket ${socketCpu}.`,
  };
};

export const capacidadeDoCooler: Regra = ({ cooler, cpu }) => {
  if (!cooler || !cpu) return null;

  const capacidade = specNumero(cooler.specs, "tdpRatingWatts");
  const tdp = specNumero(cpu.specs, "tdpWatts");
  if (capacidade === undefined || tdp === undefined) return null;

  if (capacidade < tdp) {
    return {
      regra: "capacidade-cooler",
      titulo: "Capacidade de refrigeração",
      nivel: "LIKELY_COMPATIBLE",
      mensagem: `O ${cooler.nome} dissipa ${capacidade} W e o ${cpu.nome} tem TDP de ${tdp} W. Monta e liga, mas o processador vai reduzir a frequência sob carga.`,
    };
  }

  return {
    regra: "capacidade-cooler",
    titulo: "Capacidade de refrigeração",
    nivel: "COMPATIBLE",
    mensagem: `Cooler dissipa ${capacidade} W para um processador de ${tdp} W.`,
  };
};

// ---------------------------------------------------------------------------
// Vídeo
// ---------------------------------------------------------------------------

/**
 * Sem placa de vídeo e sem gráfico integrado, a máquina liga mas não dá imagem.
 * É um erro de montagem frequente e silencioso — nada avisa até ligar o
 * monitor.
 */
export const saidaDeVideo: Regra = ({ cpu, gpu }) => {
  if (gpu) return null;
  if (!cpu) return null;

  const integrado = specBooleano(cpu.specs, "integratedGraphics");

  if (integrado === undefined) {
    return faltando(
      "saida-video",
      "Saída de vídeo",
      [`vídeo integrado do ${cpu.nome}`],
      "Sem placa de vídeo na montagem, é preciso saber se o processador tem vídeo integrado.",
    );
  }

  if (!integrado) {
    return {
      regra: "saida-video",
      titulo: "Saída de vídeo",
      nivel: "INCOMPATIBLE",
      mensagem: `O ${cpu.nome} não tem vídeo integrado e a montagem não tem placa de vídeo. A máquina liga, mas não dá imagem.`,
    };
  }

  return {
    regra: "saida-video",
    titulo: "Saída de vídeo",
    nivel: "COMPATIBLE",
    mensagem: `O ${cpu.nome} tem vídeo integrado.`,
  };
};

// ---------------------------------------------------------------------------
// Armazenamento
// ---------------------------------------------------------------------------

export const portasDeArmazenamento: Regra = ({ storage, motherboard }) => {
  if (!motherboard || storage.length === 0) return null;

  const contarPor = (predicado: (componente: Componente) => boolean) =>
    storage.filter(predicado).length;

  const nvme = contarPor((disco) =>
    (specTexto(disco.specs, "interface") ?? "").startsWith("NVMe"),
  );
  const sata = contarPor(
    (disco) => specTexto(disco.specs, "interface") === "SATA III",
  );

  const slotsM2 = specNumero(motherboard.specs, "m2Slots");
  const portasSata = specNumero(motherboard.specs, "sataPorts");

  const campos: string[] = [];
  if (nvme > 0 && slotsM2 === undefined) {
    campos.push(`slots M.2 da ${motherboard.nome}`);
  }
  if (sata > 0 && portasSata === undefined) {
    campos.push(`portas SATA da ${motherboard.nome}`);
  }
  if (campos.length > 0) {
    return faltando(
      "portas-armazenamento",
      "Portas de armazenamento",
      campos,
      "Não dá para confirmar se todos os discos têm onde ligar.",
    );
  }

  if (slotsM2 !== undefined && nvme > slotsM2) {
    return {
      regra: "portas-armazenamento",
      titulo: "Portas de armazenamento",
      nivel: "INCOMPATIBLE",
      mensagem: `A montagem tem ${nvme} SSDs NVMe e a ${motherboard.nome} tem ${slotsM2} slot(s) M.2.`,
    };
  }

  if (portasSata !== undefined && sata > portasSata) {
    return {
      regra: "portas-armazenamento",
      titulo: "Portas de armazenamento",
      nivel: "INCOMPATIBLE",
      mensagem: `A montagem tem ${sata} dispositivos SATA e a ${motherboard.nome} tem ${portasSata} portas.`,
    };
  }

  return {
    regra: "portas-armazenamento",
    titulo: "Portas de armazenamento",
    nivel: "COMPATIBLE",
    mensagem: `${nvme} NVMe e ${sata} SATA cabem na placa.`,
  };
};

// ---------------------------------------------------------------------------
// Fonte
// ---------------------------------------------------------------------------

/** Consumo de itens que raramente têm TDP cadastrado. */
const CONSUMO_BASE = {
  placaMae: 50,
  porModuloDeMemoria: 5,
  porSsd: 6,
  porHd: 9,
  ventoinhasEOutros: 20,
} as const;

/**
 * Estima o consumo da montagem.
 *
 * Soma o que se sabe e usa valores conservadores para o resto. É deliberado
 * que a estimativa erre **para cima**: uma fonte folgada custa um pouco mais;
 * uma fonte apertada desliga a máquina sob carga e pode levar componentes
 * junto.
 */
export function estimarConsumo(montagem: MontagemCandidata): number {
  let total = 0;

  total += specNumero(montagem.cpu?.specs, "tdpWatts") ?? 0;
  total += specNumero(montagem.gpu?.specs, "tdpWatts") ?? 0;

  if (montagem.motherboard) total += CONSUMO_BASE.placaMae;

  for (const pente of montagem.ram) {
    const modulos = specNumero(pente.specs, "modules") ?? 1;
    total += modulos * CONSUMO_BASE.porModuloDeMemoria;
  }

  for (const disco of montagem.storage) {
    total +=
      specTexto(disco.specs, "driveType") === "HDD"
        ? CONSUMO_BASE.porHd
        : CONSUMO_BASE.porSsd;
  }

  if (total > 0) total += CONSUMO_BASE.ventoinhasEOutros;

  return total;
}

/** Potências de fonte que existem no mercado, para arredondar a recomendação. */
const POTENCIAS_COMERCIAIS = [
  350, 400, 450, 500, 550, 600, 650, 700, 750, 850, 1000, 1200, 1600,
] as const;

/**
 * Fonte recomendada: consumo estimado com 40% de folga.
 *
 * A folga cobre picos transitórios das GPUs modernas (que passam bem do TDP
 * médio por milissegundos) e a perda de capacidade da fonte com o tempo.
 */
export function recomendarFonte(consumoW: number): number {
  if (consumoW <= 0) return 0;
  const alvo = Math.ceil(consumoW * 1.4);
  return POTENCIAS_COMERCIAIS.find((valor) => valor >= alvo) ?? alvo;
}

export const potenciaDaFonte: Regra = (montagem) => {
  const { psu } = montagem;
  if (!psu) return null;

  const potencia = specNumero(psu.specs, "wattage");
  if (potencia === undefined) {
    return faltando(
      "potencia-fonte",
      "Potência da fonte",
      [`potência da ${psu.nome}`],
      "Não dá para confirmar se a fonte aguenta a montagem.",
    );
  }

  const consumo = estimarConsumo(montagem);
  if (consumo === 0) return null;

  const recomendada = recomendarFonte(consumo);

  const semTdpCpu =
    montagem.cpu && specNumero(montagem.cpu.specs, "tdpWatts") === undefined;
  const semTdpGpu =
    montagem.gpu && specNumero(montagem.gpu.specs, "tdpWatts") === undefined;

  if (semTdpCpu || semTdpGpu) {
    const campos: string[] = [];
    if (semTdpCpu) campos.push(`TDP do ${montagem.cpu?.nome}`);
    if (semTdpGpu) campos.push(`consumo da ${montagem.gpu?.nome}`);
    return faltando(
      "potencia-fonte",
      "Potência da fonte",
      campos,
      `A estimativa está incompleta: sem esses dados o consumo real pode ser bem maior que os ${consumo} W calculados.`,
    );
  }

  if (potencia < consumo) {
    return {
      regra: "potencia-fonte",
      titulo: "Potência da fonte",
      nivel: "INCOMPATIBLE",
      mensagem: `A montagem consome cerca de ${consumo} W e a ${psu.nome} entrega ${potencia} W. A máquina desliga sob carga.`,
    };
  }

  if (potencia < recomendada) {
    return {
      regra: "potencia-fonte",
      titulo: "Potência da fonte",
      nivel: "LIKELY_COMPATIBLE",
      mensagem: `A ${psu.nome} (${potencia} W) cobre os ${consumo} W estimados, mas sem folga confortável. O recomendado seria ${recomendada} W para absorver picos da placa de vídeo.`,
    };
  }

  return {
    regra: "potencia-fonte",
    titulo: "Potência da fonte",
    nivel: "COMPATIBLE",
    mensagem: `${potencia} W para um consumo estimado de ${consumo} W.`,
  };
};

/**
 * Conectores PCIe, contados por quantidade e tipo.
 *
 * Comparar as descrições como texto não funciona: "2x 8 pinos" e "1x 8 pinos"
 * são strings diferentes, mas a primeira obviamente atende a segunda. É
 * preciso extrair quantidade e tipo e fazer as contas.
 */
interface Conector {
  quantidade: number;
  /** 6 e 8 pinos são PCIe clássicos; 12VHPWR é o padrão novo, incompatível. */
  pinos: 6 | 8 | 12;
}

function interpretarConector(descricao: string): Conector | null {
  if (descricao === "Nenhum") return null;

  const quantidade = Number(descricao.match(/^(\d+)x/)?.[1] ?? 1);

  if (descricao.includes("12VHPWR")) return { quantidade, pinos: 12 };
  // Um 6+2 é fisicamente um 8 pinos que se separa: serve para 6 e para 8.
  if (descricao.includes("6+2")) return { quantidade, pinos: 8 };
  if (descricao.includes("8 pinos")) return { quantidade, pinos: 8 };
  if (descricao.includes("6 pinos")) return { quantidade, pinos: 6 };

  return null;
}

function somarConectores(descricoes: readonly string[]) {
  const total = { seis: 0, oito: 0, doze: 0 };

  for (const descricao of descricoes) {
    const conector = interpretarConector(descricao);
    if (!conector) continue;
    if (conector.pinos === 6) total.seis += conector.quantidade;
    if (conector.pinos === 8) total.oito += conector.quantidade;
    if (conector.pinos === 12) total.doze += conector.quantidade;
  }

  return total;
}

export const conectoresDaFonte: Regra = ({ psu, gpu }) => {
  if (!psu || !gpu) return null;

  const listaGpu = specLista(gpu.specs, "powerConnectors");
  const listaPsu = specLista(psu.specs, "pcieConnectors");

  // Lista ausente é dado faltando. Lista com "Nenhum" é uma afirmação: a peça
  // declara não ter conector. São coisas diferentes e levam a vereditos
  // diferentes.
  if (listaGpu.length === 0) {
    return faltando(
      "conectores-fonte",
      "Conectores de alimentação",
      [`conectores de alimentação da ${gpu.nome}`],
      "Não dá para confirmar se a fonte alimenta a placa de vídeo.",
    );
  }

  const exigido = somarConectores(listaGpu);
  const totalExigido = exigido.seis + exigido.oito + exigido.doze;

  // GPU que se alimenta só pelo slot PCIe não impõe nada à fonte.
  if (totalExigido === 0) {
    return {
      regra: "conectores-fonte",
      titulo: "Conectores de alimentação",
      nivel: "COMPATIBLE",
      mensagem: `A ${gpu.nome} se alimenta pelo slot da placa-mãe, sem conector extra.`,
    };
  }

  if (listaPsu.length === 0) {
    return faltando(
      "conectores-fonte",
      "Conectores de alimentação",
      [`conectores PCIe da ${psu.nome}`],
      `A ${gpu.nome} exige ${listaGpu.join(" e ")}.`,
    );
  }

  const disponivel = somarConectores(listaPsu);

  const problemas: string[] = [];

  if (exigido.doze > disponivel.doze) {
    problemas.push(
      `${exigido.doze} conector 12VHPWR, e a fonte tem ${disponivel.doze}`,
    );
  }

  // Um conector de 8 pinos atende também uma exigência de 6. O contrário não
  // vale: 6 pinos entrega metade da corrente.
  const sobraDeOito = disponivel.oito - exigido.oito;
  if (sobraDeOito < 0) {
    problemas.push(
      `${exigido.oito} conectores de 8 pinos, e a fonte tem ${disponivel.oito}`,
    );
  }

  const seisDisponiveis = disponivel.seis + Math.max(0, sobraDeOito);
  if (exigido.seis > seisDisponiveis) {
    problemas.push(
      `${exigido.seis} conectores de 6 pinos, e a fonte oferece ${seisDisponiveis}`,
    );
  }

  if (problemas.length > 0) {
    return {
      regra: "conectores-fonte",
      titulo: "Conectores de alimentação",
      nivel: "INCOMPATIBLE",
      mensagem: `A ${gpu.nome} precisa de ${problemas.join("; ")}. Improvisar adaptador a partir de conector SATA é risco de incêndio.`,
    };
  }

  return {
    regra: "conectores-fonte",
    titulo: "Conectores de alimentação",
    nivel: "COMPATIBLE",
    mensagem: `A ${psu.nome} tem os conectores que a ${gpu.nome} exige.`,
  };
};

export const formatoDaFonte: Regra = ({ psu, case: gabinete }) => {
  if (!psu || !gabinete) return null;

  const formatoFonte = specTexto(psu.specs, "formFactor");
  const formatoGabinete = specTexto(gabinete.specs, "psuFormFactor");
  if (!formatoFonte || !formatoGabinete) return null;

  if (formatoFonte !== formatoGabinete) {
    return {
      regra: "formato-fonte",
      titulo: "Formato da fonte",
      nivel: "INCOMPATIBLE",
      mensagem: `A ${psu.nome} é ${formatoFonte} e o ${gabinete.nome} usa fonte ${formatoGabinete}.`,
    };
  }

  return {
    regra: "formato-fonte",
    titulo: "Formato da fonte",
    nivel: "COMPATIBLE",
    mensagem: `Fonte ${formatoFonte}, como o gabinete usa.`,
  };
};

/** Todas as regras, na ordem em que aparecem no resultado. */
export const REGRAS: readonly Regra[] = [
  socketDoProcessador,
  biosDaPlaca,
  tipoDeMemoria,
  slotsDeMemoria,
  capacidadeDeMemoria,
  saidaDeVideo,
  placaNoGabinete,
  gpuNoGabinete,
  socketDoCooler,
  coolerNoGabinete,
  radiadorNoGabinete,
  capacidadeDoCooler,
  portasDeArmazenamento,
  potenciaDaFonte,
  conectoresDaFonte,
  formatoDaFonte,
];
