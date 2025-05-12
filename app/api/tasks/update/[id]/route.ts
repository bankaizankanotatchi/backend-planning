// app/api/tasks/update/[id]/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth/jwt';
import { EnumStatutTache } from '@prisma/client';
import { z } from 'zod';

// Schéma de validation partielle (tous les champs optionnels)
const updateTaskSchema = z.object({
  label: z.string().min(3).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  dateLimite: z.string().datetime().optional(),
  employeeId: z.string().uuid().optional(),
  statut: z.nativeEnum(EnumStatutTache).optional()
}).refine(data => {
  // Au moins un champ doit être fourni
  return Object.keys(data).length > 0;
}, {
  message: "Au moins un champ doit être fourni pour la mise à jour",
  path: ["root"]
});

export async function PUT(
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

    // 2. Vérification des permissions
    const canUpdateTask = decoded.permissions.includes('TASK_UPDATE') || 
                         decoded.permissions.includes('ALL_ACCESS');
    if (!canUpdateTask) {
      return NextResponse.json(
        { error: 'Permissions insuffisantes pour modifier des tâches' },
        { status: 403 }
      );
    }

    // 3. Validation de l'ID
    const taskId = id;
    if (!taskId) {
      return NextResponse.json(
        { error: 'ID de tâche manquant' },
        { status: 400 }
      );
    }

    // 4. Récupération de la tâche existante
    const existingTask = await prisma.tache.findUnique({
      where: { id: taskId },
      include: { employee: true }
    });

    if (!existingTask) {
      return NextResponse.json(
        { error: 'Tâche non trouvée' },
        { status: 404 }
      );
    }

    // 5. Validation des données
    const body = await request.json();
    const validatedData = updateTaskSchema.parse(body);

    // 6. Vérification de l'employé si modification
    if (validatedData.employeeId) {
      const employeeExists = await prisma.employee.findUnique({
        where: { id: validatedData.employeeId }
      });

      if (!employeeExists) {
        return NextResponse.json(
          { error: 'Nouvel employé assigné non trouvé' },
          { status: 404 }
        );
      }
    }

    // 7. Préparation des données de mise à jour
    const updateData: any = {
      ...(validatedData.label && { label: validatedData.label }),
      ...(validatedData.description !== undefined && { description: validatedData.description }),
      ...(validatedData.statut && { statut: validatedData.statut }),
      ...(validatedData.employeeId && { 
        employeeId: validatedData.employeeId 
      }),
      ...(validatedData.dateLimite && { 
        dateLimite: new Date(validatedData.dateLimite) 
      })
    };



    
    // Vérification que l'utilisateur est bien assigné à la tâche pour modifier le statut
    if (validatedData.statut && decoded.employeeId !== existingTask.employeeId) {
      return NextResponse.json(
        { error: 'Seul l\'employé assigné peut modifier le statut de la tâche' },
        { status: 403 }
      );
    }

        // 8. Mise à jour de la tâche
        const updatedTask = await prisma.tache.update({
            where: { id: taskId },
            data: {
              ...updateData,
              updatedAt: new Date() // Met à jour le champ updatedAt avec la date actuelle
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

    // 9. Notification si changement d'assignation ou de statut
    if (validatedData.employeeId || validatedData.statut) {
      await prisma.notification.create({
        data: {
          destinataireId: updatedTask.employeeId,
          message: `Tâche mise à jour: ${updatedTask.label}` +
                   (validatedData.statut ? ` (Nouveau statut: ${validatedData.statut})` : '')
        }
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        ...updatedTask,
        dateLimite: updatedTask.dateLimite.toISOString(),
        employee: `${updatedTask.employee.prenom} ${updatedTask.employee.nom}`
      }
    });

  } catch (error) {
    console.error('[UPDATE_TASK_ERROR]', error);

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
        error: 'Erreur lors de la mise à jour de la tâche',
        details: process.env.NODE_ENV === 'development' 
          ? (error instanceof Error ? error.message : undefined)
          : undefined
      },
      { status: 500 }
    );
  }
}