import jwt from 'jsonwebtoken';
import prisma from '../prisma';

const JWT_SECRET = process.env.JWT_SECRET!;
const TOKEN_EXPIRY = '8h'; // 8 heures d'expiration

interface TokenPayload {
  employeeId: string;
  permissions: string[];
  hasAllAccess: boolean;
}

export const signToken = (employeeId: string, permissions: string[]): string => {
  return jwt.sign(
    {
      employeeId,
      permissions,
      hasAllAccess: permissions.includes('ALL_ACCESS')
    },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
};

export const verifyToken = async (token: string): Promise<TokenPayload> => {
  try {
    // Vérification basique du token
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;

    // Vérifier si le token est révoqué
    const isRevoked = await prisma.revokedToken.findUnique({
      where: { token }
    });

    if (isRevoked) {
      throw new Error('Token révoqué');
    }

    // Vérifier que l'employé existe toujours
    const employeeExists = await prisma.employee.findUnique({
      where: { id: decoded.employeeId },
      select: { id: true }
    });

    if (!employeeExists) {
      throw new Error('Employé non trouvé');
    }

    return decoded;
  } catch (error) {
    console.error('Erreur de vérification du token:', error);
    throw new Error('Token invalide');
  }
};