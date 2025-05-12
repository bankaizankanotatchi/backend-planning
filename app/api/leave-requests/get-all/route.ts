// app/api/leave-requests/get-all/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth/jwt';

export async function GET(request: Request) {
  try {
    // 1. Authentification
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json(
        { error: 'Authentification requise' },
        { status: 401 }
      );
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json(
        { error: 'Token invalide ou expiré' },
        { status: 401 }
      );
    }

    // 2. Vérification des permissions
    const isAdmin = decoded.hasAllAccess;
    const canViewTeam = decoded.permissions.includes('LEAVE_VIEW_TEAM');
    const isRegularUser = decoded.permissions.includes('LEAVE_REQUEST');

    if (!isAdmin && !canViewTeam && !isRegularUser) {
      return NextResponse.json(
        { error: 'Permissions insuffisantes' },
        { status: 403 }
      );
    }

    // 3. Déterminer le scope des données
    const whereClause = !isAdmin && !canViewTeam 
      ? { employeeId: decoded.employeeId } 
      : {};

    // 4. Récupération des demandes avec les relations nécessaires
    const requests = await prisma.conge.findMany({
      where: whereClause,
      take: 1000, // Limite de sécurité
      include: {
        employee: {
          select: {
            id: true,
            nom: true,
            prenom: true,
            email: true,
            poste: {
              select: {
                nom: true
              }
            }
          }
        }
      }
    });

    // 5. Formatage des données pour le front-end
    const formattedData = requests.map(request => ({
      id: request.id,
      type: request.type,
      dateDebut: request.dateDebut.toISOString(),
      dateFin: request.dateFin.toISOString(),
      statut: request.statut,
      commentaire: request.commentaire,
      employee: {
        id: request.employee.id,
        fullName: `${request.employee.prenom} ${request.employee.nom}`,
        email: request.employee.email,
        poste: request.employee.poste?.nom
      }
    }));

    return NextResponse.json({
      success: true,
      data: formattedData,
      meta: {
        count: formattedData.length,
        isAdminView: isAdmin,
        canViewTeam: canViewTeam
      }
    });

  } catch (error) {
    console.error('[GET_LEAVE_REQUESTS_ERROR]', error);

    return NextResponse.json(
      { 
        error: 'Erreur lors de la récupération des demandes',
        details: process.env.NODE_ENV === 'development' 
          ? (error instanceof Error ? error.message : undefined)
          : undefined
      },
      { status: 500 }
    );
  }
}