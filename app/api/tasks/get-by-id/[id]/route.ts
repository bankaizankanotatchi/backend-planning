// app/api/tasks/get-by-id/[id]/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth/jwt';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
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
    const isAdmin = decoded.permissions.includes('ALL_ACCESS');
    const canViewAllTasks = decoded.permissions.includes('TASK_VIEW_ALL');
    const canViewOwnTasks = decoded.permissions.includes('TASK_VIEW_OWN');

    if (!isAdmin && !canViewAllTasks && !canViewOwnTasks) {
      return NextResponse.json(
        { error: 'Permissions insuffisantes' },
        { status: 403 }
      );
    }

    // 3. Validation de l'ID
    const taskId = params.id;
    if (!taskId) {
      return NextResponse.json(
        { error: 'ID de tâche manquant' },
        { status: 400 }
      );
    }

    // 4. Récupération de la tâche
    const task = await prisma.tache.findUnique({
      where: { id: taskId },
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
            dateDebut: true,
            dateFin: true,
            type: true
          }
        }
      }
    });

    if (!task) {
      return NextResponse.json(
        { error: 'Tâche non trouvée' },
        { status: 404 }
      );
    }

    // 5. Vérification des droits d'accès
    const isOwner = task.employee.id === decoded.employeeId;
    const canAccess = isAdmin || canViewAllTasks || (canViewOwnTasks && isOwner);

    if (!canAccess) {
      return NextResponse.json(
        { error: 'Accès non autorisé à cette tâche' },
        { status: 403 }
      );
    }

    // 6. Formatage de la réponse
    const responseData = {
      ...task,
      dateLimite: task.dateLimite.toISOString(),
      employee: {
        id: task.employee.id,
        fullName: `${task.employee.prenom} ${task.employee.nom}`,
        email: task.employee.email,
        poste: task.employee.poste?.nom
      },
      creneaux: task.creneaux.map(creneau => ({
        ...creneau,
        dateDebut: creneau.dateDebut.toISOString(),
        dateFin: creneau.dateFin.toISOString()
      }))
    };

    return NextResponse.json({
      success: true,
      data: responseData
    });

  } catch (error) {
    console.error('[GET_TASK_BY_ID_ERROR]', error);

    return NextResponse.json(
      { 
        error: 'Erreur lors de la récupération de la tâche',
        details: process.env.NODE_ENV === 'development' 
          ? (error instanceof Error ? error.message : undefined)
          : undefined
      },
      { status: 500 }
    );
  }
}