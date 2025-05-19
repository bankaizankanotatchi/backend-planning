
/**
 * @function GET
 * @async
 * @description
 * Cette fonction génère un rapport Excel contenant plusieurs feuilles de données liées à la gestion des employés, 
 * des plannings, des tâches et des congés. Le fichier Excel est ensuite renvoyé en tant que réponse téléchargeable.
 * 
 * @param {Request} request - L'objet de requête HTTP contenant les en-têtes et les informations nécessaires.
 * 
 * @returns {Promise<NextResponse>} Une réponse HTTP contenant le fichier Excel en tant que pièce jointe ou un message d'erreur.
 * 
 * @throws {Error} Renvoie une erreur si la génération du rapport échoue ou si les permissions sont insuffisantes.
 * 
 * @remarks
 * - La fonction vérifie d'abord la validité du token JWT et les permissions de l'utilisateur.
 * - Elle utilise `ExcelJS` pour créer un fichier Excel avec plusieurs feuilles :
 *   1. **Résumé** : Contient des indicateurs clés comme le nombre total d'employés, de plannings, de tâches, etc.
 *   2. **Plannings** : Liste des plannings avec leurs détails.
 *   3. **Employés** : Liste des employés avec leurs informations et tâches terminées.
 *   4. **Tâches** : Liste des tâches avec leurs détails.
 *   5. **Congés** : Liste des congés avec leurs informations.
 * - Les données sont récupérées depuis une base de données via Prisma.
 * - Les colonnes des feuilles Excel sont automatiquement ajustées pour une meilleure lisibilité.
 * 
 * @example
 * // Exemple d'appel de l'API
 * fetch('/api/reports/export-excel', {
 *   method: 'GET',
 *   headers: {
 *     'Authorization': 'Bearer <votre_token>'
 *   }
 * })
 * .then(response => response.blob())
 * .then(blob => {
 *   const url = window.URL.createObjectURL(blob);
 *   const a = document.createElement('a');
 *   a.href = url;
 *   a.download = 'rapport_employes.xlsx';
 *   a.click();
 * });
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth/jwt';
import ExcelJS from 'exceljs';

export async function GET(request: Request) {
  try {
    // Vérification du token et des permissions
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const decoded = await verifyToken(token);
    if (!decoded.permissions.includes('TEAM_VIEW_STATS') && !decoded.hasAllAccess) {
      return NextResponse.json({ error: 'Permissions insuffisantes' }, { status: 403 });
    }

    // Création du workbook Excel
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Système de gestion des employés';
    workbook.created = new Date();

    // 1. Feuille "Résumé"
    const summarySheet = workbook.addWorksheet('Résumé');
    
    // Récupération des données pour le résumé
    const [totalEmployees, activeEmployees, totalPlannings, totalTasks, totalConges] = await Promise.all([
      prisma.employee.count(),
      prisma.employee.count({ where: { isActive: true } }),
      prisma.planning.count(),
      prisma.tache.count(),
      prisma.conge.count(),
    ]);

    // Style pour les titres avec des types corrects
    const titleStyle: Partial<ExcelJS.Style> = {
      font: { bold: true, size: 14 },
      fill: {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD9E1F2' }
      },
      border: {
        top: { style: 'thin' as ExcelJS.BorderStyle },
        left: { style: 'thin' as ExcelJS.BorderStyle },
        bottom: { style: 'thin' as ExcelJS.BorderStyle },
        right: { style: 'thin' as ExcelJS.BorderStyle }
      }
    };

    // Ajout des données au résumé
    summarySheet.getRow(1).values = ['Rapport Général - ' + new Date().toLocaleDateString()];
    summarySheet.getRow(1).font = { bold: true, size: 16 };
    summarySheet.addRow([]); // Ligne vide

    // Tableau des indicateurs clés
    const headerRow = summarySheet.addRow(['Indicateurs', 'Valeur']);
    headerRow.eachCell((cell) => {
      cell.style = titleStyle;
    });

    summarySheet.addRow(['Nombre total employés', totalEmployees]);
    summarySheet.addRow(['Employés actifs', `${activeEmployees} (${Math.round((activeEmployees / totalEmployees) * 100)}%)`]);
    summarySheet.addRow(['Nombre total plannings', totalPlannings]);
    summarySheet.addRow(['Nombre total tâches', totalTasks]);
    summarySheet.addRow(['Nombre total congés', totalConges]);

    // [Reste du code inchangé...]
    // 2. Feuille "Plannings"
    const planningSheet = workbook.addWorksheet('Plannings');
    planningSheet.addRow(['Plannings']).font = { bold: true, size: 14 };
    planningSheet.addRow(['ID', 'Nom', 'Date création', 'Période début', 'Période fin', 'Statut', 'Nombre créneaux']);

    const plannings = await prisma.planning.findMany({
      include: {
        periode: true,
        _count: {
          select: { creneaux: true }
        }
      },
      orderBy: { dateCreation: 'desc' }
    });

    plannings.forEach(planning => {
      planningSheet.addRow([
        planning.id,
        planning.nom,
        planning.dateCreation.toLocaleDateString(),
        planning.periode.debut.toLocaleDateString(),
        planning.periode.fin.toLocaleDateString(),
        planning.statut,
        planning._count.creneaux
      ]);
    });

    // 3. Feuille "Employés"
    const employeeSheet = workbook.addWorksheet('Employés');
    employeeSheet.addRow(['Employés']).font = { bold: true, size: 14 };
    employeeSheet.addRow(['ID', 'Nom', 'Prénom', 'Email', 'Poste', 'Statut', 'Date embauche', 'Tâches terminées']);

    const employees = await prisma.employee.findMany({
      include: {
        poste: true,
        _count: {
          select: {
            taches: {
              where: { statut: 'TERMINEE' }
            }
          }
        }
      }
    });

    employees.forEach(employee => {
      employeeSheet.addRow([
        employee.id,
        employee.nom,
        employee.prenom,
        employee.email,
        employee.poste?.nom || 'N/A',
        employee.isActive ? 'Actif' : 'Inactif',
        employee.dateEmbauche.toLocaleDateString(),
        employee._count.taches
      ]);
    });

    // 4. Feuille "Tâches"
    const taskSheet = workbook.addWorksheet('Tâches');
    taskSheet.addRow(['Tâches']).font = { bold: true, size: 14 };
    taskSheet.addRow(['ID', 'Libellé', 'Statut', 'Date limite', 'Employé', 'Date création']);

    const tasks = await prisma.tache.findMany({
      include: {
        employee: true
      },
      orderBy: { createdAt: 'desc' }
    });

    tasks.forEach(task => {
      taskSheet.addRow([
        task.id,
        task.label,
        task.statut,
        task.dateLimite.toLocaleDateString(),
        `${task.employee.nom} ${task.employee.prenom}`,
        task.createdAt.toLocaleDateString()
      ]);
    });

    // 5. Feuille "Congés"
    const leaveSheet = workbook.addWorksheet('Congés');
    leaveSheet.addRow(['Congés']).font = { bold: true, size: 14 };
    leaveSheet.addRow(['ID', 'Type', 'Statut', 'Employé', 'Début', 'Fin', 'Durée (jours)']);

    const leaves = await prisma.conge.findMany({
      include: {
        employee: true
      }
    });

    leaves.forEach(leave => {
      const duration = Math.ceil((new Date(leave.dateFin).getTime() - new Date(leave.dateDebut).getTime()) / (1000 * 60 * 60 * 24));
      leaveSheet.addRow([
        leave.id,
        leave.type,
        leave.statut,
        `${leave.employee.nom} ${leave.employee.prenom}`,
        leave.dateDebut.toLocaleDateString(),
        leave.dateFin.toLocaleDateString(),
        duration
      ]);
    });

    // Formatage des colonnes
    [summarySheet, planningSheet, employeeSheet, taskSheet, leaveSheet].forEach(sheet => {
      sheet.columns.forEach(column => {
        const header = column.header as string | string[] | undefined;
        const headerLength = Array.isArray(header) 
          ? header.join('').length 
          : typeof header === 'string' 
            ? header.length 
            : 20;
        column.width = headerLength < 20 ? 20 : headerLength + 5;
      });
    });

    // Génération du fichier Excel en mémoire
    const buffer = await workbook.xlsx.writeBuffer();

    // Création de la réponse
    const response = new NextResponse(buffer, {
      status: 200,
      headers: new Headers({
        'content-disposition': 'attachment; filename=rapport_employes.xlsx',
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    });

    return response;

  } catch (error) {
    console.error('Erreur lors de la génération du rapport Excel:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la génération du rapport' },
      { status: 500 }
    );
  }
}