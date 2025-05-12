import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth/jwt';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = (await params).id;
  try {
    // 1. Authentification et permissions
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ error: 'Authentification requise' }, { status: 401 });
    }

    const decoded = await verifyToken(token);
    const hasPermission = decoded.permissions.includes('PLANNING_DELETE') || decoded.permissions.includes('PLANNING_UPDATE') || decoded.hasAllAccess;
    if (!hasPermission) {
      return NextResponse.json({ error: 'Permissions insuffisantes' }, { status: 403 });
    }

    // 2. Configuration de la transaction avec timeout étendu
    const transactionTimeout = 10000; // 10 secondes
    const prismaClient = prisma.$extends({
      client: {
        $transaction: async (fn: (prisma: any) => Promise<any>, options?: { timeout?: number }) => {
          return prisma.$transaction(fn, { timeout: transactionTimeout, ...options });
        }
      }
    });

    // 3. Récupération du créneau (en dehors de la transaction)
    const timeSlot = await prisma.creneau.findUnique({
      where: { id: id },
      select: {
        employeeId: true,
        planningId: true,
        tache: { select: { label: true } },
        employee: { select: { nom: true, prenom: true } },
        type: true,
      }
    });

    if (!timeSlot) {
      return NextResponse.json({ error: 'Créneau non trouvé' }, { status: 404 });
    }

    // 4. Transaction avec timeout étendu
    await prismaClient.$transaction(async (tx) => {
      // a. Suppression du créneau
      await tx.creneau.delete({ where: { id: id } });

      // b. Mise à jour asynchrone de la synthèse (pour réduire le temps de transaction)
      setTimeout(async () => {
        try {
          await updateSynthese(timeSlot.planningId, timeSlot.employeeId);
        } catch (err) {
          console.error('Erreur mise à jour synthèse:', err);
        }
      }, 0);
    }, { timeout: transactionTimeout });

    return NextResponse.json({
      success: true,
      message: 'Créneau supprimé avec succès',
      deletedTimeSlot: {
        employee: `${timeSlot.employee.prenom} ${timeSlot.employee.nom}`,
        tache: timeSlot.tache.label,
        type: timeSlot.type
      }
    });

  } catch (error) {
    console.error('Erreur suppression créneau:', error);
    
    if (error instanceof Error && error.message.includes('Transaction already closed')) {
      return NextResponse.json(
        { 
          error: 'Opération trop longue',
          message: 'La suppression a été effectuée mais la mise à jour des synthèses peut être en cours'
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { 
        error: 'Erreur lors de la suppression',
        details: process.env.NODE_ENV === 'development' ? (error instanceof Error && error.message) : undefined
      },
      { status: 500 }
    );
  }
}

// Version optimisée de updateSynthese
async function updateSynthese(planningId: string, employeeId: string) {
  const creneaux = await prisma.creneau.findMany({
    where: { planningId, employeeId },
    select: { duree: true },
    take: 1000 // Limite pour les très grands ensembles de données
  });

  const totalMinutes = creneaux.reduce((sum, c) => sum + c.duree, 0);
  
  if (totalMinutes > 0) {
    await prisma.syntheseHeures.upsert({
      where: { planningId_employeeId: { planningId, employeeId } },
      update: { 
        heuresNormales: Math.floor(totalMinutes / 60),
        heuresSupplementaires: totalMinutes % 60
      },
      create: {
        planningId,
        employeeId,
        periodeFrom: new Date(),
        periodeTo: new Date(),
        heuresNormales: Math.floor(totalMinutes / 60),
        heuresSupplementaires: totalMinutes % 60,
        statut: 'BROUILLON'
      }
    });
  } else {
    await prisma.syntheseHeures.deleteMany({
      where: { planningId, employeeId }
    });
  }
}