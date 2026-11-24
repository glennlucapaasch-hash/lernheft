// Bilder für Karteikarten: verkleinert und als JPEG-Daten gespeichert (wandert mit Sicherung und Teilen mit).
export async function bildAlsDaten(datei, maxKante = 640) {
  const quelle = await createImageBitmap(datei, { imageOrientation: 'from-image' }).catch(() => new Promise((ok, nein) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => nein(new Error('Dieses Bild kann ich nicht öffnen.'));
    img.src = URL.createObjectURL(datei);
  }));
  const f = Math.min(1, maxKante / Math.max(quelle.width, quelle.height));
  const c = document.createElement('canvas');
  c.width = Math.round(quelle.width * f);
  c.height = Math.round(quelle.height * f);
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(quelle, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.8);
}
