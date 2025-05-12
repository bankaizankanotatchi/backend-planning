// app/api/time-slots/get-all/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth/jwt';

export async function GET(request: Request) {
  try {
    // 1. Authentification stricte
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json(
        { error: 'Accès non autorisé - Token manquant' }, 
        { status: 401 }
      );
    }

    // 2. Vérification du token et des permissions
    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json(
        { error: 'Token invalide ou expiré' },
        { status: 401 }
      );
    }

    // Vérification des permissions (PLANNING_READ ou ALL_ACCESS)
    const hasRequiredPermission = 
      decoded.permissions.includes('PLANNING_READ') || 
      decoded.hasAllAccess
    
    if (!hasRequiredPermission) {
      return NextResponse.json(
        { error: 'Permissions insuffisantes pour accéder aux créneaux' },
        { status: 403 }
      );
    }

    // 3. Récupération sécurisée de tous les créneaux
    // Pour les non-admins, on limite aux créneaux de l'utilisateur
    const isAdmin = decoded.hasAllAccess;
    const whereClause = isAdmin ? {} : { employeeId: decoded.employeeId };

    const creneaux = await prisma.creneau.findMany({
      where: whereClause,
      orderBy: { dateDebut: 'asc' },
      select: {
        id: true,
        dateDebut: true,
        dateFin: true,
        type: true,
        duree: true,
        valide: true,
        statutTache: true,
        employee: {
          select: {
            id: true,
            nom: true,
            prenom: true,
            email: true
          }
        },
        tache: {
          select: {
            id: true,
            label: true
          }
        },
        planning: {
          select: {
            id: true,
            nom: true
          }
        }
      },
      take: 1000 // Limite de sécurité
    });

    // 4. Formatage minimal des données
    const safeCreneaux = creneaux.map(creneau => ({
      ...creneau,
      dateDebut: creneau.dateDebut.toISOString(),
      dateFin: creneau.dateFin.toISOString(),
      employee: {
        ...creneau.employee,
        fullName: `${creneau.employee.prenom} ${creneau.employee.nom}`
      }
    }));

    return NextResponse.json({
      success: true,
      data: safeCreneaux,
      meta: {
        count: creneaux.length,
        isAdminAccess: isAdmin
      }
    });

  } catch (error) {
    console.error('[GET_ALL_TIMESLOTS_ERROR]', error);

    // Ne pas exposer les détails d'erreur en production
    const errorMessage = process.env.NODE_ENV === 'development' 
      ? (error instanceof Error ? error.message : 'Erreur inconnue')
      : 'Erreur lors de la récupération des créneaux';

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}