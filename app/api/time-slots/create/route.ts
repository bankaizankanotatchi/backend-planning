import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth/jwt';
import { TypeCreneau, EnumStatutTache } from '@prisma/client';
import { z } from 'zod';

// Schéma de validation avec Zod
const timeSlotSchema = z.object({
  planningId: z.string().uuid(),
  employeeId: z.string().uuid(),
  tacheId: z.string().uuid(),
  dateDebut: z.string().datetime(),
  dateFin: z.string().datetime(),
  type: z.nativeEnum(TypeCreneau),
  duree: z.number().int().positive(),
  commentaire: z.string().optional(),
  valide: z.boolean().optional().default(false),
  statutTache: z.nativeEnum(EnumStatutTache).optional().default('A_FAIRE')
});

export async function POST(request: Request) {
  try {
    // 1. Authentification et vérification des permissions
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ error: 'Token manquant' }, { status: 401 });
    }

    const decoded = await verifyToken(token);
    const hasPermission = decoded.permissions.includes('PLANNING_CREATE') || decoded.hasAllAccess;
    if (!hasPermission) {
      return NextResponse.json({ error: 'Permissions insuffisantes' }, { status: 403 });
    }

    // 2. Validation des données
    const body = await request.json();
    const validatedData = timeSlotSchema.parse(body);

    // 3. Vérification des conflits
    const conflicts = await prisma.creneau.findMany({
      where: {
        employeeId: validatedData.employeeId,
        NOT: { planningId: validatedData.planningId }, // Exclure les créneaux du même planning
        OR: [
          {
            dateDebut: { lt: new Date(validatedData.dateFin) },
            dateFin: { gt: new Date(validatedData.dateDebut) }
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

    // 4. Vérification de l'existence des entités liées
    const [employeeExists, taskExists, planningExists] = await Promise.all([
      prisma.employee.findUnique({ where: { id: validatedData.employeeId } }),
      prisma.tache.findUnique({ where: { id: validatedData.tacheId } }),
      prisma.planning.findUnique({ where: { id: validatedData.planningId } })
    ]);

    if (!employeeExists) {
      return NextResponse.json({ error: 'Employé non trouvé' }, { status: 404 });
    }
    if (!taskExists) {
      return NextResponse.json({ error: 'Tâche non trouvée' }, { status: 404 });
    }
    if (!planningExists) {
      return NextResponse.json({ error: 'Planning non trouvé' }, { status: 404 });
    }

    // 5. Création du créneau
    const newTimeSlot = await prisma.creneau.create({
      data: {
        ...validatedData,
        dateDebut: new Date(validatedData.dateDebut),
        dateFin: new Date(validatedData.dateFin),
        // Garantir les valeurs par défaut
        valide: validatedData.valide,
        statutTache: validatedData.statutTache
      },
      include: {
        employee: {
          select: { nom: true, prenom: true }
        },
        tache: {
          select: { label: true }
        },
        planning: {
          select: { nom: true }
        }
      }
    });

    // 6. Mise à jour de la synthèse horaire
    await updateSynthese(validatedData.planningId, validatedData.employeeId);

    return NextResponse.json(
      {
        success: true,
        timeSlot: {
          ...newTimeSlot,
          employee: `${newTimeSlot.employee.prenom} ${newTimeSlot.employee.nom}`,
          tache: newTimeSlot.tache.label,
          planning: newTimeSlot.planning.nom
        }
      },
      { status: 201 }
    );

  } catch (error) {
    console.error('Erreur création créneau:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Données invalides', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { 
        error: 'Erreur lors de la création',
        details: process.env.NODE_ENV === 'development' ? (error instanceof Error && error.message) : undefined
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

  // Upsert de la synthèse
  await prisma.syntheseHeures.upsert({
    where: {
      planningId_employeeId: { planningId, employeeId }
    },
    update: {
      heuresNormales,
      heuresSupplementaires
    },
    create: {
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