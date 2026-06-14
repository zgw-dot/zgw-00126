import type { Request, Response, NextFunction } from 'express'
import type { UserRole, AuthToken } from './types.js'

export function decodeToken(token: string): AuthToken | null {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8')
    const parts = decoded.split(':')
    if (parts.length !== 3) return null
    const userId = parseInt(parts[0], 10)
    const role = parts[1] as UserRole
    const timestamp = parseInt(parts[2], 10)
    if (isNaN(userId) || isNaN(timestamp)) return null
    if (!['student', 'teacher', 'admin'].includes(role)) return null
    return { userId, role, timestamp }
  } catch {
    return null
  }
}

export function generateToken(userId: number, role: UserRole): string {
  const payload = `${userId}:${role}:${Date.now()}`
  return Buffer.from(payload).toString('base64')
}

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: '未提供认证令牌' })
    return
  }

  const token = authHeader.substring(7)
  const decoded = decodeToken(token)
  if (!decoded) {
    res.status(401).json({ success: false, error: '无效的认证令牌' })
    return
  }

  req.userId = decoded.userId
  req.userRole = decoded.role
  next()
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.userRole || !roles.includes(req.userRole)) {
      res.status(403).json({ success: false, error: '权限不足' })
      return
    }
    next()
  }
}
