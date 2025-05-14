(async () => {
  try {
    const res = await fetch('/api/admin/history', {
      headers: {
        'Authorization': 'Basic ' + btoa(`${prompt('Admin user:')}:${prompt('Admin pass:')}`)
      }
    });
    if (!res.ok) {
      document.getElementById('history').textContent = 'Åtkomst nekad eller inget innehåll.';
      return;
    }
    const data = await res.json();
    document.getElementById('history').textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    document.getElementById('history').textContent = 'Fel vid hämtning: ' + err;
  }
})();
