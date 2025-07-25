export const formatBytes = (bytes: number, decimals = 2) => {
  // Cas spécial: valeur négative (-1) indique une taille approximative (> 5Go)
  if (bytes === -1) {
    return '> 5 Go';
  }
  
  // Si le backend a fourni un display_size, l'utiliser directement
  if (typeof bytes === 'object' && (bytes as any).display_size) {
    return (bytes as any).display_size;
  }
  
  if (!+bytes) return '0 KB';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

export const formatBytesToInt = (bytes: number, decimals = 2) => {
  if (!+bytes) return '0 KB';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseInt((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};
