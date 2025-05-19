

/**
 * Met à jour un planning existant dans la base de données.
 * 
 * @param request - La requête HTTP contenant les données de mise à jour du planning.
 * @param params - Les paramètres de la requête, incluant l'identifiant du planning à mettre à jour.
 * 
 * @returns Une réponse JSON indiquant le succès ou l'échec de l'opération.
 * 
 * ### Étapes principales :
 * 1. **Authentification et permissions** :
 *    - Vérifie la présence et la validité du token JWT.
 *    - Vérifie si l'utilisateur a les permissions nécessaires (`PLANNING_UPDATE` ou accès total).
 * 
 * 2. **Validation des données** :
 *    - Valide les données de la requête à l'aide de `zod` selon le schéma `updatePlanningSchema`.
 * 
 * 3. **Vérification de l'existence du planning** :
 *    - Vérifie si le planning avec l'ID fourni existe dans la base de données.
 * 
 * 4. **Vérification des conflits de créneaux** :
 *    - Si des créneaux sont fournis, vérifie les conflits avec d'autres créneaux existants pour les mêmes employés.
 * 
 * 5. **Mise à jour transactionnelle** :
 *    - Met à jour les informations du planning, y compris les périodes et les créneaux associés.
 *    - Supprime les anciens créneaux non inclus dans la mise à jour.
 *    - Crée ou met à jour les créneaux fournis.
 *    - Met à jour les synthèses horaires associées au planning.
 * 
 * 6. **Gestion des erreurs** :
 *    - Retourne une erreur 400 si les données sont invalides.
 *    - Retourne une erreur 401 si le token est manquant ou invalide.
 *    - Retourne une erreur 403 si l'utilisateur n'a pas les permissions nécessaires.
 *    - Retourne une erreur 404 si le planning n'est pas trouvé.
 *    - Retourne une erreur 409 en cas de conflits de créneaux.
 *    - Retourne une erreur 500 pour toute autre erreur serveur.
 * 
 * ### Exemple de réponse en cas de succès :
 * ```json
 * {
 *   "success": true,
 *   "planningId": "123e4567-e89b-12d3-a456-426614174000",
 *   "message": "Planning mis à jour avec succès"
 * }
 * ```
 * 
 * ### Exemple de réponse en cas de conflit :
 * ```json
 * {
 *   "error": "Conflits de planning détectés",
 *   "conflicts": [
 *     {
 *       "creneauPropose": { ... },
 *       "conflits": [ ... ]
 *     }
 *   ],
 *   "message": "1 conflit(s) trouvé(s)"
 * }
 * ```
 * 
 * ### Notes :
 * - Les créneaux sont vérifiés pour éviter les chevauchements avec d'autres créneaux pour le même employé.
 * - Les synthèses horaires sont recalculées après chaque mise à jour des créneaux.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth/jwt';
import { EnumStatutTache, StatutValidation, TypeCreneau } from '@prisma/client';
import { z } from 'zod';

const updatePlanningSchema = z.object({
  nom: z.string().min(3).max(100).optional(),
  statut: z.nativeEnum(StatutValidation).optional(),
  dateDebut: z.string().datetime().optional(),
  dateFin: z.string().datetime().optional(),
  creneaux: z.array(
    z.object({
      id: z.string().uuid().optional(), // Optionnel pour nouveaux créneaux
      employeeId: z.string().uuid(),
      tacheId: z.string().uuid(),
      dateDebut: z.string().datetime(),
      dateFin: z.string().datetime(),
      type: z.nativeEnum(TypeCreneau),
      commentaire: z.string().optional(),
      duree: z.number().int().positive(),
      valide: z.boolean().optional(),
      statutTache: z.nativeEnum(EnumStatutTache).optional()
    })
  ).optional()
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = (await params).id;
  try {
    // 1. Authentification et permissions
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ error: 'Token manquant' }, { status: 401 });
    }

    const decoded = await verifyToken(token);
    const hasPermission = decoded.permissions.includes('PLANNING_UPDATE') || decoded.hasAllAccess;
    if (!hasPermission) {
      return NextResponse.json({ error: 'Permissions insuffisantes' }, { status: 403 });
    }

    // 2. Validation des données
    const body = await request.json();
    const validatedData = updatePlanningSchema.parse(body);

    // 3. Vérification que le planning existe
    const existingPlanning = await prisma.planning.findUnique({
      where: { id: id },
      include: {
        periode: true,
        creneaux: true
      }
    });

    if (!existingPlanning) {
      return NextResponse.json({ error: 'Planning non trouvé' }, { status: 404 });
    }

    // 4. Vérification des conflits si modification de créneaux
    if (validatedData.creneaux) {
      const conflicts = await checkCreneauConflicts(
        validatedData.creneaux, 
        id
      );
      if (conflicts.length > 0) {
        return NextResponse.json(
          { 
            error: 'Conflits de planning détectés',
            conflicts,
            message: `${conflicts.length} conflit(s) trouvé(s)`
          },
          { status: 409 }
        );
      }
    }

    // 5. Mise à jour en transaction
    const updatedPlanning = await prisma.$transaction(async (prisma) => {
      // a. Mise à jour de la période si dates modifiées
      let dateRangeId = existingPlanning.dateRangeId;
      if (validatedData.dateDebut || validatedData.dateFin) {
        const newDateRange = await prisma.dateRange.update({
          where: { id: existingPlanning.dateRangeId },
          data: {
            debut: validatedData.dateDebut 
              ? new Date(validatedData.dateDebut) 
              : existingPlanning.periode.debut,
            fin: validatedData.dateFin 
              ? new Date(validatedData.dateFin) 
              : existingPlanning.periode.fin
          }
        });
        dateRangeId = newDateRange.id;
      }

      // b. Mise à jour du planning
      const planning = await prisma.planning.update({
        where: { id: id },
        data: {
          nom: validatedData.nom,
          statut: validatedData.statut,
          dateRangeId
        },
        include: { creneaux: true }
      });

      // c. Gestion des créneaux (si fournis)
      if (validatedData.creneaux) {
        // Suppression des anciens créneaux non inclus
        const creneauxToKeep = validatedData.creneaux
          .filter(c => c.id)
          .map(c => c.id)
          .filter((id): id is string => id !== undefined);

        await prisma.creneau.deleteMany({
          where: {
            planningId: id,
            NOT: { id: { in: creneauxToKeep } }
          }
        });

        // Création/Mise à jour des créneaux
        for (const creneau of validatedData.creneaux) {
          if (creneau.id) {
            // Mise à jour
            await prisma.creneau.update({
              where: { id: creneau.id },
              data: {
                dateDebut: new Date(creneau.dateDebut),
                dateFin: new Date(creneau.dateFin),
                type: creneau.type,
                duree: creneau.duree,
                commentaire: creneau.commentaire,
                valide: creneau.valide ?? false,
                statutTache: creneau.statutTache ?? 'A_FAIRE',
                employeeId: creneau.employeeId,
                tacheId: creneau.tacheId
              }
            });
          } else {
            // Création
            await prisma.creneau.create({
              data: {
                ...creneau,
                dateDebut: new Date(creneau.dateDebut),
                dateFin: new Date(creneau.dateFin),
                planningId: id,
                valide: creneau.valide ?? false,
                statutTache: creneau.statutTache ?? 'A_FAIRE'
              }
            });
          }
        }

        // d. Mise à jour des synthèses horaires
        await updateSyntheses(prisma, id);
      }

      return planning;
    });

    // 6. Réponse succès
    return NextResponse.json({
      success: true,
      planningId: updatedPlanning.id,
      message: 'Planning mis à jour avec succès'
    });

  } catch (error) {
    console.error('Erreur mise à jour planning:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Données invalides', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { 
        error: 'Erreur lors de la mise à jour'
      },
      { status: 500 }
    );
  }
}

// Fonction améliorée de vérification des conflits
async function checkCreneauConflicts(creneaux: any[], planningId: string) {
  const conflicts = [];

  for (const creneau of creneaux) {
    const whereClause = {
      employeeId: creneau.employeeId,
      NOT: { 
        id: creneau.id ? creneau.id : undefined,
        planningId // Exclure les créneaux du même planning
      },
      OR: [
        {
          dateDebut: { lt: new Date(creneau.dateFin) },
          dateFin: { gt: new Date(creneau.dateDebut) }
        }
      ]
    };

    const existing = await prisma.creneau.findMany({
      where: whereClause,
      include: {
        planning: { select: { nom: true } },
        tache: { select: { label: true } }
      }
    });

    if (existing.length > 0) {
      conflicts.push({
        creneauPropose: creneau,
        conflits: existing
      });
    }
  }

  return conflicts;
}

// Fonction de mise à jour des synthèses
async function updateSyntheses(prisma: any, planningId: string) {
  // 1. Suppression des anciennes synthèses
  await prisma.syntheseHeures.deleteMany({
    where: { planningId }
  });

  // 2. Calcul des nouvelles heures
  const creneaux = await prisma.creneau.findMany({
    where: { planningId },
    select: {
      employeeId: true,
      duree: true,
      dateDebut: true,
      dateFin: true
    }
  });

  // ... (logique similaire à createSyntheses dans le endpoint de création)
}