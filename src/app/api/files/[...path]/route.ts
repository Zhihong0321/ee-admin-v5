import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const STORAGE_ROOT = '/storage';

/**
 * Try to find a file by trying different path encoding strategies.
 * This handles files with non-ASCII characters (like Chinese) that may have
 * encoding mismatches between the URL and the filesystem.
 */
function findFileWithEncodingFallback(pathSegments: string[]): string | null {
  // Strategy 1: Try the path as-is (Next.js decodes it automatically)
  const normalPath = path.join(STORAGE_ROOT, ...pathSegments);
  if (fs.existsSync(normalPath)) {
    return normalPath;
  }

  // Strategy 2: Try with each path segment URI-encoded
  // This handles cases where the file on disk has URL-encoded characters
  const encodedSegments = pathSegments.map(segment => {
    try {
      // Encode the segment, but preserve already encoded parts
      return encodeURIComponent(segment);
    } catch {
      return segment;
    }
  });
  const encodedPath = path.join(STORAGE_ROOT, ...encodedSegments);
  if (fs.existsSync(encodedPath)) {
    return encodedPath;
  }

  // Strategy 3: Try listing the directory and finding a case-insensitive match
  // This helps with case sensitivity issues on Linux
  if (pathSegments.length > 0) {
    const parentDir = path.join(STORAGE_ROOT, ...pathSegments.slice(0, -1));
    const targetName = pathSegments[pathSegments.length - 1];

    if (fs.existsSync(parentDir)) {
      try {
        const files = fs.readdirSync(parentDir);
        // Try exact match (case-insensitive)
        const matchedFile = files.find(f => {
          try {
            return decodeURIComponent(f) === targetName || f === targetName;
          } catch {
            return f === targetName;
          }
        });

        if (matchedFile) {
          return path.join(parentDir, matchedFile);
        }
      } catch {
        // readdir failed, continue to next strategy
      }
    }
  }

  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathSegments } = await params;

  // Try to find the file with encoding fallback
  const filePath = findFileWithEncodingFallback(pathSegments);

  if (!filePath) {
    return new NextResponse('File not found', { status: 404 });
  }

  // Security: Ensure the path is within the storage root
  if (!filePath.startsWith(STORAGE_ROOT)) {
    return new NextResponse('Unauthorized', { status: 403 });
  }

  const fileBuffer = fs.readFileSync(filePath);
  const extension = path.extname(filePath).toLowerCase();

  const contentTypes: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.pdf': 'application/pdf',
  };

  return new NextResponse(fileBuffer, {
    headers: {
      'Content-Type': contentTypes[extension] || 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
