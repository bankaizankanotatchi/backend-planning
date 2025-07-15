-- CreateEnum
CREATE TYPE "EnumJour" AS ENUM ('LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI', 'DIMANCHE');

-- CreateEnum
CREATE TYPE "EnumContrat" AS ENUM ('CDI', 'CDD', 'INTERIM');

-- CreateEnum
CREATE TYPE "EnumRole" AS ENUM ('EMPLOYE_BASE', 'MANAGER', 'ADMIN');

-- CreateEnum
CREATE TYPE "EnumStatutTache" AS ENUM ('A_FAIRE', 'EN_COURS', 'TERMINEE', 'VALIDEE', 'ANNULEE');

-- CreateEnum
CREATE TYPE "StatutNotification" AS ENUM ('ENVOYEE', 'LUE', 'ARCHIVEE');

-- CreateEnum
CREATE TYPE "StatutValidation" AS ENUM ('BROUILLON', 'VALIDE', 'REJETE', 'ANNULE');

-- CreateEnum
CREATE TYPE "StatutDemande" AS ENUM ('EN_ATTENTE', 'VALIDE', 'REJETEE', 'ANNULEE');

-- CreateEnum
CREATE TYPE "TypeConge" AS ENUM ('ANNUEL', 'MALADIE', 'PARENTAL', 'SANS_SOLDE');

-- CreateEnum
CREATE TYPE "TypeCreneau" AS ENUM ('TRAVAIL', 'FORMATION', 'REUNION');

-- CreateEnum
CREATE TYPE "EnumPermission" AS ENUM ('PLANNING_READ', 'PLANNING_CREATE', 'PLANNING_UPDATE', 'PLANNING_DELETE', 'PLANNING_PUBLISH', 'PLANNING_OVERRIDE', 'LEAVE_REQUEST', 'LEAVE_APPROVE', 'LEAVE_MANAGE_TYPES', 'LEAVE_VIEW_TEAM', 'EMPLOYEE_READ', 'EMPLOYEE_EDIT', 'EMPLOYEE_MANAGE_CONTRACTS', 'EMPLOYEE_MANAGE_SKILLS', 'TEAM_ASSIGN', 'TEAM_MANAGE', 'TEAM_VIEW_STATS', 'CONFIG_UPDATE', 'ROLE_MANAGE', 'PERMISSION_MANAGE', 'SYSTEM_BACKUP', 'ALL_ACCESS');

-- CreateTable
CREATE TABLE "Poste" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "Poste_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLogin" TIMESTAMP(3),
    "lastLogout" TIMESTAMP(3),
    "posteId" TEXT,
    "telephone" TEXT,
    "adresse" TEXT,
    "role" "EnumRole" NOT NULL,
    "dateEmbauche" TIMESTAMP(3) NOT NULL,
    "dateFin" TIMESTAMP(3),

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeePermission" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT,
    "permission" "EnumPermission" NOT NULL,

    CONSTRAINT "EmployeePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyntheseHeures" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "periodeFrom" TIMESTAMP(3) NOT NULL,
    "periodeTo" TIMESTAMP(3) NOT NULL,
    "heuresNormales" INTEGER NOT NULL,
    "heuresSupplementaires" INTEGER NOT NULL,
    "statut" "StatutValidation" NOT NULL DEFAULT 'BROUILLON',
    "planningId" TEXT NOT NULL,

    CONSTRAINT "SyntheseHeures_pkey" PRIMARY KEY ("planningId","employeeId")
);

