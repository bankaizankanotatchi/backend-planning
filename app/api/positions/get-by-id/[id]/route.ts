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