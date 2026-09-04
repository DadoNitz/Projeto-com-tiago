import type { SpecRecord } from "../../src/domain/specs/types";

/**
 * Dados de demonstração (seção 30).
 *
 * Escolhidos para exercitar o motor de montagem da Fase 2, e não só para
 * encher a tela. O conjunto contém, de propósito:
 *
 * - duas plataformas incompatíveis entre si (AM4 e LGA1700), para que a regra
 *   de socket tenha o que reprovar;
 * - uma B450 marcada como exigindo BIOS atualizada para Ryzen 5000, que é o
 *   caso clássico de "precisa verificar" e não de "compatível";
 * - fontes de 450 W a 750 W, para que a regra de potência separe montagens
 *   viáveis de inviáveis;
 * - um gabinete Micro-ATX curto, que reprova a RTX 3060 por comprimento;
 * - peças sem algumas specs preenchidas, para exercitar o caminho
 *   "dados insuficientes".
 */

export interface ProdutoSeed {
  slugCategoria: string;
  marca: string;
  name: string;
  model?: string;
  partNumber?: string;
  trackingMode?: "SERIALIZED" | "QUANTITY";
  defaultSalePrice?: number;
  lowStockThreshold?: number;
  specs: SpecRecord;
  /** Unidades físicas a criar para este produto. */
  unidades: UnidadeSeed[];
  tags?: string[];
}

export interface UnidadeSeed {
  serial?: string;
  /// Slug do socio que pagou por esta peca.
  comprador?: string;
  condition: "NEW" | "LIKE_NEW" | "USED" | "DEFECTIVE" | "FOR_TESTING";
  status?: "AVAILABLE" | "RESERVED" | "DEFECTIVE";
  local: string;
  custo?: number;
  venda?: number;
  quantidade?: number;
  origem?: string;
  observacoes?: string;
}

/**
 * Socios que financiam o estoque.
 *
 * Separados dos usuarios do sistema: quem poe dinheiro nao precisa ter login.
 * `usuario` liga o socio a uma conta quando ele tambem opera o sistema.
 */
export const SOCIOS = [
  { slug: "dado", nome: "Dado", usuario: "ADMIN" as const },
  { slug: "tiago", nome: "Tiago", usuario: null },
] as const;

export const MARCAS = [
  "AMD",
  "Intel",
  "ASUS",
  "Gigabyte",
  "MSI",
  "ASRock",
  "Kingston",
  "Corsair",
  "XPG",
  "Crucial",
  "Seagate",
  "Western Digital",
  "Cooler Master",
  "Redragon",
  "Rise Mode",
  "Duex",
  "Genérica",
] as const;

export const LOCAIS = [
  { nome: "Depósito", code: "DEP", pai: null },
  { nome: "Estante A", code: "DEP-A", pai: "Depósito" },
  { nome: "Prateleira A1", code: "DEP-A1", pai: "Estante A" },
  { nome: "Prateleira A2", code: "DEP-A2", pai: "Estante A" },
  { nome: "Prateleira A3", code: "DEP-A3", pai: "Estante A" },
  { nome: "Estante B", code: "DEP-B", pai: "Depósito" },
  { nome: "Prateleira B1", code: "DEP-B1", pai: "Estante B" },
  { nome: "Bancada de testes", code: "BANCADA", pai: null },
  { nome: "Vitrine", code: "VITRINE", pai: null },
] as const;

export const TAGS = [
  { slug: "gamer", nome: "Gamer", cor: "#7c3aed" },
  { slug: "escritorio", nome: "Escritório", cor: "#0891b2" },
  { slug: "entrada", nome: "Entrada", cor: "#65a30d" },
  { slug: "retirado-de-pc", nome: "Retirado de PC", cor: "#b45309" },
  { slug: "revisar", nome: "Revisar", cor: "#dc2626" },
] as const;

