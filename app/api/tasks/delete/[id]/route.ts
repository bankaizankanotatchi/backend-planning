// app/api/tasks/delete/[id]/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth/jwt';

export async function DELETE(
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
    const canDeleteTask = decoded.permissions.includes('TASK_DELETE') || 
                         decoded.hasAllAccess;
    if (!canDeleteTask) {
      return NextResponse.json(
        { error: 'Permissions insuffisantes pour supprimer des tâches' },
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

    // 4. Vérification de l'existence de la tâche
    const existingTask = await prisma.tache.findUnique({
      where: { id: taskId },
      select: { id: true, employeeId: true }
    });

    if (!existingTask) {
      return NextResponse.json(
        { error: 'Tâche non trouvée' },
        { status: 404 }
      );
    }

      // 5. Vérification des créneaux associés
      const associatedSlots = await prisma.creneau.findMany({
        where: { tacheId: taskId },
        select: { id: true }
      });
  
      if (associatedSlots.length > 0) {
        return NextResponse.json(
          { error: 'Impossible de supprimer cette tâche car elle appartient à un ou plusieurs créneaux' },
          { status: 400 }
        );
      }

    // 6. Suppression de la tâche
    await prisma.tache.delete({
      where: { id: taskId }
    });

    try {
      await prisma.notification.create({
        data: {
          destinataireId: existingTask.employeeId,
          message: `Une tâche vous ayant été assignée a été supprimée`,
          statut: 'ENVOYEE'
        }
      });
    } catch (notificationError) {
      console.error('Erreur lors de la création de la notification:', notificationError);
    }

    return NextResponse.json({
      success: true,
      message: 'Tâche supprimée avec succès'
    });

  } catch (error) {
    console.error('[DELETE_TASK_ERROR]', error);

    return NextResponse.json(
      { 
        error: 'Erreur lors de la suppression de la tâche',
        details: process.env.NODE_ENV === 'development' 
          ? (error instanceof Error ? error.message : undefined)
          : undefined
      },
      { status: 500 }
    );
  }
}