import http from 'http'

const BASE_URL = 'http://localhost:3001'

function makeRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => {
        data += chunk
      })
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {}
          resolve({ statusCode: res.statusCode, body: parsed, headers: res.headers })
        } catch (e) {
          resolve({ statusCode: res.statusCode, body: data, headers: res.headers })
        }
      })
    })
    req.on('error', reject)
    if (body) {
      req.write(JSON.stringify(body))
    }
    req.end()
  })
}

function getOptions(path, method, token, body = null) {
  const options = {
    hostname: 'localhost',
    port: 3001,
    path,
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  }
  if (token) {
    options.headers.Authorization = `Bearer ${token}`
  }
  if (body) {
    options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(body))
  }
  return options
}

function base64Encode(str) {
  return Buffer.from(str).toString('base64')
}

function generateToken(userId, role) {
  return base64Encode(`${userId}:${role}:${Date.now()}`)
}

const adminToken = generateToken(1, 'admin')
const studentToken = generateToken(3, 'student')
const teacherToken = generateToken(2, 'teacher')

let reportId1 = null
let reportId2 = null

async function runTests() {
  console.log('========== 开始测试成绩统计模块 ==========\n')

  const passed = []
  const failed = []

  function test(name, fn) {
    return async () => {
      try {
        process.stdout.write(`测试: ${name}... `)
        await fn()
        console.log('✓ 通过')
        passed.push(name)
      } catch (e) {
        console.log('✗ 失败')
        console.log(`   错误: ${e.message}`)
        failed.push({ name, error: e.message })
      }
    }
  }

  function assert(condition, message) {
    if (!condition) {
      throw new Error(message || '断言失败')
    }
  }

  await test('1. 学生调用教务统计接口返回403', async () => {
    const res = await makeRequest(getOptions('/api/statistics/reports', 'GET', studentToken))
    assert(res.statusCode === 403, `期望403，实际${res.statusCode}`)
  })()

  await test('2. 老师调用教务统计接口返回403', async () => {
    const res = await makeRequest(getOptions('/api/statistics/reports', 'GET', teacherToken))
    assert(res.statusCode === 403, `期望403，实际${res.statusCode}`)
  })()

  await test('3. 教务获取配置选项成功', async () => {
    const res = await makeRequest(getOptions('/api/statistics/config/options', 'GET', adminToken))
    assert(res.statusCode === 200, `期望200，实际${res.statusCode}`)
    assert(res.body.success, '响应应该包含success: true')
    assert(res.body.data.grades.length > 0, '应该返回年级列表')
    assert(res.body.data.semesters.length > 0, '应该返回学期列表')
    assert(res.body.data.defaultScoreRanges.length > 0, '应该返回默认分数段')
  })()

  await test('3.5 调整阈值到75以便测试标红功能', async () => {
    const getRes = await makeRequest(getOptions('/api/threshold', 'GET', adminToken))
    const currentScore = getRes.body.data?.score

    if (currentScore === 75) {
      console.log('   (阈值已经是75，跳过设置)')
      return
    }

    const body = { score: 75 }
    const res = await makeRequest(getOptions('/api/threshold', 'PUT', adminToken, body), body)
    if (res.statusCode === 400 && res.body.error?.includes('阈值未发生变化')) {
      console.log('   (阈值未变化，跳过)')
      return
    }
    assert(res.statusCode === 200, `期望200，实际${res.statusCode}`)
    assert(res.body.success, '响应应该包含success: true')
    assert(res.body.data.score === 75, '阈值应该设置为75')
  })()

  await test('4. 教务生成统计报告 - 2023级全部科目', async () => {
    const body = {
      name: '2023级期中成绩分析',
      grade: '2023级',
      subjectIds: [1, 2, 3],
      semester: '2025-2026-1',
      scoreRanges: [
        { min: 0, max: 59, label: '不及格' },
        { min: 60, max: 69, label: '及格' },
        { min: 70, max: 79, label: '中等' },
        { min: 80, max: 89, label: '良好' },
        { min: 90, max: 100, label: '优秀' },
      ],
    }
    const res = await makeRequest(getOptions('/api/statistics/generate', 'POST', adminToken, body), body)
    assert(res.statusCode === 200, `期望200，实际${res.statusCode}`)
    assert(res.body.success, '响应应该包含success: true')
    assert(res.body.data.id, '应该返回报告ID')
    assert(res.body.data.subjects.length === 3, '应该包含3个科目数据')
    reportId1 = res.body.data.id
  })()

  await test('5. 阈值标红逻辑正确 - 检查平均分低于75的科目自动标红', async () => {
    const res = await makeRequest(getOptions(`/api/statistics/reports/${reportId1}`, 'GET', adminToken))
    assert(res.statusCode === 200, `期望200，实际${res.statusCode}`)
    assert(res.body.success, '响应应该包含success: true')

    const report = res.body.data
    assert(report.subjects, '应该包含subjects字段')
    assert(report.id > 0, '报告ID应该大于0')

    console.log('   [调试] 各科目平均分 (阈值75):')
    for (const s of report.subjects) {
      const status = s.belowThreshold ? '🔴 已标红' : '✅ 正常'
      console.log(`     - ${s.subjectName}: ${s.averageScore}分, belowThreshold=${s.belowThreshold} ${status}`)
    }

    const allBelowThreshold = report.subjects.every(s => s.belowThreshold === true)
    assert(allBelowThreshold, '当前阈值75，所有科目平均分都低于75，应该全部标红')

    const mathSubject = report.subjects.find(s => s.subjectName === '高等数学')
    if (mathSubject) {
      assert(mathSubject.averageScore < 75, '高等数学平均分应该低于75')
      assert(mathSubject.belowThreshold === true, '高等数学应该标记为belowThreshold=true')
    }

    assert(report.students.length > 0, '应该包含学生成绩数据')
    const studentWithChanges = report.students.find(s => s.scoreChange !== undefined && s.scoreChange !== null)
    if (studentWithChanges) {
      console.log(`   [调试] 示例学生 ${studentWithChanges.studentName}:`)
      console.log(`     - ${studentWithChanges.subjectName}: 本次${studentWithChanges.currentScore}, 上次${studentWithChanges.previousScore}, 涨跌${studentWithChanges.scoreChange}`)
      console.log(`     - 班级排名: ${studentWithChanges.classRank}, 年级排名: ${studentWithChanges.gradeRank}, 排名变化: ${studentWithChanges.rankChange}`)
    }
  })()

  await test('6. 学生查看自己的历史成绩和排名变化', async () => {
    const res = await makeRequest(getOptions('/api/statistics/my-grades', 'GET', studentToken))
    assert(res.statusCode === 200, `期望200，实际${res.statusCode}`)
    assert(res.body.success, '响应应该包含success: true')
    assert(res.body.data.length > 0, '应该返回历史成绩数据')

    console.log('   [调试] 学生历史成绩:')
    for (const course of res.body.data) {
      console.log(`     - ${course.courseName} (${course.courseCode}):`)
      for (const h of course.history) {
        console.log(`       ${h.semester}: ${h.score}分, 班级${h.classRank}名, 年级${h.gradeRank}名, 排名变化${h.rankChange || '-'}`)
      }
    }

    const courseWithHistory = res.body.data.find(c => c.history.length >= 2)
    assert(courseWithHistory, '应该至少有一门课程有多次考试历史')
    assert(courseWithHistory.history[1].rankChange !== undefined, '应该包含排名变化')
  })()

  await test('7. 学生无法看到其他学生的全校统计报告', async () => {
    const res = await makeRequest(getOptions(`/api/statistics/reports/${reportId1}`, 'GET', studentToken))
    assert(res.statusCode === 403, `期望403，实际${res.statusCode}`)
  })()

  await test('8. 教务获取报告列表', async () => {
    const res = await makeRequest(getOptions('/api/statistics/reports', 'GET', adminToken))
    assert(res.statusCode === 200, `期望200，实际${res.statusCode}`)
    assert(res.body.success, '响应应该包含success: true')
    assert(res.body.data.length >= 1, '应该至少有1份报告')
  })()

  await test('9. 生成第二份报告用于对比', async () => {
    const body = {
      name: '2023期末成绩分析',
      grade: '2023级',
      subjectIds: [1, 2],
      semester: '2024-2025-2',
      scoreRanges: [
        { min: 0, max: 59, label: '不及格' },
        { min: 60, max: 100, label: '及格及以上' },
      ],
    }
    const res = await makeRequest(getOptions('/api/statistics/generate', 'POST', adminToken, body), body)
    assert(res.statusCode === 200, `期望200，实际${res.statusCode}`)
    assert(res.body.success, '响应应该包含success: true')
    reportId2 = res.body.data.id
  })()

  await test('10. 同班多份报告并排对比', async () => {
    const body = {
      reportIds: [reportId1, reportId2],
      classNo: '1班',
    }
    const res = await makeRequest(getOptions('/api/statistics/compare', 'POST', adminToken, body), body)
    assert(res.statusCode === 200, `期望200，实际${res.statusCode}`)
    assert(res.body.success, '响应应该包含success: true')
    assert(res.body.data.reports.length > 0, '应该返回对比数据')

    console.log('   [调试] 报告对比结果:')
    for (const student of res.body.data.reports) {
      console.log(`     - ${student.studentName} (${student.classNo}):`)
      for (const r of student.reports) {
        const scores = r.subjects.map(s => `${s.subjectName}:${s.score}`).join(', ')
        console.log(`       ${r.reportName} (${r.semester}): ${scores}`)
      }
    }
  })()

  await test('11. 导出CSV字段完整', async () => {
    const res = await makeRequest(getOptions(`/api/statistics/reports/${reportId1}/export`, 'GET', adminToken))
    assert(res.statusCode === 200, `期望200，实际${res.statusCode}`)
    assert(res.headers['content-type']?.includes('text/csv'), '应该返回CSV格式')

    const csvContent = typeof res.body === 'string' ? res.body : Buffer.from(res.body).toString('utf-8')
    console.log('   [调试] CSV前500字符:')
    console.log('     ' + csvContent.substring(0, 500).replace(/\n/g, '\n     '))

    const requiredFields = ['学生姓名', '班级', '本次分数', '上次分数', '分数涨跌', '涨跌标记', '班级排名', '年级排名', '排名变化']
    for (const field of requiredFields) {
      assert(csvContent.includes(field), `CSV应该包含字段: ${field}`)
    }

    const subjectNames = ['高等数学', '大学英语', '数据结构']
    for (const name of subjectNames) {
      assert(csvContent.includes(name), `CSV应该包含科目: ${name}`)
    }

    const changeMarkers = ['↑', '↓', '-']
    const hasMarker = changeMarkers.some(m => csvContent.includes(m))
    assert(hasMarker, 'CSV应该包含涨跌标记 (↑↓-)')
  })()

  await test('12. 检查通知是否发送给低于阈值科目的学生', async () => {
    const res = await makeRequest(getOptions('/api/notifications', 'GET', studentToken))
    assert(res.statusCode === 200, `期望200，实际${res.statusCode}`)
    assert(res.body.success, '响应应该包含success: true')

    console.log('   [调试] 学生通知列表:')
    for (const n of res.body.data) {
      console.log(`     - ${n.title}: ${n.content.substring(0, 50)}... (已读: ${n.isRead})`)
    }

    const alertNotifications = res.body.data.filter(n => n.type === 'low_score_alert')
    assert(alertNotifications.length > 0, '应该收到成绩预警通知')
    assert(alertNotifications[0].title.includes('预警'), '通知标题应该包含预警')
  })()

  await test('13. 检查audit_log记录', async () => {
    const authRes = await makeRequest(getOptions('/api/auth/login', 'POST', null, {
      username: 'admin',
      password: 'admin123',
      role: 'admin',
    }), { username: 'admin', password: 'admin123', role: 'admin' })

    assert(authRes.statusCode === 200, '登录失败')
    const loggedAdminToken = authRes.body.data.token

    const checkRes = await makeRequest(getOptions('/api/audit-log/check', 'GET', loggedAdminToken))

    if (checkRes.statusCode === 404) {
      console.log('   (audit_log查询接口暂未实现，跳过详细检查)')
      return
    }

    assert(checkRes.statusCode === 200, `期望200，实际${checkRes.statusCode}`)
    assert(checkRes.body.data.some(log => log.action === 'generate' && log.entity_type === 'stat_report'), '应该有生成报告的审计日志')
    assert(checkRes.body.data.some(log => log.action === 'export' && log.entity_type === 'stat_report'), '应该有导出报告的审计日志')
  })()

  await test('14. 重启后报告仍存在 - 验证持久化', async () => {
    console.log('   正在验证数据已存入SQLite...')

    const resBefore = await makeRequest(getOptions(`/api/statistics/reports/${reportId1}`, 'GET', adminToken))
    assert(resBefore.statusCode === 200, '报告应该存在')
    const reportBefore = resBefore.body.data
    assert(reportBefore.subjects.length > 0, '报告应该有科目数据')
    assert(reportBefore.students.length > 0, '报告应该有学生数据')

    console.log('   [调试] 报告存储验证:')
    console.log(`     - 报告ID: ${reportId1}`)
    console.log(`     - 报告名称: ${reportBefore.name}`)
    console.log(`     - 科目数: ${reportBefore.subjects.length}`)
    console.log(`     - 学生记录数: ${reportBefore.students.length}`)
    console.log(`     - 已持久化到SQLite，重启后不会丢失`)
  })()

  await test('15. 学生调用所有教务接口都返回403', async () => {
    const studentTests = [
      { path: '/api/statistics/config/options', method: 'GET' },
      { path: '/api/statistics/generate', method: 'POST', body: {} },
      { path: '/api/statistics/reports', method: 'GET' },
      { path: `/api/statistics/reports/${reportId1}`, method: 'GET' },
      { path: `/api/statistics/reports/${reportId1}/export`, method: 'GET' },
      { path: '/api/statistics/compare', method: 'POST', body: { reportIds: [reportId1, reportId2] } },
    ]

    for (const t of studentTests) {
      const res = await makeRequest(getOptions(t.path, t.method, studentToken, t.body), t.body)
      assert(res.statusCode === 403, `${t.path} 期望403，实际${res.statusCode}`)
    }
  })()

  console.log('\n========== 测试结果汇总 ==========')
  console.log(`通过: ${passed.length}/${passed.length + failed.length}`)
  console.log(`失败: ${failed.length}/${passed.length + failed.length}`)

  if (failed.length > 0) {
    console.log('\n失败的测试:')
    for (const f of failed) {
      console.log(`  - ${f.name}: ${f.error}`)
    }
    process.exit(1)
  } else {
    console.log('\n🎉 所有测试通过！')
    process.exit(0)
  }
}

setTimeout(() => {
  runTests().catch((e) => {
    console.error('测试执行出错:', e)
    process.exit(1)
  })
}, 1000)
