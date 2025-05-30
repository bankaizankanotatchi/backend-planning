/**
 * Gère l'inscription d'un nouvel employé.
 *
 * @function
 * @async
 * @param {Request} request - La requête HTTP contenant les données d'inscription au format JSON.
 * @returns {Promise<NextResponse>} Une réponse HTTP contenant les informations de l'employé créé
 * ou un message d'erreur en cas d'échec.
 *
 * @description
 * Cette fonction permet de créer un nouvel employé dans la base de données. Elle effectue les étapes suivantes :
 * 1. Valide les données d'entrée à l'aide de Zod.
 * 2. Vérifie si un employé avec le même email existe déjà.
 * 3. Gère les dates d'embauche et de contrat.
 * 4. Hache le mot de passe de l'employé.
 * 5. Crée un nouvel employé avec des permissions et un contrat par défaut.
 * 6. Génère un token JWT pour l'employé et le stocke dans un cookie sécurisé.
 *
 * @throws {z.ZodError} Si les données d'entrée ne respectent pas le schéma de validation.
 * @throws {Error} Si une erreur inattendue survient lors de l'exécution.
 *
 * @example
 * // Exemple de requête JSON pour l'inscription :
 * const requestBody = {
 *   nom: "Dupont",
 *   prenom: "Jean",
 *   email: "jean.dupont@example.com",
 *   password: "Password123!",
 *   posteId: "123e4567-e89b-12d3-a456-426614174000",
 *   telephone: "0123456789",
 *   adresse: "123 Rue Exemple, Paris",
 *   dateEmbauche: "2023-01-01T00:00:00.000Z",
 *   typeContrat: "CDD",
 *   dateDebutContrat: "2023-01-01T00:00:00.000Z",
 *   dateFinContrat: "2023-12-31T00:00:00.000Z"
 * };
 *
 * @response
 * - En cas de succès (201) : Retourne les informations de l'employé créé (sans données sensibles).
 * - En cas de conflit (409) : Retourne une erreur si un employé avec le même email existe déjà.
 * - En cas de validation échouée (400) : Retourne les détails des erreurs de validation.
 * - En cas d'erreur serveur (500) : Retourne un message d'erreur générique.
 */
// app/api/auth/register/route.ts

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { signToken } from '@/lib/auth/jwt';
import prisma from '@/lib/prisma';

