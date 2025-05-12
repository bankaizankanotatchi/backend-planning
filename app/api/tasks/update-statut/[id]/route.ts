// app/api/tasks/update-status/[id]/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth/jwt';
import { EnumStatutTache } from '@prisma/client';
import { z } from 'zod';

// Schéma de validation
const updateStatusSchema = z.object({
  statut: z.nativeEnum(EnumStatutTache),
  commentaire: z.string().max(500).optional()
});

export async function PATCH(
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
    const canUpdateStatus = decoded.permissions.includes('TASK_UPDATE_STATUS') || 
                          decoded.permissions.includes('ALL_ACCESS');
    if (!canUpdateStatus) {
      return NextResponse.json(
        { error: 'Permissions insuffisantes pour modifier le statut des tâches' },
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

    // 4. Récupération de la tâche existante
    const existingTask = await prisma.tache.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        label: true,
        statut: true,
        employeeId: true
      }
    });

    if (!existingTask) {
      return NextResponse.json(
        { error: 'Tâche non trouvée' },
        { status: 404 }
      );
    }

    // 5. Validation des données
    const body = await request.json();
    const validatedData = updateStatusSchema.parse(body);

    // 6. Vérification des transitions de statut valides (optionnel)
    const validTransitions: Record<EnumStatutTache, EnumStatutTache[]> = {
      'A_FAIRE': ['EN_COURS', 'ANNULEE'],
      'EN_COURS': ['TERMINEE', 'ANNULEE'],
      'TERMINEE': ['VALIDEE', 'ANNULEE'],
      'VALIDEE': [],
      'ANNULEE': []
    };

    if (!validTransitions[existingTask.statut].includes(validatedData.statut)) {
      return NextResponse.json(
        { 
          error: 'Transition de statut invalide',
          details: `Impossible de passer de ${existingTask.statut} à ${validatedData.statut}`
        },
        { status: 400 }
      );
    }

        // Vérification que l'utilisateur est bien assigné à la tâche pour modifier le statut
        if (validatedData.statut && decoded.employeeId !== existingTask.employeeId) {
          return NextResponse.json(
            { error: 'Seul l\'employé assigné peut modifier le statut de la tâche' },
            { status: 403 }
          );
        }

    // 7. Mise à jour du statut
    const updatedTask = await prisma.tache.update({
      where: { id: taskId },
      data: {
      statut: validatedData.statut,
      updatedAt: new Date(),
      ...(validatedData.statut === 'TERMINEE' && { dateCompletion: new Date() }),
      ...(validatedData.commentaire && { commentaire: validatedData.commentaire })
      },
      select: {
      id: true,
      label: true,
      statut: true,
      dateLimite: true,
      dateCompletion: true,
      updatedAt: true,
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

    // 8. Notification à l'employé concerné
    if (existingTask.employeeId !== decoded.employeeId) {
      await prisma.notification.create({
        data: {
          destinataireId: existingTask.employeeId,
          message: `Le statut de votre tâche "${existingTask.label}" a été modifié à ${validatedData.statut}`
        }
      });
    }

    // 9. Formatage de la réponse
    const responseData = {
      ...updatedTask,
      dateLimite: updatedTask.dateLimite.toISOString(),
      dateCompletion: updatedTask.dateCompletion?.toISOString() || null,
      employee: {
        id: updatedTask.employee.id,
        fullName: `${updatedTask.employee.prenom} ${updatedTask.employee.nom}`,
        email: updatedTask.employee.email
      }
    };

    return NextResponse.json({
      success: true,
      data: responseData,
      message: 'Statut de la tâche mis à jour avec succès'
    });

  } catch (error) {
    console.error('[UPDATE_TASK_STATUS_ERROR]', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          error: 'Données invalides',
          details: error.errors.map(e => ({
            path: e.path.join('.'),
            message: e.message
          }))
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { 
        error: 'Erreur lors de la mise à jour du statut',
        details: process.env.NODE_ENV === 'development' 
          ? (error instanceof Error ? error.message : undefined)
          : undefined
      },
      { status: 500 }
    );
  }
}