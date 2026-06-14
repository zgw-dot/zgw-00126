import fs from 'fs'

const BASE_URL = 'http://localhost:3001/api'

async function request(endpoint, options = {}) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  const data = await res.json()
  return { status: res.status, data }
}

async function login(username, password, role) {
  const res = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password, role }),
  })
  if (!res.data.success) throw new Error(`登录失败: ${res.data.error}`)
  return res.data.data.token
}

let passed = 0
let failed = 0

function assert(condition, message) {
  if (condition) {
    console.log(`   ✓ ${message}`)
    passed++
  } else {
    console.log(`   ✗ ${message}`)
    failed++
  }
}

async function test() {
  console.log('=== 撤销功能回归测试 ===\n')

  console.log('准备工作：登录 admin...')
  const adminToken = await login('admin', 'admin123', 'admin')
  console.log('   ✓ admin 登录成功\n')

  console.log('准备工作：导入成绩数据以确保有资格记录...')
  try {
    const csvContent = fs.readFileSync('sample-grades.csv', 'utf-8')
    await request('/grades/import', {
      method: 'POST',
      body: JSON.stringify({ csv: csvContent }),
      headers: { Authorization: `Bearer ${adminToken}` },
    })
  } catch (e) {
    // ignore if already imported
  }

  const qualsRes = await request('/qualifications?status=active', {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  const activeQuals = qualsRes.data.data
  console.log(`   有效资格记录: ${activeQuals.length} 条`)

  const notQualified = activeQuals.find(
    (q) => q.qualified === 0 || q.qualified === false,
  )
  const qualified = activeQuals.find(
    (q) => q.qualified === 1 || q.qualified === true,
  )
  console.log(`   不合格资格: ${notQualified ? '有' : '无'}`)
  console.log(`   有补考资格: ${qualified ? '有' : '无'}\n`)

  if (!notQualified || !qualified) {
    console.log('⚠ 测试数据不足，无法进行完整测试')
    process.exit(1)
  }

  console.log('========== 测试路径 1：覆盖资格 → 撤销 → 资格恢复原状 ==========')
  {
    const origQual = notQualified
    console.log(`   原资格: ID=${origQual.id}, status=${origQual.status}, qualified=${origQual.qualified}, source=${origQual.source}`)

    const overrideRes = await request(`/qualifications/${origQual.id}/override`, {
      method: 'POST',
      body: JSON.stringify({ qualified: true, reason: '测试撤销-人工授予' }),
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    assert(overrideRes.status === 200, '覆盖资格成功')

    const newQual = overrideRes.data.data
    assert(newQual.status === 'active', '新资格状态为 active')
    assert(newQual.source === 'manual_override', '新资格来源为 manual_override')

    const opsRes = await request('/operations?limit=5', {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    const opsList = opsRes.data.data.items || opsRes.data.data
    const overrideOp = opsList.find((o) => o.operationType === 'override_qualification' && o.reverted === false && o.reverted === 0 ? false : !o.reverted)
    const overrideOp2 = opsList.find((o) => o.operationType === 'override_qualification')
    assert(overrideOp2 !== undefined, '操作快照已创建')

    const origAfterRes = await request(`/qualifications/${origQual.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    assert(origAfterRes.data.data?.status === 'cancelled', '原资格记录已取消')

    console.log('   执行撤销操作...')
    const revertRes = await request(`/operations/${overrideOp2.id}/revert`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    assert(revertRes.status === 200, '撤销请求成功')

    const origFinalRes = await request(`/qualifications/${origQual.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    const finalStatus = origFinalRes.data.data?.status
    const finalSource = origFinalRes.data.data?.source
    assert(finalStatus === origQual.status, `原资格状态恢复 (${finalStatus} === ${origQual.status})`)
    assert(finalSource === origQual.source, `原资格来源恢复 (${finalSource} === ${origQual.source})`)

    const opAfterRes = await request(`/operations/${overrideOp2.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    assert(opAfterRes.data.data?.reverted === true || opAfterRes.data.data?.reverted === 1, '操作标记为已撤销')

    const revertAgainRes = await request(`/operations/${overrideOp2.id}/revert`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    assert(revertAgainRes.status === 400, '重复撤销被拒绝')
  }

  console.log('\n========== 测试路径 2：审批申请 → 排考 → 撤销审批 → 申请回pending、排考取消 ==========')
  {
    const studentToken = await login('student3', 'student123', 'student')

    const studentQualsRes = await request('/qualifications?status=active', {
      headers: { Authorization: `Bearer ${studentToken}` },
    })
    const studentQualified = studentQualsRes.data.data.find(
      (q) => q.qualified === 1 || q.qualified === true,
    )

    if (!studentQualified) {
      console.log('   ⚠ 学生没有补考资格，先创建一个')
      const allQualsRes = await request('/qualifications?status=active', {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
      const firstQualified = allQualsRes.data.data.find(
        (q) => q.qualified === 1 || q.qualified === true,
      )
      if (firstQualified) {
        console.log(`   使用资格 ID=${firstQualified.id}, student_id=${firstQualified.student_id}`)
      }
    }

    let application

    const pendingAppsRes = await request('/applications?status=pending', {
      headers: { Authorization: `Bearer ${adminToken}` },
    })

    if (pendingAppsRes.data.data?.length > 0) {
      application = pendingAppsRes.data.data[0]
      console.log(`   找到待审核申请: ID=${application.id}`)
    } else {
      console.log('   没有待审核申请，创建一个新的')
      const allQualsRes = await request('/qualifications?status=active', {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
      const qual = allQualsRes.data.data.find(
        (q) => q.qualified === 1 || q.qualified === true,
      )
      if (qual) {
        const applyRes = await request('/applications', {
          method: 'POST',
          body: JSON.stringify({ courseId: qual.course_id || qual.courseId }),
          headers: { Authorization: `Bearer ${adminToken}` },
        })
        if (applyRes.status === 200) {
          application = applyRes.data.data
          console.log(`   创建了申请: ID=${application.id}`)
        } else {
          console.log(`   创建申请失败: ${applyRes.data.error}`)
        }
      }
    }

    if (!application) {
      console.log('   ⚠ 无法获取申请，跳过此测试')
    } else {
      console.log(`   申请ID: ${application.id}, 当前状态: ${application.status}`)

      if (application.status !== 'pending') {
        console.log('   申请不是 pending 状态，无法测试审批')
      } else {
        const approveRes = await request(`/applications/${application.id}/approve`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${adminToken}` },
        })
        assert(approveRes.status === 200, '审批通过成功')
        assert(approveRes.data.data?.status === 'approved', '申请状态变为 approved')

        const opsAfterApprove = await request('/operations?limit=20', {
          headers: { Authorization: `Bearer ${adminToken}` },
        })
        const opsAfterApproveList = opsAfterApprove.data.data.items || opsAfterApprove.data.data
        const approveOp = opsAfterApproveList.find(
          (o) => o.operationType === 'approve_application' && o.targetId === application.id,
        )
        assert(approveOp !== undefined, '审批操作快照已创建')
        assert(!approveOp.reverted, '快照初始状态未撤销')

        const roomsRes = await request('/exam-rooms', {
          headers: { Authorization: `Bearer ${adminToken}` },
        })
        const rooms = roomsRes.data.data
        assert(rooms.length > 0, '有可用考场')

        const futureDate = new Date()
        futureDate.setDate(futureDate.getDate() + 30)
        const examDate = futureDate.toISOString().split('T')[0]

        console.log(`   创建排考: 日期=${examDate}, 考场=${rooms[0].name}`)
        const arrangeRes = await request('/arrangements', {
          method: 'POST',
          body: JSON.stringify({
            applicationIds: [application.id],
            examRoomId: rooms[0].id,
            examDate: examDate,
            startTime: '14:00',
            endTime: '16:00',
          }),
          headers: { Authorization: `Bearer ${adminToken}` },
        })
        console.log(`   排考状态: ${arrangeRes.status}`)
        if (arrangeRes.status !== 200) {
          console.log(`   排考失败详情: ${arrangeRes.data.error}`)
        }
        assert(arrangeRes.status === 200, '排考创建成功')
        assert(arrangeRes.data.data?.length > 0, '排考记录已生成')

        const arrangement = arrangeRes.data.data[0]

        console.log('   执行撤销审批操作...')
        const revertRes = await request(`/operations/${approveOp.id}/revert`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${adminToken}` },
        })
        console.log(`   撤销状态: ${revertRes.status}`)
        if (revertRes.status !== 200) {
          console.log(`   撤销失败详情: ${revertRes.data.error}`)
        }
        assert(revertRes.status === 200, '撤销审批成功')

        const appAfterRes = await request(`/applications/${application.id}`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        })
        const appStatus = appAfterRes.data.data?.status
        console.log(`   撤销后申请状态: ${appStatus}`)
        assert(appStatus === 'pending', '申请状态恢复为 pending')

        const arrAfterRes = await request('/arrangements', {
          headers: { Authorization: `Bearer ${adminToken}` },
        })
        const targetArr = arrAfterRes.data.data.find((a) => a.id === arrangement.id)
        assert(targetArr?.status === 'cancelled', '排考被级联取消')
      }
    }
  }

  console.log('\n========== 测试路径 3：撤销已过期排考被拒绝 ==========')
  {
    let application
    const appsRes = await request('/applications?status=approved', {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    application = appsRes.data.data?.[0]

    if (!application) {
      console.log('   没有已审批的申请，先审批一个')
      const pendingApps = await request('/applications?status=pending', {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
      if (pendingApps.data.data?.length > 0) {
        const appId = pendingApps.data.data[0].id
        const approveRes = await request(`/applications/${appId}/approve`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${adminToken}` },
        })
        application = approveRes.data.data
      }
    }

    if (!application) {
      console.log('   ⚠ 无法获取已审批的申请，跳过此测试')
    } else {
      console.log(`   使用申请: ID=${application.id}`)

      const roomsRes = await request('/exam-rooms', {
        headers: { Authorization: `Bearer ${adminToken}` },
      })
      const rooms = roomsRes.data.data

      const pastDate = new Date()
      pastDate.setDate(pastDate.getDate() - 10)
      const examDate = pastDate.toISOString().split('T')[0]

      const timeSlots = [
        { start: '15:00', end: '17:00' },
        { start: '18:00', end: '20:00' },
        { start: '07:00', end: '09:00' },
        { start: '12:00', end: '14:00' },
        { start: '20:00', end: '22:00' },
        { start: '06:00', end: '08:00' },
      ]

      let arrangement
      for (const room of rooms) {
        for (const slot of timeSlots) {
          console.log(`   尝试创建过期排考: 考场=${room.name}, 日期=${examDate}, 时间=${slot.start}-${slot.end}`)
          try {
            const arrangeRes = await request('/arrangements', {
              method: 'POST',
              body: JSON.stringify({
                applicationIds: [application.id],
                examRoomId: room.id,
                examDate: examDate,
                startTime: slot.start,
                endTime: slot.end,
              }),
              headers: { Authorization: `Bearer ${adminToken}` },
            })
            if (arrangeRes.status === 200 && arrangeRes.data.data?.length > 0) {
              arrangement = arrangeRes.data.data[0]
              console.log(`   排考创建成功，ID: ${arrangement.id}`)
              break
            } else {
              console.log(`   排考创建失败: ${arrangeRes.data.error}`)
            }
          } catch (e) {
            console.log(`   排考创建异常: ${e.message}`)
          }
        }
        if (arrangement) break
      }

      if (arrangement) {
        const opsRes = await request('/operations?limit=30', {
          headers: { Authorization: `Bearer ${adminToken}` },
        })
        const opsList2 = opsRes.data.data.items || opsRes.data.data
        const arrOp = opsList2.find(
          (o) => o.operationType === 'create_arrangement' && o.targetId === arrangement.id,
        )
        assert(arrOp !== undefined, '排考操作快照已创建')

        console.log('   尝试撤销已过期排考...')
        const revertRes = await request(`/operations/${arrOp.id}/revert`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${adminToken}` },
        })
        console.log(`   撤销状态: ${revertRes.status}, 错误: ${revertRes.data.error}`)
        assert(revertRes.status === 400, '撤销过期排考被拒绝 (400)')
        assert(revertRes.data.error?.includes('已过') || revertRes.data.error?.includes('无法撤销'), '错误信息包含过期提示')
      } else {
        console.log('   ⚠ 无法创建过期排考，跳过撤销测试')
      }
    }
  }

  console.log('\n========== 测试：只能撤销自己的操作 ==========')
  {
    const opsRes = await request('/operations?limit=5', {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    const ops = opsRes.data.data.items || opsRes.data.data
    if (ops.length > 0) {
      const op = ops[0]

      const studentToken = await login('student1', 'student123', 'student')
      const revertRes = await request(`/operations/${op.id}/revert`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${studentToken}` },
      })
      assert(revertRes.status === 403 || revertRes.status === 401, '学生无法撤销操作（权限不足）')
    }
  }

  console.log(`\n=== 测试结果：${passed} 通过, ${failed} 失败 ===`)

  if (failed > 0) {
    process.exit(1)
  }
}

test().catch((err) => {
  console.error('测试失败:', err)
  process.exit(1)
})
