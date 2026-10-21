'use strict';

VIEWS.attendance = async (id, q) => {
  const dept = q.get('dept') || (state.depts[0] ? state.depts[0].id : '');
  const sem = q.get('sem') || '3';
  const date = q.get('date') || todayISO();
  const tab = q.get('tab') || 'mark';
  const meta = await api(`/api/attendance/meta?department_id=${encodeURIComponent(dept)}&semester=${encodeURIComponent(sem)}`);
  let subject = q.get('subject') || '';
  if (!meta.subjects.includes(subject)) subject = meta.subjects[0] || '';
  const subjects = meta.subjects;
  const tabLink = (t) => {
    const p = new URLSearchParams(q);
    p.set('tab', t);
    return '#/attendance?' + p.toString();
  };
  let body = '';
  if (tab === 'summary') {
    const s = await api(`/api/attendance/summary?department_id=${dept}&semester=${sem}${subject ? '&subject=' + encodeURIComponent(subject) : ''}`);
    body = `
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Roll no</th><th>Student</th><th class="num">Classes</th><th class="num">Attended</th><th style="width:34%">Attendance</th><th>Status</th></tr></thead>
        <tbody>
          ${s.rows.length ? s.rows.map(r => `
            <tr>
              <td class="strong">${esc(r.roll_no)}</td>
              <td>${esc(r.name)}</td>
              <td class="num">${r.total}</td>
              <td class="num">${r.attended}</td>
              <td><div style="display:flex;align-items:center;gap:10px"><div class="progress ${r.percent < 75 ? 'bad' : r.percent < 85 ? 'warn' : 'good'}" style="flex:1"><span style="width:${r.percent}%"></span></div><span style="font-size:12px;font-weight:600">${r.percent}%</span></div></td>
              <td>${r.shortage ? '<span class="badge red">Shortage</span>' : '<span class="badge green">Eligible</span>'}</td>
            </tr>`).join('') : '<tr><td colspan="6" class="empty">No attendance data for this selection</td></tr>'}
        </tbody>
      </table></div>`;
  } else {
    const roster = subject ? await api(`/api/attendance/roster?department_id=${dept}&semester=${sem}&subject=${encodeURIComponent(subject)}&date=${date}`) : { rows: [] };
    state.att = { subject, date, rows: roster.rows.map(r => ({ id: r.id, roll_no: r.roll_no, name: r.name, status: r.status || 'present' })) };
    body = `
      <div class="filterbar" style="border-bottom:1px solid var(--line)">
        <span class="chip">${icon('calendar')} ${fmtDate(date)}</span>
        <span class="chip">${esc(subject || 'No subject')}</span>
        <span style="flex:1"></span>
        <button class="btn sm" data-action="mark-all-present">Mark all present</button>
        <button class="btn sm primary" data-action="save-attendance">${icon('check')} Save attendance</button>
      </div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Roll no</th><th>Student</th><th style="width:190px">Attendance</th></tr></thead>
        <tbody>
          ${state.att.rows.length ? state.att.rows.map(r => `
            <tr data-row="${r.id}">
              <td class="strong">${esc(r.roll_no)}</td>
              <td>${esc(r.name)}</td>
              <td>
                <div class="att-seg" data-id="${r.id}">
                  <button type="button" class="present${r.status === 'present' ? ' on' : ''}" data-action="att-set" data-id="${r.id}" data-status="present">Present</button>
                  <button type="button" class="late${r.status === 'late' ? ' on' : ''}" data-action="att-set" data-id="${r.id}" data-status="late">Late</button>
                  <button type="button" class="absent${r.status === 'absent' ? ' on' : ''}" data-action="att-set" data-id="${r.id}" data-status="absent">Absent</button>
                </div>
              </td>
            </tr>`).join('') : '<tr><td colspan="3" class="empty"><b>No students</b>Choose a department and semester with enrolled students</td></tr>'}
        </tbody>
      </table></div>`;
  }
  document.getElementById('view').innerHTML = `
  ${pageHead('Attendance', 'Daily marking, subject-wise percentages and shortage alerts')}
  <div class="card">
    <div class="filterbar">
      <select class="select" data-nav-param="dept">${deptOptions(dept)}</select>
      <select class="select" data-nav-param="sem">${semOptions(sem)}</select>
      <select class="select" data-nav-param="subject">
        ${subjects.length ? subjects.map(s => `<option value="${esc(s)}"${s === subject ? ' selected' : ''}>${esc(s)}</option>`).join('') : '<option value="">No subjects</option>'}
      </select>
      <input class="input" type="date" value="${esc(date)}" data-nav-param="date" style="max-width:170px">
    </div>
    <div class="tabs">
      <a class="tab ${tab === 'mark' ? 'active' : ''}" href="${tabLink('mark')}">Mark attendance</a>
      <a class="tab ${tab === 'summary' ? 'active' : ''}" href="${tabLink('summary')}">Subject summary</a>
    </div>
    ${body}
  </div>`;
};

