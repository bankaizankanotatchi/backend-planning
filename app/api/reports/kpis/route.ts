
/**
 * Gestion des statistiques clés (KPIs) pour l'application de gestion de planning.
 * Cette API récupère et calcule diverses métriques liées aux plannings, employés, tâches et congés.
 *
 * @function GET
 * @param {Request} request - La requête HTTP entrante.
 * @returns {Promise<NextResponse>} Une réponse JSON contenant les statistiques ou une erreur.
 *
 * @description
 * Cette fonction effectue les étapes suivantes :
 * 1. Vérifie la présence et la validité du token d'autorisation.
 * 2. Vérifie les permissions de l'utilisateur pour accéder aux statistiques.
 * 3. Récupère les données nécessaires depuis la base de données Prisma en parallèle :
 *    - Nombre total de plannings.
 *    - Nombre total d'employés.
 *    - Nombre d'employés actifs.
 *    - Détails des plannings avec créneaux et synthèses.
 *    - Statistiques des tâches par statut.
 *    - Employé avec le plus de tâches terminées.
 *    - Employés ayant des tâches en attente ou en cours.
 *    - Statistiques des congés par statut.
 * 4. Calcule des statistiques supplémentaires :
 *    - Statistiques des plannings (nombre de créneaux et tâches validées).
 *    - Pourcentages des tâches par statut.
 *    - Pourcentages des congés par statut.
 *    - Formatage des employés avec le plus de tâches terminées.
 *    - Formatage des employés ayant des tâches en attente ou en cours.
 * 5. Construit et retourne une réponse JSON contenant toutes les statistiques calculées.
 *
 * @throws {Error} Retourne une erreur JSON avec un statut HTTP approprié en cas de :
 * - Absence ou invalidité du token d'autorisation (401).
 * - Permissions insuffisantes pour accéder aux statistiques (403).
 * - Erreur interne lors de la récupération ou du traitement des données (500).
 *
 * @example
 * // Exemple de réponse JSON en cas de succès :
 * {
 *   "plannings": {
 *     "total": 10,
 *     "details": [
 *       {
 *         "id": 1,
 *         "nom": "Planning A",
 *         "totalCreneaux": 5,
 *         "tachesTerminees": 3
 *       }
 *     ]
 *   },
 *   "employees": {
 *     "total": 50,
 *     "actifs": 45,
 *     "pourcentageActifs": 90
 *   },
 *   "taches": [
 *     {
 *       "statut": "TERMINEE",
 *       "count": 30,
 *       "percentage": 60
 *     }
 *   ],
 *   "topEmployee": {
 *     "id": 2,
 *     "nom": "Dupont",
 *     "prenom": "Jean",
 *     "tachesTerminees": 10
 *   },
 *   "employeesWithPendingTasks": [
 *     {
 *       "id": 3,
 *       "nom": "Martin",
 *       "prenom": "Claire",
 *       "tachesEnAttente": 2,
 *       "tachesEnCours": 1
 *     }
 *   ],
 *   "conges": [
 *     {
 *       "statut": "APPROUVE",
 *       "count": 5,
 *       "percentage": 50
 *     }
 *   ]
 * }
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth/jwt';

export async function GET(request: Request) {
  try {
    // Vérification du token et des permissions
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const decoded = await verifyToken(token);
    if (!decoded.permissions.includes('TEAM_VIEW_STATS') && !decoded.hasAllAccess) {
      return NextResponse.json({ error: 'Permissions insuffisantes' }, { status: 403 });
    }

    // Récupération de toutes les données nécessaires en parallèle
    const [
      totalPlannings,
      totalEmployees,
      activeEmployees,
      planningsWithCreneaux,
      tachesByStatus,
      employeesWithMostCompletedTasks,
      employeesWithPendingTasks,
      congesStats,
    ] = await Promise.all([
      prisma.planning.count(),
      prisma.employee.count(),
      prisma.employee.count({ where: { isActive: true } }),
      prisma.planning.findMany({
        include: {
          creneaux: true,
          syntheses: true,
        },
      }),
      prisma.tache.groupBy({
        by: ['statut'],
        _count: {
          statut: true,
        },
      }),
      prisma.employee.findMany({
        include: {
          taches: {
            where: {
              statut: 'TERMINEE',
            },
          },
        },
        orderBy: {
          taches: {
            _count: 'desc',
          },
        },
        take: 1,
      }),
      prisma.employee.findMany({
        where: {
          taches: {
            some: {
              statut: {
                in: ['A_FAIRE', 'EN_COURS'],
              },
            },
          },
        },
        include: {
          taches: {
            where: {
              statut: {
                in: ['A_FAIRE', 'EN_COURS'],
              },
            },
          },
        },
      }),
      prisma.conge.groupBy({
        by: ['statut'],
        _count: {
          statut: true,
        },
      }),
    ]);

    // Calcul des statistiques des plannings
    const planningsStats = planningsWithCreneaux.map(planning => ({
      id: planning.id,
      nom: planning.nom,
      totalCreneaux: planning.creneaux.length,
      tachesTerminees: planning.syntheses.filter(s => s.statut === 'VALIDE').length,
    }));

    // Calcul des pourcentages pour les tâches
    const totalTaches = tachesByStatus.reduce((acc, curr) => acc + curr._count.statut, 0);
    const tachesStats = tachesByStatus.map(item => ({
      statut: item.statut,
      count: item._count.statut,
      percentage: totalTaches > 0 ? Math.round((item._count.statut / totalTaches) * 100) : 0,
    }));

    // Calcul des pourcentages pour les congés
    const totalConges = congesStats.reduce((acc, curr) => acc + curr._count.statut, 0);
    const congesWithPercentage = congesStats.map(item => ({
      statut: item.statut,
      count: item._count.statut,
      percentage: totalConges > 0 ? Math.round((item._count.statut / totalConges) * 100) : 0,
    }));

    // Formatage des employés avec le plus de tâches terminées
    const topEmployee = employeesWithMostCompletedTasks.length > 0
      ? {
          id: employeesWithMostCompletedTasks[0].id,
          nom: employeesWithMostCompletedTasks[0].nom,
          prenom: employeesWithMostCompletedTasks[0].prenom,
          tachesTerminees: employeesWithMostCompletedTasks[0].taches.length,
        }
      : null;

    // Formatage des employés avec tâches en cours
    const employeesWithTasks = employeesWithPendingTasks.map(employee => ({
      id: employee.id,
      nom: employee.nom,
      prenom: employee.prenom,
      tachesEnAttente: employee.taches.filter(t => t.statut === 'A_FAIRE').length,
      tachesEnCours: employee.taches.filter(t => t.statut === 'EN_COURS').length,
    }));

    // Construction de la réponse
    const response = {
      plannings: {
        total: totalPlannings,
        details: planningsStats,
      },
      employees: {
        total: totalEmployees,
        actifs: activeEmployees,
        pourcentageActifs: Math.round((activeEmployees / totalEmployees) * 100) || 0,
      },
      taches: tachesStats,
      topEmployee,
      employeesWithPendingTasks: employeesWithTasks,
      conges: congesWithPercentage,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Erreur lors de la récupération des KPIs:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des statistiques' },
      { status: 500 }
    );
  }
}