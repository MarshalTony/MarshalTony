/**
 * DEMO / TRAINING DATA ONLY — fictitious students, staff, marks and fees for testing and staff training.
 * Refuses to run against production or a non-local database unless ALLOW_DEMO_DATA=1 is set.
 * Deterministic (seeded) so test runs are reproducible.
 */
import { PrismaClient, type Gender } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const url = process.env.DATABASE_URL ?? "";
if ((process.env.NODE_ENV === "production" || !/localhost|127\.0\.0\.1/.test(url)) && process.env.ALLOW_DEMO_DATA !== "1") {
  console.error("Refusing to load demo data into a non-local / production database. Set ALLOW_DEMO_DATA=1 to override (e.g. a staging training copy).");
  process.exit(1);
}

let seed = 20261118;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));

const SURNAMES = ["Okello", "Nakato", "Mugisha", "Achieng", "Ssempala", "Namubiru", "Tumusiime", "Atim", "Byaruhanga", "Kizza", "Nabirye", "Opio", "Kemigisha", "Wasswa", "Nansubuga", "Ocen", "Ainembabazi", "Lubega", "Akello", "Mutebi", "Asiimwe", "Nalwanga", "Odongo", "Kabugo", "Nyakato"];
const BOYS = ["Peter", "Brian", "Joseph", "Daniel", "Isaac", "Ronald", "Emmanuel", "Samuel", "Allan", "Ivan", "Moses", "Timothy", "Arnold", "Collins", "Derrick"];
const GIRLS = ["Sarah", "Grace", "Esther", "Patience", "Joan", "Mercy", "Brenda", "Prossy", "Sharon", "Doreen", "Faith", "Ruth", "Shamim", "Agnes", "Martha"];
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