VIEWS.timetable = async (id, q) => {
  const dept = q.get('dept') || (state.depts[0] ? state.depts[0].id : '');
  const sem = q.get('sem') || '3';
  const d = await api(`/api/timetable?department_id=${dept}&semester=${sem}`);
  const days = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const periods = [1, 2, 3, 4, 5, 6];
  const grid = {};
  for (const r of d.rows) grid[r.day_of_week + '-' + r.period] = r;
  document.getElementById('view').innerHTML = `
  ${pageHead('Timetable', 'Weekly class schedule by department and semester', canManage() ? `<button class="btn primary" data-action="add-tt" data-dept="${dept}" data-sem="${sem}">${icon('plus')} Add class</button>` : '')}
  <div class="card">
    <div class="filterbar">
      <select class="select" data-nav-param="dept">${deptOptions(dept)}</select>
      <select class="select" data-nav-param="sem">${semOptions(sem)}</select>
      <span class="chip">${icon('calendar')} Mon–Sat · 6 periods</span>
    </div>
    <div class="card-body" style="overflow-x:auto">
      <table class="tt-grid">
        <thead><tr><th style="width:70px">Day</th>${periods.map(p => `<th>Period ${p}</th>`).join('')}</tr></thead>
        <tbody>
          ${[1, 2, 3, 4, 5, 6].map(day => `
            <tr>
              <th style="text-align:left;color:#334155;font-size:12px">${days[day]}</th>
              ${periods.map(p => {
                const cell = grid[day + '-' + p];
                if (!cell) return '<td><div class="tt-cell empty-cell"></div></td>';
                return `<td><div class="tt-cell">
                  <div class="s">${esc(cell.subject)}</div>
                  <div class="f">${esc(cell.faculty_name || '—')}</div>
                  <div class="r">${esc(cell.room || '')}</div>
                  ${canManage() ? `<button class="del" data-action="tt-delete" data-id="${cell.id}" title="Remove">×</button>` : ''}
                </div></td>`;
              }).join('')}
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
};

