(function () {
  const status = document.getElementById('status');
  const members = document.getElementById('members');
  let client;
  let user;
  let household;
  let currentMember;
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
    document.getElementById('householdLimit').value = household.limits && household.limits.max_submissions_per_opportunity !== undefined ? household.limits.max_submissions_per_opportunity : '';
    const ownerMember = await client.from('household_members').upsert({ household_id: household.id, profile_id: user.id, label: 'Primary', role: 'owner' }, { onConflict: 'household_id,profile_id' }).select().single();
    if (ownerMember.error) { status.textContent = ownerMember.error.message; return; }
    const memberResult = await client.from('household_members').select('*').eq('household_id', household.id).order('created_at');
    if (memberResult.error) { status.textContent = memberResult.error.message; return; }
    currentMember = memberResult.data.find(member => member.profile_id === user.id);
    document.getElementById('memberLimit').value = currentMember && currentMember.limits && currentMember.limits.max_submissions_per_opportunity !== undefined ? currentMember.limits.max_submissions_per_opportunity : '';
    members.innerHTML = memberResult.data.map(member => `<div>${escapeHtml(member.label)} <span class="muted">(${escapeHtml(member.role)})</span></div>`).join('') || '<span class="muted">No members yet.</span>';
    const preferences = await client.from('notification_preferences').select('channel,destination,enabled').in('channel', ['email', 'sms']);
    if (!preferences.error) preferences.data.forEach(preference => {
      document.getElementById(preference.channel + 'Destination').value = preference.destination || '';
      document.getElementById(preference.channel + 'Enabled').checked = preference.enabled;
    });
    status.textContent = 'Household ready.';
  }

  document.getElementById('saveProfile').onclick = async function () {
    if (!client || !user) return;
    const result = await client.from('profiles').upsert({ id: user.id, display_name: document.getElementById('displayName').value.trim() });
    status.textContent = result.error ? result.error.message : 'Profile saved.';
  };
  document.getElementById('saveAlerts').onclick = async function () {
    if (!client || !user) return;
    for (const channel of ['email', 'sms']) {
      const destination = document.getElementById(channel + 'Destination').value.trim();
      const enabled = document.getElementById(channel + 'Enabled').checked;
      const removed = await client.from('notification_preferences').delete().eq('owner_id', user.id).eq('channel', channel);
      if (removed.error) { status.textContent = removed.error.message; return; }
      if (destination) {
        const saved = await client.from('notification_preferences').insert({ owner_id: user.id, channel, destination, enabled, event_types: ['deadline_soon', 'source_changed'] });
        if (saved.error) { status.textContent = saved.error.message; return; }
      }
    }
    status.textContent = 'Alert settings saved.';
  };
  document.getElementById('saveLimits').onclick = async function () {
    if (!client || !user || !household || !currentMember) return;
    const memberValue = document.getElementById('memberLimit').value.trim();
    const householdValue = document.getElementById('householdLimit').value.trim();
    if ((memberValue !== '' && (!Number.isInteger(Number(memberValue)) || Number(memberValue) < 0)) || (householdValue !== '' && (!Number.isInteger(Number(householdValue)) || Number(householdValue) < 0))) {
      status.textContent = 'Limits must be whole numbers zero or greater.';
      return;
    }
    const memberLimits = memberValue === '' ? {} : { max_submissions_per_opportunity: Number(memberValue) };
    const householdLimits = householdValue === '' ? {} : { max_submissions_per_opportunity: Number(householdValue) };
    const memberUpdate = await client.from('household_members').update({ limits: memberLimits }).eq('id', currentMember.id);
    if (memberUpdate.error) { status.textContent = memberUpdate.error.message; return; }
    const householdUpdate = await client.from('households').update({ limits: householdLimits }).eq('id', household.id);
    status.textContent = householdUpdate.error ? householdUpdate.error.message : 'Submission limits saved.';
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
