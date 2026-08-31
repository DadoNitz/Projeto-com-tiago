import { describe, expect, it } from "vitest";

import type { SpecRecord } from "../specs/types";

import {
  avaliarCompatibilidade,
  estimarConsumo,
  recomendarFonte,
} from "./engine";
import type { Componente, MontagemCandidata } from "./types";

function peca(
  categorySlug: string,
  nome: string,
  specs: SpecRecord,
): Componente {
  return { id: nome, nome, categorySlug, specs };
}

// Peças de referência, espelhando o seed.
const ryzen5600 = peca("cpu", "Ryzen 5 5600", {
  socket: "AM4",
  tdpWatts: 65,
  integratedGraphics: false,
  generation: "Zen 3",
});
const i512400f = peca("cpu", "Core i5-12400F", {
  socket: "LGA1700",
  tdpWatts: 65,
  integratedGraphics: false,
});
const i312100 = peca("cpu", "Core i3-12100", {
  socket: "LGA1700",
  tdpWatts: 60,
  integratedGraphics: true,
});
const b550 = peca("motherboard", "TUF B550M", {
  socket: "AM4",
  formFactor: "Micro-ATX",
  memoryType: "DDR4",
  ramSlots: 4,
  maxRamGb: 128,
  m2Slots: 2,
  sataPorts: 6,
});
const b450 = peca("motherboard", "B450M DS3H", {
  socket: "AM4",
  formFactor: "Micro-ATX",
  memoryType: "DDR4",
  ramSlots: 4,
  maxRamGb: 128,
  m2Slots: 1,
  sataPorts: 4,
  biosUpdateNeededFor: "Ryzen 5000",
});
const ddr4 = peca("ram", "Fury Beast 8GB", {
  memoryType: "DDR4",
  capacityGb: 8,
  modules: 1,
  formFactor: "DIMM",
});
const ddr5 = peca("ram", "Kit DDR5 16GB", {
  memoryType: "DDR5",
  capacityGb: 8,
  modules: 2,
  formFactor: "DIMM",
});
const rtx3060 = peca("gpu", "RTX 3060", {
  tdpWatts: 170,
  powerConnectors: ["1x 8 pinos"],
  lengthMm: 235,
});
const ssdNvme = peca("storage", "NV2 500GB", {
  driveType: "SSD",
  interface: "NVMe PCIe 4.0",
  capacityGb: 500,
});
const hdSata = peca("storage", "Barracuda 1TB", {
  driveType: "HDD",
  interface: "SATA III",
  capacityGb: 1000,
});
const fonte650 = peca("psu", "CV650", {
  wattage: 650,
  pcieConnectors: ["2x 8 pinos"],
  formFactor: "ATX",
});
const fonte450SemPcie = peca("psu", "DX450", {
  wattage: 450,
  pcieConnectors: ["Nenhum"],
  formFactor: "ATX",
});
const gabineteAtx = peca("case", "Wideload ATX", {
  maxMotherboardFormFactor: "ATX",
  maxGpuLengthMm: 350,
  maxCoolerHeightMm: 165,
  psuFormFactor: "ATX",
  radiatorSupportMm: ["120 mm", "240 mm", "360 mm"],
});
const gabineteCurto = peca("case", "Micro-ATX básico", {
  maxMotherboardFormFactor: "Micro-ATX",
  maxGpuLengthMm: 210,
  maxCoolerHeightMm: 150,
  psuFormFactor: "ATX",
});
const coolerAm4 = peca("cooler", "Wraith Stealth", {
  coolerType: "Cooler stock",
  socketSupport: ["AM4"],
  heightMm: 65,
  tdpRatingWatts: 65,
});

function montagem(partes: Partial<MontagemCandidata> = {}): MontagemCandidata {
  return { ram: [], storage: [], ...partes };
}

function checkDe(resultado: ReturnType<typeof avaliarCompatibilidade>, regra: string) {
  return resultado.checks.find((check) => check.regra === regra);
}

