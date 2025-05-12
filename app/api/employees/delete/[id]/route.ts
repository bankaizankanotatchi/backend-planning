import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth/jwt';

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    // 1. Vérification de l'authentification et des permissions
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const decoded = await verifyToken(token);
    if (!decoded.permissions.includes('EMPLOYEE_EDIT') && !decoded.hasAllAccess) {
      return NextResponse.json({ error: 'Permissions insuffisantes' }, { status: 403 });
    }

    // 2. Vérification que l'employé existe
    const employee = await prisma.employee.findUnique({
      where: { id: params.id },
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
      where: { createurId: params.id }
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
    //   // Suppression des relations d'abord (selon les contraintes de clé étrangère)
    //   await prisma.employeePermission.deleteMany({
    //     where: { employeeId: params.id }
    //   });

    //   await prisma.contrat.deleteMany({
    //     where: { employeeId: params.id }
    //   });

    //   // Suppression des autres relations si nécessaire
    //   // (ajouter les autres relations selon votre schéma Prisma)

    //   // Suppression finale de l'employé
    //   await prisma.employee.delete({
    //     where: { id: params.id }
    //   });

     // 5. Marquer l'employé comme inactif au lieu de le supprimer
     await prisma.employee.update({
        where: { id: params.id },
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