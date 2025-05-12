import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth/jwt';
import { EnumPermission } from '@prisma/client';

export async function GET(request: Request) {
  try {
    // 1. Vérification de l'authentification
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ error: 'Authentification requise' }, { status: 401 });
    }

    // 2. Vérification des permissions
    const decoded = await verifyToken(token);
    const hasPermission = decoded.permissions.includes('PLANNING_READ') || decoded.hasAllAccess;
    if (!hasPermission) {
      return NextResponse.json({ error: 'Permissions insuffisantes' }, { status: 403 });
    }

    // 3. Récupération de tous les plannings avec les relations essentielles
    const plannings = await prisma.planning.findMany({
      select: {
        id: true,
        nom: true,
        statut: true,
        dateCreation: true,
        createur: {
          select: {
            id: true,
            nom: true,
            prenom: true
          }
        },
        periode: {
          select: {
            debut: true,
            fin: true
          }
        },
        _count: {
          select: {
            creneaux: true,
            syntheses: true
          }
        }
      },
      orderBy: {
        dateCreation: 'desc'
      }
    });

    // 4. Formatage de la réponse
    const formattedPlannings = plannings.map(planning => ({
      ...planning,
      createur: `${planning.createur.prenom} ${planning.createur.nom}`.trim(),
      periode: {
        debut: planning.periode.debut,
        fin: planning.periode.fin
      }
    }));

    return NextResponse.json(formattedPlannings);

  } catch (error) {
    console.error('Erreur récupération des plannings:', error);
    
    return NextResponse.json(
      { 
        error: 'Erreur serveur',
        details: process.env.NODE_ENV === 'development' && error instanceof Error ? error.message : undefined
      },
      { status: 500 }
    );
  }
}