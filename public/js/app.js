// app.js - Client side helpers

document.querySelectorAll('[data-confirm]').forEach((element) => {
  element.addEventListener('click', (event) => {
    if (!confirm(element.dataset.confirm)) {
      event.preventDefault();
    }
  });
});

setTimeout(() => {
  document.querySelectorAll('.alert').forEach((alert) => {
    alert.style.transition = 'opacity 0.5s';
    alert.style.opacity = '0';
    setTimeout(() => alert.remove(), 500);
  });
}, 4000);

document.querySelectorAll('.ticket-row').forEach((row) => {
  row.addEventListener('mouseenter', () => {
    row.style.cursor = 'pointer';
  });
});

document.querySelectorAll('[data-copy-target]').forEach((button) => {
  button.addEventListener('click', async () => {
    const target = document.getElementById(button.dataset.copyTarget);
    if (!target) {
      return;
    }

    try {
      await navigator.clipboard.writeText(target.value || target.textContent || '');
      const original = button.innerHTML;
      button.innerHTML = '<i class="fas fa-check"></i> Copiado';
      setTimeout(() => {
        button.innerHTML = original;
      }, 1800);
    } catch (error) {
      console.error('No se pudo copiar:', error);
    }
  });
});

const groqPanel = document.querySelector('[data-groq-ticket-id]');
if (groqPanel) {
  const ticketId = groqPanel.dataset.groqTicketId;
  const generateButton = document.getElementById('groqGenerateBtn');
  const focusInput = document.getElementById('groqFocus');
  const resultOutput = document.getElementById('groqResult');
  const statusLabel = document.getElementById('groqStatus');

  generateButton?.addEventListener('click', async () => {
    const original = generateButton.innerHTML;
    generateButton.disabled = true;
    generateButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Consultando';
    statusLabel.textContent = 'Estado: consultando Groq beta...';

    try {
      const response = await fetch(`/api/tickets/${ticketId}/groq-solution`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          focus: focusInput?.value || ''
        })
      });

      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'No se pudo generar la propuesta');
      }

      resultOutput.value = payload.content || '';
      statusLabel.textContent = `Estado: respuesta generada con ${payload.model || 'modelo beta'}`;
    } catch (error) {
      console.error(error);
      statusLabel.textContent = `Estado: error - ${error.message}`;
      resultOutput.value = 'No se pudo generar la propuesta con Groq beta.\n\nTip: revisa que las keys sigan vigentes y que el modelo configurado este habilitado.';
    } finally {
      generateButton.disabled = false;
      generateButton.innerHTML = original;
    }
  });
}

console.log('TicketSystem v1.0 ready');
