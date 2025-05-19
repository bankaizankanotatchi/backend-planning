import { NextResponse } from "next/server";

// Fonction utilitaire pour définir les en-têtes CORS
export function setCorsHeaders(response: Response | NextResponse) {
    response.headers.set('Access-Control-Allow-Origin', process.env.NODE_ENV === 'development' 
      ? 'http://localhost:3000' 
      //: 'https://votre-frontend.com');
      :'http://localhost:3000');
    response.headers.set('Access-Control-Allow-Methods', 'POST, GET, PATCH, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    response.headers.set('Access-Control-Allow-Credentials', 'true');
  }