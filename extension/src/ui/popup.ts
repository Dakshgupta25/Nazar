document.addEventListener('DOMContentLoaded', () => {
  const controls = document.querySelectorAll('.control-item');

  controls.forEach(control => {
    control.addEventListener('click', () => {
      // Remove active class from all
      controls.forEach(c => c.classList.remove('active'));
      
      // Add active class to clicked
      control.classList.add('active');
      
      const mode = control.getAttribute('data-mode');
      console.log(`[Nazar UI] Privacy mode switched to: ${mode}`);
      
      // TODO: Dispatch message to background script / content script to toggle the Live Privacy Shield
    });
  });
});
