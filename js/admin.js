// ==========================================================
// ADMIN.JS
// ==========================================================
(function () {
  const session = requireAdmin();
  if (!session) return;
  renderShell('admin', 'Admin', 'Manage lines, models, shifts, targets and users');

  const $ = (id) => document.getElementById(id);

  // ---------------- TAB SWITCHING ----------------
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.admin-panel').forEach(p => p.style.display = 'none');
      tab.classList.add('active');
      document.getElementById('panel-' + tab.dataset.tab).style.display = '';
    });
  });

  // ================= LINES =================
  async function loadLines() {
    const { data } = await sb.from('lines').select('*').order('line_number');
    $('lines-body').innerHTML = (data || []).map(l => `
      <tr>
        <td><b>${l.line_number}</b></td>
        <td><span class="badge ${l.active ? 'saved' : 'pending'}">${l.active ? 'Active' : 'Disabled'}</span></td>
        <td class="flex gap-8">
          <button class="btn btn-outline btn-sm" onclick="window.__toggleLine('${l.id}', ${!l.active})">${l.active ? 'Disable' : 'Enable'}</button>
          <button class="btn btn-danger btn-sm" onclick="window.__deleteLine('${l.id}')">Delete</button>
        </td>
      </tr>`).join('') || '<tr><td colspan="3" class="empty-state">No lines yet</td></tr>';
  }
  $('btn-add-line').addEventListener('click', async () => {
    const val = $('new-line-number').value.trim().toUpperCase();
    if (!val) return;
    const { error } = await sb.from('lines').insert({ line_number: val });
    if (error) { showToast(error.message.includes('duplicate') ? 'Line already exists' : 'Could not add line', 'error'); return; }
    $('new-line-number').value = '';
    showToast('Line added', 'success');
    loadLines();
  });
  window.__toggleLine = async (id, next) => { await sb.from('lines').update({ active: next }).eq('id', id); loadLines(); };
  window.__deleteLine = async (id) => {
    if (!confirm('Delete this line? Existing production records referencing it will remain but the line will no longer be selectable.')) return;
    const { error } = await sb.from('lines').delete().eq('id', id);
    if (error) { showToast('Cannot delete — line has linked production records. Disable it instead.', 'error'); return; }
    showToast('Line deleted', 'success'); loadLines();
  };

  // ================= MODELS =================
  async function loadModels() {
    const { data } = await sb.from('models').select('*').order('model_name');
    $('models-body').innerHTML = (data || []).map(m => `
      <tr>
        <td>${escapeHtml(m.fg_code)}</td>
        <td>${escapeHtml(m.model_name)}</td>
        <td><span class="badge ${m.active ? 'saved' : 'pending'}">${m.active ? 'Active' : 'Disabled'}</span></td>
        <td class="flex gap-8">
          <button class="btn btn-outline btn-sm" onclick="window.__toggleModel('${m.id}', ${!m.active})">${m.active ? 'Disable' : 'Enable'}</button>
          <button class="btn btn-danger btn-sm" onclick="window.__deleteModel('${m.id}')">Delete</button>
        </td>
      </tr>`).join('') || '<tr><td colspan="4" class="empty-state">No models yet</td></tr>';
  }
  $('btn-add-model').addEventListener('click', async () => {
    const fg = $('new-fg-code').value.trim();
    const name = $('new-model-name').value.trim();
    if (!fg || !name) { showToast('FG Code and Model Name are required', 'warn'); return; }
    const { error } = await sb.from('models').insert({ fg_code: fg, model_name: name });
    if (error) { showToast(error.message.includes('duplicate') ? 'FG Code already exists' : 'Could not add model', 'error'); return; }
    $('new-fg-code').value = ''; $('new-model-name').value = '';
    showToast('Model added', 'success'); loadModels();
  });
  window.__toggleModel = async (id, next) => { await sb.from('models').update({ active: next }).eq('id', id); loadModels(); };
  window.__deleteModel = async (id) => {
    if (!confirm('Delete this model?')) return;
    const { error } = await sb.from('models').delete().eq('id', id);
    if (error) { showToast('Cannot delete — model has linked production records. Disable it instead.', 'error'); return; }
    showToast('Model deleted', 'success'); loadModels();
  };

  // ================= SHIFTS =================
  async function loadShifts() {
    const { data } = await sb.from('shifts').select('*').order('sort_order');
    $('shifts-body').innerHTML = (data || []).map(s => `
      <tr>
        <td><b>${s.shift_code}</b></td>
        <td><input type="text" value="${escapeHtml(s.shift_name)}" id="sn-${s.id}" style="min-width:110px;"></td>
        <td><input type="time" value="${s.start_time.slice(0,5)}" id="st-${s.id}"></td>
        <td><input type="time" value="${s.end_time.slice(0,5)}" id="et-${s.id}"></td>
        <td><input type="checkbox" ${s.crosses_midnight ? 'checked' : ''} id="cm-${s.id}"></td>
        <td><span class="badge ${s.active ? 'saved' : 'pending'}">${s.active ? 'Active' : 'Disabled'}</span></td>
        <td class="flex gap-8">
          <button class="btn btn-primary btn-sm" onclick="window.__saveShift('${s.id}')">Save</button>
          <button class="btn btn-outline btn-sm" onclick="window.__toggleShift('${s.id}', ${!s.active})">${s.active ? 'Disable' : 'Enable'}</button>
        </td>
      </tr>`).join('');
  }
  window.__saveShift = async (id) => {
    const shift_name = $('sn-' + id).value.trim();
    const start_time = $('st-' + id).value;
    const end_time = $('et-' + id).value;
    const crosses_midnight = $('cm-' + id).checked;
    const { error } = await sb.from('shifts').update({ shift_name, start_time, end_time, crosses_midnight }).eq('id', id);
    if (error) { showToast('Could not save shift', 'error'); return; }
    showToast('Shift timing updated', 'success'); loadShifts();
  };
  window.__toggleShift = async (id, next) => { await sb.from('shifts').update({ active: next }).eq('id', id); loadShifts(); };

  // ================= TARGETS =================
  let TLINES = [], TMODELS = [];
  async function loadTargetFilters() {
    const [l, m] = await Promise.all([
      sb.from('lines').select('*').eq('active', true).order('line_number'),
      sb.from('models').select('*').eq('active', true).order('model_name'),
    ]);
    TLINES = l.data || []; TMODELS = m.data || [];
    $('target-line').innerHTML = TLINES.map(x => `<option value="${x.id}">${x.line_number}</option>`).join('');
    $('target-model').innerHTML = TMODELS.map(x => `<option value="${x.id}">${x.fg_code} &mdash; ${x.model_name}</option>`).join('');
  }
  async function loadTargets() {
    const { data } = await sb.from('targets').select('*, lines(line_number), models(fg_code, model_name)').order('created_at', { ascending: false });
    $('targets-body').innerHTML = (data || []).map(t => `
      <tr>
        <td>${t.lines.line_number}</td>
        <td>${escapeHtml(t.models.fg_code)} &mdash; ${escapeHtml(t.models.model_name)}</td>
        <td>${t.target_per_hour}</td>
        <td><button class="btn btn-danger btn-sm" onclick="window.__deleteTarget('${t.id}')">Delete</button></td>
      </tr>`).join('') || '<tr><td colspan="4" class="empty-state">No targets configured</td></tr>';
  }
  $('btn-save-target').addEventListener('click', async () => {
    const line_id = $('target-line').value, model_id = $('target-model').value;
    const target_per_hour = Number($('target-value').value) || 0;
    if (!line_id || !model_id) return;
    const { error } = await sb.from('targets').upsert({ line_id, model_id, target_per_hour }, { onConflict: 'line_id,model_id' });
    if (error) { showToast('Could not save target', 'error'); return; }
    showToast('Target saved', 'success'); $('target-value').value = ''; loadTargets();
  });
  window.__deleteTarget = async (id) => { await sb.from('targets').delete().eq('id', id); loadTargets(); };

  // ================= USERS =================
  async function loadUsers() {
    const { data } = await sb.from('users').select('*').order('created_at');
    $('users-body').innerHTML = (data || []).map(u => `
      <tr>
        <td>${escapeHtml(u.username)}</td>
        <td>${escapeHtml(u.full_name)}</td>
        <td>${u.role === 'admin' ? 'Administrator' : 'Operator'}</td>
        <td><span class="badge ${u.active ? 'saved' : 'pending'}">${u.active ? 'Active' : 'Disabled'}</span></td>
        <td class="flex gap-8">
          <button class="btn btn-outline btn-sm" onclick="window.__toggleUser('${u.id}', ${!u.active})">${u.active ? 'Disable' : 'Enable'}</button>
          <button class="btn btn-danger btn-sm" onclick="window.__deleteUser('${u.id}')">Delete</button>
        </td>
      </tr>`).join('') || '<tr><td colspan="5" class="empty-state">No users yet</td></tr>';
  }
  $('btn-add-user').addEventListener('click', async () => {
    const username = $('new-username').value.trim();
    const full_name = $('new-fullname').value.trim();
    const pin = $('new-pin').value.trim();
    const role = $('new-role').value;
    if (!username || !full_name || !pin) { showToast('Username, name and PIN are required', 'warn'); return; }
    const { error } = await sb.from('users').insert({ username, full_name, pin, role });
    if (error) { showToast(error.message.includes('duplicate') ? 'Username already exists' : 'Could not add user', 'error'); return; }
    $('new-username').value = ''; $('new-fullname').value = ''; $('new-pin').value = '';
    showToast('User added', 'success'); loadUsers();
  });
  window.__toggleUser = async (id, next) => { await sb.from('users').update({ active: next }).eq('id', id); loadUsers(); };
  window.__deleteUser = async (id) => {
    if (!confirm('Delete this user?')) return;
    await sb.from('users').delete().eq('id', id);
    showToast('User deleted', 'success'); loadUsers();
  };

  (async function init() {
    await Promise.all([loadLines(), loadModels(), loadShifts(), loadTargetFilters()]);
    await Promise.all([loadTargets(), loadUsers()]);
  })();
})();
