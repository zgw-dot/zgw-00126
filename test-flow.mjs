// 测试核心业务流程的脚本
const BASE_URL = 'http://localhost:3001/api';

async function request(endpoint, options = {}) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function runTests() {
  console.log('=== 测试课程补考资格与安排管理系统 ===\n');

  // 1. 教务登录
  console.log('1. 教务登录');
  const loginRes = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'admin', password: 'admin123', role: 'admin' }),
  });
  console.log('  状态:', loginRes.status, loginRes.data.success ? '✅ 成功' : '❌ 失败');
  const adminToken = loginRes.data.data.token;
  const adminAuth = { Authorization: `Bearer ${adminToken}` };

  // 2. 学生登录
  console.log('\n2. 学生登录 (student1)');
  const stuLogin = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'student1', password: 'student123', role: 'student' }),
  });
  console.log('  状态:', stuLogin.status, stuLogin.data.success ? '✅ 成功' : '❌ 失败');
  const stuToken = stuLogin.data.data.token;
  const stuAuth = { Authorization: `Bearer ${stuToken}` };

  // 3. 导入成绩
  console.log('\n3. 导入成绩 CSV');
  const csvContent = `student_id,course_id,score
3,1,55
3,2,72
3,3,45
4,1,60
4,2,58
4,3,90
5,1,40
5,2,50
5,3,48`;
  const importRes = await request('/grades/import', {
    method: 'POST',
    headers: adminAuth,
    body: JSON.stringify({ csv: csvContent }),
  });
  console.log('  状态:', importRes.status, importRes.data.success ? '✅ 成功' : '❌ 失败');
  console.log('  导入数量:', importRes.data.data?.imported);

  // 4. 查看资格列表
  console.log('\n4. 查看补考资格列表');
  const qualRes = await request('/qualifications', { headers: adminAuth });
  console.log('  状态:', qualRes.status, qualRes.data.success ? '✅ 成功' : '❌ 失败');
  const quals = qualRes.data.data || [];
  const qualifiedList = quals.filter((q) => q.qualified && q.status === 'active');
  console.log('  总资格数:', quals.length);
  console.log('  有补考资格数:', qualifiedList.length);
  console.log('  有资格的学生:');
  qualifiedList.forEach((q) => {
    console.log(`    - ${q.studentName} - ${q.courseName} (来源: ${q.source})`);
  });

  // 5. 学生提交申请
  console.log('\n5. 学生提交补考申请 (高等数学)');
  const mathQual = qualifiedList.find(
    (q) => q.studentId === 3 && q.courseName === '高等数学'
  );
  if (mathQual) {
    const applyRes = await request('/applications', {
      method: 'POST',
      headers: stuAuth,
      body: JSON.stringify({ courseId: mathQual.courseId }),
    });
    console.log('  状态:', applyRes.status, applyRes.data.success ? '✅ 成功' : '❌ 失败');
    console.log('  申请ID:', applyRes.data.data?.id);
  } else {
    console.log('  ⚠️  未找到符合条件的资格');
  }

  // 6. 学生申请多一门课
  console.log('\n6. 学生提交第二门补考申请 (数据结构)');
  const dsQual = qualifiedList.find(
    (q) => q.studentId === 3 && q.courseName === '数据结构'
  );
  if (dsQual) {
    const applyRes = await request('/applications', {
      method: 'POST',
      headers: stuAuth,
      body: JSON.stringify({ courseId: dsQual.courseId }),
    });
    console.log('  状态:', applyRes.status, applyRes.data.success ? '✅ 成功' : '❌ 失败');
  }

  // 7. 教务查看待审核申请
  console.log('\n7. 教务查看待审核申请');
  const appListRes = await request('/applications?status=pending', { headers: adminAuth });
  console.log('  状态:', appListRes.status, appListRes.data.success ? '✅ 成功' : '❌ 失败');
  const pendingApps = appListRes.data.data || [];
  console.log('  待审核数量:', pendingApps.length);
  pendingApps.forEach((a) => {
    console.log(`    - ${a.studentName} - ${a.courseName}`);
  });

  // 8. 教务批准第一个申请
  console.log('\n8. 教务批准第一个申请');
  if (pendingApps.length > 0) {
    const firstApp = pendingApps[0];
    const approveRes = await request(`/applications/${firstApp.id}/approve`, {
      method: 'POST',
      headers: adminAuth,
    });
    console.log('  状态:', approveRes.status, approveRes.data.success ? '✅ 成功' : '❌ 失败');
  }

  // 9. 教务批准第二个申请
  console.log('\n9. 教务批准第二个申请');
  if (pendingApps.length > 1) {
    const secondApp = pendingApps[1];
    const approveRes = await request(`/applications/${secondApp.id}/approve`, {
      method: 'POST',
      headers: adminAuth,
    });
    console.log('  状态:', approveRes.status, approveRes.data.success ? '✅ 成功' : '❌ 失败');
  }

  // 10. 创建考场
  console.log('\n10. 创建考场');
  const roomRes = await request('/exam-rooms', {
    method: 'POST',
    headers: adminAuth,
    body: JSON.stringify({ name: '第一考场', capacity: 50, location: '教学楼A101' }),
  });
  console.log('  状态:', roomRes.status, roomRes.data.success ? '✅ 成功' : '❌ 失败');
  const roomId = roomRes.data.data?.id;
  console.log('  考场ID:', roomId);

  // 11. 查看考场列表（含已用座位）
  console.log('\n11. 查看考场列表');
  const roomsRes = await request('/exam-rooms', { headers: adminAuth });
  console.log('  状态:', roomsRes.status, roomsRes.data.success ? '✅ 成功' : '❌ 失败');
  const rooms = roomsRes.data.data || [];
  rooms.forEach((r) => {
    console.log(`    - ${r.name}: ${r.usedSeats}/${r.capacity} 座位`);
  });

  // 12. 安排第一个考试
  console.log('\n12. 安排高等数学补考');
  const approvedAppsRes = await request('/applications?status=approved', { headers: adminAuth });
  const approvedApps = approvedAppsRes.data?.data || [];
  const mathApps = approvedApps.filter((a) => a.courseName.includes('高数'));
  if (mathApps.length > 0 && roomId) {
    const appIds = mathApps.map((a) => a.id);
    const arrangeRes = await request('/arrangements', {
      method: 'POST',
      headers: adminAuth,
      body: JSON.stringify({
        applicationIds: appIds,
        examRoomId: roomId,
        examDate: '2025-09-15',
        startTime: '09:00',
        endTime: '11:00',
      }),
    });
    console.log('  状态:', arrangeRes.status, arrangeRes.data.success ? '✅ 成功' : '❌ 失败');
    if (!arrangeRes.data.success) {
      console.log('  错误:', arrangeRes.data.error);
    }
  }

  // 13. 查看排考后考场剩余
  console.log('\n13. 排考后查看考场余量');
  const roomsRes2 = await request('/exam-rooms', { headers: adminAuth });
  const rooms2 = roomsRes2.data?.data || [];
  rooms2.forEach((r) => {
    console.log(`    - ${r.name}: ${r.usedSeats}/${r.capacity} 座位`);
  });

  // 14. 安排数据结构考试（同一时间，测试冲突）
  console.log('\n14. 尝试同一时间安排数据结构考试（测试时间冲突）');
  const dsApps = approvedApps.filter((a) => a.courseName.includes('数据结构'));
  if (dsApps.length > 0 && roomId) {
    const appIds = dsApps.map((a) => a.id);
    const arrangeRes = await request('/arrangements', {
      method: 'POST',
      headers: adminAuth,
      body: JSON.stringify({
        applicationIds: appIds,
        examRoomId: roomId,
        examDate: '2025-09-15',
        startTime: '09:00',
        endTime: '11:00',
      }),
    });
    console.log('  状态:', arrangeRes.status);
    console.log('  结果:', arrangeRes.data.success ? '❌ 未检测到冲突' : '✅ 正确检测到冲突');
    console.log('  消息:', arrangeRes.data.error || '成功');
  }

  // 15. 安排数据结构在不同时间
  console.log('\n15. 安排数据结构在下午考试');
  if (dsApps.length > 0 && roomId) {
    const appIds = dsApps.map((a) => a.id);
    const arrangeRes = await request('/arrangements', {
      method: 'POST',
      headers: adminAuth,
      body: JSON.stringify({
        applicationIds: appIds,
        examRoomId: roomId,
        examDate: '2025-09-15',
        startTime: '14:00',
        endTime: '16:00',
      }),
    });
    console.log('  状态:', arrangeRes.status, arrangeRes.data.success ? '✅ 成功' : '❌ 失败');
  }

  // 16. 再次查看考场余量
  console.log('\n16. 第二次排考后考场余量');
  const roomsRes3 = await request('/exam-rooms', { headers: adminAuth });
  const rooms3 = roomsRes3.data?.data || [];
  rooms3.forEach((r) => {
    console.log(`    - ${r.name}: ${r.usedSeats}/${r.capacity} 座位`);
  });

  // 17. 查看排考列表
  console.log('\n17. 查看全部排考安排');
  const arrRes = await request('/arrangements', { headers: adminAuth });
  const arrangements = arrRes.data?.data || [];
  console.log('  总排考数:', arrangements.length);
  arrangements.forEach((a) => {
    if (a.status === 'scheduled') {
      console.log(`    - ${a.courseName} | ${a.studentName} | ${a.examDate} ${a.startTime}-${a.endTime} | ${a.examRoomName}`);
    }
  });

  // 18. 人工覆盖资格
  console.log('\n18. 人工覆盖资格：给一个学生加上补考资格');
  const noQualStudent = quals.find((q) => !q.qualified && q.status === 'active');
  if (noQualStudent) {
    const overrideRes = await request(`/qualifications/${noQualStudent.id}/override`, {
      method: 'POST',
      headers: adminAuth,
      body: JSON.stringify({
        qualified: true,
        reason: '特殊情况处理，经讨论决定给予补考机会',
      }),
    });
    console.log('  状态:', overrideRes.status, overrideRes.data.success ? '✅ 成功' : '❌ 失败');
    console.log('  覆盖的学生:', noQualStudent.studentName, noQualStudent.courseName);
  }

  // 19. 查看阈值
  console.log('\n19. 查看当前补考阈值');
  const threshRes = await request('/threshold', { headers: adminAuth });
  console.log('  当前阈值:', threshRes.data.data?.score, '分');

  // 20. 修改阈值
  console.log('\n20. 修改补考阈值为 50 分');
  const threshUpdateRes = await request('/threshold', {
    method: 'PUT',
    headers: adminAuth,
    body: JSON.stringify({ score: 50 }),
  });
  console.log('  状态:', threshUpdateRes.status, threshUpdateRes.data.success ? '✅ 成功' : '❌ 失败');
  const newQuals = await request('/qualifications', { headers: adminAuth });
  const newQualified = (newQuals.data?.data || []).filter(
    (q) => q.qualified && q.status === 'active'
  );
  console.log('  修改后有资格人数:', newQualified.length);

  // 21. 恢复阈值
  console.log('\n21. 恢复阈值为 60 分');
  await request('/threshold', {
    method: 'PUT',
    headers: adminAuth,
    body: JSON.stringify({ score: 60 }),
  });
  console.log('  已恢复');

  // 22. 测试教师越权
  console.log('\n22. 测试教师越权（教师尝试批准申请）');
  const teacherLogin = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'teacher1', password: 'teacher123', role: 'teacher' }),
  });
  const teacherToken = teacherLogin.data.data?.token;
  if (teacherToken) {
    const tryApprove = await request(`/applications/${pendingApps[0]?.id || 1}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    console.log('  状态:', tryApprove.status === 403 || tryApprove.status === 401 ? '✅ 正确拦截' : '❌ 未拦截');
    console.log('  返回状态码:', tryApprove.status);
  }

  // 23. 取消一个排考，验证座位释放
  console.log('\n23. 取消一个排考（验证座位释放）');
  const firstArr = arrangements.find((a) => a.status === 'scheduled');
  if (firstArr) {
    const cancelArrRes = await request(`/arrangements/${firstArr.id}`, {
      method: 'DELETE',
      headers: adminAuth,
      body: JSON.stringify({ reason: '考场调整，重新安排' }),
    });
    console.log('  状态:', cancelArrRes.status, cancelArrRes.data.success ? '✅ 成功' : '❌ 失败');
    const roomsAfter = await request('/exam-rooms', { headers: adminAuth });
    const r = roomsAfter.data?.data?.find((x) => x.id === roomId);
    console.log(`  取消后考场余量: ${r?.usedSeats}/${r?.capacity} 座位`);
  }

  console.log('\n=== 测试完成 ===');
}

runTests().catch(console.error);
