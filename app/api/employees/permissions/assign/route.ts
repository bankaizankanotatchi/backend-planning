

/**
 * @module AssignPermissionAPI
 * @description API pour assigner une permission à un rôle spécifique dans le système.
 * 
 * @function POST
 * @async
 * 
 * @param {Request} request - La requête HTTP contenant les informations nécessaires pour assigner une permission.
 * 
 * @returns {Promise<NextResponse>} Une réponse HTTP indiquant le succès ou l'échec de l'opération.
 * 
 * @throws {NextResponse} - Retourne une réponse avec un code d'erreur et un message en cas d'échec.
 * 
 * @example
 * // Exemple de corps de requête JSON attendu :
 * {
 *   "role": "MANAGER",
 *   "permission": "PERMISSION_MANAGE"
 * }
 * 
 * @remarks
 * - Cette API vérifie d'abord si l'utilisateur est authentifié et possède les permissions nécessaires 
 *   pour gérer les permissions (`PERMISSION_MANAGE` ou accès complet).
 * - Elle valide ensuite les données reçues à l'aide de `zod`.
 * - Si la permission est déjà attribuée au rôle, une erreur est retournée.
 * - Si l'attribution échoue pour une raison quelconque, une erreur est également retournée.
 * - En cas de succès, la permission est ajoutée au rôle et mise à jour dans la base de données pour 
 *   tous les employés ayant ce rôle.
 * 
 * @error {401 Unauthorized} - Si le token d'authentification est manquant ou invalide.
 * @error {403 Forbidden} - Si l'utilisateur n'a pas les permissions nécessaires.
 * @error {400 Bad Request} - Si les données fournies sont invalides ou si la permission est déjà attribuée.
 * @error {500 Internal Server Error} - En cas d'erreur inattendue lors de l'exécution.
 * 
 * @returns {Object} Réponse JSON :
 * - En cas de succès :
 *   {
 *     "message": "Permission assignée avec succès au rôle",
 *     "affectedEmployees": 42
 *   }
 * - En cas d'erreur :
 *   {
 *     "error": "Message d'erreur",
 *     "details": [ ... ] // Optionnel, détails des erreurs de validation
 *   }
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth/jwt';
import { EnumRole, EnumPermission } from '@prisma/client';
import { z } from 'zod';
import { addPermissionToRole, isPermissionAllowedForRole } from '@/lib/roles';

const assignSchema = z.object({
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
    const { role, permission } = assignSchema.parse(body);

    // Vérification de la permission avec les fonctions utilitaires
    if (isPermissionAllowedForRole(role, permission as EnumPermission)) {
      return NextResponse.json(
        { error: 'Cette permission est déjà attribuée à ce rôle' },
        { status: 400 }
      );
    }

    // Mise à jour de la configuration avec la fonction utilitaire
    if (!addPermissionToRole(role, permission as EnumPermission)) {
      return NextResponse.json(
        { error: 'Impossible d\'ajouter la permission à ce rôle' },
        { status: 400 }
      );
    }

    // Mise à jour en base de données
    await prisma.$transaction(async (prisma) => {
      const employees = await prisma.employee.findMany({
        where: { role },
        select: { id: true }
      });

      if (employees.length > 0) {
        await prisma.employeePermission.createMany({
          data: employees.map(employee => ({
            employeeId: employee.id,
            permission: permission as EnumPermission
          }))
        });
      }
    });

    return NextResponse.json(
      { 
        message: 'Permission assignée avec succès au rôle',
        affectedEmployees: await prisma.employee.count({ where: { role } })
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('Erreur assignation permission:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Données invalides', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Erreur lors de l\'assignation' },
      { status: 500 }
    );
  }
}