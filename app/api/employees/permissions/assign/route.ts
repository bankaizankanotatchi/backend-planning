import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth/jwt';
import { EnumRole, EnumPermission } from '@prisma/client';
import { z } from 'zod';
import { addPermissionToRole, isPermissionAllowedForRole } from '@/lib/roles';

const assignSchema = z.object({
  role: z.enum(['EMPLOYE_BASE', 'MANAGER', 'ADMIN']),
  permission: z.string().refine((val): val is EnumPermission => 
    Object.values(EnumPermission).includes(val as EnumPermission)
  )
});

export async function POST(request: Request) {
  try {
    // Vérification de l'authentification et des permissions
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const decoded = await verifyToken(token);
    if (!decoded.permissions.includes('PERMISSION_MANAGE') && !decoded.hasAllAccess) {
      return NextResponse.json({ error: 'Permissions insuffisantes' }, { status: 403 });
    }

    const body = await request.json();
    const { role, permission } = assignSchema.parse(body);

    // Vérification de la permission avec les fonctions utilitaires
    if (isPermissionAllowedForRole(role, permission as EnumPermission)) {
      return NextResponse.json(
        { error: 'Cette permission est déjà attribuée à ce rôle' },
        { status: 400 }
      );
    }

    // Mise à jour de la configuration avec la fonction utilitaire
    if (!addPermissionToRole(role, permission as EnumPermission)) {
      return NextResponse.json(
        { error: 'Impossible d\'ajouter la permission à ce rôle' },
        { status: 400 }
      );
    }

    // Mise à jour en base de données
    await prisma.$transaction(async (prisma) => {
      const employees = await prisma.employee.findMany({
        where: { role },
        select: { id: true }
      });

      if (employees.length > 0) {
        await prisma.employeePermission.createMany({
          data: employees.map(employee => ({
            employeeId: employee.id,
            permission: permission as EnumPermission
          }))
        });
      }
    });

    return NextResponse.json(
      { 
        message: 'Permission assignée avec succès au rôle',
        affectedEmployees: await prisma.employee.count({ where: { role } })
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('Erreur assignation permission:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Données invalides', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Erreur lors de l\'assignation' },
      { status: 500 }
    );
  }
}