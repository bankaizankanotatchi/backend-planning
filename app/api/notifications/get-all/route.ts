
/**
 * Gestionnaire pour la méthode GET de l'API des notifications.
 * 
 * Cette fonction récupère toutes les notifications associées à un utilisateur
 * en fonction de son ID employé, extrait du token d'autorisation.
 * 
 * @param request - L'objet Request contenant les informations de la requête HTTP.
 * 
 * @returns Une réponse JSON contenant :
 * - Une liste des notifications de l'utilisateur, triées par date décroissante,
 *   avec les champs suivants :
 *   - `id` : L'identifiant unique de la notification.
 *   - `message` : Le contenu du message de la notification.
 *   - `date` : La date de création de la notification.
 *   - `statut` : Le statut de la notification.
 * - Une erreur JSON avec un code de statut HTTP approprié si :
 *   - Le token est manquant ou invalide (401).
 *   - Une erreur serveur survient lors de la récupération des notifications (500).
 * 
 * @throws Renvoie une erreur JSON en cas de problème avec le token ou la base de données.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth/jwt';

export async function GET(request: Request) {
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

    // Récupération de toutes les notifications de l'utilisateur
    const notifications = await prisma.notification.findMany({
      where: {
        destinataireId: decoded.employeeId
      },
      select: {
        id: true,
        message: true,
        date: true,
        statut: true,
      },
      orderBy: {
        date: 'desc' // Tri par date décroissante par défaut
      }
    });

    return NextResponse.json(notifications);

  } catch (error) {
    console.error('Erreur lors de la récupération des notifications:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des notifications' },
      { status: 500 }
    );
  }
}