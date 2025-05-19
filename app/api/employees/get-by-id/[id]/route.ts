

/**
 * Récupère les informations détaillées d'un employé par son identifiant.
 * 
 * @param request - L'objet Request de la requête HTTP.
 * @param params - Les paramètres de la requête, contenant l'identifiant de l'employé.
 * 
 * @returns Une réponse JSON contenant les informations de l'employé ou une erreur.
 * 
 * @throws {401} Si l'utilisateur n'est pas authentifié (absence de token).
 * @throws {403} Si l'utilisateur n'a pas les permissions nécessaires pour accéder aux données de l'employé.
 * @throws {404} Si aucun employé correspondant à l'identifiant fourni n'est trouvé.
 * @throws {500} En cas d'erreur interne lors de la récupération des données.
 * 
 * ### Étapes principales :
 * 1. **Vérification de l'authentification** : 
 *    - Extraction et validation du token JWT depuis les en-têtes de la requête.
 * 2. **Vérification des permissions** :
 *    - Vérifie si l'utilisateur a les permissions `EMPLOYEE_READ` ou un accès complet (`hasAllAccess`).
 * 3. **Récupération des données de l'employé** :
 *    - Recherche l'employé dans la base de données via Prisma, avec ses relations (poste, contrats, disponibilités).
 *    - Les champs sensibles (`lastLogin`, `lastLogout`) ne sont accessibles qu'aux administrateurs.
 * 4. **Formatage de la réponse** :
 *    - Ajoute un champ calculé `fullName` (nom complet).
 *    - Inclut uniquement le contrat actuel et les disponibilités.
 * 
 * ### Exemple de réponse réussie :
 * ```json
 * {
 *   "id": "123",
 *   "nom": "Dupont",
 *   "prenom": "Jean",
 *   "email": "jean.dupont@example.com",
 *   "telephone": "0123456789",
 *   "adresse": "123 Rue Exemple",
 *   "role": "Employé",
 *   "isActive": true,
 *   "dateEmbauche": "2022-01-01",
 *   "dateFin": null,
 *   "poste": {
 *     "nom": "Développeur",
 *     "description": "Développement d'applications web"
 *   },
 *   "currentContract": {
 *     "type": "CDI",
 *     "dateDebut": "2022-01-01",
 *     "dateFin": null
 *   },
 *   "disponibilites": [
 *     {
 *       "jour": "Lundi",
 *       "heureDebut": "09:00",
 *       "heureFin": "17:00"
 *     }
 *   ],
 *   "fullName": "Jean Dupont"
 * }
 * ```
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth/jwt';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {

  const id = (await params).id;
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
      where: { id: id },
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