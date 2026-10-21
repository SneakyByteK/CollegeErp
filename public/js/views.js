'use strict';

const VIEWS = {};

function deptOptions(selected) {
  return state.depts.map(d => '<option value="' + d.id + '"' + (String(d.id) === String(selected) ? ' selected' : '') + '>' + esc(d.code) + ' — ' + esc(d.name) + '</option>').join('');
}
function semOptions(selected, includeAll) {
  let html = includeAll ? '<option value="">All semesters</option>' : '';
  for (let i = 1; i <= 8; i++) html += '<option value="' + i + '"' + (String(i) === String(selected) ? ' selected' : '') + '>Semester ' + i + '</option>';
  return html;
}
function pageHead(title, sub, actions) {
  return '<div class="page-head"><div><h1>' + esc(title) + '</h1>' + (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') + '</div><div class="page-actions">' + (actions || '') + '</div></div>';
}
function badgeFor(status) {
  const map = {
    active: 'green', graduated: 'blue', dropped: 'gray',
    paid: 'green', partial: 'amber', pending: 'red',
    draft: 'gray', institute_verified: 'blue', submitted: 'indigo', approved: 'amber', disbursed: 'green', rejected: 'red',
    enquiry: 'gray', applied: 'blue', verified: 'indigo', enrolled: 'green',
    uploaded: 'blue'
  };
  return '<span class="badge ' + (map[status] || 'gray') + '">' + stageLabel(status) + '</span>';
}
function studentOptions(students) {
  return students.map(s => '<option value="' + s.id + '">' + esc(s.roll_no) + ' — ' + esc(s.name) + ' (' + esc(s.dept_code) + ')</option>').join('');
}

function studentForm(s) {
  return `
  <form data-form="student-save">
    <input type="hidden" name="id" value="${s && s.id ? s.id : ''}">
    <div class="form-grid">
      <div class="field"><label>Roll number <span class="req">*</span></label><input class="input" name="roll_no" required value="${esc(s ? s.roll_no : '')}" placeholder="CS2026001"></div>
      <div class="field"><label>Full name <span class="req">*</span></label><input class="input" name="name" required value="${esc(s ? s.name : '')}"></div>
      <div class="field"><label>Email</label><input class="input" name="email" type="email" value="${esc(s ? s.email : '')}"></div>
      <div class="field"><label>Phone</label><input class="input" name="phone" value="${esc(s ? s.phone : '')}"></div>
      <div class="field"><label>Department <span class="req">*</span></label><select class="select" name="department_id" required>${deptOptions(s ? s.department_id : '')}</select></div>
      <div class="field"><label>Program <span class="req">*</span></label><select class="select" name="program">${['B.Tech', 'MBA', 'MCA', 'BBA', 'B.Sc', 'M.Tech'].map(p => '<option' + (s && s.program === p ? ' selected' : '') + '>' + p + '</option>').join('')}</select></div>
      <div class="field"><label>Semester <span class="req">*</span></label><select class="select" name="semester">${semOptions(s ? s.semester : 1)}</select></div>
      <div class="field"><label>Batch year <span class="req">*</span></label><input class="input" name="batch_year" type="number" min="2000" max="2100" value="${s ? s.batch_year : new Date().getFullYear()}"></div>
      <div class="field"><label>Gender</label><select class="select" name="gender">${['Male', 'Female', 'Other'].map(g => '<option' + (s && s.gender === g ? ' selected' : '') + '>' + g + '</option>').join('')}</select></div>
      <div class="field"><label>Date of birth</label><input class="input" name="dob" type="date" value="${esc(s ? s.dob : '')}"></div>
      <div class="field"><label>Category</label><select class="select" name="category">${['OPEN', 'OBC', 'SC', 'ST', 'EWS', 'VJNT', 'NT', 'SBC', 'Minority'].map(c => '<option' + (s && s.category === c ? ' selected' : '') + '>' + c + '</option>').join('')}</select></div>
      <div class="field"><label>Status</label><select class="select" name="status">${['active', 'graduated', 'dropped'].map(st => '<option value="' + st + '"' + (s && s.status === st ? ' selected' : '') + '>' + stageLabel(st) + '</option>').join('')}</select></div>
      <div class="field"><label>Guardian name</label><input class="input" name="guardian_name" value="${esc(s ? s.guardian_name : '')}"></div>
      <div class="field"><label>Guardian phone</label><input class="input" name="guardian_phone" value="${esc(s ? s.guardian_phone : '')}"></div>
      <div class="field full"><label>Address</label><input class="input" name="address" value="${esc(s ? s.address : '')}"></div>
      <div class="field"><label>Admission date</label><input class="input" name="admission_date" type="date" value="${esc(s ? s.admission_date : todayISO())}"></div>
    </div>
    <div class="form-actions"><button type="button" class="btn" data-action="close-modal">Cancel</button><button class="btn primary" type="submit">${s && s.id ? 'Save changes' : 'Create student'}</button></div>
  </form>`;
}

function receiptHTML(c) {
  return `
  <div class="receipt">
    <div class="receipt-head">
      <div>
        <div class="inst">Vidyanagar Institute of Technology</div>
        <div class="addr">Survey No. 42, Shivaji Nagar, Pune 411005 · Affiliated to SPPU</div>
      </div>
      <div class="rc">
        <div class="no">${esc(c.receipt_no || '—')}</div>
        <div class="addr">Fee receipt</div>
        <div class="addr">${fmtDate(c.paid_on)}</div>
      </div>
    </div>
    <div class="receipt-meta">
      <div><span class="k">Student:</span> <b>${esc(c.student_name)}</b></div>
      <div><span class="k">Roll no:</span> <b>${esc(c.roll_no)}</b></div>
      <div><span class="k">Program:</span> ${esc(c.program || '')}</div>
      <div><span class="k">Department:</span> ${esc(c.dept_code)} — ${esc(c.department)}</div>
      <div><span class="k">Challan:</span> ${esc(c.challan_no)}</div>
      <div><span class="k">Mode:</span> ${esc(c.mode || '—')}</div>
    </div>
    <table class="receipt-table">
      <thead><tr><th>Particulars</th><th style="text-align:right">Amount</th></tr></thead>
      <tbody>
        <tr><td>${esc(c.fee_type)}</td><td style="text-align:right">${fmtINR(c.amount)}</td></tr>
        <tr><td>Total paid till date</td><td style="text-align:right">${fmtINR(c.paid_amount)}</td></tr>
        <tr><td>Balance</td><td style="text-align:right">${fmtINR(c.amount - c.paid_amount)}</td></tr>
      </tbody>
    </table>
    <div class="receipt-total">Amount received: <span class="big">${fmtINR(c.paid_amount)}</span></div>
    <div class="receipt-foot"><span>This is a computer generated receipt.</span><span>Accounts Office</span></div>
  </div>`;
}

VIEWS.dashboard = async () => {
  const d = await api('/api/dashboard');
  const view = document.getElementById('view');
  const pipelineOrder = ['enquiry', 'applied', 'verified', 'approved', 'enrolled', 'rejected'];
  const maxPipeline = Math.max(1, ...pipelineOrder.map(k => d.pipeline[k]));
  view.innerHTML = `
  <div class="page-head">
    <div><h1>Dashboard</h1><div class="sub">Academic year 2026-27 · Live institute overview</div></div>
    <div class="page-actions">
      <a class="btn" href="#/notices">${icon('bell')} Notice board</a>
      ${canManage() ? '<a class="btn primary" href="#/admissions">' + icon('userplus') + ' New admission</a>' : ''}
    </div>
  </div>
  <div class="grid grid-4">
    <div class="card stat">
      <div class="stat-top"><span class="label">Active students</span><span class="stat-icon tint-indigo">${icon('users')}</span></div>
      <div class="value">${fmtNum(d.students)}</div>
      <div class="hint"><b>+${d.admissions30}</b> admission enquiries in last 30 days</div>
    </div>
    <div class="card stat">
      <div class="stat-top"><span class="label">Fees collected</span><span class="stat-icon tint-green">${icon('card')}</span></div>
      <div class="value">${fmtINR(d.fees.collected)}</div>
      <div class="hint">${fmtINR(d.fees.due)} outstanding across ${d.departmentCount} departments</div>
    </div>
    <div class="card stat">
      <div class="stat-top"><span class="label">Attendance (30 days)</span><span class="stat-icon tint-blue">${icon('check')}</span></div>
      <div class="value">${d.attendanceRate}%</div>
      <div class="hint">${fmtNum(d.faculty)} active faculty members</div>
    </div>
    <div class="card stat">
      <div class="stat-top"><span class="label">Scholarships pending</span><span class="stat-icon tint-amber">${icon('award')}</span></div>
      <div class="value">${fmtNum(d.scholarships.pending)}</div>
      <div class="hint">${fmtINR(d.scholarships.disbursed)} disbursed · ${fmtINR(d.scholarships.sanctioned)} sanctioned</div>
    </div>
  </div>
  <div class="grid grid-2-1" style="margin-top:16px">
    <div class="card">
      <div class="card-head"><h3>Fee collection trend</h3><span class="sub" style="margin-left:auto">Last 6 months</span></div>
      <div class="card-body"><div style="height:270px"><canvas id="feeChart"></canvas></div></div>
    </div>
    <div class="card">
      <div class="card-head"><h3>Attendance by department</h3><span class="sub" style="margin-left:auto">30 days</span></div>
      <div class="card-body"><div style="height:270px"><canvas id="attChart"></canvas></div></div>
    </div>
  </div>
  <div class="grid grid-3" style="margin-top:16px">
    <div class="card">
      <div class="card-head"><h3>Admission pipeline</h3></div>
      <div class="card-body">
        <div class="pipeline">
          ${pipelineOrder.map(k => `
            <div class="pipeline-row">
              <span class="name">${stageLabel(k)}</span>
              <div class="pipeline-bar"><span style="width:${Math.round((d.pipeline[k] / maxPipeline) * 100)}%;${k === 'rejected' ? 'background:#dc2626' : k === 'enrolled' ? 'background:#059669' : ''}"></span></div>
              <span class="val">${d.pipeline[k]}</span>
            </div>`).join('')}
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><h3>Top outstanding dues</h3></div>
      <div class="card-body tight">
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Student</th><th class="num">Due</th></tr></thead>
          <tbody>
            ${d.topDues.length ? d.topDues.map(s => `<tr><td><div class="strong">${esc(s.name)}</div><div class="muted">${esc(s.roll_no)} · ${esc(s.department)}</div></td><td class="num strong" style="color:#dc2626">${fmtINR(s.due)}</td></tr>`).join('') : '<tr><td colspan="2" class="empty">No outstanding dues</td></tr>'}
          </tbody>
        </table></div>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><h3>Latest notices</h3><a href="#/notices" class="sub" style="margin-left:auto">View all</a></div>
      <div class="notice-list">
        ${d.notices.map(n => `<div class="notice-item"><div class="t">${n.pinned ? '<span class="badge indigo">Pinned</span>' : ''} ${esc(n.title)}</div><div class="m">${esc(n.category || 'General')} · ${fmtDate(n.created_at)}</div></div>`).join('')}
      </div>
    </div>
  </div>
  <div class="card" style="margin-top:16px">
    <div class="card-head"><h3>Upcoming examinations</h3></div>
    <div class="card-body tight"><div class="table-wrap"><table class="table">
      <thead><tr><th>Exam</th><th>Subject</th><th>Department</th><th>Date</th><th>Time</th></tr></thead>
      <tbody>
        ${d.upcomingExams.length ? d.upcomingExams.map(e => `<tr><td class="strong">${esc(e.name)}</td><td>${esc(e.subject)}</td><td>${esc(e.department)}</td><td>${fmtDate(e.exam_date)}</td><td>${esc(e.start_time || '—')}</td></tr>`).join('') : '<tr><td colspan="5" class="empty">No upcoming exams scheduled</td></tr>'}
      </tbody>
    </table></div></div>
  </div>`;

  if (window.Chart) {
    const feeEl = document.getElementById('feeChart');
    if (feeEl) {
      state.charts.push(new Chart(feeEl, {
        type: 'bar',
        data: {
          labels: d.feeTrend.map(x => x.month),
          datasets: [{ data: d.feeTrend.map(x => x.amount), backgroundColor: '#6366f1', hoverBackgroundColor: '#4338ca', borderRadius: 7, maxBarThickness: 38 }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: c => fmtINR(c.raw) } }
          },
          scales: {
            x: { grid: { display: false }, border: { display: false } },
            y: {
              beginAtZero: true, grid: { color: '#f1f5f9' }, border: { display: false },
              ticks: { callback: v => v >= 100000 ? '₹' + (v / 100000) + 'L' : '₹' + v }
            }
          }
        }
      }));
    }
    const attEl = document.getElementById('attChart');
    if (attEl) {
      state.charts.push(new Chart(attEl, {
        type: 'doughnut',
        data: {
          labels: d.attByDept.map(x => x.code),
          datasets: [{
            data: d.attByDept.map(x => x.rate),
            backgroundColor: ['#6366f1', '#22c55e', '#f59e0b', '#06b6d4', '#ec4899', '#8b5cf6'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '62%',
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 9, boxHeight: 9, usePointStyle: true, font: { size: 11 } } },
            tooltip: { callbacks: { label: c => c.label + ': ' + c.raw + '%' } }
          }
        }
      }));
    }
  }
};

