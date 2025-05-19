

/**
 * Gestionnaire de route pour vérifier la validité d'un jeton d'authentification.
 *
 * @function GET
 * @async
 * @param {Request} request - L'objet de requête HTTP contenant les en-têtes et les informations nécessaires.
 * @returns {Promise<Response>} Une réponse JSON indiquant si le jeton est valide ou non.
 *
 * @description
 * Cette fonction vérifie la validité d'un jeton d'authentification transmis via l'en-tête `Authorization`.
 * Si le jeton est manquant ou invalide, une réponse avec un statut HTTP 401 est renvoyée.
 * Si le jeton est valide, les informations décodées du jeton, telles que l'identifiant de l'employé,
 * les permissions et l'accès global, sont renvoyées dans la réponse.
 *
 * @throws {Error} Si une erreur se produit lors de la vérification du jeton.
 *
 * @example
 * // Exemple d'en-tête Authorization :
 * // Authorization: Bearer <votre-jeton>
 *
 * // Réponse en cas de succès :
 * {
 *   "valid": true,
 *   "employeeId": "12345",
 *   "permissions": ["read", "write"],
 *   "hasAllAccess": false
 * }
 *
 * // Réponse en cas d'erreur (jeton manquant ou invalide) :
 * {
 *   "valid": false,
 *   "error": "Token manquant" // ou "Token invalide"
 * }
 */
import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth/jwt';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.split(' ')[1];

  if (!token) {
    return NextResponse.json(
      { valid: false, error: 'Token manquant' },
      { status: 401 }
    );
  }

  try {
    const decoded = await verifyToken(token);
    return NextResponse.json({
      valid: true,
      employeeId: decoded.employeeId,
      permissions: decoded.permissions,
      hasAllAccess: decoded.hasAllAccess
    });
  } catch (error) {
    return NextResponse.json(
      { valid: false, error: 'Token invalide' },
      { status: 401 }
    );
  }
}