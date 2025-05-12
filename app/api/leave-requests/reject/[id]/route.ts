// app/api/leave-requests/reject/[id]/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth/jwt';
import { StatutDemande } from '@prisma/client';
import { z } from 'zod';

// Schéma de validation pour le corps de la requête
const rejectSchema = z.object({
  reason: z.string().min(10).max(500).optional() // Raison obligatoire pour le rejet
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = (await params).id;
  try {
    // 1. Authentification et vérification des permissions
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json(
        { error: 'Authentification requise' }, 
        { status: 401 }
      );
    }

    const decoded = await verifyToken(token);
    if (!decoded) {
      return NextResponse.json(
        { error: 'Token invalide ou expiré' },
        { status: 401 }
      );
    }

    // 2. Vérification des permissions (LEAVE_APPROVE ou ALL_ACCESS)
    const canReject = decoded.permissions.includes('LEAVE_APPROVE') || 
                      decoded.hasAllAccess;
    if (!canReject) {
      return NextResponse.json(
        { error: 'Permissions insuffisantes pour rejeter des demandes' },
        { status: 403 }
      );
    }

    // 3. Validation de l'ID
    const leaveRequestId = id;
    if (!leaveRequestId) {
      return NextResponse.json(
        { error: 'ID de demande de congé manquant' },
        { status: 400 }
      );
    }

    // 4. Récupération de la demande existante
    const existingRequest = await prisma.conge.findUnique({
      where: { id: leaveRequestId },
      include: {
        employee: {
          select: {
            id: true,
            nom: true,
            prenom: true,
            email: true
          }
        }
      }
    });

    if (!existingRequest) {
      return NextResponse.json(
        { error: 'Demande de congé non trouvée' },
        { status: 404 }
      );
    }

     // Empêcher l'auto rejection
     if (existingRequest.employeeId === decoded.employeeId) {
      return NextResponse.json(
        { error: 'Vous ne pouvez pas rejetter votre propre demande de congé' },
        { status: 403 }
      );
    }

    // 5. Vérification du statut actuel
    if (existingRequest.statut !== 'EN_ATTENTE') {
      return NextResponse.json(
        { 
          error: 'Action impossible',
          details: `Seules les demandes avec statut "EN_ATTENTE" peuvent être rejetées (statut actuel: ${existingRequest.statut})`
        },
        { status: 400 }
      );
    }


     // 6. Validation des données optionnelles
     let reason = '';
     try {
       const body = await request.json();
       const validatedData = rejectSchema.parse(body);
       reason = validatedData.reason || '';
     } catch {
       // Le corps de la requête est optionnel
     }

    // 7. Rejet de la demande
    const rejectedRequest = await prisma.conge.update({
      where: { id: leaveRequestId },
      data: { 
        statut: 'REJETEE',
        rejectedAt: new Date(),
        rejectedBy: decoded.employeeId,
      },
      include: {
        employee: {
          select: {
            id: true,
            nom: true,
            prenom: true,
            email: true
          }
        }
      }
    });

    // 8. Envoi de notification (exemple)
    await prisma.notification.create({
      data: {
          destinataireId: rejectedRequest.employee.id,
          message: `Demande de congé rejetée: ${rejectedRequest.type}`,
      }
  });

    return NextResponse.json({
      success: true,
      data: {
        ...rejectedRequest,
        dateDebut: rejectedRequest.dateDebut.toISOString(),
        dateFin: rejectedRequest.dateFin.toISOString(),
        employee: `${rejectedRequest.employee.prenom} ${rejectedRequest.employee.nom}`
      },
      message: 'Demande rejetée avec succès'
    });

  } catch (error) {
    console.error('[REJECT_LEAVE_REQUEST_ERROR]', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          error: 'Données invalides',
          details: error.errors.map(e => ({
            path: e.path.join('.'),
            message: e.message
          }))
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { 
        error: 'Erreur lors du rejet de la demande',
        details: process.env.NODE_ENV === 'development' 
          ? (error instanceof Error ? error.message : undefined)
          : undefined
      },
      { status: 500 }
    );
  }
}