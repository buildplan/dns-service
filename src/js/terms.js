const dateEl = document.getElementById('date');
if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString();
}
