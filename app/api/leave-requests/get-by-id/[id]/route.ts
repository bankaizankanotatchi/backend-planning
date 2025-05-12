// app/api/leave-requests/get-by-id/[id]/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth/jwt';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = (await params).id;
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

    // 2. Validation de l'ID
    const leaveRequestId = id;
    if (!leaveRequestId) {
      return NextResponse.json(
        { error: 'ID de demande de congé manquant' },
        { status: 400 }
      );
    }

    // 3. Vérification des permissions
    const isAdmin = decoded.hasAllAccess;
    const canViewTeam = decoded.permissions.includes('LEAVE_VIEW_TEAM');
    const isRegularUser = decoded.permissions.includes('LEAVE_REQUEST');

    // 4. Récupération de la demande
    const leaveRequest = await prisma.conge.findUnique({
      where: { id: leaveRequestId },
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

    if (!leaveRequest) {
      return NextResponse.json(
        { error: 'Demande de congé non trouvée' },
        { status: 404 }
      );
    }

    // 5. Vérification des droits d'accès
    const isOwner = leaveRequest.employeeId === decoded.employeeId;
    const canAccess = isAdmin || canViewTeam || isOwner;

    if (!canAccess) {
      return NextResponse.json(
        { error: 'Accès non autorisé à cette demande' },
        { status: 403 }
      );
    }

    // 6. Formatage de la réponse
    const responseData = {
      id: leaveRequest.id,
      type: leaveRequest.type,
      dateDebut: leaveRequest.dateDebut.toISOString(),
      dateFin: leaveRequest.dateFin.toISOString(),
      statut: leaveRequest.statut,
      commentaire: leaveRequest.commentaire,
      employee: {
        id: leaveRequest.employee.id,
        fullName: `${leaveRequest.employee.prenom} ${leaveRequest.employee.nom}`,
        email: leaveRequest.employee.email,
        poste: leaveRequest.employee.poste?.nom
      }
    };

    return NextResponse.json({
      success: true,
      data: responseData
    });

  } catch (error) {
    console.error('[GET_LEAVE_REQUEST_BY_ID_ERROR]', error);

    return NextResponse.json(
      { 
        error: 'Erreur lors de la récupération de la demande',
        details: process.env.NODE_ENV === 'development' 
          ? (error instanceof Error ? error.message : undefined)
          : undefined
      },
      { status: 500 }
    );
  }
}