'use strict';

function formObj(form) {
  const out = {};
  new FormData(form).forEach((v, k) => { out[k] = v; });
  return out;
}

function setHash(name, query) {
  const s = query && query.toString();
  location.hash = '#/' + name + (s ? '?' + s : '');
}

function navWith(key, value) {
  const { name, id, query } = currentRoute();
  if (value) query.set(key, value); else query.delete(key);
  query.delete('page');
  const s = query.toString();
  location.hash = '#/' + name + (id ? '/' + id : '') + (s ? '?' + s : '');
}

function searchForm(name, form) {
  const q = String(new FormData(form).get('q') || '').trim();
  const { query } = currentRoute();
  if (q) query.set('q', q); else query.delete('q');
  query.delete('page');
  setHash(name, query);
}

function modalHead(title, sub) {
  return '<div class="modal-head"><div><h3>' + esc(title) + '</h3>' +
    (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') +
    '</div><button class="icon-btn close" data-action="close-modal">' + icon('x') + '</button></div>';
}

function modalFoot(submitLabel, formId) {
  return '<div class="form-actions"><button type="button" class="btn" data-action="close-modal">Cancel</button>' +
    '<button class="btn primary" type="submit"' + (formId ? ' form="' + formId + '"' : '') + '>' + esc(submitLabel) + '</button></div>';
}

const PAY_MODES = ['UPI', 'Net Banking', 'Card', 'Cash', 'Cheque'];

const ACTIONS = {
  logout: async () => {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch (e) { /* session may already be gone */ }
    state.user = null;
    state.csrf = '';
    state.depts = [];
    state.att = null;
    renderLogin();
  },

  'close-modal': () => closeModal(),

  'add-student': () => {
    openModal(modalHead('Add student', 'Create a new student record') + '<div class="modal-body">' + studentForm(null) + '</div>', true);
  },

  'edit-student': async (el) => {
    const d = await api('/api/students/' + el.dataset.id);
    openModal(modalHead('Edit student', d.student.name) + '<div class="modal-body">' + studentForm(d.student) + '</div>', true);
  },

  'add-admission': () => {
    const cats = ['OPEN', 'OBC', 'SC', 'ST', 'EWS', 'VJNT', 'NT', 'SBC', 'Minority'];
    openModal(modalHead('New admission application', 'Capture an enquiry or application') + `
      <div class="modal-body">
        <form data-form="admission-save">
          <div class="form-grid">
            <div class="field"><label>Applicant name <span class="req">*</span></label><input class="input" name="name" required></div>
            <div class="field"><label>Email</label><input class="input" name="email" type="email"></div>
            <div class="field"><label>Phone</label><input class="input" name="phone"></div>
            <div class="field"><label>Gender</label><select class="select" name="gender"><option>Male</option><option>Female</option><option>Other</option></select></div>
            <div class="field"><label>Department <span class="req">*</span></label><select class="select" name="department_id" required>${deptOptions('')}</select></div>
            <div class="field"><label>Program</label><select class="select" name="program"><option>B.Tech</option><option>MBA</option><option>MCA</option><option>BBA</option><option>B.Sc</option><option>M.Tech</option></select></div>
            <div class="field"><label>Category</label><select class="select" name="category">${cats.map(c => '<option>' + c + '</option>').join('')}</select></div>
            <div class="field"><label>Stage</label><select class="select" name="stage"><option value="enquiry">Enquiry</option><option value="applied" selected>Applied</option><option value="verified">Verified</option><option value="approved">Approved</option></select></div>
            <div class="field"><label>Entrance score</label><input class="input" name="score" type="number" min="0" max="100" step="0.01"></div>
            <div class="field full"><label>Notes</label><textarea class="textarea" name="notes"></textarea></div>
          </div>
          ${modalFoot('Create application')}
        </form>
      </div>`, true);
  },

  'enroll-admission': (el) => {
    openModal(modalHead('Enroll applicant', el.dataset.name) + `
      <div class="modal-body">
        <form data-form="enroll-save">
          <input type="hidden" name="id" value="${el.dataset.id}">
          <div class="form-grid">
            <div class="field"><label>Semester</label><select class="select" name="semester">${semOptions('1')}</select></div>
            <div class="field"><label>Batch year</label><input class="input" name="batch_year" type="number" min="2000" max="2100" value="${new Date().getFullYear()}"></div>
            <div class="field full"><label>Roll number</label><input class="input" name="roll_no" placeholder="Leave blank to generate automatically"></div>
          </div>
          <div class="integration-note indigo" style="margin-top:14px">Enrolling creates an active student record in the selected department and links it to this application.</div>
          ${modalFoot('Enroll student')}
        </form>
      </div>`);
  },

  'add-challan': async () => {
    const d = await api('/api/students?status=active&pageSize=100');
    openModal(modalHead('New fee challan', 'Issue a fee demand to a student') + `
      <div class="modal-body">
        <form data-form="challan-save">
          <div class="form-grid">
            <div class="field full"><label>Student <span class="req">*</span></label><select class="select" name="student_id" required>${studentOptions(d.rows)}</select></div>
            <div class="field"><label>Fee type</label><input class="input" name="fee_type" list="fee-types" value="Tuition Fee">
              <datalist id="fee-types"><option>Tuition Fee</option><option>Exam Fee</option><option>Development Fee</option><option>Hostel Fee</option><option>Library Fee</option><option>Bus Fee</option></datalist>
            </div>
            <div class="field"><label>Amount (₹) <span class="req">*</span></label><input class="input" name="amount" type="number" min="1" required></div>
            <div class="field"><label>Due date</label><input class="input" name="due_date" type="date"></div>
          </div>
          ${modalFoot('Create challan')}
        </form>
      </div>`);
  },

  'bulk-challans': () => {
    openModal(modalHead('Generate semester fees', 'Create challans for every active student in a department') + `
      <div class="modal-body">
        <form data-form="bulk-challan-save">
          <div class="form-grid">
            <div class="field full"><label>Department <span class="req">*</span></label><select class="select" name="department_id" required>${deptOptions('')}</select></div>
            <div class="field"><label>Semester <span class="req">*</span></label><select class="select" name="semester">${semOptions('')}</select></div>
            <div class="field"><label>Academic year</label><input class="input" name="academic_year" value="2026-27"></div>
            <div class="field"><label>Due date</label><input class="input" name="due_date" type="date"></div>
          </div>
          <div class="integration-note indigo" style="margin-top:14px">The configured fee structure amount is used. Students who already have this semester challan are skipped.</div>
          ${modalFoot('Generate challans')}
        </form>
      </div>`);
  },

  'pay-challan': (el) => {
    const due = Number(el.dataset.due || 0);
    openModal(modalHead('Collect fee payment', el.dataset.student + ' · ' + el.dataset.no) + `
      <div class="modal-body">
        <form data-form="pay-save">
          <input type="hidden" name="id" value="${el.dataset.id}">
          <div class="form-grid">
            <div class="field"><label>Amount (₹) <span class="req">*</span></label><input class="input" name="amount" type="number" min="1" max="${due}" value="${due}" required></div>
            <div class="field"><label>Payment mode</label><select class="select" name="mode">${PAY_MODES.map(m => '<option>' + m + '</option>').join('')}</select></div>
          </div>
          <div class="integration-note indigo" style="margin-top:14px">Balance on this challan: <b>${fmtINR(due)}</b>. A receipt is generated automatically.</div>
          ${modalFoot('Record payment')}
        </form>
      </div>`);
  },

  'view-receipt': async (el) => {
    const d = await api('/api/fees/receipt/' + el.dataset.id);
    openModal(modalHead('Fee receipt', d.challan.receipt_no || d.challan.challan_no) +
      '<div class="modal-body">' + receiptHTML(d.challan) + '</div>' +
      '<div class="modal-foot"><button class="btn" data-action="close-modal">Close</button>' +
      '<button class="btn primary" data-action="print">' + icon('printer') + ' Print</button></div>', true);
  },

  print: () => window.print(),

  'att-set': (el) => {
    if (!state.att) return;
    const row = state.att.rows.find(r => String(r.id) === String(el.dataset.id));
    if (!row) return;
    row.status = el.dataset.status;
    const seg = el.closest('.att-seg');
    if (!seg) return;
    seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.status === row.status));
  },

  'mark-all-present': () => {
    if (!state.att) return;
    state.att.rows.forEach(r => { r.status = 'present'; });
    document.querySelectorAll('.att-seg').forEach(seg => {
      seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.status === 'present'));
    });
    toast('All students marked present. Save to record.');
  },

  'save-attendance': async () => {
    if (!state.att || !state.att.rows.length) return toast('Nothing to save', 'error');
    const res = await api('/api/attendance/mark', {
      method: 'POST',
      body: {
        date: state.att.date,
        subject: state.att.subject,
        records: state.att.rows.map(r => ({ student_id: r.id, status: r.status }))
      }
    });
    toast(res.saved + ' attendance records saved');
    await route();
  },

  'add-tt': (el) => {
    openModal(modalHead('Add timetable class', 'Schedule a subject into the weekly grid') + `
      <div class="modal-body">
        <form data-form="tt-save">
          <input type="hidden" name="department_id" value="${el.dataset.dept}">
          <input type="hidden" name="semester" value="${el.dataset.sem}">
          <div class="form-grid">
            <div class="field"><label>Day <span class="req">*</span></label><select class="select" name="day_of_week">
              <option value="1">Monday</option><option value="2">Tuesday</option><option value="3">Wednesday</option>
              <option value="4">Thursday</option><option value="5">Friday</option><option value="6">Saturday</option>
            </select></div>
            <div class="field"><label>Period <span class="req">*</span></label><select class="select" name="period">
              ${[1, 2, 3, 4, 5, 6, 7, 8].map(p => '<option value="' + p + '">Period ' + p + '</option>').join('')}
            </select></div>
            <div class="field full"><label>Subject <span class="req">*</span></label><input class="input" name="subject" required></div>
            <div class="field"><label>Faculty</label><input class="input" name="faculty_name"></div>
            <div class="field"><label>Room</label><input class="input" name="room" placeholder="A-204"></div>
          </div>
          ${modalFoot('Add class')}
        </form>
      </div>`);
  },

  'tt-delete': async (el) => {
    if (!confirm('Remove this class from the timetable?')) return;
    await api('/api/timetable/' + el.dataset.id, { method: 'DELETE' });
    toast('Timetable entry removed');
    await route();
  },

  'add-exam': (el) => {
    openModal(modalHead('New examination', 'Schedule an exam and define maximum marks') + `
      <div class="modal-body">
        <form data-form="exam-save">
          <input type="hidden" name="department_id" value="${el.dataset.dept}">
          <input type="hidden" name="semester" value="${el.dataset.sem}">
          <div class="form-grid">
            <div class="field"><label>Exam name <span class="req">*</span></label><input class="input" name="name" placeholder="Mid-Semester Test" required></div>
            <div class="field"><label>Subject <span class="req">*</span></label><input class="input" name="subject" required></div>
            <div class="field"><label>Date</label><input class="input" name="exam_date" type="date"></div>
            <div class="field"><label>Start time</label><input class="input" name="start_time" type="time"></div>
            <div class="field"><label>Duration (minutes)</label><input class="input" name="duration_min" type="number" min="15" max="300" value="90"></div>
            <div class="field"><label>Maximum marks</label><input class="input" name="max_marks" type="number" min="1" max="200" value="100"></div>
          </div>
          ${modalFoot('Create exam')}
        </form>
      </div>`);
  },

  'enter-marks': async (el) => {
    const d = await api('/api/exams/' + el.dataset.id + '/marks');
    const rows = d.rows.map(r => `
      <tr>
        <td class="strong">${esc(r.roll_no)}</td>
        <td>${esc(r.name)}</td>
        <td><input class="input" style="max-width:120px" type="number" min="0" max="${d.exam.max_marks}" step="0.5" data-student="${r.id}" value="${r.marks_obtained === null ? '' : r.marks_obtained}" placeholder="—"></td>
      </tr>`).join('');
    openModal(modalHead('Marks entry', d.exam.name + ' — ' + d.exam.subject + ' · max ' + d.exam.max_marks) + `
      <div class="modal-body">
        <form data-form="marks-save">
          <input type="hidden" name="exam_id" value="${d.exam.id}">
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Roll no</th><th>Student</th><th style="width:150px">Marks obtained</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="3" class="empty">No active students in this department and semester</td></tr>'}</tbody>
          </table></div>
          ${modalFoot('Save marks')}
        </form>
      </div>`, true);
  },

  'publish-exam': async (el) => {
    if (!confirm('Publish results for ' + el.dataset.name + '? Students will see these marks.')) return;
    await api('/api/exams/' + el.dataset.id + '/publish', { method: 'POST' });
    toast('Exam results published');
    await route();
  },

  'add-faculty': () => facultyModal(null),

  'edit-faculty': async (el) => {
    const d = await api('/api/faculty');
    const f = d.rows.find(x => String(x.id) === String(el.dataset.id));
    if (!f) return toast('Faculty record not found', 'error');
    facultyModal(f);
  },

  'add-notice': () => {
    const cats = ['General', 'Academic', 'Examination', 'Fee', 'Scholarship', 'Event'];
    openModal(modalHead('Publish notice', 'Reach students and faculty instantly') + `
      <div class="modal-body">
        <form data-form="notice-save">
          <div class="form-grid">
            <div class="field full"><label>Title <span class="req">*</span></label><input class="input" name="title" required></div>
            <div class="field"><label>Category</label><select class="select" name="category">${cats.map(c => '<option>' + c + '</option>').join('')}</select></div>
            <div class="field"><label>Audience</label><select class="select" name="audience"><option value="all">Everyone</option><option value="students">Students</option><option value="faculty">Faculty</option></select></div>
            <div class="field full"><label>Message <span class="req">*</span></label><textarea class="textarea" name="body" required></textarea></div>
            <div class="field full"><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="pinned" style="width:auto"> Pin to top of notice board</label></div>
          </div>
          ${modalFoot('Publish notice')}
        </form>
      </div>`, true);
  },

  'delete-notice': async (el) => {
    if (!confirm('Delete this notice?')) return;
    await api('/api/notices/' + el.dataset.id, { method: 'DELETE' });
    toast('Notice deleted');
    await route();
  },

  'add-scholarship': async () => {
    const d = await api('/api/students?status=active&pageSize=100');
    const schemes = [
      'Rajarshi Chhatrapati Shahu Maharaj Fee Waiver',
      'Post Matric Scholarship (SC)',
      'Post Matric Scholarship (ST)',
      'VJNT Scholarship',
      'EBC Fee Waiver',
      'Minority Scholarship',
      'Girl Student Scholarship'
    ];
    openModal(modalHead('New scholarship application', 'Start an institute-side MahaDBT application') + `
      <div class="modal-body">
        <form data-form="scholarship-save">
          <div class="form-grid">
            <div class="field full"><label>Student <span class="req">*</span></label><select class="select" name="student_id" required>${studentOptions(d.rows)}</select></div>
            <div class="field full"><label>Scheme <span class="req">*</span></label><select class="select" name="scheme" required>${schemes.map(s => '<option>' + s + '</option>').join('')}</select></div>
            <div class="field"><label>Academic year</label><input class="input" name="academic_year" value="2026-27"></div>
            <div class="field"><label>Sanction amount (₹) <span class="req">*</span></label><input class="input" name="amount" type="number" min="1" value="50000" required></div>
            <div class="field"><label>MahaDBT application no</label><input class="input" name="mahabdt_app_no" placeholder="Optional if already applied on portal"></div>
            <div class="field"><label>Notes</label><input class="input" name="status_note"></div>
          </div>
          <div class="integration-note indigo" style="margin-top:14px">All seven mandatory documents are added to the checklist automatically. Verify each document before submitting to MahaDBT.</div>
          ${modalFoot('Create application')}
        </form>
      </div>`, true);
  },

  'view-scholarship': (el) => showScholarshipDetail(el.dataset.id),

  'sch-verify': async (el) => {
    const res = await api('/api/scholarships/' + el.dataset.id + '/verify', { method: 'POST' });
    toast('Documents verified at institute level');
    await showScholarshipDetail(el.dataset.id);
    if (res.stage) toast('Application is ready for MahaDBT submission');
  },

  'sch-sync': async (el) => {
    const res = await api('/api/scholarships/' + el.dataset.id + '/sync', { method: 'POST' });
    toast(res.reference ? 'Submitted to MahaDBT · ' + res.reference : res.message);
    await showScholarshipDetail(el.dataset.id);
  },

  'sch-stage': (el) => {
    const labels = { approved: 'approval', rejected: 'rejection', disbursed: 'disbursement', institute_verified: 're-opening' };
    openModal(modalHead('Record MahaDBT response', 'Application ' + (labels[el.dataset.stage] || el.dataset.stage)) + `
      <div class="modal-body">
        <form data-form="sch-stage-save">
          <input type="hidden" name="id" value="${el.dataset.id}">
          <input type="hidden" name="stage" value="${el.dataset.stage}">
          <div class="field"><label>Portal reference / remark</label><textarea class="textarea" name="note" placeholder="Sanction order number, rejection reason, disbursement reference"></textarea></div>
          <div class="integration-note" style="margin-top:14px">This records the response received from the MahaDBT portal so the institute ledger stays in sync.</div>
          ${modalFoot('Save response')}
        </form>
      </div>`);
  },

  'sch-settings': () => { location.hash = '#/settings'; }
};

