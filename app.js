document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  cargarRutinas();
  actualizarSelectRutinas();
});

document.addEventListener("DOMContentLoaded", () => {
  // Ocultar splash después de 1 segundo
  setTimeout(() => {
    document.getElementById("splash").classList.add("oculto");
  }, 1000);

  // Lo que ya tenías
  initTheme();
  cargarRutinas();
  actualizarSelectRutinas();
});
