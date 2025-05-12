// app/api/tasks/create/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth/jwt';
import { EnumStatutTache } from '@prisma/client';
import { z } from 'zod';

// Schéma de validation
const taskSchema = z.object({
  label: z.string().min(3).max(100),
  description: z.string().max(500).optional(),
  dateLimite: z.string().datetime(),
  employeeId: z.string().uuid(),
  statut: z.nativeEnum(EnumStatutTache).optional().default('A_FAIRE')
});

export async function POST(request: Request) {
    try {
        // 1. Authentification
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

        // 2. Vérification des permissions
        const canCreateTask = decoded.permissions.includes('TASK_CREATE') || 
                                                 decoded.hasAllAccess;
        if (!canCreateTask) {
            return NextResponse.json(
                { error: 'Permissions insuffisantes pour créer des tâches' },
                { status: 403 }
            );
        }

        // 3. Validation des données
        const body = await request.json();
        const validatedData = taskSchema.parse(body);
        const dateLimite = new Date(validatedData.dateLimite);

        // 4. Vérification de l'employé assigné
        const employeeExists = await prisma.employee.findUnique({
            where: { id: validatedData.employeeId }
        });

        if (!employeeExists) {
            return NextResponse.json(
                { error: 'Employé assigné non trouvé' },
                { status: 404 }
            );
        }

        // 5. Vérification des dates (optionnelle)
        if (dateLimite < new Date()) {
            return NextResponse.json(
                { error: 'La date limite ne peut pas être dans le passé' },
                { status: 400 }
            );
        }

        // 6. Création de la tâche
        const newTask = await prisma.tache.create({
            data: {
                label: validatedData.label,
                description: validatedData.description ?? '',
                dateLimite: dateLimite,
                statut: validatedData.statut,
                employee: {
                    connect: { id: validatedData.employeeId }
                },
                createdAt: new Date(),
                updatedAt: new Date()
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

        // 7. Création d'une notification (exemple)
        await prisma.notification.create({
            data: {
                destinataireId: validatedData.employeeId,
                message: `Nouvelle tâche assignée: ${validatedData.label}`
            }
        });

        return NextResponse.json({
            success: true,
            data: {
                ...newTask,
                dateLimite: newTask.dateLimite.toISOString(),
                employee: `${newTask.employee.prenom} ${newTask.employee.nom}`
            }
        }, { status: 201 });

    } catch (error) {
        console.error('[CREATE_TASK_ERROR]', error);

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
                error: 'Erreur lors de la création de la tâche',
                details: process.env.NODE_ENV === 'development' 
                    ? (error instanceof Error ? error.message : undefined)
                    : undefined
            },
            { status: 500 }
        );
    }
}