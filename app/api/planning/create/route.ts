
/**
 * @module API/Planning/Create
 * @description API pour la création d'un planning avec gestion des créneaux, validation des données, 
 * vérification des conflits et génération de synthèses horaires.
 * 
 * @function POST
 * @async
 * @param {Request} request - Requête HTTP contenant les données du planning à créer.
 * @returns {Promise<NextResponse>} Réponse HTTP avec le statut et les données associées.
 * 
 * @throws {401} Si le token d'authentification est manquant ou invalide.
 * @throws {403} Si l'utilisateur n'a pas les permissions nécessaires pour créer un planning.
 * @throws {400} Si les données fournies ne respectent pas le schéma de validation.
 * @throws {409} Si des conflits de créneaux sont détectés.
 * @throws {500} En cas d'erreur interne lors de la création du planning.
 * 
 * @example
 * // Requête POST
 * const response = await fetch('/api/planning/create', {
 *   method: 'POST',
 *   headers: {
 *     'Authorization': 'Bearer <token>',
 *     'Content-Type': 'application/json'
 *   },
 *   body: JSON.stringify({
 *     nom: "Planning 1",
 *     dateDebut: "2023-10-01T08:00:00Z",
 *     dateFin: "2023-10-07T18:00:00Z",
 *     creneaux: [
 *       {
 *         employeeId: "123e4567-e89b-12d3-a456-426614174000",
 *         tacheId: "123e4567-e89b-12d3-a456-426614174001",
 *         dateDebut: "2023-10-01T08:00:00Z",
 *         dateFin: "2023-10-01T12:00:00Z",
 *         type: "TRAVAIL",
 *         duree: 240
 *       }
 *     ]
 *   })
 * });
 * 
 * @remarks
 * - Cette API nécessite un token JWT valide pour authentifier l'utilisateur.
 * - Les permissions nécessaires incluent `PLANNING_CREATE` ou un accès complet.
 * - Les données sont validées avec Zod avant d'être traitées.
 * - Les conflits de créneaux sont vérifiés pour éviter les chevauchements.
 * - Les synthèses horaires sont générées pour chaque employé impliqué dans le planning.
 * 
 * @see {@link /lib/prisma} pour l'intégration avec Prisma.
 * @see {@link /lib/auth/jwt} pour la gestion des tokens JWT.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth/jwt';
import { EnumPermission, StatutValidation, TypeCreneau } from '@prisma/client';
import { z } from 'zod';

// Schéma de validation avec Zod
const createPlanningSchema = z.object({
  nom: z.string().min(3).max(100),
  dateDebut: z.string().datetime(),
  dateFin: z.string().datetime(),
  creneaux: z.array(
    z.object({
      employeeId: z.string().uuid(),
      tacheId: z.string().uuid(),
      dateDebut: z.string().datetime(),
      dateFin: z.string().datetime(),
      type: z.nativeEnum(TypeCreneau),
      commentaire: z.string().optional(),
      duree: z.number().int().positive()
    })
  ).min(1),
  statut: z.nativeEnum(StatutValidation).optional().default('BROUILLON')
});

export async function POST(request: Request) {
  try {
    // 1. Authentification et vérification des permissions
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ error: 'Token manquant' }, { status: 401 });
    }

    const decoded = await verifyToken(token);
    const hasPermission = decoded.permissions.includes('PLANNING_CREATE') || decoded.hasAllAccess;
    if (!hasPermission) {
      return NextResponse.json({ error: 'Permissions insuffisantes' }, { status: 403 });
    }

    // 2. Validation des données d'entrée
    const body = await request.json();
    const validatedData = createPlanningSchema.parse(body);

    // 3. Vérification des conflits de créneaux
    const conflicts = await checkCreneauConflicts(validatedData.creneaux);
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

    // 4. Création en transaction
    const newPlanning = await prisma.$transaction(async (prisma) => {
      // a. Création de la période
      const dateRange = await prisma.dateRange.create({
        data: {
          debut: new Date(validatedData.dateDebut),
          fin: new Date(validatedData.dateFin)
        }
      });

      // b. Création du planning principal
      const planning = await prisma.planning.create({
        data: {
          nom: validatedData.nom,
          statut: validatedData.statut,
          createur: { connect: { id: decoded.employeeId } },
          periode: { connect: { id: dateRange.id } }
        }
      });

      // c. Création des créneaux
      await prisma.creneau.createMany({
        data: validatedData.creneaux.map(creneau => ({
          dateDebut: new Date(creneau.dateDebut),
          dateFin: new Date(creneau.dateFin),
          type: creneau.type,
          duree: creneau.duree,
          commentaire: creneau.commentaire,
          statutTache: 'A_FAIRE',
          valide: false,
          employeeId: creneau.employeeId,
          tacheId: creneau.tacheId,
          planningId: planning.id
        }))
      });

      // d. Création des synthèses horaires
      await createSyntheses(prisma, planning.id, validatedData.creneaux);

      return planning;
    });

    // 5. Réponse succès
    return NextResponse.json(
      { 
        success: true,
        planningId: newPlanning.id,
        message: 'Planning créé avec succès'
      },
      { status: 201 }
    );

  } catch (error) {
    // Gestion des erreurs
    console.error('Erreur création planning:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          error: 'Validation des données échouée',
          details: error.errors 
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { 
        error: 'Erreur lors de la création du planning'
      },
      { status: 500 }
    );
  }
}

// Fonction pour vérifier les conflits de créneaux
async function checkCreneauConflicts(creneaux: any[]) {
  const conflicts = [];

  for (const creneau of creneaux) {
    const existing = await prisma.creneau.findMany({
      where: {
        employeeId: creneau.employeeId,
        OR: [
          {
            dateDebut: { lt: new Date(creneau.dateFin) },
            dateFin: { gt: new Date(creneau.dateDebut) }
          }
        ]
      },
      include: {
        planning: { select: { nom: true } },
        tache: { select: { label: true } }
      }
    });

    if (existing.length > 0) {
      conflicts.push({
        employeeId: creneau.employeeId,
        creneauPropose: creneau,
        conflits: existing
      });
    }
  }

  return conflicts;
}

// Fonction pour créer les synthèses horaires
async function createSyntheses(prisma: any, planningId: string, creneaux: any[]) {
  const employeesMap = new Map<string, { heuresNormales: number, heuresSupplementaires: number }>();

  // Calcul des heures par employé
  for (const creneau of creneaux) {
    const durationHours = creneau.duree / 60;
    const employeeData = employeesMap.get(creneau.employeeId) || { heuresNormales: 0, heuresSupplementaires: 0 };
    
    // Logique pour déterminer heures normales/supplémentaires
    // (À adapter selon vos règles métiers)
    employeeData.heuresNormales += durationHours;
    employeesMap.set(creneau.employeeId, employeeData);
  }

  // Création des synthèses
  for (const [employeeId, heures] of employeesMap) {
    await prisma.syntheseHeures.create({
      data: {
        employee: { connect: { id: employeeId } },
        planning: { connect: { id: planningId } },
        periodeFrom: new Date(creneaux[0].dateDebut),
        periodeTo: new Date(creneaux[0].dateFin),
        heuresNormales: Math.round(heures.heuresNormales),
        heuresSupplementaires: Math.round(heures.heuresSupplementaires),
        statut: 'BROUILLON'
      }
    });
  }
}