// prisma/seed.ts
import { EnumPermission, EnumRole, PrismaClient } from '@prisma/client'
import { fakerFR as faker } from '@faker-js/faker'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

// Fonction utilitaire pour créer des heures valides
const createTime = (hours: number, minutes = 0) => {
    const date = new Date()
    date.setHours(hours, minutes, 0, 0)
    return date
  }

async function main() {
  // 1. Nettoyage complet de la base (dans le bon ordre pour les relations)
  await prisma.revokedToken.deleteMany()
  await prisma.syntheseHeures.deleteMany()
  await prisma.creneau.deleteMany()
  await prisma.tache.deleteMany()
  await prisma.planning.deleteMany()
  await prisma.dateRange.deleteMany()
  await prisma.notification.deleteMany()
  await prisma.rapport.deleteMany()
  await prisma.conge.deleteMany()
  await prisma.disponibilite.deleteMany()
  await prisma.contrat.deleteMany()
  await prisma.employeePermission.deleteMany()
  await prisma.employee.deleteMany()
  await prisma.poste.deleteMany()

  // 2. Création des postes
  const postesData = [
    { nom: "Développeur Frontend", description: "UI/UX et développement web" },
    { nom: "Développeur Backend", description: "API et logique métier" },
    { nom: "Chef de Projet", description: "Gestion de projets IT" },
    { nom: "Responsable RH", description: "Gestion des ressources humaines" },
    { nom: "Commercial", description: "Vente et relation client" },
  ]
  
  const postes = await Promise.all(
    postesData.map(d => prisma.poste.create({ data: d }))
  )

  // 3. Création des employés avec données complètes
  const employeesData = [
    {
      nom: "Martin",
      prenom: "Sophie",
      email: "sophie.martin@entreprise.com",
      role: EnumRole.MANAGER,
      dateEmbauche: new Date('2020-05-15'),
      posteId: postes.find(p => p.nom === "Chef de Projet")!.id,
      passwordHash: await bcrypt.hash('Sophie123!', 10),
      permissions: ["PLANNING_READ", "PLANNING_CREATE", "LEAVE_APPROVE"]
    },
    {
      nom: "Dubois",
      prenom: "Jean",
      email: "jean.dubois@entreprise.com",
      role: EnumRole.EMPLOYE_BASE,
      dateEmbauche: new Date('2021-02-10'),
      posteId: postes.find(p => p.nom === "Développeur Frontend")!.id,
      passwordHash: await bcrypt.hash('Jean123!', 10),
      permissions: ["PLANNING_READ"]
    },
    {
      nom: "Bernard",
      prenom: "Marie",
      email: "marie.bernard@entreprise.com",
      role: EnumRole.ADMIN,
      dateEmbauche: new Date('2019-11-03'),
      posteId: postes.find(p => p.nom === "Responsable RH")!.id,
      passwordHash: await bcrypt.hash('Marie123!', 10),
      permissions: ["ALL_ACCESS"]
    },
    {
      nom: "Petit",
      prenom: "Thomas",
      email: "thomas.petit@entreprise.com",
      role: EnumRole.EMPLOYE_BASE,
      dateEmbauche: new Date('2022-07-22'),
      posteId: postes.find(p => p.nom === "Développeur Backend")!.id,
      passwordHash: await bcrypt.hash('Thomas123!', 10),
      permissions: ["PLANNING_READ", "EMPLOYEE_READ"]
    },
    {
      nom: "Durand",
      prenom: "Laura",
      email: "laura.durand@entreprise.com",
      role: EnumRole.EMPLOYE_BASE,
      dateEmbauche: new Date('2023-01-05'),
      posteId: postes.find(p => p.nom === "Commercial")!.id,
      passwordHash: await bcrypt.hash('Laura123!', 10),
      permissions: ["PLANNING_READ", "LEAVE_REQUEST"]
    },
  ].map(emp => ({
    ...emp,
    telephone: faker.phone.number(),
    adresse: faker.location.streetAddress(),
    isActive: true
  }))

  // 4. Insertion des employés avec toutes leurs relations
  const createdEmployees = await prisma.$transaction(
    employeesData.map(emp => {
      const { permissions, ...employeeData } = emp
      return prisma.employee.create({
        data: {
          ...employeeData,
          permissions: {
            create: permissions.map(p => ({ permission: p as EnumPermission }))
          },
          contrats: {
            create: {
              type: "CDI",
              dateDebut: employeeData.dateEmbauche,
              dateFin: null
            }
          },
          disponibilites: {
            create: [
                {
                    jour: "LUNDI",
                    heureDebut: createTime(8, 30),
                    heureFin: createTime(12, 0)
                  },
                  {
                    jour: "MARDI",
                    heureDebut: createTime(9, 0),
                    heureFin: createTime(17, 0)
                  },
                  {
                    jour: "JEUDI",
                    heureDebut: createTime(8, 0),
                    heureFin: createTime(16, 30)
                  }
            ]
          }
        },
        include: {
          poste: true,
          permissions: true,
          contrats: true,
          disponibilites: true
        }
      })
    })
  )

  // 5. Création des plannings et créneaux
  const dateRanges = await Promise.all(
    Array.from({ length: 2 }).map((_, i) => {
      const startDate = new Date()
      startDate.setDate(startDate.getDate() + i * 7)
      const endDate = new Date(startDate)
      endDate.setDate(startDate.getDate() + 5)
      
      return prisma.dateRange.create({
        data: {
          debut: startDate,
          fin: endDate
        }
      })
    })
  )

  const plannings = await Promise.all(
    dateRanges.map((range, i) => 
      prisma.planning.create({
        data: {
          nom: `Planning Semaine ${i + 1}`,
          createurId: createdEmployees.find(e => e.role === "MANAGER")!.id,
          dateRangeId: range.id,
          statut: i === 0 ? "VALIDE" : "BROUILLON"
        }
      })
    )
  )

  // 6. Création des tâches et créneaux
  const taches = await Promise.all(
    createdEmployees.map(employee => 
      prisma.tache.create({
        data: {
          label: `Tâche ${faker.lorem.words(2)}`,
          description: faker.lorem.sentence(),
          dateLimite: faker.date.future(),
          employeeId: employee.id,
          statut: faker.helpers.arrayElement(["A_FAIRE", "EN_COURS", "TERMINEE"])
        }
      })
    )
  )

  // 7. Création des créneaux
  await Promise.all(
    plannings.flatMap(planning => 
      createdEmployees.map(employee => 
        prisma.creneau.create({
          data: {
            dateDebut: new Date(new Date().setHours(9, 0, 0, 0)),
            dateFin: new Date(new Date().setHours(12, 0, 0, 0)),
            type: faker.helpers.arrayElement(["TRAVAIL", "FORMATION", "REUNION"]),
            employeeId: employee.id,
            tacheId: faker.helpers.arrayElement(taches).id,
            planningId: planning.id,
            valide: true,
            statutTache: "A_FAIRE",
            duree: 180,
            commentaire: faker.lorem.sentence()
          }
        })
      )
    )
  )

  // 8. Création des congés
  await Promise.all(
    createdEmployees.slice(0, 3).map(employee => 
      prisma.conge.create({
        data: {
          employeeId: employee.id,
          type: faker.helpers.arrayElement(["ANNUEL", "MALADIE"]),
          dateDebut: faker.date.future(),
          dateFin: faker.date.future(),
          statut: faker.helpers.arrayElement(["EN_ATTENTE", "VALIDE", "REJETEE"])
        }
      })
    )
  )

  // 9. Création des synthèses d'heures
  await Promise.all(
    createdEmployees.map(employee => 
      prisma.syntheseHeures.create({
        data: {
          employeeId: employee.id,
          periodeFrom: new Date(new Date().setDate(new Date().getDate() - 7)),
          periodeTo: new Date(),
          heuresNormales: 35,
          heuresSupplementaires: faker.number.int({ min: 0, max: 10 }),
          statut: "VALIDE",
          planningId: plannings[0].id
        }
      })
    )
  )

  console.log('✅ Seed complet réussi !')
  console.log(`- ${postes.length} postes créés`)
  console.log(`- ${createdEmployees.length} employés créés`)
  console.log(`- ${plannings.length} plannings créés`)
  console.log(`- ${taches.length} tâches créées`)
}

main()
  .catch(e => {
    console.error("Erreur lors du seeding :", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })