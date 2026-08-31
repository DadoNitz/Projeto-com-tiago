import {
  ArrowLeftRight,
  Box,
  Cable,
  CircuitBoard,
  Computer,
  Cpu,
  Fan,
  FileBarChart,
  HardDrive,
  Home,
  Keyboard,
  Laptop,
  LayoutDashboard,
  List,
  type LucideIcon,
  Menu,
  MemoryStick,
  Monitor,
  MonitorPlay,
  Network,
  Package,
  Plug,
  Plus,
  QrCode,
  ScanLine,
  Settings,
  Sparkles,
  Tag,
  Tags,
  Users,
} from "lucide-react";

/**
 * Mapa de ícones usados por nome.
 *
 * O nome do ícone vem do banco (`Category.icon`) e da configuração de
 * navegação. Um mapa explícito, em vez de importação dinâmica, garante que
 * apenas estes ícones entrem no bundle e que um nome inválido caia num padrão
 * em vez de quebrar a página.
 */
const ICONES: Record<string, LucideIcon> = {
  ArrowLeftRight,
  Box,
  Cable,
  CircuitBoard,
  Computer,
  Cpu,
  Fan,
  FileBarChart,
  HardDrive,
  Home,
  Keyboard,
  Laptop,
  LayoutDashboard,
  List,
  Menu,
  MemoryStick,
  Monitor,
  MonitorPlay,
  Network,
  Package,
  Plug,
  Plus,
  QrCode,
  ScanLine,
  Settings,
  Sparkles,
  Tag,
  Tags,
  Users,
};

export function Icone({
  nome,
  className,
}: {
  nome: string | null | undefined;
  className?: string;
}) {
  const Componente = (nome && ICONES[nome]) || Package;
  return <Componente className={className} aria-hidden />;
}
