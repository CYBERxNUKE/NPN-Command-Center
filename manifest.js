(function () {
  const status = document.getElementById('status');
  const list = document.getElementById('submissions');
  const resultBox = document.getElementById('result');
  let client;
  let rows = [];
  const escapeHtml = value => String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const csv = value => '"' + String(value || '').replaceAll('"', '""') + '"';

  async function load() {
    client = window.npnAuth && window.npnAuth.getClient();
    const user = window.npnAuth && window.npnAuth.getUser();
    if (!client || !user) { status.textContent = 'Configure Supabase and sign in first.'; return; }
    const result = await client.from('submissions').select('id,status,mailed_at,opportunity:opportunities(product,manufacturer,address,attention)').in('status', ['PREPARED', 'MAILED']).order('created_at', { ascending: false });
    if (result.error) { status.textContent = result.error.message; return; }
    rows = result.data || [];
    status.textContent = rows.length + ' submission(s) available';
    list.innerHTML = rows.map(row => `<label class="item"><input type="checkbox" value="${row.id}"> <b>${escapeHtml(row.opportunity && row.opportunity.product)}</b><br><span class="muted">${escapeHtml(row.opportunity && row.opportunity.address)} ${escapeHtml(row.opportunity && row.opportunity.attention)}</span></label>`).join('') || '<p class="muted">No prepared or mailed submissions found.</p>';
  }

  document.getElementById('create').onclick = async function () {
    if (!client || !rows.length) return;
    const selected = [...list.querySelectorAll('input:checked')].map(input => rows.find(row => row.id === input.value)).filter(Boolean);
    if (!selected.length) { status.textContent = 'Select at least one submission.'; return; }
    const householdResult = await client.from('households').select('id').order('created_at').limit(1).maybeSingle();
    if (householdResult.error || !householdResult.data) { status.textContent = householdResult.error ? householdResult.error.message : 'Create a household first.'; return; }
    const batch = await client.from('postage_batches').insert({ owner_id: (await client.auth.getUser()).data.user.id, household_id: householdResult.data.id, status: 'ready' }).select().single();
    if (batch.error) { status.textContent = batch.error.message; return; }
    const items = selected.map(row => ({ batch_id: batch.data.id, submission_id: row.id, address_snapshot: { product: row.opportunity.product, manufacturer: row.opportunity.manufacturer, address: row.opportunity.address, attention: row.opportunity.attention } }));
    const inserted = await client.from('postage_batch_items').insert(items);
    if (inserted.error) { status.textContent = inserted.error.message; return; }
    const lines = [['batch_id', 'submission_id', 'manufacturer', 'product', 'address', 'attention'], ...items.map(item => [item.batch_id, item.submission_id, item.address_snapshot.manufacturer, item.address_snapshot.product, item.address_snapshot.address, item.address_snapshot.attention])];
    const blob = new Blob([lines.map(line => line.map(csv).join(',')).join('\n')], { type: 'text/csv' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'npn-mail-manifest-' + batch.data.id + '.csv'; link.click();
    resultBox.textContent = JSON.stringify({ batchId: batch.data.id, items: items.length, status: 'ready' }, null, 2);
    status.textContent = 'Manifest created and downloaded.';
  };
  setTimeout(load, 500);
}());
