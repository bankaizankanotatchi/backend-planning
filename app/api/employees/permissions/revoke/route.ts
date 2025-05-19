

/**
 * Révoque une permission d'un rôle spécifique.
 * 
 * @function POST
 * @param {Request} request - La requête HTTP contenant les informations nécessaires pour révoquer une permission.
 * 
 * @description
 * Cette API permet de révoquer une permission spécifique d'un rôle donné. 
 * Elle vérifie d'abord l'authentification et les permissions de l'utilisateur appelant.
 * Si l'utilisateur dispose des droits nécessaires (`PERMISSION_MANAGE` ou accès complet), 
 * la permission est retirée du rôle spécifié et les employés associés à ce rôle sont mis à jour en base de données.
 * 
 * @throws {401} Si l'utilisateur n'est pas authentifié (absence de token).
 * @throws {403} Si l'utilisateur n'a pas les permissions nécessaires pour effectuer cette action.
 * @throws {400} Si les données fournies sont invalides ou si la permission n'est pas attribuée au rôle.
 * @throws {500} En cas d'erreur interne lors de la révocation.
 * 
 * @example
 * // Requête POST
 * const response = await fetch('/api/employees/permissions/revoke', {
 *   method: 'POST',
 *   headers: {
 *     'Content-Type': 'application/json',
 *     'Authorization': 'Bearer <token>'
 *   },
 *   body: JSON.stringify({
 *     role: 'MANAGER',
 *     permission: 'VIEW_REPORTS'
 *   })
 * });
 * 
 * @returns {NextResponse} Une réponse JSON contenant :
 * - `message`: Confirmation de la révocation.
 * - `affectedEmployees`: Le nombre d'employés affectés par la modification.
 * 
 * @zod revokeSchema
 * - `role`: Doit être l'une des valeurs suivantes : `EMPLOYE_BASE`, `MANAGER`, `ADMIN`.
 * - `permission`: Doit être une valeur valide de l'énumération `EnumPermission`.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth/jwt';
import { EnumRole, EnumPermission } from '@prisma/client';
import { z } from 'zod';
import { removePermissionFromRole } from '@/lib/roles';

const revokeSchema = z.object({
  role: z.enum(['EMPLOYE_BASE', 'MANAGER', 'ADMIN']),
  permission: z.string().refine((val): val is EnumPermission => 
    Object.values(EnumPermission).includes(val as EnumPermission)
  )
});

export async function POST(request: Request) {
  try {
    // Vérification de l'authentification et des permissions
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const decoded = await verifyToken(token);
    if (!decoded.permissions.includes('PERMISSION_MANAGE') && !decoded.hasAllAccess) {
      return NextResponse.json({ error: 'Permissions insuffisantes' }, { status: 403 });
    }

    const body = await request.json();
    const { role, permission } = revokeSchema.parse(body);

    // Utilisation de la fonction utilitaire pour la révocation
    if (!removePermissionFromRole(role, permission as EnumPermission)) {
      return NextResponse.json(
        { error: 'Cette permission n\'est pas attribuée à ce rôle' },
        { status: 400 }
      );
    }

    // Mise à jour en base de données
    await prisma.$transaction(async (prisma) => {
      await prisma.employeePermission.deleteMany({
        where: {
          permission: permission as EnumPermission,
          employee: {
            role
          }
        }
      });
    });

    return NextResponse.json(
      { 
        message: 'Permission révoquée avec succès du rôle',
        affectedEmployees: await prisma.employee.count({ where: { role } })
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('Erreur révocation permission:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Données invalides', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Erreur lors de la révocation' },
      { status: 500 }
    );
  }
}