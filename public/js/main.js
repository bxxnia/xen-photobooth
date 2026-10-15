// main.js - handles general interactions and event listeners for the website.
document.addEventListener('DOMContentLoaded', () => {
  const buttons = document.querySelectorAll('[data-action]');

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.getAttribute('data-action');
      console.log(`Action triggered: ${action}`);
    });
  });
});
