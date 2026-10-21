const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'erp.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','registrar','faculty')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  roll_no TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  gender TEXT CHECK (gender IN ('Male','Female','Other')),
  dob TEXT,
  department_id INTEGER NOT NULL REFERENCES departments(id),
  program TEXT NOT NULL,
  semester INTEGER NOT NULL,
  batch_year INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','graduated','dropped')),
  guardian_name TEXT,
  guardian_phone TEXT,
  address TEXT,
  category TEXT,
  admission_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS admissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_no TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  gender TEXT,
  department_id INTEGER REFERENCES departments(id),
  program TEXT,
  category TEXT,
  stage TEXT NOT NULL DEFAULT 'enquiry' CHECK (stage IN ('enquiry','applied','verified','approved','enrolled','rejected')),
  score REAL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS fee_structures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  department_id INTEGER NOT NULL REFERENCES departments(id),
  program TEXT NOT NULL,
  semester INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  academic_year TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS challans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  challan_no TEXT NOT NULL UNIQUE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  fee_type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  paid_amount INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','partial','paid')),
  due_date TEXT,
  paid_on TEXT,
  mode TEXT,
  receipt_no TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present','absent','late')),
  marked_by INTEGER REFERENCES users(id),
  UNIQUE (student_id, subject, date)
);

CREATE TABLE IF NOT EXISTS timetable (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  department_id INTEGER NOT NULL REFERENCES departments(id),
  semester INTEGER NOT NULL,
  day_of_week INTEGER NOT NULL,
  period INTEGER NOT NULL,
  subject TEXT NOT NULL,
  faculty_name TEXT,
  room TEXT
);

CREATE TABLE IF NOT EXISTS exams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  department_id INTEGER NOT NULL REFERENCES departments(id),
  semester INTEGER NOT NULL,
  subject TEXT NOT NULL,
  max_marks INTEGER NOT NULL DEFAULT 100,
  exam_date TEXT,
  start_time TEXT,
  duration_min INTEGER DEFAULT 90,
  published INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS marks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  marks_obtained REAL,
  UNIQUE (exam_id, student_id)
);