VIEWS.students = async (id, q) => {
  if (id) return renderStudentDetail(id);
  const params = new URLSearchParams();
  ['q', 'dept', 'sem', 'status', 'page'].forEach(k => { if (q.get(k)) params.set(k, q.get(k)); });
  params.set('pageSize', '15');
  const d = await api('/api/students?' + params.toString());
  const totalPages = Math.max(1, Math.ceil(d.total / d.pageSize));
  const link = (page) => {
    const p = new URLSearchParams(q);
    p.set('page', page);
    return '#/students?' + p.toString();
  };
  document.getElementById('view').innerHTML = `
  ${pageHead('Students', fmtNum(d.total) + ' student records · searchable directory', canManage() ? `<button class="btn primary" data-action="add-student">${icon('plus')} Add student</button>` : '')}
  <div class="card">
    <form class="filterbar" data-form="student-filter">
      <div class="search-wrap">${icon('search')}<input class="input" name="q" placeholder="Search name, roll no or email" value="${esc(q.get('q') || '')}"></div>
      <select class="select" data-nav-param="dept"><option value="">All departments</option>${deptOptions(q.get('dept'))}</select>
      <select class="select" data-nav-param="sem">${semOptions(q.get('sem'), true)}</select>
      <select class="select" data-nav-param="status">
        <option value="">All statuses</option>
        ${['active', 'graduated', 'dropped'].map(s => `<option value="${s}"${q.get('status') === s ? ' selected' : ''}>${stageLabel(s)}</option>`).join('')}
      </select>
      <button class="btn sm" type="submit">Search</button>
    </form>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Roll no</th><th>Student</th><th>Department</th><th>Sem</th><th>Category</th><th class="num">Outstanding</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${d.rows.length ? d.rows.map(s => `
          <tr>
            <td class="strong">${esc(s.roll_no)}</td>
            <td><div class="strong">${esc(s.name)}</div><div class="muted">${esc(s.email || s.phone || '')}</div></td>
            <td>${esc(s.dept_code)} <span class="muted">${esc(s.department)}</span></td>
            <td>${s.semester}</td>
            <td><span class="chip">${esc(s.category)}</span></td>
            <td class="num ${s.due_amount > 0 ? 'strong' : ''}" ${s.due_amount > 0 ? 'style="color:#dc2626"' : ''}>${fmtINR(s.due_amount)}</td>
            <td>${badgeFor(s.status)}</td>
            <td><div class="actions">
              <a class="btn sm" href="#/students/${s.id}">View</a>
              ${canManage() ? `<button class="btn sm ghost" data-action="edit-student" data-id="${s.id}">Edit</button>` : ''}
            </div></td>
          </tr>`).join('') : `<tr><td colspan="8" class="empty"><b>No students found</b>Try a different search or filter</td></tr>`}
      </tbody>
    </table></div>
    <div class="pagination">
      <span>Page ${d.page} of ${totalPages} · ${fmtNum(d.total)} records</span>
      <span class="spacer"></span>
      ${d.page > 1 ? `<a class="btn sm" href="${link(d.page - 1)}">Previous</a>` : '<button class="btn sm" disabled>Previous</button>'}
      ${d.page < totalPages ? `<a class="btn sm" href="${link(d.page + 1)}">Next</a>` : '<button class="btn sm" disabled>Next</button>'}
    </div>
  </div>`;
};

