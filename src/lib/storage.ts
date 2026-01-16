import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

const STORAGE_ROOT = '/storage';
// Base URL for serving files - change this if your domain changes
export const FILE_BASE_URL = process.env.FILE_BASE_URL || 'https://admin.atap.solar';

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

    const localPath = path.join(targetDir, filename);

    // @ts-ignore - node fetch body is a ReadableStream which pipeline handles
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(localPath));

    // Return the ABSOLUTE URL for database storage
    // Format: https://admin.atap.solar/api/files/seda/ic_copies/filename.jpg
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
