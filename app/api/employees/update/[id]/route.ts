

/**
 * Met à jour les informations d'un employé existant.
 *
 * @param request - La requête HTTP contenant les données de mise à jour de l'employé.
 * @param params - Les paramètres de la requête, incluant l'identifiant de l'employé (`id`).
 * 
 * @returns Une réponse JSON contenant un message de succès et les détails de l'employé mis à jour,
 * ou une erreur avec un code de statut HTTP approprié.
 *
 * @throws {401 Unauthorized} Si le token d'autorisation est manquant ou invalide.
 * @throws {403 Forbidden} Si l'utilisateur n'a pas les permissions nécessaires pour modifier un employé.
 * @throws {404 Not Found} Si l'employé avec l'identifiant spécifié n'existe pas.
 * @throws {400 Bad Request} Si les données fournies sont invalides ou si des règles métier ne sont pas respectées.
 * @throws {409 Conflict} Si l'email fourni est déjà utilisé par un autre employé.
 * @throws {500 Internal Server Error} En cas d'erreur inattendue lors de la mise à jour.
 *
 * ### Schéma de validation des données
 * - `nom`: Chaîne de caractères, minimum 2 caractères, optionnel.
 * - `prenom`: Chaîne de caractères, minimum 2 caractères, optionnel.
 * - `email`: Email valide, optionnel.
 * - `password`: Chaîne de caractères, minimum 8 caractères, optionnel.
 * - `posteId`: UUID valide, optionnel.
 * - `telephone`: Chaîne de caractères, optionnel.
 * - `adresse`: Chaîne de caractères, optionnel.
 * - `role`: Enumération parmi `EMPLOYE_BASE`, `MANAGER`, `ADMIN`, optionnel.
 * - `isActive`: Booléen, optionnel.
 * - `typeContrat`: Enumération parmi `CDI`, `CDD`, `INTERIM`, optionnel.
 * - `dateFinContrat`: Date valide au format ISO 8601, optionnel.
 * - `permissions`: Tableau de chaînes de caractères représentant les permissions, optionnel.
 *
 * ### Règles métier
 * - Si `typeContrat` est `CDD` ou `INTERIM`, `dateFinContrat` est obligatoire et doit être dans le futur.
 * - Si `email` est modifié, il doit être unique.
 * - Les permissions fournies doivent être compatibles avec le rôle spécifié.
 * - Si un nouveau contrat est créé, il remplace le contrat actuel.
 *
 * ### Exemple de réponse en cas de succès
 * ```json
 * {
 *   "message": "Employé mis à jour avec succès",
 *   "employee": { ... },
 *   "permissionsUpdated": true
 * }
 * ```
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { verifyToken } from '@/lib/auth/jwt';
import { EnumPermission, EnumContrat, EnumRole } from '@prisma/client';
import { ROLE_PERMISSIONS } from '@/lib/roles';

const updateEmployeeSchema = z.object({
  nom: z.string().min(2).optional(),
  prenom: z.string().min(2).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  posteId: z.string().uuid().optional(),
  telephone: z.string().optional(),
  adresse: z.string().optional(),
  role: z.enum(['EMPLOYE_BASE', 'MANAGER', 'ADMIN']).optional(),
  isActive: z.boolean().optional(),
  typeContrat: z.enum(['CDI', 'CDD', 'INTERIM']).optional(),
  dateFinContrat: z.string().datetime().optional(),
  permissions: z.array(z.string()).optional()
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = (await params).id;
  try {
    // Vérification du token et des permissions
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const decoded = await verifyToken(token);
    if (!decoded.permissions.includes('EMPLOYEE_EDIT') && !decoded.hasAllAccess) {
      return NextResponse.json({ error: 'Permissions insuffisantes' }, { status: 403 });
    }

    const body = await request.json();
    const validatedData = updateEmployeeSchema.parse(body);

    // Vérification que l'employé existe avec son contrat actuel
    const existingEmployee = await prisma.employee.findUnique({
      where: { id: id },
      include: { 
        permissions: true,
        contrats: {
          orderBy: { dateDebut: 'desc' },
          take: 1
        }
      }
    });

    if (!existingEmployee) {
      return NextResponse.json(
        { error: 'Employé non trouvé' },
        { status: 404 }
      );
    }

    // Vérification du poste si fourni
    if (validatedData.posteId) {
      const posteExists = await prisma.poste.findUnique({
        where: { id: validatedData.posteId }
      });
      
      if (!posteExists) {
        return NextResponse.json(
          { error: 'Le poste spécifié n\'existe pas' },
          { status: 400 }
        );
      }
    }

    // Validation des règles métier pour les contrats
    if (validatedData.typeContrat) {
      // Si le type devient CDD ou INTERIM, une date de fin est obligatoire
      if (
        (validatedData.typeContrat === 'CDD' || validatedData.typeContrat === 'INTERIM') &&
        !validatedData.dateFinContrat
      ) {
        return NextResponse.json(
          { error: 'La date de fin est obligatoire pour les contrats CDD ou INTERIM' },
          { status: 400 }
        );
      }

      // Vérification que la date de fin est dans le futur si fournie
      if (validatedData.dateFinContrat && new Date(validatedData.dateFinContrat) <= new Date()) {
        return NextResponse.json(
          { error: 'La date de fin doit être dans le futur' },
          { status: 400 }
        );
      }
    }

    // Vérification de l'email unique si modification
    if (validatedData.email && validatedData.email !== existingEmployee.email) {
      const emailExists = await prisma.employee.findUnique({
        where: { email: validatedData.email }
      });

      if (emailExists) {
        return NextResponse.json(
          { error: 'Un employé avec cet email existe déjà' },
          { status: 409 }
        );
      }
    }

    // Détermination des permissions finales
    let finalPermissions: string[] | undefined;
    const newRole = validatedData.role ?? existingEmployee.role;

    if (validatedData.permissions !== undefined) {
      // Si permissions sont explicitement fournies, on les filtre selon le rôle
      const rolePermissions = ROLE_PERMISSIONS[newRole];
      finalPermissions = validatedData.permissions.filter(perm => 
        rolePermissions.includes(perm as EnumPermission) || 
        rolePermissions.includes('ALL_ACCESS')
      );
    } else if (validatedData.role) {
      // Si seul le rôle change, on utilise les permissions par défaut du nouveau rôle
      finalPermissions = ROLE_PERMISSIONS[newRole];
    }

    // Hachage du mot de passe si modification
    let hashedPassword = existingEmployee.passwordHash;
    if (validatedData.password) {
      hashedPassword = await bcrypt.hash(validatedData.password, 12);
    }

    // Mise à jour de l'employé avec transaction
    const updatedEmployee = await prisma.$transaction(async (prisma) => {
      // Mise à jour des données de base
      const employee = await prisma.employee.update({
        where: { id: id },
        data: {
          nom: validatedData.nom,
          prenom: validatedData.prenom,
          email: validatedData.email,
          passwordHash: hashedPassword,
          posteId: validatedData.posteId,
          telephone: validatedData.telephone,
          adresse: validatedData.adresse,
          role: validatedData.role,
          isActive: validatedData.isActive
        }
      });

      // Gestion du contrat si modification
      if (validatedData.typeContrat) {
        const currentContract = existingEmployee.contrats[0];
        const now = new Date();

        if (
          !currentContract || 
          currentContract.type !== validatedData.typeContrat || 
          (validatedData.dateFinContrat && currentContract.dateFin !== new Date(validatedData.dateFinContrat))
        ) {
          await prisma.contrat.create({
            data: {
              employeeId: id,
              type: validatedData.typeContrat as EnumContrat,
              dateDebut: now,
              dateFin: validatedData.dateFinContrat ? new Date(validatedData.dateFinContrat) : null
            }
          });
        }
      }

      // Gestion des permissions si nécessaire
      if (finalPermissions !== undefined) {
        await prisma.employeePermission.deleteMany({
          where: { employeeId: id }
        });

        if (finalPermissions.length > 0) {
          await prisma.employeePermission.createMany({
            data: finalPermissions.map(permission => ({
              employeeId: id,
              permission: permission as EnumPermission
            }))
          });
        }
      }

      return employee;
    });

    return NextResponse.json(
      { 
        message: 'Employé mis à jour avec succès',
        employee: updatedEmployee,
        permissionsUpdated: finalPermissions !== undefined
      },
      { status: 200 }
    );

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Données invalides', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Erreur mise à jour employé:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la mise à jour' },
      { status: 500 }
    );
  }
}