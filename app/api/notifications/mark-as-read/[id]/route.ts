import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth/jwt';
import { StatutNotification } from '@prisma/client';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
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

    // Validation de l'ID
    if (!params.id || typeof params.id !== 'string') {
      return NextResponse.json(
        { error: 'ID de notification invalide' },
        { status: 400 }
      );
    }

    // Vérification de l'existence et des permissions
    const existingNotification = await prisma.notification.findFirst({
      where: {
        id: params.id,
        destinataireId: decoded.employeeId
      }
    });

    if (!existingNotification) {
      return NextResponse.json(
        { error: 'Notification non trouvée ou accès refusé' },
        { status: 404 }
      );
    }

    // Mise à jour uniquement si nécessaire
    if (existingNotification.statut !== 'LUE') {
      const updatedNotification = await prisma.notification.update({
        where: { id: params.id },
        data: { statut: 'LUE' },
        select: {
          id: true,
          message: true,
          statut: true,
          date: true
        }
      });

      return NextResponse.json({
        success: true,
        data: updatedNotification,
        message: 'Notification marquée comme lue'
      });
    }

    // Retourner la notification telle quelle si déjà lue
    return NextResponse.json({
      success: true,
      data: {
        id: existingNotification.id,
        message: existingNotification.message,
        statut: existingNotification.statut,
        date: existingNotification.date
      },
      message: 'Notification déjà marquée comme lue'
    });

  } catch (error) {
    console.error('Erreur notification:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Erreur serveur',
        details: process.env.NODE_ENV === 'development' ? (error instanceof Error && error.message) : undefined
      },
      { status: 500 }
    );
  }
}