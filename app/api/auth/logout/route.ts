
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth/jwt'

export async function POST(request: Request) {
  try {
    // 1. Récupérer le token depuis les cookies ou le header
    const authHeader = request.headers.get('authorization')
    const token = authHeader?.split(' ')[1] || (await cookies()).get('auth-token')?.value

    if (!token) {
      return NextResponse.json(
        { success: false, message: 'Aucun token trouvé' },
        { status: 400 }
      )
    }

      // Vérification si le token est révoqué
      const isRevoked = await prisma.revokedToken.findUnique({
        where: { token }
      });
  
      if (isRevoked) {
        return NextResponse.json(
          { error: 'Token révoqué' },
          { status: 401 }
        );
      }

    // 2. Optionnel : Ajouter le token à une liste noire
    try {
      const decoded = await verifyToken(token);
      
      const employeeId = decoded.employeeId;


      // Révocation du token
      await prisma.revokedToken.create({
        data: {
          token,
          employee_id: employeeId,
          expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000), // 8 heures
          revokedAt: new Date()
        }
      });
  
      //Journalisation de la déconnexion
      const updated = await prisma.employee.update({
        where: { id: employeeId },
        data: { lastLogout: new Date() }
      });

      console.log('Mise à jour lastLogout réussie:', updated);

    } catch (error) {
      console.error('Erreur lors de la révocation du token:', error)
    }

    // 3. Supprimer le cookie côté serveur
    (await
          // 3. Supprimer le cookie côté serveur
          cookies()).delete('auth-token')

    return NextResponse.json(
      { 
        success: true, 
        message: 'Déconnexion réussie',
        token: null // Retourne un token null pour clarté
      },
      { status: 200 }
    )

  } catch (error) {
    console.error('Erreur lors de la déconnexion:', error)
    return NextResponse.json(
      { 
        success: false, 
        message: 'Erreur lors de la déconnexion',
        error: error instanceof Error ? error.message : 'Erreur inconnue'
      },
      { status: 500 }
    )
  }
}