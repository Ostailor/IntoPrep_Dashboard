import type {
  AcademicNote,
  Assessment,
  AssessmentResult,
  AttendanceRecord,
  Campus,
  Cohort,
  CohortAssignment,
  Enrollment,
  Family,
  Invoice,
  Lead,
  MessageThread,
  Payment,
  Program,
  ImportRun,
  Resource,
  ScoreTrendSnapshot,
  Session,
  Student,
  SyncJob,
  Task,
  Term,
  User,
} from "@/lib/domain";

export const DEMO_DATE = "2026-03-14";

export const users: User[] = [
  {
    id: "user-engineer",
    name: "Noah Mercer",
    role: "engineer",
    title: "Platform Engineer",
    assignedCohortIds: [],
  },
  {
    id: "user-admin",
    name: "Avery Howard",
    role: "admin",
    title: "Operations Director",
    assignedCohortIds: [],
  },
  {
    id: "user-staff",
    name: "Leila Kim",
    role: "staff",
    title: "Enrollment Manager",
    assignedCohortIds: [],
  },
  {
    id: "user-ta",
    name: "Mina Chen",
    role: "ta",
    title: "Program TA",
    assignedCohortIds: ["cohort-sat-spring", "cohort-act-sprint"],
  },
  {
    id: "user-instructor",
    name: "Daniel Ruiz",
    role: "instructor",
    title: "Lead SAT Instructor",
    assignedCohortIds: ["cohort-sat-spring"],
  },
  {
    id: "user-instructor-act",
    name: "Hyejin Park",
    role: "instructor",
    title: "ACT Instructor",
    assignedCohortIds: ["cohort-act-sprint"],
  },
];

export const campuses: Campus[] = [
  {
    id: "campus-malvern",
    name: "Malvern Campus",
    location: "42 Lloyd Avenue, Malvern, PA",
    modality: "Hybrid",
  },
  {
    id: "campus-upenn",
    name: "UPenn Campus",
    location: "3451 Walnut Street, Philadelphia, PA",
    modality: "In person",
  },
  {
    id: "campus-online",
    name: "INTO Online",
    location: "Zoom live delivery",
    modality: "Online",
  },
];

export const terms: Term[] = [
  {
    id: "term-spring-2026",
    name: "Spring 2026",
    startDate: "2026-01-12",
    endDate: "2026-05-30",
  },
  {
    id: "term-summer-2026",
    name: "Summer 2026",
    startDate: "2026-06-15",
    endDate: "2026-08-21",
  },
];

export const programs: Program[] = [
  {
    id: "program-dsat",
    name: "Digital SAT Score Guarantee",
    track: "SAT",
    format: "Hybrid, 20 live class days",
    tuition: 4500,
  },
  {
    id: "program-act",
    name: "Digital ACT Intensive",
    track: "ACT",
    format: "In person + Zoom recap",
    tuition: 4500,
  },
  {
    id: "program-admissions",
    name: "College Admissions Lab",
    track: "Admissions",
    format: "Consulting seminars + 1:1 roadmap",
    tuition: 2200,
  },
];

export const families: Family[] = [
  {
    id: "family-bennett",
    familyName: "Bennett",
    guardianNames: ["Janelle Bennett", "Marcus Bennett"],
    email: "bennett.family@intoprep-demo.com",
    phone: "(610) 201-4400",
    preferredCampusId: "campus-malvern",
    notes: "Interested in UPenn summer residential option.",
  },
  {
    id: "family-park",
    familyName: "Park",
    guardianNames: ["Yuna Park"],
    email: "park.family@intoprep-demo.com",
    phone: "(610) 221-7712",
    preferredCampusId: "campus-online",
    notes: "Needs weekly pacing updates for math confidence.",
  },
  {
    id: "family-patel",
    familyName: "Patel",
    guardianNames: ["Neel Patel", "Asha Patel"],
    email: "patel.family@intoprep-demo.com",
    phone: "(484) 515-3208",
    preferredCampusId: "campus-upenn",
    notes: "Prefers Saturday checkpoint summaries.",
  },
  {
    id: "family-liu",
    familyName: "Liu",
    guardianNames: ["Grace Liu"],
    email: "liu.family@intoprep-demo.com",
    phone: "(610) 204-9192",
    preferredCampusId: "campus-malvern",
    notes: "Watching schedule balance with robotics season.",
  },
  {
    id: "family-rivera",
    familyName: "Rivera",
    guardianNames: ["Elena Rivera"],
    email: "rivera.family@intoprep-demo.com",
    phone: "(267) 333-8871",
    preferredCampusId: "campus-upenn",
    notes: "Family requested closer visibility into reading pacing.",
  },
];

