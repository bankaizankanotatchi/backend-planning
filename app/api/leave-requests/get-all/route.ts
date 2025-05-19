/**
 * Gestionnaire pour la méthode GET de l'API des demandes de congé.
 * Cette fonction permet de récupérer une liste de demandes de congé
 * en fonction des permissions de l'utilisateur authentifié.
 *
 * @param request - L'objet `Request` de la requête entrante.
 * 
 * @returns Une réponse JSON contenant :
 * - `success`: Indique si l'opération a réussi.
 * - `data`: Une liste formatée des demandes de congé avec les informations des employés associés.
 * - `meta`: Métadonnées sur la réponse, incluant le nombre de demandes et les permissions de l'utilisateur.
 * - En cas d'erreur, un objet JSON avec un message d'erreur et un code de statut HTTP approprié.
 *
 * ### Étapes principales :
 * 1. **Authentification** :
 *    - Vérifie la présence et la validité du token JWT dans les en-têtes de la requête.
 *    - Retourne une erreur 401 si le token est manquant ou invalide.
 *
 * 2. **Vérification des permissions** :
 *    - Vérifie si l'utilisateur a les permissions nécessaires pour accéder aux données.
 *    - Permissions possibles :
 *      - `hasAllAccess`: Accès administrateur.
 *      - `LEAVE_VIEW_TEAM`: Accès pour voir les demandes de l'équipe.
 *      - `LEAVE_REQUEST`: Accès utilisateur régulier pour voir ses propres demandes.
 *    - Retourne une erreur 403 si les permissions sont insuffisantes.
 *
 * 3. **Détermination du scope des données** :
 *    - Si l'utilisateur n'est ni administrateur ni autorisé à voir les demandes de l'équipe,
 *      il ne peut voir que ses propres demandes.
 *
 * 4. **Récupération des données** :
 *    - Récupère les demandes de congé depuis la base de données avec une limite de 1000 enregistrements.
 *    - Inclut les relations nécessaires, comme les informations sur l'employé et son poste.
 *
 * 5. **Formatage des données** :
 *    - Formate les données pour le front-end, incluant les informations sur l'employé
 *      (nom complet, email, poste) et les détails de la demande (type, dates, statut, etc.).
 *
 * 6. **Gestion des erreurs** :
 *    - Capture et log les erreurs éventuelles.
 *    - Retourne une réponse 500 avec des détails supplémentaires en mode développement.
 *
 * ### Codes de statut HTTP possibles :
 * - `200`: Succès, données récupérées.
 * - `401`: Authentification requise ou token invalide.
 * - `403`: Permissions insuffisantes.
 * - `500`: Erreur interne du serveur.
 */
// app/api/leave-requests/get-all/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth/jwt';

export async function GET(request: Request) {
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

    // 2. Vérification des permissions
    const isAdmin = decoded.hasAllAccess;
    const canViewTeam = decoded.permissions.includes('LEAVE_VIEW_TEAM');
    const isRegularUser = decoded.permissions.includes('LEAVE_REQUEST');

    if (!isAdmin && !canViewTeam && !isRegularUser) {
      return NextResponse.json(
        { error: 'Permissions insuffisantes' },
        { status: 403 }
      );
    }

    // 3. Déterminer le scope des données
    const whereClause = !isAdmin && !canViewTeam 
      ? { employeeId: decoded.employeeId } 
      : {};

    // 4. Récupération des demandes avec les relations nécessaires
    const requests = await prisma.conge.findMany({
      where: whereClause,
      take: 1000, // Limite de sécurité
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

    // 5. Formatage des données pour le front-end
    const formattedData = requests.map(request => ({
      id: request.id,
      type: request.type,
      dateDebut: request.dateDebut.toISOString(),
      dateFin: request.dateFin.toISOString(),
      statut: request.statut,
      commentaire: request.commentaire,
      employee: {
        id: request.employee.id,
        fullName: `${request.employee.prenom} ${request.employee.nom}`,
        email: request.employee.email,
        poste: request.employee.poste?.nom
      }
    }));

    return NextResponse.json({
      success: true,
      data: formattedData,
      meta: {
        count: formattedData.length,
        isAdminView: isAdmin,
        canViewTeam: canViewTeam
      }
    });

  } catch (error) {
    console.error('[GET_LEAVE_REQUESTS_ERROR]', error);

    return NextResponse.json(
      { 
        error: 'Erreur lors de la récupération des demandes',
        details: process.env.NODE_ENV === 'development' 
          ? (error instanceof Error ? error.message : undefined)
          : undefined
      },
      { status: 500 }
    );
  }
}