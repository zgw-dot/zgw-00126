import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import Layout from '@/components/Layout';
import Login from '@/pages/Login';
import StudentDashboard from '@/pages/student/Dashboard';
import StudentQualifications from '@/pages/student/Qualifications';
import StudentApplications from '@/pages/student/Applications';
import StudentSchedule from '@/pages/student/Schedule';
import TeacherDashboard from '@/pages/teacher/Dashboard';
import TeacherCourses from '@/pages/teacher/Courses';
import TeacherSchedule from '@/pages/teacher/Schedule';
import AdminDashboard from '@/pages/admin/Dashboard';
import AdminGrades from '@/pages/admin/Grades';
import AdminQualifications from '@/pages/admin/Qualifications';
import AdminApplications from '@/pages/admin/Applications';
import AdminExamRooms from '@/pages/admin/ExamRooms';
import AdminArrangements from '@/pages/admin/Arrangements';
import AdminExport from '@/pages/admin/Export';
import AdminThreshold from '@/pages/admin/Threshold';

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles: string[] }) {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;
  if (!allowedRoles.includes(user.role)) return <Navigate to={`/${user.role}/dashboard`} replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  const { user } = useAuthStore();

  return (
    <Router>
      <Routes>
        <Route path="/login" element={user ? <Navigate to={`/${user.role}/dashboard`} replace /> : <Login />} />

        <Route path="/student/dashboard" element={<ProtectedRoute allowedRoles={['student']}><StudentDashboard /></ProtectedRoute>} />
        <Route path="/student/qualifications" element={<ProtectedRoute allowedRoles={['student']}><StudentQualifications /></ProtectedRoute>} />
        <Route path="/student/applications" element={<ProtectedRoute allowedRoles={['student']}><StudentApplications /></ProtectedRoute>} />
        <Route path="/student/schedule" element={<ProtectedRoute allowedRoles={['student']}><StudentSchedule /></ProtectedRoute>} />

        <Route path="/teacher/dashboard" element={<ProtectedRoute allowedRoles={['teacher']}><TeacherDashboard /></ProtectedRoute>} />
        <Route path="/teacher/courses" element={<ProtectedRoute allowedRoles={['teacher']}><TeacherCourses /></ProtectedRoute>} />
        <Route path="/teacher/schedule" element={<ProtectedRoute allowedRoles={['teacher']}><TeacherSchedule /></ProtectedRoute>} />

        <Route path="/admin/dashboard" element={<ProtectedRoute allowedRoles={['admin']}><AdminDashboard /></ProtectedRoute>} />
        <Route path="/admin/grades" element={<ProtectedRoute allowedRoles={['admin']}><AdminGrades /></ProtectedRoute>} />
        <Route path="/admin/qualifications" element={<ProtectedRoute allowedRoles={['admin']}><AdminQualifications /></ProtectedRoute>} />
        <Route path="/admin/applications" element={<ProtectedRoute allowedRoles={['admin']}><AdminApplications /></ProtectedRoute>} />
        <Route path="/admin/exam-rooms" element={<ProtectedRoute allowedRoles={['admin']}><AdminExamRooms /></ProtectedRoute>} />
        <Route path="/admin/arrangements" element={<ProtectedRoute allowedRoles={['admin']}><AdminArrangements /></ProtectedRoute>} />
        <Route path="/admin/export" element={<ProtectedRoute allowedRoles={['admin']}><AdminExport /></ProtectedRoute>} />
        <Route path="/admin/threshold" element={<ProtectedRoute allowedRoles={['admin']}><AdminThreshold /></ProtectedRoute>} />

        <Route path="*" element={<Navigate to={user ? `/${user.role}/dashboard` : '/login'} replace />} />
      </Routes>
    </Router>
  );
}
