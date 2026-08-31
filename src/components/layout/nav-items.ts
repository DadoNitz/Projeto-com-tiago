import type { Permission } from "@/lib/auth/permissions";

/**
 * Estrutura de navegação (seção 12 da especificação).
 *
 * `disponivel: false` marca o que ainda não existe. Esses itens aparecem
 * apagados e sem link, com a fase a que pertencem — em vez de sumirem do menu
 * ou, pior, levarem a uma página vazia que parece defeito.
 */
export interface ItemDeNavegacao {
  titulo: string;
  href: string;
  /** Nome do ícone no lucide-react. */
  icone: string;
  permissao?: Permission;
  disponivel: boolean;
  fase?: string;
  filhos?: ItemDeNavegacao[];
}

export const NAVEGACAO: ItemDeNavegacao[] = [
  {
    titulo: "Dashboard",
    href: "/dashboard",
    icone: "LayoutDashboard",
    disponivel: true,
  },
  {
    titulo: "Estoque",
    href: "/estoque/itens",
    icone: "Package",
    disponivel: true,
    filhos: [
      { titulo: "Todos os itens", href: "/estoque/itens", icone: "List", disponivel: true },
      {
        titulo: "Adicionar peça",
        href: "/estoque/novo",
        icone: "Plus",
        permissao: "inventory:write",
        disponivel: false,
        fase: "em construção",
      },
      {
        titulo: "Movimentações",
        href: "/estoque/movimentacoes",
        icone: "ArrowLeftRight",
        disponivel: false,
        fase: "em construção",
      },
      {
        titulo: "Categorias e marcas",
        href: "/estoque/categorias",
        icone: "Tags",
        disponivel: false,
        fase: "em construção",
      },
    ],
  },
  {
    titulo: "Sócios",
    href: "/socios",
    icone: "Users",
    disponivel: true,
  },
  {
    titulo: "Montagens",
    href: "/montagens",
    icone: "Cpu",
    disponivel: false,
    fase: "Fase 2",
  },
  {
    titulo: "Inteligência",
    href: "/inteligencia",
    icone: "Sparkles",
    permissao: "ai:use",
    disponivel: false,
    fase: "Fase 3",
  },
  {
    titulo: "Relatórios",
    href: "/relatorios",
    icone: "FileBarChart",
    permissao: "report:read",
    disponivel: false,
    fase: "Fase 3",
  },
  {
    titulo: "Promoções",
    href: "/promocoes",
    icone: "Tag",
    disponivel: false,
    fase: "Fase 5",
  },
  {
    titulo: "Configurações",
    href: "/configuracoes",
    icone: "Settings",
    disponivel: false,
    fase: "em construção",
  },
];

/**
 * Navegação inferior do celular (seção 33).
 *
 * Cinco itens no máximo: mais que isso reduz demais o alvo de toque. O botão
 * central de adicionar tem destaque por ser a ação mais frequente.
 */
export const NAVEGACAO_MOBILE: ItemDeNavegacao[] = [
  { titulo: "Início", href: "/dashboard", icone: "Home", disponivel: true },
  { titulo: "Estoque", href: "/estoque/itens", icone: "Package", disponivel: true },
  {
    titulo: "Adicionar",
    href: "/estoque/novo",
    icone: "Plus",
    permissao: "inventory:write",
    disponivel: false,
    fase: "em construção",
  },
  { titulo: "Sócios", href: "/socios", icone: "Users", disponivel: true },
  { titulo: "Mais", href: "/mais", icone: "Menu", disponivel: true },
];