VIEWS.exams = async (id, q) => {
  const dept = q.get('dept') || (state.depts[0] ? state.depts[0].id : '');
  const sem = q.get('sem') || '3';
  const tab = q.get('tab') || 'list';
  let body = '';
  if (tab === 'results') {
    const r = await api(`/api/exams/results/list?department_id=${dept}&semester=${sem}`);
    const groups = {};
    for (const row of r.rows) {
      const key = row.exam_name + '|' + row.subject + '|' + row.exam_id;
      (groups[key] = groups[key] || []).push(row);
    }
    body = `
      <div class="card-body tight">
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Exam</th><th>Subject</th><th class="num">Entries</th><th class="num">Average</th><th class="num">Max marks</th></tr></thead>
          <tbody>
            ${r.subjects.length ? r.subjects.map(s => `<tr><td class="strong">${esc(s.name)}</td><td>${esc(s.subject)}</td><td class="num">${s.entries}</td><td class="num">${s.average}</td><td class="num">${s.max_marks}</td></tr>`).join('') : '<tr><td colspan="5" class="empty"><b>No published results</b>Publish an exam after entering marks</td></tr>'}
          </tbody>
        </table></div>
      </div>
      ${Object.entries(groups).map(([key, rows]) => `
        <div class="card" style="margin:16px">
          <div class="card-head"><h3>${esc(rows[0].exam_name)} — ${esc(rows[0].subject)}</h3><span class="badge green" style="margin-left:auto">Published</span></div>
          <div class="card-body tight"><div class="table-wrap"><table class="table">
            <thead><tr><th>Roll no</th><th>Student</th><th class="num">Marks</th><th class="num">Percent</th><th>Grade</th></tr></thead>
            <tbody>${rows.map(x => `<tr><td class="strong">${esc(x.roll_no)}</td><td>${esc(x.student_name)}</td><td class="num">${x.marks_obtained === null ? '—' : x.marks_obtained + '/' + x.max_marks}</td><td class="num">${x.percent === null ? '—' : x.percent + '%'}</td><td><span class="badge ${x.grade === 'F' ? 'red' : x.grade === 'O' ? 'green' : 'indigo'}">${x.grade}</span></td></tr>`).join('')}</tbody>
          </table></div></div>
        </div>`).join('')}`;
  } else {
    const d = await api(`/api/exams?department_id=${dept}&semester=${sem}`);
    body = `
      <div class="card-body tight"><div class="table-wrap"><table class="table">
        <thead><tr><th>Exam</th><th>Subject</th><th>Date</th><th class="num">Max marks</th><th>Marks</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${d.rows.length ? d.rows.map(e => `
            <tr>
              <td class="strong">${esc(e.name)}</td>
              <td>${esc(e.subject)}</td>
              <td>${fmtDate(e.exam_date)}<div class="muted">${esc(e.start_time || '')}</div></td>
              <td class="num">${e.max_marks}</td>
              <td>${e.marks_entered}/${e.student_count} entered</td>
              <td>${e.published ? '<span class="badge green">Published</span>' : '<span class="badge gray">Draft</span>'}</td>
              <td><div class="actions">
                <button class="btn sm" data-action="enter-marks" data-id="${e.id}">Enter marks</button>
                ${!e.published && canManage() ? `<button class="btn sm green" data-action="publish-exam" data-id="${e.id}" data-name="${esc(e.name + ' — ' + e.subject)}">Publish</button>` : ''}
              </div></td>
            </tr>`).join('') : '<tr><td colspan="7" class="empty"><b>No exams scheduled</b>Create an exam to begin</td></tr>'}
        </tbody>
      </table></div></div>`;
  }
  const tabLink = (t) => {
    const p = new URLSearchParams(q);
    p.set('tab', t);
    return '#/exams?' + p.toString();
  };
  document.getElementById('view').innerHTML = `
  ${pageHead('Examinations', 'Schedules, marks entry, grades and published results', canManage() ? `<button class="btn primary" data-action="add-exam" data-dept="${dept}" data-sem="${sem}">${icon('plus')} New exam</button>` : '')}
  <div class="card">
    <div class="filterbar">
      <select class="select" data-nav-param="dept">${deptOptions(dept)}</select>
      <select class="select" data-nav-param="sem">${semOptions(sem)}</select>
    </div>
    <div class="tabs">
      <a class="tab ${tab === 'list' ? 'active' : ''}" href="${tabLink('list')}">Exams & marks</a>
      <a class="tab ${tab === 'results' ? 'active' : ''}" href="${tabLink('results')}">Published results</a>
    </div>
    ${body}
  </div>`;
};