export const students: Student[] = [
  {
    id: "student-aria-bennett",
    familyId: "family-bennett",
    firstName: "Aria",
    lastName: "Bennett",
    gradeLevel: "11",
    school: "Conestoga High School",
    targetTest: "SAT",
    focus: "Targeting 1540+ superscore",
  },
  {
    id: "student-lucas-park",
    familyId: "family-park",
    firstName: "Lucas",
    lastName: "Park",
    gradeLevel: "10",
    school: "Radnor High School",
    targetTest: "SAT",
    focus: "Needs structured pacing in math timing",
  },
  {
    id: "student-ethan-liu",
    familyId: "family-liu",
    firstName: "Ethan",
    lastName: "Liu",
    gradeLevel: "10",
    school: "Lower Merion High School",
    targetTest: "SAT",
    focus: "Improving reading endurance and annotation",
  },
  {
    id: "student-maya-patel",
    familyId: "family-patel",
    firstName: "Maya",
    lastName: "Patel",
    gradeLevel: "11",
    school: "Harriton High School",
    targetTest: "ACT",
    focus: "Wants English section stability over 34",
  },
  {
    id: "student-sofia-rivera",
    familyId: "family-rivera",
    firstName: "Sofia",
    lastName: "Rivera",
    gradeLevel: "11",
    school: "Haverford High School",
    targetTest: "ACT",
    focus: "Building science reasoning speed",
  },
];

export const cohorts: Cohort[] = [
  {
    id: "cohort-sat-spring",
    name: "SAT Spring Elite M/W/F",
    programId: "program-dsat",
    campusId: "campus-malvern",
    termId: "term-spring-2026",
    capacity: 18,
    enrolled: 14,
    leadInstructorId: "user-instructor",
    taIds: ["user-ta"],
    cadence: "Mon/Wed/Fri, plus Saturday full-test labs",
    roomLabel: "Studio A + Zoom 3",
  },
  {
    id: "cohort-act-sprint",
    name: "ACT Sprint Tue/Thu/Sat",
    programId: "program-act",
    campusId: "campus-upenn",
    termId: "term-spring-2026",
    capacity: 16,
    enrolled: 11,
    leadInstructorId: "user-instructor-act",
    taIds: ["user-ta"],
    cadence: "Tue/Thu/Sat, skills rotation",
    roomLabel: "Walnut Seminar 2",
  },
  {
    id: "cohort-admissions-lab",
    name: "Admissions Lab",
    programId: "program-admissions",
    campusId: "campus-online",
    termId: "term-spring-2026",
    capacity: 22,
    enrolled: 19,
    leadInstructorId: "user-staff",
    taIds: [],
    cadence: "Wed evenings + roadmap workshops",
    roomLabel: "Zoom Advisory Room",
  },
];

export const cohortAssignments: CohortAssignment[] = [
  {
    id: "assign-engineer-sat",
    cohortId: "cohort-sat-spring",
    userId: "user-engineer",
    role: "engineer",
  },
  {
    id: "assign-admin-sat",
    cohortId: "cohort-sat-spring",
    userId: "user-admin",
    role: "admin",
  },
  {
    id: "assign-staff-sat",
    cohortId: "cohort-sat-spring",
    userId: "user-staff",
    role: "staff",
  },
  {
    id: "assign-ta-sat",
    cohortId: "cohort-sat-spring",
    userId: "user-ta",
    role: "ta",
  },
  {
    id: "assign-ta-act",
    cohortId: "cohort-act-sprint",
    userId: "user-ta",
    role: "ta",
  },
  {
    id: "assign-inst-sat",
    cohortId: "cohort-sat-spring",
    userId: "user-instructor",
    role: "instructor",
  },
];

export const enrollments: Enrollment[] = [
  {
    id: "enroll-aria",
    studentId: "student-aria-bennett",
    cohortId: "cohort-sat-spring",
    status: "active",
    registeredAt: "2026-01-05",
  },
  {
    id: "enroll-lucas",
    studentId: "student-lucas-park",
    cohortId: "cohort-sat-spring",
    status: "active",
    registeredAt: "2026-01-09",
  },
  {
    id: "enroll-ethan",
    studentId: "student-ethan-liu",
    cohortId: "cohort-sat-spring",
    status: "active",
    registeredAt: "2026-01-12",
  },
  {
    id: "enroll-maya",
    studentId: "student-maya-patel",
    cohortId: "cohort-act-sprint",
    status: "active",
    registeredAt: "2026-01-07",
  },
  {
    id: "enroll-sofia",
    studentId: "student-sofia-rivera",
    cohortId: "cohort-act-sprint",
    status: "active",
    registeredAt: "2026-01-07",
  },
];

