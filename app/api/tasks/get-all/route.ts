/**
 * Gestionnaire pour la route GET `/api/tasks/get-all`.
 * Cette API permet de récupérer une liste de tâches en fonction des permissions de l'utilisateur authentifié.
 *
 * @param {Request} request - L'objet de requête HTTP.
 * 
 * @returns {Promise<NextResponse>} Une réponse JSON contenant les tâches récupérées ou un message d'erreur.
 *
 * ### Processus :
 * 1. **Authentification** :
 *    - Vérifie la présence d'un token d'authentification dans les en-têtes de la requête.
 *    - Valide le token et extrait les informations de l'utilisateur.
 *    - Retourne une erreur 401 si le token est manquant ou invalide.
 *
 * 2. **Vérification des permissions** :
 *    - Vérifie si l'utilisateur a les permissions nécessaires pour accéder aux tâches.
 *    - Permissions possibles :
 *      - `hasAllAccess` : Accès administrateur à toutes les tâches.
 *      - `TASK_VIEW_ALL` : Accès à toutes les tâches.
 *      - `TASK_VIEW_OWN` : Accès uniquement aux tâches de l'utilisateur.
 *    - Retourne une erreur 403 si les permissions sont insuffisantes.
 *
 * 3. **Détermination du scope des données** :
 *    - Si l'utilisateur est administrateur ou a la permission `TASK_VIEW_ALL`, toutes les tâches sont récupérées.
 *    - Sinon, seules les tâches associées à l'utilisateur (via `employeeId`) sont récupérées.
 *
 * 4. **Récupération des tâches** :
 *    - Utilise Prisma pour interroger la base de données et récupérer les tâches avec leurs relations :
 *      - Employé associé à la tâche (nom, prénom, email, poste).
 *      - Créneaux associés à la tâche (type, date de début, date de fin).
 *    - Limite le nombre de tâches récupérées à 1000 pour des raisons de performance.
 *
 * 5. **Formatage des données** :
 *    - Formate les données pour le front-end, notamment :
 *      - Conversion des dates en chaînes ISO.
 *      - Construction d'un nom complet pour l'employé.
 *      - Extraction des informations pertinentes.
 *
 * 6. **Réponse** :
 *    - Retourne une réponse JSON contenant :
 *      - `success` : Indique si l'opération a réussi.
 *      - `data` : La liste des tâches formatées.
 *      - `meta` : Métadonnées sur la réponse (nombre de tâches, vue administrateur, etc.).
 *    - En cas d'erreur, retourne une réponse JSON avec un message d'erreur et un code d'état HTTP approprié.
 *
 * ### Codes d'état possibles :
 * - `200` : Succès.
 * - `401` : Authentification requise ou token invalide.
 * - `403` : Permissions insuffisantes.
 * - `500` : Erreur interne du serveur.
 */
// app/api/tasks/get-all/route.ts

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
    const canViewAllTasks = decoded.permissions.includes('TASK_VIEW_ALL');
    const isRegularUser = decoded.permissions.includes('TASK_VIEW_OWN');

    if (!isAdmin && !canViewAllTasks && !isRegularUser) {
      return NextResponse.json(
        { error: 'Permissions insuffisantes' },
        { status: 403 }
      );
    }

    // 3. Détermination du scope des données
    const whereClause = isAdmin || canViewAllTasks 
      ? {} 
      : { employeeId: decoded.employeeId };

    // 4. Récupération des tâches avec les relations nécessaires
    const tasks = await prisma.tache.findMany({
      where: whereClause,
      take: 1000, // Limite raisonnable pour le front-end
      select: {
        id: true,
        label: true,
        description: true,
        dateLimite: true,
        statut: true,
        createdAt: true,
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
        },
        creneaux: {
          select: {
            id: true,
            type: true,
            dateDebut: true,
            dateFin: true
          }
        }   
      }
    });

    // 5. Formatage des données pour le front-end
    const formattedTasks = tasks.map(task => ({
      ...task,
      dateLimite: task.dateLimite.toISOString(),
      employee: {
        id: task.employee.id,
        fullName: `${task.employee.prenom} ${task.employee.nom}`,
        email: task.employee.email,
        poste: task.employee.poste?.nom
      },
    }));

    return NextResponse.json({
      success: true,
      data: formattedTasks,
      meta: {
        count: formattedTasks.length,
        isAdminView: isAdmin,
        canViewAllTasks: canViewAllTasks
      }
    });

  } catch (error) {
    console.error('[GET_ALL_TASKS_ERROR]', error);

    return NextResponse.json(
      { 
        error: 'Erreur lors de la récupération des tâches',
        details: process.env.NODE_ENV === 'development' 
          ? (error instanceof Error ? error.message : undefined)
          : undefined
      },
      { status: 500 }
    );
  }
}