function facultyModal(f) {
  openModal(`
    <div class="modal-head"><div><h3>${f ? 'Edit faculty' : 'Add faculty'}</h3><div class="sub">${f ? esc(f.name) : 'Create a staff record'}</div></div><button class="icon-btn close" data-action="close-modal">${icon('x')}</button></div>
    <div class="modal-body">
      <form data-form="faculty-save">
        <input type="hidden" name="id" value="${f ? f.id : ''}">
        <div class="form-grid">
          <div class="field"><label>Full name <span class="req">*</span></label><input class="input" name="name" required value="${esc(f ? f.name : '')}"></div>
          <div class="field"><label>Email</label><input class="input" name="email" type="email" value="${esc(f ? f.email : '')}"></div>
          <div class="field"><label>Phone</label><input class="input" name="phone" value="${esc(f ? f.phone : '')}"></div>
          <div class="field"><label>Department <span class="req">*</span></label><select class="select" name="department_id" required>${deptOptions(f ? f.department_id : '')}</select></div>
          <div class="field"><label>Designation</label><input class="input" name="designation" value="${esc(f ? f.designation : '')}" placeholder="Assistant Professor"></div>
          <div class="field"><label>Qualification</label><input class="input" name="qualification" value="${esc(f ? f.qualification : '')}" placeholder="Ph.D. / M.Tech"></div>
          <div class="field"><label>Join date</label><input class="input" name="join_date" type="date" value="${esc(f ? f.join_date : todayISO())}"></div>
          <div class="field"><label>Status</label><select class="select" name="status"><option value="active"${!f || f.status === 'active' ? ' selected' : ''}>Active</option><option value="inactive"${f && f.status === 'inactive' ? ' selected' : ''}>Inactive</option></select></div>
        </div>
        <div class="form-actions"><button type="button" class="btn" data-action="close-modal">Cancel</button><button class="btn primary" type="submit">${f ? 'Save changes' : 'Add faculty'}</button></div>
      </form>
    </div>`, true);
}

VIEWS.faculty = async (id, q) => {
  const params = new URLSearchParams();
  if (q.get('q')) params.set('q', q.get('q'));
  if (q.get('dept')) params.set('department_id', q.get('dept'));
  const d = await api('/api/faculty?' + params.toString());
  document.getElementById('view').innerHTML = `
  ${pageHead('Faculty & HR', d.rows.length + ' staff records', canManage() ? `<button class="btn primary" data-action="add-faculty">${icon('plus')} Add faculty</button>` : '')}
  <div class="card">
    <form class="filterbar" data-form="faculty-filter">
      <div class="search-wrap">${icon('search')}<input class="input" name="q" placeholder="Search name, email, designation" value="${esc(q.get('q') || '')}"></div>
      <select class="select" data-nav-param="dept"><option value="">All departments</option>${deptOptions(q.get('dept'))}</select>
      <button class="btn sm" type="submit">Search</button>
    </form>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Name</th><th>Department</th><th>Designation</th><th>Qualification</th><th>Joined</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${d.rows.length ? d.rows.map(f => `
          <tr>
            <td><div class="strong">${esc(f.name)}</div><div class="muted">${esc(f.email || f.phone || '')}</div></td>
            <td>${esc(f.dept_code || '—')}</td>
            <td>${esc(f.designation || '—')}</td>
            <td class="muted">${esc(f.qualification || '—')}</td>
            <td>${fmtDate(f.join_date)}</td>
            <td><span class="badge ${f.status === 'active' ? 'green' : 'gray'}">${stageLabel(f.status)}</span></td>
            <td><div class="actions">${canManage() ? `<button class="btn sm ghost" data-action="edit-faculty" data-id="${f.id}">Edit</button>` : ''}</div></td>
          </tr>`).join('') : '<tr><td colspan="7" class="empty"><b>No faculty found</b>Adjust the search or add a new record</td></tr>'}
      </tbody>
    </table></div>
  </div>`;
};

VIEWS.notices = async (id, q) => {
  const audience = q.get('audience') || '';
  const d = await api('/api/notices' + (audience ? '?audience=' + encodeURIComponent(audience) : ''));
  const tabLink = (a) => {
    const p = new URLSearchParams(q);
    if (a) p.set('audience', a); else p.delete('audience');
    return '#/notices?' + p.toString();
  };
  document.getElementById('view').innerHTML = `
  ${pageHead('Notice board', 'Announcements for students and faculty', `<button class="btn primary" data-action="add-notice">${icon('plus')} New notice</button>`)}
  <div class="card">
    <div class="tabs">
      <a class="tab ${!audience ? 'active' : ''}" href="${tabLink('')}">All notices</a>
      <a class="tab ${audience === 'students' ? 'active' : ''}" href="${tabLink('students')}">Students</a>
      <a class="tab ${audience === 'faculty' ? 'active' : ''}" href="${tabLink('faculty')}">Faculty</a>
    </div>
    <div class="card-body">
      <div class="stack">
        ${d.rows.length ? d.rows.map(n => `
          <div class="card" style="box-shadow:none">
            <div class="card-body">
              <div style="display:flex;gap:10px;align-items:flex-start">
                <div style="flex:1">
                  <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:6px">
                    ${n.pinned ? '<span class="badge indigo">Pinned</span>' : ''}
                    <span class="badge blue">${esc(n.category || 'General')}</span>
                    <span class="chip">${esc(stageLabel(n.audience))}</span>
                  </div>
                  <h3 style="font-size:15px;margin-bottom:6px">${esc(n.title)}</h3>
                  <p style="color:#475569;font-size:13px;line-height:1.6">${esc(n.body)}</p>
                  <div class="muted" style="font-size:11.5px;margin-top:8px">${esc(n.author || 'Institute')} · ${fmtDate(n.created_at)}</div>
                </div>
                ${canManage() ? `<button class="btn sm danger" data-action="delete-notice" data-id="${n.id}">Delete</button>` : ''}
              </div>
            </div>
          </div>`).join('') : '<div class="empty"><b>No notices published</b>Create an announcement to reach students and faculty</div>'}
      </div>
    </div>
  </div>`;
};

