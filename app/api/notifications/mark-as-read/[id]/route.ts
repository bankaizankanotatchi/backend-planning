
/**
 * Marque une notification comme lue pour un utilisateur spécifique.
 * 
 * @param request - L'objet de requête HTTP contenant les en-têtes et les données nécessaires.
 * @param params - Les paramètres de la route, incluant l'identifiant de la notification (`id`).
 * 
 * @returns Une réponse JSON indiquant le succès ou l'échec de l'opération.
 * 
 * @throws {401 Unauthorized} Si le token d'autorisation est manquant ou invalide.
 * @throws {400 Bad Request} Si l'ID de la notification est manquant ou invalide.
 * @throws {404 Not Found} Si la notification n'existe pas ou si l'utilisateur n'a pas les permissions nécessaires.
 * @throws {500 Internal Server Error} En cas d'erreur serveur inattendue.
 * 
 * ### Fonctionnement :
 * 1. Vérifie la présence et la validité du token d'autorisation.
 * 2. Valide l'ID de la notification fourni dans les paramètres.
 * 3. Vérifie si la notification existe et si elle appartient à l'utilisateur authentifié.
 * 4. Si la notification n'est pas déjà marquée comme lue, elle est mise à jour avec le statut `LUE`.
 * 5. Si la notification est déjà marquée comme lue, elle est retournée telle quelle.
 * 
 * ### Réponses possibles :
 * - **Succès (200)** : La notification est marquée comme lue ou déjà lue, avec les détails de la notification.
 * - **Erreur (401)** : L'utilisateur n'est pas autorisé.
 * - **Erreur (400)** : L'ID de la notification est invalide.
 * - **Erreur (404)** : La notification est introuvable ou l'utilisateur n'a pas les permissions nécessaires.
 * - **Erreur (500)** : Une erreur serveur s'est produite.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth/jwt';
import { StatutNotification } from '@prisma/client';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = (await params).id;
  try {
    // Vérification du token
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const decoded = await verifyToken(token);
    if (!decoded.employeeId) {
      return NextResponse.json({ error: 'Token invalide' }, { status: 401 });
    }

    // Validation de l'ID
    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { error: 'ID de notification invalide' },
        { status: 400 }
      );
    }

    // Vérification de l'existence et des permissions
    const existingNotification = await prisma.notification.findFirst({
      where: {
        id: id,
        destinataireId: decoded.employeeId
      }
    });

    if (!existingNotification) {
      return NextResponse.json(
        { error: 'Notification non trouvée ou accès refusé' },
        { status: 404 }
      );
    }

    // Mise à jour uniquement si nécessaire
    if (existingNotification.statut !== 'LUE') {
      const updatedNotification = await prisma.notification.update({
        where: { id: id },
        data: { statut: 'LUE' },
        select: {
          id: true,
          message: true,
          statut: true,
          date: true
        }
      });

      return NextResponse.json({
        success: true,
        data: updatedNotification,
        message: 'Notification marquée comme lue'
      });
    }

    // Retourner la notification telle quelle si déjà lue
    return NextResponse.json({
      success: true,
      data: {
        id: existingNotification.id,
        message: existingNotification.message,
        statut: existingNotification.statut,
        date: existingNotification.date
      },
      message: 'Notification déjà marquée comme lue'
    });

  } catch (error) {
    console.error('Erreur notification:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Erreur serveur',
        details: process.env.NODE_ENV === 'development' ? (error instanceof Error && error.message) : undefined
      },
      { status: 500 }
    );
  }
}