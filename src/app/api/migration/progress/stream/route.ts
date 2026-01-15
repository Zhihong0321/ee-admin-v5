import { getProgress } from "@/lib/progress-tracker";
import { NextRequest } from "next/server";

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/migration/progress/stream?sessionId=xxx
 * Server-Sent Events (SSE) stream for real-time migration progress
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId');

  if (!sessionId) {
    return new Response('sessionId is required', { status: 400 });
  }

  const progress = getProgress(sessionId);

  if (!progress) {
    return new Response('Session not found', { status: 404 });
  }

  // Create SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let completed = false;
      let lastStatus = '';
      let lastData = '';

      const sendEvent = (data: any) => {
        const jsonData = JSON.stringify(data);
        if (jsonData !== lastData) {
          controller.enqueue(encoder.encode(`data: ${jsonData}\n\n`));
          lastData = jsonData;
        }
      };

      // Send initial state
      sendEvent({
        type: 'initial',
        progress
      });

      // Poll for updates
      const interval = setInterval(() => {
        const currentProgress = getProgress(sessionId);

        if (!currentProgress) {
          clearInterval(interval);
          sendEvent({ type: 'error', message: 'Session lost' });
          controller.close();
          return;
        }

        // Send update if something changed
        if (
          currentProgress.status !== lastStatus ||
          currentProgress.completedFiles !== progress.completedFiles ||
          currentProgress.currentFile !== progress.currentFile
        ) {
          sendEvent({
            type: 'progress',
            progress: currentProgress
          });

          lastStatus = currentProgress.status;
          Object.assign(progress, currentProgress);
        }

        // Stop if completed or error
        if (currentProgress.status === 'completed' || currentProgress.status === 'error') {
          clearInterval(interval);

          // Send final state
          sendEvent({
            type: currentProgress.status,
            progress: currentProgress
          });

          // Wait a bit then close
          setTimeout(() => {
            controller.close();
          }, 1000);
          completed = true;
        }
      }, 500); // Update every 500ms

      // Cleanup on connection close
      request.signal.addEventListener('abort', () => {
        if (!completed) {
          clearInterval(interval);
          controller.close();
        }
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    }
  });
}