VIEWS.scholarships = async (id, q) => {
  const params = new URLSearchParams();
  ['q', 'stage'].forEach(k => { if (q.get(k)) params.set(k, q.get(k)); });
  const d = await api('/api/scholarships?' + params.toString());
  const stages = ['draft', 'institute_verified', 'submitted', 'approved', 'disbursed', 'rejected'];
  const total = d.summary.total;
  const tabLink = (s) => {
    const p = new URLSearchParams(q);
    if (s) p.set('stage', s); else p.delete('stage');
    return '#/scholarships?' + p.toString();
  };
  document.getElementById('view').innerHTML = `
  ${pageHead('Scholarships (MahaDBT)', 'Institute-side scholarship workflow and portal submission tracking',
    `${canManage() ? `<button class="btn primary" data-action="add-scholarship">${icon('plus')} New application</button>` : ''}
     <a class="btn" href="/api/scholarships/export.csv?academic_year=2026-27" download>${icon('download')} Export CSV</a>
     ${isAdmin() ? `<button class="btn" data-action="sch-settings">${icon('settings')} Integration</button>` : ''}`)}
  <div class="grid grid-4">
    <div class="card stat"><div class="stat-top"><span class="label">Total applications</span><span class="stat-icon tint-indigo">${icon('award')}</span></div><div class="value">${total}</div><div class="hint">${d.summary.institute_verified + d.summary.draft} awaiting institute action</div></div>
    <div class="card stat"><div class="stat-top"><span class="label">With MahaDBT</span><span class="stat-icon tint-blue">${icon('send')}</span></div><div class="value">${d.summary.submitted}</div><div class="hint">${d.summary.rejected} rejected by portal</div></div>
    <div class="card stat"><div class="stat-top"><span class="label">Sanctioned</span><span class="stat-icon tint-amber">${icon('file')}</span></div><div class="value">${fmtINR(d.summary.sanctioned_amount)}</div><div class="hint">${d.summary.approved} approvals received</div></div>
    <div class="card stat"><div class="stat-top"><span class="label">Disbursed</span><span class="stat-icon tint-green">${icon('card')}</span></div><div class="value">${fmtINR(d.summary.disbursed_amount)}</div><div class="hint">${d.summary.disbursed} students paid</div></div>
  </div>
  <div class="card" style="margin-top:16px">
    <div class="tabs">
      <a class="tab ${!q.get('stage') ? 'active' : ''}" href="${tabLink('')}">All <span class="count">${total}</span></a>
      ${stages.map(s => `<a class="tab ${q.get('stage') === s ? 'active' : ''}" href="${tabLink(s)}">${stageLabel(s)} <span class="count">${d.summary[s] || 0}</span></a>`).join('')}
    </div>
    <form class="filterbar" data-form="scholarship-filter">
      <div class="search-wrap">${icon('search')}<input class="input" name="q" placeholder="Search student, roll no, application no" value="${esc(q.get('q') || '')}"></div>
      <button class="btn sm" type="submit">Search</button>
    </form>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Student</th><th>Scheme</th><th>MahaDBT no</th><th class="num">Amount</th><th>Docs</th><th>Stage</th><th></th></tr></thead>
      <tbody>
        ${d.rows.length ? d.rows.map(s => `
          <tr>
            <td><div class="strong">${esc(s.student_name)}</div><div class="muted">${esc(s.roll_no)} · ${esc(s.dept_code)} · ${esc(s.category)}</div></td>
            <td><div class="td-wrap">${esc(s.scheme)}</div><div class="muted">${esc(s.academic_year)}</div></td>
            <td>${esc(s.mahabdt_app_no || '—')}</td>
            <td class="num strong">${fmtINR(s.amount)}</td>
            <td>${s.pending_docs ? `<span class="badge amber">${s.pending_docs} pending</span>` : '<span class="badge green">Complete</span>'}</td>
            <td>${badgeFor(s.stage)}</td>
            <td><div class="actions"><button class="btn sm" data-action="view-scholarship" data-id="${s.id}">Open</button></div></td>
          </tr>`).join('') : '<tr><td colspan="7" class="empty"><b>No scholarship applications</b>Create an application to start the MahaDBT workflow</td></tr>'}
      </tbody>
    </table></div>
  </div>`;
};