async function renderStudentDetail(id) {
  const d = await api('/api/students/' + id);
  const s = d.student;
  const billed = d.challans.reduce((a, c) => a + c.amount, 0);
  const paid = d.challans.reduce((a, c) => a + c.paid_amount, 0);
  const attTotal = d.attendance.reduce((a, x) => a + x.total, 0);
  const attAttended = d.attendance.reduce((a, x) => a + x.attended, 0);
  document.getElementById('view').innerHTML = `
  <div class="page-head">
    <div>
      <div class="sub" style="margin-bottom:6px"><a href="#/students">Students</a> / ${esc(s.roll_no)}</div>
      <h1>${esc(s.name)}</h1>
      <div class="sub">${esc(s.program)} · ${esc(s.department)} · Semester ${s.semester} · Batch ${s.batch_year}</div>
    </div>
    <div class="page-actions">
      <a class="btn" href="#/students">${icon('arrowLeft')} Back</a>
      ${canManage() ? `<button class="btn primary" data-action="edit-student" data-id="${s.id}">Edit student</button>` : ''}
    </div>
  </div>
  <div class="grid grid-4">
    <div class="card stat"><div class="stat-top"><span class="label">Total billed</span><span class="stat-icon tint-indigo">${icon('card')}</span></div><div class="value">${fmtINR(billed)}</div><div class="hint">${d.challans.length} challans</div></div>
    <div class="card stat"><div class="stat-top"><span class="label">Outstanding</span><span class="stat-icon tint-red">${icon('card')}</span></div><div class="value" style="color:${billed - paid > 0 ? '#dc2626' : '#059669'}">${fmtINR(billed - paid)}</div><div class="hint">${billed - paid > 0 ? 'Payment pending' : 'All clear'}</div></div>
    <div class="card stat"><div class="stat-top"><span class="label">Attendance</span><span class="stat-icon tint-green">${icon('check')}</span></div><div class="value">${pct(attAttended, attTotal)}%</div><div class="hint">${attAttended}/${attTotal} classes attended</div></div>
    <div class="card stat"><div class="stat-top"><span class="label">Scholarships</span><span class="stat-icon tint-amber">${icon('award')}</span></div><div class="value">${d.scholarships.length}</div><div class="hint">${fmtINR(d.scholarships.reduce((a, x) => a + x.amount, 0))} applied value</div></div>
  </div>
  <div class="grid grid-2" style="margin-top:16px">
    <div class="card">
      <div class="card-head"><h3>Student profile</h3><span class="badge ${s.status === 'active' ? 'green' : 'gray'}" style="margin-left:auto">${stageLabel(s.status)}</span></div>
      <div class="card-body">
        <div class="kv">
          <span class="k">Roll number</span><span class="v">${esc(s.roll_no)}</span>
          <span class="k">Email</span><span class="v">${esc(s.email || '—')}</span>
          <span class="k">Phone</span><span class="v">${esc(s.phone || '—')}</span>
          <span class="k">Gender / DOB</span><span class="v">${esc(s.gender || '—')} · ${fmtDate(s.dob)}</span>
          <span class="k">Category</span><span class="v">${esc(s.category)}</span>
          <span class="k">Guardian</span><span class="v">${esc(s.guardian_name || '—')} ${s.guardian_phone ? '· ' + esc(s.guardian_phone) : ''}</span>
          <span class="k">Address</span><span class="v">${esc(s.address || '—')}</span>
          <span class="k">Admission date</span><span class="v">${fmtDate(s.admission_date)}</span>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><h3>Fee challans</h3></div>
      <div class="card-body tight"><div class="table-wrap"><table class="table">
        <thead><tr><th>Challan</th><th>Type</th><th class="num">Amount</th><th class="num">Paid</th><th>Status</th></tr></thead>
        <tbody>
          ${d.challans.length ? d.challans.map(c => `<tr><td class="strong">${esc(c.challan_no)}</td><td>${esc(c.fee_type)}</td><td class="num">${fmtINR(c.amount)}</td><td class="num">${fmtINR(c.paid_amount)}</td><td>${badgeFor(c.status)}</td></tr>`).join('') : '<tr><td colspan="5" class="empty">No challans issued</td></tr>'}
        </tbody>
      </table></div></div>
    </div>
  </div>
  <div class="grid grid-2" style="margin-top:16px">
    <div class="card">
      <div class="card-head"><h3>Attendance by subject</h3></div>
      <div class="card-body tight"><div class="table-wrap"><table class="table">
        <thead><tr><th>Subject</th><th>Attended</th><th style="width:40%">Percentage</th></tr></thead>
        <tbody>
          ${d.attendance.length ? d.attendance.map(a => `<tr><td class="strong">${esc(a.subject)}</td><td>${a.attended}/${a.total}</td><td><div style="display:flex;align-items:center;gap:10px"><div class="progress ${a.percent < 75 ? 'bad' : a.percent < 85 ? 'warn' : 'good'}" style="flex:1"><span style="width:${a.percent}%"></span></div><span style="font-size:12px;font-weight:600">${a.percent}%</span></div></td></tr>`).join('') : '<tr><td colspan="3" class="empty">No attendance recorded</td></tr>'}
        </tbody>
      </table></div></div>
    </div>
    <div class="card">
      <div class="card-head"><h3>Scholarships & results</h3></div>
      <div class="card-body">
        <div class="section-title">MahaDBT applications</div>
        ${d.scholarships.length ? d.scholarships.map(sc => `<div class="doc-row"><div><div class="dn strong">${esc(sc.scheme)}</div><div class="muted" style="font-size:11.5px">${esc(sc.academic_year)} · ${sc.mahabdt_app_no ? esc(sc.mahabdt_app_no) : 'Not submitted'} · ${fmtINR(sc.amount)}</div></div>${badgeFor(sc.stage)}</div>`).join('') : '<div class="muted" style="font-size:12.5px">No scholarship applications</div>'}
        <div class="section-title">Published results</div>
        ${d.results.length ? d.results.map(r => `<div class="doc-row"><div><div class="dn strong">${esc(r.subject)}</div><div class="muted" style="font-size:11.5px">${esc(r.exam)}</div></div><span class="chip">${r.marks_obtained}/${r.max_marks}</span></div>`).join('') : '<div class="muted" style="font-size:12.5px">No published results</div>'}
      </div>
    </div>
  </div>`;
}

