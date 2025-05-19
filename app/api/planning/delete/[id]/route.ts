

/**
 * Supprime un planning spécifique en fonction de son identifiant.
 * 
 * @async
 * @function DELETE
 * @param {Request} request - L'objet de requête HTTP contenant les informations nécessaires.
 * @param {Object} context - Contexte contenant les paramètres de la requête.
 * @param {Promise<{ id: string }>} context.params - Les paramètres de la requête, incluant l'identifiant du planning à supprimer.
 * 
 * @returns {Promise<Response>} Une réponse HTTP indiquant le résultat de l'opération.
 * 
 * @throws {Error} Retourne une erreur HTTP dans les cas suivants :
 * - 401 : Si le token d'authentification est manquant ou invalide.
 * - 403 : Si l'utilisateur n'a pas les permissions nécessaires ou si le planning est publié.
 * - 404 : Si le planning avec l'identifiant spécifié n'existe pas.
 * - 500 : En cas d'erreur interne lors de la suppression.
 * 
 * @description
 * Cette fonction effectue les étapes suivantes :
 * 1. Vérifie l'authentification et les permissions de l'utilisateur via un token JWT.
 * 2. Vérifie l'existence du planning et récupère ses dépendances (créneaux, synthèses, période).
 * 3. Vérifie les contraintes métier, notamment si le planning est publié.
 * 4. Supprime le planning et ses dépendances associées dans une transaction :
 *    - Supprime les créneaux associés.
 *    - Supprime les synthèses horaires associées.
 *    - Supprime le planning lui-même.
 *    - Supprime la période associée si elle n'est pas utilisée ailleurs.
 * 5. Retourne une réponse de succès avec des détails sur les éléments supprimés.
 * 
 * @example
 * // Requête HTTP DELETE
 * fetch('/api/planning/delete/123', {
 *   method: 'DELETE',
 *   headers: {
 *     'Authorization': 'Bearer <token>'
 *   }
 * }).then(response => response.json())
 *   .then(data => console.log(data));
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth/jwt';
import { StatutValidation } from '@prisma/client';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = (await params).id;
  try {
    // 1. Authentification et vérification des permissions
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ error: 'Token manquant' }, { status: 401 });
    }

    const decoded = await verifyToken(token);
    const hasPermission = decoded.permissions.includes('PLANNING_DELETE') || decoded.hasAllAccess;
    if (!hasPermission) {
      return NextResponse.json({ error: 'Permissions insuffisantes' }, { status: 403 });
    }

    // 2. Vérification que le planning existe et récupération des dépendances
    const planning = await prisma.planning.findUnique({
      where: { id: id },
      include: {
        periode: true,
        creneaux: {
          select: { id: true }
        },
        syntheses: {
          select: { id: true }
        }
      }
    });

    if (!planning) {
      return NextResponse.json({ error: 'Planning non trouvé' }, { status: 404 });
    }

    // 3. Vérification des contraintes métier avant suppression
    if (planning.statut === ('PUBLIE' as StatutValidation)) {
      return NextResponse.json(
        { error: 'Impossible de supprimer un planning publié' },
        { status: 403 }
      );
    }

    // 4. Suppression en transaction
    await prisma.$transaction(async (prisma) => {
      // a. Suppression des créneaux associés
      if (planning.creneaux.length > 0) {
        await prisma.creneau.deleteMany({
          where: { planningId: id }
        });
      }

      // b. Suppression des synthèses horaires associées
      if (planning.syntheses.length > 0) {
        await prisma.syntheseHeures.deleteMany({
          where: { planningId: id }
        });
      }

      // c. Suppression du planning
      await prisma.planning.delete({
        where: { id: id }
      });

      // d. Suppression de la période associée (si non utilisée ailleurs)
      if (planning.periode) {
        const otherPlannings = await prisma.planning.count({
          where: { dateRangeId: planning.periode.id }
        });

        if (otherPlannings === 0) {
          await prisma.dateRange.delete({
            where: { id: planning.periode.id }
          });
        }
      }
    });

    // 5. Réponse succès
    return NextResponse.json(
      { 
        success: true,
        message: 'Planning supprimé avec succès',
        deletedElements: {
          planning: 1,
          creneaux: planning.creneaux.length,
          syntheses: planning.syntheses.length
        }
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('Erreur suppression planning:', error);

    return NextResponse.json(
      { 
        error: 'Erreur lors de la suppression'
      },
      { status: 500 }
    );
  }
}