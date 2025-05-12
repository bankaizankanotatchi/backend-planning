import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth/jwt';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = (await params).id;
  try {
    // 1. Authentification obligatoire
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Authentification requise' },
        { status: 401 }
      );
    }

    // 2. Vérification du token
    const decoded = await verifyToken(token);
    if (!decoded?.employeeId) {
      return NextResponse.json(
        { success: false, error: 'Session invalide' },
        { status: 401 }
      );
    }

    const userId = decoded.employeeId;

    // 3. Validation UUID
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      return NextResponse.json(
        { success: false, error: 'Format de notification invalide' },
        { status: 400 }
      );
    }

    // 4. Vérification des droits en une seule requête
    const notification = await prisma.notification.findFirst({
      where: {
        id: id,
        destinataireId: userId // Critère crucial - seul le destinataire peut supprimer
      }
    });

    if (!notification) {
      // Ne pas révéler si la notification existe ou pas
      return NextResponse.json(
        { success: false, error: 'Opération non autorisée' },
        { status: 403 }
      );
    }

    // 5. Suppression
    await prisma.notification.delete({
      where: { id: id }
    });

    // 6. Réponse succès
    return NextResponse.json({
      success: true,
      data: { id: id },
      message: 'Notification supprimée'
    });

  } catch (error) {
    console.error('DELETE notification error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Erreur de traitement',
        ...(process.env.NODE_ENV === 'development' && { debug: (error instanceof Error ? error.message : 'Unknown error') })
      },
      { status: 500 }
    );
  }
}