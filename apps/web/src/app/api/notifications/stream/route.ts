import { getServerUser } from "@/core/db";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
	const { user } = await getServerUser();
	if (!user) {
		return new Response("Unauthorized", { status: 401 });
	}

	const userId = user.id;
	const encoder = new TextEncoder();
	let alive = true;

	const stream = new ReadableStream({
		async start(controller) {
			const send = (data: unknown) => {
				try {
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
				} catch {
					alive = false;
				}
			};

			// Initial unread count
			const count = await prisma.notification.count({ where: { userId, read: false } });
			send({ type: "init", unreadCount: count });

			let lastCount = count;

			while (alive) {
				await new Promise((r) => setTimeout(r, 4000));
				try {
					const newCount = await prisma.notification.count({
						where: { userId, read: false },
					});
					if (newCount !== lastCount) {
						lastCount = newCount;
						send({ type: "update", unreadCount: newCount });
					} else {
						controller.enqueue(encoder.encode(": heartbeat\n\n"));
					}
				} catch {
					break;
				}
			}
		},
		cancel() {
			alive = false;
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
			"X-Accel-Buffering": "no",
		},
	});
}
