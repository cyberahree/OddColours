(() => {
  "use strict";

  const stats = document.getElementById("stats");
  const hashSpan = stats.querySelector("#hash");
  const modulesSpan = stats.querySelector("#modules");

  const upload = document.getElementById("upload");
  const canvas = document.querySelector("canvas");
  const exportButton = document.getElementById("export");


  if (!upload || !canvas) return;
  if (!window.OddColoursEffects?.renderFileArt) {
    console.error("global function OddColoursEffects.renderFileArt is not available");
    return;
  }

  let lastExport = null;

  function downloadExport() {
    if (!lastExport) return;

    const downloadAnchor = document.createElement("a");
    const safeName = (lastExport.file.name || "file").replace(/[^\w.-]+/g, "_");
    downloadAnchor.download = `${safeName}.odd.png`;
    downloadAnchor.href = lastExport.dataURL();
    downloadAnchor.click();
  }

  async function generate(file) {
    const result = await window.OddColoursEffects.renderFileArt(canvas, file, {
      size: 1024,
      moduleCount: 5,
      caption: "",
    });

    lastExport = {
      file,
      dataURL: result.toDataURL,
      picked: result.picked,
      hashHex: result.hashHex,
    };

    hashSpan.textContent = `#${result.hashHex}`;
    modulesSpan.textContent = `rendered modules: ${result.picked.length} (${result.picked.join(", ")})`.toUpperCase();
  }

  upload.addEventListener("change", () => {
    const selectedFile = upload.files?.[0];
    if (selectedFile) generate(selectedFile);
  });

  exportButton.addEventListener("click", downloadExport);
})();
