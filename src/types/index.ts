export interface User {
  id: number;
  username: string;
  name: string;
  role: 'student' | 'teacher' | 'admin';
}

export interface Grade {
  id: number;
  studentId: number;
  courseId: number;
  courseName: string;
  studentName: string;
  score: number;
  semester: string;
}

export interface Qualification {
  id: number;
  studentId: number;
  studentName: string;
  courseId: number;
  courseName: string;
  qualified: boolean;
  source: 'auto' | 'manual_override';
  status: 'active' | 'cancelled' | 'overridden';
  reason?: string;
  overriddenBy?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Application {
  id: number;
  studentId: number;
  studentName: string;
  courseId: number;
  courseName: string;
  qualificationId: number;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  rejectReason?: string;
  reviewedBy?: number;
  reviewedAt?: string;
  createdAt: string;
}

export interface ExamRoom {
  id: number;
  name: string;
  capacity: number;
  location: string;
  usedSeats: number;
}

export interface Arrangement {
  id: number;
  applicationId: number;
  studentId: number;
  studentName: string;
  courseId: number;
  courseName: string;
  examRoomId: number;
  examRoomName: string;
  examDate: string;
  startTime: string;
  endTime: string;
  status: 'scheduled' | 'cancelled';
  cancelReason?: string;
  createdAt: string;
}

export interface ThresholdConfig {
  id: number;
  score: number;
  updatedBy: number;
  updatedAt: string;
}

export interface ThresholdHistory {
  id: number;
  score: number;
  updatedBy: number;
  updatedAt: string;
}

export type OperationType = 'override_qualification' | 'approve_application' | 'reject_application' | 'create_arrangement' | 'update_threshold' | 'import_grades';
export type TargetType = 'qualification' | 'application' | 'arrangement' | 'threshold' | 'grade';

export interface OperationSnapshot {
  id: number;
  operationType: OperationType;
  targetType: TargetType;
  targetId: number;
  snapshotData: Record<string, unknown>;
  operatorId: number;
  operatorName?: string;
  reverted: boolean;
  revertedAt?: string;
  createdAt: string;
}

export type NotificationType = 'application_approved' | 'application_rejected' | 'exam_scheduled' | 'qualification_cancelled';

export interface Notification {
  id: number;
  userId: number;
  title: string;
  content: string;
  type: NotificationType;
  isRead: boolean;
  relatedEntityType?: string;
  relatedEntityId?: number;
  createdAt: string;
}

export interface NotificationConfig {
  eventType: NotificationType;
  enabled: boolean;
}

export type BatchResultStatus = 'success' | 'skipped' | 'failed';

export interface BatchResultItem {
  id: number;
  status: BatchResultStatus;
  reason?: string;
}

export interface BatchOperationResult {
  total: number;
  success: number;
  skipped: number;
  failed: number;
  details: BatchResultItem[];
  arrangements?: Arrangement[];
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
