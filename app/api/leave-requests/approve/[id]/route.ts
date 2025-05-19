/**
 * @module ApproveLeaveRequestAPI
 * 
 * @description
 * API pour approuver une demande de congé. Cette route permet de valider une demande de congé
 * en effectuant plusieurs vérifications, notamment l'authentification, les permissions, 
 * la validation des données et la gestion des conflits potentiels.
 * 
 * @function POST
 * 
 * @param {Request} request - L'objet de la requête HTTP.
 * @param {Object} context - Contexte de la requête contenant les paramètres dynamiques.
 * @param {Promise<{ id: string }>} context.params - Les paramètres de la requête, incluant l'ID de la demande de congé.
 * 
 * @returns {NextResponse} - Une réponse JSON contenant le résultat de l'opération.
 * 
 * @throws {401} - Si l'utilisateur n'est pas authentifié ou si le token est invalide/expiré.
 * @throws {403} - Si l'utilisateur n'a pas les permissions nécessaires ou tente d'approuver sa propre demande.
 * @throws {400} - Si l'ID de la demande est manquant ou si le statut actuel de la demande ne permet pas l'approbation.
 * @throws {404} - Si la demande de congé n'est pas trouvée.
 * @throws {409} - Si un conflit est détecté avec d'autres congés déjà approuvés.
 * @throws {500} - En cas d'erreur serveur lors du traitement de la demande.
 * 
 * @example
 * // Requête POST pour approuver une demande de congé
 * fetch('/api/leave-requests/approve/123', {
 *   method: 'POST',
 *   headers: {
 *     'Authorization': 'Bearer <token>',
 *     'Content-Type': 'application/json'
 *   },
 *   body: JSON.stringify({
 *     approvalComment: 'Approuvé après vérification'
 *   })
 * });
 * 
 * @remarks
 * - Cette API vérifie que l'utilisateur dispose des permissions nécessaires (LEAVE_APPROVE ou ALL_ACCESS).
 * - Elle empêche l'auto-approbation des demandes de congé.
 * - Elle valide les données optionnelles fournies dans le corps de la requête.
 * - Elle détecte les conflits potentiels avec d'autres congés approuvés pour le même employé.
 * - Une notification est envoyée à l'employé concerné après l'approbation.
 */
// app/api/leave-requests/approve/[id]/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth/jwt';
import { StatutDemande } from '@prisma/client';
import { z } from 'zod';

// Schéma pour le corps de la requête (optionnel)
const approveSchema = z.object({
  approvalComment: z.string().max(500).optional()
});

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

    // 2. Vérification des permissions (LEAVE_APPROVE ou ALL_ACCESS)
    const canApprove = decoded.permissions.includes('LEAVE_APPROVE') || 
                      decoded.hasAllAccess;
    if (!canApprove) {
      return NextResponse.json(
        { error: 'Permissions insuffisantes pour approuver des congés' },
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

    if (!existingRequest) {
      return NextResponse.json(
        { error: 'Demande de congé non trouvée' },
        { status: 404 }
      );
    }

     // Empêcher l'auto-approbation
    if (existingRequest.employeeId === decoded.employeeId) {
      return NextResponse.json(
        { error: 'Vous ne pouvez pas approuver votre propre demande de congé' },
        { status: 403 }
      );
    }

    // 5. Vérification du statut actuel
    if (existingRequest.statut !== 'EN_ATTENTE') {
      return NextResponse.json(
        { 
          error: 'Action impossible',
          details: `Seules les demandes avec statut "EN_ATTENTE" peuvent être approuvées (statut actuel: ${existingRequest.statut})`
        },
        { status: 400 }
      );
    }

    // 6. Validation des données optionnelles
    let approvalComment = '';
    try {
      const body = await request.json();
      const validatedData = approveSchema.parse(body);
      approvalComment = validatedData.approvalComment || '';
    } catch {
      // Le corps de la requête est optionnel
    }

    // 7. Vérification des conflits potentiels (optionnel)
    const conflictingRequests = await prisma.conge.findMany({
      where: {
        employeeId: existingRequest.employee.id,
        id: { not: leaveRequestId },
        statut: 'VALIDE',
        OR: [
          {
            dateDebut: { lte: existingRequest.dateFin },
            dateFin: { gte: existingRequest.dateDebut }
          }
        ]
      }
    });

    if (conflictingRequests.length > 0) {
      return NextResponse.json(
        {
          error: 'Conflit détecté avec des congés déjà approuvés',
          conflicts: conflictingRequests.map(req => ({
            id: req.id,
            type: req.type,
            dateDebut: req.dateDebut,
            dateFin: req.dateFin
          }))
        },
        { status: 409 }
      );
    }

    // 8. Approbation de la demande
    const approvedRequest = await prisma.conge.update({
      where: { id: leaveRequestId },
      data: { 
        statut: 'VALIDE',
        approveAt: new Date(),
        approveBy: decoded.employeeId,
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
          destinataireId: approvedRequest.employee.id,
          message: `Demande de congé approvée: ${approvedRequest.type}`,
      }
  });


    return NextResponse.json({
      success: true,
      data: {
        ...approvedRequest,
        dateDebut: approvedRequest.dateDebut.toISOString(),
        dateFin: approvedRequest.dateFin.toISOString(),
        employee: `${approvedRequest.employee.prenom} ${approvedRequest.employee.nom}`
      },
      message: 'Demande approuvée avec succès'
    });

  } catch (error) {
    console.error('[APPROVE_LEAVE_REQUEST_ERROR]', error);

    return NextResponse.json(
      { 
        error: 'Erreur lors de l\'approbation de la demande',
        details: process.env.NODE_ENV === 'development' 
          ? (error instanceof Error ? error.message : undefined)
          : undefined
      },
      { status: 500 }
    );
  }
}