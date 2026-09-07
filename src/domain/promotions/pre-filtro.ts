/**
 * Filtro barato, antes da IA.
 *
 * Um grupo de promoções despeja dezenas de mensagens por hora, e a maioria não
 * é oferta: "bom dia", "alguém sabe se vale a pena", figurinha, enquete. Além
 * disso, boa parte das ofertas reais é de perfume, mercado e roupa.
 *
 * Chamar o modelo em cada mensagem queimaria a cota do plano gratuito em
 * minutos — foi medido: o limite chega rápido. Este filtro é determinístico,
 * roda em microssegundos e descarta o óbvio de graça.
 *
 * Ele erra para o lado de **deixar passar**: uma mensagem duvidosa segue para
 * a IA, que decide. O filtro só barra o que não tem chance — sem preço, ou
 * claramente de outra categoria. Barrar demais aqui perderia oferta boa em
 * silêncio, que é o pior resultado possível.
 *
 * O que conta como "tem chance" abrange peça de PC **e** eletrônico de
 * consumo: controle, TV, fone, projetor, power bank. Eles chegam misturados
 * nos mesmos canais, e a tela sabe separá-los depois pelo segmento da
 * categoria (ver `categorias.ts`). O que continua barrado é o que nenhum dos
 * dois alcança: perfume, roupa, mercado, eletrodoméstico de cozinha.
 */

/** Formatos de preço em português: R$ 1.799,90 · 1799 · 1,8k · 1.8K */
const TEM_PRECO =
  /(r\$\s*\d|(?<![\w,.])\d{2,6}(?:[.,]\d{2})?\s*(?:reais|conto)|(?<![\w,.])\d{1,3}[.,]?\d?\s*k(?![\w]))/i;

/**
 * Termos de informática. Lista ampla de propósito: o custo de deixar passar
 * uma mensagem irrelevante é uma chamada de IA; o de barrar uma oferta boa é
 * perder dinheiro.
 */
const TERMOS_DE_HARDWARE = [
  // Processadores
  "ryzen", "intel", "core i3", "core i5", "core i7", "core i9", "processador",
  "cpu", "threadripper", "xeon",
  // Vídeo
  "rtx", "gtx", "radeon", "rx 5", "rx 6", "rx 7", "arc a", "placa de video",
  "placa de vídeo", "gpu", "geforce",
  // Placa-mãe e memória
  "placa mae", "placa-mãe", "placa mãe", "b550", "b650", "b450", "x570",
  "h610", "h510", "b660", "b760", "z690", "z790", "a520",
  "ddr4", "ddr5", "memoria ram", "memória ram", "so-dimm", "dimm",
  // Armazenamento
  "ssd", "nvme", "m.2", "hd ", "hdd", "sata", "seagate", "kingston", "crucial",
  "wd blue", "wd black", "barracuda",
  // Fonte, gabinete, cooler
  "fonte ", "80 plus", "psu", "gabinete", "water cooler", "air cooler",
  "cooler ", "ventoinha", "fan ",
  // Periféricos e monitores
  "monitor", "teclado mecanico", "teclado mecânico", "mouse gamer", "headset",
  "mousepad", "webcam",
  // Máquinas
  "notebook", "pc gamer", "desktop", "all in one",
  // Marcas fortes do setor
  "kabum", "pichau", "terabyte", "asus", "gigabyte", "msi", "asrock", "corsair",
  "xpg", "redragon", "logitech", "sandisk", "samsung 9", "samsung 8",
] as const;

/**
 * Eletrônico de consumo. Passa pelo filtro como peça passa, e a separação
 * entre os dois acontece depois, na categoria que a IA atribui.
 */
const TERMOS_DE_ELETRONICOS = [
  // Vídeo e imagem
  "smart tv", "tv 4k", "televisor", "projetor", "chromecast", "fire stick",
  // Som
  "fone", "headphone", "earbud", "caixa de som", "soundbar", "jbl", "airpods",
  // Videogame
  "controle", "gamepad", "joystick", "playstation", "ps5", "xbox", "nintendo",
  "switch 2", "videogame", "console",
  // Telefonia e portáteis
  "celular", "smartphone", "tablet", "ipad", "iphone", "galaxy ", "xiaomi",
  "motorola", "redmi", "poco ",
  // Energia e acessórios
  "power bank", "powerbank", "carregador", "nobreak", "no-break", "estabilizador",
  // Vestíveis e casa
  "smartwatch", "smartband", "relogio inteligente", "relógio inteligente",
  "alexa", "echo dot", "lampada inteligente", "lâmpada inteligente",
  "roteador", "repetidor", "kindle", "e-reader", "starlink", "drone",
] as const;

/**
 * Categorias que aparecem em grupo misto e não interessam.
 *
 * Só barra quando NÃO há termo de hardware junto — "perfume + RTX" na mesma
 * mensagem segue para a IA decidir.
 */
const TERMOS_DE_OUTRAS_CATEGORIAS = [
  "perfume", "batom", "shampoo", "creme", "camiseta", "tênis", "tenis",
  "sapato", "geladeira", "fogão", "fogao", "micro-ondas", "microondas",
  "air fryer", "airfryer", "cafeteira", "aspirador", "colchão", "colchao",
  "fralda", "ração", "racao", "whey", "creatina", "livro",
  "bicicleta", "pneu",
] as const;

export interface ResultadoDoPreFiltro {
  /** Se vale gastar uma chamada de IA com esta mensagem. */
  vale: boolean;
  /** Por que foi descartada. Só para diagnóstico e para a tela de origem. */
  motivo?: "sem-preco" | "curta" | "outra-categoria" | "sem-termo-tecnico";
}

export function valeChamarIA(texto: string): ResultadoDoPreFiltro {
  const limpo = texto.trim();

  // Mensagem curta não carrega produto + preço + loja.
  if (limpo.length < 15) return { vale: false, motivo: "curta" };

  const minusculo = limpo.toLowerCase();

  // Sem preço não existe promoção. É o corte que elimina quase toda conversa.
  if (!TEM_PRECO.test(minusculo)) return { vale: false, motivo: "sem-preco" };

  const temTermoTecnico =
    TERMOS_DE_HARDWARE.some((termo) => minusculo.includes(termo)) ||
    TERMOS_DE_ELETRONICOS.some((termo) => minusculo.includes(termo));

  if (temTermoTecnico) return { vale: true };

  // Sem termo conhecido, e com termo de outra categoria: descarta.
  const ehDeOutraCategoria = TERMOS_DE_OUTRAS_CATEGORIAS.some((termo) =>
    minusculo.includes(termo),
  );
  if (ehDeOutraCategoria) return { vale: false, motivo: "outra-categoria" };

  // Tem preço, não tem termo conhecido de nenhum lado. Deixa a IA decidir:
  // pode ser uma peça cujo nome não está na lista.
  return { vale: true, motivo: undefined };
}
