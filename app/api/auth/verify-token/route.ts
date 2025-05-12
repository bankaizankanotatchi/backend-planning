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