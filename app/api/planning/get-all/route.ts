

/**
 * Gestionnaire pour la méthode GET de l'API permettant de récupérer tous les plannings.
 *
 * @param request - L'objet Request représentant la requête HTTP entrante.
 * 
 * @returns Une réponse JSON contenant la liste des plannings formatés ou un message d'erreur.
 *
 * ### Étapes :
 * 1. **Vérification de l'authentification** :
 *    - Extrait le token JWT de l'en-tête `Authorization`.
 *    - Retourne une erreur 401 si le token est absent.
 *
 * 2. **Vérification des permissions** :
 *    - Décode le token JWT pour récupérer les permissions de l'utilisateur.
 *    - Vérifie si l'utilisateur possède la permission `PLANNING_READ` ou un accès complet.
 *    - Retourne une erreur 403 si les permissions sont insuffisantes.
 *
 * 3. **Récupération des plannings** :
 *    - Utilise Prisma pour récupérer tous les plannings avec leurs relations essentielles :
 *      - `createur` : Informations sur le créateur du planning.
 *      - `periode` : Dates de début et de fin du planning.
 *      - `_count` : Nombre de créneaux et de synthèses associés.
 *    - Trie les plannings par date de création (ordre décroissant).
 *
 * 4. **Formatage de la réponse** :
 *    - Formate les données pour inclure le nom complet du créateur et les dates de la période.
 *    - Retourne les plannings formatés sous forme de réponse JSON.
 *
 * ### Gestion des erreurs :
 * - Retourne une erreur 500 avec un message détaillé en mode développement si une exception est levée.
 *
 * ### Codes de statut HTTP possibles :
 * - `200` : Succès, liste des plannings retournée.
 * - `401` : Authentification requise.
 * - `403` : Permissions insuffisantes.
 * - `500` : Erreur serveur.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth/jwt';

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