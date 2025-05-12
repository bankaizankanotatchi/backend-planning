import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth/jwt';

export async function GET(request: Request) {
  try {
    // 1. Vérification de l'authentification et des permissions
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const decoded = await verifyToken(token);
    if (!decoded.permissions.includes('EMPLOYEE_READ') && !decoded.hasAllAccess) {
      return NextResponse.json({ error: 'Permissions insuffisantes' }, { status: 403 });
    }

    // 2. Récupération de tous les employés avec les relations essentielles
    const employees = await prisma.employee.findMany({
      select: {
        id: true,
        nom: true,
        prenom: true,
        email: true,
        telephone: true,
        role: true,
        isActive: true,
        dateEmbauche: true,
        poste: {
          select: {
            id: true,
            nom: true
          }
        },
        contrats: {
          orderBy: { dateDebut: 'desc' },
          take: 1,
          select: {
            type: true,
            dateDebut: true,
            dateFin: true
          }
        }
      },
      orderBy: [
        { nom: 'asc' },
        { prenom: 'asc' }
      ]
    });

    // 3. Formatage des données pour le front-end
    const formattedEmployees = employees.map(employee => ({
      ...employee,
      currentContract: employee.contrats[0] || null,
      contrats: undefined // On retire le tableau original pour simplifier
    }));

    return NextResponse.json(formattedEmployees);

  } catch (error) {
    console.error('Erreur récupération employés:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des employés' },
      { status: 500 }
    );
  }
}