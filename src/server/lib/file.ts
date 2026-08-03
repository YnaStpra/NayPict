// This module provides tools and methods related to file name processing。

// Split filename and extension，It is convenient to append a timestamp before the extension when the name is repeated.。
function splitFileName(name: string) {
  const index = name.lastIndexOf('.');

  if (index <= 0) {
    return {
      baseName: name,
      extName: ''
    };
  }

  return {
    baseName: name.slice(0, index),
    extName: name.slice(index)
  };
}

// Formatted as a timestamp for file name conflicts：year month day_hours minutes seconds_millisecond。
function formatFileTimestamp(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');
  const millisecond = String(date.getMilliseconds()).padStart(3, '0');

  return `${year}${month}${day}_${hour}${minute}${second}_${millisecond}`;
}

// Generate based on original file name Content-Disposition。
function buildContentDisposition(name: string) {
  const encodedName = encodeURIComponent(name)
    .replace(/[!'()*]/g, (char) =>
      `%${char.charCodeAt(0).toString(16).toUpperCase()}`
    );
  return `inline; filename*=UTF-8''${encodedName}`;
}

export { buildContentDisposition, formatFileTimestamp, splitFileName };
