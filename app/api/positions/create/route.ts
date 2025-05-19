/**
 * Gestion de la création d'un poste via une API REST.
 *
 * @function POST
 * @async
 * @param {Request} request - La requête HTTP contenant les données du poste à créer.
 * @returns {Promise<Response>} - Une réponse HTTP contenant les détails du poste créé ou une erreur.
 *
 * @description
 * Cette fonction gère la création d'un poste en vérifiant d'abord l'autorisation de l'utilisateur
 * via un token JWT. Elle valide ensuite les données envoyées dans le corps de la requête à l'aide
 * de `zod`. Si un poste avec le même nom existe déjà, une erreur de conflit (409) est retournée.
 * Sinon, un nouveau poste est créé dans la base de données Prisma.
 *
 * @throws {401 Unauthorized} - Si le token d'autorisation est manquant ou invalide.
 * @throws {403 Forbidden} - Si l'utilisateur n'a pas les permissions nécessaires pour créer un poste.
 * @throws {409 Conflict} - Si un poste avec le même nom existe déjà.
 * @throws {500 Internal Server Error} - En cas d'erreur inattendue lors de la création du poste.
 *
 * @example
 * // Requête HTTP POST
 * const response = await fetch('/api/positions/create', {
 *   method: 'POST',
 *   headers: {
 *     'Content-Type': 'application/json',
 *     'Authorization': 'Bearer <votre_token>'
 *   },
 *   body: JSON.stringify({
 *     nom: 'Développeur',
 *     description: 'Responsable du développement des applications.'
 *   })
 * });
 *
 * @see {@link verifyToken} pour la vérification des permissions utilisateur.
 * @see {@link prisma.poste} pour les opérations sur la base de données.
 */
// app/api/postes/create/route.ts

import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth/jwt';
import prisma from '@/lib/prisma';
import { z } from 'zod';

const posteSchema = z.object({
  nom: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
  description: z.string().optional()
});

export async function POST(request: Request) {
  try {
    // Vérification du token et des permissions
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const decoded = await verifyToken(token);
    if (!decoded.permissions.includes('EMPLOYEE_EDIT') && !decoded.hasAllAccess) {
      return NextResponse.json({ error: 'Permissions insuffisantes' }, { status: 403 });
    }

    const body = await request.json();
    const validatedData = posteSchema.parse(body);

    // Vérifier si le poste existe déjà
    const existingPoste = await prisma.poste.findUnique({
      where: { nom: validatedData.nom }
    });

    if (existingPoste) {
      return NextResponse.json(
        { error: 'Un poste avec ce nom existe déjà' },
        { status: 409 }
      );
    }

    const newPoste = await prisma.poste.create({
      data: {
        nom: validatedData.nom,
        description: validatedData.description
      }
    });

    return NextResponse.json(newPoste, { status: 201 });

  } catch (error) {
    console.error('Erreur création poste:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la création' },
      { status: 500 }
    );
  }
}