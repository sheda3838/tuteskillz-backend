import { Router } from "express";
import db from "../config/db.js";

const profileRouter = Router();

profileRouter.get("/tutor/:id", (req, resp) => {
  const tutorId = req.params.id;

  const query = `
    SELECT 
  u.userId, u.fullName, u.email, u.phone, u.DOB, u.createdDate, 
  u.profilePhoto, u.role, 
  a.street, a.city, a.province, a.postalCode,
  t.school, t.university, t.bio, t.olTranscript, t.alTranscript,
  bd.bankName, bd.branch, bd.accountNumber, bd.beneficiaryName,
  s.subjectId, s.subjectName, ts.grade AS tutorGrade, ts.teachingMedium,
  er.examType, er.grade AS examGrade, er.subjectId AS examSubjectId, erSub.subjectName AS examSubjectName,
  ta.startTime, ta.endTime, ta.dayOfWeek,
  v.verificationId, v.status AS verificationStatus, v.verifiedByAdminId,
  adminUser.fullName AS adminFullName, adminUser.email AS adminEmail
FROM users u
LEFT JOIN address a ON a.addressId = u.addressId
LEFT JOIN tutor t ON t.userId = u.userId
LEFT JOIN tutorSubject ts ON ts.tutorId = t.userId
LEFT JOIN subject s ON s.subjectId = ts.subjectId
LEFT JOIN tutorAvailability ta ON ta.tutorId = t.userId
LEFT JOIN bankDetails bd ON bd.tutorId = t.userId
LEFT JOIN examResults er ON er.tutorId = t.userId
LEFT JOIN subject erSub ON er.subjectId = erSub.subjectId
LEFT JOIN verification v ON v.verificationId = t.verificationId
LEFT JOIN users adminUser ON adminUser.userId = v.verifiedByAdminId
WHERE u.userId = ?

  `;

  db.query(query, [tutorId], (err, rows) => {
    if (err)
      return resp.status(500).json({ success: false, message: err.message });
    if (rows.length === 0)
      return resp
        .status(404)
        .json({ success: false, message: "Tutor not found" });

    const userRow = rows[0];

    // Collect subjects
    const subjects = [];
    rows.forEach((r) => {
      if (r.subjectId && !subjects.some((s) => s.subjectId === r.subjectId)) {
        subjects.push({
          subjectId: r.subjectId,
          subjectName: r.subjectName,
          grade: r.tutorGrade,
          teachingMedium: r.teachingMedium,
        });
      }
    });

    // Collect availability
    // Collect availability (fixed)
    const availabilityMap = new Set();
    const availability = [];

    rows.forEach((r) => {
      if (r.dayOfWeek && r.startTime) {
        const key = `${r.dayOfWeek}-${r.startTime}-${r.endTime}`;

        if (!availabilityMap.has(key)) {
          availabilityMap.add(key);
          availability.push({
            day: r.dayOfWeek,
            startTime: r.startTime,
            endTime: r.endTime,
          });
        }
      }
    });

    // Collect exam results
    const examResults = { OL: [], AL: [] };
    rows.forEach((r) => {
      if (r.examType) {
        const target = r.examType === "OL" ? examResults.OL : examResults.AL;
        target.push({
          subjectId: r.examSubjectId,
          subjectName: r.examSubjectName,
          grade: r.examGrade,
        });
      }
    });

    // Collect bank accounts
const bankAccountsMap = new Set();
const bankAccounts = [];

rows.forEach((r) => {
  if (r.accountNumber) {
    const key = r.accountNumber;
    if (!bankAccountsMap.has(key)) {
      bankAccountsMap.add(key);
      bankAccounts.push({
        bankName: r.bankName,
        branch: r.branch,
        accountNumber: r.accountNumber,
        beneficiaryName: r.beneficiaryName,
        isPrimary: r.isPrimary === 1, // if you store isPrimary in DB
      });
    }
  }
});


    const profile = {
  userId: userRow.userId,
  fullName: userRow.fullName,
  email: userRow.email,
  phone: userRow.phone,
  DOB: userRow.DOB,
  createdDate: userRow.createdDate,
  profilePhoto: userRow.profilePhoto,
  bio: userRow.bio,
  address: {
    street: userRow.street,
    city: userRow.city,
    province: userRow.province,
    postalcode: userRow.postalCode,
  },
  school: userRow.school,
  university: userRow.university,
  subjects,
  availability,
  examResults,
  bankDetails: bankAccounts.length > 0 ? bankAccounts : [],
  verification: {
    id: userRow.verificationId,
    status: userRow.verificationStatus || "Pending",
    admin: userRow.verifiedByAdminId
      ? {
          userId: userRow.verifiedByAdminId,
          fullName: userRow.adminFullName,
          email: userRow.adminEmail,
        }
      : null,
  },
  olTranscript: userRow.olTranscript,
  alTranscript: userRow.alTranscript,
};


    return resp.status(200).json({ success: true, profile });
  });
});

profileRouter.get("/student/:id", (req, res) => {
  const studentId = req.params.id;

  const query = `
    SELECT 
      u.userId, u.fullName, u.email, u.phone, u.DOB, u.createdDate, 
      u.profilePhoto, u.role,
      a.street, a.city, a.province, a.postalCode,
      s.grade AS studentGrade,
      g.guardianId, g.fullName AS guardianName, g.phone AS guardianPhone, g.email AS guardianEmail,
      se.sessionId, se.date AS sessionDate, se.startTime AS sessionStartTime, se.duration AS sessionDuration,
      se.sessionStatus
    FROM users u
    LEFT JOIN student s ON s.userId = u.userId
    LEFT JOIN address a ON a.addressId = u.addressId
    LEFT JOIN guardian g ON g.guardianId = s.guardianId
    LEFT JOIN session se ON se.studentId = u.userId
    WHERE u.userId = ?
  `;

  db.query(query, [studentId], (err, rows) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    if (rows.length === 0) return res.status(404).json({ success: false, message: "Student not found" });

    const userRow = rows[0];

    // Collect sessions
    const sessions = [];
    rows.forEach((r) => {
      if (r.sessionId) {
        sessions.push({
          sessionId: r.sessionId,
          date: r.sessionDate,
          startTime: r.sessionStartTime,
          duration: r.sessionDuration,
          sessionStatus: r.sessionStatus
        });
      }
    });

    const profile = {
      userId: userRow.userId,
      fullName: userRow.fullName,
      email: userRow.email,
      phone: userRow.phone,
      DOB: userRow.DOB,
      createdDate: userRow.createdDate,
      profilePhoto: userRow.profilePhoto,
      role: userRow.role,
      grade: userRow.studentGrade,
      address: {
        street: userRow.street,
        city: userRow.city,
        province: userRow.province,
        postalCode: userRow.postalCode
      },
      guardian: {
        guardianId: userRow.guardianId,
        fullName: userRow.guardianName,
        phone: userRow.guardianPhone,
        email: userRow.guardianEmail
      },
      sessions
    };

    res.status(200).json({ success: true, profile });
  });
});


export default profileRouter;
