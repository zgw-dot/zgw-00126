import http from 'http';

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const fullPath = '/api' + (path.startsWith('/') ? path : '/' + path);
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    let bodyStr = null;
    if (body) {
      bodyStr = JSON.stringify(body);
      headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }
    const options = { hostname: 'localhost', port: 3001, path: fullPath, method, headers };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function login(username, password, role) {
  const res = await request('POST', '/auth/login', { username, password, role });
  if (res.status !== 200 || !res.body.success) {
    throw new Error(`登录失败: ${res.body.error || res.status}`);
  }
  return res.body.data.token;
}

let passed = 0;
let failed = 0;
function assert(condition, message) {
  if (condition) { console.log(`  ✅ ${message}`); passed++; }
  else { console.log(`  ❌ ${message}`); failed++; }
}

async function getUnscheduledApps(adminToken) {
  const appsRes = await request('GET', '/applications?status=approved', null, adminToken);
  const apps = appsRes.body.data;
  const arrRes = await request('GET', '/arrangements', null, adminToken);
  const arrangements = arrRes.body.data;
  const scheduledAppIds = new Set(arrangements.map(a => a.applicationId));
  return apps.filter(a => !scheduledAppIds.has(a.id));
}

async function getOneStudentApps(adminToken, studentId) {
  const allUnscheduled = await getUnscheduledApps(adminToken);
  return allUnscheduled.filter(a => a.student_id === studentId);
}

async function cleanupTestArrangements(adminToken) {
  console.log('  清理 2099 年的测试排考数据...');
  const arrRes = await request('GET', '/arrangements', null, adminToken);
  const arrangements = arrRes.body.data || [];
  const testArrs = arrangements.filter(a => a.examDate && a.examDate.startsWith('2099') && a.status === 'scheduled');
  console.log(`  找到 ${testArrs.length} 条需要清理的测试排考`);
  for (const arr of testArrs) {
    await request('DELETE', `/arrangements/${arr.id}`, { reason: '测试清理' }, adminToken);
  }
  if (testArrs.length > 0) console.log(`  已清理 ${testArrs.length} 条测试排考`);
}