// Schéma de validation avec Zod
const registerSchema = z.object({
  nom: z.string().min(2, 'Le nom doit contenir au moins 2 caractères'),
  prenom: z.string().min(2, 'Le prénom doit contenir au moins 2 caractères'),
  email: z.string().email('Email invalide'),
  password: z.string()
    .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
    .regex(/[A-Z]/, 'Le mot de passe doit contenir au moins une majuscule')
    .regex(/[0-9]/, 'Le mot de passe doit contenir au moins un chiffre')
    .regex(/[^A-Za-z0-9]/, 'Le mot de passe doit contenir au moins un caractère spécial'),
  posteId: z.string().uuid('ID de poste invalide'),
  telephone: z.string().min(9, 'Numéro de téléphone invalide'),
  adresse: z.string().min(5, 'Adresse trop courte'),
  dateEmbauche: z.string().datetime('Date d\'embauche invalide').optional(),
  typeContrat: z.enum(['CDI', 'CDD', 'INTERIM']),
  dateDebutContrat: z.string().datetime('Date de début de contrat invalide'),
  dateFinContrat: z.string().datetime('Date de fin de contrat invalide').optional()
}).superRefine((data, ctx) => {
  // Validation personnalisée pour les dates de contrat
  if (['CDD', 'INTERIM'].includes(data.typeContrat)) {
    if (!data.dateFinContrat) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'La date de fin est obligatoire pour les CDD et INTERIM',
        path: ['dateFinContrat']
      });
    } else if (new Date(data.dateFinContrat) <= new Date(data.dateDebutContrat)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'La date de fin doit être après la date de début',
        path: ['dateFinContrat']
      });
    }
  }
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validatedData = registerSchema.parse(body);

    // Vérifier si l'email existe déjà
    const existingEmployee = await prisma.employee.findUnique({
      where: { email: validatedData.email }
    });

    if (existingEmployee) {
      return NextResponse.json(
        { error: 'Un employé avec cet email existe déjà' },
        { status: 409 }
      );
    }

    // Fonction utilitaire pour créer des heures valides
      const createTime = (hours: number, minutes = 0) => {
        const date = new Date()
        date.setHours(hours, minutes, 0, 0)
        return date
      }

    // Gestion des dates
    const dateEmbauche = validatedData.dateEmbauche 
      ? new Date(validatedData.dateEmbauche)
      : new Date(); // Date courante par défaut

    const dateDebutContrat = validatedData.dateDebutContrat
      ? new Date(validatedData.dateDebutContrat)
      : dateEmbauche; // Même date que l'embauche par défaut

      const dateFinContrat = validatedData.typeContrat === 'CDI' 
      ? null 
      : new Date(validatedData.dateFinContrat!);

    // Vérifier que la date de contrat n'est pas après la date d'embauche
    if (dateDebutContrat > dateEmbauche) {
      return NextResponse.json(
        { error: 'La date de début de contrat ne peut pas être postérieure à la date d\'embauche' },
        { status: 400 }
      );
    }

    // Hacher le mot de passe
    const hashedPassword = await bcrypt.hash(validatedData.password, 12);

    // Créer l'employé avec les permissions par défaut
    const newEmployee = await prisma.employee.create({
      data: {
        nom: validatedData.nom,
        prenom: validatedData.prenom,
        email: validatedData.email,
        passwordHash: hashedPassword,
        posteId: validatedData.posteId,
        telephone: validatedData.telephone,
        adresse: validatedData.adresse,
        role: 'EMPLOYE_BASE', // Rôle par défaut
        dateEmbauche: dateEmbauche,
        isActive: true,
        disponibilites: {
          create: [
            { jour: 'LUNDI', 
              heureDebut: createTime(8, 0),
              heureFin: createTime(17, 0) 
            },
            { jour: 'MARDI', 
              heureDebut: createTime(8, 0),
              heureFin: createTime(17, 0)
            },
            { jour: 'MERCREDI', 
              heureDebut: createTime(8, 0),
              heureFin: createTime(17, 0)
            },
            { jour: 'JEUDI', 
              heureDebut: createTime(8, 0),
              heureFin: createTime(17, 0)
            },
            { jour: 'VENDREDI', 
              heureDebut: createTime(8, 0),
              heureFin: createTime(17, 0)
            }
          ]
        },
        permissions: {
          create: [
            { permission: 'PLANNING_READ' }, // Permission de base
            { permission: 'LEAVE_REQUEST' }  // Permission de demander des congés
          ]
        },
        contrats: {
          create: {
            type: validatedData.typeContrat,
            dateDebut: dateDebutContrat,
            dateFin: dateFinContrat
          }
        }
      },
      include: {
        poste: true,
        permissions: true,
        contrats: true
      }
    });

    // Préparer les données pour le token
    const permissions = newEmployee.permissions.map(p => p.permission);
    const token = signToken(newEmployee.id, permissions);

    // Réponse sans informations sensibles
    const responseData = {
      id: newEmployee.id,
      nom: newEmployee.nom,
      prenom: newEmployee.prenom,
      email: newEmployee.email,
      role: newEmployee.role,
      telephone: newEmployee.telephone,
      adresse: newEmployee.adresse,
      poste: newEmployee.poste?.nom,
      dateEmbauche: newEmployee.dateEmbauche,
      contrat: {
        type: newEmployee.contrats[0].type,
        dateDebut: newEmployee.contrats[0].dateDebut,
        dateFin: newEmployee.contrats[0].dateFin
      },
      permissions
    };

    const response = NextResponse.json(responseData, { status: 201 });

    // Définir le cookie HTTP Only sécurisé
    response.cookies.set('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 8, // 8 heures
      sameSite: 'strict',
      path: '/',
    });

    return response;

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          error: 'Validation failed',
          details: error.errors.map(e => ({
            path: e.path.join('.'),
            message: e.message
          }))
        },
        { status: 400 }
      );
    }

    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Une erreur est survenue lors de l\'inscription' },
      { status: 500 }
    );
  }
}