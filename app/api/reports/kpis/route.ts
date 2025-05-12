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