export const sessions: Session[] = [
  {
    id: "session-sat-mock",
    cohortId: "cohort-sat-spring",
    title: "Saturday DSAT Pulse Check",
    startAt: "2026-03-14T08:30:00-04:00",
    endAt: "2026-03-14T11:45:00-04:00",
    mode: "Hybrid",
    roomLabel: "Studio A + Zoom 3",
  },
  {
    id: "session-sat-review",
    cohortId: "cohort-sat-spring",
    title: "Math Repair Studio",
    startAt: "2026-03-14T13:00:00-04:00",
    endAt: "2026-03-14T15:00:00-04:00",
    mode: "Hybrid",
    roomLabel: "Studio A breakout",
  },
  {
    id: "session-act-lab",
    cohortId: "cohort-act-sprint",
    title: "ACT English and Science Lab",
    startAt: "2026-03-14T09:00:00-04:00",
    endAt: "2026-03-14T12:00:00-04:00",
    mode: "In person",
    roomLabel: "Walnut Seminar 2",
  },
  {
    id: "session-admissions",
    cohortId: "cohort-admissions-lab",
    title: "Essay Architecture Workshop",
    startAt: "2026-03-18T18:00:00-04:00",
    endAt: "2026-03-18T19:30:00-04:00",
    mode: "Zoom",
    roomLabel: "Zoom Advisory Room",
  },
];

export const attendanceRecords: AttendanceRecord[] = [
  {
    id: "attend-aria-mock",
    sessionId: "session-sat-mock",
    studentId: "student-aria-bennett",
    status: "present",
  },
  {
    id: "attend-lucas-mock",
    sessionId: "session-sat-mock",
    studentId: "student-lucas-park",
    status: "tardy",
  },
  {
    id: "attend-ethan-mock",
    sessionId: "session-sat-mock",
    studentId: "student-ethan-liu",
    status: "present",
  },
  {
    id: "attend-maya-act",
    sessionId: "session-act-lab",
    studentId: "student-maya-patel",
    status: "present",
  },
  {
    id: "attend-sofia-act",
    sessionId: "session-act-lab",
    studentId: "student-sofia-rivera",
    status: "absent",
  },
];

export const assessments: Assessment[] = [
  {
    id: "assessment-sat-314",
    cohortId: "cohort-sat-spring",
    title: "Saturday DSAT Pulse Check",
    date: "2026-03-14",
    sections: [
      { label: "Reading & Writing", score: 800 },
      { label: "Math", score: 800 },
    ],
  },
  {
    id: "assessment-act-314",
    cohortId: "cohort-act-sprint",
    title: "ACT Saturday Skill Check",
    date: "2026-03-14",
    sections: [
      { label: "English", score: 36 },
      { label: "Math", score: 36 },
      { label: "Reading", score: 36 },
      { label: "Science", score: 36 },
    ],
  },
];

export const assessmentResults: AssessmentResult[] = [
  {
    id: "result-aria-314",
    assessmentId: "assessment-sat-314",
    studentId: "student-aria-bennett",
    totalScore: 1510,
    sectionScores: [
      { label: "Reading & Writing", score: 740 },
      { label: "Math", score: 770 },
    ],
    deltaFromPrevious: 30,
  },
  {
    id: "result-lucas-314",
    assessmentId: "assessment-sat-314",
    studentId: "student-lucas-park",
    totalScore: 1420,
    sectionScores: [
      { label: "Reading & Writing", score: 690 },
      { label: "Math", score: 730 },
    ],
    deltaFromPrevious: 60,
  },
  {
    id: "result-ethan-314",
    assessmentId: "assessment-sat-314",
    studentId: "student-ethan-liu",
    totalScore: 1460,
    sectionScores: [
      { label: "Reading & Writing", score: 710 },
      { label: "Math", score: 750 },
    ],
    deltaFromPrevious: 20,
  },
  {
    id: "result-maya-314",
    assessmentId: "assessment-act-314",
    studentId: "student-maya-patel",
    totalScore: 33,
    sectionScores: [
      { label: "English", score: 35 },
      { label: "Math", score: 31 },
      { label: "Reading", score: 34 },
      { label: "Science", score: 33 },
    ],
    deltaFromPrevious: 1,
  },
  {
    id: "result-sofia-314",
    assessmentId: "assessment-act-314",
    studentId: "student-sofia-rivera",
    totalScore: 31,
    sectionScores: [
      { label: "English", score: 32 },
      { label: "Math", score: 29 },
      { label: "Reading", score: 31 },
      { label: "Science", score: 32 },
    ],
    deltaFromPrevious: 2,
  },
];

