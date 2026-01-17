// utils/fileHelper.js

/**
 * Converts a base64 data URL string (e.g., "data:application/pdf;base64,...")
 * into a Buffer suitable for inserting into a LONGBLOB column.
 * 
 * @param {string|null} dataURL - The base64 string from frontend
 * @returns {Buffer|null} - Buffer to store in MySQL LONGBLOB
 */
export function base64ToBuffer(dataURL) {
  if (!dataURL) return null;

  const matches = dataURL.match(/^data:.+;base64,(.+)$/);
  if (!matches) return null;

  return Buffer.from(matches[1], "base64");
}
