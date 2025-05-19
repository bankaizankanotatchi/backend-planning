

/**
 * Gère le processus de connexion pour les employés.
 * 
 * Ce point de terminaison API valide l'email et le mot de passe fournis, vérifie les
 * informations d'identification de l'employé dans la base de données, et génère un
 * jeton JWT en cas d'authentification réussie.
 * 
 * @param request - L'objet de requête HTTP contenant les données de connexion.
 * 
 * @returns Une réponse JSON avec la structure suivante :
 * 
 * - En cas de succès (statut 200) :
 *   ```json
 *   {
 *     "message": "Connexion réussie",
 *     "employee": {
 *       "id": string,
 *       "email": string,
 *       "nom": string,
 *       "prenom": string,
 *       "role": string,
 *       "poste": string | null,
 *       "permissions": string[],
 *       "hasAllAccess": boolean,
 *       "token": string
 *     }
 *   }
 *   ```
 * 
 * - En cas d'échec d'authentification (statut 401) :
 *   ```json
 *   {
 *     "error": "Identifiants incorrects"
 *   }
 *   ```
 * 
 * - En cas d'erreur serveur (statut 500) :
 *   ```json
 *   {
 *     "error": "Erreur lors de la connexion"
 *   }
 *   ```
 * 
 * @throws {z.ZodError} Si le corps de la requête ne correspond pas au schéma attendu.
 * @throws {Error} Si une erreur inattendue survient lors du processus de connexion.
 * 
 * @example
 * // Exemple de payload de requête :
 * {
 *   "email": "employee@example.com",
 *   "password": "securepassword"
 * }
 * 
 * @example
 * // Exemple de réponse réussie :
 * {
 *   "message": "Connexion réussie",
 *   "employee": {
 *     "id": "123",
 *     "email": "employee@example.com",
 *     "nom": "Doe",
 *     "prenom": "John",
 *     "role": "Manager",
 *     "poste": "HR",
 *     "permissions": ["READ", "WRITE"],
 *     "hasAllAccess": false,
 *     "token": "jwt-token"
 *   }
 * }
 */import { NextResponse } from 'next/server';
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
      const response = NextResponse.json(
        { error: 'Identifiants incorrects' },
        { status: 401 }
      );
      setCorsHeaders(response);
      return response;
    }

    const passwordValid = await bcrypt.compare(password, employee.passwordHash);
    if (!passwordValid) {
      const response = NextResponse.json(
        { error: 'Identifiants incorrects' },
        { status: 401 }
      );
      setCorsHeaders(response);
      return response;
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
      token
    };

    const response = NextResponse.json(
      { 
        message: 'Connexion réussie',
        employee: responseData 
      },
      { status: 200 }
    );

    setCorsHeaders(response);
    return response;

  } catch (error) {
    console.error('Erreur de connexion:', error);
    const response = NextResponse.json(
      { error: 'Erreur lors de la connexion' },
      { status: 500 }
    );
    setCorsHeaders(response);
    return response;
  }
}

// Gestion des requêtes OPTIONS (préflight CORS)
export async function OPTIONS() {
  const response = new Response(null, { status: 204 });
  setCorsHeaders(response);
  return response;
}

// Fonction utilitaire pour définir les en-têtes CORS
function setCorsHeaders(response: Response | NextResponse) {
  response.headers.set('Access-Control-Allow-Origin', process.env.NODE_ENV === 'development' 
    ? 'http://localhost:3000' 
    //: 'https://votre-frontend.com');
    :'http://localhost:3000');
  response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.headers.set('Access-Control-Allow-Credentials', 'true');
}