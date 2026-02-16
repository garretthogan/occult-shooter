/**
 * Shared helpers for reading/writing floor-plan SVG metadata payloads.
 */

export function decodeSvgMetadata(svgElement) {
  const metadataNode = svgElement.querySelector('#occult-floorplan-meta');
  if (metadataNode == null) return null;
  const encoded = metadataNode.textContent?.trim();
  if (encoded == null || encoded.length === 0) return null;
  try {
    const json = decodeURIComponent(atob(encoded));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function encodeSvgMetadata(metadata) {
  return btoa(encodeURIComponent(JSON.stringify(metadata)));
}