VIEWS.admissions = async (id, q) => {
  const params = new URLSearchParams();
  ['q', 'stage', 'dept'].forEach(k => { if (q.get(k)) params.set(k, q.get(k)); });
  const d = await api('/api/admissions?' + params.toString());
  const stages = ['enquiry', 'applied', 'verified', 'approved', 'enrolled', 'rejected'];
  const total = Object.values(d.counts).reduce((a, b) => a + b, 0);
  const tabLink = (stage) => {
    const p = new URLSearchParams(q);
    if (stage) p.set('stage', stage); else p.delete('stage');
    return '#/admissions?' + p.toString();
  };
  document.getElementById('view').innerHTML = `
  ${pageHead('Admissions', 'Application pipeline from enquiry to enrolment', canManage() ? `<button class="btn primary" data-action="add-admission">${icon('plus')} New application</button>` : '')}
  <div class="card">
    <div class="tabs">
      <a class="tab ${!q.get('stage') ? 'active' : ''}" href="${tabLink('')}">All <span class="count">${total}</span></a>
      ${stages.map(s => `<a class="tab ${q.get('stage') === s ? 'active' : ''}" href="${tabLink(s)}">${stageLabel(s)} <span class="count">${d.counts[s] || 0}</span></a>`).join('')}
    </div>
    <form class="filterbar" data-form="admission-filter">
      <div class="search-wrap">${icon('search')}<input class="input" name="q" placeholder="Search applicant, application no" value="${esc(q.get('q') || '')}"></div>
      <select class="select" data-nav-param="dept"><option value="">All departments</option>${deptOptions(q.get('dept'))}</select>
      <button class="btn sm" type="submit">Search</button>
    </form>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Application</th><th>Applicant</th><th>Department</th><th>Category</th><th class="num">Score</th><th>Stage</th><th></th></tr></thead>
      <tbody>
        ${d.rows.length ? d.rows.map(a => `
          <tr>
            <td class="strong">${esc(a.application_no)}<div class="muted">${fmtDate(a.created_at)}</div></td>
            <td><div class="strong">${esc(a.name)}</div><div class="muted">${esc(a.email || a.phone || '')}</div></td>
            <td>${esc(a.dept_code || '—')} <span class="muted">${esc(a.program || '')}</span></td>
            <td><span class="chip">${esc(a.category || 'OPEN')}</span></td>
            <td class="num">${a.score === null ? '—' : a.score}</td>
            <td>${canManage() && a.stage !== 'enrolled'
              ? `<select class="select" style="padding:4px 8px;font-size:12px;width:130px" data-change-action="admission-stage" data-id="${a.id}">
                  ${['enquiry', 'applied', 'verified', 'approved', 'rejected'].map(s => `<option value="${s}"${a.stage === s ? ' selected' : ''}>${stageLabel(s)}</option>`).join('')}
                 </select>`
              : badgeFor(a.stage)}</td>
            <td><div class="actions">
              ${a.stage === 'approved' && canManage() ? `<button class="btn sm green" data-action="enroll-admission" data-id="${a.id}" data-name="${esc(a.name)}">Enroll</button>` : ''}
            </div></td>
          </tr>`).join('') : '<tr><td colspan="7" class="empty"><b>No applications</b>Adjust the filters or create a new application</td></tr>'}
      </tbody>
    </table></div>
  </div>`;
};

