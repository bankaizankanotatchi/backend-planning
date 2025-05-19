

/**
 * Gestionnaire de route pour récupérer tous les employés avec leurs informations essentielles.
 *
 * @function
 * @async
 * @param {Request} request - L'objet de requête HTTP.
 * @returns {Promise<NextResponse>} Une réponse JSON contenant la liste des employés formatée ou un message d'erreur.
 *
 * @description
 * Cette API permet de récupérer la liste de tous les employés avec leurs informations essentielles,
 * y compris leur poste actuel et leur contrat le plus récent. Elle effectue les étapes suivantes :
 *
 * 1. **Vérification de l'authentification et des permissions** :
 *    - Le jeton d'autorisation est extrait de l'en-tête `Authorization`.
 *    - Si le jeton est absent ou invalide, une réponse avec un statut 401 (Non autorisé) est renvoyée.
 *    - Les permissions de l'utilisateur sont vérifiées pour s'assurer qu'il dispose de l'accès `EMPLOYEE_READ`
 *      ou qu'il a un accès complet (`hasAllAccess`). Sinon, une réponse avec un statut 403 (Permissions insuffisantes) est renvoyée.
 *
 * 2. **Récupération des employés** :
 *    - Les employés sont récupérés depuis la base de données avec leurs relations essentielles :
 *      - Poste actuel (nom et ID).
 *      - Contrat le plus récent (type, date de début et date de fin).
 *    - Les employés sont triés par nom et prénom dans l'ordre croissant.
 *
 * 3. **Formatage des données** :
 *    - Les données des employés sont formatées pour inclure uniquement le contrat actuel (le plus récent)
 *      et exclure le tableau complet des contrats pour simplifier la réponse.
 *
 * 4. **Gestion des erreurs** :
 *    - En cas d'erreur lors de la récupération des données, une réponse avec un statut 500 (Erreur interne du serveur)
 *      est renvoyée avec un message d'erreur.
 *
 * @example
 * // Exemple de requête HTTP
 * GET /api/employees/get-all
 * Authorization: Bearer <token>
 *
 * @example
 * // Exemple de réponse en cas de succès
 * [
 *   {
 *     "id": 1,
 *     "nom": "Dupont",
 *     "prenom": "Jean",
 *     "email": "jean.dupont@example.com",
 *     "telephone": "0123456789",
 *     "role": "Manager",
 *     "isActive": true,
 *     "dateEmbauche": "2020-01-15",
 *     "poste": {
 *       "id": 2,
 *       "nom": "Développeur"
 *     },
 *     "currentContract": {
 *       "type": "CDI",
 *       "dateDebut": "2020-01-15",
 *       "dateFin": null
 *     }
 *   }
 * ]
 *
 * @example
 * // Exemple de réponse en cas d'erreur (non autorisé)
 * {
 *   "error": "Non autorisé"
 * }
 *
 * @example
 * // Exemple de réponse en cas d'erreur (permissions insuffisantes)
 * {
 *   "error": "Permissions insuffisantes"
 * }
 *
 * @example
 * // Exemple de réponse en cas d'erreur (erreur serveur)
 * {
 *   "error": "Erreur lors de la récupération des employés"
 * }
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth/jwt';

export async function GET(request: Request) {
  try {
    // 1. Vérification de l'authentification et des permissions
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const decoded = await verifyToken(token);
    if (!decoded.permissions.includes('EMPLOYEE_READ') && !decoded.hasAllAccess) {
      return NextResponse.json({ error: 'Permissions insuffisantes' }, { status: 403 });
    }

    // 2. Récupération de tous les employés avec les relations essentielles
    const employees = await prisma.employee.findMany({
      select: {
        id: true,
        nom: true,
        prenom: true,
        email: true,
        telephone: true,
        role: true,
        isActive: true,
        dateEmbauche: true,
        poste: {
          select: {
            id: true,
            nom: true
          }
        },
        contrats: {
          orderBy: { dateDebut: 'desc' },
          take: 1,
          select: {
            type: true,
            dateDebut: true,
            dateFin: true
          }
        }
      },
      orderBy: [
        { nom: 'asc' },
        { prenom: 'asc' }
      ]
    });

    // 3. Formatage des données pour le front-end
    const formattedEmployees = employees.map(employee => ({
      ...employee,
      currentContract: employee.contrats[0] || null,
      contrats: undefined // On retire le tableau original pour simplifier
    }));

    return NextResponse.json(formattedEmployees);

  } catch (error) {
    console.error('Erreur récupération employés:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des employés' },
      { status: 500 }
    );
  }
}