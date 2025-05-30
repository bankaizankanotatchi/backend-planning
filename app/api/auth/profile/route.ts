/**
 * Gestion de l'API pour récupérer le profil d'un employé.
 *
 * @function GET
 * @param {Request} request - La requête HTTP entrante.
 * @returns {Promise<NextResponse>} Une réponse JSON contenant les informations du profil de l'employé
 * ou un message d'erreur en cas de problème.
 *
 * @description
 * Cette fonction permet de récupérer les informations détaillées du profil d'un employé
 * authentifié à partir d'un token JWT. Elle vérifie la validité du token, extrait l'identifiant
 * de l'employé, et récupère les données associées dans la base de données via Prisma.
 *
 * Les données retournées incluent :
 * - Informations personnelles : nom, prénom, email, téléphone, adresse, rôle, etc.
 * - Relations avec d'autres entités : poste, permissions, contrats, disponibilités, congés, etc.
 * - Historique et notifications : rapports, plannings, tâches, créneaux, synthèses, etc.
 *
 * @throws {401 Unauthorized} Si le token est manquant ou invalide.
 * @throws {404 Not Found} Si l'employé correspondant au token n'est pas trouvé ou inactif.
 * @throws {500 Internal Server Error} En cas d'erreur inattendue lors du traitement.
 *
 * @example
 * // Exemple d'appel avec un token valide
 * const response = await fetch('/api/auth/profile', {
 *   method: 'GET',
 *   headers: {
 *     Authorization: 'Bearer <votre_token>'
 *   }
 * });
 * const data = await response.json();
 *
 * @note
 * - Les permissions de l'employé sont transformées en un tableau simple pour simplifier la réponse.
 * - Les données sensibles ou inutiles ne sont pas incluses dans la réponse.
 */
// app/api/auth/profile/route.ts


import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth/jwt';
import prisma from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    // Récupération et vérification du token
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.split(' ')[1];
    
    if (!token) {
      return NextResponse.json(
        { error: 'Token manquant' },
        { status: 401 }
      );
    }

    const decoded = await verifyToken(token);
    const employeeId = decoded.employeeId;

    // Récupération sécurisée des données avec sélection précise des champs
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId , isActive: true},
      select: {
        id: true,
        nom: true,
        prenom: true,
        email: true,
        telephone: true,
        adresse: true,
        role: true,
        dateEmbauche: true,
        isActive: true,
        lastLogin: true,
        lastLogout: true,
        
        // Relations avec sélection des champs
        poste: {
          select: {
            nom: true,
            description: true
          }
        },
        permissions: {
          select: {
            permission: true
          }
        },
        contrats: {
          select: {
            type: true,
            dateDebut: true,
            dateFin: true
          },
          orderBy: { dateDebut: 'desc' }
        },
        disponibilites: {
          select: {
            jour: true,
            heureDebut: true,
            heureFin: true
          }
        },
        conges: {
          select: {
            type: true,
            dateDebut: true,
            dateFin: true,
            statut: true
          },
          orderBy: { dateDebut: 'desc' }
        },
        rapportsEmploye: {
          select: {
            type: true,
            dateCreation: true,
            statut: true
          }
        },
        rapportsCreateur: {
          select: {
            type: true,
            dateCreation: true,
            statut: true
          }
        },
        notifications: {
          select: {
            message: true,
            date: true,
            statut: true
          },
          orderBy: { date: 'desc' },
          take: 10
        },
        plannings: {
          select: {
            nom: true,
            dateCreation: true,
            statut: true,
            periode: {
              select: {
                debut: true,
                fin: true
              }
            },
            creneaux: {
              select: {
                id: true,
                dateDebut: true,
                dateFin: true,
                type: true,
                valide: true,
                statutTache: true
              }
            }
          }
        },
        taches: {
          select: {
            label: true,
            description: true,
            dateLimite: true,
            statut: true,
            dateCompletion: true
          },
          orderBy: { dateLimite: 'asc' }
        },
        creneaux: {
          select: {
            dateDebut: true,
            dateFin: true,
            type: true,
            valide: true,
            statutTache: true,
            planning: {
              select: {
                nom: true
              }
            },
            tache: {
              select: {
                label: true
              }
            }
          },
          orderBy: { dateDebut: 'desc' }
        },
        syntheses: {
          select: {
            periodeFrom: true,
            periodeTo: true,
            heuresNormales: true,
            heuresSupplementaires: true,
            statut: true
          },
          orderBy: { periodeFrom: 'desc' }
        }
      }
    });

    if (!employee) {
      return NextResponse.json(
        { error: 'Employé non trouvé' },
        { status: 404 }
      );
    }

    // Transformation des permissions en tableau simple
    const responseData = {
      ...employee,
      permissions: employee.permissions.map(p => p.permission)
    };

    return NextResponse.json(responseData);

  } catch (error) {
    console.error('Erreur profile:', error);
    return NextResponse.json(
      { 
        error: 'Erreur lors de la récupération du profil',
        details: error instanceof Error ? error.message : 'Erreur inconnue'
      },
      { status: 500 }
    );
  }
}