CREATE TABLE IF NOT EXISTS faculty (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT,
  department_id INTEGER REFERENCES departments(id),
  designation TEXT,
  qualification TEXT,
  join_date TEXT,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS notices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT,
  audience TEXT NOT NULL DEFAULT 'all',
  pinned INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS scholarships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  scheme TEXT NOT NULL,
  academic_year TEXT NOT NULL,
  mahabdt_app_no TEXT,
  stage TEXT NOT NULL DEFAULT 'draft' CHECK (stage IN ('draft','institute_verified','submitted','approved','disbursed','rejected')),
  amount INTEGER NOT NULL DEFAULT 0,
  status_note TEXT,
  verified_by INTEGER REFERENCES users(id),
  verified_at TEXT,
  disbursed_on TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS scholarship_docs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scholarship_id INTEGER NOT NULL REFERENCES scholarships(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','uploaded','verified')),
  UNIQUE (scholarship_id, doc_type)
);

CREATE TABLE IF NOT EXISTS scholarship_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scholarship_id INTEGER NOT NULL REFERENCES scholarships(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  detail TEXT,
  actor TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER,
  actor_name TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
`);

function seed() {
  if (db.prepare('SELECT COUNT(*) AS c FROM users').get().c > 0) return;

  let seedState = 42;
  const rand = () => (seedState = (seedState * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const int = (min, max) => min + Math.floor(rand() * (max - min + 1));

  const today = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  const daysAgo = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return iso(d); };

  const tx = db.transaction(() => {
    const insUser = db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)');
    insUser.run('Dr. Anil Deshmukh', 'admin@demo.edu', bcrypt.hashSync('Admin@123', 10), 'admin');
    insUser.run('Priya Kulkarni', 'registrar@demo.edu', bcrypt.hashSync('Staff@123', 10), 'registrar');
    insUser.run('Prof. Rahul Joshi', 'faculty@demo.edu', bcrypt.hashSync('Faculty@123', 10), 'faculty');

    const insDept = db.prepare('INSERT INTO departments (code, name) VALUES (?,?)');
    const depts = [
      ['CS', 'Computer Science & Engineering'],
      ['IT', 'Information Technology'],
      ['ENTC', 'Electronics & Telecommunication'],
      ['MECH', 'Mechanical Engineering'],
      ['CIVIL', 'Civil Engineering'],
      ['MBA', 'Business Administration']
    ];
    const deptRows = depts.map(d => ({ id: insDept.run(d[0], d[1]).lastInsertRowid, code: d[0] }));

    const first = ['Aarav', 'Vivaan', 'Aditya', 'Sai', 'Rohit', 'Kabir', 'Ishaan', 'Arjun', 'Dev', 'Rudra',
      'Ananya', 'Diya', 'Saanvi', 'Aadhya', 'Myra', 'Sara', 'Ira', 'Kavya', 'Riya', 'Pooja',
      'Neha', 'Sneha', 'Tanvi', 'Avni', 'Rutuja', 'Shreya', 'Mrunal', 'Payal', 'Nikita', 'Gauri',
      'Kunal', 'Nikhil', 'Omkar', 'Prasad', 'Sagar', 'Tejas', 'Yash', 'Atharva', 'Jay', 'Vedant',
      'Aniket', 'Harsh', 'Pranav', 'Manas', 'Shubham', 'Akash', 'Siddharth', 'Varun'];
    const last = ['Patil', 'Sharma', 'Deshmukh', 'Kulkarni', 'Joshi', 'Jadhav', 'More', 'Pawar', 'Gaikwad', 'Shinde',
      'Chavan', 'Kadam', 'Bhosale', 'Sawant', 'Naik', 'Iyer', 'Nair', 'Reddy', 'Rao', 'Mehta',
      'Shah', 'Gupta', 'Verma', 'Singh', 'Yadav'];

    const feeAmount = { CS: 55000, IT: 52000, ENTC: 50000, MECH: 48000, CIVIL: 45000, MBA: 65000 };
    const insFeeStruct = db.prepare('INSERT INTO fee_structures (department_id, program, semester, amount, academic_year) VALUES (?,?,?,?,?)');
    for (const d of deptRows) {
      const program = d.code === 'MBA' ? 'MBA' : 'B.Tech';
      for (const sem of [1, 3, 5]) insFeeStruct.run(d.id, program, sem, feeAmount[d.code], '2026-27');
    }

    const subjectsByDeptSem = {
      'CS-3': ['DBMS', 'Operating Systems', 'Computer Networks'],
      'CS-5': ['AI & ML', 'Software Engineering', 'Cloud Computing'],
      'IT-3': ['Data Structures', 'Web Technologies', 'Database Systems'],
      'ENTC-3': ['Digital Circuits', 'Signals & Systems', 'Microcontrollers'],
      'MECH-3': ['Thermodynamics', 'Fluid Mechanics', 'Strength of Materials'],
      'CIVIL-3': ['Structural Analysis', 'Surveying', 'Concrete Technology'],
      'MBA-1': ['Marketing Management', 'Financial Accounting', 'Business Statistics']
    };

    const insStudent = db.prepare(`INSERT INTO students
      (roll_no, name, email, phone, gender, dob, department_id, program, semester, batch_year, status, guardian_name, guardian_phone, address, category, admission_date)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

    const counts = { CS: 10, IT: 8, ENTC: 8, MECH: 8, CIVIL: 7, MBA: 7 };
    const students = [];
    const usedNames = new Set();
    let seq = 0;
    for (const d of deptRows) {
      const n = counts[d.code];
      for (let i = 0; i < n; i++) {
        let nm;
        do { nm = `${pick(first)} ${pick(last)}`; } while (usedNames.has(nm));
        usedNames.add(nm);
        const semester = d.code === 'MBA' ? 1 : (i < Math.ceil(n / 2) ? 3 : 5);
        const batch = 2026 - Math.floor(semester / 2);
        const gender = pick(['Male', 'Female']);
        const category = pick(['OPEN', 'OBC', 'SC', 'ST', 'EWS', 'VJNT', 'OPEN', 'OBC']);
        const roll = `${d.code}${batch}${String(++seq).padStart(3, '0')}`;
        const info = insStudent.run(
          roll, nm, `${nm.split(' ')[0].toLowerCase()}.${roll.toLowerCase()}@student.demo.edu`,
          `98${int(10000000, 99999999)}`, gender, `${int(2002, 2006)}-${String(int(1, 12)).padStart(2, '0')}-${String(int(1, 28)).padStart(2, '0')}`,
          d.id, d.code === 'MBA' ? 'MBA' : 'B.Tech', semester, batch, 'active',
          `${pick(first)} ${nm.split(' ')[1]}`, `97${int(10000000, 99999999)}`,
          `${int(1, 99)}, ${pick(['Shivaji Nagar', 'Kothrud', 'Baner', 'Hadapsar', 'Wakad', 'Deccan'])}`, category, `${batch}-07-${String(int(1, 20)).padStart(2, '0')}`
        );
        students.push({ id: info.lastInsertRowid, deptId: d.id, deptCode: d.code, semester, name: nm, category, program: d.code === 'MBA' ? 'MBA' : 'B.Tech' });
      }
    }

    const insChallan = db.prepare(`INSERT INTO challans
      (challan_no, student_id, fee_type, amount, paid_amount, status, due_date, paid_on, mode, receipt_no)
      VALUES (?,?,?,?,?,?,?,?,?,?)`);
    let chSeq = 0;
    for (const s of students) {
      const amount = feeAmount[s.deptCode];
      const r = rand();
      let status = 'paid', paid = amount, paidOn = daysAgo(int(3, 90)), mode = pick(['UPI', 'Net Banking', 'Card', 'Cash']);
      if (r > 0.82) { status = 'pending'; paid = 0; paidOn = null; mode = null; }
      else if (r > 0.7) { status = 'partial'; paid = Math.round(amount * 0.5); paidOn = daysAgo(int(5, 60)); mode = 'UPI'; }
      const no = `CH-2026-${String(++chSeq).padStart(4, '0')}`;
      insChallan.run(no, s.id, `Semester ${s.semester} Tuition Fee`, amount, paid, status,
        daysAgo(-int(5, 55)), paidOn, mode, status === 'pending' ? null : `RCP-${no}`);
      if (rand() > 0.6) {
        const paid2 = rand() > 0.25;
        insChallan.run(`CH-2026-${String(++chSeq).padStart(4, '0')}`, s.id, 'Examination Fee', 2500,
          paid2 ? 2500 : 0, paid2 ? 'paid' : 'pending', daysAgo(-int(5, 30)),
          paid2 ? daysAgo(int(2, 45)) : null, paid2 ? pick(['UPI', 'Card']) : null, paid2 ? `RCP-CH-2026-${String(chSeq).padStart(4, '0')}` : null);
      }
    }

    const insAtt = db.prepare('INSERT OR IGNORE INTO attendance (student_id, subject, date, status, marked_by) VALUES (?,?,?,?,1)');
    const weekdays = [];
    for (let d = 1; weekdays.length < 10; d++) {
      const dt = new Date(today); dt.setDate(dt.getDate() - d);
      if (dt.getDay() !== 0) weekdays.push(iso(dt));
    }
    for (const s of students) {
      const key = `${s.deptCode}-${s.semester}`;
      const subjects = subjectsByDeptSem[key] || [];
      for (const subj of subjects) {
        for (const day of weekdays) {
          const r = rand();
          insAtt.run(s.id, subj, day, r > 0.1 ? 'present' : (r > 0.04 ? 'late' : 'absent'));
        }
      }
    }

    const insFaculty = db.prepare('INSERT INTO faculty (name, email, phone, department_id, designation, qualification, join_date) VALUES (?,?,?,?,?,?,?)');
    const staff = [
      ['Dr. Rahul Joshi', 'CS', 'Professor & Head', 'Ph.D. Computer Science', '2014-06-12'],
      ['Dr. Meera Deshpande', 'CS', 'Associate Professor', 'Ph.D. Data Science', '2016-07-01'],
      ['Prof. Sameer Patil', 'CS', 'Assistant Professor', 'M.Tech CSE', '2019-08-05'],
      ['Dr. Kavita Nair', 'IT', 'Associate Professor', 'Ph.D. Information Systems', '2015-01-19'],
      ['Prof. Nilesh Pawar', 'ENTC', 'Assistant Professor', 'M.E. Electronics', '2018-06-25'],
      ['Dr. Sunita Kulkarni', 'MECH', 'Professor', 'Ph.D. Thermal Engineering', '2012-07-09'],
      ['Prof. Amit Shinde', 'CIVIL', 'Assistant Professor', 'M.E. Structural Engineering', '2020-01-06'],
      ['Dr. Ritu Sharma', 'MBA', 'Professor', 'Ph.D. Management', '2013-08-16']
    ];
    const deptIdByCode = Object.fromEntries(deptRows.map(d => [d.code, d.id]));
    for (const [name, code, desig, qual, join] of staff) {
      insFaculty.run(name, `${name.split(' ').slice(-1)[0].toLowerCase()}@faculty.demo.edu`, `96${int(10000000, 99999999)}`, deptIdByCode[code], desig, qual, join);
    }

    const insTt = db.prepare('INSERT INTO timetable (department_id, semester, day_of_week, period, subject, faculty_name, room) VALUES (?,?,?,?,?,?,?)');
    const facultyByDept = { CS: ['Dr. Rahul Joshi', 'Dr. Meera Deshpande', 'Prof. Sameer Patil'], IT: ['Dr. Kavita Nair'], ENTC: ['Prof. Nilesh Pawar'], MECH: ['Dr. Sunita Kulkarni'], CIVIL: ['Prof. Amit Shinde'], MBA: ['Dr. Ritu Sharma'] };
    const rooms = ['A-101', 'A-204', 'B-105', 'B-210', 'C-301', 'Lab-2'];
    for (const d of deptRows) {
      for (const sem of [1, 3, 5]) {
        const subs = subjectsByDeptSem[`${d.code}-${sem}`];
        if (!subs) continue;
        for (let day = 1; day <= 6; day++) {
          for (let p = 1; p <= 6; p++) {
            if (day === 6 && p > 3) continue;
            insTt.run(d.id, sem, day, p, subs[(day + p) % subs.length], pick(facultyByDept[d.code] || ['Dr. Rahul Joshi']), pick(rooms));
          }
        }
      }
    }

    const insExam = db.prepare('INSERT INTO exams (name, department_id, semester, subject, max_marks, exam_date, start_time, duration_min, published) VALUES (?,?,?,?,?,?,?,?,?)');
    const exams = [];
    for (const d of deptRows) {
      for (const sem of [1, 3, 5]) {
        const subs = subjectsByDeptSem[`${d.code}-${sem}`];
        if (!subs) continue;
        for (const subj of subs) {
          const mid = insExam.run('Mid-Semester Exam', d.id, sem, subj, 50, daysAgo(int(10, 25)), '10:00', 90, d.code === 'CS' && sem === 3 ? 1 : 0).lastInsertRowid;
          exams.push({ id: mid, deptId: d.id, deptCode: d.code, sem, max: 50 });
          const end = insExam.run('End-Semester Exam', d.id, sem, subj, 100, daysAgo(-int(15, 40)), '10:00', 180, 0).lastInsertRowid;
          exams.push({ id: end, deptId: d.id, deptCode: d.code, sem, max: 100 });
        }
      }
    }

    const insMark = db.prepare('INSERT OR IGNORE INTO marks (exam_id, student_id, marks_obtained) VALUES (?,?,?)');
    for (const e of exams) {
      for (const s of students) {
        if (s.deptId === e.deptId && s.semester === e.sem) {
          insMark.run(e.id, s.id, Math.round((e.max * (0.45 + rand() * 0.5)) * 2) / 2);
        }
      }
    }

    const insNotice = db.prepare('INSERT INTO notices (title, body, category, audience, pinned, created_by, created_at) VALUES (?,?,?,?,?,?,?)');
    const noticeData = [
      ['Semester fee deadline extended to 30 November', 'The last date for payment of Semester II tuition fee has been extended to 30 November 2026. Students with pending dues must clear fees through the ERP portal to avoid late fees.', 'Fees', 'students', 1],
      ['MahaDBT scholarship applications open for 2026-27', 'Eligible students (SC/ST/VJNT/EBC/Minority) can now apply for state scholarships through MahaDBT. Submit your application number to the scholarship cell before 15 December. Document verification will be done at the institute level.', 'Scholarship', 'students', 1],
      ['Mid-semester examination timetable published', 'The mid-semester examination schedule for all departments is now available under the Examinations module. Hall tickets will be issued 3 days before the exam.', 'Examinations', 'all', 0],
      ['Faculty development programme on OBE & NAAC', 'A two-day FDP on Outcome-Based Education and NAAC criterion mapping will be held on 12-13 November. All HODs and faculty members are requested to attend.', 'Academic', 'faculty', 0],
      ['Annual sports meet registrations', 'Registrations for the annual sports meet are open at the sports office until 20 November. Team events include cricket, volleyball, kabaddi and athletics.', 'Events', 'students', 0],
      ['Campus placement drive - TCS, Infosys, Persistent', 'Final-year students can register for the combined campus drive. Pre-placement talks start 5 November in the main auditorium. Carry 3 copies of your resume.', 'Placement', 'students', 0]
    ];
    for (const n of noticeData) {
      insNotice.run(n[0], n[1], n[2], n[3], n[4], 1, daysAgo(int(1, 20)));
    }

    const insAdm = db.prepare('INSERT INTO admissions (application_no, name, email, phone, gender, department_id, program, category, stage, score, notes, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
    const stages = ['enquiry', 'applied', 'applied', 'verified', 'verified', 'approved', 'approved', 'enrolled', 'applied', 'verified', 'approved', 'enrolled', 'rejected', 'enquiry'];
    const cats = ['OPEN', 'OBC', 'SC', 'ST', 'EWS', 'VJNT'];
    for (let i = 0; i < 14; i++) {
      const nm = `${pick(first)} ${pick(last)}`;
      const d = deptRows[int(0, deptRows.length - 1)];
      insAdm.run(`APP-2026-${String(i + 1).padStart(4, '0')}`, nm, `${nm.split(' ')[0].toLowerCase()}.app@mail.com`,
        `98${int(10000000, 99999999)}`, pick(['Male', 'Female']), d.id, d.code === 'MBA' ? 'MBA' : 'B.Tech',
        pick(cats), stages[i], Math.round((55 + rand() * 40) * 10) / 10,
        i < 3 ? 'Walk-in enquiry at admission desk' : 'Online application received', daysAgo(int(1, 40)));
    }

    const schemes = [
      'Post Matric Scholarship (SC)',
      'Post Matric Scholarship (ST)',
      'Rajarshi Chhatrapati Shahu Maharaj Shikshan Shulkh Shishyavrutti (EBC)',
      'Merit-cum-Means Scholarship',
      'Minority Scholarship',
      'VJNT Scholarship'
    ];
    const docs = ['Aadhaar Card', 'Income Certificate', 'Caste Certificate', 'Domicile Certificate', 'Last Marksheet', 'Admission Receipt', 'Bank Passbook'];
    const schStages = ['draft', 'draft', 'institute_verified', 'institute_verified', 'submitted', 'submitted', 'approved', 'approved', 'disbursed', 'disbursed', 'rejected', 'draft'];
    const insSch = db.prepare('INSERT INTO scholarships (student_id, scheme, academic_year, mahabdt_app_no, stage, amount, status_note, verified_by, verified_at, disbursed_on) VALUES (?,?,?,?,?,?,?,?,?,?)');
    const insDoc = db.prepare('INSERT OR IGNORE INTO scholarship_docs (scholarship_id, doc_type, status) VALUES (?,?,?)');
    const insEvent = db.prepare('INSERT INTO scholarship_events (scholarship_id, action, detail, actor, created_at) VALUES (?,?,?,?,?)');
    for (let i = 0; i < 12; i++) {
      const s = students[(i * 4) % students.length];
      const stage = schStages[i];
      const amount = pick([25000, 35000, 45000, 50000, 60000]);
      const appNo = stage === 'draft' ? null : `MHT2026${int(100000, 999999)}`;
      const id = insSch.run(s.id, pick(schemes), '2026-27', appNo, stage, amount,
        stage === 'rejected' ? 'Income certificate mismatch - resubmission required' : '',
        stage === 'draft' ? null : 1, stage === 'draft' ? null : daysAgo(int(3, 30)),
        stage === 'disbursed' ? daysAgo(int(1, 15)) : null).lastInsertRowid;
      for (const doc of docs) {
        let st = 'pending';
        if (stage === 'draft') st = rand() > 0.5 ? 'uploaded' : 'pending';
        else if (stage === 'institute_verified' || stage === 'submitted') st = 'verified';
        else if (stage === 'approved' || stage === 'disbursed') st = 'verified';
        else if (stage === 'rejected') st = rand() > 0.4 ? 'verified' : 'uploaded';
        insDoc.run(id, doc, st);
      }
      insEvent.run(id, 'Application created', `Scheme: ${pick(schemes)}`, 'system', daysAgo(int(20, 45)));
      if (stage !== 'draft') insEvent.run(id, 'Documents verified at institute', 'All mandatory documents checked by scholarship cell', 'Priya Kulkarni', daysAgo(int(10, 25)));
      if (['submitted', 'approved', 'disbursed', 'rejected'].includes(stage)) insEvent.run(id, 'Forwarded to MahaDBT', `Application ${appNo} submitted to MahaDBT portal (sandbox)`, 'Priya Kulkarni', daysAgo(int(5, 20)));
      if (stage === 'approved' || stage === 'disbursed') insEvent.run(id, 'Approved by MahaDBT', 'Sanction order received. Amount credited to institute account.', 'MahaDBT', daysAgo(int(2, 12)));
      if (stage === 'disbursed') insEvent.run(id, 'Disbursed to student', 'Amount transferred to student bank account.', 'Accounts', daysAgo(int(1, 8)));
      if (stage === 'rejected') insEvent.run(id, 'Rejected by MahaDBT', 'Income certificate mismatch - resubmission required', 'MahaDBT', daysAgo(int(2, 10)));
    }

    const insSetting = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)');
    insSetting.run('institute_name', 'Vidyanagar Institute of Technology');
    insSetting.run('institute_code', 'INST-2026-0142');
    insSetting.run('mahabdt_institute_code', 'MH-INST-0142');
    insSetting.run('mahabdt_user_id', 'vidyanagar.scholarship');
    insSetting.run('mahabdt_api_base', 'https://mahadbt.maharashtra.gov.in/api/v1');
    insSetting.run('mahabdt_mode', 'sandbox');

    db.prepare(`INSERT INTO audit_log (actor_id, actor_name, action, entity, detail, created_at)
      VALUES (1, 'Dr. Anil Deshmukh', 'seed', 'system', 'Demo dataset initialised', datetime('now'))`).run();
  });

  tx();
}

seed();

module.exports = { db };
