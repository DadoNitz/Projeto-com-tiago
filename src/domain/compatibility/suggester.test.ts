import { describe, expect, it } from "vitest";

import type { SpecRecord } from "../specs/types";

import {
  identificarGargalos,
  sugerirMontagens,
  type EstoqueParaMontagem,
} from "./suggester";
import type { Componente } from "./types";

let contador = 0;
function peca(categorySlug: string, nome: string, specs: SpecRecord): Componente {
  contador += 1;
  return { id: `${nome}#${contador}`, nome, categorySlug, specs };
}

const cpuAm4 = () =>
  peca("cpu", "Ryzen 5 5600", {
    socket: "AM4",
    cores: 6,
    tdpWatts: 65,
    integratedGraphics: false,
    generation: "Zen 3",
  });
const cpuIntelComVideo = () =>
  peca("cpu", "Core i3-12100", {
    socket: "LGA1700",
    cores: 4,
    tdpWatts: 60,
    integratedGraphics: true,
  });
const placaAm4 = () =>
  peca("motherboard", "B550M", {
    socket: "AM4",
    formFactor: "Micro-ATX",
    memoryType: "DDR4",
    ramSlots: 4,
    maxRamGb: 128,
    m2Slots: 2,
    sataPorts: 6,
  });
const placaIntel = () =>
  peca("motherboard", "H610M", {
    socket: "LGA1700",
    formFactor: "Micro-ATX",
    memoryType: "DDR4",
    ramSlots: 2,
    maxRamGb: 64,
    m2Slots: 1,
    sataPorts: 4,
  });
const memoria8 = () =>
  peca("ram", "DDR4 8GB", {
    memoryType: "DDR4",
    capacityGb: 8,
    modules: 1,
    formFactor: "DIMM",
  });
const gpu3060 = () =>
  peca("gpu", "RTX 3060", {
    vramGb: 12,
    tdpWatts: 170,
    powerConnectors: ["1x 8 pinos"],
    lengthMm: 235,
  });
const ssd = () =>
  peca("storage", "NVMe 500GB", {
    driveType: "SSD",
    interface: "NVMe PCIe 4.0",
    capacityGb: 500,
  });
const fonte650 = () =>
  peca("psu", "CV650", {
    wattage: 650,
    pcieConnectors: ["2x 8 pinos"],
    formFactor: "ATX",
  });
const fonte450 = () =>
  peca("psu", "DX450", {
    wattage: 450,
    pcieConnectors: ["1x 6+2 pinos"],
    formFactor: "ATX",
  });
const gabineteAtx = () =>
  peca("case", "ATX Mid Tower", {
    maxMotherboardFormFactor: "ATX",
    maxGpuLengthMm: 350,
    maxCoolerHeightMm: 165,
    psuFormFactor: "ATX",
  });
const coolerAm4 = () =>
  peca("cooler", "Wraith", {
    coolerType: "Cooler stock",
    socketSupport: ["AM4"],
    heightMm: 65,
    tdpRatingWatts: 65,
  });

function estoque(partes: Partial<EstoqueParaMontagem> = {}): EstoqueParaMontagem {
  return {
    cpus: [],
    motherboards: [],
    rams: [],
    gpus: [],
    storages: [],
    psus: [],
    cases: [],
    coolers: [],
    ...partes,
  };
}