function gotoScreen(name) {
  if (location.hash === '#/' + name) return route();
  location.hash = '#/' + name;
}

function receiptModal(challan) {
  openModal(modalHead('Fee receipt', challan.receipt_no || challan.challan_no) +
    '<div class="modal-body">' + receiptHTML(challan) + '</div>' +
    '<div class="modal-foot"><button class="btn" data-action="close-modal">Close</button>' +
    '<button class="btn primary" data-action="print">' + icon('printer') + ' Print</button></div>', true);
}

const FORMS = {
  'student-filter': (form) => searchForm('students', form),

  'student-save': async (form) => {
    const data = formObj(form);
    const id = data.id;
    delete data.id;
    if (id) {
      await api('/api/students/' + id, { method: 'PUT', body: data });
      toast('Student record updated');
    } else {
      const res = await api('/api/students', { method: 'POST', body: data });
      toast('Student created · ' + res.student.roll_no);
    }
    closeModal();
    await route();
  },

  'admission-filter': (form) => searchForm('admissions', form),

  'admission-save': async (form) => {
    const res = await api('/api/admissions', { method: 'POST', body: formObj(form) });
    closeModal();
    toast('Application ' + res.admission.application_no + ' created');
    await route();
  },

  'enroll-save': async (form) => {
    const data = formObj(form);
    const id = data.id;
    delete data.id;
    const res = await api('/api/admissions/' + id + '/enroll', { method: 'POST', body: data });
    closeModal();
    toast('Student enrolled · Roll no ' + res.roll_no);
    await route();
  },

  'challan-save': async (form) => {
    const res = await api('/api/fees/challans', { method: 'POST', body: formObj(form) });
    closeModal();
    toast('Challan ' + res.challan_no + ' created');
    await route();
  },

  'bulk-challan-save': async (form) => {
    const res = await api('/api/fees/challans/bulk', { method: 'POST', body: formObj(form) });
    closeModal();
    toast(res.created ? res.created + ' challans generated at ' + fmtINR(res.amount) + ' each' : 'All students already have this challan');
    await route();
  },

  'pay-save': async (form) => {
    const data = formObj(form);
    const id = data.id;
    delete data.id;
    const res = await api('/api/fees/challans/' + id + '/pay', { method: 'POST', body: data });
    closeModal();
    await route();
    toast('Payment of ' + fmtINR(res.receipt.paid_now) + ' recorded');
    const rc = await api('/api/fees/receipt/' + id);
    receiptModal(rc.challan);
  },

  'faculty-filter': (form) => searchForm('faculty', form),

  'faculty-save': async (form) => {
    const data = formObj(form);
    const id = data.id;
    delete data.id;
    if (id) {
      await api('/api/faculty/' + id, { method: 'PUT', body: data });
      toast('Faculty record updated');
    } else {
      await api('/api/faculty', { method: 'POST', body: data });
      toast('Faculty member added');
    }
    closeModal();
    await route();
  },

  'notice-save': async (form) => {
    await api('/api/notices', { method: 'POST', body: formObj(form) });
    closeModal();
    toast('Notice published');
    await route();
  },

  'scholarship-filter': (form) => searchForm('scholarships', form),

  'scholarship-save': async (form) => {
    await api('/api/scholarships', { method: 'POST', body: formObj(form) });
    closeModal();
    toast('Scholarship application created as draft');
    gotoScreen('scholarships');
  },

  'sch-stage-save': async (form) => {
    const data = formObj(form);
    const id = data.id;
    await api('/api/scholarships/' + id + '/stage', { method: 'PATCH', body: { stage: data.stage, note: data.note } });
    closeModal();
    toast('MahaDBT response recorded');
    await showScholarshipDetail(id);
  },

  'tt-save': async (form) => {
    await api('/api/timetable', { method: 'POST', body: formObj(form) });
    closeModal();
    toast('Class added to timetable');
    await route();
  },

  'exam-save': async (form) => {
    await api('/api/exams', { method: 'POST', body: formObj(form) });
    closeModal();
    toast('Exam scheduled');
    await route();
  },

  'marks-save': async (form) => {
    const id = new FormData(form).get('exam_id');
    const records = Array.from(form.querySelectorAll('[data-student]')).map(input => ({
      student_id: Number(input.dataset.student),
      marks_obtained: input.value === '' ? null : Number(input.value)
    }));
    const res = await api('/api/exams/' + id + '/marks', { method: 'POST', body: { records } });
    closeModal();
    toast(res.saved + ' marks saved');
    await route();
  },

  'settings-save': async (form) => {
    await api('/api/scholarships/settings', { method: 'PUT', body: formObj(form) });
    toast('Settings saved');
    await route();
  }
};