export const scoreTrends: ScoreTrendSnapshot[] = [
  {
    studentId: "student-aria-bennett",
    points: [
      { label: "Jan 10", score: 1420 },
      { label: "Jan 31", score: 1450 },
      { label: "Feb 21", score: 1480 },
      { label: "Mar 14", score: 1510 },
    ],
  },
  {
    studentId: "student-lucas-park",
    points: [
      { label: "Jan 10", score: 1310 },
      { label: "Jan 31", score: 1350 },
      { label: "Feb 21", score: 1360 },
      { label: "Mar 14", score: 1420 },
    ],
  },
  {
    studentId: "student-ethan-liu",
    points: [
      { label: "Jan 10", score: 1380 },
      { label: "Jan 31", score: 1410 },
      { label: "Feb 21", score: 1440 },
      { label: "Mar 14", score: 1460 },
    ],
  },
  {
    studentId: "student-maya-patel",
    points: [
      { label: "Jan 17", score: 30 },
      { label: "Feb 07", score: 31 },
      { label: "Feb 28", score: 32 },
      { label: "Mar 14", score: 33 },
    ],
  },
  {
    studentId: "student-sofia-rivera",
    points: [
      { label: "Jan 17", score: 27 },
      { label: "Feb 07", score: 29 },
      { label: "Feb 28", score: 29 },
      { label: "Mar 14", score: 31 },
    ],
  },
];

export const academicNotes: AcademicNote[] = [
  {
    id: "note-aria",
    studentId: "student-aria-bennett",
    authorId: "user-ta",
    visibility: "internal",
    summary: "Ready for more difficult RW passage timing; recommend pushing blended inference sets.",
    createdAt: "2026-03-13T17:15:00-04:00",
  },
  {
    id: "note-lucas",
    studentId: "student-lucas-park",
    authorId: "user-ta",
    visibility: "internal",
    summary: "Recovered well after pacing intervention, but needs calculator discipline.",
    createdAt: "2026-03-13T18:05:00-04:00",
  },
];

export const resources: Resource[] = [
  {
    id: "resource-math-repair",
    cohortId: "cohort-sat-spring",
    title: "Math Repair Sprint Packet",
    kind: "Worksheet",
    publishedAt: "2026-03-13T20:00:00-04:00",
  },
  {
    id: "resource-act-science",
    cohortId: "cohort-act-sprint",
    title: "ACT Science Speed Framework",
    kind: "Deck",
    publishedAt: "2026-03-12T14:10:00-04:00",
  },
  {
    id: "resource-orientation",
    cohortId: "cohort-sat-spring",
    title: "Saturday replay: pacing reset",
    kind: "Replay",
    publishedAt: "2026-03-10T09:00:00-04:00",
  },
];

export const invoices: Invoice[] = [
  {
    id: "invoice-bennett",
    familyId: "family-bennett",
    amountDue: 2250,
    dueDate: "2026-03-20",
    status: "pending",
    source: "QuickBooks",
  },
  {
    id: "invoice-park",
    familyId: "family-park",
    amountDue: 0,
    dueDate: "2026-03-01",
    status: "paid",
    source: "QuickBooks",
  },
  {
    id: "invoice-patel",
    familyId: "family-patel",
    amountDue: 850,
    dueDate: "2026-03-08",
    status: "overdue",
    source: "Manual",
  },
  {
    id: "invoice-liu",
    familyId: "family-liu",
    amountDue: 1200,
    dueDate: "2026-03-18",
    status: "pending",
    source: "QuickBooks",
  },
];

export const payments: Payment[] = [
  {
    id: "payment-park",
    invoiceId: "invoice-park",
    amount: 2250,
    method: "ACH",
    postedAt: "2026-02-28T12:15:00-05:00",
  },
  {
    id: "payment-bennett-deposit",
    invoiceId: "invoice-bennett",
    amount: 2250,
    method: "QuickBooks",
    postedAt: "2026-01-18T11:00:00-05:00",
  },
];

export const leads: Lead[] = [
  {
    id: "lead-cho",
    studentName: "Nora Cho",
    guardianName: "Sung Cho",
    targetProgram: "Summer 2026 Digital SAT",
    stage: "assessment",
    submittedAt: "2026-03-13T09:20:00-04:00",
  },
  {
    id: "lead-williams",
    studentName: "Theo Williams",
    guardianName: "Marina Williams",
    targetProgram: "ACT Intensive",
    stage: "inquiry",
    submittedAt: "2026-03-14T08:05:00-04:00",
  },
  {
    id: "lead-ghosh",
    studentName: "Aanya Ghosh",
    guardianName: "Rima Ghosh",
    targetProgram: "Admissions Lab",
    stage: "waitlist",
    submittedAt: "2026-03-10T12:10:00-04:00",
  },
];

