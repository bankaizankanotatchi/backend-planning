import { EnumPermission, EnumRole } from "@prisma/client";

export const ROLE_PERMISSIONS: Record<EnumRole, EnumPermission[]> = {
  EMPLOYE_BASE: [
    'PLANNING_READ',
    'LEAVE_REQUEST'
  ],
  MANAGER: [
    'PLANNING_READ',
    'PLANNING_CREATE',
    'LEAVE_REQUEST',
    'LEAVE_VIEW_TEAM',
    'EMPLOYEE_READ',
    'TEAM_VIEW_STATS'
  ],
  ADMIN: [
    'ALL_ACCESS'
  ]
};

// Fonction pour vérifier si une permission est compatible avec un rôle
export const isPermissionAllowedForRole = (
  role: EnumRole,
  permission: EnumPermission
): boolean => {
  return ROLE_PERMISSIONS[role].includes(permission) || 
         ROLE_PERMISSIONS[role].includes('ALL_ACCESS');
};

// Fonction pour obtenir les permissions par défaut d'un rôle
export const getDefaultPermissionsForRole = (
  role: EnumRole
): EnumPermission[] => {
  return [...ROLE_PERMISSIONS[role]]; // Retourne une copie
};

// Fonction pour ajouter une permission à un rôle
export const addPermissionToRole = (
  role: EnumRole,
  permission: EnumPermission
): boolean => {
  if (ROLE_PERMISSIONS[role].includes('ALL_ACCESS')) return false;
  if (!ROLE_PERMISSIONS[role].includes(permission)) {
    ROLE_PERMISSIONS[role].push(permission);
    return true;
  }
  return false;
};

// Fonction pour retirer une permission d'un rôle
export const removePermissionFromRole = (
  role: EnumRole,
  permission: EnumPermission
): boolean => {
  const index = ROLE_PERMISSIONS[role].indexOf(permission);
  if (index !== -1) {
    ROLE_PERMISSIONS[role].splice(index, 1);
    return true;
  }
  return false;
};