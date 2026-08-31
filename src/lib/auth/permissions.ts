import { Role } from "@/generated/prisma/enums";

/**
 * Controle de acesso baseado em papéis (seção 16).
 *
 * As permissões vivem em código, não em tabela: são regra, não dado. Ficam
 * versionadas junto com o comportamento que protegem e são testáveis sem
 * banco. Uma tabela traria um join em toda requisição sem ganho real, já que
 * os três perfis são fixos.
 *
 * Este módulo é puro e pode ser importado pelo cliente — serve tanto para
 * autorizar no servidor quanto para esconder botões na interface. A decisão
 * que vale, porém, é sempre a do servidor (seção 21).
 */

export const PERMISSIONS = [
  "inventory:read",
  "inventory:write",
  "inventory:delete",
  "movement:create",
  "catalog:write",
  "build:read",
  "build:write",
  "report:read",
  "ai:use",
  "user:manage",
  "audit:read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const EMPLOYEE_PERMISSIONS: readonly Permission[] = [
  "inventory:read",
  "inventory:write",
  "movement:create",
  "catalog:write",
  "build:read",
  "build:write",
  "report:read",
  "ai:use",
];

const VIEWER_PERMISSIONS: readonly Permission[] = [
  "inventory:read",
  "build:read",
  "report:read",
];

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  // Administrador: controle total.
  [Role.ADMIN]: PERMISSIONS,
  // Funcionário: cadastro, movimentações e consultas. Não exclui nem
  // gerencia usuários.
  [Role.EMPLOYEE]: EMPLOYEE_PERMISSIONS,
  // Consulta: apenas visualização.
  [Role.VIEWER]: VIEWER_PERMISSIONS,
};

export function permissionsOf(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

export function can(role: Role | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function canAll(
  role: Role | undefined,
  permissions: readonly Permission[],
): boolean {
  return permissions.every((permission) => can(role, permission));
}

export const ROLE_LABELS: Record<Role, string> = {
  [Role.ADMIN]: "Administrador",
  [Role.EMPLOYEE]: "Funcionário",
  [Role.VIEWER]: "Consulta",
};
