import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { signToken } from '@/lib/auth/jwt';
import { z } from 'zod';
import prisma from '@/lib/prisma';

const loginSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(4, 'Le mot de passe doit contenir au moins 4 caractères')
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = loginSchema.parse(body);

    const employee = await prisma.employee.findUnique({
      where: { email, isActive: true },
      include: { 
        permissions: true,
        poste: { 
          select: { 
            nom: true 
          } 
        } 
      }
    });

    if (!employee) {
      return NextResponse.json(
        { error: 'Identifiants incorrects' },
        { status: 401 }
      );
    }

    const passwordValid = await bcrypt.compare(password, employee.passwordHash);
    if (!passwordValid) {
      return NextResponse.json(
        { error: 'Identifiants incorrects' },
        { status: 401 }
      );
    }

    const permissions = employee.permissions.map(p => p.permission);
    const token = signToken(employee.id, permissions);

    await prisma.employee.update({
      where: { id: employee.id },
      data: { lastLogin: new Date() }
    });

    const responseData = {
      id: employee.id,
      email: employee.email,
      nom: employee.nom,
      prenom: employee.prenom,
      role: employee.role,
      poste: employee.poste?.nom,
      permissions,
      hasAllAccess: permissions.includes('ALL_ACCESS'),
      token // On retourne le token dans la réponse JSON
    };

    return NextResponse.json(
      { 
        message: 'Connexion réussie',
        employee: responseData 
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('Erreur de connexion:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la connexion' },
      { status: 500 }
    );
  }
}