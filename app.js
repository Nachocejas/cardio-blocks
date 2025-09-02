document.addEventListener("DOMContentLoaded", () => {
  // Ocultar splash después de 1 segundo
  setTimeout(() => {
    document.getElementById("splash").classList.add("oculto");
  }, 1000);
  initTheme();
  cargarRutinas();
  actualizarSelectRutinas();
});



