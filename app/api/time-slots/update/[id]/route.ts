import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth/jwt';
import { TypeCreneau, EnumStatutTache } from '@prisma/client';
import { z } from 'zod';

const updateTimeSlotSchema = z.object({
  employeeId: z.string().uuid().optional(),
  tacheId: z.string().uuid().optional(),
  dateDebut: z.string().datetime().optional(),
  dateFin: z.string().datetime().optional(),
  type: z.nativeEnum(TypeCreneau).optional(),
  duree: z.number().int().positive().optional(),
  commentaire: z.string().optional(),
  valide: z.boolean().optional(),
  statutTache: z.nativeEnum(EnumStatutTache).optional()
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = (await params).id;
  try {
    // 1. Authentification et permissions
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ error: 'Token manquant' }, { status: 401 });
    }

    const decoded = await verifyToken(token);
    const hasPermission = decoded.permissions.includes('PLANNING_UPDATE') || decoded.hasAllAccess;
    if (!hasPermission) {
      return NextResponse.json({ error: 'Permissions insuffisantes' }, { status: 403 });
    }

    // 2. Validation des données
    const body = await request.json();
    const validatedData = updateTimeSlotSchema.parse(body);

    // 3. Vérification que le créneau existe
    const existingTimeSlot = await prisma.creneau.findUnique({
      where: { id: id },
      include: { planning: true }
    });

    if (!existingTimeSlot) {
      return NextResponse.json({ error: 'Créneau non trouvé' }, { status: 404 });
    }

    // 4. Vérification des conflits si modification des dates
    if (validatedData.dateDebut || validatedData.dateFin) {
      const startDate = validatedData.dateDebut ? new Date(validatedData.dateDebut) : existingTimeSlot.dateDebut;
      const endDate = validatedData.dateFin ? new Date(validatedData.dateFin) : existingTimeSlot.dateFin;

      const conflicts = await prisma.creneau.findMany({
        where: {
          employeeId: validatedData.employeeId || existingTimeSlot.employeeId,
          NOT: { id: id },
          OR: [
            {
              dateDebut: { lt: endDate },
              dateFin: { gt: startDate }
            }
          ]
        },
        include: {
          planning: { select: { nom: true } },
          tache: { select: { label: true } }
        }
      });

      if (conflicts.length > 0) {
        return NextResponse.json(
          {
            error: 'Conflits de créneaux détectés',
            conflicts: conflicts.map(c => ({
              id: c.id,
              planning: c.planning.nom,
              tache: c.tache.label,
              periode: { debut: c.dateDebut, fin: c.dateFin }
            }))
          },
          { status: 409 }
        );
      }
    }

    // 5. Mise à jour en transaction
    const updatedTimeSlot = await prisma.$transaction(async (prisma) => {
      // a. Mise à jour du créneau
      const timeSlot = await prisma.creneau.update({
        where: { id: id },
        data: {
          employeeId: validatedData.employeeId,
          tacheId: validatedData.tacheId,
          dateDebut: validatedData.dateDebut ? new Date(validatedData.dateDebut) : undefined,
          dateFin: validatedData.dateFin ? new Date(validatedData.dateFin) : undefined,
          type: validatedData.type,
          duree: validatedData.duree,
          commentaire: validatedData.commentaire,
          valide: validatedData.valide,
          statutTache: validatedData.statutTache
        },
        include: {
          employee: { select: { nom: true, prenom: true } },
          tache: { select: { label: true } },
          planning: { select: { nom: true } }
        }
      });

      // b. Mise à jour de la synthèse horaire si durée ou employé modifié
      if (validatedData.duree || validatedData.employeeId) {
        await updateSynthese(timeSlot.planningId, timeSlot.employeeId);
      }

      return timeSlot;
    });

    return NextResponse.json({
      success: true,
      timeSlot: {
        ...updatedTimeSlot,
        employee: `${updatedTimeSlot.employee.prenom} ${updatedTimeSlot.employee.nom}`,
        tache: updatedTimeSlot.tache.label,
        planning: updatedTimeSlot.planning.nom
      }
    });

  } catch (error) {
    console.error('Erreur mise à jour créneau:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Données invalides', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { 
        error: 'Erreur lors de la mise à jour',
        details: process.env.NODE_ENV === 'development' && error instanceof Error ? error.message : undefined
      },
      { status: 500 }
    );
  }
}

async function updateSynthese(planningId: string, employeeId: string) {
  // Calcul des heures totales
  const creneaux = await prisma.creneau.findMany({
    where: { planningId, employeeId },
    select: { duree: true }
  });

  const totalMinutes = creneaux.reduce((sum, c) => sum + c.duree, 0);
  const heuresNormales = Math.floor(totalMinutes / 60);
  const heuresSupplementaires = totalMinutes % 60;

  // Mise à jour ou création de la synthèse
  const existing = await prisma.syntheseHeures.findFirst({
    where: { planningId, employeeId }
  });

  if (existing) {
    await prisma.syntheseHeures.update({
      where: { planningId_employeeId: { planningId, employeeId } },
      data: { heuresNormales, heuresSupplementaires }
    });
  } else {
    await prisma.syntheseHeures.create({
      data: {
        planningId,
        employeeId,
        periodeFrom: new Date(),
        periodeTo: new Date(),
        heuresNormales,
        heuresSupplementaires,
        statut: 'BROUILLON'
      }
    });
  }
}