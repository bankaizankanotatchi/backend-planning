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