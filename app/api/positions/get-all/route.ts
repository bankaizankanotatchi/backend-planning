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