describe("montagem completa e coerente", () => {
  const completa = montagem({
    cpu: ryzen5600,
    motherboard: b550,
    ram: [ddr4, ddr4],
    gpu: rtx3060,
    storage: [ssdNvme],
    psu: fonte650,
    case: gabineteAtx,
    cooler: coolerAm4,
  });

  it("aprova a configuração", () => {
    const resultado = avaliarCompatibilidade(completa);
    expect(resultado.nivel).toBe("COMPATIBLE");
    expect(resultado.pecasFaltando).toEqual([]);
  });

  it("estima consumo e recomenda fonte com folga", () => {
    const resultado = avaliarCompatibilidade(completa);
    // 65 (cpu) + 170 (gpu) + 50 (placa) + 10 (2 pentes) + 6 (ssd) + 20 = 321
    expect(resultado.consumoEstimadoW).toBe(321);
    // 321 * 1.4 = 450 -> proxima potencia comercial
    expect(resultado.fonteRecomendadaW).toBe(450);
  });
});

describe("socket", () => {
  it("reprova processador e placa de sockets diferentes", () => {
    const resultado = avaliarCompatibilidade(
      montagem({ cpu: i512400f, motherboard: b550 }),
    );
    const check = checkDe(resultado, "socket-cpu-placa");
    expect(check?.nivel).toBe("INCOMPATIBLE");
    expect(check?.mensagem).toContain("LGA1700");
    expect(check?.mensagem).toContain("AM4");
  });

  it("sem o socket cadastrado, pede verificação em vez de aprovar", () => {
    // O ponto central da especificação: dado ausente nunca vira "compatível".
    const semSocket = peca("cpu", "CPU sem specs", { tdpWatts: 65 });
    const resultado = avaliarCompatibilidade(
      montagem({ cpu: semSocket, motherboard: b550 }),
    );
    const check = checkDe(resultado, "socket-cpu-placa");
    expect(check?.nivel).toBe("NEEDS_VERIFICATION");
    expect(check?.camposFaltando?.[0]).toContain("socket");
  });
});

describe("BIOS", () => {
  it("marca para verificação a B450 com Ryzen 5000", () => {
    // Nem compatível nem incompatível: funciona depois de atualizar a BIOS,
    // e atualizar exige um processador mais antigo.
    const resultado = avaliarCompatibilidade(
      montagem({ cpu: ryzen5600, motherboard: b450 }),
    );
    const check = checkDe(resultado, "bios-placa");
    expect(check?.nivel).toBe("NEEDS_VERIFICATION");
    expect(check?.mensagem).toContain("BIOS");
  });

  it("não alerta quando o processador não é da geração afetada", () => {
    const ryzen2600 = peca("cpu", "Ryzen 5 2600", {
      socket: "AM4",
      tdpWatts: 65,
      generation: "Zen+",
      integratedGraphics: false,
    });
    const resultado = avaliarCompatibilidade(
      montagem({ cpu: ryzen2600, motherboard: b450 }),
    );
    expect(checkDe(resultado, "bios-placa")).toBeUndefined();
  });
});

describe("memória", () => {
  it("reprova DDR5 em placa DDR4", () => {
    const resultado = avaliarCompatibilidade(
      montagem({ motherboard: b550, ram: [ddr5] }),
    );
    expect(checkDe(resultado, "tipo-memoria")?.nivel).toBe("INCOMPATIBLE");
  });

  it("reprova mais módulos que slots", () => {
    const resultado = avaliarCompatibilidade(
      montagem({ motherboard: b550, ram: [ddr4, ddr4, ddr4, ddr4, ddr4] }),
    );
    const check = checkDe(resultado, "slots-memoria");
    expect(check?.nivel).toBe("INCOMPATIBLE");
    expect(check?.mensagem).toContain("5 módulos");
  });

  it("reprova memória de notebook em placa de desktop", () => {
    const soDimm = peca("ram", "SO-DIMM 8GB", {
      memoryType: "DDR4",
      capacityGb: 8,
      modules: 1,
      formFactor: "SO-DIMM",
    });
    const resultado = avaliarCompatibilidade(
      montagem({ motherboard: b550, ram: [soDimm] }),
    );
    expect(checkDe(resultado, "tipo-memoria")?.nivel).toBe("INCOMPATIBLE");
  });
});

