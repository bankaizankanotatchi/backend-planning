import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth/jwt';
import { EnumRole, EnumPermission } from '@prisma/client';
import { z } from 'zod';
import { removePermissionFromRole } from '@/lib/roles';

const revokeSchema = z.object({
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
    const { role, permission } = revokeSchema.parse(body);

    // Utilisation de la fonction utilitaire pour la révocation
    if (!removePermissionFromRole(role, permission as EnumPermission)) {
      return NextResponse.json(
        { error: 'Cette permission n\'est pas attribuée à ce rôle' },
        { status: 400 }
      );
    }

    // Mise à jour en base de données
    await prisma.$transaction(async (prisma) => {
      await prisma.employeePermission.deleteMany({
        where: {
          permission: permission as EnumPermission,
          employee: {
            role
          }
        }
      });
    });

    return NextResponse.json(
      { 
        message: 'Permission révoquée avec succès du rôle',
        affectedEmployees: await prisma.employee.count({ where: { role } })
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('Erreur révocation permission:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Données invalides', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Erreur lors de la révocation' },
      { status: 500 }
    );
  }
}