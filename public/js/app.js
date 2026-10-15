// app.js - handles the capture button interaction on the photobooth page.
document.addEventListener('DOMContentLoaded', () => {
  const button = document.getElementById('capture-btn');

  if (!button) return;

  button.addEventListener('click', () => {
    button.textContent = 'Captured!';
    button.disabled = true;

    setTimeout(() => {
      button.textContent = 'Capture Photo';
      button.disabled = false;
    }, 1200);
  });
});
