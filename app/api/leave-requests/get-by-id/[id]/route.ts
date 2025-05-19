/**
 * Gestionnaire pour la récupération d'une demande de congé par son ID.
 *
 * @param request - L'objet de requête HTTP.
 * @param params - Les paramètres de la requête, contenant l'ID de la demande de congé.
 * 
 * @returns Une réponse JSON contenant les détails de la demande de congé si elle est trouvée
 * et que l'utilisateur a les droits d'accès nécessaires. Sinon, retourne une erreur avec
 * un code de statut approprié.
 * 
 * @throws {401} Si l'utilisateur n'est pas authentifié ou si le token est invalide/expiré.
 * @throws {400} Si l'ID de la demande de congé est manquant.
 * @throws {403} Si l'utilisateur n'a pas les permissions nécessaires pour accéder à la demande.
 * @throws {404} Si la demande de congé n'est pas trouvée.
 * @throws {500} En cas d'erreur serveur lors de la récupération des données.
 * 
 * ### Étapes principales :
 * 1. **Authentification** : Vérifie la présence et la validité du token JWT.
 * 2. **Validation de l'ID** : Vérifie que l'ID de la demande de congé est fourni.
 * 3. **Vérification des permissions** : Vérifie si l'utilisateur a les droits nécessaires
 *    (administrateur, membre de l'équipe ou propriétaire de la demande).
 * 4. **Récupération des données** : Récupère les informations de la demande de congé depuis la base de données.
 * 5. **Vérification des droits d'accès** : Vérifie si l'utilisateur peut accéder à la demande.
 * 6. **Formatage de la réponse** : Retourne les données formatées de la demande de congé.
 * 
 * ### Structure de la réponse en cas de succès :
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "id": "string",
 *     "type": "string",
 *     "dateDebut": "string (ISO format)",
 *     "dateFin": "string (ISO format)",
 *     "statut": "string",
 *     "commentaire": "string",
 *     "employee": {
 *       "id": "string",
 *       "fullName": "string",
 *       "email": "string",
 *       "poste": "string | null"
 *     }
 *   }
 * }
 * ```
 */
// app/api/leave-requests/get-by-id/[id]/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth/jwt';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = (await params).id;
  try {
    // 1. Authentification
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

    // 2. Validation de l'ID
    const leaveRequestId = id;
    if (!leaveRequestId) {
      return NextResponse.json(
        { error: 'ID de demande de congé manquant' },
        { status: 400 }
      );
    }

    // 3. Vérification des permissions
    const isAdmin = decoded.hasAllAccess;
    const canViewTeam = decoded.permissions.includes('LEAVE_VIEW_TEAM');
    const isRegularUser = decoded.permissions.includes('LEAVE_REQUEST');

    // 4. Récupération de la demande
    const leaveRequest = await prisma.conge.findUnique({
      where: { id: leaveRequestId },
      include: {
        employee: {
          select: {
            id: true,
            nom: true,
            prenom: true,
            email: true,
            poste: {
              select: {
                nom: true
              }
            }
          }
        }
      }
    });

    if (!leaveRequest) {
      return NextResponse.json(
        { error: 'Demande de congé non trouvée' },
        { status: 404 }
      );
    }

    // 5. Vérification des droits d'accès
    const isOwner = leaveRequest.employeeId === decoded.employeeId;
    const canAccess = isAdmin || canViewTeam || isOwner;

    if (!canAccess) {
      return NextResponse.json(
        { error: 'Accès non autorisé à cette demande' },
        { status: 403 }
      );
    }

    // 6. Formatage de la réponse
    const responseData = {
      id: leaveRequest.id,
      type: leaveRequest.type,
      dateDebut: leaveRequest.dateDebut.toISOString(),
      dateFin: leaveRequest.dateFin.toISOString(),
      statut: leaveRequest.statut,
      commentaire: leaveRequest.commentaire,
      employee: {
        id: leaveRequest.employee.id,
        fullName: `${leaveRequest.employee.prenom} ${leaveRequest.employee.nom}`,
        email: leaveRequest.employee.email,
        poste: leaveRequest.employee.poste?.nom
      }
    };

    return NextResponse.json({
      success: true,
      data: responseData
    });

  } catch (error) {
    console.error('[GET_LEAVE_REQUEST_BY_ID_ERROR]', error);

    return NextResponse.json(
      { 
        error: 'Erreur lors de la récupération de la demande',
        details: process.env.NODE_ENV === 'development' 
          ? (error instanceof Error ? error.message : undefined)
          : undefined
      },
      { status: 500 }
    );
  }
}