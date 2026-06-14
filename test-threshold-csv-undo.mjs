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
  console.log('=== 阈值修改撤销 & CSV导入撤销 & 重复撤销拦截 测试 ===\n')

  console.log('准备工作：登录 admin...')
  const adminToken = await login('admin', 'admin123', 'admin')
  const headers = { Authorization: `Bearer ${adminToken}` }
  console.log('   ✓ admin 登录成功\n')

  console.log('========== 测试路径 1：修改阈值 → 撤销 → 阈值回退 + 资格重算 ==========')
  {
    const beforeRes = await request('/threshold', { headers })
    const beforeScore = beforeRes.data.data.score
    console.log(`   当前阈值: ${beforeScore}`)

    const newScore = beforeScore === 70 ? 60 : 70
    console.log(`   修改阈值为: ${newScore}`)

    const updateRes = await request('/threshold', {
      method: 'PUT',
      body: JSON.stringify({ score: newScore }),
      headers,
    })
    assert(updateRes.status === 200, '修改阈值成功')
    assert(updateRes.data.data.score === newScore, `新阈值为 ${newScore}`)

    const afterUpdateRes = await request('/threshold', { headers })
    assert(afterUpdateRes.data.data.score === newScore, `确认阈值已变为 ${newScore}`)

    const opsRes = await request('/operations?limit=10&type=update_threshold', { headers })
    const thresholdOps = opsRes.data.data.items.filter(
      (o) => o.operationType === 'update_threshold' && !o.reverted,
    )
    assert(thresholdOps.length > 0, '阈值修改快照已创建')

    const thresholdOp = thresholdOps[0]
    const snapData = thresholdOp.snapshotData
    assert(snapData.oldScore === beforeScore, `快照中旧阈值 = ${beforeScore}`)
    assert(snapData.newScore === newScore, `快照中新阈值 = ${newScore}`)

    console.log('   执行撤销...')
    const revertRes = await request(`/operations/${thresholdOp.id}/revert`, {
      method: 'POST',
      headers,
    })
    assert(revertRes.status === 200, '撤销阈值修改成功')

    const afterRevertRes = await request('/threshold', { headers })
    const afterRevertScore = afterRevertRes.data.data.score
    assert(afterRevertScore === beforeScore, `阈值已恢复为 ${beforeScore} (实际: ${afterRevertScore})`)

    const qualsRes = await request('/qualifications?status=active', { headers })
    const activeQuals = qualsRes.data.data || []
    console.log(`   撤销后有效资格: ${activeQuals.length} 条`)

    const reRes = await request(`/operations/${thresholdOp.id}/revert`, {
      method: 'POST',
      headers,
    })
    assert(reRes.status === 400, '重复撤销阈值修改被拒绝 (400)')
    assert(
      reRes.data.error && reRes.data.error.length > 0,
      `重复撤销返回了错误信息: ${reRes.data.error}`,
    )
  }

  console.log('\n========== 测试路径 2：导入CSV → 撤销 → 成绩和资格回到导入前 ==========')
  {
    const gradesBeforeRes = await request('/grades', { headers })
    const gradesBefore = gradesBeforeRes.data.data || []
    console.log(`   导入前成绩数: ${gradesBefore.length}`)

    const qualsBeforeRes = await request('/qualifications?status=active', { headers })
    const qualsBefore = qualsBeforeRes.data.data || []
    console.log(`   导入前资格数: ${qualsBefore.length}`)

    const csvContent = `studentId,studentName,courseId,courseName,score
testStu1,测试学生1,testCourse1,测试课程1,45
testStu2,测试学生2,testCourse1,测试课程1,75`

    console.log('   导入CSV数据...')
    const importRes = await request('/grades/import', {
      method: 'POST',
      body: JSON.stringify({ csv: csvContent }),
      headers,
    })
    assert(importRes.status === 200, 'CSV导入成功')
    assert(importRes.data.data.imported >= 1, `至少导入1条 (实际: ${importRes.data.data.imported})`)

    const gradesAfterRes = await request('/grades', { headers })
    const gradesAfter = gradesAfterRes.data.data || []
    console.log(`   导入后成绩数: ${gradesAfter.length}`)
    assert(gradesAfter.length > gradesBefore.length, '成绩数增加')

    const opsRes = await request('/operations?limit=10&type=import_grades', { headers })
    const importOps = opsRes.data.data.items.filter(
      (o) => o.operationType === 'import_grades' && !o.reverted,
    )
    assert(importOps.length > 0, 'CSV导入快照已创建')

    const importOp = importOps[0]
    const snapData = importOp.snapshotData
    assert(typeof snapData.gradeCount === 'number', `快照记录成绩数: ${snapData.gradeCount}`)
    assert(typeof snapData.qualCount === 'number', `快照记录资格数: ${snapData.qualCount}`)

    console.log('   执行撤销...')
    const revertRes = await request(`/operations/${importOp.id}/revert`, {
      method: 'POST',
      headers,
    })
    assert(revertRes.status === 200, '撤销CSV导入成功')

    const gradesRevertRes = await request('/grades', { headers })
    const gradesRevert = gradesRevertRes.data.data || []
    console.log(`   撤销后成绩数: ${gradesRevert.length}`)
    assert(gradesRevert.length === gradesBefore.length, `成绩数恢复到导入前 (${gradesRevert.length} === ${gradesBefore.length})`)

    const qualsRevertRes = await request('/qualifications?status=active', { headers })
    const qualsRevert = qualsRevertRes.data.data || []
    console.log(`   撤销后资格数: ${qualsRevert.length}`)
    assert(qualsRevert.length === qualsBefore.length, `资格数恢复到导入前 (${qualsRevert.length} === ${qualsBefore.length})`)
  }

  console.log('\n========== 测试路径 3：同一天同一人反复改阈值只留最后一次快照 ==========')
  {
    const thresholdRes = await request('/threshold', { headers })
    const currentScore = thresholdRes.data.data.score

    console.log(`   第1次改阈值: ${currentScore} → 50`)
    await request('/threshold', {
      method: 'PUT',
      body: JSON.stringify({ score: 50 }),
      headers,
    })

    console.log(`   第2次改阈值: 50 → 55`)
    await request('/threshold', {
      method: 'PUT',
      body: JSON.stringify({ score: 55 }),
      headers,
    })

    console.log(`   第3次改阈值: 55 → 65`)
    await request('/threshold', {
      method: 'PUT',
      body: JSON.stringify({ score: 65 }),
      headers,
    })

    const opsRes = await request('/operations?limit=50&type=update_threshold', { headers })
    const todayOps = opsRes.data.data.items.filter(
      (o) => o.operationType === 'update_threshold' && !o.reverted,
    )
    console.log(`   今日未撤销的阈值快照数: ${todayOps.length}`)
    assert(todayOps.length <= 1, '同一天同一人只保留最后一次阈值快照')

    if (todayOps.length > 0) {
      const lastOp = todayOps[0]
      assert(lastOp.snapshotData.newScore === 65, `最后一次快照的新阈值为 65 (实际: ${lastOp.snapshotData.newScore})`)
    }

    await request('/threshold', {
      method: 'PUT',
      body: JSON.stringify({ score: currentScore }),
      headers,
    })
    console.log(`   恢复阈值为: ${currentScore}`)
  }

  console.log('\n========== 测试路径 4：操作列表分页和类型筛选 ==========')
  {
    const page1Res = await request('/operations?limit=2&page=1', { headers })
    assert(page1Res.status === 200, '分页查询成功')
    assert(page1Res.data.data.items.length <= 2, '每页最多2条')
    assert(typeof page1Res.data.data.pagination.total === 'number', '返回总数')
    assert(typeof page1Res.data.data.pagination.totalPages === 'number', '返回总页数')

    const filteredRes = await request('/operations?type=update_threshold', { headers })
    assert(filteredRes.status === 200, '类型筛选查询成功')
    const filteredItems = filteredRes.data.data.items
    const allMatchType = filteredItems.every((o) => o.operationType === 'update_threshold')
    assert(allMatchType || filteredItems.length === 0, '筛选结果全部为 update_threshold 类型')
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
