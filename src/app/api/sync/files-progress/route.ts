import { NextRequest } from 'next/server';
import { getProgress } from '@/lib/progress-tracker';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('sessionId');

  if (!sessionId) {
    return new Response('Missing sessionId', { status: 400 });
  }

  const encoder = new TextEncoder();

  // Create a ReadableStream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: any) => {
        const message = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      // Send initial progress
      const initialProgress = getProgress(sessionId);
      if (initialProgress) {
        sendEvent({ type: 'progress', ...initialProgress });
      }

      // Poll for updates every 500ms
      const interval = setInterval(() => {
        const progress = getProgress(sessionId);

        if (!progress) {
          sendEvent({ type: 'error', message: 'Session not found' });
          clearInterval(interval);
          controller.close();
          return;
        }

        sendEvent({ type: 'progress', ...progress });

        // Stop if completed or error
        if (progress.status === 'completed' || progress.status === 'error') {
          clearInterval(interval);
          setTimeout(() => controller.close(), 2000); // Keep connection open for 2 more seconds
        }
      }, 500);

      // Clean up on disconnect
      request.signal.addEventListener('abort', () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