async function main() {
  if ((await prisma.student.count()) > 50) {
    console.log("Demo data appears to be loaded already (more than 50 students). Skipping.");
    return;
  }
  const year = await prisma.academicYear.findFirstOrThrow({ where: { isCurrent: true } });
  const term = await prisma.term.findFirstOrThrow({ where: { isCurrent: true } });
  const classes = await prisma.schoolClass.findMany({ orderBy: { order: "asc" } });
  const subjects = await prisma.subject.findMany();
  const sub = Object.fromEntries(subjects.map((s) => [s.code, s]));
  const combos = await prisma.subjectCombination.findMany({ include: { subjects: true } });
  const roles = Object.fromEntries((await prisma.role.findMany()).map((r) => [r.code, r.id]));
  const pw = await bcrypt.hash("Demo12345", 10);

  // Streams A and B for every class
  for (const c of classes) {
    for (const n of ["A", "B"]) await prisma.stream.upsert({ where: { classId_name: { classId: c.id, name: n } }, update: {}, create: { classId: c.id, name: n } });
  }
  const streams = await prisma.stream.findMany({ include: { schoolClass: true } });

  // Staff: one teacher per main subject + office staff, each with a login
  const depts = Object.fromEntries((await prisma.department.findMany()).map((x) => [x.name, x.id]));
  const teacherSubjects: string[][] = [
    ["ENG", "LIT", "A-LIT", "GP"], ["MTC", "A-MTC", "S-MTC"], ["PHY", "A-PHY"], ["CHE", "A-CHE"], ["BIO", "A-BIO"], ["GEO", "A-GEO"],
    ["HPE", "A-HIS"], ["CRE", "A-DIV"], ["ENT", "A-ENT", "A-ECO"], ["KIS", "LUG"], ["PE", "ART", "A-ART"], ["ICT", "S-ICT"], ["AGR", "A-AGR"],
  ];
  const teachers: { id: string; codes: string[] }[] = [];
  for (let i = 0; i < teacherSubjects.length; i++) {
    const g: Gender = i % 2 ? "FEMALE" : "MALE";
    const first = g === "MALE" ? BOYS[i % BOYS.length] : GIRLS[i % GIRLS.length];
    const last = SURNAMES[(i * 3) % SURNAMES.length];
    const username = `teacher${i + 1}`;
    const roleIds = [roles.TEACHER, ...(i < 12 ? [roles.CLASS_TEACHER] : [])];
    const staff = await prisma.staff.create({
      data: {
        staffNo: `BOHS-T-${String(i + 1).padStart(3, "0")}`, firstName: first, lastName: last, gender: g, designation: "Teacher", isTeaching: true,
        phone: `07${int(70, 79)}${int(100000, 999999)}`, department: { connect: { id: depts[i < 2 ? "Languages" : i < 3 ? "Mathematics" : "Sciences"] } }, dateJoined: d("2020-02-01"),
        basicSalary: int(9, 16) * 100000, subjects: { create: teacherSubjects[i].map((c) => ({ subjectId: sub[c].id })) },
        user: { create: { username, fullName: `${first} ${last}`, passwordHash: pw, mustChangePassword: false, roles: { create: roleIds.map((roleId) => ({ roleId })) } } },
      },
    });
    teachers.push({ id: staff.id, codes: teacherSubjects[i] });
  }
  const office: [string, string, string, string][] = [["dos", "Director of Studies", "DOS", "Akena"], ["bursar", "Bursar", "BURSAR", "Namata"], ["registrar", "Registrar", "REGISTRAR", "Kagimu"], ["head", "Headteacher", "HEADTEACHER", "Rwakatare"], ["deputy", "Deputy Headteacher", "DEPUTY", "Oryem"], ["librarian", "Librarian", "LIBRARIAN", "Nabatanzi"]];
  for (const [i, [username, designation, role, last]] of office.entries()) {
    await prisma.staff.create({
      data: {
        staffNo: `BOHS-A-${String(i + 1).padStart(3, "0")}`, firstName: pick(GIRLS), lastName: last, gender: "FEMALE", designation, isTeaching: role === "DOS",
        department: { connect: { id: depts.Administration } }, basicSalary: 1800000,
        user: { create: { username, fullName: `${designation} ${last}`, passwordHash: pw, mustChangePassword: false, roles: { create: [{ roleId: roles[role] }] } } },
      },
    });
  }

  // Class teachers & allocations
  for (const [i, st] of streams.entries()) {
    await prisma.stream.update({ where: { id: st.id }, data: { classTeacherId: teachers[i % 12].id } });
    for (const t of teachers) {
      for (const code of t.codes) {
        if (sub[code].level !== st.schoolClass.level) continue;
        await prisma.teacherAllocation.upsert({
          where: { staffId_subjectId_streamId_academicYearId: { staffId: t.id, subjectId: sub[code].id, streamId: st.id, academicYearId: year.id } },
          update: {}, create: { staffId: t.id, subjectId: sub[code].id, streamId: st.id, academicYearId: year.id },
        });
      }
    }
  }

  // Students: 20 per stream, with guardians (some siblings share a guardian)
  const oCompulsory = subjects.filter((s) => s.level === "O_LEVEL" && s.category === "COMPULSORY").map((s) => s.id);
  const oElectives = subjects.filter((s) => s.level === "O_LEVEL" && s.category === "ELECTIVE").map((s) => s.id);
  let n = (await prisma.student.count()) + 1;
  let lastGuardian: string | null = null;
  for (const st of streams) {
    for (let k = 0; k < 20; k++) {
      const g: Gender = rnd() < 0.5 ? "MALE" : "FEMALE";
      const last = pick(SURNAMES);
      const combo = st.schoolClass.level === "A_LEVEL" ? pick(combos) : null;
      const ability = rnd(); // drives marks
      const student = await prisma.student.create({
        data: {
          admissionNo: `BOHS/2026/${String(n++).padStart(4, "0")}`, firstName: g === "MALE" ? pick(BOYS) : pick(GIRLS), lastName: last, gender: g,
          dateOfBirth: d(`${2014 - st.schoolClass.order}-${String(int(1, 12)).padStart(2, "0")}-${String(int(1, 28)).padStart(2, "0")}`),
          admissionDate: d(`${2027 - st.schoolClass.order - (st.schoolClass.order > 4 ? 0 : 0)}-02-02`), classId: st.classId, streamId: st.id,
          residence: rnd() < 0.6 ? "BOARDING" : "DAY", combinationId: combo?.id, previousSchool: "Demo Primary School",
          medicalInfo: rnd() < 0.1 ? "Asthmatic — carries inhaler" : null, homeAddress: pick(["Kampala", "Mukono", "Wakiso", "Jinja", "Mbarara", "Gulu"]),
          unebIndexNo: null,
        },
      });
      const subjectIds = combo ? combo.subjects.map((x) => x.subjectId) : [...oCompulsory, ...[pick(oElectives)]];
      await prisma.studentSubject.createMany({ data: [...new Set(subjectIds)].map((subjectId) => ({ studentId: student.id, subjectId, academicYearId: year.id })) });
      await prisma.enrollment.create({ data: { studentId: student.id, academicYearId: year.id, classId: st.classId, streamId: st.id } });
      // Every 7th student is a sibling of the previous one
      let guardianId: string | null = lastGuardian;
      if (!guardianId || k % 7 !== 3) {
        const gu = await prisma.guardian.create({ data: { fullName: `${pick(BOYS)} ${last}`, phone: `07${int(0, 9)}${int(1000000, 9999999)}`, occupation: pick(["Farmer", "Teacher", "Trader", "Nurse", "Engineer"]) } });
        guardianId = gu.id;
      }
      await prisma.studentGuardian.create({ data: { studentId: student.id, guardianId, relationship: pick(["Father", "Mother", "Guardian"]), isPrimary: true } });
      lastGuardian = guardianId;
      (student as any).ability = ability;
    }
  }

  // A parent portal login for the first guardian with 2+ children
  const fam = await prisma.guardian.findFirst({ where: { students: { some: {} } }, include: { _count: { select: { students: true } } }, orderBy: { createdAt: "asc" } });
  const multi = (await prisma.guardian.findMany({ include: { _count: { select: { students: true } } } })).find((g) => g._count.students >= 2) ?? fam;
  if (multi && !multi.userId) {
    await prisma.user.create({ data: { username: "parent1", fullName: multi.fullName, passwordHash: pw, mustChangePassword: false, roles: { create: [{ roleId: roles.PARENT }] }, guardian: { connect: { id: multi.id } } } });
  }
  const firstStudent = await prisma.student.findFirst({ where: { userId: null, status: "ACTIVE" }, orderBy: { admissionNo: "asc" } });
  if (firstStudent) await prisma.user.create({ data: { username: "student1", fullName: `${firstStudent.firstName} ${firstStudent.lastName}`, passwordHash: pw, mustChangePassword: false, roles: { create: [{ roleId: roles.STUDENT }] }, student: { connect: { id: firstStudent.id } } } });

  // A BOT exam for the current term with approved marks for all classes
  const bot = await prisma.examType.findUniqueOrThrow({ where: { code: "BOT" } });
  const exam = await prisma.exam.create({ data: { name: `${term.name} Beginning of Term Exams (demo)`, examTypeId: bot.id, termId: term.id, status: "CLOSED", classes: { create: classes.map((c) => ({ classId: c.id })) } } });
  const allStudents = await prisma.student.findMany({ where: { status: "ACTIVE" }, include: { subjects: { where: { academicYearId: year.id } } } });
  const pairs = new Set<string>();
  for (const s of allStudents) for (const x of s.subjects) pairs.add(`${s.classId}|${x.subjectId}`);
  await prisma.examSubject.createMany({ data: [...pairs].map((p) => { const [classId, subjectId] = p.split("|"); return { examId: exam.id, classId, subjectId, maxMarks: 100 }; }) });
  const marks: any[] = [];
  for (const s of allStudents) {
    const base = 35 + ((s.admissionNo.charCodeAt(s.admissionNo.length - 1) * 7 + s.lastName.length * 11) % 50);
    for (const x of s.subjects) {
      const r = rnd();
      if (r < 0.02) marks.push({ examId: exam.id, studentId: s.id, subjectId: x.subjectId, status: "ABSENT" });
      else marks.push({ examId: exam.id, studentId: s.id, subjectId: x.subjectId, status: "PRESENT", score: Math.max(0, Math.min(100, base + int(-15, 15))) });
    }
  }
  await prisma.mark.createMany({ data: marks });
  const subPairs = new Set(allStudents.flatMap((s) => s.subjects.map((x) => `${s.streamId}|${x.subjectId}`)));
  await prisma.markSubmission.createMany({ data: [...subPairs].map((p) => { const [streamId, subjectId] = p.split("|"); return { examId: exam.id, streamId, subjectId, status: "APPROVED" as const, reviewedAt: new Date() }; }) });

  // Fee structures for the current term
  for (const c of classes) {
    for (const residence of ["DAY", "BOARDING"] as const) {
      const tuition = c.level === "A_LEVEL" ? 950000 : 800000;
      await prisma.feeStructure.create({
        data: {
          termId: term.id, classId: c.id, residence,
          items: { create: [
            { name: "Tuition", amount: tuition }, { name: "Development fund", amount: 50000 }, { name: "Uniform & activity", amount: 30000 },
            ...(residence === "BOARDING" ? [{ name: "Boarding", amount: 450000 }] : [{ name: "Lunch", amount: 150000 }]),
          ] },
        },
      });
    }
  }
  console.log(`Demo data loaded: ${allStudents.length} students, ${teachers.length + office.length} staff, ${marks.length} marks.`);
  console.log("Demo logins (password Demo12345): teacher1..teacher13, dos, bursar, registrar, head, deputy, librarian, parent1, student1");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