async function showScholarshipDetail(id) {
  const d = await api('/api/scholarships/' + id);
  const sc = d.scholarship;
  const canAct = canManage();
  const docOptions = (current) => ['pending', 'uploaded', 'verified'].map(s => `<option value="${s}"${current === s ? ' selected' : ''}>${stageLabel(s)}</option>`).join('');
  let actions = '';
  if (canAct) {
    if (sc.stage === 'draft') actions += `<button class="btn primary" data-action="sch-verify" data-id="${sc.id}">${icon('check')} Verify documents</button>`;
    if (sc.stage === 'institute_verified') actions += `<button class="btn primary" data-action="sch-sync" data-id="${sc.id}">${icon('send')} Submit to MahaDBT</button>`;
    if (sc.stage === 'submitted') {
      actions += `<button class="btn green" data-action="sch-stage" data-id="${sc.id}" data-stage="approved">Record approval</button>`;
      actions += `<button class="btn danger" data-action="sch-stage" data-id="${sc.id}" data-stage="rejected">Record rejection</button>`;
      actions += `<button class="btn" data-action="sch-sync" data-id="${sc.id}">${icon('refresh')} Check status</button>`;
    }
    if (sc.stage === 'approved') actions += `<button class="btn primary" data-action="sch-stage" data-id="${sc.id}" data-stage="disbursed">Mark disbursed</button>`;
    if (sc.stage === 'rejected') actions += `<button class="btn" data-action="sch-stage" data-id="${sc.id}" data-stage="institute_verified">Re-open for resubmission</button>`;
  }
  openModal(`
    <div class="modal-head">
      <div><h3>${esc(sc.scheme)}</h3><div class="sub">${esc(sc.student_name)} · ${esc(sc.roll_no)} · ${esc(sc.dept_code)}</div></div>
      <button class="icon-btn close" data-action="close-modal">${icon('x')}</button>
    </div>
    <div class="modal-body">
      <div class="grid grid-2" style="gap:20px">
        <div>
          <div class="section-title">Application</div>
          <div class="kv">
            <span class="k">Student</span><span class="v">${esc(sc.student_name)} (${esc(sc.roll_no)})</span>
            <span class="k">Category</span><span class="v">${esc(sc.category)}</span>
            <span class="k">Program</span><span class="v">${esc(sc.program)} · Semester ${sc.semester}</span>
            <span class="k">Academic year</span><span class="v">${esc(sc.academic_year)}</span>
            <span class="k">MahaDBT app no</span><span class="v">${esc(sc.mahabdt_app_no || 'Not submitted')}</span>
            <span class="k">Amount</span><span class="v">${fmtINR(sc.amount)}</span>
            <span class="k">Stage</span><span class="v">${badgeFor(sc.stage)}</span>
            ${sc.status_note ? `<span class="k">Notes</span><span class="v">${esc(sc.status_note)}</span>` : ''}
          </div>
          <div class="section-title">Document checklist</div>
          ${d.docs.map(doc => `
            <div class="doc-row">
              <span class="dn">${esc(doc.doc_type)}</span>
              ${canAct && (sc.stage === 'draft' || sc.stage === 'institute_verified')
                ? `<select class="select" style="max-width:130px;padding:4px 8px;font-size:12px" data-change-action="doc-status" data-id="${sc.id}" data-doc="${esc(doc.doc_type)}">${docOptions(doc.status)}</select>`
                : badgeFor(doc.status)}
            </div>`).join('')}
          ${canAct ? `<div class="integration-note indigo" style="margin-top:12px">Set every document to Verified, then use Verify documents. Submission to MahaDBT follows in the next step.</div>` : ''}
        </div>
        <div>
          <div class="section-title">Activity timeline</div>
          <div class="timeline">
            ${d.events.map(ev => `
              <div class="tl-item">
                <div class="tl-dot"></div>
                <div><div class="tt">${esc(ev.action)}</div><div class="td">${esc(ev.detail || '')}</div><div class="td">${esc(ev.actor || 'system')} · ${fmtDate(ev.created_at)}</div></div>
              </div>`).join('')}
          </div>
          <div class="integration-note" style="margin-top:8px">
            Status changes recorded here represent the institute's copy of the MahaDBT response. The live portal remains the system of record for sanction and disbursement.
          </div>
        </div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn" data-action="close-modal">Close</button>
      ${actions}
    </div>`, true);
}

