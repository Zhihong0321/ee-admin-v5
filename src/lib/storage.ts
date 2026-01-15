import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

const STORAGE_ROOT = '/storage';

/**
 * Downloads a file from a URL and saves it to the attached storage.
 * Returns the local path where the file was saved.
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

    // Return the path relative to the app or absolute as requested
    return localPath;
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