VIEWS.fees = async (id, q) => {
  const status = q.get('status') || '';
  const search = q.get('q') || '';
  const summary = await api('/api/fees/summary');
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (search) params.set('q', search);
  const d = await api('/api/fees/challans?' + params.toString());
  const tabLink = (s) => {
    const p = new URLSearchParams(q);
    if (s) p.set('status', s); else p.delete('status');
    return '#/fees?' + p.toString();
  };
  document.getElementById('view').innerHTML = `
  ${pageHead('Fees & Payments', 'Challans, collections and outstanding dues', canManage() ? `<button class="btn" data-action="bulk-challans">${icon('file')} Generate semester fees</button><button class="btn primary" data-action="add-challan">${icon('plus')} New challan</button>` : '')}
  <div class="grid grid-4">
    <div class="card stat"><div class="stat-top"><span class="label">Total billed</span><span class="stat-icon tint-indigo">${icon('file')}</span></div><div class="value">${fmtINR(summary.billed)}</div><div class="hint">${fmtNum(summary.pending_count + summary.partial_count + summary.paid_count)} challans issued</div></div>
    <div class="card stat"><div class="stat-top"><span class="label">Collected</span><span class="stat-icon tint-green">${icon('card')}</span></div><div class="value">${fmtINR(summary.collected)}</div><div class="hint">${fmtINR(summary.thisMonth)} this month</div></div>
    <div class="card stat"><div class="stat-top"><span class="label">Outstanding</span><span class="stat-icon tint-red">${icon('card')}</span></div><div class="value" style="color:#dc2626">${fmtINR(summary.due)}</div><div class="hint">${fmtNum(summary.pending_count)} fully pending</div></div>
    <div class="card stat"><div class="stat-top"><span class="label">Defaulters</span><span class="stat-icon tint-amber">${icon('users')}</span></div><div class="value">${fmtNum(summary.defaulters)}</div><div class="hint">${fmtNum(summary.partial_count)} partial payments</div></div>
  </div>
  <div class="card" style="margin-top:16px">
    <div class="tabs">
      <a class="tab ${!status ? 'active' : ''}" href="${tabLink('')}">All challans</a>
      <a class="tab ${status === 'pending' ? 'active' : ''}" href="${tabLink('pending')}">Pending <span class="count">${summary.pending_count}</span></a>
      <a class="tab ${status === 'partial' ? 'active' : ''}" href="${tabLink('partial')}">Partial <span class="count">${summary.partial_count}</span></a>
      <a class="tab ${status === 'paid' ? 'active' : ''}" href="${tabLink('paid')}">Paid <span class="count">${summary.paid_count}</span></a>
    </div>
    <form class="filterbar" data-form="fees-filter">
      <div class="search-wrap">${icon('search')}<input class="input" name="q" placeholder="Search student, roll no, challan" value="${esc(search)}"></div>
      <button class="btn sm" type="submit">Search</button>
    </form>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Challan</th><th>Student</th><th>Fee type</th><th class="num">Amount</th><th class="num">Paid</th><th class="num">Balance</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${d.rows.length ? d.rows.map(c => `
          <tr>
            <td class="strong">${esc(c.challan_no)}<div class="muted">${fmtDate(c.created_at)}</div></td>
            <td><div class="strong">${esc(c.student_name)}</div><div class="muted">${esc(c.roll_no)} · ${esc(c.dept_code)}</div></td>
            <td>${esc(c.fee_type)}</td>
            <td class="num">${fmtINR(c.amount)}</td>
            <td class="num">${fmtINR(c.paid_amount)}</td>
            <td class="num strong" ${c.amount - c.paid_amount > 0 ? 'style="color:#dc2626"' : ''}>${fmtINR(c.amount - c.paid_amount)}</td>
            <td>${badgeFor(c.status)}</td>
            <td><div class="actions">
              ${canManage() && c.status !== 'paid' ? `<button class="btn sm primary" data-action="pay-challan" data-id="${c.id}" data-due="${c.amount - c.paid_amount}" data-student="${esc(c.student_name)}" data-no="${esc(c.challan_no)}">Collect</button>` : ''}
              ${c.paid_amount > 0 ? `<button class="btn sm" data-action="view-receipt" data-id="${c.id}">Receipt</button>` : ''}
            </div></td>
          </tr>`).join('') : '<tr><td colspan="8" class="empty"><b>No challans found</b>Adjust the filters to see more results</td></tr>'}
      </tbody>
    </table></div>
  </div>`;
};
