/**
 * Gestionnaire pour la méthode GET de l'API permettant de récupérer un poste par son identifiant.
 *
 * @param request - L'objet Request contenant les informations de la requête HTTP.
 * @param params - Un objet contenant les paramètres de la requête, notamment l'identifiant du poste.
 * 
 * @returns Une réponse JSON contenant les informations du poste, y compris les employés associés,
 * ou un message d'erreur avec un code de statut HTTP approprié :
 * - 401 : Si le token d'autorisation est manquant ou invalide.
 * - 404 : Si aucun poste correspondant à l'identifiant fourni n'est trouvé.
 * - 500 : En cas d'erreur interne lors de la récupération des données.
 * 
 * @throws Cette fonction peut lever une erreur si la vérification du token échoue ou si une
 * exception se produit lors de l'interaction avec la base de données.
 * 
 * @example
 * // Exemple d'appel à cette API :
 * // GET /api/postes/get-by-id/123
 * // Headers: { Authorization: 'Bearer <token>' }
 * 
 * // Réponse en cas de succès :
 * {
 *   "id": "123",
 *   "nom": "Poste Exemple",
 *   "employees": [
 *     {
 *       "id": "1",
 *       "nom": "Dupont",
 *       "prenom": "Jean",
 *       "email": "jean.dupont@example.com"
 *     }
 *   ]
 * }
 * 
 * // Réponse en cas d'erreur (exemple 404) :
 * {
 *   "error": "Poste non trouvé"
 * }
 */
// app/api/postes/get-by-id/[id]/route.ts

import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth/jwt';
import prisma from '@/lib/prisma';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
    const id = (await params).id;
  try {
    // Vérification du token
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    await verifyToken(token);

    const poste = await prisma.poste.findUnique({
      where: { id: id },
      include: {
        employees: {
          select: {
            id: true,
            nom: true,
            prenom: true,
            email: true
          }
        }
      }
    });

    if (!poste) {
      return NextResponse.json(
        { error: 'Poste non trouvé' },
        { status: 404 }
      );
    }

    return NextResponse.json(poste);

  } catch (error) {
    console.error('Erreur récupération poste:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération' },
      { status: 500 }
    );
  }
}