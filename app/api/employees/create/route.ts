import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { verifyToken } from '@/lib/auth/jwt';
import { EnumPermission } from '@prisma/client';

const employeeSchema = z.object({
  nom: z.string().min(2),
  prenom: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  posteId: z.string().uuid(),
  telephone: z.string(),
  adresse: z.string(),
  role: z.enum(['EMPLOYE_BASE', 'MANAGER', 'ADMIN']),
  dateEmbauche: z.string().datetime(),
  typeContrat: z.enum(['CDI', 'CDD', 'INTERIM']),
  dateDebutContrat: z.string().datetime(),
  dateFinContrat: z.string().datetime().optional().refine((val) => {
    if (!val) return true;
    return new Date(val) > new Date();
  }, {
    message: "La date de fin doit être dans le futur"
  }),
  permissions: z.array(z.string()).optional()
});

export async function POST(request: Request) {
  try {
    // Vérification du token et des permissions
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const decoded = await verifyToken(token);
    if (!decoded.permissions.includes('EMPLOYEE_EDIT') && !decoded.hasAllAccess) {
      return NextResponse.json({ error: 'Permissions insuffisantes' }, { status: 403 });
    }

    const body = await request.json();

    // Validation de la date de fin pour les types de contrat CDD ou INTERIM
    if ((body.typeContrat === 'CDD' || body.typeContrat === 'INTERIM') && !body.dateFinContrat) {
      return NextResponse.json(
        { error: 'La date de fin du contrat est obligatoire pour les types de contrat CDD ou INTERIM' },
        { status: 400 }
      );
    }
    const validatedData = employeeSchema.parse(body);

    // Vérification de l'email unique
    const existingEmployee = await prisma.employee.findUnique({
      where: { email: validatedData.email }
    });

    if (existingEmployee) {
      return NextResponse.json(
        { error: 'Un employé avec cet email existe déjà' },
        { status: 409 }
      );
    }

    // Hachage du mot de passe
    const hashedPassword = await bcrypt.hash(validatedData.password, 12);

    // Création de l'employé avec transaction
    const newEmployee = await prisma.$transaction(async (prisma) => {
      const employee = await prisma.employee.create({
        data: {
          nom: validatedData.nom,
          prenom: validatedData.prenom,
          email: validatedData.email,
          passwordHash: hashedPassword,
          posteId: validatedData.posteId,
          telephone: validatedData.telephone,
          adresse: validatedData.adresse,
          role: validatedData.role,
          dateEmbauche: new Date(validatedData.dateEmbauche),
          isActive: true,
          contrats: {
            create: {
              type: validatedData.typeContrat,
              dateDebut: new Date(validatedData.dateDebutContrat),
              dateFin: validatedData.dateFinContrat ? new Date(validatedData.dateFinContrat) : null
            }
          }
        }
      });

      // Assignation des permissions si spécifiées
      if (validatedData.permissions && validatedData.permissions.length > 0) {
        await prisma.employeePermission.createMany({
          data: validatedData.permissions.map(permission => ({
            employeeId: employee.id,
            permission: permission as EnumPermission
          }))
        });
      }

      return employee;
    });

    return NextResponse.json(
      { 
        message: 'Employé créé avec succès',
        employeeId: newEmployee.id 
      },
      { status: 201 }
    );

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Données invalides', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Erreur création employé:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la création' },
      { status: 500 }
    );
  }
}