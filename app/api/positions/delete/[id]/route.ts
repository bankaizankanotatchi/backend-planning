/**
 * Supprime un poste en fonction de l'ID fourni dans les paramètres.
 * 
 * @param request - L'objet de requête HTTP.
 * @param params - Les paramètres de la requête, contenant l'ID du poste à supprimer.
 * 
 * @returns Une réponse JSON indiquant le résultat de l'opération :
 * - 200 : Succès, le poste a été supprimé.
 * - 400 : Erreur, le poste est attribué à des employés et ne peut pas être supprimé.
 * - 401 : Non autorisé, le token d'authentification est manquant ou invalide.
 * - 403 : Permissions insuffisantes pour effectuer cette action.
 * - 500 : Erreur interne du serveur lors de la suppression.
 * 
 * @throws Renvoie une réponse JSON avec un message d'erreur en cas de problème.
 * 
 * @remarks
 * Cette API vérifie d'abord le token d'authentification et les permissions de l'utilisateur.
 * Si le poste est attribué à des employés, la suppression est bloquée.
 * Utilise Prisma pour interagir avec la base de données.
 */
// app/api/postes/delete/[id]/route.ts

import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth/jwt';
import prisma from '@/lib/prisma';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
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

    // Vérifier si le poste est utilisé
    const employeesWithPoste = await prisma.employee.count({
      where: { posteId: id }
    });

    if (employeesWithPoste > 0) {
      return NextResponse.json(
        { error: 'Impossible de supprimer un poste attribué à des employés' },
        { status: 400 }
      );
    }

    await prisma.poste.delete({
      where: { id: id }
    });

    return NextResponse.json(
      { message: 'Poste supprimé avec succès' },
      { status: 200 }
    );

  } catch (error) {
    console.error('Erreur suppression poste:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la suppression' },
      { status: 500 }
    );
  }
}