describe("gabinete", () => {
  it("reprova placa ATX em gabinete Micro-ATX", () => {
    const placaAtx = peca("motherboard", "Placa ATX", {
      socket: "AM4",
      formFactor: "ATX",
      memoryType: "DDR4",
    });
    const resultado = avaliarCompatibilidade(
      montagem({ motherboard: placaAtx, case: gabineteCurto }),
    );
    expect(checkDe(resultado, "placa-gabinete")?.nivel).toBe("INCOMPATIBLE");
  });

  it("aceita placa menor que o máximo do gabinete", () => {
    const resultado = avaliarCompatibilidade(
      montagem({ motherboard: b550, case: gabineteAtx }),
    );
    expect(checkDe(resultado, "placa-gabinete")?.nivel).toBe("COMPATIBLE");
  });

  it("reprova GPU mais longa que o gabinete", () => {
    const resultado = avaliarCompatibilidade(
      montagem({ gpu: rtx3060, case: gabineteCurto }),
    );
    const check = checkDe(resultado, "gpu-gabinete");
    expect(check?.nivel).toBe("INCOMPATIBLE");
    expect(check?.mensagem).toContain("235");
    expect(check?.mensagem).toContain("210");
  });

  it("avisa quando a GPU cabe raspando", () => {
    const gabineteJusto = peca("case", "Gabinete justo", {
      maxMotherboardFormFactor: "ATX",
      maxGpuLengthMm: 240,
      psuFormFactor: "ATX",
    });
    const check = checkDe(
      avaliarCompatibilidade(montagem({ gpu: rtx3060, case: gabineteJusto })),
      "gpu-gabinete",
    );
    expect(check?.nivel).toBe("LIKELY_COMPATIBLE");
  });
});

describe("saída de vídeo", () => {
  it("reprova montagem sem GPU e com processador sem vídeo integrado", () => {
    // Erro silencioso clássico: a máquina liga e não dá imagem.
    const resultado = avaliarCompatibilidade(
      montagem({ cpu: ryzen5600, motherboard: b550 }),
    );
    const check = checkDe(resultado, "saida-video");
    expect(check?.nivel).toBe("INCOMPATIBLE");
    expect(check?.mensagem).toContain("não dá imagem");
  });

  it("aceita processador com vídeo integrado sem placa de vídeo", () => {
    const resultado = avaliarCompatibilidade(montagem({ cpu: i312100 }));
    expect(checkDe(resultado, "saida-video")?.nivel).toBe("COMPATIBLE");
  });

  it("não se aplica quando há placa de vídeo", () => {
    const resultado = avaliarCompatibilidade(
      montagem({ cpu: ryzen5600, gpu: rtx3060 }),
    );
    expect(checkDe(resultado, "saida-video")).toBeUndefined();
  });
});

