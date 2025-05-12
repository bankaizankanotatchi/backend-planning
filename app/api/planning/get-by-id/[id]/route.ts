import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth/jwt';
import { EnumPermission } from '@prisma/client';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
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

    // 3. Récupération du planning avec toutes les relations nécessaires
    const planning = await prisma.planning.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        nom: true,
        statut: true,
        dateCreation: true,
        createur: {
          select: {
            //id: true,
            nom: true,
            prenom: true,
            email: true,
            role: true
          }
        },
        periode: {
          select: {
            debut: true,
            fin: true
          }
        },
        creneaux: {
          select: {
            //id: true,
            dateDebut: true,
            dateFin: true,
            type: true,
            duree: true,
            commentaire: true,
            valide: true,
            statutTache: true,
            employee: {
              select: {
                //id: true,
                nom: true,
                prenom: true,
                poste: {
                  select: {
                    nom: true
                  }
                }
              }
            },
            tache: {
              select: {
                //id: true,
                label: true,
                description: true
              }
            }
          },
          orderBy: {
            dateDebut: 'asc'
          }
        },
        syntheses: {
          select: {
            //id: true,
            employee: {
              select: {
               // id: true,
                nom: true,
                prenom: true
              }
            },
            heuresNormales: true,
            heuresSupplementaires: true,
            statut: true
          }
        }
      }
    });

    // 4. Vérification que le planning existe
    if (!planning) {
      return NextResponse.json({ error: 'Planning non trouvé' }, { status: 404 });
    }

    // 5. Formatage de la réponse
    const response = {
      ...planning,
      createur: {
        ...planning.createur,
        fullName: `${planning.createur.prenom} ${planning.createur.nom}`.trim()
      },
      dureeTotale: planning.creneaux.reduce((sum, creneau) => sum + creneau.duree, 0)
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Erreur récupération planning:', error);
    
    return NextResponse.json(
      { 
        error: 'Erreur serveur',
        details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : String(error)) : undefined
      },
      { status: 500 }
    );
  }
}