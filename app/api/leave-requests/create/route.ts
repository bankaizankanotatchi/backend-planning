// app/api/leave-requests/create/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth/jwt';
import { TypeConge, StatutDemande, EnumJour } from '@prisma/client';
import { z } from 'zod';

// Schéma de validation avec Zod
const leaveRequestSchema = z.object({
  type: z.nativeEnum(TypeConge),
  dateDebut: z.string().datetime(),
  dateFin: z.string().datetime(),
  commentaire: z.string().max(500).optional(),
});

// Fonction pour calculer les jours ouvrés entre deux dates
function calculateWorkingDays(startDate: Date, endDate: Date): number {
  let count = 0;
  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  while (current <= end) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Exclure samedi (6) et dimanche (0)
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  return count;
}

export async function POST(request: Request) {
  try {
    // 1. Authentification et vérification des permissions
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json(
        { error: 'Authentification requise' }, 
        { status: 401 }
      );
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json(
        { error: 'Token invalide ou expiré' },
        { status: 401 }
      );
    }

    // Vérification de la permission LEAVE_REQUEST
    const hasPermission = decoded.permissions.includes('LEAVE_REQUEST') || 
                         decoded.hasAllAccess;
    if (!hasPermission) {
      return NextResponse.json(
        { error: 'Permissions insuffisantes pour créer une demande de congé' },
        { status: 403 }
      );
    }

    // 2. Validation des données
    const body = await request.json();
    const validatedData = leaveRequestSchema.parse(body);

    // Conversion des dates
    const dateDebut = new Date(validatedData.dateDebut);
    const dateFin = new Date(validatedData.dateFin);
    const createdAt = new Date();

    // 3. Validation des dates
    if (dateDebut >= dateFin) {
      return NextResponse.json(
        { error: 'La date de fin doit être postérieure à la date de début' },
        { status: 400 }
      );
    }

    // Calcul des jours ouvrés demandés
    const joursOuvresDemandes = calculateWorkingDays(dateDebut, dateFin);

    // 4. Validation selon le type de congé
    switch (validatedData.type) {
      case 'ANNUEL':
        if (joursOuvresDemandes > 24) {
          return NextResponse.json(
            { error: 'La durée maximale pour un congé annuel est de 24 jours ouvrés' },
            { status: 400 }
          );
        }
        break;

      case 'PARENTAL':
        if (joursOuvresDemandes > 90) {
          return NextResponse.json(
            { error: 'La durée maximale pour un congé parental est de 90 jours ouvrés' },
            { status: 400 }
          );
        }
        break;

      case 'MALADIE':
      case 'SANS_SOLDE':
        // Vérification que la demande ne dépasse pas 1 an
        const oneYearLater = new Date(dateDebut);
        oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
        if (dateFin > oneYearLater) {
          return NextResponse.json(
            { error: 'La durée maximale de congé est de 1 an' },
            { status: 400 }
          );
        }
        break;
    }

    // 5. Vérification des conflits avec les congés existants
    const conflictingLeaves = await prisma.conge.findMany({
      where: {
        employeeId: decoded.employeeId,
        statut: {
          in: ['EN_ATTENTE', 'VALIDE']
        },
        OR: [
          {
            dateDebut: { lte: dateFin },
            dateFin: { gte: dateDebut }
          }
        ]
      }
    });

    if (conflictingLeaves.length > 0) {
      return NextResponse.json(
        {
          error: 'Conflit avec des congés existants',
          conflicts: conflictingLeaves.map(leave => ({
            id: leave.id,
            type: leave.type,
            dateDebut: leave.dateDebut,
            dateFin: leave.dateFin,
            statut: leave.statut
          }))
        },
        { status: 409 }
      );
    }

    // 6. Création de la demande de congé
    const newLeaveRequest = await prisma.conge.create({
      data: {
        type: validatedData.type,
        dateDebut,
        dateFin,
        statut: 'EN_ATTENTE',
        commentaire: validatedData.commentaire,
        createdAt,
        employee: {
          connect: { id: decoded.employeeId }
        }
      },
      include: {
        employee: {
          select: {
            id: true,
            nom: true,
            prenom: true,
            email: true
          }
        }
      }
    });

    //envoie de la notification

    await prisma.notification.create({
      data: {
          destinataireId: newLeaveRequest.employee.id,
          message: `Demande de congé crée: ${newLeaveRequest.type}`,
      }
  });

    return NextResponse.json(
      {
        success: true,
        data: {
          ...newLeaveRequest,
          dateDebut: newLeaveRequest.dateDebut.toISOString(),
          dateFin: newLeaveRequest.dateFin.toISOString(),
          employee: `${newLeaveRequest.employee.prenom} ${newLeaveRequest.employee.nom}`,
          joursOuvres: joursOuvresDemandes // Ajout du nombre de jours ouvrés dans la réponse
        }
      },
      { status: 201 }
    );

  } catch (error) {
    console.error('[CREATE_LEAVE_REQUEST_ERROR]', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Données invalides', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { 
        error: 'Erreur lors de la création de la demande',
        details: process.env.NODE_ENV === 'development' 
          ? (error instanceof Error ? error.message : undefined)
          : undefined
      },
      { status: 500 }
    );
  }
}