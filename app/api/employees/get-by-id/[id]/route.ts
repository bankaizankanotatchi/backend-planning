import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth/jwt';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    // 1. Vérification de l'authentification
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const decoded = await verifyToken(token);
    
    // 2. Vérification des permissions (lecture employé ou accès complet)
    const hasEmployeeRead = decoded.permissions.includes('EMPLOYEE_READ');
    const hasAllAccess = decoded.hasAllAccess;
    
    // Si l'utilisateur n'a pas les permissions nécessaires, on renvoie une erreur
    if (!hasEmployeeRead && !hasAllAccess) {
      return NextResponse.json(
        { error: 'Permissions insuffisantes' }, 
        { status: 403 }
      );
    }

    // 3. Récupération de l'employé avec les relations
    const employee = await prisma.employee.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        nom: true,
        prenom: true,
        email: true,
        telephone: true,
        adresse: true,
        role: true,
        isActive: true,
        dateEmbauche: true,
        dateFin: true,
        poste: {
          select: {
            nom: true,
            description: true
          }
        },
        contrats: {
          orderBy: { dateDebut: 'desc' },
          select: {
            type: true,
            dateDebut: true,
            dateFin: true
          }
        },
        disponibilites: {
          select: {
            jour: true,
            heureDebut: true,
            heureFin: true
          }
        },
        // Seuls les admins peuvent voir ces champs sensibles
        ...((hasAllAccess) && {
          lastLogin: true,
          lastLogout: true
        })
      }
    });

    if (!employee) {
      return NextResponse.json(
        { error: 'Employé non trouvé' },
        { status: 404 }
      );
    }

    // 4. Formatage de la réponse
    const responseData = {
      ...employee,
      currentContract: employee.contrats[0] || null,
      // Retirer les tableaux originaux non nécessaires
      contrats: undefined,
      disponibilites: employee.disponibilites,
      // Champ calculé pour le frontend
      fullName: `${employee.prenom} ${employee.nom}`.trim()
    };

    return NextResponse.json(responseData);

  } catch (error) {
    console.error('Erreur récupération employé:', error);
    
    return NextResponse.json(
      { 
        error: 'Erreur lors de la récupération'
      },
      { status: 500 }
    );
  }
}