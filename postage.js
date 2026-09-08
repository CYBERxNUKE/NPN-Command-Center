(function () {
  const status = document.getElementById('status');
  const resultBox = document.getElementById('result');
  document.getElementById('quote').onclick = async function () {
    const client = window.npnAuth && window.npnAuth.getClient();
    const user = window.npnAuth && window.npnAuth.getUser();
    if (!client || !user) { status.textContent = 'Configure Supabase and sign in first.'; return; }
    status.textContent = 'Requesting USPS estimate...';
    const result = await client.functions.invoke('calculate-postage', { body: { originZIPCode: document.getElementById('origin').value, destinationZIPCode: document.getElementById('destination').value, weight: Number(document.getElementById('weight').value), mailClass: document.getElementById('mailClass').value } });
    if (result.error) { status.textContent = result.error.message; return; }
    resultBox.textContent = JSON.stringify(result.data, null, 2);
    status.textContent = 'Estimate received.';
  };
  setTimeout(function () { status.textContent = window.npnAuth && window.npnAuth.getUser() ? 'Ready.' : 'Configure Supabase and sign in first.'; }, 500);
}());
