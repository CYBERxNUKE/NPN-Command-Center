(function () {
  const status = document.getElementById('status');
  const members = document.getElementById('members');
  let client;
  let user;
  let household;
  const escapeHtml = value => String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

  async function load() {
    client = window.npnAuth && window.npnAuth.getClient();
    user = window.npnAuth && window.npnAuth.getUser();
    if (!client || !user) { status.textContent = 'Configure Supabase and sign in first.'; return; }
    const profile = await client.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (profile.data) document.getElementById('displayName').value = profile.data.display_name || '';
    let result = await client.from('households').select('*').eq('owner_id', user.id).order('created_at').limit(1).maybeSingle();
    if (result.error) { status.textContent = result.error.message; return; }
    if (!result.data) result = await client.from('households').insert({ name: 'My Household', owner_id: user.id }).select().single();
    if (result.error) { status.textContent = result.error.message; return; }
    household = result.data;
    const memberResult = await client.from('household_members').select('*').eq('household_id', household.id).order('created_at');
    if (memberResult.error) { status.textContent = memberResult.error.message; return; }
    members.innerHTML = memberResult.data.map(member => `<div>${escapeHtml(member.label)} <span class="muted">(${escapeHtml(member.role)})</span></div>`).join('') || '<span class="muted">No members yet.</span>';
    status.textContent = 'Household ready.';
  }

  document.getElementById('saveProfile').onclick = async function () {
    if (!client || !user) return;
    const result = await client.from('profiles').upsert({ id: user.id, display_name: document.getElementById('displayName').value.trim() });
    status.textContent = result.error ? result.error.message : 'Profile saved.';
  };
  document.getElementById('addMember').onclick = async function () {
    if (!client || !user || !household) return;
    const label = document.getElementById('memberLabel').value.trim();
    if (!label) return;
    const result = await client.from('household_members').upsert({ household_id: household.id, profile_id: user.id, label, role: 'owner' }, { onConflict: 'household_id,profile_id' });
    status.textContent = result.error ? result.error.message : 'Member saved.';
    load();
  };
  setTimeout(load, 500);
}());