VIEWS.settings = async () => {
  const d = await api('/api/scholarships/settings');
  const s = d.settings;
  document.getElementById('view').innerHTML = `
  ${pageHead('Settings', 'Institute profile and MahaDBT integration configuration')}
  <div class="grid grid-2">
    <div class="card">
      <div class="card-head"><h3>Institute profile</h3></div>
      <div class="card-body">
        <form data-form="settings-save">
          <div class="stack">
            <div class="field"><label>Institute name</label><input class="input" name="institute_name" value="${esc(s.instituteName)}"></div>
            <div class="field"><label>Institute code</label><input class="input" name="institute_code" value="${esc(s.instituteCode)}"></div>
            <div class="field"><label>MahaDBT institute code</label><input class="input" name="mahabdt_institute_code" value="${esc(s.mahabdtInstituteCode)}"></div>
            <div class="field"><label>MahaDBT institute login ID</label><input class="input" name="mahabdt_user_id" value="${esc(s.userId)}"></div>
            <div class="field"><label>Portal API base URL</label><input class="input" name="mahabdt_api_base" value="${esc(s.apiBase)}"></div>
            <div class="field"><label>Integration mode</label>
              <select class="select" name="mahabdt_mode">
                <option value="sandbox"${s.mode === 'sandbox' ? ' selected' : ''}>Sandbox (demo — no government calls)</option>
                <option value="live"${s.mode === 'live' ? ' selected' : ''}>Live (requires official API access)</option>
              </select>
            </div>
          </div>
          <div class="form-actions"><button class="btn primary" type="submit">Save settings</button></div>
        </form>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><h3>MahaDBT integration notes</h3></div>
      <div class="card-body">
        <div class="integration-note">
          MahaDBT does not publish an open API. Institute-level API access is provided by the Maharashtra government only to onboarded institutes, after a formal request, agreement and IP whitelisting. This prototype ships with a sandbox adapter so the complete institute workflow can be demonstrated without credentials.
        </div>
        <div class="section-title">Production integration checklist</div>
        <div class="kv">
          <span class="k">1. Access request</span><span class="v">Apply to MahaDBT / DHE for institute API onboarding</span>
          <span class="k">2. Credentials</span><span class="v">Store client ID and secret in environment variables, never in the database</span>
          <span class="k">3. Whitelisting</span><span class="v">Register the production server IP with the portal</span>
          <span class="k">4. Signing</span><span class="v">Implement the signed request flow in services/mahadbt.js</span>
          <span class="k">5. Reconciliation</span><span class="v">Map sanction and disbursement callbacks to scholarship stages</span>
        </div>
        <div class="section-title">Demo safety</div>
        <div class="muted" style="font-size:12.5px;line-height:1.6">In sandbox mode, submitting an application generates a mock reference number. No data leaves this server, and no external requests are made.</div>
      </div>
    </div>
  </div>`;
};
