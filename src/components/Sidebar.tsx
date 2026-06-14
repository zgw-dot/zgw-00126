import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Award,
  FileText,
  Calendar,
  BookOpen,
  GraduationCap,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Upload,
  DoorOpen,
  ClipboardList,
  Download,
  Sliders,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useState } from 'react';

interface NavItem {
  label: string;
  icon: React.ReactNode;
  path: string;
}

const studentNav: NavItem[] = [
  { label: '仪表盘', icon: <LayoutDashboard size={20} />, path: '/student/dashboard' },
  { label: '我的资格', icon: <Award size={20} />, path: '/student/qualifications' },
  { label: '补考申请', icon: <FileText size={20} />, path: '/student/applications' },
  { label: '考试安排', icon: <Calendar size={20} />, path: '/student/schedule' },
];

const teacherNav: NavItem[] = [
  { label: '仪表盘', icon: <LayoutDashboard size={20} />, path: '/teacher/dashboard' },
  { label: '我的课程', icon: <BookOpen size={20} />, path: '/teacher/courses' },
  { label: '考试安排', icon: <Calendar size={20} />, path: '/teacher/schedule' },
];

const adminNav: NavItem[] = [
  { label: '仪表盘', icon: <LayoutDashboard size={20} />, path: '/admin/dashboard' },
  { label: '成绩管理', icon: <Upload size={20} />, path: '/admin/grades' },
  { label: '资格管理', icon: <Award size={20} />, path: '/admin/qualifications' },
  { label: '申请审核', icon: <ClipboardList size={20} />, path: '/admin/applications' },
  { label: '考场管理', icon: <DoorOpen size={20} />, path: '/admin/exam-rooms' },
  { label: '考试编排', icon: <Settings size={20} />, path: '/admin/arrangements' },
  { label: '数据导出', icon: <Download size={20} />, path: '/admin/export' },
  { label: '阈值设置', icon: <Sliders size={20} />, path: '/admin/threshold' },
];

const navMap: Record<string, NavItem[]> = {
  student: studentNav,
  teacher: teacherNav,
  admin: adminNav,
};

const roleLabels: Record<string, string> = {
  student: '学生',
  teacher: '教师',
  admin: '教务',
};

export default function Sidebar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const navItems = user ? navMap[user.role] || [] : [];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside
      className={`${
        collapsed ? 'w-16' : 'w-60'
      } bg-slate-800 text-white flex flex-col transition-all duration-300 flex-shrink-0`}
    >
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <GraduationCap size={24} className="text-amber-400" />
            <span className="font-bold text-sm">补考管理系统</span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1 rounded hover:bg-slate-700 transition-colors"
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {user && !collapsed && (
        <div className="px-4 py-3 border-b border-slate-700">
          <p className="text-sm font-medium truncate">{user.name}</p>
          <span className="text-xs text-amber-400">{roleLabels[user.role]}</span>
        </div>
      )}

      <nav className="flex-1 py-2 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg transition-colors text-sm ${
                isActive
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'text-slate-300 hover:bg-slate-700 hover:text-white'
              }`
            }
          >
            {item.icon}
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="p-2 border-t border-slate-700">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-slate-300 hover:bg-slate-700 hover:text-white transition-colors text-sm w-[calc(100%-1rem)]"
        >
          <LogOut size={20} />
          {!collapsed && <span>退出登录</span>}
        </button>
      </div>
    </aside>
  );
}
