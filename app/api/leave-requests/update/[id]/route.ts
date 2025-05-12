// app/api/leave-requests/update/[id]/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth/jwt';
import { TypeConge, StatutDemande } from '@prisma/client';
import { z } from 'zod';

// Schéma de validation avec Zod
const updateLeaveRequestSchema = z.object({
  type: z.nativeEnum(TypeConge).optional(),
  dateDebut: z.string().datetime().optional(),
  dateFin: z.string().datetime().optional(),
  commentaire: z.string().max(500).optional(),
  statut: z.nativeEnum(StatutDemande).optional()
});

// Fonction pour calculer les jours ouvrés (identique à create)
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

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
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

    // 2. Vérification des permissions
    const isAdmin = decoded.hasAllAccess;
    const canManageLeave = decoded.permissions.includes('LEAVE_MANAGE');
    const isRegularUser = decoded.permissions.includes('LEAVE_REQUEST');

    if (!isAdmin && !canManageLeave && !isRegularUser) {
      return NextResponse.json(
        { error: 'Permissions insuffisantes' },
        { status: 403 }
      );
    }

    // 3. Validation de l'ID
    const leaveRequestId = params.id;
    if (!leaveRequestId) {
      return NextResponse.json(
        { error: 'ID de demande de congé manquant' },
        { status: 400 }
      );
    }

    // 4. Récupération de la demande existante
    const existingRequest = await prisma.conge.findUnique({
      where: { id: leaveRequestId },
      include: { employee: true }
    });

    if (!existingRequest) {
      return NextResponse.json(
        { error: 'Demande de congé non trouvée' },
        { status: 404 }
      );
    }

    // 5. Vérification des droits (admin, manager ou propriétaire)
    const isOwner = existingRequest.employeeId === decoded.employeeId;
    if (!isOwner && !isAdmin && !canManageLeave) {
      return NextResponse.json(
        { error: 'Vous ne pouvez pas modifier cette demande' },
        { status: 403 }
      );
    }

    // 6. Validation des données
    const body = await request.json();
    const validatedData = updateLeaveRequestSchema.parse(body);

    // Préparation des données à mettre à jour
    const updateData: any = { ...validatedData };

    // Conversion des dates si fournies
    let dateDebut = existingRequest.dateDebut;
    let dateFin = existingRequest.dateFin;
    
    if (validatedData.dateDebut) {
      dateDebut = new Date(validatedData.dateDebut);
      updateData.dateDebut = dateDebut;
    }

    if (validatedData.dateFin) {
      dateFin = new Date(validatedData.dateFin);
      updateData.dateFin = dateFin;
    }

    // 7. Validation des dates si modifiées
    if (validatedData.dateDebut || validatedData.dateFin) {
      if (dateDebut >= dateFin) {
        return NextResponse.json(
          { error: 'La date de fin doit être postérieure à la date de début' },
          { status: 400 }
        );
      }

      // Vérification de la durée maximale selon le type
      const type = validatedData.type || existingRequest.type;
      const joursOuvres = calculateWorkingDays(dateDebut, dateFin);

      switch (type) {
        case 'ANNUEL':
          if (joursOuvres > 24) {
            return NextResponse.json(
              { error: 'La durée maximale pour un congé annuel est de 24 jours ouvrés' },
              { status: 400 }
            );
          }
          break;

        case 'PARENTAL':
          if (joursOuvres > 90) {
            return NextResponse.json(
              { error: 'La durée maximale pour un congé parental est de 90 jours ouvrés' },
              { status: 400 }
            );
          }
          break;

        default:
          // Vérification de la durée maximale (1 an)
          const oneYearLater = new Date(dateDebut);
          oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
          if (dateFin > oneYearLater) {
            return NextResponse.json(
              { error: 'La durée maximale de congé est de 1 an' },
              { status: 400 }
            );
          }
      }
    }

    // 8. Vérification des conflits si dates modifiées
    if (validatedData.dateDebut || validatedData.dateFin) {
      const conflictingLeaves = await prisma.conge.findMany({
        where: {
          employeeId: existingRequest.employeeId,
          id: { not: leaveRequestId }, // Exclure la demande actuelle
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
    }

          // Empêcher l'auto
          if (existingRequest.employeeId === decoded.employeeId) {
            return NextResponse.json(
              { error: 'Vous ne pouvez pas changer le status de votre propre demande de congé' },
              { status: 403 }
            );
          }

    // 9. Restrictions pour les non-admins
    if (!isAdmin && !canManageLeave) {
      // Les utilisateurs normaux ne peuvent pas modifier le statut
      delete updateData.statut;
      
      // Ils ne peuvent modifier que leurs propres demandes "EN_ATTENTE"
      if (existingRequest.statut !== 'EN_ATTENTE') {
        return NextResponse.json(
          { error: 'Seules les demandes en attente peuvent être modifiées' },
          { status: 403 }
        );
      }
    }

    // 10. Mise à jour de la demande
    const updatedRequest = await prisma.conge.update({
      where: { id: leaveRequestId },
      data: {
        ...updateData,
        updatedAt: new Date(),
        updatedBy: decoded.employeeId
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

    //envoie notification
    await prisma.notification.create({
      data: {
        message: `La demande de congé a été mise à jour`,
        destinataireId: updatedRequest.employeeId,
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        ...updatedRequest,
        dateDebut: updatedRequest.dateDebut.toISOString(),
        dateFin: updatedRequest.dateFin.toISOString(),
        employee: `${updatedRequest.employee.prenom} ${updatedRequest.employee.nom}`
      }
    });

  } catch (error) {
    console.error('[UPDATE_LEAVE_REQUEST_ERROR]', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Données invalides', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { 
        error: 'Erreur lors de la mise à jour de la demande',
        details: process.env.NODE_ENV === 'development' 
          ? (error instanceof Error ? error.message : undefined)
          : undefined
      },
      { status: 500 }
    );
  }
}