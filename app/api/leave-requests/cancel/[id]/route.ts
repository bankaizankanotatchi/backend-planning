// app/api/leave-requests/cancel/[id]/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth/jwt';
import { StatutDemande } from '@prisma/client';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = (await params).id;
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
    const leaveRequestId = id;
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
        { error: 'Vous ne pouvez pas annuler cette demande' },
        { status: 403 }
      );
    }

    // 6. Vérification du statut actuel
    const allowedStatuses = ['EN_ATTENTE', 'VALIDE'];
    if (!allowedStatuses.includes(existingRequest.statut)) {
      return NextResponse.json(
        { 
          error: 'Annulation impossible',
          details: `Le statut actuel (${existingRequest.statut}) ne permet pas l'annulation`
        },
        { status: 400 }
      );
    }

    // 7. Vérification de la date (on ne peut pas annuler un congé déjà passé)
    const now = new Date();
    if (existingRequest.dateDebut < now) {
      return NextResponse.json(
        { 
          error: 'Annulation impossible',
          details: 'La période de congé a déjà commencé'
        },
        { status: 400 }
      );
    }

    // 8. Annulation de la demande
    const cancelledRequest = await prisma.conge.update({
      where: { id: leaveRequestId },
      data: { 
        statut: 'ANNULEE',
        cancelledAt: new Date(),
        cancelledBy: decoded.employeeId
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

 // 9. Envoi de notification (exemple)
    // À implémenter selon votre système de notifications
    await prisma.notification.create({
      data: {
          destinataireId: cancelledRequest.employee.id,
          message: `Demande de congé annulée: ${cancelledRequest.type}`,
      }
  });

    return NextResponse.json({
      success: true,
      data: {
        ...cancelledRequest,
        dateDebut: cancelledRequest.dateDebut.toISOString(),
        dateFin: cancelledRequest.dateFin.toISOString(),
        employee: `${cancelledRequest.employee.prenom} ${cancelledRequest.employee.nom}`
      },
      message: 'Demande annulée avec succès'
    });

  } catch (error) {
    console.error('[CANCEL_LEAVE_REQUEST_ERROR]', error);

    return NextResponse.json(
      { 
        error: 'Erreur lors de l\'annulation de la demande',
        details: process.env.NODE_ENV === 'development' 
          ? (error instanceof Error ? error.message : undefined)
          : undefined
      },
      { status: 500 }
    );
  }
}