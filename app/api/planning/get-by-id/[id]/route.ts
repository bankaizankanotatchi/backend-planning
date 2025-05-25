
/**
 * Récupère un planning par son identifiant avec toutes ses relations nécessaires.
 *
 * @param request - L'objet Request contenant les informations de la requête HTTP.
 * @param params - Les paramètres de la requête, incluant l'identifiant du planning.
 * @returns Une réponse JSON contenant les détails du planning ou une erreur appropriée.
 *
 * @remarks
 * - Cette API nécessite une authentification via un jeton JWT.
 * - Les permissions nécessaires pour accéder à cette ressource sont `PLANNING_READ` ou un accès complet.
 * - Si le planning n'est pas trouvé, une réponse avec un statut 404 est retournée.
 * - En cas d'erreur serveur, une réponse avec un statut 500 est retournée.
 *
 * @throws {401} Si le jeton d'authentification est manquant ou invalide.
 * @throws {403} Si l'utilisateur n'a pas les permissions nécessaires.
 * @throws {404} Si le planning avec l'identifiant fourni n'existe pas.
 * @throws {500} En cas d'erreur serveur.
 *
 * @example
 * // Exemple de requête
 * GET /api/planning/get-by-id/123
 * Authorization: Bearer <token>
 *
 * @example
 * // Exemple de réponse en cas de succès
 * {
 *   "id": "123",
 *   "nom": "Planning 1",
 *   "statut": "Actif",
 *   "dateCreation": "2023-01-01T00:00:00.000Z",
 *   "createur": {
 *     "nom": "Dupont",
 *     "prenom": "Jean",
 *     "email": "jean.dupont@example.com",
 *     "role": "Admin",
 *     "fullName": "Jean Dupont"
 *   },
 *   "periode": {
 *     "debut": "2023-01-01",
 *     "fin": "2023-01-31"
 *   },
 *   "creneaux": [
 *     {
 *       "dateDebut": "2023-01-01T08:00:00.000Z",
 *       "dateFin": "2023-01-01T12:00:00.000Z",
 *       "type": "Travail",
 *       "duree": 4,
 *       "commentaire": "Matinée",
 *       "valide": true,
 *       "statutTache": "Terminé",
 *       "employee": {
 *         "nom": "Martin",
 *         "prenom": "Paul",
 *         "poste": {
 *           "nom": "Développeur"
 *         }
 *       },
 *       "tache": {
 *         "label": "Développement",
 *         "description": "Développement de fonctionnalités"
 *       }
 *     }
 *   ],
 *   "syntheses": [
 *     {
 *       "employee": {
 *         "nom": "Martin",
 *         "prenom": "Paul"
 *       },
 *       "heuresNormales": 35,
 *       "heuresSupplementaires": 5,
 *       "statut": "Validé"
 *     }
 *   ],
 *   "dureeTotale": 4
 * }
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth/jwt';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = (await params).id;
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
      where: { id: id },
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