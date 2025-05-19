
/**
 * Gère la déconnexion d'un utilisateur en révoquant son token d'authentification
 * et en supprimant le cookie associé.
 *
 * @function POST
 * @async
 * 
 * @param {Request} request - La requête HTTP entrante.
 * 
 * @returns {Promise<Response>} Une réponse JSON indiquant le succès ou l'échec de l'opération.
 * 
 * @throws {Error} Si une erreur se produit lors de la gestion de la déconnexion.
 * 
 * @description
 * Cette fonction effectue les étapes suivantes :
 * 1. Récupère le token d'authentification depuis les cookies ou le header Authorization.
 * 2. Vérifie si le token est révoqué en consultant la base de données.
 * 3. Si le token est valide, il est ajouté à une liste noire (table `revokedToken`).
 * 4. Met à jour la date de dernière déconnexion (`lastLogout`) de l'employé dans la base de données.
 * 5. Supprime le cookie `auth-token` côté serveur.
 * 
 * @example
 * // Exemple d'utilisation :
 * const response = await fetch('/api/auth/logout', {
 *   method: 'POST',
 *   headers: {
 *     Authorization: 'Bearer <votre_token>'
 *   }
 * });
 * const data = await response.json();
 * console.log(data);
 * 
 * @response
 * - Succès : `{ success: true, message: 'Déconnexion réussie', token: null }`
 * - Échec : `{ success: false, message: 'Erreur lors de la déconnexion', error: '<message_erreur>' }`
 */
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