describe("sugestão de montagens", () => {
  it("monta uma máquina completa a partir do estoque", () => {
    const sugestoes = sugerirMontagens(
      estoque({
        cpus: [cpuAm4()],
        motherboards: [placaAm4()],
        rams: [memoria8(), memoria8()],
        gpus: [gpu3060()],
        storages: [ssd()],
        psus: [fonte650()],
        cases: [gabineteAtx()],
        coolers: [coolerAm4()],
      }),
    );

    expect(sugestoes).toHaveLength(1);
    const [sugestao] = sugestoes;
    expect(sugestao?.compatibilidade.nivel).toBe("COMPATIBLE");
    expect(sugestao?.montagem.ram).toHaveLength(2);
    expect(sugestao?.nivel).toBe("Gamer avançado");
  });

  it("não sugere combinação de sockets diferentes", () => {
    const sugestoes = sugerirMontagens(
      estoque({
        cpus: [cpuAm4()],
        motherboards: [placaIntel()],
        rams: [memoria8()],
        storages: [ssd()],
        psus: [fonte450()],
        cases: [gabineteAtx()],
      }),
    );
    expect(sugestoes).toHaveLength(0);
  });

  it("nunca usa a mesma peça em duas montagens", () => {
    // O erro que tornaria a funcionalidade inútil: prometer duas máquinas que
    // dependem do mesmo pente de memória.
    const sugestoes = sugerirMontagens(
      estoque({
        cpus: [cpuAm4(), cpuAm4()],
        motherboards: [placaAm4(), placaAm4()],
        rams: [memoria8(), memoria8()],
        gpus: [gpu3060(), gpu3060()],
        storages: [ssd(), ssd()],
        psus: [fonte650(), fonte650()],
        cases: [gabineteAtx(), gabineteAtx()],
        coolers: [coolerAm4(), coolerAm4()],
      }),
    );

    expect(sugestoes.length).toBeGreaterThanOrEqual(2);

    const usados = new Set<string>();
    for (const sugestao of sugestoes) {
      const pecas = [
        sugestao.montagem.cpu,
        sugestao.montagem.motherboard,
        sugestao.montagem.gpu,
        sugestao.montagem.psu,
        sugestao.montagem.case,
        sugestao.montagem.cooler,
        ...sugestao.montagem.ram,
        ...sugestao.montagem.storage,
      ].filter(Boolean);

      for (const componente of pecas) {
        expect(usados.has(componente!.id), `${componente!.nome} reutilizado`).toBe(
          false,
        );
        usados.add(componente!.id);
      }
    }
  });

  it("respeita o limite de slots de memória da placa", () => {
    const [sugestao] = sugerirMontagens(
      estoque({
        cpus: [cpuIntelComVideo()],
        // H610M tem apenas 2 slots.
        motherboards: [placaIntel()],
        rams: [memoria8(), memoria8(), memoria8(), memoria8()],
        storages: [ssd()],
        psus: [fonte450()],
        cases: [gabineteAtx()],
      }),
    );

    expect(sugestao?.montagem.ram.length).toBeLessThanOrEqual(2);
  });

  it("monta sem placa de vídeo quando o processador tem vídeo integrado", () => {
    const [sugestao] = sugerirMontagens(
      estoque({
        cpus: [cpuIntelComVideo()],
        motherboards: [placaIntel()],
        rams: [memoria8()],
        storages: [ssd()],
        psus: [fonte450()],
        cases: [gabineteAtx()],
      }),
    );

    expect(sugestao?.montagem.gpu).toBeUndefined();
    expect(sugestao?.compatibilidade.nivel).toBe("COMPATIBLE");
    expect(sugestao?.nivel).toBe("Básico");
  });

  it("escolhe a menor fonte que aguenta, guardando a maior", () => {
    // Colocar a fonte de 650 W numa máquina de escritório desperdiçaria a
    // única peça capaz de alimentar uma máquina gamer.
    const [sugestao] = sugerirMontagens(
      estoque({
        cpus: [cpuIntelComVideo()],
        motherboards: [placaIntel()],
        rams: [memoria8()],
        storages: [ssd()],
        psus: [fonte650(), fonte450()],
        cases: [gabineteAtx()],
      }),
    );

    expect(sugestao?.montagem.psu?.nome).toBe("DX450");
  });

  it("não escolhe GPU que não cabe no gabinete", () => {
    const gabineteCurto = peca("case", "Micro curto", {
      maxMotherboardFormFactor: "Micro-ATX",
      maxGpuLengthMm: 200,
      maxCoolerHeightMm: 150,
      psuFormFactor: "ATX",
    });

    const [sugestao] = sugerirMontagens(
      estoque({
        cpus: [cpuIntelComVideo()],
        motherboards: [placaIntel()],
        rams: [memoria8()],
        gpus: [gpu3060()],
        storages: [ssd()],
        psus: [fonte450()],
        cases: [gabineteCurto],
      }),
    );

    expect(sugestao?.montagem.gpu).toBeUndefined();
  });

  it("respeita o máximo pedido", () => {
    const muitas = () =>
      Array.from({ length: 6 }, () => cpuAm4());

    const sugestoes = sugerirMontagens(
      estoque({
        cpus: muitas(),
        motherboards: Array.from({ length: 6 }, () => placaAm4()),
        rams: Array.from({ length: 6 }, () => memoria8()),
        storages: Array.from({ length: 6 }, () => ssd()),
        psus: Array.from({ length: 6 }, () => fonte650()),
        cases: Array.from({ length: 6 }, () => gabineteAtx()),
      }),
      { maximo: 2 },
    );

    expect(sugestoes.length).toBeLessThanOrEqual(2);
  });

  it("estoque vazio não gera sugestão", () => {
    expect(sugerirMontagens(estoque())).toEqual([]);
  });
});

describe("gargalos", () => {
  it("aponta a peça que limita o número de montagens", () => {
    // Oito placas AM4 e dois processadores: o gargalo é o processador, e o
    // exemplo é literalmente o da seção 8 da especificação.
    const gargalos = identificarGargalos(
      estoque({
        cpus: [cpuAm4(), cpuAm4()],
        motherboards: Array.from({ length: 8 }, () => placaAm4()),
        rams: Array.from({ length: 8 }, () => memoria8()),
        storages: Array.from({ length: 8 }, () => ssd()),
        psus: Array.from({ length: 8 }, () => fonte650()),
        cases: Array.from({ length: 8 }, () => gabineteAtx()),
      }),
    );

    expect(gargalos).toHaveLength(1);
    expect(gargalos[0]?.papel).toBe("Processador");
    expect(gargalos[0]?.disponiveis).toBe(2);
    expect(gargalos[0]?.montagensBloqueadas).toBe(6);
    expect(gargalos[0]?.precisaComprarJunto).toEqual([]);
  });

  it("não aponta gargalo quando tudo está equilibrado", () => {
    const gargalos = identificarGargalos(
      estoque({
        cpus: [cpuAm4()],
        motherboards: [placaAm4()],
        rams: [memoria8()],
        storages: [ssd()],
        psus: [fonte650()],
        cases: [gabineteAtx()],
      }),
    );
    expect(gargalos).toEqual([]);
  });

  it("aponta mais de um gargalo quando empatam", () => {
    const gargalos = identificarGargalos(
      estoque({
        cpus: [cpuAm4()],
        motherboards: Array.from({ length: 5 }, () => placaAm4()),
        rams: Array.from({ length: 5 }, () => memoria8()),
        storages: Array.from({ length: 5 }, () => ssd()),
        psus: [fonte650()],
        cases: Array.from({ length: 5 }, () => gabineteAtx()),
      }),
    );

    expect(gargalos.map((g) => g.papel).sort()).toEqual([
      "Fonte",
      "Processador",
    ]);
    // Comprar so um dos dois nao desbloqueia nada: o outro continua travando.
    // Por isso o numero e o mesmo, e cada gargalo aponta o companheiro.
    expect(gargalos.every((g) => g.montagensBloqueadas === 4)).toBe(true);
    expect(gargalos[0]?.precisaComprarJunto).toHaveLength(1);
  });
});