describe("fonte", () => {
  it("reprova fonte que não aguenta o consumo", () => {
    const resultado = avaliarCompatibilidade(
      montagem({
        cpu: ryzen5600,
        motherboard: b550,
        ram: [ddr4, ddr4],
        gpu: rtx3060,
        storage: [ssdNvme, hdSata],
        psu: peca("psu", "Fonte 300W", {
          wattage: 300,
          pcieConnectors: ["1x 8 pinos"],
        }),
      }),
    );
    const check = checkDe(resultado, "potencia-fonte");
    expect(check?.nivel).toBe("INCOMPATIBLE");
    expect(check?.mensagem).toContain("desliga sob carga");
  });

  it("avisa quando a fonte cobre mas sem folga", () => {
    const resultado = avaliarCompatibilidade(
      montagem({
        cpu: ryzen5600,
        motherboard: b550,
        ram: [ddr4],
        gpu: rtx3060,
        storage: [ssdNvme],
        psu: peca("psu", "Fonte 400W", {
          wattage: 400,
          pcieConnectors: ["1x 8 pinos"],
        }),
      }),
    );
    expect(checkDe(resultado, "potencia-fonte")?.nivel).toBe(
      "LIKELY_COMPATIBLE",
    );
  });

  it("reprova fonte sem o conector que a GPU exige", () => {
    const resultado = avaliarCompatibilidade(
      montagem({ gpu: rtx3060, psu: fonte450SemPcie }),
    );
    const check = checkDe(resultado, "conectores-fonte");
    expect(check?.nivel).toBe("INCOMPATIBLE");
  });

  it("aceita conector 6+2 no lugar de 8 pinos", () => {
    // Um 6+2 atende quem pede 6 e quem pede 8: e o mesmo conector.
    const fonte6mais2 = peca("psu", "Zeus 550W", {
      wattage: 550,
      pcieConnectors: ["1x 6+2 pinos"],
    });
    const resultado = avaliarCompatibilidade(
      montagem({ gpu: rtx3060, psu: fonte6mais2 }),
    );
    expect(checkDe(resultado, "conectores-fonte")?.nivel).toBe("COMPATIBLE");
  });

  it("conta os conectores em vez de comparar as descrições", () => {
    // Regressao: "2x 8 pinos" e "1x 8 pinos" sao textos diferentes, mas a
    // primeira fonte obviamente atende a segunda exigencia. Comparar como
    // string reprovava uma montagem perfeitamente valida.
    const resultado = avaliarCompatibilidade(
      montagem({ gpu: rtx3060, psu: fonte650 }),
    );
    expect(checkDe(resultado, "conectores-fonte")?.nivel).toBe("COMPATIBLE");
  });

  it("reprova GPU que pede dois conectores e fonte que só tem um", () => {
    const gpuFaminta = peca("gpu", "RTX 3080", {
      tdpWatts: 320,
      powerConnectors: ["2x 8 pinos"],
      lengthMm: 285,
    });
    const fonteUmConector = peca("psu", "Fonte 1x8", {
      wattage: 750,
      pcieConnectors: ["1x 8 pinos"],
    });
    const resultado = avaliarCompatibilidade(
      montagem({ gpu: gpuFaminta, psu: fonteUmConector }),
    );
    expect(checkDe(resultado, "conectores-fonte")?.nivel).toBe("INCOMPATIBLE");
  });

  it('trata "Nenhum" como afirmação, não como dado faltando', () => {
    // Regressao: fonte que declara nao ter conector PCIe e uma informacao
    // completa, e leva a INCOMPATIBLE — nao a "precisa verificar".
    const resultado = avaliarCompatibilidade(
      montagem({ gpu: rtx3060, psu: fonte450SemPcie }),
    );
    const check = checkDe(resultado, "conectores-fonte");
    expect(check?.nivel).toBe("INCOMPATIBLE");
    expect(check?.camposFaltando).toBeUndefined();
  });

  it("aceita GPU que se alimenta só pelo slot", () => {
    const gpuFraca = peca("gpu", "GT 1030", {
      tdpWatts: 30,
      powerConnectors: ["Nenhum"],
      lengthMm: 150,
    });
    const resultado = avaliarCompatibilidade(
      montagem({ gpu: gpuFraca, psu: fonte450SemPcie }),
    );
    expect(checkDe(resultado, "conectores-fonte")?.nivel).toBe("COMPATIBLE");
  });

  it("sem o TDP da GPU, não afirma que a fonte basta", () => {
    const gpuSemTdp = peca("gpu", "GPU sem specs", {
      powerConnectors: ["1x 8 pinos"],
    });
    const resultado = avaliarCompatibilidade(
      montagem({
        cpu: ryzen5600,
        motherboard: b550,
        ram: [ddr4],
        gpu: gpuSemTdp,
        storage: [ssdNvme],
        psu: fonte650,
      }),
    );
    expect(checkDe(resultado, "potencia-fonte")?.nivel).toBe(
      "NEEDS_VERIFICATION",
    );
  });
});

