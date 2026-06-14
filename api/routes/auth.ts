import { Router, type Request, type Response } from 'express'
import { queryOne } from '../database.js'
import { generateToken } from '../middleware.js'
import type { UserPublic } from '../types.js'

const router = Router()

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password, role } = req.body
    if (!username || !password || !role) {
      res.status(400).json({ success: false, error: '缺少用户名、密码或角色' })
      return
    }

    const user = queryOne<UserPublic & { password: string }>(
      'SELECT id, username, password, name, role FROM users WHERE username = ? AND role = ?',
      [username, role],
    )

    if (!user || user.password !== password) {
      res.status(401).json({ success: false, error: '用户名、密码或角色不匹配' })
      return
    }

    const token = generateToken(user.id, user.role as 'student' | 'teacher' | 'admin')
    const { password: _, ...userPublic } = user

    res.json({
      success: true,
      data: { token, user: userPublic },
    })
  } catch (error) {
    res.status(500).json({ success: false, error: '登录失败' })
  }
})

export default router
