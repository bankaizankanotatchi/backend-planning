// app/api/time-slots/get-by-id/[id]/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth/jwt';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    // 1. Vérification d'authentification
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json(
        { error: 'Authentification requise' },
        { status: 401 }
      );
    }

    // 2. Validation du token
    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json(
        { error: 'Token invalide ou expiré' },
        { status: 401 }
      );
    }

    // 3. Vérification des permissions
    const hasPlanningRead = decoded.permissions.includes('PLANNING_READ');
    const hasAllAccess = decoded.hasAllAccess;
    
    if (!hasPlanningRead && !hasAllAccess) {
      return NextResponse.json(
        { error: 'Permissions insuffisantes' },
        { status: 403 }
      );
    }

    // 4. Validation de l'ID
    const creneauId = params.id;
    if (!creneauId || typeof creneauId !== 'string') {
      return NextResponse.json(
        { error: 'ID de créneau invalide' },
        { status: 400 }
      );
    }

    // 5. Récupération du créneau
    const creneau = await prisma.creneau.findUnique({
      where: { id: creneauId },
      select: {
        id: true,
        dateDebut: true,
        dateFin: true,
        type: true,
        duree: true,
        valide: true,
        statutTache: true,
        commentaire: true,
        employee: {
          select: {
            id: true,
            nom: true,
            prenom: true,
            email: true,
            poste: { select: { nom: true } }
          }
        },
        tache: {
          select: {
            id: true,
            label: true,
            description: true,
            dateLimite: true,
            statut: true
          }
        },
        planning: {
          select: {
            id: true,
            nom: true,
            periode: { select: { debut: true, fin: true } }
          }
        }
      }
    });

    // 6. Vérification de l'existence
    if (!creneau) {
      return NextResponse.json(
        { error: 'Créneau non trouvé' },
        { status: 404 }
      );
    }

    // 7. Vérification des accès (admin ou propriétaire du créneau)
    const isOwner = creneau.employee.id === decoded.employeeId;
    if (!isOwner && !hasAllAccess) {
      return NextResponse.json(
        { error: 'Accès non autorisé à ce créneau' },
        { status: 403 }
      );
    }

    // 8. Formatage de la réponse
    const responseData = {
      ...creneau,
      dateDebut: creneau.dateDebut.toISOString(),
      dateFin: creneau.dateFin.toISOString(),
      employee: {
        ...creneau.employee,
        fullName: `${creneau.employee.prenom} ${creneau.employee.nom}`,
        poste: creneau.employee.poste?.nom
      },
      tache: {
        ...creneau.tache,
        dateLimite: creneau.tache.dateLimite?.toISOString()
      },
      planning: {
        ...creneau.planning,
        periode: {
          debut: creneau.planning.periode.debut.toISOString(),
          fin: creneau.planning.periode.fin.toISOString()
        }
      }
    };

    return NextResponse.json({
      success: true,
      data: responseData
    });

  } catch (error) {
    console.error('[GET_TIMESLOT_BY_ID_ERROR]', error);

    return NextResponse.json(
      { 
        error: 'Erreur lors de la récupération du créneau',
        details: process.env.NODE_ENV === 'development' 
          ? (error instanceof Error ? error.message : 'Erreur inconnue') 
          : undefined
      },
      { status: 500 }
    );
  }
}