document.addEventListener('click', (e) => {
  if (e.target.classList && e.target.classList.contains('modal-backdrop')) {
    closeModal();
    return;
  }
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = ACTIONS[el.dataset.action];
  if (!fn) return;
  if (el.tagName === 'A' && el.getAttribute('href') === '#') e.preventDefault();
  Promise.resolve(fn(el, e)).catch(handleActionError);
});

document.addEventListener('change', (e) => {
  const param = e.target.closest('[data-nav-param]');
  if (param) return navWith(param.dataset.navParam, param.value);

  const el = e.target.closest('[data-change-action]');
  if (!el) return;
  const action = el.dataset.changeAction;

  if (action === 'admission-stage') {
    api('/api/admissions/' + el.dataset.id + '/stage', { method: 'PATCH', body: { stage: el.value } })
      .then(() => { toast('Application moved to ' + stageLabel(el.value)); return route(); })
      .catch(handleActionError);
    return;
  }

  if (action === 'doc-status') {
    api('/api/scholarships/' + el.dataset.id + '/docs', {
      method: 'POST',
      body: { doc_type: el.dataset.doc, status: el.value }
    }).then(() => {
      toast(el.dataset.doc + ' marked ' + el.value);
      return showScholarshipDetail(el.dataset.id);
    }).catch(handleActionError);
  }
});

document.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-form]');
  if (!form) return;
  e.preventDefault();
  const fn = FORMS[form.dataset.form];
  if (!fn) return;
  if (form.dataset.busy === '1') return;
  form.dataset.busy = '1';
  Promise.resolve(fn(form)).catch(handleActionError).finally(() => { delete form.dataset.busy; });
});

async function boot() {
  window.addEventListener('hashchange', () => { if (state.user) route(); });
  try {
    const me = await api('/api/auth/me');
    state.user = me.user;
    state.csrf = me.csrf;
    await loadMeta();
    renderShell();
    if (!location.hash.startsWith('#/')) location.hash = '#/dashboard';
    else await route();
  } catch (err) {
    if (err.status !== 401) console.error(err);
    renderLogin(err.status === 401 ? '' : 'Could not reach the server. Please retry.');
  }
}

boot();