describe("cooler", () => {
  it("reprova cooler que não serve no socket", () => {
    const resultado = avaliarCompatibilidade(
      montagem({ cpu: i512400f, cooler: coolerAm4 }),
    );
    expect(checkDe(resultado, "socket-cooler")?.nivel).toBe("INCOMPATIBLE");
  });

  it("reprova cooler mais alto que o gabinete", () => {
    const torreAlta = peca("cooler", "Torre 170mm", {
      coolerType: "Air cooler",
      socketSupport: ["AM4"],
      heightMm: 170,
      tdpRatingWatts: 200,
    });
    const resultado = avaliarCompatibilidade(
      montagem({ cooler: torreAlta, case: gabineteCurto }),
    );
    expect(checkDe(resultado, "cooler-gabinete")?.nivel).toBe("INCOMPATIBLE");
  });

  it("avisa quando o cooler é fraco para o processador", () => {
    const cpuQuente = peca("cpu", "CPU 125W", {
      socket: "AM4",
      tdpWatts: 125,
      integratedGraphics: false,
    });
    const resultado = avaliarCompatibilidade(
      montagem({ cpu: cpuQuente, cooler: coolerAm4 }),
    );
    expect(checkDe(resultado, "capacidade-cooler")?.nivel).toBe(
      "LIKELY_COMPATIBLE",
    );
  });

  it("não cobra altura de water cooler", () => {
    const aio = peca("cooler", "AIO 240", {
      coolerType: "Water cooler (AIO)",
      socketSupport: ["AM4"],
      radiatorSizeMm: "240 mm",
    });
    const resultado = avaliarCompatibilidade(
      montagem({ cooler: aio, case: gabineteAtx }),
    );
    expect(checkDe(resultado, "cooler-gabinete")).toBeUndefined();
    expect(checkDe(resultado, "radiador-gabinete")?.nivel).toBe("COMPATIBLE");
  });

  it("reprova radiador que o gabinete não comporta", () => {
    const aio420 = peca("cooler", "AIO 420", {
      coolerType: "Water cooler (AIO)",
      socketSupport: ["AM4"],
      radiatorSizeMm: "280 mm",
    });
    const resultado = avaliarCompatibilidade(
      montagem({ cooler: aio420, case: gabineteAtx }),
    );
    expect(checkDe(resultado, "radiador-gabinete")?.nivel).toBe("INCOMPATIBLE");
  });
});

describe("armazenamento", () => {
  it("reprova mais NVMe que slots M.2", () => {
    const resultado = avaliarCompatibilidade(
      montagem({ motherboard: b450, storage: [ssdNvme, ssdNvme] }),
    );
    expect(checkDe(resultado, "portas-armazenamento")?.nivel).toBe(
      "INCOMPATIBLE",
    );
  });

  it("aceita NVMe e SATA dentro do limite", () => {
    const resultado = avaliarCompatibilidade(
      montagem({ motherboard: b550, storage: [ssdNvme, hdSata] }),
    );
    expect(checkDe(resultado, "portas-armazenamento")?.nivel).toBe("COMPATIBLE");
  });
});

describe("montagem incompleta", () => {
  it("nunca é declarada compatível", () => {
    // Sem fonte, as regras de fonte nao rodam. O resultado sairia verde por
    // ausencia de contradicao, e nao por acerto — o modo de falha mais
    // enganoso possivel.
    const resultado = avaliarCompatibilidade(
      montagem({ cpu: ryzen5600, motherboard: b550, ram: [ddr4], gpu: rtx3060 }),
    );
    expect(resultado.nivel).toBe("NEEDS_VERIFICATION");
    expect(resultado.pecasFaltando).toContain("Fonte");
    expect(resultado.pecasFaltando).toContain("Gabinete");
    expect(resultado.pecasFaltando).toContain("Armazenamento");
  });

  it("montagem vazia lista tudo o que falta", () => {
    const resultado = avaliarCompatibilidade(montagem());
    expect(resultado.pecasFaltando).toHaveLength(6);
    expect(resultado.nivel).toBe("NEEDS_VERIFICATION");
  });
});

describe("veredito consolidado", () => {
  it("uma incompatibilidade domina vários acertos", () => {
    const resultado = avaliarCompatibilidade(
      montagem({
        cpu: ryzen5600,
        motherboard: b550,
        ram: [ddr4, ddr4],
        gpu: rtx3060,
        storage: [ssdNvme],
        psu: fonte650,
        // Gabinete curto demais para a RTX 3060.
        case: gabineteCurto,
        cooler: coolerAm4,
      }),
    );
    expect(resultado.nivel).toBe("INCOMPATIBLE");
  });
});

describe("estimativa de energia", () => {
  it("soma o que sabe e ignora o que falta", () => {
    expect(estimarConsumo(montagem())).toBe(0);
    expect(
      estimarConsumo(montagem({ cpu: ryzen5600, motherboard: b550 })),
    ).toBe(65 + 50 + 20);
  });

  it("arredonda a recomendação para potência de mercado", () => {
    expect(recomendarFonte(0)).toBe(0);
    expect(recomendarFonte(300)).toBe(450);
    expect(recomendarFonte(500)).toBe(700);
  });

  it("recomenda sempre acima do consumo", () => {
    for (let consumo = 50; consumo <= 800; consumo += 25) {
      expect(recomendarFonte(consumo)).toBeGreaterThan(consumo);
    }
  });
});
