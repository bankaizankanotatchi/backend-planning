

/**
 * Supprime (archive) un employé en le marquant comme inactif.
 * 
 * @param request - L'objet `NextRequest` contenant les informations de la requête HTTP.
 * @param params - Les paramètres de la requête, incluant l'identifiant de l'employé à supprimer.
 * 
 * @returns Une réponse JSON indiquant le succès ou l'échec de l'opération.
 * 
 * @throws {401} Si le token d'authentification est manquant ou invalide.
 * @throws {403} Si l'utilisateur authentifié n'a pas les permissions nécessaires pour modifier un employé.
 * @throws {404} Si l'employé avec l'identifiant fourni n'existe pas.
 * @throws {400} Si l'employé a des dépendances (par exemple, des plannings créés) empêchant sa suppression.
 * @throws {500} En cas d'erreur inattendue lors de l'archivage de l'employé.
 * 
 * ### Étapes de l'opération :
 * 1. Vérification de l'authentification et des permissions de l'utilisateur.
 * 2. Vérification de l'existence de l'employé dans la base de données.
 * 3. Vérification des dépendances métier (par exemple, plannings créés par l'employé).
 * 4. Suppression logique de l'employé via une transaction Prisma :
 *    - L'employé est marqué comme inactif (`isActive: false`) et une date de fin (`dateFin`) est ajoutée.
 * 5. Retourne une réponse JSON avec un message de succès ou une erreur détaillée.
 */
import { NextResponse,NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth/jwt';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = (await params).id
  try {
    // 1. Vérification de l'authentification et des permissions
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ error: 'Non autoriaitsé' }, { status: 401 });
    }

    const decoded = await verifyToken(token);
    if (!decoded.permissions.includes('EMPLOYEE_EDIT') && !decoded.hasAllAccess) {
      return NextResponse.json({ error: 'Permissions insuffisantes' }, { status: 403 });
    }

    // 2. Vérification que l'employé existe
    const employee = await prisma.employee.findUnique({
      where: { id: id},
      include: {
        contrats: true,
        permissions: true
      }
    });

    if (!employee) {
      return NextResponse.json(
        { error: 'Employé non trouvé' },
        { status: 404 }
      );
    }


    // 3. Vérification des dépendances (optionnel selon besoins métier)
    const hasPlanning = await prisma.planning.count({
      where: { createurId: id }
    });

    if (hasPlanning > 0) {
      return NextResponse.json(
        { 
          error: 'Impossible de supprimer cet employé',
          details: "L'employé a créé des plannings. Transférez-les avant suppression."
        },
        { status: 400 }
      );
    }

    // 4. Suppression en transaction
    await prisma.$transaction(async (prisma) => {
     // 5. Marquer l'employé comme inactif au lieu de le supprimer
     await prisma.employee.update({
        where: { id: id },
        data: { 
          isActive: false,
          dateFin: new Date() 
        }
      });
      
    });

    
    // 6. Réponse
    return NextResponse.json(
      { message: 'Employé archivé avec succès' },
      { status: 200 }
    );

  } catch (error) {
    console.error('Erreur archivage employé:', error);
    
    return NextResponse.json(
      { 
        error: 'Erreur lors de l\'archivage de l\'employé',
      },
      { status: 500 }
    );
  }
}