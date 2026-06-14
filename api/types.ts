export type UserRole = 'student' | 'teacher' | 'admin'

export interface User {
  id: number
  username: string
  password: string
  name: string
  role: UserRole
}

export interface UserPublic {
  id: number
  username: string
  name: string
  role: UserRole
}

export interface Course {
  id: number
  name: string
  code: string
  semester: string
  teacherId: number
  teacherName?: string
}

export interface Grade {
  id: number
  studentId: number
  courseId: number
  score: number
  studentName?: string
  courseName?: string
  semester?: string
}

export type QualificationSource = 'auto' | 'manual_override'
export type QualificationStatus = 'active' | 'cancelled' | 'overridden'

export interface Qualification {
  id: number
  studentId: number
  courseId: number
  qualified: boolean
  source: QualificationSource
  status: QualificationStatus
  reason?: string
  overriddenBy?: number
  createdAt: string
  updatedAt: string
  studentName?: string
  courseName?: string
}

export type ApplicationStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn'

export interface Application {
  id: number
  studentId: number
  courseId: number
  qualificationId: number
  status: ApplicationStatus
  rejectReason?: string
  reviewedBy?: number
  reviewedAt?: string
  createdAt: string
  studentName?: string
  courseName?: string
}

export interface ExamRoom {
  id: number
  name: string
  capacity: number
  location: string
  usedSeats?: number
}

export type ArrangementStatus = 'scheduled' | 'cancelled'

export interface Arrangement {
  id: number
  applicationId: number
  studentId: number
  courseId: number
  examRoomId: number
  examDate: string
  startTime: string
  endTime: string
  status: ArrangementStatus
  cancelReason?: string
  createdAt: string
  studentName?: string
  courseName?: string
  examRoomName?: string
}

export interface ThresholdConfig {
  id: number
  score: number
  updatedBy: number
  updatedAt: string
}

export interface AuditLog {
  id: number
  action: string
  entityType: string
  entityId: number
  operatorId: number
  detail?: string
  createdAt: string
}

export interface AuthToken {
  userId: number
  role: UserRole
  timestamp: number
}

export interface ApiSuccess<T = unknown> {
  success: true
  data: T
}

export interface ApiError {
  success: false
  error: string
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError

declare global {
  namespace Express {
    interface Request {
      userId?: number
      userRole?: UserRole
    }
  }
}