export const messageThreads: MessageThread[] = [
  {
    id: "thread-bennett",
    cohortId: "cohort-sat-spring",
    subject: "Aria pacing check-in",
    participants: ["Janelle Bennett", "Mina Chen"],
    lastMessagePreview: "Could we confirm whether Aria should repeat the full math packet tomorrow?",
    lastMessageAt: "2026-03-14T07:50:00-04:00",
    unreadCount: 2,
  },
  {
    id: "thread-park",
    cohortId: "cohort-sat-spring",
    subject: "Lucas arrival timing",
    participants: ["Yuna Park", "Mina Chen"],
    lastMessagePreview: "Traffic may make Lucas 10 minutes late to the March 14 session.",
    lastMessageAt: "2026-03-14T08:02:00-04:00",
    unreadCount: 1,
  },
  {
    id: "thread-patel",
    cohortId: "cohort-act-sprint",
    subject: "Maya English trend",
    participants: ["Asha Patel", "Leila Kim"],
    lastMessagePreview: "The English trend is strong. We are planning an extra math block next week.",
    lastMessageAt: "2026-03-13T18:40:00-04:00",
    unreadCount: 0,
  },
];

export const syncJobs: SyncJob[] = [
  {
    id: "sync-forms",
    label: "Google Forms registration import",
    cadence: "Daily around 7:00 AM ET + manual",
    status: "healthy",
    lastRunAt: "2026-03-14T08:00:00-04:00",
    summary: "3 new registrations landed and mapped cleanly.",
  },
  {
    id: "sync-quickbooks",
    label: "QuickBooks invoice snapshot",
    cadence: "Daily around 7:00 AM ET + manual",
    status: "warning",
    lastRunAt: "2026-03-14T06:00:00-04:00",
    summary: "1 overdue invoice could not auto-match to a family record.",
  },
  {
    id: "sync-morning-ops",
    label: "Morning linked sync bundle",
    cadence: "Daily around 7:00 AM ET",
    status: "healthy",
    lastRunAt: "2026-03-14T07:05:00-04:00",
    summary: "Morning automation is ready to run linked Google Forms and QuickBooks sync sources.",
  },
  {
    id: "sync-legacy",
    label: "Legacy 2024 portal export",
    cadence: "Nightly",
    status: "healthy",
    lastRunAt: "2026-03-14T02:15:00-04:00",
    summary: "Student roster and historical score imports completed.",
  },
  {
    id: "sync-scheduling",
    label: "Scheduling bridge fallback",
    cadence: "Nightly CSV",
    status: "error",
    lastRunAt: "2026-03-14T03:15:00-04:00",
    summary: "Source hostname still unavailable; using last successful export from March 13, 2026.",
  },
];

export const importRuns: ImportRun[] = [
  {
    id: "import-run-0314-am",
    source: "Google Forms CSV",
    filename: "google-forms-intake-2026-03-14-0800.csv",
    status: "completed",
    startedAt: "2026-03-14T08:00:00-04:00",
    finishedAt: "2026-03-14T08:01:12-04:00",
    importedCount: 3,
    leadCount: 3,
    familyCount: 3,
    studentCount: 3,
    enrollmentCount: 1,
    errorCount: 0,
    summary: "Imported 3 rows from the morning Google Forms registration export.",
    errorSamples: [],
  },
];

export const tasks: Task[] = [
  {
    id: "task-role-audit",
    ownerRole: "engineer",
    title: "Review admin role changes",
    dueLabel: "Today",
    status: "active",
  },
  {
    id: "task-overdue",
    ownerRole: "staff",
    title: "Resolve unmatched Patel invoice before Monday billing call",
    dueLabel: "Today",
    status: "active",
  },
  {
    id: "task-score-release",
    ownerRole: "ta",
    title: "Publish SAT Pulse Check section notes to assigned families",
    dueLabel: "After session",
    status: "active",
  },
  {
    id: "task-attendance",
    ownerRole: "instructor",
    title: "Finalize March 14 attendance during first 10 minutes of each class",
    dueLabel: "Every session",
    status: "active",
  },
  {
    id: "task-sync-watch",
    ownerRole: "all",
    title: "Watch scheduling fallback until DNS issue is resolved",
    dueLabel: "Monitor",
    status: "watch",
  },
];
