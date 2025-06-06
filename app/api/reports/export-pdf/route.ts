
/**
 * @function GET
 * @description Génère un rapport PDF contenant des statistiques sur les employés, les tâches, les plannings et les congés.
 * Cette API vérifie les permissions de l'utilisateur avant de générer le rapport.
 * 
 * @param {Request} request - La requête HTTP entrante.
 * 
 * @returns {Promise<NextResponse>} Une réponse contenant le fichier PDF généré ou un message d'erreur en cas de problème.
 * 
 * @throws {NextResponse} - Retourne une réponse avec un statut HTTP 401 si l'utilisateur n'est pas authentifié,
 * ou 403 si les permissions sont insuffisantes. En cas d'erreur interne, retourne une réponse avec un statut 500.
 * 
 * @details
 * - **Vérification des permissions** : L'utilisateur doit posséder la permission `TEAM_VIEW_STATS` ou avoir un accès complet.
 * - **Contenu du rapport** :
 *   1. Résumé général : Nombre total d'employés, employés actifs, plannings, tâches et congés.
 *   2. Statistiques des tâches : Répartition des tâches par statut.
 *   3. Top employés : Les 3 employés ayant terminé le plus de tâches.
 *   4. Statistiques des congés : Répartition des congés par statut.
 *   5. Derniers plannings : Liste des 5 derniers plannings créés avec le nombre de créneaux associés.
 * - **Format PDF** : Le rapport est généré au format A4 avec des styles personnalisés (titres, sous-titres, texte).
 * 
 * @example
 * // Exemple d'appel à l'API
 * fetch('/api/reports/export-pdf', {
 *   method: 'GET',
 *   headers: {
 *     'Authorization': 'Bearer <token>',
 *   },
 * })
 * .then(response => {
 *   if (response.ok) {
 *     return response.blob();
 *   } else {
 *     throw new Error('Erreur lors de la génération du rapport');
 *   }
 * })
 * .then(blob => {
 *   const url = window.URL.createObjectURL(blob);
 *   const a = document.createElement('a');
 *   a.href = url;
 *   a.download = 'rapport_employes.pdf';
 *   a.click();
 * });
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth/jwt';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

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

    // Création du document PDF
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]); // Format A4

    // Chargement des polices
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Styles
    const titleSize = 18;
    const subtitleSize = 14;
    const textSize = 12;
    const smallTextSize = 10;
    const margin = 50;
    const colorPrimary = rgb(0.1, 0.3, 0.6);
    const colorSecondary = rgb(0.3, 0.3, 0.3);

    // Fonction pour ajouter du texte avec gestion de la position Y
    let currentY = page.getHeight() - margin;

    const addText = (text: string, x: number, size: number, isBold = false, color = colorSecondary) => {
      page.drawText(text, {
        x,
        y: currentY,
        size,
        font: isBold ? fontBold : font,
        color,
      });
      currentY -= size + 5;
    };

    // Titre principal
    addText(`Rapport des employés - ${new Date().toLocaleDateString()}`, margin, titleSize, true, colorPrimary);
    currentY -= 20; // Espacement supplémentaire

    // 1. Section Résumé
    addText('Résumé Général', margin, subtitleSize, true, colorPrimary);

    const [totalEmployees, activeEmployees, totalPlannings, totalTasks, totalConges] = await Promise.all([
      prisma.employee.count(),
      prisma.employee.count({ where: { isActive: true } }),
      prisma.planning.count(),
      prisma.tache.count(),
      prisma.conge.count(),
    ]);

    addText(`Nombre total d'employés: ${totalEmployees}`, margin, textSize);
    addText(`Employés actifs: ${activeEmployees} (${Math.round((activeEmployees / totalEmployees) * 100)}%)`, margin, textSize);
    addText(`Nombre total de plannings: ${totalPlannings}`, margin, textSize);
    addText(`Nombre total de tâches: ${totalTasks}`, margin, textSize);
    addText(`Nombre total de congés: ${totalConges}`, margin, textSize);

    // 2. Section Statistiques des tâches
    currentY -= 20; // Espacement
    addText('Statistiques des Tâches', margin, subtitleSize, true, colorPrimary);

    const tasksByStatus = await prisma.tache.groupBy({
      by: ['statut'],
      _count: {
        statut: true,
      },
    });

    tasksByStatus.forEach(task => {
      addText(`${task.statut}: ${task._count.statut} (${Math.round((task._count.statut / totalTasks) * 100)}%)`, margin + 20, textSize);
    });

    // 3. Section Top employés
    currentY -= 20;
    addText('Top Employés', margin, subtitleSize, true, colorPrimary);

    const topEmployees = await prisma.employee.findMany({
      include: {
        _count: {
          select: {
            taches: {
              where: { statut: 'TERMINEE' }
            }
          }
        }
      },
      orderBy: {
        taches: {
          _count: 'desc'
        }
      },
      take: 3
    });

    topEmployees.forEach((employee, index) => {
      addText(`${index + 1}. ${employee.prenom} ${employee.nom}: ${employee._count.taches} tâches terminées`, margin + 20, textSize);
    });

    // 4. Section Congés
    currentY -= 20;
    addText('Statistiques des Congés', margin, subtitleSize, true, colorPrimary);

    const leavesByStatus = await prisma.conge.groupBy({
      by: ['statut'],
      _count: {
        statut: true,
      },
    });

    leavesByStatus.forEach(leave => {
      addText(`${leave.statut}: ${leave._count.statut} (${Math.round((leave._count.statut / totalConges) * 100)}%)`, margin + 20, textSize);
    });

    // Vérification de l'espace restant et ajout d'une nouvelle page si nécessaire
    if (currentY < margin) {
      pdfDoc.addPage([595, 842]);
      currentY = page.getHeight() - margin;
    }

    // 5. Section Derniers plannings
    addText('Derniers Plannings', margin, subtitleSize, true, colorPrimary);

    const recentPlannings = await prisma.planning.findMany({
      include: {
        _count: {
          select: { creneaux: true }
        }
      },
      orderBy: { dateCreation: 'desc' },
      take: 5
    });

    recentPlannings.forEach(planning => {
      addText(`- ${planning.nom} (${planning._count.creneaux} créneaux)`, margin + 20, textSize);
      currentY -= 2; // Espacement réduit
    });

    // Génération du PDF final
    const pdfBytes = await pdfDoc.save();

    // Création de la réponse
    const response = new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: new Headers({
        'content-disposition': 'attachment; filename=rapport_employes.pdf',
        'content-type': 'application/pdf',
      }),
    });

    return response;

  } catch (error) {
    console.error('Erreur lors de la génération du rapport PDF:', error);
    return NextResponse.json(
      { error: 'Erreur lors de la génération du rapport' },
      { status: 500 }
    );
  }
}