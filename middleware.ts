// import { NextResponse } from 'next/server';
// import type { NextRequest } from 'next/server';
// import jwt from 'jsonwebtoken';
// import { prisma } from '@/lib/prisma';

// const JWT_SECRET = process.env.JWT_SECRET!;

// // Configuration des routes (identique à votre version)
// const PUBLIC_ROUTES = ['/api/auth/login', '/api/auth/register', '/api/auth/verify-token'];

// export const config = {
//   matcher: ['/api/((?!auth).*)'],
//   runtime: 'nodejs' // Force le runtime Node.js pour utiliser jsonwebtoken
// };

// export async function middleware(request: NextRequest) {
//   const path = request.nextUrl.pathname;

//   // Autoriser les routes publiques
//   if (PUBLIC_ROUTES.some(route => path.startsWith(route))) {
//     return NextResponse.next();
//   }

//   try {
//     // Récupération du token depuis le header Authorization
//     const authHeader = request.headers.get('authorization');
//     if (!authHeader || !authHeader.startsWith('Bearer ')) {
//       throw new Error('Token manquant');
//     }
    
//     const token = authHeader.split(' ')[1];

//     // Vérification synchrone du token (adapté à jsonwebtoken)
//     let decoded;
//     try {
//       decoded = jwt.verify(token, JWT_SECRET) as {
//         employeeId: string;
//         permissions: string[];
//         hasAllAccess: boolean;
//       };
//     } catch (jwtError) {
//       throw new Error('Token invalide');
//     }

//     // Ajout des informations utilisateur aux headers
//     const headers = new Headers(request.headers);
//     headers.set('employee-id', decoded.employeeId);
//     headers.set('permissions', JSON.stringify(decoded.permissions));
//     headers.set('has-all-access', String(decoded.hasAllAccess));

//     return NextResponse.next({ headers });

//   } catch (error) {
//     console.error('Erreur middleware:', error);
    
//     return NextResponse.json(
//       { 
//         error: 'Accès non autorisé',
//         message: error instanceof Error ? error.message : 'Erreur inconnue',
//         code: 'UNAUTHORIZED'
//       },
//       { 
//         status: 401,
//         headers: {
//           'Content-Type': 'application/json',
//           'WWW-Authenticate': 'Bearer error="invalid_token"'
//         }
//       }
//     );
//   }
// }



import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const origin = request.headers.get('origin');

  response.headers.set('Access-Control-Allow-Origin', 
    process.env.NODE_ENV === 'development'
      ? 'http://localhost:3000'
      : origin || 'https://votre-frontend.com'
  );
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  return response;
}

export const config = {
  matcher: '/api/:path*',
};