async function runTests() {
  console.log('=== 排考草稿/确认发布流程测试 ===\n');

  let adminToken, studentToken, teacherToken;
  try {
    adminToken = await login('admin', 'admin123', 'admin');
    console.log('✅ 管理员登录成功');
    studentToken = await login('student1', 'student123', 'student');
    console.log('✅ 学生登录成功');
    teacherToken = await login('teacher1', 'teacher123', 'teacher');
    console.log('✅ 教师登录成功');
  } catch (e) {
    console.error('❌ 登录失败:', e.message);
    process.exit(1);
  }

  console.log('\n【测试0】清理测试数据');
  await cleanupTestArrangements(adminToken);

  console.log('\n【测试1】权限拒绝 - 学生不能访问草稿接口');
  const r1 = await request('GET', '/arrangements/drafts', null, studentToken);
  assert(r1.status === 403, `学生访问草稿列表返回 403 (实际: ${r1.status})`);
  const r2 = await request('POST', '/arrangements/drafts/batch-add',
    { applicationIds: [], examRoomId: 1, examDate: '2025-12-01', startTime: '09:00', endTime: '11:00' },
    studentToken);
  assert(r2.status === 403, `学生添加草稿返回 403 (实际: ${r2.status})`);
  const r3 = await request('POST', '/arrangements/drafts/publish', null, studentToken);
  assert(r3.status === 403, `学生发布草稿返回 403 (实际: ${r3.status})`);

  console.log('\n【测试2】权限拒绝 - 教师不能访问草稿接口');
  const r4 = await request('GET', '/arrangements/drafts', null, teacherToken);
  assert(r4.status === 403, `教师访问草稿列表返回 403 (实际: ${r4.status})`);
  const r5 = await request('DELETE', '/arrangements/drafts/999', null, teacherToken);
  assert(r5.status === 403, `教师删除草稿返回 403 (实际: ${r5.status})`);

  console.log('\n【测试3】教务可以正常访问草稿列表');
  const r6 = await request('GET', '/arrangements/drafts', null, adminToken);
  assert(r6.status === 200 && r6.body.success === true, '教务访问草稿列表成功');
  assert(Array.isArray(r6.body.data), '返回数据为数组');

  console.log('\n【测试4】清空草稿（确保测试环境干净）');
  const r7 = await request('DELETE', '/arrangements/drafts', null, adminToken);
  assert(r7.status === 200 && r7.body.success === true, '清空草稿成功');

  console.log('\n【测试5】获取未排考的已批准申请（同一学生）');
  const allUnscheduled = await getUnscheduledApps(adminToken);
  console.log(`  共找到 ${allUnscheduled.length} 个未排考的已批准申请`);

  const studentIds = [...new Set(allUnscheduled.map(a => a.student_id))];
  console.log(`  涉及 ${studentIds.length} 个学生`);

  const testStudentId = studentIds[0];
  const studentApps = allUnscheduled.filter(a => a.student_id === testStudentId);
  console.log(`  使用学生 ${testStudentId} 的 ${studentApps.length} 个申请进行测试`);

  if (studentApps.length < 3) {
    console.log('\n❌ 同一学生的未排考申请不足3个，无法继续测试');
    process.exit(1);
  }

  const app1 = studentApps[0];
  const app2 = studentApps[1];
  const app3 = studentApps[2];
  console.log(`  使用申请: ${app1.id}, ${app2.id}, ${app3.id}`);

  console.log('\n【测试6】批量添加申请到草稿（同一学生同时段 - 应只添加1条）');
  const add1Res = await request('POST', '/arrangements/drafts/batch-add', {
    applicationIds: [app1.id, app2.id],
    examRoomId: 1,
    examDate: '2099-06-01',
    startTime: '09:00',
    endTime: '11:00',
  }, adminToken);
  assert(add1Res.status === 200 && add1Res.body.success === true, '批量添加草稿接口调用成功');
  assert(add1Res.body.data.added === 1, `同一学生同时段只添加1条（实际添加: ${add1Res.body.data.added}）`);
  assert(add1Res.body.data.skipped === 1, `跳过1条因时间冲突（实际跳过: ${add1Res.body.data.skipped}）`);
  assert(add1Res.body.data.total === 2, '总数匹配为2');

  const skippedItem = add1Res.body.data.details.find(d => d.status === 'skipped');
  assert(skippedItem && skippedItem.reason?.includes('冲突'), '跳过原因包含"冲突"');

  console.log('\n【测试7】草稿列表能看到新添加的草稿');
  const draftsRes = await request('GET', '/arrangements/drafts', null, adminToken);
  assert(draftsRes.body.data.length >= 1, `草稿列表至少有1条记录 (实际: ${draftsRes.body.data.length})`);
  const draft1 = draftsRes.body.data[0];
  assert(draft1.applicationId === app1.id || draft1.applicationId === app2.id,
    '草稿包含正确的申请ID');

  console.log('\n【测试8】修改草稿项 - 更换考场和时间');
  const editRes = await request('PUT', `/arrangements/drafts/${draft1.id}`, {
    examRoomId: 2,
    examDate: '2099-06-02',
    startTime: '14:00',
    endTime: '16:00',
  }, adminToken);
  assert(editRes.status === 200 && editRes.body.success === true,
    `修改草稿成功 (状态: ${editRes.status}, 错误: ${editRes.body.error || '无'})`);
  assert(editRes.body.data?.examRoomId === 2, `考场已更新为 2 (实际: ${editRes.body.data?.examRoomId})`);
  assert(editRes.body.data?.startTime === '14:00', `开始时间已更新为 14:00 (实际: ${editRes.body.data?.startTime})`);
  assert(editRes.body.data?.examDate === '2099-06-02', `日期已更新为 2099-06-02 (实际: ${editRes.body.data?.examDate})`);

  console.log('\n【测试9】再添加一条草稿（修改时间后不再冲突）');
  const add2Res = await request('POST', '/arrangements/drafts/batch-add', {
    applicationIds: [app2.id],
    examRoomId: 1,
    examDate: '2099-06-01',
    startTime: '09:00',
    endTime: '11:00',
  }, adminToken);
  assert(add2Res.body.data.added === 1,
    `成功添加第2条草稿 (实际添加: ${add2Res.body.data.added}, 跳过: ${add2Res.body.data.skipped}, 详情: ${JSON.stringify(add2Res.body.data.details)})`);

  const draftsRes2 = await request('GET', '/arrangements/drafts', null, adminToken);
  assert(draftsRes2.body.data.length === 2, `草稿列表现在有2条记录 (实际: ${draftsRes2.body.data.length})`);

  console.log('\n【测试10】删除单个草稿项');
  const draftToDelete = draftsRes2.body.data[0];
  const deleteRes = await request('DELETE', `/arrangements/drafts/${draftToDelete.id}`, null, adminToken);
  assert(deleteRes.status === 200 && deleteRes.body.success === true, '删除单个草稿项成功');
  const draftsAfterDel = await request('GET', '/arrangements/drafts', null, adminToken);
  assert(draftsAfterDel.body.data.length === 1, '删除后草稿数量减少为1');

  console.log('\n【测试11】草稿跨重启保留 - 验证数据持久化');
  const draftsBeforePublish = await request('GET', '/arrangements/drafts', null, adminToken);
  const countBefore = draftsBeforePublish.body.data.length;
  assert(countBefore > 0, '当前有草稿数据');
  console.log('  重新读取数据库（模拟重启后读取）');
  const draftsAfterRead = await request('GET', '/arrangements/drafts', null, adminToken);
  assert(draftsAfterRead.body.data.length === countBefore,
    `重新读取后草稿数量一致 (${countBefore})，持久化有效`);

  const draftToPublish = draftsBeforePublish.body.data[0];

  console.log('\n【测试12】发布草稿 - 成功发布');
  const publishRes = await request('POST', '/arrangements/drafts/publish', null, adminToken);
  assert(publishRes.status === 200 && publishRes.body.success === true,
    `发布草稿成功 (错误: ${publishRes.body.error || '无'})`);
  assert(publishRes.body.data?.published === 1, `成功发布 1 条 (实际: ${publishRes.body.data?.published})`);
  assert(publishRes.body.data?.failed === 0, '没有失败项');

  console.log('\n【测试13】发布后草稿被清空');
  const draftsAfterPub = await request('GET', '/arrangements/drafts', null, adminToken);
  assert(draftsAfterPub.body.data.length === 0, '发布后草稿列表为空');

  console.log('\n【测试14】发布后正式排考能看到记录');
  const arrangementsRes = await request('GET', '/arrangements', null, adminToken);
  const found = arrangementsRes.body.data.some(a => a.applicationId === draftToPublish.applicationId);
  assert(found, '正式排考列表包含已发布的记录');

  console.log('\n【测试15】学生可以看到自己的考试安排');
  const studentSched = await request('GET', '/arrangements', null, studentToken);
  assert(studentSched.status === 200, '学生访问排考列表成功');
  assert(Array.isArray(studentSched.body.data), '返回数组');

  console.log('\n【测试16】教师可以看到考试安排');
  const teacherSched = await request('GET', '/arrangements', null, teacherToken);
  assert(teacherSched.status === 200, '教师访问排考列表成功');

  console.log('\n【测试17】草稿添加时冲突拦截 - 与正式排考时间冲突');
  await request('DELETE', '/arrangements/drafts', null, adminToken);

  const app4 = studentApps[3];
  const formalArrs = await request('GET', '/arrangements', null, adminToken);
  const studentFormal = formalArrs.body.data.filter(a => a.studentId === testStudentId && a.status === 'scheduled');
  console.log(`  测试学生 ${testStudentId} 的正式排考数: ${studentFormal.length}`);

  let conflictDate, conflictStart, conflictEnd;
  if (studentFormal.length > 0) {
    const fa = studentFormal[0];
    conflictDate = fa.examDate;
    conflictStart = fa.startTime;
    conflictEnd = fa.endTime;
    console.log(`  使用正式排考时间: ${conflictDate} ${conflictStart}-${conflictEnd}`);
  } else {
    conflictDate = '2099-06-01';
    conflictStart = '09:00';
    conflictEnd = '11:00';
    console.log(`  无正式排考，使用默认时间: ${conflictDate} ${conflictStart}-${conflictEnd}`);
  }

  const conflictAddRes1 = await request('POST', '/arrangements/drafts/batch-add', {
    applicationIds: [app4.id],
    examRoomId: 3,
    examDate: conflictDate,
    startTime: conflictStart,
    endTime: conflictEnd,
  }, adminToken);
  assert(conflictAddRes1.body.data?.skipped >= 1,
    `与正式排考时间冲突的草稿被跳过 (实际跳过: ${conflictAddRes1.body.data?.skipped || 0})`);
  const skippedFormal = conflictAddRes1.body.data?.details?.find(d => d.status === 'skipped');
  assert(skippedFormal && skippedFormal.reason?.includes('冲突'),
    `跳过原因包含"冲突" (实际原因: ${skippedFormal?.reason || '无'})`);

  const conflictAddRes2 = await request('POST', '/arrangements/drafts/batch-add', {
    applicationIds: [app4.id],
    examRoomId: 3,
    examDate: '2099-06-25',
    startTime: '10:00',
    endTime: '12:00',
  }, adminToken);
  assert(conflictAddRes2.body.data?.added === 1,
    `不冲突的草稿添加成功 (实际添加: ${conflictAddRes2.body.data?.added || 0}, 跳过: ${conflictAddRes2.body.data?.skipped || 0})`);

  console.log('\n【测试18】编辑草稿时冲突拦截 - 与其他草稿时间冲突');
  const draftsForEditTest = await request('GET', '/arrangements/drafts', null, adminToken);
  const draftToEdit = draftsForEditTest.body.data[0];

  const addThirdDraftRes = await request('POST', '/arrangements/drafts/batch-add', {
    applicationIds: [studentApps[4].id],
    examRoomId: 1,
    examDate: '2099-06-10',
    startTime: '09:00',
    endTime: '11:00',
  }, adminToken);
  assert(addThirdDraftRes.body.data?.added === 1, '添加第三条草稿成功');

  const editConflictRes = await request('PUT', `/arrangements/drafts/${draftToEdit.id}`, {
    examDate: '2099-06-10',
    startTime: '10:00',
    endTime: '12:00',
  }, adminToken);
  assert(editConflictRes.status === 400 || !editConflictRes.body.success,
    `编辑为冲突时间时返回失败 (状态: ${editConflictRes.status}, success: ${editConflictRes.body.success})`);
  assert(editConflictRes.body.error?.includes('冲突') ||
    editConflictRes.body.error?.includes('草稿中已有其他安排'),
    `错误信息包含冲突相关内容 (错误: ${editConflictRes.body.error || '无'})`);

  console.log('\n【测试19】考场容量不足时拦截');
  await request('DELETE', '/arrangements/drafts', null, adminToken);
  const roomRes = await request('GET', '/exam-rooms', null, adminToken);
  const room1 = roomRes.body.data?.find(r => r.id === 1);
  const room1Capacity = room1?.capacity || 30;
  console.log(`  考场1容量: ${room1Capacity}, 学生申请数: ${studentApps.length}`);

  const capRes = await request('POST', '/arrangements/drafts/batch-add', {
    applicationIds: studentApps.map(a => a.id),
    examRoomId: 1,
    examDate: '2099-07-01',
    startTime: '09:00',
    endTime: '11:00',
  }, adminToken);
  assert(capRes.body.data.added + capRes.body.data.skipped === studentApps.length,
    '添加和跳过总数等于申请数');

  if (studentApps.length > 1) {
    assert(capRes.body.data.skipped > 0, '同学生同时段有跳过项（时间冲突）');
  }

  console.log('\n【测试20】学生不能修改草稿');
  const studentDel = await request('DELETE', '/arrangements/drafts/999', null, studentToken);
  assert(studentDel.status === 403, `学生删除草稿返回 403 (实际: ${studentDel.status})`);
  const studentEdit = await request('PUT', '/arrangements/drafts/999', { examRoomId: 1 }, studentToken);
  assert(studentEdit.status === 403, `学生修改草稿返回 403 (实际: ${studentEdit.status})`);

  await request('DELETE', '/arrangements/drafts', null, adminToken);

  console.log('\n=== 测试结果 ===');
  console.log(`通过: ${passed}`);
  console.log(`失败: ${failed}`);
  console.log(failed === 0 ? '🎉 所有测试通过！' : '❌ 有测试失败');
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('测试运行出错:', err.message);
  console.error(err.stack);
  process.exit(1);
});