export const PRODUTOS: ProdutoSeed[] = [
  // ---------------------------------------------------------------- CPUs ---
  {
    slugCategoria: "cpu",
    marca: "AMD",
    name: "Ryzen 5 5600",
    model: "5600",
    partNumber: "100-100000927BOX",
    defaultSalePrice: 620,
    specs: {
      socket: "AM4",
      cores: 6,
      threads: 12,
      baseClockGhz: 3.5,
      boostClockGhz: 4.4,
      tdpWatts: 65,
      generation: "Zen 3",
      integratedGraphics: false,
      includesCooler: true,
    },
    unidades: [
      { serial: "9NF4821K3729", condition: "USED", local: "Prateleira A1", custo: 430, origem: "Compra de lote", comprador: "dado" },
      { serial: "9NF4821K9174", condition: "NEW", local: "Prateleira A1", custo: 510, origem: "Fornecedor" },
    ],
  },
  {
    slugCategoria: "cpu",
    marca: "AMD",
    name: "Ryzen 7 5700X",
    model: "5700X",
    defaultSalePrice: 890,
    specs: {
      socket: "AM4",
      cores: 8,
      threads: 16,
      baseClockGhz: 3.4,
      boostClockGhz: 4.6,
      tdpWatts: 65,
      generation: "Zen 3",
      integratedGraphics: false,
      includesCooler: false,
    },
    unidades: [
      { serial: "AB7715X0042", condition: "LIKE_NEW", local: "Prateleira A1", custo: 700, comprador: "tiago" },
    ],
  },
  {
    slugCategoria: "cpu",
    marca: "Intel",
    name: "Core i5-12400F",
    model: "i5-12400F",
    defaultSalePrice: 720,
    specs: {
      socket: "LGA1700",
      cores: 6,
      threads: 12,
      baseClockGhz: 2.5,
      boostClockGhz: 4.4,
      tdpWatts: 65,
      generation: "12ª geração (Alder Lake)",
      integratedGraphics: false,
      includesCooler: true,
    },
    unidades: [
      { serial: "X12400F7781", condition: "USED", local: "Prateleira A2", custo: 540 },
      { serial: "X12400F1156", condition: "USED", local: "Prateleira A2", custo: 540 },
    ],
  },
  {
    slugCategoria: "cpu",
    marca: "Intel",
    name: "Core i3-12100",
    model: "i3-12100",
    defaultSalePrice: 480,
    specs: {
      socket: "LGA1700",
      cores: 4,
      threads: 8,
      baseClockGhz: 3.3,
      boostClockGhz: 4.3,
      tdpWatts: 60,
      generation: "12ª geração (Alder Lake)",
      // Tem vídeo integrado: permite montar sem placa de vídeo dedicada.
      integratedGraphics: true,
      includesCooler: true,
    },
    unidades: [
      { serial: "X121002210", condition: "NEW", local: "Prateleira A2", custo: 390 },
    ],
    tags: ["escritorio"],
  },

  // -------------------------------------------------------- Placas-mãe ---
  {
    slugCategoria: "motherboard",
    marca: "Gigabyte",
    name: "B450M DS3H",
    model: "B450M DS3H",
    defaultSalePrice: 380,
    specs: {
      socket: "AM4",
      chipset: "B450",
      formFactor: "Micro-ATX",
      memoryType: "DDR4",
      ramSlots: 4,
      maxRamGb: 128,
      maxMemorySpeedMhz: 3200,
      pcieSlots: 2,
      m2Slots: 1,
      sataPorts: 4,
      // Caso clássico de "precisa verificar": a placa aceita Ryzen 5000, mas
      // só depois de atualizar a BIOS. Afirmar "compatível" aqui seria
      // enganoso, e afirmar "incompatível" também.
      biosUpdateNeededFor: "Ryzen 5000",
    },
    unidades: [
      { serial: "GB450M4471", condition: "USED", local: "Prateleira A3", custo: 210, observacoes: "Retirada de PC de escritório. BIOS não verificada." },
      { serial: "GB450M8830", condition: "USED", local: "Prateleira A3", custo: 210 },
    ],
    tags: ["retirado-de-pc", "revisar"],
  },
  {
    slugCategoria: "motherboard",
    marca: "ASUS",
    name: "TUF Gaming B550M-Plus",
    model: "B550M-PLUS",
    defaultSalePrice: 720,
    specs: {
      socket: "AM4",
      chipset: "B550",
      formFactor: "Micro-ATX",
      memoryType: "DDR4",
      ramSlots: 4,
      maxRamGb: 128,
      maxMemorySpeedMhz: 4400,
      pcieSlots: 2,
      m2Slots: 2,
      sataPorts: 6,
    },
    unidades: [
      { serial: "AS550M1902", condition: "LIKE_NEW", local: "Prateleira A3", custo: 520 },
    ],
  },
  {
    slugCategoria: "motherboard",
    marca: "ASRock",
    name: "H610M-HDV",
    model: "H610M-HDV/M.2",
    defaultSalePrice: 460,
    specs: {
      socket: "LGA1700",
      chipset: "H610",
      formFactor: "Micro-ATX",
      memoryType: "DDR4",
      ramSlots: 2,
      maxRamGb: 64,
      maxMemorySpeedMhz: 3200,
      pcieSlots: 1,
      m2Slots: 1,
      sataPorts: 4,
    },
    unidades: [
      { serial: "AR610M5523", condition: "NEW", local: "Prateleira A3", custo: 340 },
      { serial: "AR610M5610", condition: "NEW", local: "Prateleira A3", custo: 340 },
    ],
  },
  {
    slugCategoria: "motherboard",
    marca: "MSI",
    name: "PRO B660M-A",
    model: "PRO B660M-A DDR4",
    defaultSalePrice: 690,
    specs: {
      socket: "LGA1700",
      chipset: "B660",
      formFactor: "Micro-ATX",
      memoryType: "DDR4",
      ramSlots: 4,
      maxRamGb: 128,
      maxMemorySpeedMhz: 4800,
      pcieSlots: 2,
      m2Slots: 2,
      sataPorts: 6,
    },
    unidades: [
      { serial: "MS660M7043", condition: "USED", local: "Prateleira A3", custo: 480 },
    ],
  },

  // ------------------------------------------------------------ Memórias ---
  {
    slugCategoria: "ram",
    marca: "Kingston",
    name: "Fury Beast 8GB DDR4 3200",
    model: "KF432C16BB/8",
    defaultSalePrice: 150,
    lowStockThreshold: 4,
    specs: {
      memoryType: "DDR4",
      capacityGb: 8,
      modules: 1,
      speedMhz: 3200,
      casLatency: 16,
      formFactor: "DIMM",
      eccSupport: false,
    },
    // Exemplo literal da seção 23: mesmo modelo, várias unidades, cada uma com
    // seu serial. As especificações não se repetem — vivem no produto.
    unidades: [
      { serial: "KF3200A7812", condition: "USED", local: "Prateleira B1", custo: 95 },
      { serial: "KF3200A4381", condition: "USED", local: "Prateleira B1", custo: 95 },
      { serial: "KF3200A9174", condition: "NEW", local: "Prateleira B1", custo: 120 },
      { serial: "KF3200A2265", condition: "NEW", local: "Prateleira B1", custo: 120 },
      { serial: "KF3200A5518", condition: "USED", local: "Prateleira B1", custo: 95 },
      { serial: "KF3200A6604", condition: "DEFECTIVE", status: "DEFECTIVE", local: "Bancada de testes", custo: 95, observacoes: "Não POSTa. Testar em outra placa." },
    ],
  },
  {
    slugCategoria: "ram",
    marca: "XPG",
    name: "Gammix D30 16GB DDR4 3200 (2x8)",
    model: "AX4U320038G16A-DT30",
    defaultSalePrice: 300,
    specs: {
      memoryType: "DDR4",
      capacityGb: 8,
      modules: 2,
      speedMhz: 3200,
      casLatency: 16,
      formFactor: "DIMM",
    },
    unidades: [
      { serial: "XPGD30K1122", condition: "LIKE_NEW", local: "Prateleira B1", custo: 210 },
      { serial: "XPGD30K1188", condition: "NEW", local: "Prateleira B1", custo: 260 },
    ],
    tags: ["gamer"],
  },

  // --------------------------------------------------------- Placas de vídeo ---
  {
    slugCategoria: "gpu",
    marca: "Gigabyte",
    name: "GeForce GTX 1660 Super OC 6GB",
    model: "GV-N166SOC-6GD",
    defaultSalePrice: 780,
    specs: {
      gpuChip: "GTX 1660 Super",
      vramGb: 6,
      vramType: "GDDR6",
      tdpWatts: 125,
      powerConnectors: ["1x 8 pinos"],
      lengthMm: 224,
      slotWidth: 2,
      interface: "PCIe 3.0 x16",
    },
    unidades: [
      { serial: "GV1660S3312", condition: "USED", local: "Prateleira A2", custo: 560, origem: "Troca com cliente", comprador: "dado" },
    ],
    tags: ["gamer", "entrada"],
  },
  {
    slugCategoria: "gpu",
    marca: "MSI",
    name: "GeForce RTX 3060 Ventus 2X 12GB",
    model: "RTX 3060 VENTUS 2X 12G",
    defaultSalePrice: 1450,
    specs: {
      gpuChip: "RTX 3060",
      vramGb: 12,
      vramType: "GDDR6",
      tdpWatts: 170,
      powerConnectors: ["1x 8 pinos"],
      // 235 mm não cabe no gabinete Micro-ATX curto deste seed: é a regra de
      // comprimento tendo o que reprovar.
      lengthMm: 235,
      slotWidth: 2,
      interface: "PCIe 4.0 x16",
    },
    unidades: [
      { serial: "MS3060V3729", condition: "USED", local: "Prateleira A2", custo: 1100, comprador: "dado" },
      { serial: "MS3060V9132", condition: "NEW", local: "Vitrine", custo: 1290, venda: 1590, comprador: "dado" },
    ],
    tags: ["gamer"],
  },
  {
    slugCategoria: "gpu",
    marca: "ASUS",
    name: "Dual GeForce RTX 4060 OC 8GB",
    model: "DUAL-RTX4060-O8G",
    defaultSalePrice: 1890,
    specs: {
      gpuChip: "RTX 4060",
      vramGb: 8,
      vramType: "GDDR6",
      tdpWatts: 115,
      powerConnectors: ["1x 8 pinos"],
      lengthMm: 227,
      slotWidth: 2,
      interface: "PCIe 4.0 x8",
    },
    unidades: [
      { serial: "AS4060D5540", condition: "NEW", local: "Vitrine", custo: 1620, venda: 2050, comprador: "tiago" },
    ],
    tags: ["gamer"],
  },

  // -------------------------------------------------------- Armazenamento ---
  {
    slugCategoria: "storage",
    marca: "Kingston",
    name: "NV2 500GB NVMe",
    model: "SNV2S/500G",
    defaultSalePrice: 220,
    lowStockThreshold: 3,
    specs: {
      driveType: "SSD",
      capacityGb: 500,
      interface: "NVMe PCIe 4.0",
      formFactor: "M.2 2280",
      healthPct: 100,
    },
    unidades: [
      { serial: "KNV2500A118", condition: "NEW", local: "Prateleira B1", custo: 160 },
      { serial: "KNV2500A233", condition: "NEW", local: "Prateleira B1", custo: 160 },
      { serial: "KNV2500A390", condition: "USED", local: "Prateleira B1", custo: 130 },
    ],
  },
  {
    slugCategoria: "storage",
    marca: "Crucial",
    name: "P3 1TB NVMe",
    model: "CT1000P3SSD8",
    defaultSalePrice: 380,
    specs: {
      driveType: "SSD",
      capacityGb: 1000,
      interface: "NVMe PCIe 3.0",
      formFactor: "M.2 2280",
      healthPct: 98,
      powerOnHours: 1240,
    },
    unidades: [
      { serial: "CRP31TB7710", condition: "USED", local: "Prateleira B1", custo: 290 },
    ],
  },
  {
    slugCategoria: "storage",
    marca: "Seagate",
    name: "Barracuda 1TB 7200RPM",
    model: "ST1000DM010",
    defaultSalePrice: 180,
    specs: {
      driveType: "HDD",
      capacityGb: 1000,
      interface: "SATA III",
      formFactor: '3.5"',
      // Saúde não verificada de propósito: exercita o caminho de dado ausente.
      powerOnHours: 22150,
    },
    unidades: [
      { serial: "ZDN1TB4402", condition: "USED", local: "Prateleira B1", custo: 60, observacoes: "22 mil horas ligado. Verificar SMART antes de vender." },
      { serial: "ZDN1TB4519", condition: "USED", local: "Prateleira B1", custo: 60 },
    ],
    tags: ["revisar"],
  },

  // ---------------------------------------------------------------- Fontes ---
  {
    slugCategoria: "psu",
    marca: "Duex",
    name: "DX450 450W",
    model: "DX450PS",
    defaultSalePrice: 150,
    specs: {
      wattage: 450,
      certification: "Sem certificação",
      modularity: "Não modular",
      pcieConnectors: ["Nenhum"],
      sataConnectors: 2,
      formFactor: "ATX",
    },
    unidades: [
      { serial: "DX450A2201", condition: "USED", local: "Prateleira A1", custo: 70 },
    ],
    tags: ["escritorio"],
  },
  {
    slugCategoria: "psu",
    marca: "Rise Mode",
    name: "Zeus 550W 80 Plus Bronze",
    model: "RM-PS-02-BR",
    defaultSalePrice: 260,
    specs: {
      wattage: 550,
      certification: "80 Plus Bronze",
      modularity: "Não modular",
      pcieConnectors: ["1x 6+2 pinos"],
      sataConnectors: 4,
      formFactor: "ATX",
    },
    unidades: [
      { serial: "RZ550B7781", condition: "NEW", local: "Prateleira A1", custo: 190 },
      { serial: "RZ550B7802", condition: "NEW", local: "Prateleira A1", custo: 190 },
    ],
  },
  {
    slugCategoria: "psu",
    marca: "Corsair",
    name: "CV650 650W 80 Plus Bronze",
    model: "CP-9020236-BR",
    defaultSalePrice: 420,
    specs: {
      wattage: 650,
      certification: "80 Plus Bronze",
      modularity: "Não modular",
      pcieConnectors: ["2x 8 pinos"],
      sataConnectors: 4,
      formFactor: "ATX",
    },
    unidades: [
      { serial: "CR650V1140", condition: "NEW", local: "Prateleira A1", custo: 330 },
    ],
  },
  {
    slugCategoria: "psu",
    marca: "Cooler Master",
    name: "MWE 750W 80 Plus Gold",
    model: "MPE-7501-ACAAG",
    defaultSalePrice: 620,
    specs: {
      wattage: 750,
      certification: "80 Plus Gold",
      modularity: "Modular",
      pcieConnectors: ["2x 8 pinos", "1x 8 pinos"],
      sataConnectors: 6,
      formFactor: "ATX",
    },
    unidades: [
      { serial: "CM750G3390", condition: "LIKE_NEW", local: "Prateleira A1", custo: 480 },
    ],
    tags: ["gamer"],
  },

  // ------------------------------------------------------------- Gabinetes ---
  {
    slugCategoria: "case",
    marca: "Genérica",
    name: "Gabinete Micro-ATX básico",
    model: "MC-01",
    defaultSalePrice: 120,
    specs: {
      maxMotherboardFormFactor: "Micro-ATX",
      // Curto de propósito: reprova a RTX 3060 (235 mm) por comprimento.
      maxGpuLengthMm: 210,
      maxCoolerHeightMm: 150,
      psuFormFactor: "ATX",
      fanSlots: 2,
      includedFans: 1,
      bays25: 2,
      bays35: 1,
    },
    unidades: [
      { serial: "GAB0011", condition: "USED", local: "Depósito", custo: 45 },
      { serial: "GAB0012", condition: "USED", local: "Depósito", custo: 45 },
    ],
    tags: ["escritorio"],
  },
  {
    slugCategoria: "case",
    marca: "Redragon",
    name: "Wideload ATX Mid Tower",
    model: "GC-611",
    defaultSalePrice: 320,
    specs: {
      maxMotherboardFormFactor: "ATX",
      maxGpuLengthMm: 350,
      maxCoolerHeightMm: 165,
      psuFormFactor: "ATX",
      fanSlots: 6,
      includedFans: 3,
      radiatorSupportMm: ["120 mm", "240 mm", "360 mm"],
      bays25: 2,
      bays35: 2,
    },
    unidades: [
      { serial: "RDGC611440", condition: "NEW", local: "Depósito", custo: 230 },
      { serial: "RDGC611512", condition: "NEW", local: "Depósito", custo: 230 },
    ],
    tags: ["gamer"],
  },

  // ---------------------------------------------------------------- Coolers ---
  {
    slugCategoria: "cooler",
    marca: "Cooler Master",
    name: "Hyper 212 Black",
    model: "RR-212S-20PK-R1",
    defaultSalePrice: 260,
    specs: {
      coolerType: "Air cooler",
      socketSupport: ["AM4", "AM5", "LGA1200", "LGA1700", "LGA1151"],
      heightMm: 159,
      tdpRatingWatts: 150,
    },
    unidades: [
      { serial: "CM212B8890", condition: "LIKE_NEW", local: "Prateleira A2", custo: 180 },
    ],
  },
  {
    slugCategoria: "cooler",
    marca: "AMD",
    name: "Wraith Stealth (stock AM4)",
    defaultSalePrice: 60,
    specs: {
      coolerType: "Cooler stock",
      socketSupport: ["AM4"],
      heightMm: 65,
      tdpRatingWatts: 65,
    },
    unidades: [
      { serial: "AMDWS1101", condition: "USED", local: "Prateleira A2", custo: 20 },
      { serial: "AMDWS1102", condition: "USED", local: "Prateleira A2", custo: 20 },
    ],
  },

  // ------------------------------------------------- Itens por quantidade ---
  {
    slugCategoria: "cable",
    marca: "Genérica",
    name: "Cabo SATA III 50cm",
    trackingMode: "QUANTITY",
    defaultSalePrice: 12,
    lowStockThreshold: 10,
    specs: { cableType: "SATA", lengthCm: 50 },
    // Item fungível: uma linha de saldo, sem serial. É o contraponto ao
    // modelo serializado, e o que evita 40 registros para 40 cabos.
    unidades: [
      { condition: "NEW", local: "Prateleira B1", quantidade: 38, custo: 4 },
    ],
  },
  {
    slugCategoria: "cable",
    marca: "Genérica",
    name: "Cabo HDMI 1,5m",
    trackingMode: "QUANTITY",
    defaultSalePrice: 25,
    lowStockThreshold: 5,
    specs: { cableType: "HDMI", lengthCm: 150 },
    unidades: [
      { condition: "NEW", local: "Prateleira B1", quantidade: 12, custo: 9 },
    ],
  },

  // -------------------------------------------------------------- Monitores ---
  {
    slugCategoria: "monitor",
    marca: "Genérica",
    name: 'Monitor 21,5" Full HD 75Hz',
    model: "E2213",
    defaultSalePrice: 450,
    specs: {
      sizeInches: 21.5,
      resolution: "1920x1080",
      refreshRateHz: 75,
      panelType: "VA",
      inputs: ["VGA", "HDMI"],
    },
    unidades: [
      { serial: "MON215A7021", condition: "USED", local: "Vitrine", custo: 300 },
      { serial: "MON215A7188", condition: "USED", local: "Vitrine", custo: 300, status: "RESERVED", observacoes: "Reservado para cliente Marcos." },
    ],
  },
];
