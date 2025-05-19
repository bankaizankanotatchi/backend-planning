/**
 * Annule une demande de congé existante.
 *
 * @param request - L'objet de requête HTTP contenant les informations nécessaires.
 * @param params - Les paramètres de la requête, incluant l'ID de la demande de congé.
 *
 * @returns Une réponse JSON indiquant le succès ou l'échec de l'opération.
 *
 * @throws {401} Si l'utilisateur n'est pas authentifié ou si le token est invalide/expiré.
 * @throws {403} Si l'utilisateur n'a pas les permissions nécessaires pour annuler la demande.
 * @throws {400} Si l'ID de la demande est manquant, si le statut actuel ne permet pas l'annulation,
 *               ou si la période de congé a déjà commencé.
 * @throws {404} Si la demande de congé n'est pas trouvée.
 * @throws {500} En cas d'erreur interne du serveur.
 *
 * ### Étapes de traitement :
 * 1. **Authentification** : Vérifie la présence et la validité du token JWT.
 * 2. **Vérification des permissions** : Vérifie si l'utilisateur est administrateur, manager ou propriétaire de la demande.
 * 3. **Validation de l'ID** : Vérifie que l'ID de la demande de congé est fourni.
 * 4. **Récupération de la demande** : Récupère la demande de congé existante depuis la base de données.
 * 5. **Vérification des droits** : Vérifie si l'utilisateur a le droit d'annuler cette demande.
 * 6. **Vérification du statut** : Vérifie si le statut actuel de la demande permet l'annulation.
 * 7. **Vérification de la date** : Vérifie que la période de congé n'a pas encore commencé.
 * 8. **Annulation de la demande** : Met à jour le statut de la demande à "ANNULEE" et enregistre les informations d'annulation.
 * 9. **Notification** : Envoie une notification à l'employé concerné (à implémenter selon le système de notifications).
 *
 * ### Exemple de réponse en cas de succès :
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "id": "123",
 *     "statut": "ANNULEE",
 *     "dateDebut": "2023-01-01T00:00:00.000Z",
 *     "dateFin": "2023-01-10T00:00:00.000Z",
 *     "employee": "John Doe"
 *   },
 *   "message": "Demande annulée avec succès"
 * }
 * ```
 */
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