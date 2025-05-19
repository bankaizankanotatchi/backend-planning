/**
 * Met à jour un poste existant dans la base de données.
 * 
 * @param request - L'objet Request contenant les données de la requête HTTP.
 * @param params - Les paramètres de la requête, incluant l'identifiant du poste à mettre à jour.
 * 
 * @returns Une réponse JSON contenant le poste mis à jour ou un message d'erreur.
 * 
 * @throws {Error} - Retourne une erreur si :
 * - Le token d'autorisation est manquant ou invalide.
 * - L'utilisateur n'a pas les permissions nécessaires pour effectuer cette action.
 * - Les données fournies ne respectent pas le schéma de validation.
 * - Une erreur survient lors de la mise à jour dans la base de données.
 * 
 * @remarks
 * - Cette API nécessite un token d'autorisation valide avec les permissions `EMPLOYEE_EDIT` 
 *   ou un accès complet (`hasAllAccess`).
 * - Les données du corps de la requête doivent respecter le schéma défini par `posteSchema`.
 * 
 * @example
 * // Requête PATCH avec un token valide et des données valides
 * fetch('/api/positions/update/123', {
 *   method: 'PATCH',
 *   headers: {
 *     'Authorization': 'Bearer <token>',
 *     'Content-Type': 'application/json'
 *   },
 *   body: JSON.stringify({
 *     nom: 'Nouveau Nom',
 *     description: 'Nouvelle Description'
 *   })
 * });
 */
// app/api/postes/update/[id]/route.ts

import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth/jwt';
import prisma from '@/lib/prisma';
import { z } from 'zod';

const posteSchema = z.object({
  nom: z.string().min(2, 'Le nom doit contenir au moins 2 caractères').optional(),
  description: z.string().optional()
});

export async function PATCH(
  request: Request,
  {params}: {params: Promise<{ id: string }>},
) {
    const id = (await params).id;
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

    const updatedPoste = await prisma.poste.update({
      where: { id: id },
      data: {
        nom: validatedData.nom,
        description: validatedData.description
      }
    });

    return NextResponse.json(updatedPoste);

  } catch (error) {
    console.error('Erreur mise à jour poste:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la mise à jour' },
      { status: 500 }
    );
  }
}