-- CreateTable
CREATE TABLE "Planning" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "createurId" TEXT NOT NULL,
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateRangeId" TEXT NOT NULL,
    "statut" "StatutValidation" NOT NULL DEFAULT 'BROUILLON',

    CONSTRAINT "Planning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Creneau" (
    "id" TEXT NOT NULL,
    "dateDebut" TIMESTAMP(3) NOT NULL,
    "dateFin" TIMESTAMP(3) NOT NULL,
    "type" "TypeCreneau" NOT NULL,
    "employeeId" TEXT NOT NULL,
    "valide" BOOLEAN NOT NULL DEFAULT false,
    "statutTache" "EnumStatutTache" NOT NULL DEFAULT 'A_FAIRE',
    "duree" INTEGER NOT NULL,
    "commentaire" TEXT,
    "tacheId" TEXT NOT NULL,
    "planningId" TEXT NOT NULL,

    CONSTRAINT "Creneau_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tache" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "dateLimite" TIMESTAMP(3) NOT NULL,
    "statut" "EnumStatutTache" NOT NULL DEFAULT 'A_FAIRE',
    "dateCompletion" TIMESTAMP(3),
    "employeeId" TEXT NOT NULL,

    CONSTRAINT "Tache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DateRange" (
    "id" TEXT NOT NULL,
    "debut" TIMESTAMP(3) NOT NULL,
    "fin" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DateRange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "destinataireId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "statut" "StatutNotification" NOT NULL DEFAULT 'ENVOYEE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rapport" (
    "id" TEXT NOT NULL,
    "employeId" TEXT NOT NULL,
    "createurId" TEXT NOT NULL,
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "statut" "StatutValidation" NOT NULL DEFAULT 'BROUILLON',

    CONSTRAINT "Rapport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conge" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "TypeConge" NOT NULL,
    "dateDebut" TIMESTAMP(3) NOT NULL,
    "dateFin" TIMESTAMP(3) NOT NULL,
    "commentaire" TEXT,
    "statut" "StatutDemande" NOT NULL DEFAULT 'EN_ATTENTE',
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "cancelledComment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "updatedBy" TEXT,
    "approveAt" TIMESTAMP(3),
    "approveBy" TEXT,
    "approvalComment" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectedBy" TEXT,
    "rejectedComment" TEXT,

    CONSTRAINT "Conge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Disponibilite" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "jour" "EnumJour" NOT NULL,
    "heureDebut" TIMESTAMP(3) NOT NULL,
    "heureFin" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Disponibilite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contrat" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "type" "EnumContrat" NOT NULL,
    "dateDebut" TIMESTAMP(3) NOT NULL,
    "dateFin" TIMESTAMP(3),

    CONSTRAINT "Contrat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevokedToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevokedToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Poste_nom_key" ON "Poste"("nom");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_email_key" ON "Employee"("email");

-- CreateIndex
CREATE INDEX "EmployeePermission_employeeId_idx" ON "EmployeePermission"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeePermission_employeeId_permission_key" ON "EmployeePermission"("employeeId", "permission");

-- CreateIndex
CREATE INDEX "Rapport_employeId_idx" ON "Rapport"("employeId");

-- CreateIndex
CREATE INDEX "Rapport_createurId_idx" ON "Rapport"("createurId");

-- CreateIndex
CREATE UNIQUE INDEX "RevokedToken_token_key" ON "RevokedToken"("token");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_posteId_fkey" FOREIGN KEY ("posteId") REFERENCES "Poste"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeePermission" ADD CONSTRAINT "EmployeePermission_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyntheseHeures" ADD CONSTRAINT "SyntheseHeures_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyntheseHeures" ADD CONSTRAINT "SyntheseHeures_planningId_fkey" FOREIGN KEY ("planningId") REFERENCES "Planning"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Planning" ADD CONSTRAINT "Planning_createurId_fkey" FOREIGN KEY ("createurId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Planning" ADD CONSTRAINT "Planning_dateRangeId_fkey" FOREIGN KEY ("dateRangeId") REFERENCES "DateRange"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Creneau" ADD CONSTRAINT "Creneau_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Creneau" ADD CONSTRAINT "Creneau_tacheId_fkey" FOREIGN KEY ("tacheId") REFERENCES "Tache"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Creneau" ADD CONSTRAINT "Creneau_planningId_fkey" FOREIGN KEY ("planningId") REFERENCES "Planning"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tache" ADD CONSTRAINT "Tache_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_destinataireId_fkey" FOREIGN KEY ("destinataireId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rapport" ADD CONSTRAINT "Rapport_employeId_fkey" FOREIGN KEY ("employeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rapport" ADD CONSTRAINT "Rapport_createurId_fkey" FOREIGN KEY ("createurId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conge" ADD CONSTRAINT "Conge_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Disponibilite" ADD CONSTRAINT "Disponibilite_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contrat" ADD CONSTRAINT "Contrat_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevokedToken" ADD CONSTRAINT "RevokedToken_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
