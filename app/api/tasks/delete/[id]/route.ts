/**
 * Supprime une tâche spécifique en fonction de son ID.
 *
 * @param request - L'objet de requête HTTP contenant les informations nécessaires.
 * @param params - Les paramètres de la requête, incluant l'ID de la tâche à supprimer.
 * 
 * @returns Une réponse JSON indiquant le succès ou l'échec de l'opération.
 *
 * @throws {401} Si l'utilisateur n'est pas authentifié ou si le token est invalide/expiré.
 * @throws {403} Si l'utilisateur n'a pas les permissions nécessaires pour supprimer une tâche.
 * @throws {400} Si l'ID de la tâche est manquant ou si la tâche est associée à des créneaux.
 * @throws {404} Si la tâche spécifiée n'existe pas.
 * @throws {500} En cas d'erreur interne du serveur lors de la suppression de la tâche.
 *
 * ### Étapes de traitement :
 * 1. **Authentification** : Vérifie la présence et la validité du token JWT.
 * 2. **Vérification des permissions** : S'assure que l'utilisateur a les droits nécessaires pour supprimer une tâche.
 * 3. **Validation de l'ID** : Vérifie que l'ID de la tâche est fourni.
 * 4. **Vérification de l'existence de la tâche** : Confirme que la tâche existe dans la base de données.
 * 5. **Vérification des créneaux associés** : Empêche la suppression si la tâche est liée à des créneaux.
 * 6. **Suppression de la tâche** : Supprime la tâche de la base de données.
 * 7. **Notification** : Envoie une notification à l'employé assigné à la tâche supprimée.
 */
// app/api/tasks/delete/[id]/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth/jwt';

export async function DELETE(
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
    const canDeleteTask = decoded.permissions.includes('TASK_DELETE') || 
                         decoded.hasAllAccess;
    if (!canDeleteTask) {
      return NextResponse.json(
        { error: 'Permissions insuffisantes pour supprimer des tâches' },
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