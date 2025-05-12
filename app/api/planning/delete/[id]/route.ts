import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth/jwt';
import { StatutValidation } from '@prisma/client';

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
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
      where: { id: params.id },
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
          where: { planningId: params.id }
        });
      }

      // b. Suppression des synthèses horaires associées
      if (planning.syntheses.length > 0) {
        await prisma.syntheseHeures.deleteMany({
          where: { planningId: params.id }
        });
      }

      // c. Suppression du planning
      await prisma.planning.delete({
        where: { id: params.id }
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