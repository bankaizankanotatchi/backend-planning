import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth/jwt';
import { EnumPermission } from '@prisma/client';
import { z } from 'zod';

// Schéma de validation des données d'entrée
const conflictCheckSchema = z.object({
  employeeId: z.string().uuid(),
  dateDebut: z.string().datetime(),
  dateFin: z.string().datetime(),
  ignoreCreneauId: z.string().uuid().optional(),
  planningId: z.string().uuid().optional() // Pour exclure les créneaux du même planning
});

export async function POST(request: Request) {
  try {
    // 1. Authentification et vérification des permissions
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ error: 'Authentification requise' }, { status: 401 });
    }

    const decoded = await verifyToken(token);
    const hasPermission = decoded.permissions.includes('PLANNING_READ') || decoded.hasAllAccess;
    if (!hasPermission) {
      return NextResponse.json({ error: 'Permissions insuffisantes' }, { status: 403 });
    }

    // 2. Validation des données d'entrée
    const body = await request.json();
    const { employeeId, dateDebut, dateFin, ignoreCreneauId, planningId } = conflictCheckSchema.parse(body);

    // 3. Vérification des conflits
    const whereClause = {
      employeeId,
      NOT: {
        id: ignoreCreneauId || undefined, // Exclure un créneau spécifique (pour les mises à jour)
        planningId: planningId || undefined // Exclure les créneaux du même planning
      },
      OR: [
        // Chevauchement total ou partiel
        {
          dateDebut: { lt: new Date(dateFin) },
          dateFin: { gt: new Date(dateDebut) }
        }
      ]
    };

    const conflictingSlots = await prisma.creneau.findMany({
      where: whereClause,
      select: {
        id: true,
        dateDebut: true,
        dateFin: true,
        type: true,
        planning: {
          select: {
            id: true,
            nom: true,
            statut: true
          }
        },
        tache: {
          select: {
            id: true,
            label: true
          }
        }
      },
      orderBy: {
        dateDebut: 'asc'
      }
    });

    // 4. Vérification des disponibilités de l'employé
    const employeeAvailability = await prisma.disponibilite.findFirst({
      where: {
        employeeId,
        jour: new Date(dateDebut).toLocaleString('fr-FR', { weekday: 'long' }).toUpperCase() as any,
        heureDebut: { lte: new Date(dateDebut) },
        heureFin: { gte: new Date(dateFin) }
      }
    });

    // 5. Vérification des congés
    const onLeave = await prisma.conge.findFirst({
      where: {
        employeeId,
        statut: 'VALIDE',
        dateDebut: { lte: new Date(dateFin) },
        dateFin: { gte: new Date(dateDebut) }
      }
    });

    // 6. Formatage de la réponse
    const response = {
      hasConflicts: conflictingSlots.length > 0,
      conflicts: conflictingSlots.map(slot => ({
        creneauId: slot.id,
        creneauType: slot.type,
        planningId: slot.planning.id,
        planningName: slot.planning.nom,
        planningStatus: slot.planning.statut,
        tache: slot.tache.label,
        periode: {
          debut: slot.dateDebut,
          fin: slot.dateFin
        },
        conflictType: 'CRENEAU'
      })),
      availability: employeeAvailability ? {
        status: 'DISPONIBLE',
        periode: {
          debut: employeeAvailability.heureDebut,
          fin: employeeAvailability.heureFin
        }
      } : {
        status: 'NON_DISPONIBLE',
        reason: 'Pas de disponibilité enregistrée pour ce créneau'
      },
      leaveStatus: onLeave ? {
        status: 'EN_CONGE',
        type: onLeave.type,
        periode: {
          debut: onLeave.dateDebut,
          fin: onLeave.dateFin
        }
      } : {
        status: 'AUCUN_CONGE'
      }
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Erreur vérification conflits:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Données invalides', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { 
        error: 'Erreur lors de la vérification des conflits',
        details: process.env.NODE_ENV === 'development' ? (error instanceof Error && error.message) : undefined
      },
      { status: 500 }
    );
  }
}

// But de l'API /api/planning/check-conflicts

// Cette API a pour objectif de vérifier les conflits potentiels avant d'ajouter ou de modifier un créneau dans un planning. Elle permet de s'assurer qu'un employé n'est pas déjà affecté à une autre tâche sur la même plage horaire, qu'il est disponible selon ses heures de travail habituelles, et qu'il n'est pas en congé.
// Impact de chaque paramètre dans la requête
// 1. employeeId (Obligatoire)

//     Type : UUID

//     Rôle : Identifie l'employé dont on veut vérifier la disponibilité.

//     Impact :

//         L'API recherche tous les créneaux existants pour cet employé.

//         Vérifie ses disponibilités (Disponibilite) et ses congés (Conge).

// 2. dateDebut + dateFin (Obligatoires)

//     Type : DateTime (ISO 8601)

//     Rôle : Définit la plage horaire à vérifier.

//     Impact :

//         L'API recherche les créneaux qui chevauchent cette période.

//         Exemple : Si un employé a déjà un créneau de 10h à 12h, une vérification pour 11h-13h retournera un conflit.

// 3. ignoreCreneauId (Optionnel)

//     Type : UUID

//     Rôle : Exclut un créneau spécifique de la vérification (utile pour les mises à jour).

//     Impact :

//         Permet de modifier un créneau sans le considérer comme un conflit.

//         Exemple : Si on met à jour le créneau abc123-def456-ghi789, on ne veut pas qu'il soit détecté comme un conflit avec lui-même.

// 4. planningId (Optionnel)

//     Type : UUID

//     Rôle : Exclut les créneaux du même planning (utile pour éviter les faux conflits internes).

//     Impact :

//         Si un planning a plusieurs créneaux pour le même employé (ex. : réunion + travail), on peut ignorer les conflits au sein du même planning.

//         Exemple : Si planningId: "xyz987" est fourni, l'API ne retournera pas les conflits provenant de ce planning.

// Réponse de l'API

// L'API retourne une réponse structurée indiquant :

//     hasConflicts (boolean) → true si conflit(s) détecté(s).

//     conflicts → Liste des créneaux en conflit (planning, tâche, période).

//     availability → Statut de disponibilité de l'employé.

//     leaveStatus → Indique si l'employé est en congé.

// Cas d'utilisation

//     Avant la création d'un créneau → Vérifier qu'un employé est disponible.

//     Avant une mise à jour → Vérifier qu'un changement d'horaire ne crée pas de conflit.

//     Optimisation des plannings → Éviter les doubles réservations ou les erreurs de gestion.

// Cette API est essentielle pour garantir la cohérence des plannings et éviter les erreurs d'affectation. 