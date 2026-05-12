const db = require('../db');

function getStudentGroups(studentId) {
  return db.query(`
    SELECT g.id, g.name, g.description
    FROM groups g
    INNER JOIN group_students gs ON gs.group_id = g.id
    WHERE gs.student_id = ?
  `, [studentId]);
}

function getAccessibleCategories(studentId) {
  const rows = db.query(`
    SELECT DISTINCT gcp.category_id
    FROM group_students gs
    INNER JOIN group_category_permissions gcp ON gcp.group_id = gs.group_id
    WHERE gs.student_id = ?
  `, [studentId]);
  return rows.map(r => r.category_id);
}

function canAccessLecture(studentId, lecture) {
  if (lecture.is_public === 1) return true;
  if (!studentId) return false;
  const accessibleCategories = getAccessibleCategories(studentId);
  return accessibleCategories.includes(lecture.category_id);
}

function filterAccessibleLectures(studentId, lectures) {
  if (!studentId) return lectures.filter(l => l.is_public === 1);
  const accessibleCategories = getAccessibleCategories(studentId);
  return lectures.filter(l =>
    l.is_public === 1 || accessibleCategories.includes(l.category_id)
  );
}

module.exports = { getStudentGroups, getAccessibleCategories, canAccessLecture, filterAccessibleLectures };
