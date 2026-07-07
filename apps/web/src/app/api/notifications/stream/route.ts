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
	let timeoutId: ReturnType<typeof setTimeout> | null = null;

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
			if (!alive) {
				return;
			}

			let lastCount = count;

			const poll = async () => {
				if (!alive) {
					return;
				}

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
					alive = false;
					return;
				}

				if (!alive) {
					return;
				}

				timeoutId = setTimeout(() => {
					void poll();
				}, 4000);
			};

			timeoutId = setTimeout(() => {
				void poll();
			}, 4000);
		},
		cancel() {
			alive = false;
			if (timeoutId) {
				clearTimeout(timeoutId);
				timeoutId = null;
			}
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
