/**
 * Gestionnaire de requête GET pour récupérer tous les postes.
 *
 * @param {Request} request - L'objet de requête HTTP.
 * @returns {Promise<NextResponse>} Une réponse JSON contenant la liste des postes
 * ou un message d'erreur en cas de problème.
 *
 * @description
 * Cette API permet de récupérer la liste de tous les postes disponibles dans la base de données,
 * triés par ordre alphabétique (par le champ `nom`). Chaque poste inclut également un décompte
 * du nombre d'employés associés.
 *
 * @throws {401} Si le token d'autorisation est manquant ou invalide.
 * @throws {500} En cas d'erreur lors de la récupération des données depuis la base de données.
 *
 * @example
 * // Exemple de requête
 * fetch('/api/positions/get-all', {
 *   method: 'GET',
 *   headers: {
 *     'Authorization': 'Bearer <votre_token>'
 *   }
 * })
 * .then(response => response.json())
 * .then(data => console.log(data));
 */
// app/api/postes/get-all/route.ts

import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth/jwt';
import prisma from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    // Vérification du token
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    await verifyToken(token);

    const postes = await prisma.poste.findMany({
      orderBy: { nom: 'asc' },
      include: {
        _count: {
          select: { employees: true }
        }
      }
    });

    return NextResponse.json(postes);

  } catch (error) {
    console.error('Erreur récupération postes:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération' },
      { status: 500 }
    );
  }
}