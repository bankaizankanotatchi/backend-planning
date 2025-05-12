import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth/jwt';

export async function GET(request: Request) {
  try {
    // Vérification du token
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const decoded = await verifyToken(token);
    if (!decoded.employeeId) {
      return NextResponse.json({ error: 'Token invalide' }, { status: 401 });
    }

    // Récupération de toutes les notifications de l'utilisateur
    const notifications = await prisma.notification.findMany({
      where: {
        destinataireId: decoded.employeeId
      },
      select: {
        id: true,
        message: true,
        date: true,
        statut: true,
      },
      orderBy: {
        date: 'desc' // Tri par date décroissante par défaut
      }
    });

    return NextResponse.json(notifications);

  } catch (error) {
    console.error('Erreur lors de la récupération des notifications:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des notifications' },
      { status: 500 }
    );
  }
}