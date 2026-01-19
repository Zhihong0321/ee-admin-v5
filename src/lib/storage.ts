import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

const STORAGE_ROOT = '/storage';
// Base URL for serving files - change this if your domain changes
export const FILE_BASE_URL = process.env.FILE_BASE_URL || 'https://admin.atap.solar';

/**
 * Sanitize filename to handle non-ASCII characters (like Chinese)
 * Converts non-ASCII characters to URL-encoded format for filesystem compatibility
 */
function sanitizeFilename(filename: string): string {
  // Extract extension
  const ext = path.extname(filename).split('?')[0];
  const baseName = path.basename(filename, ext).split('?')[0];

  // Keep ASCII characters, spaces, and common punctuation as-is
  // URL-encode other characters (like Chinese) for filesystem compatibility
  let sanitizedBaseName = '';
  for (let i = 0; i < baseName.length; i++) {
    const char = baseName[i];
    const code = char.charCodeAt(0);

    // Allow: a-z, A-Z, 0-9, space, hyphen, underscore, dot
    if (
      (code >= 48 && code <= 57) ||  // 0-9
      (code >= 65 && code <= 90) ||  // A-Z
      (code >= 97 && code <= 122) || // a-z
      code === 32 || code === 45 || code === 46 || code === 95  // space, -, ., _
    ) {
      sanitizedBaseName += char;
    } else {
      // URL-encode non-ASCII characters
      sanitizedBaseName += encodeURIComponent(char);
    }
  }

  return sanitizedBaseName + ext;
}

/**
 * Downloads a file from a URL and saves it to the attached storage.
 * Returns the ABSOLUTE URL where the file can be accessed.
 */
export async function downloadBubbleFile(url: string, subfolder: string, filename: string): Promise<string | null> {
  if (!url) return null;

  // Handle Bubble's protocol-relative URLs
  const fullUrl = url.startsWith('//') ? `https:${url}` : url;

  try {
    const response = await fetch(fullUrl);
    if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`);
    if (!response.body) throw new Error('Response body is empty');

    // Ensure directory exists
    const targetDir = path.join(STORAGE_ROOT, subfolder);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Sanitize filename to handle non-ASCII characters (Chinese, etc.)
    const sanitizedFilename = sanitizeFilename(filename);
    const localPath = path.join(targetDir, sanitizedFilename);

    // @ts-ignore - node fetch body is a ReadableStream which pipeline handles
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(localPath));

    // Return the ABSOLUTE URL for database storage
    // Use the sanitized filename in the URL for consistency
    const relativePath = localPath.replace(STORAGE_ROOT, '');
    return `${FILE_BASE_URL}/api/files${relativePath}`;
  } catch (error) {
    console.error(`Error downloading file ${fullUrl}:`, error);
    return null;
  }
}

/**
 * Health check for storage
 */
export async function checkStorageHealth() {
  try {
    if (!fs.existsSync(STORAGE_ROOT)) {
      return { status: 'error', message: `Root ${STORAGE_ROOT} not found` };
    }
    
    const testFile = path.join(STORAGE_ROOT, 'health-check.txt');
    fs.writeFileSync(testFile, `Health check at ${new Date().toISOString()}`);
    fs.unlinkSync(testFile);
    
    return { status: 'healthy', message: 'Storage is writable' };
  } catch (error) {
    return { status: 'error', message: String(error) };
  }
}
