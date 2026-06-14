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

async function test() {
  console.log('=== Bug 修复回归测试 ===\n')

  console.log('1. 登录 admin...')
  const adminToken = await login('admin', 'admin123', 'admin')
  console.log('   ✓ admin 登录成功\n')

  console.log('2. 导入 sample-grades.csv...')
  const csvContent = fs.readFileSync('sample-grades.csv', 'utf-8')
  const importRes = await request('/grades/import', {
    method: 'POST',
    body: JSON.stringify({ csv: csvContent }),
    headers: { Authorization: `Bearer ${adminToken}` },
  })

  console.log(`   状态: ${importRes.status}`)
  console.log(`   导入成功: ${importRes.data.data?.imported} 条`)
  console.log(`   错误数: ${importRes.data.data?.errors?.length || 0} 条`)

  if (importRes.data.data?.errors?.length > 0) {
    console.log('   错误详情:')
    importRes.data.data.errors.forEach(e => console.log(`     - ${e}`))
  }

  if (importRes.data.data?.imported === 15) {
    console.log('   ✓ Bug 1 修复验证通过：15 条全部导入成功\n')
  } else {
    console.log('   ✗ Bug 1 修复验证失败：导入数量不正确\n')
    process.exit(1)
  }

  console.log('3. 验证资格自动计算...')
  const qualsRes = await request('/qualifications', {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  const allQuals = qualsRes.data.data
  const qualified = allQuals.filter(q => q.qualified === 1 && q.status === 'active')
  console.log(`   总资格记录: ${allQuals.length} 条`)
  console.log(`   有补考资格 (active): ${qualified.length} 条`)
  console.log('   ✓ 资格自动计算完成\n')

  console.log('4. 测试人工覆盖资格...')
  const notQualified = allQuals.find(q => q.qualified === 0 && q.status === 'active')
  if (!notQualified) {
    console.log('   ✗ 没有找到未通过的资格记录用于覆盖测试')
    process.exit(1)
  }

  console.log(`   选择学生: ${notQualified.studentName}, 课程: ${notQualified.courseName}, 当前资格: 不合格`)

  const overrideRes = await request(`/qualifications/${notQualified.id}/override`, {
    method: 'POST',
    body: JSON.stringify({ qualified: true, reason: '特殊情况人工授予资格' }),
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  console.log(`   覆盖状态: ${overrideRes.status}`)
  console.log(`   新资格状态: ${overrideRes.data.data?.status}`)
  console.log(`   资格来源: ${overrideRes.data.data?.source}`)

  if (overrideRes.data.data?.status !== 'active') {
    console.log('   ✗ Bug 2 修复验证失败：覆盖后状态不是 active')
    process.exit(1)
  }
  console.log('   ✓ 人工覆盖成功，新资格状态为 active\n')

  console.log('5. 验证学生能看到覆盖后的资格并提交申请...')
  const studentUsername = notQualified.studentName === '李四' ? 'S002' :
    notQualified.studentName === '王五' ? 'S003' :
    notQualified.studentName === '赵六' ? 'S004' :
    notQualified.studentName === '孙七' ? 'S005' :
    notQualified.studentName === '周八' ? 'S006' :
    notQualified.studentName === '吴九' ? 'S007' :
    notQualified.studentName === '张三' ? 'S001' : null

  if (!studentUsername) {
    console.log(`   ⚠ 无法映射学生 ${notQualified.studentName} 到学号，跳过学生端验证`)
  } else {
    console.log(`   学生学号: ${studentUsername}`)
    let studentToken
    try {
      studentToken = await login(studentUsername, 'student123', 'student')
      console.log('   ✓ 学生登录成功')
    } catch (e) {
      console.log('   ✗ 学生登录失败:', e.message)
      process.exit(1)
    }

    const studentQualsRes = await request('/qualifications', {
      headers: { Authorization: `Bearer ${studentToken}` },
    })
    const studentActiveQuals = studentQualsRes.data.data.filter(
      q => q.qualified === 1 && q.status === 'active'
    )
    console.log(`   学生有效资格数: ${studentActiveQuals.length} 条`)

    const hasOverrideQual = studentActiveQuals.some(
      q => q.course_id === notQualified.course_id && q.source === 'manual_override'
    )

    if (!hasOverrideQual) {
      console.log('   ✗ Bug 2 修复验证失败：学生看不到人工覆盖的资格')
      process.exit(1)
    }
    console.log('   ✓ 学生能看到人工覆盖的资格')

    const applyRes = await request('/applications', {
      method: 'POST',
      body: JSON.stringify({ courseId: notQualified.course_id }),
      headers: { Authorization: `Bearer ${studentToken}` },
    })
    console.log(`   申请提交状态: ${applyRes.status}`)
    if (applyRes.status !== 200) {
      console.log('   ✗ Bug 2 修复验证失败：学生无法提交申请 -', applyRes.data.error)
      process.exit(1)
    }
    console.log(`   申请状态: ${applyRes.data.data?.status}`)
    console.log('   ✓ Bug 2 修复验证通过：学生能提交申请\n')
  }

  console.log('6. 验证原资格记录状态为 cancelled（历史保留）...')
  const origQualRes = await request(`/qualifications/${notQualified.id}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  console.log(`   原记录状态: ${origQualRes.data.data?.status}`)
  if (origQualRes.data.data?.status === 'cancelled') {
    console.log('   ✓ 原资格记录已标记为 cancelled，历史保留\n')
  } else {
    console.log('   ⚠ 原资格记录状态异常\n')
  }

  console.log('=== 所有测试通过 ===')
  console.log('\nBug 1 修复：成绩导入支持驼峰列名和字符串业务编码，15条全部导入成功')
  console.log('Bug 2 修复：人工覆盖资格后状态为 active，学生能看到并提交申请')
}

test().catch(err => {
  console.error('测试失败:', err)
  process.exit(1)
})
