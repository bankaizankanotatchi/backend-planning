

/**
 * Supprime une notification spécifique pour un utilisateur authentifié.
 *
 * @param request - L'objet de requête HTTP contenant les en-têtes et les informations nécessaires.
 * @param params - Les paramètres de la requête, incluant l'identifiant unique (`id`) de la notification à supprimer.
 *
 * @returns Une réponse JSON indiquant le succès ou l'échec de l'opération.
 *
 * @throws {401 Unauthorized} Si l'utilisateur n'est pas authentifié ou si le token est invalide.
 * @throws {400 Bad Request} Si l'identifiant de la notification n'est pas au format UUID valide.
 * @throws {403 Forbidden} Si l'utilisateur n'a pas les droits nécessaires pour supprimer la notification.
 * @throws {500 Internal Server Error} En cas d'erreur inattendue lors du traitement.
 *
 * ### Étapes de traitement :
 * 1. Vérifie la présence d'un token d'authentification dans les en-têtes de la requête.
 * 2. Valide le token et récupère l'identifiant de l'utilisateur (`employeeId`).
 * 3. Vérifie que l'identifiant de la notification est un UUID valide.
 * 4. Vérifie que la notification existe et que l'utilisateur authentifié est bien le destinataire.
 * 5. Supprime la notification de la base de données.
 * 6. Retourne une réponse JSON indiquant le succès de l'opération.
 *
 * ### Exemple de réponse en cas de succès :
 * ```json
 * {
 *   "success": true,
 *   "data": { "id": "uuid-de-la-notification" },
 *   "message": "Notification supprimée"
 * }
 * ```
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth/jwt';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = (await params).id;
  try {
    // 1. Authentification obligatoire
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Authentification requise' },
        { status: 401 }
      );
    }

    // 2. Vérification du token
    const decoded = await verifyToken(token);
    if (!decoded?.employeeId) {
      return NextResponse.json(
        { success: false, error: 'Session invalide' },
        { status: 401 }
      );
    }

    const userId = decoded.employeeId;

    // 3. Validation UUID
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      return NextResponse.json(
        { success: false, error: 'Format de notification invalide' },
        { status: 400 }
      );
    }

    // 4. Vérification des droits en une seule requête
    const notification = await prisma.notification.findFirst({
      where: {
        id: id,
        destinataireId: userId // Critère crucial - seul le destinataire peut supprimer
      }
    });

    if (!notification) {
      // Ne pas révéler si la notification existe ou pas
      return NextResponse.json(
        { success: false, error: 'Opération non autorisée' },
        { status: 403 }
      );
    }

    // 5. Suppression
    await prisma.notification.delete({
      where: { id: id }
    });

    // 6. Réponse succès
    return NextResponse.json({
      success: true,
      data: { id: id },
      message: 'Notification supprimée'
    });

  } catch (error) {
    console.error('DELETE notification error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Erreur de traitement',
        ...(process.env.NODE_ENV === 'development' && { debug: (error instanceof Error ? error.message : 'Unknown error') })
      },
      { status: 500 }
    );
  }
}