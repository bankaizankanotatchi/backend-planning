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